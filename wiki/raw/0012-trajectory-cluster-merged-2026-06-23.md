---
source_id: 0012
title: Trajectory + playback command cluster implemented, GPU-verified & merged (PR #17)
origin: "dev session 2026-06-23 (subagent-driven build + external review + GPU run)"
fetched: 2026-06-23
type: user-note
supersedes: null
---

The post-v1 **trajectory + playback command cluster** landed on `main` via PR #17
(merge commit `6700020`), GPU-verified by the user. Built brainstorm → spec
(`docs/superpowers/specs/2026-06-22-trajectory-playback-cluster-design.md`) → plan
(`docs/superpowers/plans/2026-06-22-trajectory-playback-cluster.md`) →
subagent-driven (6 tasks) → external code review → fix wave. Suite = **116 tests** green.

## What shipped

**Four commands** (appended to `VDV_COMMANDS`; auto-derived into the Anthropic tools):
- `load-trajectory { topology, coordinates }` — `topology` reuses the `load-structure`
  source schema (a shared `structureSourceSchema` const); `coordinates` is agent-facing
  **url-only** (`source:'url', url, format` ∈ `xtc|trr|dcd|nctraj`). Binary streams can't be
  text-inlined; raw bytes (`Uint8Array`) enter only via the host hook.
- `play-trajectory { fps?, loop? }` — `fps` must be a finite number > 0 (schema
  `exclusiveMinimum: 0`); rejected on a single-frame trajectory (Mol\* `canApply` needs
  `frameCount > 1`).
- `stop-trajectory {}` · `set-frame { index }` (0-based integer in `[0, frameCount)`).

**New molstar-free agent-side surface:** `COORDINATE_FORMATS`/`CoordinateFormat`,
`COORDINATE_SOURCES`/`CoordinateSource`, `CoordinatesInput` (in `src/types.ts`); and a new
`src/resolve-coordinates.ts` with `ResolvedCoordinates`, `ResolveCoordinates`,
`defaultResolveCoordinates` (url passthrough), `LoadTrajectoryInput`, `ResolvedTrajectory`.
`types.ts` stays a leaf — composite types referencing `LoadInput`/`ResolvedStructure` live in
`resolve-coordinates.ts` to avoid an import cycle.

**Host hook:** `resolveCoordinates` is symmetric with `resolveStructure` (topology reuses the
latter). Threaded `ExecutorOptions` → `CreateMolViewOptions` → `MolViewConfig` →
`<MolViewCanvas>` (the canvas hop was the H1 review bug — see below).

**Port (`ExecutorContext`) gained 4 members:** `loadTrajectory(ResolvedTrajectory)`,
`playTrajectory(PlayTrajectoryOptions)`, `stopTrajectory()`, `setFrame(index)`. `SceneContext`
gained `trajectory?: { frameCount, currentFrame, isPlaying }` — the single read-model serving
both `get-scene-context` and the executor's frame-range validation. New `ErrorCode`s:
`no_trajectory`, `trajectory_mismatch`.

**Real adapter (`src/mol/adapter.ts`, typecheck-gated + GPU-manual):** wraps
`loadTrajectory(plugin, {model, coordinates, preset:'default'})` (from
`molstar/lib/extensions/plugin/loaders`), `AnimateModelIndex` play/stop, and the
`ModelFromTrajectory.modelIndex` seek. `frameCount` is read from the parent `Trajectory` cell;
a topology/coordinate atom-count mismatch (Mol\* throws `Frame element count mismatch` at
`mol-model/.../model.js:35`) is translated to `trajectory_mismatch`.

## Testing split realized
- **Node-unit-tested via the fake port** (the bulk): all 4 dispatch paths, validation, error
  mapping, `defaultResolveCoordinates`, the catalog + Anthropic derivation.
- **Pure-Node spike** (`test/trajectory-node-spike.test.ts`): builds an in-memory `Coordinates`
  (no binary XTC fixture) and asserts `Model.trajectoryFromModelAndCoordinates` yields
  `frameCount === N` and throws on an atom-count mismatch — automated coverage of the invariant
  the `trajectory_mismatch` mapping depends on. (The Node-XTC-parse question is sidestepped.)
- **Typecheck-gated + GPU-manual:** the adapter; verified in the demo `TrajectoryPanel`.

## External code review fix wave (the real bugs)
The user ran an external review before merge. Fixed in commit `ede5b51`:
- **H1** — `<MolViewCanvas>` forwarded only `resolveStructure`, silently dropping
  `config.resolveCoordinates` at the canvas→`createMolView` hop → the new host hook was dead.
  (Missed by every per-task review because `canvas.tsx` was unchanged and outside every task's
  diff — a cross-file integration gap.)
- **H2** — `isPlaying` now read live from `plugin.managers.animation.isAnimating`
  (`= state.animationState === 'playing'`), not a local mirror, so it reads false when a
  non-looping ('once') playback ends on its own.
- **H3** — reject `fps <= 0` / non-finite (a 0 fps made Mol\* compute an infinite duration →
  frozen playback returning `ok`).
- **H4** — `setFrame` stops the animation before seeking (a running `AnimateModelIndex` tick
  otherwise recomputes the frame from elapsed time and clobbers the manual seek).
- **H5** — loads stop the animation before `plugin.clear()` (else it ticks against the cleared scene).
- **H6** — `loadTrajectory` snapshots the scene (`plugin.state.data.getSnapshot()`) before
  clearing and restores it (`setSnapshot().run()`) on a failed load — a mismatch keeps the prior
  structure instead of blanking the viewer. Failure-path only → no happy-path change.
- **M2** reject play on a 1-frame trajectory; **M5** demo slider derives from
  `scene.trajectory.currentFrame` (was a desyncing parallel state); **L6/L7** named
  `PlayTrajectoryOptions` + clamped `setFrame`.
- Adjudicated non-defects: `frameCount ?? 1` (mitigated by M2), the mismatch-regex fragility
  (accepted v1), the gro/xyz topology gap (deliberate v1 cut), assorted perf/cosmetic Lows.

## Demo serving gotcha
The `TrajectoryPanel` fetches user-supplied URLs (no bundled XTC — too large). Serving the
gitignored `MD_Data/` for the demo needs CORS: **`npx serve --cors MD_Data/5GGS`**. Plain
`npx serve` returns `200` but the browser blocks the cross-origin body → the load fails with
`internal_error: Invalid data cell` (Mol\*'s `parseTrajectory` gets an unresolvable download cell
at `mol-plugin-state/builder/structure.js:36`).
