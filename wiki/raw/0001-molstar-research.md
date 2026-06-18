---
source_id: 0001
title: Mol* (molstar) integration research report
origin: "internal research agent — verified against github.com/molstar/molstar master (~v5.10) and molstar.org/docs"
fetched: 2026-06-18
type: research-report
supersedes: null
---

# Mol* (molstar) Integration Research Report

For building a headless, configurable React library that bridges an LLM agent to
Mol*'s 3D rendering. Verified against `github.com/molstar/molstar` `master`
branch (npm package v5.10.x) and `molstar.org/docs`. Citations use repo paths
under `https://github.com/molstar/molstar/blob/master/` or raw URLs.

## TL;DR for the architecture
- **Headless rendering exists and is officially supported.** Use
  `new PluginContext(spec)` + `initViewerAsync(canvas, container)` to render
  WebGL into your own canvas with **zero React UI**. The built-in UI
  (`createPluginUI`) is a separate, optional layer.
- **WebXR is real, official, and merged into the main repo** as of **v5.0.0
  (2025-09-28)**. There is a `plugin.canvas3d.xr` API with `request()` / `end()`
  / `isSupported` / `isPresenting`. "Toggle WebXR mode" is a first-class,
  supported command.
- **MolViewSpec (MVS)** via `loadMVS(plugin, MVSData)` is a strong fit for the
  declarative JSON command layer, with documented limits.
- Mol* is browser/WebGL-only; **must be client-only** in Next.js/Remix/TanStack
  (`'use client'`, `next/dynamic({ssr:false})`).

## 1. Architecture — Full Viewer app vs. headless

The hosted Viewer (`molstar.org/viewer/`) is the compiled output of
`src/apps/viewer/` — a full SPA with React UI. The npm `molstar` package ships
*both* the prebuilt bundle (`build/viewer/molstar.js`+`.css`) and the ES-module
library (`lib/`). `package.json` `files`: `["lib/", "build/viewer/",
"build/mvs-stories/"]`. No `main` field — import deep paths like
`molstar/lib/mol-plugin/context`.

Three layers, kept straight:

| Layer | File | React? | Built-in UI? | Renders to your canvas? |
|---|---|---|---|---|
| `Canvas3D` (raw WebGL core) | `src/mol-canvas3d/canvas3d.ts` | No | No | Yes (no plugin) |
| `PluginContext` + `initViewerAsync(canvas, container)` | `src/mol-plugin/context.ts` | **No** | **No** | **Yes** ← headless path |
| `createPluginUI` / `PluginUIContext` | `src/mol-plugin-ui/index.ts` | Yes | Yes (full) | No (creates its own DOM) |

Headless path (the one we want):
```ts
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { DefaultPluginSpec } from 'molstar/lib/mol-plugin/spec';
const plugin = new PluginContext(DefaultPluginSpec());
await plugin.init();
await plugin.initViewerAsync(canvas, containerDiv); // attaches WebGL, NO React
```
Documented at https://molstar.org/docs/plugin/instance/. The base `PluginContext`
has no React dependency; React lives only in the `PluginUIContext` subclass
(`src/mol-plugin-ui/context.ts`).

`createPluginUI` (`src/mol-plugin-ui/index.ts`) requires a `render` callback —
use `renderReact18` from `molstar/lib/mol-plugin-ui/react18`. It renders the
**full** Mol* UI into `target`.

**Important correction:** there is **no `createPlugin` (non-UI factory) export**
in current Mol* — `src/mol-plugin/index.ts` does not exist. Older tutorials
referencing `import { createPlugin } from 'molstar/lib/mol-plugin'` are outdated.
The non-React equivalent is `new PluginContext(spec)` + `initViewerAsync`. The
method is `initViewerAsync` (not `initViewer`); `mountPluginUI` is not an export
(the real factory is `createPluginUI`).

Server-side headless also exists officially: `HeadlessPluginContext`
(`src/mol-plugin/headless-plugin-context.ts`) renders in Node via the `gl`
(headless-gl) module — for batch image generation.

`Viewer` wrapper (`src/apps/viewer/app.ts`) is a thin convenience class around
`createPluginUI` (the full UI app); `Viewer.create(elementOrId, options)` +
helpers like `loadStructureFromUrl`, `loadPdb`. Config objects:
`PluginSpec`/`DefaultPluginSpec` (`src/mol-plugin/spec.ts`),
`PluginUISpec`/`DefaultPluginUISpec` (`src/mol-plugin-ui/spec.ts`).

## 2. Programmatic control API

