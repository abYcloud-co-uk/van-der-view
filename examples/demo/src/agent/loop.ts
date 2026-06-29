import { adapters, tools } from '@abycloud-co-uk/van-der-view';
import type { Command, CommandResult } from '@abycloud-co-uk/van-der-view';
import type { MolView } from '@abycloud-co-uk/van-der-view/browser';

/**
 * The conversational agent loop. It owns NO Mol* knowledge — it just runs the
 * OpenAI/DeepSeek tool-calling loop and routes each tool call through
 * `adapters.openai.toCommand` → `view.dispatch`, feeding the result back as a
 * `tool` message so the model can self-correct. Identical to the documented
 * agent-command-flow, only with DeepSeek instead of Claude.
 */

export const SYSTEM_PROMPT = `You control a 3D molecular viewer (Mol*) through the provided tools. \
You cannot see the screen; you act only by calling tools, and you read the scene only via get-scene-context.

Guidance:
- Call get-scene-context BEFORE guessing chain ids or residue numbers — never invent selectors.
- A selection is { chain?, residues?, numbering?, preset? }. residues is a list of integers or [start,end] ranges. \
Be explicit about numbering: "auth" = PDB author numbering (what papers cite), "label" = entity numbering. Mixing them silently selects the wrong residues.
- To load a structure use load-structure (source "pdb" + a 4-char id like "1CRN", or source "inline" + data).
- Typical flow: load-structure → get-scene-context → then highlight / focus / set-representation / set-color / toggle-visibility / measure-distance / add-label.
- measure-distance returns the distance in ångströms in its result data — read it and tell the user the number.
- Keep replies short. After the tools succeed, briefly say what you did. If a tool returns an error, read the error code and try a corrected call.`;

/** One OpenAI/DeepSeek tool_call as it appears on an assistant message. */
interface ToolCallWire {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/** An OpenAI/DeepSeek chat message (the wire format the proxy forwards verbatim). */
export interface WireMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCallWire[];
  tool_call_id?: string;
}

/** A transcript event surfaced to the UI as the turn runs. */
export type AgentEvent =
  | { kind: 'assistant'; text: string }
  | { kind: 'tool'; command: Command; result: CommandResult }
  | { kind: 'error'; message: string };

/** Safety cap on tool-calling rounds within a single user turn. */
const MAX_STEPS = 8;

/**
 * Conservative cap on how much prior conversation we resend per request. Tool
 * results (esp. get-scene-context) are stored verbatim and re-uploaded on every
 * chat() call and every later turn, so without a cap a long session grows
 * unbounded until the model's context window overruns. ~48k chars leaves ample
 * headroom under DeepSeek's window.
 */
const HISTORY_BUDGET_CHARS = 48_000;

/**
 * Trim the oldest history to stay under the budget WITHOUT ever splitting an
 * assistant `tool_calls` message from its `tool` replies: drop whole
 * user-delimited rounds, always keeping the system message (index 0) and the
 * most recent round intact.
 */
function prunedHistory(messages: WireMessage[]): WireMessage[] {
  const size = (msgs: WireMessage[]): number => JSON.stringify(msgs).length;
  if (messages.length === 0 || size(messages) <= HISTORY_BUDGET_CHARS) return messages;
  const [system, ...rest] = messages;
  // Index in `rest` where each round begins (a user message starts a new round).
  const roundStarts = rest.flatMap((m, i) => (m.role === 'user' ? [i] : []));
  // Drop oldest rounds until under budget or only the most recent round remains.
  for (let r = 0; r < roundStarts.length - 1; r++) {
    const kept = [system, ...rest.slice(roundStarts[r + 1])];
    if (size(kept) <= HISTORY_BUDGET_CHARS) return kept;
  }
  // Even system + the last round alone exceeds the budget — keep them anyway; a
  // valid sequence beats a truncated one, and the model (not us) handles overflow.
  const lastStart = roundStarts.length > 0 ? roundStarts[roundStarts.length - 1] : 0;
  return [system, ...rest.slice(lastStart)];
}

async function chat(messages: WireMessage[]): Promise<WireMessage> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages, tools: tools.openai, tool_choice: 'auto' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message ?? data?.error ?? `chat request failed (${res.status})`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  const message = data?.choices?.[0]?.message;
  if (!message) throw new Error('the model returned no message');
  return message as WireMessage;
}

/**
 * Run one user turn to completion. `history` is the running message list (it must
 * start with the system message); the returned list is the new history to keep for
 * the next turn. `onEvent` streams assistant text and tool results to the UI.
 */
export async function runAgentTurn(
  view: MolView,
  history: WireMessage[],
  userText: string,
  onEvent: (event: AgentEvent) => void,
): Promise<WireMessage[]> {
  let messages: WireMessage[] = [...history, { role: 'user', content: userText }];

  for (let step = 0; step < MAX_STEPS; step++) {
    messages = prunedHistory(messages);
    let assistant: WireMessage;
    try {
      assistant = await chat(messages);
    } catch (e) {
      // A failed request mid-turn must NOT lose the turn: return the messages
      // accumulated so far (the user message + any completed tool exchanges, always
      // a valid sequence here) so the caller persists them and the model's history
      // stays consistent with what the UI already showed.
      onEvent({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      return messages;
    }
    messages.push(assistant);
    if (assistant.content) onEvent({ kind: 'assistant', text: assistant.content });

    const calls = assistant.tool_calls ?? [];
    if (calls.length === 0) return messages;

    for (const call of calls) {
      let command: Command;
      let result: CommandResult;
      try {
        command = adapters.openai.toCommand(call);
        result = await view.dispatch(command);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        command = { name: call.function?.name ?? 'unknown', input: undefined };
        result = { ok: false, error: { code: 'adapter_error', message } };
      }
      onEvent({ kind: 'tool', command, result });
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  onEvent({ kind: 'error', message: `stopped after ${MAX_STEPS} tool-calling rounds.` });
  return messages;
}
