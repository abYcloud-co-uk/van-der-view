---
source_id: 0002
title: MolViewSpec (MVS) research report
origin: "internal research agent — verified against molstar.org/mol-view-spec-docs, github.com/molstar/mol-view-spec, NAR 2025 paper"
fetched: 2026-06-18
type: research-report
supersedes: null
---

# MolViewSpec (MVS) — Research Report

## 1. What MolViewSpec is

MolViewSpec (MVS) is an open standard and toolkit for *declaratively* describing
reproducible 3D molecular visualization scenes in a viewer-independent way. It
decouples the *definition* of a molecular scene (what to load, how to
represent/color it, where to point the camera) from the *rendering* engine. A
scene is captured as a "MolViewSpec State" — a JSON document holding everything
needed to reproduce the view.

**Who maintains it.** Developed collaboratively by the Mol* team at **RCSB PDB**,
**PDBe**, and **NCBR/CEITEC**. Lead authors: Adam Midlik and Sebastian Bittrich,
with David Sehnal and Brinda Vallat. Mol* is the reference implementation.

**Status / version.** Actively maintained. Latest release **1.8.1 (Dec 22,
2025)** for both the Python package and the repo; schema is at **version 1**
(`"version": 1`). MIT licensed. Published in **Nucleic Acids Research, 2025 (May
6), 53(W1):W408–W414** — "MolViewSpec: a Mol* extension for describing and
sharing molecular visualizations."

Canonical URLs (verified):
- Repo: https://github.com/molstar/mol-view-spec
- Docs: https://molstar.org/mol-view-spec-docs/
- Landing page: https://molstar.org/mol-view-spec/
- Tree schema reference: https://molstar.org/mol-view-spec-docs/tree-schema/
- Mol* extension docs: https://molstar.org/mol-view-spec-docs/mvs-molstar-extension/
- PyPI: https://pypi.org/project/molviewspec/
- Paper (open access): https://pmc.ncbi.nlm.nih.gov/articles/PMC12230705/

## 2. Data model / schema (the state tree)

MVS is a nested tree of nodes. Every node has the shape:
```
{ "kind": "<node-kind>", "params": { ... }, "children": [ ... ] }
```
Child nodes apply to the *result* of their parent (chaining of operations). The
tree always begins at a single `root` node. The schema is formalized as an
OpenAPI/JSON schema.

Node kinds (from the tree-schema reference):

*Core data pipeline:*
- `root` — entry point. Children: `download`, `camera`, `canvas`, `focus`, `primitives`.
- `download` — fetch a resource. Param: `url`. Child: `parse`.
- `parse` — parse the resource. Param: `format` (`mmcif`, `bcif`, `pdb`, `sdf`,
  `map`, `dx`, …). Children: `structure`, `coordinates`, `volume`.
- `structure` — build coordinates. Param: `type` (`model | assembly | symmetry |
  symmetry_mates`); optional `block_header`, `block_index`, `model_index`,
  `assembly_id`, `radius`, `ijk_min`, `ijk_max`, `coordinates_ref`. Builders map
  these to `model_structure()`, `assembly_structure()`, `symmetry_structure()`.

*Selection / components:*
- `component` — select a substructure. Param: `selector` (predefined string or a
  custom ComponentExpression).
- `component_from_uri` / `component_from_source` — components from external (URI)
  or in-file (CIF/BinaryCIF) annotations.

*Representation & styling:*
- `representation` — visual style. Param: `type` (`cartoon | backbone |
  ball_and_stick | line | spacefill | carbohydrate | surface | putty`), plus
  type-specific params (`size_factor`, `tubular_helices`, …).
- `color` — solid color. Params: `color`, optional `selector`.
- `color_from_uri` / `color_from_source` — color by annotation; support palettes.
- `opacity` — `opacity` (0–1).
- `clip` — geometric clipping (`plane | sphere | box`).

*Annotations:*
- `label` — text on a component. Param: `text`.
- `label_from_uri` / `label_from_source`.
- `tooltip` — hover text. Param: `text`. `tooltip_from_uri` / `tooltip_from_source`.

*Camera / canvas (children of `root`, except `focus`):*
- `camera` — explicit view. Params: `target`, `position`, optional `up`.
- `focus` — auto-frame a component. Optional `direction`, `up`, `radius`,
  `radius_factor`, `radius_extent`. Can attach to `root` or to component/volume nodes.
- `canvas` — viewport settings. Param: `background_color`.

