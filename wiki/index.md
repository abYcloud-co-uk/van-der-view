# van-der-view Wiki — Map

The entry point to this LLM-maintained knowledge base. Read this first to find
the right page. Schema and the three operations are defined in [CLAUDE.md](CLAUDE.md).

> **Project in one line:** a headless React library that bridges an AI agent and
> the Mol\* 3D molecular renderer via a lightweight standardized JSON command
> schema. See [[project-overview]].

_Last updated: 2026-06-18 · 7 pages · 2 sources_

## Clusters

### Project
| Page | Hook |
|---|---|
| [[project-overview]] | The goal, the 5 hard constraints, and current tech decisions. `decision` |

### Schema / Protocol
| Page | Hook |
|---|---|
| [[command-schema]] | **Draft** of the agent↔renderer JSON contract — intent commands over a hybrid layer. `decision` |
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

## Open questions (rollup)
- **v1 command set** — which intents ship first? ([[command-schema]])
- **Numbering** — lock `auth` vs `label` handling in selections ([[molstar-api]], [[command-schema]])
- **XR gesture** — ergonomic pattern for agent-issued `toggle-xr` ([[molstar-webxr]])
- **Mol\* version** — pin a `5.x` and verify signatures against `.d.ts` ([[molstar-api]])
- **Packaging** — peer-dep on `molstar` vs bundle; one component vs hooks ([[headless-react]])
- **MVS construction** — server-side Python vs client-side JS builder ([[project-overview]])

## How to grow this wiki
- `/wiki-ingest <url|file|text>` — add a source, synthesize pages
- `/wiki-query "<question>"` — answer from the wiki
- `/wiki-lint` — health-check links, sources, staleness
