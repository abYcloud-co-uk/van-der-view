# van-der-view Wiki — Map

The entry point to this LLM-maintained knowledge base. Read this first to find
the right page. Schema and the three operations are defined in [CLAUDE.md](CLAUDE.md).

> **Project in one line:** an open-source, headless React developer library that
> bridges an AI agent and the Mol\* 3D molecular renderer via a lightweight
> standardized JSON command schema. See [[project-overview]].

_Last updated: 2026-06-22 · 10 pages · 11 sources_

## Clusters

### Project
| Page | Hook |
|---|---|
| [[project-overview]] | Goal, audience/boundary, 5 constraints, locked tech decisions. `decision` `stable` |
| [[testing-strategy]] | Automated Node unit tests + a manual Vite demo; rendering/XR verified by hand. `decision` `stable` |

### Schema / Protocol
| Page | Hook |
|---|---|
| [[command-schema]] | The agent↔renderer JSON contract — v1 command catalog, `Selection` type. `decision` `stable` |
| [[agent-command-flow]] | End-to-end tool-calling loop; provider adapter + provider-agnostic executor. `how-to` |
| [[molviewspec]] | The MVS declarative scene standard (`kind/params/children` tree). `entity` |

### Rendering Engine (Mol\*)
| Page | Hook |
|---|---|
| [[molstar-api]] | Headless `PluginContext`, managers, MolScript selection, camera focus. `entity` |
| [[molstar-trajectories]] | Loading MD trajectories (topology + XTC/TRR/DCD coords) via `loadTrajectory` + frame playback; the v1 gap. `how-to` `stable` |
| [[molstar-webxr]] | WebXR is native (`canvas3d.xr`) since v5.0.0 — incl. the user-gesture rule. `entity` |

### Integration
| Page | Hook |
|---|---|
| [[headless-react]] | Mounting Mol\* client-only (Next/Vite/Remix/TanStack); vdv's shipped `<MolViewProvider>`/`useMolView()`/`<MolViewCanvas/>` + the SSR guard. `how-to` |

### Reference
| Page | Hook |
|---|---|
| [[glossary]] | loci, component, representation, auth-vs-label numbering, MVS, WebXR. `concept` |

## Sources (`raw/`)
| id | what |
|---|---|
| 0001 | Mol\* integration research (headless, managers, WebXR, React/SSR) |
| 0002 | MolViewSpec research (node tree, selectors, tooling, limits) |
| 0003 | Design decisions — 2026-06-18 brainstorming (boundary, architecture, API, v1 catalog) |
| 0004 | Testing strategy decisions — 2026-06-18 brainstorming (automated Node suite + manual demo) |
| 0005 | Integration recon — abycloud saas app + design deltas (inline/resolveStructure, attach-mode, backend-LLM) |
| 0006 | XR in-VR interaction & voice boundary — enter needs a gesture; voice/UX is the host's; expose viewer.xr |
| 0007 | Node-Structure spike — pure-Node parse + selection→loci works (no WebGL); pnpm @scarf build-gate fix |
| 0008 | Plan 2 — browser-side executor core implemented & merged (`ExecutorContext` port, input validation, v1 error codes) |
| 0009 | Plan 3a — browser runtime core merged (real `molstarExecutorContext` adapter, `<MolViewProvider>`/`useMolView()`/`<MolViewCanvas/>` React mount, preset selectors, numeric `focus.zoomOut`, SSR smoke) |
| 0010 | Mol\* trajectory loading — source inspection of molstar 5.10.1 (topology+coordinates, `loadTrajectory`, `AnimateModelIndex`; corrects the VR notes' "no atom-count guard" claim) |
| 0011 | Plan 3b — Vite demo (`examples/demo/`) merged (PR #14) & GPU-verified except WebXR; library fixes `subscribeSupported` + `SceneContext` export |

## Open questions (rollup)
- ✅ **Selection tests in Node** — resolved: pure-Node `Structure`/loci build confirmed (raw/0007) and the executor + `resolveSelection` are unit-tested (raw/0008, [[testing-strategy]]).
- ✅ **Plan-3 handoffs** — resolved by Plan 3a (raw/0009): the real `molstarExecutorContext` adapter, the 7 preset selectors, and numeric `focus.zoomOut` all landed; `clearHighlight` is wired in the adapter. Only **`highlight.style`** moved on — to the **v1.1** representation cluster ([[command-schema]], [[agent-command-flow]]). Still future: multi-model selection scoping, host error-code passthrough, XR early-subscribe.
- ✅ **One component vs hooks-only** — shipped: `<MolViewCanvas/>` + `<MolViewProvider>`/`useMolView()` (raw/0009, [[headless-react]]).
- **Packaging** — the remaining structural decision: peer-dep on `molstar` vs bundle, and the package `exports` splitting the molstar-free `src/index.ts` from the molstar-dependent `src/browser.ts` (after Plan 3b). `react`/`react-dom` already peer deps ([[project-overview]], [[headless-react]]).
- **Mol\* version** — pin a `5.x` and verify signatures against `.d.ts` ([[molstar-api]]); Plan 2 + 3a build against `5.10.1`.
- **Command envelope** — batching/transactions and ack/streaming still open; the **v1 error-code taxonomy is defined** (`unsupported_selection` now reserved-unused) (raw/0008, raw/0009, [[command-schema]]).
- **`dispatch` input** — `Command` only vs convenience overload for the raw provider block ([[agent-command-flow]])
- **MVS construction** — server-side Python vs client-side JS builder, for v1.1 `load-scene` ([[project-overview]])
- **MD trajectories are out of v1** — loading topology + a coordinate stream (PDB+XTC) and frame playback is a future command cluster wrapping Mol\*'s `loadTrajectory` + `AnimateModelIndex`; the real Mol\* API is now documented (raw/0010, [[molstar-trajectories]]). Open: in-headset playback, a pure-Node coordinate spike, the command envelope.
- ✅ **Plan 3b** — the Vite demo (`examples/demo/`) is merged and **GPU-verified for all
  non-XR functionality** (raw/0011). ⏸️ **WebXR is the one untested piece** (no headset) —
  deferred until a device is available ([[testing-strategy]], [[molstar-webxr]]).
- **Next build direction** — **packaging** (build + `exports` split), a **trajectory + playback
  command cluster** for MD data ([[molstar-trajectories]]), or the **v1.1 representation
  cluster**; v1 runtime is otherwise complete ([[project-overview]]).

## How to grow this wiki
- `/wiki-ingest <url|file|text>` — add a source, synthesize pages
- `/wiki-query "<question>"` — answer from the wiki
- `/wiki-lint` — health-check links, sources, staleness
