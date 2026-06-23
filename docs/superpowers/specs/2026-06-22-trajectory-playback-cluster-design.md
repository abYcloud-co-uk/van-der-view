# Trajectory + Playback Command Cluster — Design

**Date:** 2026-06-22
**Status:** approved (brainstorm locked)
**Branch:** `feat/trajectory-cluster` (off `main`)

## Summary

The post-v1 capability that lets an AI agent load an **MD trajectory** (a topology +
a separate binary coordinate stream, e.g. the `MD_Data` PDB+XTC) and control **frame
playback**. It adds four commands to the catalog, two new port members groups (load +
playback), a second host-overridable data hook (`resolveCoordinates`) symmetric with
`resolveStructure`, and a `trajectory` read-model on `SceneContext`.

It wraps the Mol\* API verified firsthand in `wiki/pages/molstar-trajectories.md` +
`wiki/raw/0010-...` (molstar 5.10.1): the one-call `loadTrajectory(plugin, {model,
coordinates, preset})` helper, `AnimateModelIndex` playback via
`plugin.managers.animation.play(...)` / `.stop()`, and manual seek by updating the
`ModelFromTrajectory` transform's `modelIndex`. Mol\* validates atom-count match and
**throws** on mismatch (verified, `model.js:34`).

## Goal

One sentence: an agent emits `load-trajectory` / `play-trajectory` / `stop-trajectory` /
`set-frame` and the library loads a topology+coordinate trajectory into a live Mol\*
view and drives playback — staying inside the existing executor↔port architecture.

## Architecture (respect the existing seams)

- The executor drives the high-level `ExecutorContext` **port**; a real Mol\* adapter
  (`molstarExecutorContext`) **and** a test fake both implement it. Off-GPU logic is
  Node-unit-tested against the fake; GPU/plugin-bound code is typecheck-gated +
  manually verified in the demo. **This cluster keeps that line exactly.**
- Commands are `Command{name, input}` validated at the executor boundary into
  structured `CommandResult` errors; the catalog `VDV_COMMANDS` (`CommandSpec[]`)
  auto-derives the Anthropic tool schema.
- Data loading routes through host-overridable hooks. **Topology reuses the existing
  `resolveStructure`**; coordinates get a **new symmetric `resolveCoordinates`** hook.
- The agent-side barrel `src/index.ts` stays **molstar-free** (the new types, hook, and
  command specs are molstar-free); the browser barrel `src/browser.ts` is
  molstar-dependent (the real adapter additions).
- **Single-trajectory model**, mirroring the current single-structure model
  (`getStructure()` returns one). Multiple simultaneous trajectories are out of scope.

## Locked decisions (from the brainstorm)

1. **Command shape — four separate commands** (one verb per tool, matching the v1
   catalog `load-structure`/`highlight`/`focus`/`reset-camera`). Not a unified
   `playback {action}` command. Playback speed/loop ride as optional params on
   `play-trajectory`.
2. **Coordinate sourcing — a new `resolveCoordinates` hook**, symmetric with
   `resolveStructure`. Topology reuses `resolveStructure` unchanged. Not an
   extension of `resolveStructure`, not a raw-URL-only path.
3. **Testing — attempt a Node XTC spike, fall back gracefully.** One exploratory,
   **non-blocking** task tries to build a coordinate-attached trajectory model in
   pure Node (à la the raw/0007 Node-`Structure` spike) and assert `frameCount` + the
   atom-count-mismatch throw. If XTC parsing needs browser APIs, capture *why* in the
   wiki and fall back to typecheck + manual. Merge is **not** gated on the spike.

## Components

### 1. Command catalog — `src/commands.ts`

Four `CommandSpec`s appended to `VDV_COMMANDS` (→ 9 total). Agent-facing JSON schemas:

```
load-trajectory {
  topology:    <the load-structure input schema: source pdb|url|inline, id|url|data, format>,
  coordinates: { source:'url', url, format: 'xtc'|'trr'|'dcd'|'nctraj' }
}                                              // required: [topology, coordinates]

play-trajectory { fps?: number, loop?: boolean }   // required: []
stop-trajectory { }
set-frame       { index: integer ≥ 0 }             // required: [index]; 0-based seek
```

- **topology** is the *exact* `load-structure` input shape, factored into a shared
  schema fragment so a topology can come from RCSB (`pdb`), a URL, or inline text.
- **coordinates** is agent-facing **url-only**. Binary streams can't be text-inlined;
  raw bytes enter only via the host hook, never from the model.