Load a structure — canonical builder chain (`src/mol-plugin-state/builder/`):
```ts
const data = await plugin.builders.data.download({ url, isBinary }, { state: { isGhost: true } });
const traj = await plugin.builders.structure.parseTrajectory(data, 'mmcif'); // or 'pdb','sdf'...
await plugin.builders.structure.hierarchy.applyPreset(traj, 'default'); // model→structure→reps
```
Format keys (`formats/trajectory.ts`): `'mmcif'` (not `'cif'`), `'pdb'`, `'sdf'`,
`'mol2'`, `'gro'`, `'xyz'`. Higher-level: `DownloadStructure` StateAction
(`src/mol-plugin-state/actions/structure.ts`) and
`loadStructureFromUrl(plugin, url, format, isBinary)`
(`src/extensions/plugin/loaders.ts`). **Gotcha:** `representation.applyPreset`
default is `'auto'`; `'default'` only exists for the *hierarchy* preset.

Select residues/chains via MolScript (`src/mol-script/script.ts`):
```ts
const sel = Script.getStructureSelection(Q => Q.struct.generator.atomGroups({
  'chain-test':   Q.core.rel.eq([Q.struct.atomProperty.macromolecular.auth_asym_id(), 'A']),
  'residue-test': Q.core.rel.inRange([Q.struct.atomProperty.macromolecular.auth_seq_id(), 100, 120]),
}), structure);                                   // returns StructureSelection
const loci = StructureSelection.toLociWithSourceUnits(sel);  // → StructureElement.Loci
```
**Gotchas:** `inRange` is under `core.rel` (not `core.math`); `auth_seq_id` (PDB
numbering) ≠ `label_seq_id` (entity numbering) — pick deliberately.

Highlight vs select (distinct):
```ts
// transient hover-style highlight — note { loci } wrapper:
plugin.managers.interactivity.lociHighlights.highlightOnly({ loci });
plugin.managers.interactivity.lociHighlights.clearHighlights();
// persistent selection — bare loci:
plugin.managers.structure.selection.fromLoci('add', loci); // modifiers: add|remove|intersect|set
```
Files: `src/mol-plugin-state/manager/interactivity.ts`,
`manager/structure/selection.ts`.

Representations & colors (`builder/structure/representation.ts`):
```ts
await plugin.builders.structure.representation.addRepresentation(structure, {
  type: 'cartoon',          // cartoon|ball-and-stick|spacefill|molecular-surface|gaussian-surface...
  color: 'uniform',         // uniform|chain-id|element-symbol|sequence-id...
  colorParams: { value: Color(0xff0000) },  // Color from molstar/lib/mol-util/color/color
});
```
Recolor existing reps:
`plugin.managers.structure.component.updateRepresentationsTheme(components, { color, colorParams })`.
**Gotcha:** the manager's `applyTheme` is overpaint/transparency *overlays*, NOT
base color — use `updateRepresentationsTheme`.

Camera focus/zoom (`src/mol-plugin-state/manager/camera.ts`):
```ts
plugin.managers.camera.focusLoci(loci); // options on master: { minRadius, extraRadius, durationMs, zoomOut, ... }
plugin.managers.camera.reset();         // restore scene-fit view
```
**Gotcha:** `PluginCommands.Camera.Focus` (`src/mol-plugin/commands.ts`) is
**sphere-based** (`{ center: Vec3, radius }`), NOT loci-based. For loci focus,
call `managers.camera.focusLoci` directly. `plugin.managers.structure.focus`
tracks the UI "focused" entry but does NOT move the camera by itself.

## 3. WebXR / VR / AR — OFFICIAL AND MERGED (critical finding)

This contradicts the common assumption that Mol* has no WebXR. WebXR is real,
official, in the main `molstar/molstar` repo, and shipped. Evidence:

Official landing page: https://molstar.org/xr/ ("Mol* WebXR"). Quote: *"there is
no near/far clipping in XR and for performance reasons all post-processing
effects are off by default."* and *"Look for the icon in the viewport to toggle
XR mode."* Tested on **Meta Quest 3** (standalone + tethered), reported working
on **Quest 2** and **some Pico** models. **Android AR "magic window"** supported.

CHANGELOG dating (`CHANGELOG.md`):
- **v5.0.0 (2025-09-28): "Add WebXR support"** — *"Requires immersive AR/VR
  headset; Supplements non-XR: enter/exit XR anytime and see (mostly) the same
  scene; Add `Canvas3D.xr` for managing XR sessions; Add `PointerHelper` for
  rendering XR input devices; Add XR button to Viewer and Mesoscale Explorer."*
