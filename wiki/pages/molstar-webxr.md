---
title: Mol* WebXR support
slug: molstar-webxr
type: entity
status: stable
sources: [raw/0001-molstar-research.md, raw/0006-xr-voice-boundary-2026-06-18.md, raw/0009-plan3a-browser-runtime-core-2026-06-22.md, "https://molstar.org/xr/"]
updated: 2026-06-22
links: [molstar-api, command-schema, project-overview, testing-strategy, molstar-trajectories]
---

# Mol* WebXR support

> WebXR (VR/AR) is **official and merged into the main Mol\* repo** as of v5.0.0.
> "Toggle WebXR mode" is a first-class call — `plugin.canvas3d.xr` — not
> something van-der-view has to build.

## Key facts

- Shipped in **v5.0.0 (2025-09-28)**: *"Add WebXR support … Add `Canvas3D.xr` for
  managing XR sessions … Add XR button to Viewer."* AR "magic window" added in
  **v5.1.2 (2025-10-25)** (src: raw/0001).
- Official page: https://molstar.org/xr/. Tested on **Meta Quest 3**; reported on
  **Quest 2** and some **Pico**; Android Chrome for AR magic window (src: raw/0001).
- Implementation: `src/mol-canvas3d/helper/xr-manager.ts` (`XRManager`), using the
  real WebXR Device API (`XRSession`, `XRReferenceSpace`, stereo camera, tracked
  pointers, passthrough). `@types/webxr` is a dependency (src: raw/0001).
- ⚠️ **Not expressible in [[molviewspec]]** — MVS has no XR node. XR is driven
  only through the imperative plugin API (src: raw/0001, raw/0002).

## Details

### The API to drive

```ts
plugin.canvas3d.xr.request(): Promise<void>   // enter XR
plugin.canvas3d.xr.end(): Promise<void>        // exit XR
plugin.canvas3d.xr.isSupported: BehaviorSubject<boolean>
plugin.canvas3d.xr.isPresenting: BehaviorSubject<boolean>
plugin.canvas3d.xr.requestFailed: Subject<string>
```

The stock UI toggle is literally:
```ts
xr.isPresenting.value ? xr.end() : xr.request();
```
So van-der-view's `toggle-xr` command maps directly onto this (see [[command-schema]]).

### van-der-view's XR wrapper (Plan 3a, implemented — src: raw/0009)

`createXrApi(plugin): MolViewXR` (`src/mol/xr.ts`) is the first-class XR state/events
surface promised above — thin wrappers over `plugin.canvas3d?.xr`
(`isSupported`/`isPresenting`/`request`/`end` + a change subscription). It is **null-safe
over `canvas3d?.xr`** because the viewer can be assembled **before `initViewerAsync`**, at
which point `plugin.canvas3d` doesn't exist yet. Unit-tested with a stub plugin (the real
device path is manual, Plan 3b). ⚠️ Open: subscribing to live XR state *before*
`initViewerAsync` (canvas3d is created lazily) — today the wrappers no-op until it exists.

### Configuration

- `PluginConfig.Viewport.ShowXR` = `'auto' | 'always' | 'never'` (default `'always'`).
- `XRManagerParams`: `minTargetDistance`, `disablePostprocessing` (default `true`),
  `resolutionScale`, `sceneRadiusInMeters`.
- Default controller bindings: GamepadB = exit, GamepadA = toggle passthrough,
  Trigger = pinch-scale.

### Hard constraints (must design around)

1. **`xr.request()` requires a real user gesture** (WebXR security rule). The agent
   **cannot silently enter XR**. A `toggle-xr` command must be wired to a real
   user click — e.g. surface a button the agent can *prompt*, and call
   `xr.request()` from that click handler. This is a key design constraint for
   [[command-schema]]. (src: raw/0001)
2. In XR: **no near/far clipping**; **post-processing off by default** (perf).
3. Requires a **WebXR-capable browser + headset** (or Android Chrome AR). Gate UI
   on `xr.isSupported`.

### In-VR interaction & the voice boundary

In immersive XR the 2D DOM chat box is gone, so the user talks to the agent by
**voice**. Ownership split (src: raw/0006):

- **The consuming app owns** voice capture, STT, the agent loop, and the in-XR UX —
  voice is just another input modality for the chat (same boundary as "no chat UI").
- **van-der-view owns** only: (1) commands apply while `isPresenting` (the XR smoke in
  [[testing-strategy]]); (2) [[command-schema]]'s `get-scene-context` keeps the agent
  oriented with no DOM; (3) **first-class XR state/events** so the app can switch UI
  modality without the `viewer.plugin` escape hatch — `viewer.xr.isSupported`,
  `viewer.xr.isPresenting`, `viewer.on('xr-change', cb)` (thin wrappers over
  `canvas3d.xr`'s BehaviorSubjects).

This is mostly **free**: the executor is **input-modality-agnostic** — a `Command`
from voice is identical to one from text — so the app only needs to produce a Command
and `dispatch` it.

⚠️ **You cannot voice-*enter* VR.** `xr.request()` needs a real user gesture; a
speech result does not count. So **enter = a click** affordance (`toggle-xr {on}`),
voice drives in-headset, **exit** can be programmatic (`end()`) or GamepadB (src: raw/0006).

### Evidence note

GitHub's web-UI code search returns 0 results for "webxr" — **misleading**. The
code is present (confirmed via raw file inspection / authenticated search). Do not
conclude "Mol* has no WebXR" from the web search UI (src: raw/0001).

Also: **MolecularWebXR** (lucianosphere) is a *different, unrelated* project — not
Mol* (src: raw/0001).

## See also
- [[molstar-api]] — the broader imperative API XR lives alongside
- [[command-schema]] — how `toggle-xr` respects the user-gesture constraint
- [[project-overview]] — why native XR de-risks the project
- [[testing-strategy]] — the manual XR smoke checklist

## Open questions
- ~~How to satisfy the user-gesture rule from an agent command~~ — **decided**: enter
  = a click affordance (`toggle-xr {on}`); voice can't enter; in-VR, voice drives the
  agent which dispatches Commands (src: raw/0006).
- In-XR visual feedback HUD (3D toasts confirming a command) — deferred; the command's
  visible effect is the feedback for now (src: raw/0006).
- Lower-level XR (anchors, depth) is not exposed as high-level commands — out of scope for now?
