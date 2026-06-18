---
title: MolViewSpec (MVS)
slug: molviewspec
type: entity
status: stable
sources: [raw/0002-molviewspec-research.md, "https://molstar.org/mol-view-spec-docs/tree-schema/"]
updated: 2026-06-18
links: [molstar-api, command-schema, glossary]
---

# MolViewSpec (MVS)

> An open, viewer-independent standard for describing a 3D molecular scene
> declaratively as a JSON tree — the natural target for the agent's "render this
> scene" commands.

## Key facts

- MVS decouples *scene definition* (what to load, how to represent/color it,
  where the camera points) from the *rendering engine* (src: raw/0002).
- Maintained by RCSB PDB + PDBe + NCBR/CEITEC; Mol* is the reference
  implementation. Schema **version 1**; package **1.8.1 (Dec 2025)**; MIT
  licensed; published NAR 2025 (src: raw/0002).
- Serializations: **`.mvsj`** (plain JSON) and **`.mvsx`** (ZIP bundle with
  `index.mvsj` + local assets for offline scenes) (src: raw/0002).
- It is a **subset/abstraction** of Mol*'s internal state — it cannot express
  everything Mol* can (no WebXR, no click handlers; see Open questions) (src: raw/0002).

## Details

### The node tree

Every node is `{ "kind": ..., "params": { ... }, "children": [ ... ] }`. Children
apply to the *result* of their parent (operation chaining). One `root` per tree.
Top-level document = `{ metadata, root }` (or `{ snapshots, metadata }` for
animations) (src: raw/0002).

Pipeline of kinds:
`root → download(url) → parse(format) → structure(type) → component(selector) → representation(type) → color / label / opacity`,
with `camera` / `focus` / `canvas` hanging off `root` (or `focus` off a component).

Selected kinds (full list in raw/0002):

| kind | key params | role |
|---|---|---|
| `download` | `url` | fetch a resource |
| `parse` | `format` (`mmcif`,`bcif`,`pdb`,`sdf`,…) | parse it |
| `structure` | `type` (`model`/`assembly`/`symmetry`/`symmetry_mates`), `assembly_id`, `model_index` | build coordinates |
| `component` | `selector` (string or ComponentExpression) | select a substructure |
| `representation` | `type` (`cartoon`,`ball_and_stick`,`spacefill`,`surface`,`putty`,…) | visual style |
| `color` | `color`, optional `selector` | solid color |
| `label` / `tooltip` | `text` | annotations (only built-in interactivity) |
| `focus` | `direction`,`up`,`radius`,`radius_factor`,`radius_extent` | auto-frame camera on target |
| `camera` | `target`,`position`,`up` | explicit camera |
| `canvas` | `background_color` | viewport background |

### Minimal example (`.mvsj`)

```json
{
  "metadata": { "version": "1", "timestamp": "2023-11-24T00:00:00Z" },
  "root": { "kind": "root", "children": [
    { "kind": "download", "params": { "url": "https://files.wwpdb.org/download/1cbs.cif" },
      "children": [
        { "kind": "parse", "params": { "format": "mmcif" }, "children": [
          { "kind": "structure", "params": { "type": "model" }, "children": [
            { "kind": "component", "params": { "selector": "polymer" }, "children": [
              { "kind": "representation", "params": { "type": "cartoon" } }
            ]}
          ]}
        ]}
      ]}
  ]}
}
```

### Selecting residues / chains (maps to "highlight residue X")

`component.selector` is a predefined string (`all`, `polymer`, `protein`,
`nucleic`, `branched`, `ligand`, `ion`, `water`) **or** a **ComponentExpression**
(src: raw/0002):
- Whole chain A: `{ "label_asym_id": "A" }`
- Residues 100–200 in chain B: `{ "label_asym_id": "B", "beg_label_seq_id": 100, "end_label_seq_id": 200 }`
- Cα of residue 100: `{ "auth_seq_id": 100, "type_symbol": "C", "auth_atom_id": "CA" }`

Highlighting = define that component, then attach a `representation` + `color`
(+`opacity`). There is no dedicated "highlight" node. ⚠️ Distinguish
`auth_seq_id` (PDB numbering) from `label_seq_id` (entity numbering) — see [[molstar-api]].

### Focus / zoom (maps to "zoom to ligand Y")

Attach a `focus` node as a child of the target component; Mol* centers and frames
it. Or set an explicit `camera`. This is the declarative analog of Mol*'s
imperative `managers.camera.focusLoci` ([[molstar-api]]).

### Tooling

- **JS/TS (browser):** `MVSData.createBuilder()` → chain → `getState()`; load with
  `loadMVS(plugin, data)`. Validate with `MVSData.isValid` /
  `MVSData.validationIssues`. `SupportedVersion: 1`. ⚠️ `{ replaceExisting: true }`
  seen in some docs is **not** a real option — omit it (src: raw/0001, raw/0002).
- **Python (server):** `molviewspec` package, `create_builder()` →
  `builder.get_state()` → serialize to `.mvsj`.
- Also loadable via `Viewer.loadMvsData()`/`loadMvsFromUrl()`, drag-and-drop, and
  URL params (`mvs-url`, `mvs-data`, `mvs-format`).

## See also
- [[molstar-api]] — how Mol* loads MVS and the imperative APIs for what MVS can't do
- [[command-schema]] — how van-der-view's command schema sits on top of MVS
- [[molstar-webxr]] — XR is explicitly **not** an MVS feature
- [[glossary]] — loci, component, representation, assembly

## Open questions
- `metadata.version` literal: string `"1"` vs integer `1` — confirm against live schema.
- Exact semantics of `focus` `radius_factor` / `radius_extent`.
- Whether `beg_auth_seq_id`/`end_auth_seq_id` range fields are named exactly so.