- **v5.1.2 (2025-10-25): "Support 'magic window' style AR (via WebXR)."**

Core implementation: `src/mol-canvas3d/helper/xr-manager.ts` — full `XRManager`
class (author Alexander Rose, the lead maintainer, copyright 2025-2026). Uses the
real WebXR Device API: `XRSession`, `XRReferenceSpace`, `XRRigidTransform`,
`getViewerPose`, `updateRenderState`, tracked-pointer + screen input sources,
stereo camera (`src/mol-canvas3d/camera/stereo.ts`), hand/controller pointer
rays, pinch-to-scale gestures, passthrough (AR `alpha-blend` blend mode).
Dependency `@types/webxr` is in `package.json`; `tsconfig.json` has
`"types": ["webxr","node"]`.

Public API to drive from a JSON command (`src/mol-canvas3d/canvas3d.ts`, the
`Canvas3D.xr` interface):
```ts
plugin.canvas3d.xr.request(): Promise<void>   // enter XR (must be from a user gesture)
plugin.canvas3d.xr.end(): Promise<void>        // exit XR
plugin.canvas3d.xr.isSupported: BehaviorSubject<boolean>
plugin.canvas3d.xr.isPresenting: BehaviorSubject<boolean>
plugin.canvas3d.xr.requestFailed: Subject<string>
```
The built-in UI toggle (`src/mol-plugin-ui/viewport.tsx`, `toggleXR`):
```ts
this.plugin.canvas3d.xr.isPresenting.value
  ? this.plugin.canvas3d.xr.end()
  : this.plugin.canvas3d.xr.request();
```
Config: `PluginConfig.Viewport.ShowXR` = `'auto' | 'always' | 'never'` (default
`'always'`), `src/mol-plugin/config.ts`. Tunable XR params (`XRManagerParams`):
`minTargetDistance`, `disablePostprocessing` (default true), `resolutionScale`,
`sceneRadiusInMeters`. Bindings (`DefaultXRManagerBindings`): GamepadB = exit,
GamepadA = toggle passthrough, Trigger = pinch-scale.

Key caveats / what is NOT supported:
- **`xr.request()` must be triggered by a user gesture** (WebXR security
  requirement) — the agent can't silently force entry; you need a click that
  calls it.
- In XR: **no near/far clipping**, **post-processing off by default** (perf).
- Requires a **WebXR-capable browser + headset** (or Android Chrome for AR magic
  window). `isSupported` reflects this at runtime.
- The GitHub *web UI* code search for "webxr" returns 0 results, which is
  misleading — authenticated `gh search code` and raw-file inspection confirm the
  code is present. Do not trust the web search UI's "0 results" here.
- Lower-level `XRSession` lifecycle, depth-sensing, and anchors are not exposed
  as high-level commands; work through `canvas3d.xr` (enter/exit) plus
  `XRManagerParams`.

Separately, **MolecularWebXR** (lucianosphere) is a *different, unrelated*
multiuser WebXR project — not Mol*. Don't confuse the two.

## 4. React integration & SSR

No official React component ships in `molstar`. Pattern: wrap `createPluginUI`
(full UI) or `initViewerAsync` (headless) in your own component with a ref +
`useEffect`, and **`plugin.dispose()` on unmount** (releases the WebGL context).

```tsx
'use client';
const ref = useRef<HTMLDivElement>(null);
useEffect(() => {
  let plugin; let cancelled = false;
  (async () => { /* createPluginUI({target, render: renderReact18}) OR PluginContext+initViewerAsync */ })();
  return () => { plugin?.dispose(); };
}, []);
```

SSR (Next.js/Remix/TanStack): Mol* touches `window`/`document`/WebGL — must be
client-only. Maintainer-confirmed in **issue #648**: use
`next/dynamic(() => import(...), { ssr: false })`; **do not mix CommonJS and ESM
imports**. **Issue #1693** (Next 16/Turbopack) has a working `'use client'`
snippet and a fallback: copy `node_modules/molstar/build/viewer/molstar.js` to
`/public`, load via `<Script>`, use `window.molstar`. Related: #1488/#1533
(Turbopack), #1527 (Vite + React Router). For Remix/TanStack, a `useEffect`-gated
call never runs server-side.

CSS for UI: either SCSS `import "molstar/lib/mol-plugin-ui/skin/light.scss"`
(needs SCSS toolchain) or prebuilt `import "molstar/build/viewer/molstar.css"`
(no toolchain — best for a redistributable library). Truly headless (no
`createPluginUI`) needs no UI CSS.

