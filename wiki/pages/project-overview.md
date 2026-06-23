---
title: Project Overview — van-der-view
slug: project-overview
type: decision
status: stable
sources: [raw/0003-design-decisions-2026-06-18.md, raw/0005-integration-recon-saas-2026-06-18.md, raw/0006-xr-voice-boundary-2026-06-18.md, raw/0008-plan2-executor-core-2026-06-18.md, raw/0009-plan3a-browser-runtime-core-2026-06-22.md, raw/0011-plan3b-demo-merged-verified-2026-06-22.md, raw/0012-trajectory-cluster-merged-2026-06-23.md, "user brief 2026-06-18"]
updated: 2026-06-23
links: [command-schema, agent-command-flow, molstar-api, molviewspec, molstar-webxr, headless-react, testing-strategy, molstar-trajectories]
---

# Project Overview — van-der-view

> **van-der-view** is an **open-source, headless React developer library**: the
> bridge between an AI agent (LLM chatbot) and the Mol\* 3D molecular renderer.
> `pnpm install`, drop into any React app that has an agent chatbot; the agent
> controls the 3D view in real time via a lightweight standardized JSON command
> schema. (Design baseline locked 2026-06-18, src: raw/0003.)

## Goal

An LLM chatbot emits small standardized JSON commands — *"highlight residue X"*,
*"zoom to ligand Y"*, *"toggle WebXR mode"* — and the library translates them into
live changes in a complex Web 3D molecular view.

## Audience & boundary (decided)

- **Audience:** third-party developers embedding it into their own AI/bio apps.
  The parent `aws_protein_project` is **out of scope** for this library (src: raw/0003).
- **Boundary = "library + agent glue":** ships the renderer mount/control, the JSON
  command schema, ready-made LLM tool definitions, and the executor. **No chat UI**
  — that's the developer's (src: raw/0003). See [[agent-command-flow]].
- **Input modality (incl. voice/VR) is the host's.** In immersive XR the DOM chat is
  gone, so the user talks to the agent by voice — but voice/STT/agent-loop are the
  host's, like the chat UI. van-der-view only guarantees commands apply mid-XR and
  exposes `viewer.xr` state/events; entering XR needs a user gesture, so it can't be
  voice-triggered (src: raw/0006). See [[molstar-webxr]].

## Constraints (the hard requirements)

| # | Constraint | Implication |
|---|---|---|
| 1 | **Headless** | No imposed UI chrome. Mol\*'s `PluginContext` + `initViewerAsync`, not `createPluginUI`. See [[molstar-api]]. |
| 2 | **Configurable** | Enabled commands, defaults, data source resolver are host-configurable (`MolViewConfig`). |
| 3 | **Framework-agnostic React** | Next.js, Vite, TanStack, Remix; browser/WebGL-only ⇒ client-only. See [[headless-react]]. |
| 4 | **Standardized lightweight JSON schema** | The agent↔renderer contract, driven by structured tool-calling. See [[command-schema]]. |
| 5 | **Real-time control** | Commands apply incrementally to a live scene, not full re-renders. |

## Technology decisions (locked)

- **Renderer:** [[molstar-api]] (Mol\*), reused off-the-shelf. Direct dependency on
  `molstar` (not wrapping `pdbe-molstar`).
- **WebXR:** native to Mol\* (`canvas3d.xr`); `toggle-xr` is a v1.1 command. See [[molstar-webxr]].
- **Command transport:** structured **tool-calling**; agent targets our schema, not
  raw Mol\*. Executor is provider-agnostic; adapters are per-provider (v1 = Anthropic,
  OpenAI/Codex placeholder). See [[agent-command-flow]] and [[command-schema]].
- **v1 commands:** load-structure, highlight, focus, get-scene-context, reset-camera.
- **Build status (src: raw/0008, raw/0009, raw/0011, raw/0012):** the **agent-side core** (schema +
  Anthropic adapter, Plan 1), the **browser-side executor core** (`createExecutor().dispatch()`
  over an `ExecutorContext` port, Plan 2), the **browser runtime core** (the real
  `molstarExecutorContext` adapter + the `<MolViewProvider>`/`useMolView()`/`<MolViewCanvas/>`
  React mount + an SSR smoke, **Plan 3a**), the **Vite demo** (`examples/demo/`, the manual
  layer, **Plan 3b**), and the **trajectory + playback cluster** (PR #17, GPU-verified) are all
  implemented and merged (**116 tests**). The demo is **GPU-verified** for all non-XR
  functionality; **WebXR is the one piece still untested** (no headset). So the v1 runtime + the
  first post-v1 cluster are complete and visually validated sans XR. Next: **packaging**, the
  **v1.1 representation cluster** (reconcile open PR #11), and **trajectory follow-ups**. See
  [[headless-react]], [[agent-command-flow]], [[testing-strategy]].
- **Integration deltas (from the first real target, src: raw/0005):** `load-structure`
  adds an `inline` source and routes all loading through a host `resolveStructure`
  hook (auth/storage stays in the host); the executor can **attach to a host-owned
  Mol\* plugin**; the developer's LLM call may live in their **backend** (thin-client
  path). See [[agent-command-flow]] and [[command-schema]].

## Naming note

"van der" evokes **van der Waals** radii/forces — fitting for a molecular tool.
⚠️ unverified (recorded as a reasonable read).

## See also
- [[command-schema]] — the JSON contract the agent speaks
- [[agent-command-flow]] — adapter + executor, end-to-end loop
- [[molstar-api]] · [[molviewspec]] · [[molstar-webxr]] · [[headless-react]]
- [[testing-strategy]] — automated Node tests + a manual demo

## Open questions
- ✅ **Testing strategy** — designed *and* realized: Node-side `Structure` build confirmed
  (raw/0007), the agent-side + executor cores are unit-tested (raw/0008), and Plan 3a added
  preset/XR/SSR coverage (raw/0009). See [[testing-strategy]].
- ✅ **One component vs hooks-only** — decided & shipped: vdv ships `<MolViewCanvas/>` +
  `<MolViewProvider>`/`useMolView()` (raw/0009, [[headless-react]]).
- **Packaging** (the remaining structural decision): peer-dep on `molstar` vs bundle, and
  the package `exports` map splitting the molstar-free `src/index.ts` from the
  molstar-dependent `src/browser.ts` (build phase, after Plan 3b). `react`/`react-dom` are
  already peer deps (raw/0009).
- Pin which Mol\* `5.x` to target (3a builds against 5.10.1).
- Server-side vs client-side MVS construction (for the v1.1 `load-scene`).