*Volumetric:* `coordinates`, `volume`, `volume_representation` (`isosurface | grid_slice`).

*Transforms & primitives:* `transform` / `instance` (rotation/translation/4×4
matrix); `primitives`, `primitives_from_uri`, `primitive` (custom geometry:
`mesh`, `lines`, `tube`, `arrow`, `distance_measurement`, `angle_measurement`,
`label`, `ellipse`, `ellipsoid`, `box`).

Minimal real JSON example (1cbs):
```json
{
  "metadata": { "version": "1", "timestamp": "2023-11-24T00:00:00Z" },
  "root": {
    "kind": "root",
    "children": [
      { "kind": "download", "params": { "url": "https://files.wwpdb.org/download/1cbs.cif" },
        "children": [
          { "kind": "parse", "params": { "format": "mmcif" },
            "children": [
              { "kind": "structure", "params": { "type": "model" },
                "children": [
                  { "kind": "component", "params": { "selector": "polymer" },
                    "children": [
                      { "kind": "representation", "params": { "type": "cartoon" } }
                    ] } ] } ] } ] }
    ]
  }
}
```

## 3. Format details

Top-level document fields: `metadata` and `root`. (For animations, the top level
instead carries a `snapshots` array + `GlobalMetadata`.) `metadata` holds at
least `version` and a `timestamp`, and can include `title`/`description`.

- **`.mvsj`** — plain-JSON serialization of the tree + metadata. Single document.
- **`.mvsx`** — a ZIP archive containing `index.mvsj` at the root plus supporting
  files (structure data, annotation files). Enables self-contained, offline
  scenes where nodes reference local files via relative URIs.

Nodes nest via the universal `kind` + `params` + `children` triple.

## 4. Mapping to the agent use cases

Selecting / highlighting residues or chains: use a `component` node whose
`selector` is either a predefined string (`"all"`, `"polymer"`, `"protein"`,
`"nucleic"`, `"branched"`, `"ligand"`, `"ion"`, `"water"`) or a
**ComponentExpression** object with fields: chain (`label_asym_id`,
`auth_asym_id`), residue (`label_seq_id`, `auth_seq_id`), ranges
(`beg_label_seq_id`/`end_label_seq_id`, `beg_auth_seq_id`/`end_auth_seq_id`),
entity/atom (`label_entity_id`, `label_atom_id`/`auth_atom_id`, `type_symbol`,
`atom_id`, `atom_index`, `instance_id`, `pdbx_PDB_ins_code`). Arrays of
expressions form a union (OR).

Examples:
- Whole chain A: `{ "label_asym_id": "A" }`
- Residues 100–200 in chain B: `{ "label_asym_id": "B", "beg_label_seq_id": 100, "end_label_seq_id": 200 }`
- Cα of residue 100: `{ "auth_seq_id": 100, "type_symbol": "C", "auth_atom_id": "CA" }`

To highlight, attach `representation` (+ `color`/`opacity`) to that component.
There is no separate "highlight" primitive; highlighting = a distinct component
with its own representation/color.

Focusing / zooming onto a ligand or selection:
- `focus` (recommended for "zoom to X"): attach as a child of the target
  component; Mol* sets the camera target to the bounding-sphere center and
  positions it so the selection just fits. Optional `direction`, `up`,
  `radius`/`radius_factor`/`radius_extent` tune framing.
- `camera` (explicit): set exact `target`/`position`/`up`.

Labels & interactivity hooks: `label` (persistent 3D text) and `tooltip` (hover
text) are the only built-in interactivity hooks — no click handlers or callbacks
in the spec itself.

## 5. Python and JS/TS tooling

Python builder (`molviewspec`, PyPI, v1.8.1, Python ≥3.10):
```python
from molviewspec import create_builder
builder = create_builder()
structure = (builder
    .download(url="https://files.wwpdb.org/download/1cbs.cif")
    .parse(format="mmcif")
    .model_structure())
structure.component(selector="polymer").representation(type="cartoon").color(color="green")
structure.component(selector="ligand").representation(type="ball_and_stick").color(color="#aa55ff")
builder.get_state()        # -> the MVS State (serializable to .mvsj)
```

JS/TS + Mol* (browser). Core types under `src/extensions/mvs/`:
- `MVSData` (`mvs-data.ts`): `MVSData.createBuilder()`, `MVSData.fromMVSJ()`,
  `MVSData.toMVSJ()`, `MVSData.isValid()`, `MVSData.validationIssues()`.
