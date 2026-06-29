import type { Command, CommandSpec, OpenAITool, OpenAIToolCall } from '../types';
import { isPlainObject } from '../util';
import { AdapterError } from './anthropic';

/**
 * OpenAI-compatible adapter — also serves DeepSeek (its API is OpenAI-compatible).
 *
 * Mirrors the Anthropic adapter but for the OpenAI function-calling wire format:
 * - OUTBOUND tools are `{ type:'function', function:{ name, description, parameters } }`.
 * - INBOUND tool calls carry their arguments as a JSON *string* in
 *   `function.arguments`, which `toCommand` must `JSON.parse`.
 */

/** OUTBOUND: canonical command specs → OpenAI-compatible tool definitions. */
export function toTools(commands: readonly CommandSpec[]): OpenAITool[] {
  const seen = new Set<string>();
  for (const c of commands) {
    if (seen.has(c.name)) {
      throw new AdapterError(`Duplicate command name "${c.name}" in toTools().`);
    }
    seen.add(c.name);
  }
  return commands.map((c) => ({
    type: 'function',
    function: {
      name: c.name,
      description: c.description,
      parameters: c.inputSchema,
    },
  }));
}

/** INBOUND: an OpenAI-compatible tool_call → a normalized Command. */
export function toCommand(toolCall: unknown): Command {
  if (
    typeof toolCall !== 'object' ||
    toolCall === null ||
    (toolCall as { type?: unknown }).type !== 'function'
  ) {
    throw new AdapterError('Expected an OpenAI tool_call with type "function".');
  }
  const call = toolCall as Partial<OpenAIToolCall>;
  const fn = call.function;
  if (!isPlainObject(fn)) {
    throw new AdapterError('tool_call is missing a "function" object.');
  }
  if (typeof fn.name !== 'string' || fn.name.length === 0) {
    throw new AdapterError('tool_call function is missing a string "name".');
  }
  // `arguments` is a JSON string in the OpenAI/DeepSeek wire format. An absent or
  // empty string means "no arguments" → {} (e.g. reset-camera, get-scene-context).
  if (fn.arguments !== undefined && typeof fn.arguments !== 'string') {
    throw new AdapterError(`tool_call "${fn.name}" has a non-string "arguments".`);
  }
  const raw = fn.arguments === undefined || fn.arguments.trim() === '' ? '{}' : fn.arguments;
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    throw new AdapterError(`tool_call "${fn.name}" has invalid JSON in "arguments".`);
  }
  if (!isPlainObject(input)) {
    throw new AdapterError(`tool_call "${fn.name}" arguments did not parse to an object.`);
  }
  // No structuredClone needed: JSON.parse already returns a fresh, caller-owned object.
  return { name: fn.name, input };
}
