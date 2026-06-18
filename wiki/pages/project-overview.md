---
title: Project Overview — van-der-view
slug: project-overview
type: decision
status: draft
sources: ["user brief 2026-06-18"]
updated: 2026-06-18
links: [command-schema, molstar-api, molviewspec, molstar-webxr, headless-react]
---

# Project Overview — van-der-view

> **van-der-view** is a headless, configurable React component library that acts
> as the bridge between an AI agent (LLM chatbot) and a 3D molecular rendering
> engine, so the agent can control the renderer in real time via a lightweight,
> standardized JSON command schema.

## Goal

An LLM chatbot emits small, standardized JSON commands — e.g. *"highlight residue
X"*, *"zoom to ligand Y"*, *"toggle WebXR mode"* — and the library translates
them into live changes in a complex Web 3D molecular view.

## Constraints (the hard requirements)

| # | Constraint | Implication |
|---|---|---|
| 1 | **Headless** | The library ships rendering + control logic with **no imposed UI chrome**. Consumers bring their own UI. Maps to Mol*'s `PluginContext` + `initViewerAsync` path, not `createPluginUI`. See [[molstar-api]]. |
| 2 | **Configurable** | Behavior, defaults, and which commands are enabled are configurable by the host app. |
| 3 | **Framework-agnostic React** | Must drop into **Next.js, Vite, TanStack, Remix** with no friction. Mol* is browser/WebGL-only → client-only integration patterns required. See [[headless-react]]. |
| 4 | **Standardized lightweight JSON schema** | The agent↔renderer contract. Built on [[molviewspec]] (MVS) where it fits, plus imperative escape hatches. See [[command-schema]]. |
| 5 | **Real-time control** | Commands apply incrementally to a live scene, not just full re-renders. |

## Technology decisions (current)

- **Renderer:** [[molstar-api]] (Mol* / molstar) — mature, WebGL2, used by RCSB
  PDB and PDBe. Reused off-the-shelf; we do not build a renderer.
- **WebXR:** native to Mol* since v5.0.0 (`plugin.canvas3d.xr`). "Toggle WebXR"
  is a supported call, not something we build. See [[molstar-webxr]].
- **Command schema:** [[molviewspec]] (MVS) is the declarative scene layer; live
  interaction (highlight/zoom) and XR use imperative Mol* manager APIs. The
  van-der-view command schema is a thin, LLM-friendly façade over both. See
  [[command-schema]].

## Naming note

"van der" evokes **van der Waals** forces / radii — fitting for a molecular tool.
(Origin not formally documented; recorded here as a reasonable read.) ⚠️ unverified

## See also
- [[command-schema]] — the JSON contract the agent speaks
- [[molstar-api]] — the renderer we drive
- [[molstar-webxr]] — XR support
- [[headless-react]] — framework integration
- [[molviewspec]] — the declarative scene standard

## Open questions
- Final command-schema surface: which intents are v1? (see [[command-schema]])
- Do we depend on `molstar` directly, or wrap `pdbe-molstar`? (leaning direct — [[molstar-api]])
- Target Mol* version to pin against (v5.x for WebXR).
- Server-side vs client-side MVS construction (Python `molviewspec` vs JS `MVSData.createBuilder`).