- `loadMVS(plugin, mvsData, options)` (`load.ts`).

```typescript
const builder = MVSData.createBuilder();
const structure = builder
  .download({ url: '.../1og2_updated.cif' })
  .parse({ format: 'mmcif' })
  .modelStructure();
structure.component({ selector: 'polymer' }).representation({ type: 'cartoon' });
structure.component({ selector: 'ligand' })
  .representation({ type: 'ball_and_stick' })
  .color({ color: '#aa55ff' });
const mvsData = builder.getState();

const data = MVSData.fromMVSJ(rawJsonString);
if (!MVSData.isValid(data)) throw new Error(MVSData.validationIssues(data));
await loadMVS(plugin, data);
```
In the prebuilt UMD bundle: `molstar.PluginExtensions.mvs.MVSData` and
`molstar.PluginExtensions.mvs.loadMVS`. The `molstar.Viewer` class offers
`loadMvsFromUrl()` and `loadMvsData()`. Mol* also accepts MVS via drag-and-drop,
the Open/Download File menu, and URL params (`mvs-url`, `mvs-data`, `mvs-format`).

## 6. Relationship to Mol*

MVS is a declarative layer on top of Mol*'s imperative plugin/state API. The MVS
state tree is serializable and viewer-independent; `loadMVS` translates it into
Mol*'s internal `PluginStateObject` graph. MVS is deliberately a
subset/abstraction — it does not expose Mol*'s full internal state.

For agent-driven control, MVS is the recommended declarative layer when actions
map to scene description (load, select, color, label, focus, set camera/
background): stable JSON schema, built-in validation, portability, LLM-friendly
(kind/params/children). Drop to the native Mol* plugin API only for things MVS
cannot express — fine-grained imperative control, custom event/click handlers,
bespoke UI, or features outside the spec (WebXR). For "highlight residue / zoom to
ligand / toggle background", emitting MVS sub-trees is the natural fit; for
"toggle WebXR mode" you must call the Mol* plugin/viewer API directly.

## 7. Limitations / gaps

- **Animations: partially supported.** MVS supports multi-state animation via a
  `snapshots` array with per-snapshot `transition_duration_ms` and
  `linger_duration_ms`, plus `GlobalMetadata`; Mol* interpolates between
  snapshots, with an `interpolate()` mechanism (`duration_ms`, `property`,
  easing). Keyframe-style narratives work — but it is snapshot/interpolation
  based, not an arbitrary scripting/timeline engine.
- **WebXR / VR / AR: not in the spec.** No node, param, or doc references WebXR.
  "Toggle WebXR mode" must be driven through the Mol* plugin API, not MVS.
  (Verified absent across README, tree schema, and paper — a hard gap.)
- **Custom interactivity: minimal.** Only `label` and `tooltip`. No click
  handlers, event callbacks, custom UI bindings, or scripting.
- **Audience/maturity caveat (paper):** "MolViewSpec is currently designed
  primarily for developers." Stated future work: more languages, PyMOL/ChimeraX
  coordination, GUI builder.
- **Mol*-centric in practice.** Mol* is the only full reference implementation
  today. Representations are a fixed enumerated set (no custom shaders), though
  `primitives` allow custom mesh/line/measurement geometry.

Could not fully verify (low-confidence):
- Exact numeric defaults/semantics of `focus` params `radius_factor` /
  `radius_extent`.
- `metadata.version` literal type string `"1"` vs integer `1` (README showed
  `"0.1"`; docs reference schema `version: 1`). Confirm against the live JSON
  schema before hard-coding.
- Whether `auth_seq_id` ranges use `beg_auth_seq_id`/`end_auth_seq_id` exactly as
  named — confirm against the current OpenAPI schema for code generation.

Sources: tree-schema, docs home, Mol* extension, selectors, camera-settings,
animations, GitHub repo, PyPI, NAR paper/PMC (URLs in §1).

**Bottom line:** MVS is the right declarative contract for the agent→renderer
bridge. Map LLM intents to MVS node sub-trees (`component`+`representation`+
`color` for highlight, `focus` for zoom, `canvas` for background, `label`/
`tooltip` for annotations) and serialize to `.mvsj`; load via `loadMVS`/
`Viewer.loadMvsData`. Reserve direct Mol* plugin-API calls for WebXR toggling,
click/event interactivity, and non-snapshot animation.
