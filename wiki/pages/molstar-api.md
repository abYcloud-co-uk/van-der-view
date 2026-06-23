---
title: Mol* Programmatic API (headless)
slug: molstar-api
type: entity
status: stable
sources: [raw/0001-molstar-research.md, raw/0007-node-structure-spike-2026-06-18.md, raw/0009-plan3a-browser-runtime-core-2026-06-22.md, "https://molstar.org/docs/plugin/instance/"]
updated: 2026-06-22
links: [molviewspec, molstar-webxr, command-schema, agent-command-flow, headless-react, glossary, molstar-trajectories, molstar-appearance]
---

# Mol* Programmatic API (headless)

> How to run Mol* with **no built-in UI** and drive it imperatively — load
> structures, select/highlight, recolor, and focus the camera. This is the
> engine van-der-view wraps.

## Key facts

- The npm `molstar` package has **no `main` field**; import deep paths like
  `molstar/lib/mol-plugin/context` (src: raw/0001).
- **Headless path:** `new PluginContext(DefaultPluginSpec())` → `await
  plugin.init()` → `await plugin.initViewerAsync(canvas, container)`. The base
  `PluginContext` has **no React dependency**; React lives only in the
  `PluginUIContext` subclass used by `createPluginUI` (src: raw/0001).
- ⚠️ **`createPlugin` no longer exists** — old tutorials are outdated. The method
  is `initViewerAsync` (not `initViewer`) (src: raw/0001).
- Everything is reached through `plugin.managers.*`, `plugin.builders.*`, and
  `plugin.canvas3d` (src: raw/0001).

## Details

### Three layers (pick the headless one)

| Layer | File | UI? | Use |
|---|---|---|---|
| `Canvas3D` | `mol-canvas3d/canvas3d.ts` | none | raw WebGL core |
| `PluginContext` + `initViewerAsync` | `mol-plugin/context.ts` | **none** | **van-der-view's path** |
| `createPluginUI` / `PluginUIContext` | `mol-plugin-ui/index.ts` | full | the stock Mol* app |

```ts
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { DefaultPluginSpec } from 'molstar/lib/mol-plugin/spec';
const plugin = new PluginContext(DefaultPluginSpec());
await plugin.init();
await plugin.initViewerAsync(canvas, containerDiv); // WebGL, no React UI
```

### Load a structure

```ts
const data = await plugin.builders.data.download({ url, isBinary }, { state: { isGhost: true } });
const traj = await plugin.builders.structure.parseTrajectory(data, 'mmcif'); // 'mmcif' not 'cif'
await plugin.builders.structure.hierarchy.applyPreset(traj, 'default');
```
Formats: `mmcif`, `pdb`, `sdf`, `mol2`, `gro`, `xyz`. Convenience:
`loadStructureFromUrl(plugin, url, format, isBinary)` (src: raw/0001).

⚠️ **Replace-on-load:** for a single-structure viewer, `await plugin.clear()` **before**
loading. The hierarchy *appends* otherwise, and code that reads `…hierarchy.current.
structures[0]` would keep seeing the first structure while the new one is silently ignored.
van-der-view's adapter does `await plugin.clear()` at the top of `loadStructure`
(src: raw/0009). Inline data path: `plugin.builders.data.rawData({ data })` (src: raw/0009).

> This `parseTrajectory` path handles **self-contained** formats only (a single static
> structure, or a multi-model file). Loading a **topology + a separate coordinate stream**
> (PDB+XTC and other MD trajectories) takes a different API — see [[molstar-trajectories]].

### Select residues / chains (MolScript)

