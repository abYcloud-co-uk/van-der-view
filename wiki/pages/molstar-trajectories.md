---
title: Mol* MD Trajectories (topology + coordinates, playback)
slug: molstar-trajectories
type: how-to
status: stable
sources: [raw/0010-molstar-trajectory-loading-2026-06-22.md, raw/0012-trajectory-cluster-merged-2026-06-23.md, "https://molstar.org/docs/plugin/file-formats/"]
updated: 2026-06-23
links: [molstar-api, command-schema, agent-command-flow, molstar-webxr, project-overview]
---

# Mol* MD Trajectories (topology + coordinates, playback)

> How Mol\* loads an MD trajectory — a **topology/model + a coordinate stream** (e.g. a
> PDB + an XTC) — and animates frames. Distinct from loading a single static structure
> ([[molstar-api]]). Verified against molstar **5.10.1** source (src: raw/0010).

## Key facts

- Mol\* parses **XTC, TRR, DCD, NCTRAJ** (binary) and **LAMMPSTRAJ** (text) coordinate
  streams **natively — no conversion** (src: raw/0010). But a coordinate file carries only
  **per-frame XYZ**; it must be paired with a topology.
- A topology comes from a **self-contained model format** (`mmcif`/`pdb`/`gro`/`xyz`/…) or a
  **topology-only format** (`psf`/`prmtop`/`top`).
- ⚠️ **`plugin.builders.structure.parseTrajectory(data, format)` cannot do this.** It only
  accepts a self-contained `BuiltInTrajectoryFormat` and has no coordinate-insertion method
  (src: raw/0010). This is the builder van-der-view's `load-structure` uses — so **PDB+XTC is
  outside v1** ([[command-schema]]).
- The one-call path is **`loadTrajectory(plugin, params)`** from
  `molstar/lib/extensions/plugin/loaders` — takes a bare `PluginContext`, so it works from a
  headless plugin (src: raw/0010).
- ✅ **Atom counts ARE validated** in 5.10.1: a topology/coordinate count mismatch **throws**
  `Frame element count mismatch, got X but expected Y` (not a silent corruption) (src: raw/0010).

## Details

### Two input categories

| Category | Carries | Formats | Transform → state object |
|---|---|---|---|
| **Self-contained model/trajectory** | atoms + bonds (+ embedded frames) | `mmcif`, `pdb`/pdbqt/pqr, `gro`, `xyz`, `mol`/`sdf`/`mol2`, `cube`, lammps | `TrajectoryFrom*` → `Molecule.Trajectory` |
| **Coordinate stream** | per-frame XYZ only | `xtc`, `trr`, `dcd`, `nctraj` (binary), `lammpstrj` (text) | `CoordinatesFrom*` → `Molecule.Coordinates` |
| **Topology-only** | atoms + bonds, no coords | `psf`, `prmtop`, `top` (text) | `TopologyFrom*` → `Molecule.Topology` |

(src: raw/0010 — coordinates.d.ts / topology.d.ts / model.d.ts). Multi-model PDB/mmCIF are
*already* trajectories via `TrajectoryFromMmCif/PDB`; XTC/TRR/DCD/NCTRAJ are streams paired
with a topology.

### The transform chain (what `loadTrajectory` builds)

```
model/topology  ─┐
                 ├─▶ TrajectoryFromModelAndCoordinates {modelRef, coordinatesRef} ─▶ Molecule.Trajectory
coordinates  ────┘                                                                        │
                                              ModelFromTrajectory {modelIndex} ◀──────────┘ ─▶ Molecule.Model
                                              StructureFromModel ─▶ Molecule.Structure ─▶ representation
```
`TrajectoryFromModelAndCoordinates` fuses a model + coordinates; `ModelFromTrajectory
{ modelIndex }` selects the displayed frame (src: raw/0010, model.d.ts:69-112).

### The high-level helper

