# van-der-view

Headless, configurable React library that bridges an AI agent (LLM chatbot) and
the Mol\* 3D molecular renderer via a lightweight standardized JSON command
schema. Full context: `wiki/pages/project-overview.md`.

## Knowledge base — consult it, then feed it

This repo keeps an **LLM-maintained wiki** at `wiki/`. It is the project's memory
for Mol\*, MolViewSpec, WebXR, the command schema, and architecture decisions.
Its pages are source-cited against `wiki/raw/`.

**Before researching or deciding** anything about those topics:
1. Read `wiki/index.md` (the map), then the relevant `wiki/pages/*.md`.
2. Or run `/wiki-query "<question>"`.
3. Prefer the wiki over re-searching the web — that's the point of it.

**After learning something durable** (a new fact, a resolved decision):
- File it back with `/wiki-ingest <source>` so the next session inherits it.
- Keep `wiki/pages/` and `wiki/index.md` in sync; `/wiki-lint` checks health.

The wiki's own schema and rules live in `wiki/CLAUDE.md` (auto-loaded when working
under `wiki/`). Do not duplicate them here.

## Status

Early implementation — the **agent-side, browser-side executor, and browser runtime
cores have all landed** (`src/`):

- **Agent-side** (Plan 1, merged): the command schema types, the v1 command catalog
  (`commands`), and the Anthropic adapter (`tools.anthropic`, `adapters`). Exposed via
  the molstar-free public barrel `src/index.ts`.
- **Browser-side executor** (Plan 2, merged): `selection` (Selection → Mol\* loci,
  auth/label), `resolve-structure` (data sourcing), the `ExecutorContext` port
  (`context`), and `createExecutor().dispatch()` (`executor`). Depends on `molstar`;
  intentionally **not** in the agent-side barrel.
- **Browser runtime core** (Plan 3a, merged — PR #12): the real Mol\* adapter
  `molstarExecutorContext` (`src/mol/adapter.ts`) behind the port, `createMolView` +
  XR wrappers (`src/mol/`), and the React mount `<MolViewProvider>`/`useMolView()`/
  `<MolViewCanvas/>` (`src/react/`), exposed via the molstar-dependent barrel
  `src/browser.ts`. Off-GPU code (presets, XR wrappers, SSR smoke) is Node-tested (88
  tests); GPU/plugin-bound code (adapter, `createMolView`, the canvas mount) is
  typecheck-gated and verified by hand in Plan 3b. v1 schema cut: `highlight.style`
  deferred to v1.1; `focus.zoomOut` is a numeric factor.

Next (`docs/superpowers/plans/`): **Plan 3b** — the Vite demo + manual XR / visual
checklist (tune `focus.zoomOut` magnitude and camera feel by eye), then **packaging**
(build + the package `exports` split between `src/index.ts` and `src/browser.ts`).

Commands:
- `pnpm test` — run the Vitest suite (`pnpm test:watch` to watch)
- `pnpm typecheck` — `tsc --noEmit`

No build step yet (tests run on TS source via Vitest); packaging is a later plan.
