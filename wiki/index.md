# van-der-view Wiki — Map

The entry point to this LLM-maintained knowledge base. Read this first to find
the right page. Schema and the three operations are defined in [CLAUDE.md](CLAUDE.md).

> **Project in one line:** an open-source, headless React developer library that
> bridges an AI agent and the Mol\* 3D molecular renderer via a lightweight
> standardized JSON command schema. See [[project-overview]].

_Last updated: 2026-06-18 · 9 pages · 3 sources_

## Clusters

### Project
| Page | Hook |
|---|---|
| [[project-overview]] | Goal, audience/boundary, 5 constraints, locked tech decisions. `decision` `stable` |
| [[testing-strategy]] | Testing approach — **stub**, deferred to its own brainstorm. `decision` `stub` |

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

## Open questions (rollup)
- **Testing strategy** — the headline open thread; its own brainstorm next ([[testing-strategy]])
- **Packaging** — peer-dep on `molstar` vs bundle; one component vs hooks-only ([[project-overview]], [[headless-react]])
- **Mol\* version** — pin a `5.x` and verify signatures against `.d.ts` ([[molstar-api]])
- **Command envelope** — batching/transactions, ack/streaming, error-code taxonomy ([[command-schema]])
- **`dispatch` input** — `Command` only vs convenience overload for the raw provider block ([[agent-command-flow]])
- **MVS construction** — server-side Python vs client-side JS builder, for v1.1 `load-scene` ([[project-overview]])

## How to grow this wiki
- `/wiki-ingest <url|file|text>` — add a source, synthesize pages
- `/wiki-query "<question>"` — answer from the wiki
- `/wiki-lint` — health-check links, sources, staleness
