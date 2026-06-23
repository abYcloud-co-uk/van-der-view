# van-der-view

> A headless React library that lets an AI agent drive a [Mol\*](https://github.com/molstar/molstar)
> 3D molecular view through a small, standardized JSON command schema.

**Status:** 🚧 *Design phase.* The architecture and API are locked, but no library
code has been published yet. The design lives in [`wiki/`](wiki/) and
[`docs/superpowers/specs/`](docs/superpowers/specs/).

## Install

Published to the org's **GitHub Packages** registry. In the consuming project add an
`.npmrc` mapping the scope to GitHub Packages and authenticating with a GitHub token
that has `read:packages`:

```
@abycloud-co-uk:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Then install (provide your own `molstar` and `react` peers for the browser entry):

```bash
npm install @abycloud-co-uk/van-der-view
```

- **Agent-side** (no molstar needed):
  `import { commands, tools, adapters } from '@abycloud-co-uk/van-der-view'`
- **Browser-side** (needs the `molstar` + `react`/`react-dom` peers):
  `import { MolViewProvider, MolViewCanvas, useMolView } from '@abycloud-co-uk/van-der-view/browser'`

> GitHub Packages' npm registry requires authentication even for public packages. A
> token-free public npm release is planned for a stable version.

## What it is

van-der-view is the bridge between an **LLM chatbot** and the **Mol\*** molecular
renderer. An agent emits small standardized commands — *"highlight residues
100–120"*, *"zoom to the ligand"*, *"toggle WebXR"* — and the library applies them
as live, real-time changes to a 3D structure view.

It is:

- **Headless** — no imposed UI chrome; you bring your own layout.
- **Drop-in** — `pnpm install`, mount one component into any React app that already
  has an agent chatbot.
- **Framework-agnostic** — Next.js, Vite, Remix, TanStack (client-only; Mol\* is WebGL).

It ships the **glue**, not the chatbot: the renderer mount, the command schema,
ready-made LLM tool definitions, and the executor that applies commands. **The chat
UI is yours.**

## The idea in one picture

```
┌─────────────────────┐  tool_call   ┌─────────────┐  Command   ┌────────────┐  drives  ┌──────────┐
│ Your app + LLM call │ ───────────▶ │ vdv adapter │ ─────────▶ │  executor  │ ───────▶ │ Mol* 3D  │
└─────────────────────┘              └─────────────┘            └────────────┘          └──────────┘
          ▲                          (per provider)             (provider-agnostic)
          └───────────────── CommandResult (fed back as a tool_result) ─────────────────────┘
```

- **Your app owns the LLM call.** It hands each tool call to
  `viewer.dispatch(command)` and feeds the returned `CommandResult` back as a
  `tool_result`, so the agent can self-correct.
- **The agent targets our command schema, never the raw Mol\* API** (which is too
  large and unstable to expose to an LLM safely).

## Architecture

Two halves, decoupled by a single normalized `Command { name, input }`:

- **Agent-side** (environment-neutral): canonical command specs + thin
  **per-provider adapters** (`toTools` outbound, `toCommand` inbound). v1 ships the
  **Anthropic** adapter; an OpenAI/Codex adapter is a reserved placeholder.
- **Browser-side**: a `<MolViewProvider>` / `useMolView()` mount + a
  **provider-agnostic executor** that understands only `Command` and drives Mol\*.

Command → Mol\* is a **hybrid mapping**: live highlight/focus use imperative Mol\*
managers; whole scenes use [MolViewSpec](https://molstar.org/mol-view-spec-docs/);
XR uses `canvas3d.xr`.

## Public API (shape)

```ts
// agent-side
vdv.commands                 // canonical command specs
vdv.tools.anthropic          // ready-made Anthropic tool definitions

// browser-side
<MolViewProvider> / <MolViewCanvas> / useMolView()   // mount
viewer.dispatch(command) → CommandResult             // feed result back as a tool_result
viewer.getSceneContext()                             // the "up" channel — what the agent sees
viewer.plugin                                        // raw Mol* escape hatch
```

## Command catalog

| Version | Commands |
|---|---|
| **v1** | `load-structure`, `highlight`, `focus`, `get-scene-context` (read tool), `reset-camera` |
| **v1.1** | `color`, `set-representation`, `load-scene` (MolViewSpec), `toggle-xr` (WebXR) |

## Testing approach

- **Automated (Node, CI):** adapter conversion, `selection → loci` resolution, and
  an SSR-safety smoke. Runner: Vitest.
- **Manual:** a tiny Vite demo app (no LLM, no chat) — preset buttons, a
  paste-`tool_use` box, and an XR smoke checklist — for eyeballing real rendering.

## Knowledge base

This repo keeps an LLM-maintained wiki at [`wiki/`](wiki/) — the project's memory
for Mol\*, MolViewSpec, WebXR, the command schema, and design decisions. Start at
[`wiki/index.md`](wiki/index.md).

## License

TBD (open-source intended).