- `play-trajectory.fps` (default applied in the adapter, e.g. 15) maps to
  `AnimateModelIndex` `duration = frameCount / fps * 1000`; `loop` (default `true`)
  maps to `mode: 'loop' | 'once'`.

### 2. Agent-side types + the coordinate hook — `src/types.ts`, new `src/resolve-coordinates.ts`

```ts
// src/types.ts (molstar-free)
export const COORDINATE_FORMATS = ['xtc', 'trr', 'dcd', 'nctraj'] as const;
export type CoordinateFormat = (typeof COORDINATE_FORMATS)[number];

export const COORDINATE_SOURCES = ['url'] as const;          // agent-facing: url only
export type CoordinateSource = (typeof COORDINATE_SOURCES)[number];

export interface CoordinatesInput { source: CoordinateSource; url?: string; format: CoordinateFormat }
export interface LoadTrajectoryInput { topology: LoadInput; coordinates: CoordinatesInput }
```

```ts
// src/resolve-coordinates.ts (molstar-free, mirrors resolve-structure.ts)
export interface ResolvedCoordinates {
  url?: string;
  data?: Uint8Array;            // bytes, supplied by a host hook (not the agent)
  format: CoordinateFormat;
  isBinary: true;
}
export type ResolveCoordinates = (i: CoordinatesInput) => Promise<ResolvedCoordinates>;
export const defaultResolveCoordinates: ResolveCoordinates;  // url passthrough + format
                                                             // validation; bad input → ResolveError
export interface ResolvedTrajectory { topology: ResolvedStructure; coordinates: ResolvedCoordinates }
```

`ExecutorOptions` gains `resolveCoordinates?: ResolveCoordinates` alongside
`resolveStructure?`; `createExecutor` defaults it to `defaultResolveCoordinates`.

### 3. Port additions — `src/context.ts`

```ts
export interface ExecutorContext {
  // ...existing 7 members...
  loadTrajectory(r: ResolvedTrajectory): Promise<void>;
  playTrajectory(o?: { fps?: number; loop?: boolean }): void;
  stopTrajectory(): void;
  setFrame(index: number): void;
}

export interface SceneContext {
  loaded: boolean;
  structures: { chains: string[] }[];
  trajectory?: { frameCount: number; currentFrame: number; isPlaying: boolean };
}
```

`SceneContext.trajectory` is the **single read model** serving both the
`get-scene-context` command *and* the executor's frame-range validation — present only
when a trajectory is loaded.

### 4. Executor dispatch + error codes — `src/executor.ts`, `src/errors.ts`

- `load-trajectory`: validate `topology` + `coordinates` objects present →
  `topology` through `resolveStructure`, `coordinates` through `resolveCoordinates` →
  `ctx.loadTrajectory({ topology, coordinates })`.
- `play-trajectory` / `stop-trajectory` / `set-frame`: guard "is a trajectory
  loaded?" via `ctx.getSceneContext().trajectory`; if absent → `no_trajectory`.
- `set-frame`: validate `index` is an integer in `[0, frameCount)` (else
  `invalid_input`) → `ctx.setFrame(index)`.
- `play-trajectory`: forward `{fps?, loop?}` to `ctx.playTrajectory()`.
- New `ErrorCode`s added to the union: **`no_trajectory`** (play/stop/seek with none
  loaded) and **`trajectory_mismatch`** (the adapter translates Mol\*'s atom-count
  throw into this). Bad frame index reuses existing `invalid_input`.

### 5. Real adapter — `src/mol/adapter.ts` (GPU/plugin-bound, typecheck-gated)

`molstarExecutorContext(plugin)` gains the 4 members:

- `loadTrajectory(r)` → `loadTrajectory(plugin, { model: <from r.topology>,
  coordinates: <from r.coordinates>, preset: 'default' })`; retains refs to the
  trajectory state objects; reads `frameCount`; catches Mol\*'s element-count-mismatch
  error and rethrows `ExecutorError('trajectory_mismatch', …)`.
- `playTrajectory(o)` → `plugin.managers.animation.play(AnimateModelIndex,
  { mode: o?.loop === false ? 'once' : 'loop', duration: fpsToDuration(o?.fps, frameCount) })`;
  sets `isPlaying = true`.
- `stopTrajectory()` → `plugin.managers.animation.stop()`; `isPlaying = false`.
- `setFrame(index)` → update the `ModelFromTrajectory` transform's `modelIndex` param
  via a state update; `currentFrame = index`.
- `getSceneContext()` → adds the `trajectory` field when a trajectory is loaded,
  reporting `frameCount / currentFrame / isPlaying`.