```ts
import { loadTrajectory } from 'molstar/lib/extensions/plugin/loaders';

await loadTrajectory(plugin, {
  model:       { kind: 'model-url',       url: '5GGS_nowat.pdb', format: 'pdb' },
  coordinates: { kind: 'coordinates-url', url: '5GGS_nowat.xtc', format: 'xtc', isBinary: true },
  preset: 'default',   // single animatable structure bound to the trajectory
});
```
`model.kind` ∈ `model-url | model-data | topology-url | topology-data`;
`coordinates.kind` ∈ `coordinates-url | coordinates-data`; coordinate `format` ∈
`xtc|trr|dcd|nctraj` with `isBinary: true` (src: raw/0010, `LoadTrajectoryParams`).
- `preset: 'default'` = one structure you can animate. `preset: 'all-models'` overlays **all**
  frames at once (looks like many overlapping copies) — wrong for a single-complex MD movie.
- Binary coordinate streams **must be a URL or `coordinates-data` bytes** — they can't be
  inlined as text the way a PDB string can (src: raw/0010).

### Playback / animation

Built-in animation **`AnimateModelIndex`** ("Animate Trajectory",
`mol-plugin-state/animation/built-in/model-index`) steps the model index over time:
```ts
import { AnimateModelIndex } from 'molstar/lib/mol-plugin-state/animation/built-in/model-index';
plugin.managers.animation.play(AnimateModelIndex, {
  mode:     { name: 'loop', params: { direction: 'forward' } }, // | 'palindrome' | 'once'
  duration: { name: 'computed', params: { targetFps: 30 } },    // | 'fixed'{durationInS} | 'sequential'{maxFps}
});
// stop: plugin.managers.animation.stop();
```
Manual single-frame stepping = update the `ModelFromTrajectory` transform's `{ modelIndex }`.
Animation needs the render loop (`canvas3d`), so it requires a mounted viewer; the *loading*
(state building) is headless (src: raw/0010).

### Pre-flight: topology must match coordinates

Counts are checked per frame and a mismatch **throws** (src: raw/0010), so a wrong pairing
fails loudly. Ordering still must correspond — coordinates bind positionally to topology atoms.
For `MD_Data`, use the protein-only `*_nowat.pdb` + `*_nowat.xtc` (same OpenMM atom set:
5GGS 8316, 1N8Z 15653); don't pair a stripped topology with a full-system trajectory.

## Relevance to van-der-view

- ✅ **Realized** in the **trajectory + playback cluster** (PR #17, merged 2026-06-23; src:
  raw/0012). Four commands wrap this API: `load-trajectory { topology, coordinates }` (topology
  reuses the `load-structure` source shape; coordinates url-only) +
  `play-trajectory`/`stop-trajectory`/`set-frame` over `AnimateModelIndex` /
  `ModelFromTrajectory.modelIndex`. See [[command-schema]] and [[agent-command-flow]].
- The cluster adds the molstar-free `resolveCoordinates` host hook (symmetric with
  `resolveStructure`), four `ExecutorContext` port members + a `SceneContext.trajectory`
  read-model, and the `no_trajectory`/`trajectory_mismatch` error codes. Lifecycle detail (src:
  raw/0012): `isPlaying` is read live from `plugin.managers.animation.isAnimating`; `setFrame`
  and loads stop the animation first; a failed load snapshots+restores the prior scene.
- v1 `load-structure` remains single-static-structure only (`parseTrajectory` + `applyPreset`);
  `load-trajectory` is the topology+coordinates path.
- In VR, in-headset trajectory *animation* is still the open question ([[molstar-webxr]]) — the
  cluster cut in-XR playback.

## See also
- [[molstar-api]] — single-structure loading, selection, camera (the static path)
- [[command-schema]] — the v1 command set this capability would extend
- [[molstar-webxr]] — XR, where in-headset frame playback is unverified
- [[project-overview]] — where a trajectory cluster sits on the roadmap

## Open questions
- **In-headset trajectory playback** — does `AnimateModelIndex` animate inside an immersive XR
  session? Unverified ([[molstar-webxr]]); test empirically. (In-XR playback was cut from the cluster.)
- ✅ **Headless coordinate parse in Node** — resolved enough for testing (src: raw/0012): the
  cluster's pure-Node spike builds an in-memory `Coordinates` and asserts
  `Model.trajectoryFromModelAndCoordinates` gives `frameCount === N` and throws on a mismatch (no
  binary XTC fixture). Real XTC *file* parsing in Node was sidestepped, not proven.
- ✅ **Trajectory command design** — designed & shipped (PR #17): the load envelope, play/stop/seek,
  and the scope cut (no per-frame `Selection` scoping, no multi-trajectory) are in [[command-schema]].