```ts
const sel = Script.getStructureSelection(Q => Q.struct.generator.atomGroups({
  'chain-test':   Q.core.rel.eq([Q.struct.atomProperty.macromolecular.auth_asym_id(), 'A']),
  'residue-test': Q.core.rel.inRange([Q.struct.atomProperty.macromolecular.auth_seq_id(), 100, 120]),
}), structure);
const loci = StructureSelection.toLociWithSourceUnits(sel); // → StructureElement.Loci
```
⚠️ `inRange` lives under `core.rel`; `auth_seq_id` (PDB numbering) ≠
`label_seq_id` (entity numbering) — choose deliberately (src: raw/0001). See
[[glossary]] for *loci*.

### Preset selections via `StructureSelectionQueries` (pure-Node) — verified

van-der-view's 7 named presets do **not** hand-roll MolScript — they reuse Mol\*'s own
built-in queries, which run in **pure Node** (no plugin/WebGL), verified against 5.10.1
(src: raw/0009):

```ts
import { StructureSelectionQueries, StructureSelection } from 'molstar/lib/mol-model/structure/query';
import { QueryContext } from 'molstar/lib/mol-model/structure';
const sel  = StructureSelectionQueries.polymer.query(new QueryContext(structure));
const loci = StructureSelection.toLociWithSourceUnits(sel);   // → StructureElement.Loci
```
Names used: `all`, `polymer`, `protein`, `nucleic`, `ligand`, `ion`, `water`. A query that
matches nothing yields an **empty** loci (the executor maps that to `empty_selection`).

### Pure-Node parse + select (no plugin, no WebGL) — verified

For tests, you can build a `Structure` and resolve a selection to loci **without any
plugin/canvas/WebGL** (`three`/`gl` not required) — verified against molstar 5.10.1
(src: raw/0007):

```ts
import { Task } from 'molstar/lib/mol-task';
import { parsePDB } from 'molstar/lib/mol-io/reader/pdb/parser';
import { trajectoryFromPDB } from 'molstar/lib/mol-model-formats/structure/pdb';
import { Structure, StructureSelection, StructureElement } from 'molstar/lib/mol-model/structure';
import { Script } from 'molstar/lib/mol-script/script';

const parsed = await parsePDB(pdb, 'id').run();
const traj = await trajectoryFromPDB(parsed.result).run();
const frame = traj.getFrameAtIndex(0);
const model = Task.is(frame) ? await frame.run() : frame;
const structure = Structure.ofModel(model);          // sync, no RuntimeContext
const sel = Script.getStructureSelection(/* builder */ , structure);
const loci = StructureSelection.toLociWithSourceUnits(sel);
```
mmCIF variant via `CIF.parse(cif).run()` → `result.blocks[0]` → `trajectoryFromMmCIF`.
`Structure.ofModel` is synchronous; avoid `Structure.ofTrajectory` (needs a
RuntimeContext). This is the basis of van-der-view's F2 selection tests ([[testing-strategy]]).

### Highlight vs. select (distinct managers)

```ts
// transient hover-style highlight — note the { loci } wrapper:
plugin.managers.interactivity.lociHighlights.highlightOnly({ loci });
plugin.managers.interactivity.lociHighlights.clearHighlights();
// persistent selection — bare loci, modifiers: add|remove|intersect|set:
plugin.managers.structure.selection.fromLoci('add', loci);
```

### Representations & color

```ts
await plugin.builders.structure.representation.addRepresentation(structure, {
  type: 'cartoon',           // cartoon|ball-and-stick|spacefill|molecular-surface|gaussian-surface
  color: 'uniform',          // uniform|chain-id|element-symbol|sequence-id
  colorParams: { value: Color(0xff0000) },
});
```
Recolor existing: `plugin.managers.structure.component.updateRepresentationsTheme(...)`.
⚠️ The manager's `applyTheme` is overpaint/transparency overlays, NOT base color
(src: raw/0001).

### Camera focus / zoom

```ts
plugin.managers.camera.focusLoci(loci); // { minRadius, extraRadius, durationMs, ... }
plugin.managers.camera.reset();
```
⚠️ `PluginCommands.Camera.Focus` is **sphere-based** (`{ center, radius }`), not
loci-based; for loci use `managers.camera.focusLoci`. `managers.structure.focus`
tracks the UI "focused" entry but does **not** move the camera (src: raw/0001).

