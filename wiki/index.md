# van-der-view Wiki — Map

The entry point to this LLM-maintained knowledge base. Read this first to find
the right page. Schema and the three operations are defined in [CLAUDE.md](CLAUDE.md).

> **Project in one line:** an open-source, headless React developer library that
> bridges an AI agent and the Mol\* 3D molecular renderer via a lightweight
> standardized JSON command schema. See [[project-overview]].

_Last updated: 2026-06-18 · 9 pages · 9 sources_

## Clusters

### Project
| Page | Hook |
|---|---|
| [[project-overview]] | Goal, audience/boundary, 5 constraints, locked tech decisions. `decision` `stable` |
| [[testing-strategy]] | Automated Node unit tests + a manual Vite demo; rendering/XR verified by hand. `decision` `stable` |

### Schema / Protocol
| Page | Hook |
|---|---|
| [[command-schema]] | The agent↔renderer JSON contract — v1 catalog + appearance/visibility/measure/label expansion, `Selection` type. `decision` `stable` |
| [[agent-command-flow]] | End-to-end tool-calling loop; provider adapter + provider-agnostic executor. `how-to` |
| [[molviewspec]] | The MVS declarative scene standard (`kind/params/children` tree). `entity` |

### Rendering Engine (Mol\*)
| Page | Hook |
|---|---|
| [[molstar-api]] | Headless `PluginContext`, managers, MolScript selection, camera focus. `entity` |
| [[molstar-webxr]] | WebXR is native (`canvas3d.xr`) since v5.0.0 — incl. the user-gesture rule. `entity` |

### Integration
| Page | Hook |
|---|---|
| [[headless-react]] | Mounting Mol\* client-only in Next.js / Vite / Remix / TanStack. `how-to` |

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
| 0009 | Command expansion — `set-representation` / `set-color` / `toggle-visibility` / `measure-distance` / `add-label` implemented (pure-Node `measure.ts`, port extended) |

## Open questions (rollup)
- ✅ **Selection tests in Node** — resolved: pure-Node `Structure`/loci build confirmed (raw/0007) and the executor + `resolveSelection` are unit-tested (raw/0008, [[testing-strategy]]).
- **Packaging** — peer-dep on `molstar` vs bundle; one component vs hooks-only; the executor's public entry point (not in the molstar-free barrel yet) ([[project-overview]], [[headless-react]])
- **Mol\* version** — pin a `5.x` and verify signatures against `.d.ts` ([[molstar-api]]); Plan 2 builds against `5.10`.
- **Command envelope** — batching/transactions and ack/streaming still open; the **v1 error-code taxonomy is now defined** (raw/0008, [[command-schema]]).
- **Command surface** — appearance/visibility/measurement/label commands now implemented (raw/0009); component management, richer measurements (angle/dihedral), and a label lifecycle remain open ([[command-schema]]).
- **`dispatch` input** — `Command` only vs convenience overload for the raw provider block ([[agent-command-flow]])
- **MVS construction** — server-side Python vs client-side JS builder, for v1.1 `load-scene` ([[project-overview]])
- **Plan-3 handoffs** — real `PluginContext`→`ExecutorContext` adapter, preset selectors, `clearHighlight`/`style`/`zoomOut`, multi-model selection, host error-code passthrough (raw/0008, [[agent-command-flow]])

## How to grow this wiki
- `/wiki-ingest <url|file|text>` — add a source, synthesize pages
- `/wiki-query "<question>"` — answer from the wiki
- `/wiki-lint` — health-check links, sources, staleness
