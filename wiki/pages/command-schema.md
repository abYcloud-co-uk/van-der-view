---
title: Agent Command Schema (van-der-view contract)
slug: command-schema
type: decision
status: draft
sources: [raw/0001-molstar-research.md, raw/0002-molviewspec-research.md, "user brief 2026-06-18"]
updated: 2026-06-18
links: [molviewspec, molstar-api, molstar-webxr, project-overview]
---

# Agent Command Schema (van-der-view contract)

> ⚠️ **Draft / design proposal**, not yet implemented. This is the lightweight
> JSON contract the LLM agent emits and van-der-view executes against Mol*. It is
> a thin, LLM-friendly façade over [[molviewspec]] (declarative) + the imperative
> [[molstar-api]] (live interaction) + [[molstar-webxr]] (XR).

## Design principle: a hybrid command layer

Research showed no single Mol* layer covers everything (src: raw/0001):

| Need | Best layer | Why |
|---|---|---|
| Set up / replace a whole scene | **MVS** (`loadMVS`) | declarative, validated, serializable |
| Live "highlight residue X / zoom to ligand Y" | **imperative managers** | incremental, real-time, no full re-render |
| "toggle WebXR mode" | **`canvas3d.xr`** | not expressible in MVS; needs a user gesture |

So the command schema is **intent-based**: each command names an intent and the
library decides which Mol* layer to use. This keeps the agent's surface small and
stable even though the implementation spans three APIs.

## Proposed envelope

```jsonc
{
  "v": 1,                       // schema version
  "id": "cmd_01H...",          // optional correlation id for async ack
  "command": "highlight",      // the intent (see catalog)
  "params": { /* per-command */ }
}
```

Commands are applied in order to a **live** scene. The library returns an ack
`{ id, ok, error? }`. ⚠️ envelope shape is a proposal — open for revision.

## Proposed command catalog (v1 candidates)

| command | params (sketch) | Mol* mapping |
|---|---|---|
| `load-structure` | `{ source: "pdb"\|"url", id?, url?, format? }` | `builders.data.download` + `parseTrajectory` + preset, OR an MVS `download→parse→structure` subtree ([[molviewspec]]) |
| `load-scene` | `{ mvsj: <MVS document> }` | `loadMVS(plugin, data)` — full declarative scene |
| `highlight` | `{ selection: Selection, style?: {repr?, color?, opacity?} }` | MolScript selection → `interactivity.lociHighlights.highlightOnly` or a new component+representation ([[molstar-api]]) |
| `select` | `{ selection: Selection, mode?: "add"\|"set"\|"remove" }` | `structure.selection.fromLoci(mode, loci)` |
| `focus` | `{ selection: Selection, durationMs?, zoomOut? }` | `managers.camera.focusLoci(loci, ...)` |
| `color` | `{ selection: Selection, color }` | `component.updateRepresentationsTheme` |
| `set-representation` | `{ selection: Selection, type }` | `representation.addRepresentation` |
| `set-background` | `{ color }` | MVS `canvas.background_color` / canvas3d props |
| `reset-camera` | `{}` | `managers.camera.reset()` |
| `toggle-xr` | `{ on?: boolean }` | `canvas3d.xr.request()/end()` — **see gesture constraint below** ([[molstar-webxr]]) |

### Shared `Selection` type (LLM-friendly)

Modeled on MVS `ComponentExpression` (src: raw/0002) so it maps cleanly to both
MVS and MolScript:

```jsonc
{
  "chain": "A",                 // label_asym_id / auth_asym_id
  "residues": [100, [120,140]], // single + ranges
  "numbering": "auth",          // "auth" (PDB) | "label" (entity)  — see [[glossary]]
  "preset": "ligand"            // OR a preset: all|polymer|protein|nucleic|ligand|ion|water
}
```
⚠️ Must decide whether `chain`/`residues`/`numbering` and `preset` are mutually
exclusive. ⚠️ Be explicit about `auth` vs `label` numbering — mismatches silently
select the wrong residues ([[molstar-api]]).

## Hard constraints baked into the schema

1. **`toggle-xr` cannot self-trigger entry.** WebXR requires a user gesture
   ([[molstar-webxr]]). Proposed handling: `toggle-xr { on:true }` from the agent
   does **not** call `request()` directly; instead it surfaces an affordance
   (e.g. enables an "Enter VR" control), and `request()` fires from the user's
   click. Exiting (`on:false` / `end()`) has no gesture requirement and can be
   agent-driven.
2. **Real-time = incremental.** Prefer imperative manager calls for highlight/
   focus/color so the scene mutates without a full `loadMVS` reload.
3. **Validation.** When a command compiles to MVS, validate with `MVSData.isValid`
   before loading (src: raw/0002).

## See also
- [[molviewspec]] — the declarative half of the mapping
- [[molstar-api]] — the imperative half
- [[molstar-webxr]] — the XR command and its gesture rule
- [[project-overview]] — the constraints this schema must satisfy

## Open questions
- v1 command set: which of the catalog above ship first?
- Envelope: batch commands (array) and transactions? Ack/streaming protocol?
- Does the agent ever emit raw MVS directly, or always go through named commands?
- Error model: how are bad selections / unsupported XR reported back to the agent?