State tracked on the adapter: the trajectory/model state refs, `frameCount`,
`currentFrame`, `isPlaying`. All GPU-bound — verified by `tsc` + the demo.

## Data flow

```
agent tool_use
  → adapters.anthropic.toCommand → Command{name:'load-trajectory', input}
  → executor.dispatch
      topology   → resolveStructure(LoadInput)      → ResolvedStructure
      coordinates→ resolveCoordinates(CoordsInput)  → ResolvedCoordinates
      → ctx.loadTrajectory({topology, coordinates})
          (real adapter) → loadTrajectory(plugin, {model, coordinates, preset})
  → CommandResult ok | {no_trajectory|trajectory_mismatch|invalid_input}

play/stop/set-frame
  → executor.dispatch → guard getSceneContext().trajectory
  → ctx.playTrajectory / stopTrajectory / setFrame
      (real adapter) → animation.play/stop | ModelFromTrajectory.modelIndex update
```

## Error handling

| Situation | Code |
|---|---|
| play/stop/set-frame with no trajectory loaded | `no_trajectory` (new) |
| `set-frame` index non-integer / out of `[0, frameCount)` | `invalid_input` |
| topology/coordinates field missing or wrong type | `invalid_input` |
| Mol\* atom-count mismatch between topology and coordinates | `trajectory_mismatch` (new) |
| coordinate URL unresolvable / bad format | `invalid_input` via `ResolveError` |
| anything else thrown | `internal_error` |

## Testing strategy

Keeps the project line: **off-GPU automated against the fake port; GPU manual.**

**Node-unit-tested (fake port — the bulk, gates each task):**
- All 4 dispatch paths: routing to the right port member, input validation, the
  `no_trajectory` guard, `set-frame` range + integer validation, and error-mapping
  (a fake that rejects `loadTrajectory` with `ExecutorError('trajectory_mismatch')`
  asserts the executor surfaces that code). Extends `fakeContext` in
  `test/executor.test.ts` with the 4 new members + a `trajectory` scene field.
- `defaultResolveCoordinates`: url passthrough, format validation, `isBinary:true`,
  bad input → `ResolveError`.
- Catalog: `VDV_COMMANDS` contains the 4 specs; Anthropic `toTools` derives them;
  `toCommand` round-trips a `load-trajectory` tool_use (`test/commands.test.ts`,
  `test/adapters`).
- `SceneContext.trajectory` shape via the fake.

**Typecheck-gated + manual (GPU-bound):** the real adapter's 4 members, eyeballed in
the demo. No automated WebGL.

**Exploratory, non-blocking (decision 3):** `test/trajectory-node-spike.test.ts` —
attempt to build a coordinate-attached trajectory model in pure Node from PDB+XTC
bytes and assert `frameCount` + the mismatch throw. If Node can't parse XTC, document
the finding (wiki) and drop the spike; **merge is not gated on it.**

**Demo (manual verification layer):** a new `TrajectoryPanel` in `examples/demo/`:
topology + coordinates URL inputs (+ format), Load / Play / Stop buttons, a frame
slider (→ `set-frame`), and a `frameCount / currentFrame / isPlaying` readout from
`get-scene-context`. Can't bundle a ~5 GB XTC, so it takes **user-supplied URLs**
(serve `MD_Data/` locally) with a `CHECKLIST.md` note. The `MD_Data` chain-ID mismatch
(`*_interactions.json` antigen `Z` vs nowat viewer files antigen `A`) is documented as
a *data* caveat in the demo, not a library concern.

## Out of scope (the cut)

Palindrome animation mode; frame-range trimming / sub-selection; multiple
simultaneous trajectories; in-XR playback; agent-facing inline/base64 coordinates;
per-frame selection scoping; coordinate-format auto-detection. These are future
iterations, not this cluster.

## Post-merge (mirrors the Plan 2/3a pattern)

Wiki + docs sync: a `raw/00NN` landing note; update `command-schema` (4 new commands),
`agent-command-flow` (new port members + `resolveCoordinates`), `molstar-trajectories`
(link the now-realized commands), `testing-strategy` (the new split), and
`project-overview`/`index.md` status; update the roadmap memory. Reconcile the
pre-existing open PR #11 (`feat/command-expansion`) afterward.

## Open questions

- Does Mol\*'s XTC parser run in pure Node? (Resolved empirically by the spike task.)
- `play-trajectory` default fps and whether `loop` defaults to `true` — tuned by eye
  in the demo (camera-feel parity with how `focus.zoomOut` was tuned in Plan 3b).
- Exact `ModelFromTrajectory` state-update call signature for `set-frame` — confirmed
  against `.d.ts` during the adapter task.
