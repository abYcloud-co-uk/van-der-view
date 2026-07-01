# van-der-view Wiki — Map

The entry point to this LLM-maintained knowledge base. Read this first to find
the right page. Schema and the three operations are defined in [CLAUDE.md](CLAUDE.md).

> **Project in one line:** an open-source, headless React developer library that
> bridges an AI agent and the Mol\* 3D molecular renderer via a lightweight
> standardized JSON command schema. See [[project-overview]].

_Last updated: 2026-07-01 · 12 pages · 15 sources_

## Clusters

### Project
| Page | Hook |
|---|---|
| [[project-overview]] | Goal, audience/boundary, 5 constraints, locked tech decisions. `decision` `stable` |
| [[testing-strategy]] | Automated Node unit tests + a manual Vite demo; rendering/XR verified by hand. `decision` `stable` |
| [[packaging]] | tsup ESM dual-entry build, scoped GitHub Packages publish, `verify:package` gate + molstar-free guard. `decision` `stable` |

### Schema / Protocol
| Page | Hook |
|---|---|
| [[command-schema]] | The agent↔renderer JSON contract — v1 + trajectory + v1.1a representation catalog + persistent `highlight`/`clear-highlight` (#38), `Selection` type. `decision` `stable` |
| [[agent-command-flow]] | End-to-end tool-calling loop; provider adapter + provider-agnostic executor. `how-to` |
| [[molviewspec]] | The MVS declarative scene standard (`kind/params/children` tree). `entity` |

### Rendering Engine (Mol\*)
| Page | Hook |
|---|---|
| [[molstar-api]] | Headless `PluginContext`, managers, MolScript selection, camera focus. `entity` |
| [[molstar-trajectories]] | Loading MD trajectories (topology + XTC/TRR/DCD coords) via `loadTrajectory` + frame playback; **realized** by the trajectory cluster (PR #17). `how-to` `stable` |
| [[molstar-appearance]] | Per-selection representation/color/visibility — one owned component + per-loci transparency; **realized** by the v1.1a representation cluster (PR #21); + persistent `highlight` overpaint (#38). `how-to` `stable` |
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
| 0012 | Trajectory + playback cluster merged (PR #17) & GPU-verified — 4 commands, `resolveCoordinates` hook, port members, pure-Node spike, demo panel; external-review fix wave (H1 dropped-wiring etc.) |
| 0013 | Packaging merged (PR #19) — tsup ESM dual-entry build, scoped `@abycloud-co-uk/van-der-view` GHP package, `verify:package` gate + molstar-free guard; molstar optional / react required peers; external-review fix wave |
| 0014 | v1.1a representation cluster merged (PR #21) — 5 commands + the per-selection-component appearance model (color on the owned component → persists + per-selection schemes; preset hidden under per-loci transparency); two rejected drafts + a GPU pass; Mol\* appearance APIs + theme names; 3 review rounds |
| 0015 | Persistent highlight via overpaint + `clear-highlight` command (#38) — replaces the transient hover-marking channel; API gotcha (overpaint decorator on the representation node → restyle drops it → re-assert) + handle-clear serialization fix; async port; yellow default; documented "existing-geometry-only" limit |

## Open questions (rollup)
- ✅ **Selection tests in Node** — resolved: pure-Node `Structure`/loci build confirmed (raw/0007) and the executor + `resolveSelection` are unit-tested (raw/0008, [[testing-strategy]]).
- ✅ **Plan-3 handoffs** — resolved by Plan 3a (raw/0009): the real `molstarExecutorContext` adapter, the 7 preset selectors, and numeric `focus.zoomOut` all landed; `clearHighlight` is wired in the adapter. The **v1.1a representation cluster** then shipped (PR #21, raw/0014, [[molstar-appearance]]); only **`highlight.style`** moved further on, to **v1.1b**. Still future: multi-model selection scoping, host error-code passthrough, XR early-subscribe.
- ✅ **One component vs hooks-only** — shipped: `<MolViewCanvas/>` + `<MolViewProvider>`/`useMolView()` (raw/0009, [[headless-react]]).
- ✅ **Packaging** — shipped (PR #19, raw/0013, [[packaging]]): tsup ESM dual-entry build, scoped `@abycloud-co-uk/van-der-view` on org GitHub Packages, `molstar` optional + `react`/`react-dom` required peers, a `verify:package` gate enforcing the molstar-free split. Still open: a **public npm** release at a stable version (GHP needs auth even for public packages).
- **Mol\* version** — pin a `5.x` and verify signatures against `.d.ts` ([[molstar-api]]); Plan 2 + 3a build against `5.10.1`.
- **Command envelope** — batching/transactions and ack/streaming still open; the **v1 error-code taxonomy is defined** (`unsupported_selection` now reserved-unused) (raw/0008, raw/0009, [[command-schema]]).
- **`dispatch` input** — `Command` only vs convenience overload for the raw provider block ([[agent-command-flow]])
- **MVS construction** — server-side Python vs client-side JS builder, for v1.1 `load-scene` ([[project-overview]])
- ✅ **MD trajectories shipped (PR #17)** — the `load-trajectory`/`play`/`stop`/`set-frame` cluster + the `resolveCoordinates` hook landed and are GPU-verified (raw/0012, [[command-schema]], [[molstar-trajectories]]). Still open: in-headset playback, palindrome/trim/multi-trajectory, gro/xyz topology.
- ✅ **Plan 3b** — the Vite demo (`examples/demo/`) is merged and **GPU-verified for all
  non-XR functionality** (raw/0011). ⏸️ **WebXR is the one untested piece** (no headset) —
  deferred until a device is available ([[testing-strategy]], [[molstar-webxr]]).
- ✅ **v1.1a representation cluster shipped (PR #21, raw/0014)** — `set-representation`/`set-color`/
  `toggle-visibility`/`measure-distance`/`add-label` with the per-selection-component appearance model
  ([[molstar-appearance]], [[command-schema]]); PR #11 closed (folded in). **Next build direction** —
  **v1.1b** (`load-scene`, `toggle-xr`, `highlight.style`, multi-representation components for mixed
  polymer+ligand selections), or **trajectory follow-ups** (in-XR playback, palindrome/trim/multi-trajectory);
  v1 runtime + trajectory cluster + packaging + the v1.1a representation cluster are complete ([[project-overview]]).
- ✅ **Persistent highlight shipped (#38, raw/0015; post-v0.4.0, unreleased)** — the `highlight` command is
  now a persistent overpaint layer (replace semantics) surviving hover/click/focus, plus a dispatchable
  `clear-highlight` command; the port + `MolView.clearHighlight()` went async. On `fix/highlight-persistence`,
  pending a demo GPU visual pass before PR ([[command-schema]], [[molstar-appearance]]). Still deferred:
  `highlight.style` (v1.1b) and the multi-structure overpaint/transparency getter.

## How to grow this wiki
- `/wiki-ingest <url|file|text>` — add a source, synthesize pages
- `/wiki-query "<question>"` — answer from the wiki
- `/wiki-lint` — health-check links, sources, staleness
