---
title: Agent Command Schema (van-der-view contract)
slug: command-schema
type: decision
status: stable
sources: [raw/0003-design-decisions-2026-06-18.md, raw/0001-molstar-research.md, raw/0002-molviewspec-research.md, raw/0005-integration-recon-saas-2026-06-18.md, raw/0006-xr-voice-boundary-2026-06-18.md, raw/0008-plan2-executor-core-2026-06-18.md, raw/0009-plan3a-browser-runtime-core-2026-06-22.md, raw/0012-trajectory-cluster-merged-2026-06-23.md, raw/0014-representation-cluster-merged-2026-06-23.md, raw/0015-highlight-persistence-2026-07-01.md, raw/0016-highlight-select-marking-2026-07-01.md]
updated: 2026-07-01
links: [agent-command-flow, molviewspec, molstar-api, molstar-webxr, project-overview, molstar-trajectories, molstar-appearance]
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

**v1 `error.code` values** (defined by the implemented executor, src: raw/0008):
`invalid_input` (malformed command envelope), `invalid_selection` (selection contents
malformed, incl. an unknown preset name), `no_structure`, `empty_selection` (selector
matched no atoms), `unknown_command`, `internal_error`. ⚠️ `unsupported_selection` is now
**reserved but never thrown** — Plan 3a implemented all 7 presets, so there is no
"valid-but-unimplemented preset" path; the code is kept for API compatibility (src: raw/0009).
The **trajectory cluster** (PR #17) added `no_trajectory` (play/stop/seek with none loaded) and
`trajectory_mismatch` (topology/coordinate atom-count disagreement) (src: raw/0012).

## v1 command catalog (locked)

| command | tier | params (sketch) | Mol\* mapping |
|---|---|---|---|
| `load-structure` | **v1** | `{ source:"pdb"\|"url"\|"inline", id?, url?, data?, format? }` | `clear()` then `download` (pdb/url) or `rawData` (inline) + `parseTrajectory` + preset; via `resolveStructure` ([[molstar-api]]) — **replaces** the scene (v1 = single-structure) |
| `highlight` | **v1** | `{ selection: Selection }` | `lociSelects.selectOnly` (select-marking channel — native tint + outline, persistent, fix #38) |
| `clear-highlight` | **#38** | `{}` | `lociSelects.deselectAll` — removes the persistent highlight; **post-v0.4.0 addition** (not in released v1) |
| `focus` | **v1** | `{ selection: Selection, durationMs?, zoomOut?:number }` | `managers.camera.focusLoci(loci, { durationMs, extraRadius })` |
| `get-scene-context` | **v1** | `{}` | **read tool** → `getSceneContext()` (the "up" channel) |
| `reset-camera` | **v1** | `{}` | `managers.camera.reset()` |
| `load-trajectory` | **traj** | `{ topology:<load-structure source>, coordinates:{ source:'url', url, format } }` | `loadTrajectory(plugin,{model,coordinates,preset:'default'})` — topology→`resolveStructure`, coords→`resolveCoordinates` ([[molstar-trajectories]]) |
| `play-trajectory` | **traj** | `{ fps?:number(>0), loop?:boolean }` | `animation.play(AnimateModelIndex,…)` |
| `stop-trajectory` | **traj** | `{}` | `animation.stop()` |
| `set-frame` | **traj** | `{ index:int [0,frameCount) }` | update `ModelFromTrajectory.modelIndex` |
| `set-representation` | **v1.1a** ✅ | `{ selection, type }` | per-selection component + `addRepresentation(type)` + hide preset coverage ([[molstar-appearance]]) |
| `set-color` | **v1.1a** ✅ | `{ selection, scheme? \| color? }` (exactly one) | color on the component's representation — hex→`uniform`, scheme→theme, **per-selection** ([[molstar-appearance]]) |
| `toggle-visibility` | **v1.1a** ✅ | `{ selection, visible:bool }` | toggle the component / per-loci transparency ([[molstar-appearance]]) |
| `measure-distance` | **v1.1a** ✅ | `{ from:Selection, to:Selection }` | centroid–centroid Å — **pure-Node** (`measure.ts`), no port member |
| `add-label` | **v1.1a** ✅ | `{ selection, text }` | `measurement.addLabel({visualParams:{customText}})`, replace-in-place ([[molstar-appearance]]) |
| `load-scene` | v1.1b | `{ mvsj }` | `loadMVS(plugin, data)` ([[molviewspec]]) |
| `toggle-xr` | v1.1b | `{ on?: boolean }` | `canvas3d.xr.request()/end()` — gesture affordance ([[molstar-webxr]]) |
| `highlight.style` | v1.1b | `{ selection, style }` | styled highlight (deferred from v1) |

`get-scene-context` is **in v1** and is a real read tool the agent can call, not
just system-prompt metadata — so it doesn't guess selectors (src: raw/0003).

**Plan-3a schema deltas (implemented, src: raw/0009):**
- **`highlight.style` was dropped from v1.** `highlight` is just `{ selection }` in v1.
  The **v1.1a representation cluster** then shipped the 5 restyle/measure commands above
  (PR #21, src: raw/0014, [[molstar-appearance]]) — note `color` landed as **`set-color`**
  (scheme *or* hex), and the per-selection appearance model (color on the owned component, not a
  structure-wide retheme). `highlight.style` itself moved on to **v1.1b**.
- **`focus.zoomOut` is a NUMERIC factor** (not a boolean): `1` fits the selection, `2`
  frames ≈ twice as wide for context. The adapter realizes it as
  `extraRadius = (zoomOut − 1) × structure.boundary.sphere.radius` so the pull-back scales
  with structure size; `≤ 1`/omitted leaves Mol\*'s default tight fit ([[molstar-api]]).
- **All 7 presets now resolve** for real via Mol\*'s own pure-Node selection queries
  ([[molstar-api]]); the schema's preset enum is fully backed.

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

### Trajectory coordinates — the `resolveCoordinates` hook

The **trajectory cluster** (PR #17) added a second host hook, symmetric with `resolveStructure`:
`load-trajectory`'s **topology** reuses `resolveStructure`, while its binary **coordinate stream**
routes through `resolveCoordinates` (src: raw/0012, [[molstar-trajectories]]):
```ts
type CoordinatesInput = { source:'url'; url?:string; format:'xtc'|'trr'|'dcd'|'nctraj' };
type ResolveCoordinates = (i: CoordinatesInput) => Promise<{ url?:string; data?:Uint8Array; format; isBinary:true }>;
```
Agent-facing coordinates are **url-only** (binary can't be text-inlined); raw bytes enter only via
a host override. Threaded through `MolViewConfig.resolveCoordinates`.

## Hard constraints baked into the schema

1. **`toggle-xr` cannot self-trigger entry** (v1.1). WebXR `request()` needs a user
   gesture; `toggle-xr {on:true}` surfaces an affordance, the user click calls
   `request()`. Exit (`end()`) can be agent-driven. ⚠️ A **voice** command is not a
   gesture either — in-VR, voice drives the agent which dispatches Commands, but entry
   still needs a click (src: raw/0006, [[molstar-webxr]]).
2. **Real-time = incremental.** Prefer imperative manager calls for highlight/
   focus/color so the scene mutates without a full reload.
3. **Validation + structured errors.** Bad selections / unloaded structure return
   `{ ok:false, error }`, fed back as `is_error` tool_result so the agent recovers.

## See also
- [[agent-command-flow]] — the end-to-end tool-calling loop and adapter/executor seam
- [[molviewspec]] · [[molstar-api]] · [[molstar-webxr]] — the three mapped layers
- [[molstar-trajectories]] — MD-trajectory loading/playback, realized by the trajectory cluster (PR #17)
- [[molstar-appearance]] — the per-selection representation/color/visibility model (v1.1a cluster, PR #21)
- [[project-overview]] — the constraints this schema satisfies

## Open questions
- Envelope: batch commands (array) and transactions? Streaming ack protocol?
- ✅ **Representation cluster shipped (PR #21).** `set-representation`/`set-color`/`toggle-visibility`/
  `measure-distance`/`add-label` landed with a per-selection-component appearance model (color on the
  owned component → persists + per-selection schemes; preset hidden under per-loci transparency)
  (src: raw/0014, [[molstar-appearance]]). Cut to **v1.1b**: `load-scene`, `toggle-xr`,
  `highlight.style`, and multi-representation components for mixed polymer+ligand selections.
- ✅ **Trajectories shipped (PR #17).** The `load-trajectory`/`play-trajectory`/`stop-trajectory`/
  `set-frame` cluster loads a topology + a separate coordinate stream (PDB+XTC etc.) and drives
  frame playback over `loadTrajectory` + `AnimateModelIndex` (src: raw/0012, [[molstar-trajectories]]).
  Cut: in-XR playback, per-frame `Selection` scoping, multi-trajectory, gro/xyz topology.
- ✅ **Error code taxonomy** — the v1 `error.code` set is defined and enforced by the
  executor (src: raw/0008, listed above); Plan 3a left it intact and reduced
  `unsupported_selection` to a reserved-unused code (raw/0009). Remaining: whether to open
  it to host-defined codes (a custom `resolveStructure` / the Mol\* adapter currently must
  throw an `ExecutorError` to surface a code).
- **`Selection` rule** — the executor treats `preset` as **short-circuiting**: if
  `preset` is set it resolves that (now a **real** loci via Mol\*'s selection queries, or
  `invalid_selection` for an unknown preset name) and ignores `chain`/`residues`; otherwise
  it requires a chain and/or residues (src: raw/0008, raw/0009). The strict
  mutual-exclusivity decision is still deferred. A residues-only selection (no chain)
  currently matches that residue number in **all** chains — semantics TBD.
- ✅ **Testing of the schema/executor** — adapter + executor + `resolveSelection` are
  Node unit-tested (src: raw/0008). See [[testing-strategy]].
