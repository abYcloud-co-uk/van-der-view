---
source_id: 0008
title: Plan 2 — browser-side executor core implemented & merged
origin: "dev session 2026-06-18 (PR #8); plan docs/superpowers/plans/2026-06-18-browser-executor-core.md"
fetched: 2026-06-18
type: user-note
supersedes: null
---

# Plan 2 — Browser-side executor core (implemented, merged PR #8, 2026-06-18)

Dev-born knowledge: the browser-side **executor core** was implemented subagent-driven
and merged to `main` (PR #8). Pure TypeScript, unit-tested in **pure Node** (no React,
no WebGL/three). 73 tests; `pnpm test` / `pnpm typecheck` green.

## What landed (`src/`)
- `errors.ts` — `ExecutorError` (+ `SelectionError`, `ResolveError`) carrying a stable
  `code`, typed against a **closed `ErrorCode` union**: `invalid_input |
  invalid_selection | unsupported_selection | no_structure | empty_selection |
  unknown_command | internal_error`.
- `selection.ts` — `resolveSelection(selection, structure): StructureElement.Loci`.
  Builds a MolScript `atomGroups` (chain-test = `eq` on auth/label `_asym_id`;
  residue-test = `eq` for a single residue or `inRange` for a range, combined with
  `core.logic.or`), then `StructureSelection.toLociWithSourceUnits`. Throws
  `SelectionError` for unsupported (preset) / invalid selectors; a no-match returns an
  **empty loci** (not thrown) — the caller decides.
- `resolve-structure.ts` — `defaultResolveStructure` (pdb id → RCSB mmCIF url; plain
  url; inline data) + the host-overridable `ResolveStructure` type. Validates source
  fields → `ResolveError('invalid_input', …)`.
- `context.ts` — the `ExecutorContext` **port**: `getStructure / loadStructure /
  highlight / clearHighlight / focus / resetCamera / getSceneContext`, plus
  `SceneContext` and `FocusOptions`. A real Mol* adapter (Plan 3) or a test fake
  implements it.
- `executor.ts` — `createExecutor(ctx, options).dispatch(command): Promise<CommandResult>`.
  Switches on `command.name`, resolves selections/structures, maps failures to
  structured `CommandResult` errors. `options.resolveStructure` overrides the default.

## Key architecture decisions
- **The executor depends on a high-level `ExecutorContext` port, NOT on raw Mol*
  managers.** This makes the whole executor + resolvers Node-testable against a fake
  port + real fixture `Structure`s (built via the verified parse path, src:
  raw/0007-node-structure-spike-2026-06-18.md). The real `PluginContext`→`ExecutorContext`
  adapter is deferred to **Plan 3**.
- **The executor is the trust boundary for LLM-generated JSON.** It validates field
  types/values at runtime — chain is a string; residues is an array of `number |
  [number, number]`; numbering ∈ {auth, label}; format ∈ {mmcif, pdb}; preset ∈ the
  preset set — normalizes a reversed `[end, start]` range, and returns a clean
  `invalid_input` / `invalid_selection` instead of a raw TypeError or a silent empty
  match. (Added in a post-implementation review-hardening pass.)
- **The executor is intentionally NOT in the public barrel `src/index.ts`.** Keeping the
  agent-side barrel (`commands`/`tools`/`adapters`) molstar-free serves the
  backend-LLM / thin-client consumers; the executor's public entry point is a
  Plan-3 / packaging decision.
- **Error-code split:** `invalid_input` = malformed command envelope (not an object /
  missing selection / bad load field); `invalid_selection` = a selection object whose
  contents are malformed; `unsupported_selection` = a valid preset not implemented yet;
  plus `no_structure`, `empty_selection`, `unknown_command`, `internal_error`.

## Deferred to Plan 3 (in the plan doc's "Handoffs to Plan 3")
- Real `PluginContext`→`ExecutorContext` adapter + visual/XR verification.
- Preset selectors (`unsupported_selection` today) → real MolScript molecular-type queries.
- `ExecutorContext.clearHighlight()` is declared but unwired (no v1 command / caller).
- `highlight.style` / `focus.zoomOut` are advertised in the schema but dropped by the
  Plan-2 executor.
- Multi-model structures: `toLociWithSourceUnits` unions matches across all models.
- Host/adapter error-code passthrough: `dispatch` maps only `ExecutorError` codes
  (everything else → `internal_error`).
- Possible refactor: one validator keyed by `command.name` against
  `CommandSpec.inputSchema` instead of the hand-rolled per-field checks.