van-der-view's `focus.zoomOut` factor maps onto `focusLoci`'s **`extraRadius`** option (not
a `zoomOut` field): `extraRadius = (zoomOut − 1) × loci.structure.boundary.sphere.radius`
widens the framed sphere proportionally to the structure's own size, so the pull-back reads
the same at any scale; `zoomOut ≤ 1`/omitted leaves the default tight fit. The framed
sphere's radius comes from `loci.structure.boundary.sphere.radius` (src: raw/0009). The
exact comfortable factor is tuned by eye in the Plan-3b demo ([[testing-strategy]]).

### Enumerate chains of a `Structure` (for `get-scene-context`)

Walk `structure.units`; per unit read the chain id off a `StructureElement.Location`. Use
**`auth_asym_id` for atomic units, `label_asym_id` for coarse units** (auth numbering isn't
defined for coarse models). A `Structure` is immutable, so this result can be memoized in a
`WeakMap<Structure, string[]>` — `get-scene-context` is hot (src: raw/0009):

```ts
import { StructureElement, StructureProperties, Unit } from 'molstar/lib/mol-model/structure';
const loc = StructureElement.Location.create(structure);
loc.unit = unit; loc.element = unit.elements[0];
const id = Unit.isAtomic(unit)
  ? StructureProperties.chain.auth_asym_id(loc)
  : StructureProperties.chain.label_asym_id(loc);
```

### Loading MVS

`loadMVS(plugin, MVSData)` applies a declarative [[molviewspec]] scene. Options:
`appendSnapshots`, `keepCamera`, `keepCameraOrientation`, `sanityChecks`, … (src: raw/0001).

### Key file map

| Thing | File |
|---|---|
| `PluginContext` | `mol-plugin/context.ts` |
| `Canvas3D` / `Canvas3D.xr` | `mol-canvas3d/canvas3d.ts` |
| camera / selection / interactivity / component managers | `mol-plugin-state/manager/...` |
| `loadMVS` / `MVSData` | `extensions/mvs/{load,mvs-data}.ts` |

## See also
- [[molviewspec]] — the declarative layer that compiles down to these APIs
- [[molstar-webxr]] — `plugin.canvas3d.xr` for XR
- [[command-schema]] — which van-der-view commands map to which call here
- [[agent-command-flow]] — the executor that invokes these calls
- [[headless-react]] — mounting this in React without SSR breakage
- [[molstar-trajectories]] — loading topology + coordinate streams (MD trajectories) + playback
- [[molstar-appearance]] — per-selection representation/color/visibility (components, transparency, color themes)

## Open questions
- Pin which Mol* `5.x` we target; verify signatures against `node_modules/molstar/lib/*.d.ts`.
  Plan 3a built/typechecked the adapter against **5.10.1** — `plugin.clear()`,
  `lociHighlights.highlightOnly({loci})`, `camera.focusLoci(loci, {durationMs, extraRadius})`,
  `loci.structure.boundary.sphere.radius`, `Unit.isAtomic`, and the
  `StructureSelectionQueries.*` presets are confirmed there (src: raw/0009).
- ✅ `colorParams:{value}` (uniform color) now **GPU-verified** via the representation cluster, along
  with `tryCreateComponentFromExpression`, `setStructureTransparency`, and the color-theme names
  (`b-factor`→`uncertainty`, `residue-index`≡`sequence-id`) — see [[molstar-appearance]] (src: raw/0014).
  `Structure.toStructureElementLoci` still confirmed via docs only.
- Real GPU-side rendering of these adapter calls is verified by hand in **Plan 3b** (the
  adapter/`createMolView` are typecheck-gated, not unit-tested — src: raw/0009).
