---
title: Agent Command Schema (van-der-view contract)
slug: command-schema
type: decision
status: stable
sources: [raw/0003-design-decisions-2026-06-18.md, raw/0001-molstar-research.md, raw/0002-molviewspec-research.md, raw/0005-integration-recon-saas-2026-06-18.md]
updated: 2026-06-18
links: [agent-command-flow, molviewspec, molstar-api, molstar-webxr, project-overview]
---

# Agent Command Schema (van-der-view contract)

> The lightweight JSON contract the LLM agent emits (via structured tool-calling)
> and van-der-view executes against Mol\*. A thin, LLM-friendly façade over
> [[molviewspec]] (declarative) + the imperative [[molstar-api]] (live
> interaction) + [[molstar-webxr]] (XR). Design locked 2026-06-18 (src: raw/0003).

## Key facts

- The agent drives via **structured tool-calling**, not text-sniffing: the
  developer registers our commands as the LLM's tools; the LLM emits a structured
  tool_call (src: raw/0003). See [[agent-command-flow]] for the end-to-end loop.
- The agent targets **our schema, never raw Mol\***  — the abstraction is the point
  (src: raw/0003).
- Each command is **intent-based**: it names an intent; the library decides which
  Mol\* layer to use (hybrid layer below).
- `CommandResult` is fed back as a `tool_result` so the agent self-corrects on
  failure (src: raw/0003).

## Design principle: a hybrid command layer

No single Mol\* layer covers everything (src: raw/0001):

| Need | Best layer | Why |
|---|---|---|
| Whole-scene setup/replace | **MVS** (`loadMVS`) | declarative, validated, serializable |
| Live "highlight residue X / zoom to ligand Y" | **imperative managers** | incremental, real-time, no full re-render |
| "toggle WebXR mode" | **`canvas3d.xr`** | not MVS-expressible; needs a user gesture |

## Command envelope

A command is a normalized `Command`:
```ts
type Command = { name: string; input: unknown };   // what the executor consumes
type CommandResult =
  | { ok: true;  data?: unknown }
  | { ok: false; error: { code: string; message: string } };
```
The agent-side **adapter** produces/consumes the provider wire format; the
executor only ever sees `Command`. See [[agent-command-flow]].

## v1 command catalog (locked)

| command | tier | params (sketch) | Mol\* mapping |
|---|---|---|---|
| `load-structure` | **v1** | `{ source:"pdb"\|"url"\|"inline", id?, url?, data?, format? }` | `download` (pdb/url) or `rawData` (inline) + `parseTrajectory` + preset; via `resolveStructure` ([[molstar-api]]) |
| `highlight` | **v1** | `{ selection: Selection, style?: {repr?, color?, opacity?} }` | `interactivity.lociHighlights.highlightOnly` or component+representation |
| `focus` | **v1** | `{ selection: Selection, durationMs?, zoomOut? }` | `managers.camera.focusLoci(loci, …)` |
| `get-scene-context` | **v1** | `{}` | **read tool** → `getSceneContext()` (the "up" channel) |
| `reset-camera` | **v1** | `{}` | `managers.camera.reset()` |
| `color` | v1.1 | `{ selection, color }` | `component.updateRepresentationsTheme` |
| `set-representation` | v1.1 | `{ selection, type }` | `representation.addRepresentation` |
| `load-scene` | v1.1 | `{ mvsj }` | `loadMVS(plugin, data)` ([[molviewspec]]) |
| `toggle-xr` | v1.1 | `{ on?: boolean }` | `canvas3d.xr.request()/end()` — gesture affordance ([[molstar-webxr]]) |

`get-scene-context` is **in v1** and is a real read tool the agent can call, not
just system-prompt metadata — so it doesn't guess selectors (src: raw/0003).

### Shared `Selection` type (LLM-friendly)

Modeled on MVS `ComponentExpression` (src: raw/0002) so it maps to both MVS and
MolScript:
```jsonc
{
  "chain": "A",                 // label_asym_id / auth_asym_id
  "residues": [100, [120,140]], // single + ranges
  "numbering": "auth",          // "auth" (PDB) | "label" (entity)
  "preset": "ligand"            // OR preset: all|polymer|protein|nucleic|ligand|ion|water
}
```
⚠️ Be explicit about `auth` vs `label` numbering — mismatches silently select the
wrong residues ([[molstar-api]], [[glossary]]).

### Data sourcing — the `resolveStructure` hook

`load-structure` does **not** assume public data. All loading routes through a
host-configurable resolver so auth / internal storage stay in the host app
(src: raw/0005 — the first integration target loads inline text and auth-protected
presigned S3 URLs, not public PDB ids):

```ts
type LoadInput = { source:'pdb'|'url'|'inline'; id?:string; url?:string; data?:string; format?:'mmcif'|'pdb' };
type ResolveStructure = (input: LoadInput) => Promise<{ data?:string; url?:string; format:'mmcif'|'pdb' }>;
```

- `inline` → `builders.data.rawData({ data })`; `pdb`/`url` → `builders.data.download`.
- The **default** resolver handles `pdb` (RCSB) and a plain `url`. A host **overrides**
  `MolViewConfig.resolveStructure` to fetch auth-protected sources (e.g. a Bearer-token
  presigned S3 URL) and return the text. `resolveStructure` is **v1** (src: raw/0005).

## Hard constraints baked into the schema

1. **`toggle-xr` cannot self-trigger entry** (v1.1). WebXR `request()` needs a user
   gesture; `toggle-xr {on:true}` surfaces an affordance, the user click calls
   `request()`. Exit (`end()`) can be agent-driven ([[molstar-webxr]]).
2. **Real-time = incremental.** Prefer imperative manager calls for highlight/
   focus/color so the scene mutates without a full reload.
3. **Validation + structured errors.** Bad selections / unloaded structure return
   `{ ok:false, error }`, fed back as `is_error` tool_result so the agent recovers.

## See also
- [[agent-command-flow]] — the end-to-end tool-calling loop and adapter/executor seam
- [[molviewspec]] · [[molstar-api]] · [[molstar-webxr]] — the three mapped layers
- [[project-overview]] — the constraints this schema satisfies

## Open questions
- Envelope: batch commands (array) and transactions? Streaming ack protocol?
- Error code taxonomy (which `error.code` values, how granular).
- Exact `Selection` rule: are `chain`/`residues`/`numbering` and `preset` mutually exclusive?
- Testing of the schema/executor — see [[testing-strategy]].