Community wrappers: `molstar-react` (npm v0.5.2, 2023, pinned to `molstar ^3.27`
— **stale; cleanup omits `plugin.dispose()`** — don't copy). `pdbe-molstar`
(official EMBL-EBI, actively maintained, ships a Web Component). No
`react-molstar` package exists.

## 5. MolViewSpec (MVS) — declarative command layer candidate

MVS is a viewer-independent declarative JSON tree describing a full scene.
Implementation lives in `src/extensions/mvs/`. Docs:
https://molstar.org/mol-view-spec-docs/. Spec repo: `github.com/molstar/mol-view-spec`.

Load API (`src/extensions/mvs/load.ts`):
```ts
loadMVS(plugin: PluginContext, data: MVSData, options?: MVSLoadOptions)
```
`MVSLoadOptions`: `appendSnapshots`, `keepCamera`, `keepCameraOrientation`,
`extensions`, `sanityChecks`, `sourceUrl`, `doNotReportErrors`. **Correction:**
the docs example's `{ replaceExisting: true }` is **not** a real public option —
omit it (default replaces; `appendSnapshots:true` appends). Build/parse via
`MVSData` (`src/extensions/mvs/mvs-data.ts`): `createBuilder()`, `fromMVSJ(str)`,
`toMVSJ(data)`, `toMVSX(data)` (ZIP), `isValid(data)`, `SupportedVersion: 1`.

```ts
const b = MVSData.createBuilder();
b.download({ url: '1og2.cif' }).parse({ format: 'mmcif' }).modelStructure()
 .component({ selector: 'polymer' }).representation({ type: 'cartoon' }).color({ color: 'red' });
await loadMVS(plugin, b.getState());
```

Fit assessment: good for "render this whole scene" declaratively, serializable,
validated, typed. Limits: state description, not imperative — no event handlers,
interactivity, or per-command incremental ops; closed versioned schema (v1);
coloring is single-color/annotation/palette, not arbitrary per-atom; selection is
`selector`+annotations, not the full MolScript query language. **Recommendation:**
use MVS for full-scene/snapshot commands, but for fine-grained "highlight residue
X / zoom to ligand Y" use the imperative manager APIs (section 2); `loadMVS` does
NOT cover "enter XR" (that's `canvas3d.xr`). A hybrid command layer (MVS for
scene setup + imperative managers for live interaction + `canvas3d.xr` for XR) is
the natural design.

## 6. Key types & file map

| Type / Manager | File |
|---|---|
| `PluginContext` | `src/mol-plugin/context.ts` |
| `PluginUIContext` | `src/mol-plugin-ui/context.ts` |
| `PluginSpec` / `DefaultPluginSpec` | `src/mol-plugin/spec.ts` |
| `Canvas3D`, `Canvas3DContext`, `Canvas3D.xr` | `src/mol-canvas3d/canvas3d.ts` |
| `XRManager`, `XRManagerParams` | `src/mol-canvas3d/helper/xr-manager.ts` |
| `Structure`, `StructureElement.Loci` | `src/mol-model/structure/` |
| `StructureSelection`, `StructureQuery` | `src/mol-model/structure/query/{selection,query}.ts` |
| `PluginStateObject` (SO) | `src/mol-plugin-state/objects.ts` |
| Camera manager | `src/mol-plugin-state/manager/camera.ts` |
| Selection manager | `src/mol-plugin-state/manager/structure/selection.ts` |
| Interactivity manager | `src/mol-plugin-state/manager/interactivity.ts` |
| Component (representation) manager | `src/mol-plugin-state/manager/structure/component.ts` |
| Focus manager | `src/mol-plugin-state/manager/structure/focus.ts` |
| `PluginCommands` | `src/mol-plugin/commands.ts` |
| MVS `loadMVS` / `MVSData` | `src/extensions/mvs/{load,mvs-data}.ts` |

Managers via `plugin.managers.{camera, interactivity, structure.{selection,
component, focus, hierarchy}}`; builders via `plugin.builders.{data, structure}`;
renderer via `plugin.canvas3d` (incl. `.xr`).

## Flagged / version-sensitive items
- All claims are against `master` (~v5.10). **Pin a version** and check `.d.ts`
  under `node_modules/molstar/lib/` — APIs shift between majors (`createPlugin`
  removed, `focusLoci` signature changed to options-object, MVS `replaceExisting`
  not a real option).
- `xr.request()` requires a real user gesture — the agent cannot auto-enter XR.
- GitHub web-UI code search returned 0 for "webxr" (misleading).
- `Structure.toStructureElementLoci` and the flat `colorParams:{value}` call were
  confirmed via docs/search consistency, not line-level file reads.
