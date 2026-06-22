---
source_id: 0010
title: Mol* trajectory / topology+coordinates loading — source inspection (molstar 5.10.1)
origin: "dev session 2026-06-22 — direct inspection of node_modules/molstar@5.10.1 source (.d.ts/.js), prompted by MD_Data (PDB topology + XTC trajectory test data). Independently verified, NOT copied from MD_Data/MOLSTAR_VR_NOTES.md."
fetched: 2026-06-22
type: file-excerpt
supersedes: null
---

# How Mol* loads MD trajectories (topology + coordinates) — verified against 5.10.1

Goal: learn the real Mol\* API for loading the kind of data in `MD_Data/` — a **PDB
topology + an XTC trajectory** (per-frame coordinates) — plus frame playback. Verified by
reading the installed `node_modules/molstar@5.10.1` source. The official docs page is
https://molstar.org/docs/plugin/file-formats/ .

## Two distinct input categories

Mol\* separates **formats that embed their own atoms/topology** from **coordinate streams
that carry only per-frame XYZ**:

- **Trajectory/model formats (self-contained: atoms + connectivity).** `BuiltInTrajectoryFormat`
  — `mmcif`, `pdb`(/pdbqt/pqr), `gro`, `xyz`, `mol`/`sdf`/`mol2`, `cube`, `lammps_data`,
  `lammps_traj_data`, cifCore. These are single- or multi-model and **embed frames directly**
  (multi-model PDB/mmCIF = a built-in trajectory). Transforms `TrajectoryFromMmCif /
  TrajectoryFromPDB / TrajectoryFromGRO / TrajectoryFromXYZ / …`
  (src: node_modules/molstar/lib/mol-plugin-state/transforms/model.d.ts:75-107; descriptions
  in model.js — "Parse PDB string and create trajectory", etc.).
- **Coordinate formats (per-frame XYZ only — must be paired with a topology).**
  `BuiltInCoordinatesFormats = ['dcd','xtc','trr','nctraj','lammpstrj']`
  (src: mol-plugin-state/formats/coordinates.d.ts:55-86). dcd/xtc/trr/nctraj are **binary**
  (`binaryExtensions`); lammpstrj is text. Transforms `CoordinatesFromDcd / CoordinatesFromXtc
  / CoordinatesFromTrr / CoordinatesFromNctraj / CoordinatesFromLammpstraj`, each
  `SO.Data.Binary → SO.Molecule.Coordinates` (model.d.ts:51-60; descriptions "Parse XTC binary
  data", etc.). Low-level parsers live under `mol-io/reader/{xtc,trr,dcd,nctraj}` (confirmed
  present).
- **Topology-only formats (chemistry/bonds, no coords — also paired with coordinates).**
  `BuiltInTopologyFormats = ['psf','prmtop','top']`, all text (topology.d.ts:45-72), transforms
  `TopologyFromPsf / TopologyFromPrmtop / TopologyFromTop` → `SO.Molecule.Topology`
  (model.d.ts:61-66).

**So: XTC (and TRR/DCD/NCTRAJ) is parsed natively — no conversion.** But it is a *coordinate
stream*; you must give it a topology (a PDB/GRO/mmCIF model, or a PSF/PRMTOP/TOP topology).

## The combine step (this is the key bit `parseTrajectory` does NOT do)

A model/topology object + a coordinates object are fused by the transform
**`TrajectoryFromModelAndCoordinates`** (`SO.Root → SO.Molecule.Trajectory`,
params `{ modelRef: string; coordinatesRef: string }`, model.d.ts:69-72; display name
"Trajectory from Topology & Coordinates"). Then a frame is realized with
**`ModelFromTrajectory`** (`SO.Molecule.Trajectory → SO.Molecule.Model`, params
`{ modelIndex: number }`, model.d.ts:110-112), and a structure with `StructureFromModel` /
`StructureFromTrajectory`.

⚠️ **The high-level `plugin.builders.structure.parseTrajectory(data, format)` only accepts a
`BuiltInTrajectoryFormat` (the self-contained list)** — it has **no** coordinate-insertion
method (`StructureBuilder` exposes `parseTrajectory / createModel / createStructure / …` but
nothing for a coordinates file — src: mol-plugin-state/builder/structure.d.ts:24-29). So the
PDB+XTC case is **not** reachable through the builder van-der-view's `load-structure` uses.

## The high-level helper: `loadTrajectory(plugin, params)`

There is a one-call helper that wires model + coordinates + a preset:
`loadTrajectory(plugin: PluginContext, params: LoadTrajectoryParams)`, exported from
**`molstar/lib/extensions/plugin/loaders`** (loaders.d.ts:96). It takes a **bare
`PluginContext`** (not the Viewer app), so it is usable from van-der-view's headless plugin.
`Viewer.loadTrajectory(...)` just forwards to it (apps/viewer/app.d.ts:114).

