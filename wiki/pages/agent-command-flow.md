---
title: Agent Command Flow (adapter + executor)
slug: agent-command-flow
type: how-to
status: stable
sources: [raw/0003-design-decisions-2026-06-18.md, raw/0001-molstar-research.md]
updated: 2026-06-18
links: [command-schema, molstar-api, headless-react, project-overview]
---

# Agent Command Flow (adapter + executor)

> How an LLM tool-call becomes a Mol\* action in van-der-view, and where the
> provider-specific code lives. Design locked 2026-06-18 (src: raw/0003).

## Key facts

- The library is **two halves decoupled by `Command { name, input }`**: an
  *agent-side* part (schema + provider adapters) and a *browser-side* part
  (mount + executor) (src: raw/0003).
- **The executor is provider-agnostic** — it only accepts a normalized `Command`
  and drives Mol\*. It does not know Anthropic vs OpenAI (src: raw/0003).
- **Adapters are per-provider-FAMILY, not per-model** and are thin (src: raw/0003).
- The library does **not** own the LLM call — the developer's app does. The seam
  is the developer handing each tool_call to our executor (src: raw/0003).

## The data flow

```
user ── chat ──▶ developer's agent (calls the LLM with vdv.tools.anthropic)
                       │  LLM emits a structured tool_call
                       ▼
        ┌──────── van-der-view ────────┐
 agent  │ adapter.toCommand(toolCall)  │  → Command { name, input }   (normalized)
 side   └──────────────┬───────────────┘
                       ▼
 browser  ┌──── executor (provider-agnostic) ────┐
 side     │ handlers[name](input, ctx) → Mol*     │
          └──────────────┬───────────────────────┘
                         ▼  CommandResult → fed back as tool_result
                    Mol* canvas (developer's UI around it)
```

## The two adapter directions

Each provider adapter is a pure shim with two methods (src: raw/0003):

```ts
interface ProviderAdapter {
  toTools(commands: CommandSpec[]): unknown;   // OUTBOUND: vdv.commands → provider tool schema
  toCommand(toolCall: unknown): Command;        // INBOUND:  provider tool_call → { name, input }
}
```

- **Outbound** — `vdv.tools.anthropic` = `adapter.anthropic.toTools(vdv.commands)`
  → `[{ name, description, input_schema }]` (verified Anthropic shape, src: raw/0003).
- **Inbound** — normalizes the provider's tool_call object into a `Command`.
  Anthropic: `{ type:'tool_use', id, name, input }` → `input` is already an object.
  ⚠️ OpenAI/Codex: `{ function:{ name, arguments:'<JSON string>' } }` → `arguments`
  must be `JSON.parse`d; that quirk lives in the OpenAI adapter (src: raw/0003).

**v1 = Anthropic adapter only.** OpenAI/Codex is a reserved placeholder
(`notImplemented('openai')` that throws clearly). Filling it in touches neither the
executor nor the command specs (src: raw/0003).

## The executor

A table of `command name → handler → concrete Mol\* call` (all real APIs in
[[molstar-api]]):

```ts
const handlers = {
  'load-structure': (input, ctx) => /* builders.data.download + parseTrajectory + preset */,
  highlight:        (input, ctx) => ctx.plugin.managers.interactivity.lociHighlights.highlightOnly({ loci: resolveSelection(input.selection, ctx) }),
  focus:            (input, ctx) => ctx.plugin.managers.camera.focusLoci(resolveSelection(input.selection, ctx), { durationMs: input.durationMs }),
  'get-scene-context': (_input, ctx) => ({ ok: true, data: ctx.getSceneContext() }),
  'reset-camera':   (_input, ctx) => ctx.plugin.managers.camera.reset(),
};
```
`resolveSelection` turns our `Selection` ([[command-schema]]) into a MolScript loci.
Handlers return a `CommandResult`; failures (bad selection, unloaded structure)
return `{ ok:false, error }` so the agent self-corrects.

## The integration seam (verified Anthropic shapes)

```ts
const viewer = useMolView();
const res = await anthropic.messages.create({
  model: 'claude-opus-4-8', max_tokens: 16000, tools: vdv.tools.anthropic, messages,
});
const toolResults = [];
for (const block of res.content) {
  if (block.type !== 'tool_use') continue;            // { type:'tool_use', id:'toolu_…', name, input }
  const result = await viewer.dispatch(adapters.anthropic.toCommand(block));
  toolResults.push({ type:'tool_result', tool_use_id: block.id, content: JSON.stringify(result), is_error: !result.ok });
}
// next turn: push { role:'assistant', content: res.content } and { role:'user', content: toolResults }
```
(`dispatch` may also accept the raw block as a convenience overload, but
conceptually the adapter normalizes first — the executor stays provider-blind.)

## See also
- [[command-schema]] — the command catalog and `Selection` type
- [[molstar-api]] — the real Mol\* calls handlers invoke
- [[headless-react]] — how `useMolView()` / `<MolViewProvider>` mount the plugin
- [[project-overview]] — the boundary this realizes

## Open questions
- `dispatch(Command)` only, vs a convenience overload accepting the raw provider block.
- How the developer ergonomically loops tool_calls — manual loop vs a `vdv` helper.
- Testing the executor/adapters in isolation — see [[testing-strategy]].
