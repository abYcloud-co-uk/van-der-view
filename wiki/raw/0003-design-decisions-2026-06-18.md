---
source_id: 0003
title: van-der-view architecture/API design decisions (brainstorming session)
origin: "dev session 2026-06-18 — brainstorming with user (jyc)"
fetched: 2026-06-18
type: user-note
supersedes: null
---

# Design decisions — 2026-06-18 brainstorming session

Dev-born knowledge: decisions made collaboratively while scoping van-der-view.
No external document — the source is this session. Captured to graduate the
`command-schema` and `project-overview` pages and seed `agent-command-flow` and
`testing-strategy`.

## Scope / positioning (decided)
- **Open-source, headless React developer library.** `pnpm install`, drops into
  any React app that has an agent chatbot. Audience = third-party developers.
  (The parent `aws_protein_project` is explicitly out of scope for this library.)
- **Boundary = "library + agent glue".** Ships: the renderer mount/control, the
  JSON command schema, ready-made LLM tool definitions, and the executor that
  applies commands to Mol*. Does **not** ship a chat UI — that's the developer's.
- Frameworks: Next.js, Vite, TanStack, Remix. Browser/WebGL-only ⇒ client-only.

## Mechanism (decided)
- The agent drives via **structured tool-calling** (the developer registers our
  commands as the LLM's tools; the LLM emits a structured tool_call). NOT
  text-sniffing the chat reply. Text-embedded JSON is at most a future fallback.
- The agent targets **our command schema**, never the raw Mol* API (raw API is
  too large/unstable/hallucination-prone).
- The library does **not** own the LLM call. The developer's app calls the LLM,
  gets tool_calls, and hands each to our executor (the integration seam).

## Architecture (decided)
- Two halves decoupled by the `Command { name, input }` JSON:
  - *agent-side* (env-neutral): `vdv.commands` (canonical specs) + per-provider
    **adapters** (format shuffling, both directions).
  - *browser-side*: `<MolViewProvider>` / `useMolView()` mount + the **executor**.
- **The executor is provider-agnostic** — it only accepts a normalized
  `Command { name, input }` and drives Mol*. It does not know Anthropic vs OpenAI.
- **Adapters are per-provider-FAMILY, not per-model** (Claude Opus/Sonnet/Haiku
  share the Anthropic `tool_use` shape; GPT/Codex share OpenAI function-calling).
  Each adapter is a thin pure shim: `toTools(specs)` (outbound) + `toCommand(call)`
  (inbound normalize). ~tens of lines.
- **v1 ships the Anthropic adapter only**; an OpenAI/Codex adapter is a reserved
  placeholder (`notImplemented('openai')` that throws clearly, not silently). The
  shared core + executor work unchanged when the placeholder is filled in.
- `dispatch` accepts only a normalized `Command`; the raw Anthropic `tool_use`
  block is normalized by `adapters.anthropic.toCommand(block)` first.

## Command → Mol* mapping (hybrid layer, decided)
- Live `highlight` / `focus` → imperative Mol* managers (incremental, real-time).
- Whole-scene `load-scene` → MolViewSpec (`loadMVS`). [v1.1]
- `toggle-xr` → `canvas3d.xr` (not MVS-expressible; needs user-gesture affordance). [v1.1]

## Public API shape (decided)
```
vdv.commands / vdv.tools.anthropic / vdv.toolsFor([...])
<MolViewProvider> · <MolViewCanvas> · useMolView() · createMolView()
viewer.dispatch(Command) → CommandResult           // feed back as tool_result
viewer.getSceneContext()  + a get-scene-context read tool   // the "up" channel
viewer.plugin (raw Mol* escape hatch) · viewer.on(evt, cb)
MolViewConfig { commands?, resolveStructure?, defaults?, xr?, pluginSpec? }
```
- `CommandResult = { ok:true, data? } | { ok:false, error:{ code, message } }` —
  fed back as a `tool_result` (with `is_error` on failure) so the agent self-corrects.
- Mount API: `<MolViewProvider>` + `useMolView()` primary; `createMolView()` is the
  imperative/non-React escape hatch.
- `Selection` type modeled on MVS `ComponentExpression`; **explicit `auth` vs
  `label` numbering** (mixing them silently selects the wrong residues).

## Anthropic tool-use shapes (verified via claude-api skill, 2026-06-18)
- Tool def: `{ name, description, input_schema: { type:'object', properties, required } }`
  (optional `strict:true`).
- Response tool call: `{ type:'tool_use', id:'toolu_…', name, input }` (`input` is a
  parsed object).
- Return result: in a `user` message, `{ type:'tool_result', tool_use_id, content,
  is_error? }`.
- `tool_choice`: auto | any | tool | none.
- Default model id for examples: `claude-opus-4-8`.
- ⚠️ OpenAI differs: tool call is `{ function:{ name, arguments:'<JSON string>' } }`
  — `arguments` is a JSON **string** needing `JSON.parse`; the OpenAI adapter must
  handle this. (Anthropic `input` is already an object.)

## v1 command catalog (decided)
- **v1:** `load-structure`, `highlight`, `focus`, `get-scene-context` (read tool),
  `reset-camera`.
- **v1.1:** `color`, `set-representation`, `load-scene` (MVS), `toggle-xr`.
- `get-scene-context` is **in v1** and is exposed as a **read tool** the agent can
  call (not just system-prompt metadata) — it's the essential "up" channel so the
  agent doesn't guess selectors.

## Testing (NOT yet designed — open thread)
- Deliberately deferred to its own focused discussion. Seeded as a `stub` page.
- Known shape: executor (provider-agnostic, takes `Command`) and adapters (pure
  `toTools`/`toCommand`) are cleanly unit-testable with mocks/fixtures; the hard
  parts are `Selection → MolScript → loci` and full-loop integration (Mol* is
  WebGL/browser-only). Potential asset: Mol*'s `HeadlessPluginContext`
  (`headless-gl`, see raw/0001) for Node-side rendering in CI. Decisions pending.