`LoadTrajectoryParams` (loaders.d.ts:156-189), verbatim shape:
```ts
interface LoadTrajectoryParams {
  model:
    | { kind: 'model-url';     url: string; format?: BuiltInTrajectoryFormat; isBinary?: boolean }
    | { kind: 'model-data';    data: string|number[]|ArrayBuffer|Uint8Array; format?: BuiltInTrajectoryFormat }
    | { kind: 'topology-url';  url: string; format: BuiltInTopologyFormat; isBinary?: boolean }
    | { kind: 'topology-data'; data: …; format: BuiltInTopologyFormat };
  modelLabel?: string;
  coordinates:
    | { kind: 'coordinates-url';  url: string; format: BuiltInCoordinatesFormat; isBinary?: boolean }
    | { kind: 'coordinates-data'; data: …;     format: BuiltInCoordinatesFormat };
  coordinatesLabel?: string;
  preset?: keyof PresetTrajectoryHierarchy;   // e.g. 'default' | 'all-models'
}
```
Documented example (loaders.d.ts:91-93 / app.d.ts:109-111):
```ts
viewer.loadTrajectory({
  model:       { kind: 'model-url',       url: 'villin.gro', format: 'gro' },
  coordinates: { kind: 'coordinates-url', url: 'villin.xtc', format: 'xtc', isBinary: true },
  preset: 'all-models', // or 'default'
});
```
- `preset: 'default'` = a single animatable structure bound to the trajectory.
- `preset: 'all-models'` = overlays all frames at once (looks like many copies) — NOT what you
  want for an MD movie of one complex.

## ✅ Correction to MD_Data/MOLSTAR_VR_NOTES.md — atom counts ARE validated

The VR notes claim `TrajectoryFromModelAndCoordinates` has "no explicit atom-count validation…
a mismatch will silently produce a garbled structure." **In 5.10.1 this is wrong.** The model
layer guards it per frame and **throws a clear error**:
```js
// mol-model/structure/model/model.js  (_trajectoryFromModelAndCoordinates)
const elementCount = model.atomicHierarchy.atoms._rowCount;
for (const f of frames) {
  if (f.elementCount !== elementCount)
    throw new Error(`Frame element count mismatch, got ${f.elementCount} but expected ${elementCount}.`);
  …
}
```
(src: node_modules/molstar/lib/mol-model/structure/model/model.js:31-36). So a
topology/coordinate atom-count mismatch fails loudly, not silently. The *ordering* still must
correspond (coordinates are bound positionally to topology atoms), but a count mismatch is
caught. The MD_Data `*_nowat.pdb` + `*_nowat.xtc` pair is built from the same OpenMM system, so
counts match (5GGS = 8316 atoms, 1N8Z = 15653 atoms per the handoff).

## Frame playback (animation)

Built-in animation **`AnimateModelIndex`** (name `built-in.animate-model-index`, display
"Animate Trajectory"), exported from
`mol-plugin-state/animation/built-in/model-index` (model-index.js:12-14). It steps the
`ModelFromTrajectory` model index over time. Driven programmatically via
`plugin.managers.animation.play(AnimateModelIndex, params)` and stopped with
`plugin.managers.animation.stop()` (manager API: mol-plugin-state/manager/animation.d.ts:33,38;
`managers.animation` exists on PluginContext — context.d.ts:146). Params (model-index.js:16-31):
```
mode:     loop{direction:forward|backward} | palindrome | once{direction}
duration: fixed{durationInS:1..120} | computed{targetFps:5..250} | sequential{maxFps:5..60}
```
Manual single-frame stepping = update the `ModelFromTrajectory` transform's `{ modelIndex }`.
Animation needs the render loop (`plugin.animationLoop` / `canvas3d`), so it requires a mounted
viewer; the *loading* (state building) works headless.

## Implications for van-der-view (capability gap)

- v1 `load-structure` → `plugin.builders.structure.parseTrajectory(data, format)` +
  `applyPreset` handles **self-contained** structures only (pdb/url/inline → a single static
  structure). It **cannot** load a topology + a separate coordinates file, and there is **no
  v1 command for trajectory playback / frame stepping**.
- To support the `MD_Data` PDB+XTC movies, van-der-view would need a new capability that wraps
  `loadTrajectory(plugin, {model, coordinates, preset:'default'})` plus a play/seek command over
  `AnimateModelIndex` / `ModelFromTrajectory.modelIndex`. This is a future (post-v1) command
  cluster — flagged, not designed here.
- Binary coordinate streams (xtc/trr/dcd/nctraj) **must be fetched over a URL** (or passed as
  `coordinates-data` bytes); they can't be embedded as text inline the way the current
  `inline` PDB source works.
