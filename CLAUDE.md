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

Early implementation. The **agent-side core** has landed (`src/`): the command
schema types, the v1 command catalog (`commands`), and the Anthropic adapter
(`tools.anthropic`, `adapters`). Pure TypeScript — no molstar/React yet (the
browser-side executor, the React mount, and the demo are later plans; see
`docs/superpowers/plans/`).

Commands:
- `pnpm test` — run the Vitest suite (`pnpm test:watch` to watch)
- `pnpm typecheck` — `tsc --noEmit`

No build step yet (tests run on TS source via Vitest); packaging is a later plan.
