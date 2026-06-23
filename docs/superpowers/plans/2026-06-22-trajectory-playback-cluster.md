# Trajectory + Playback Command Cluster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an AI agent load an MD trajectory (a topology + a separate binary coordinate stream) into a live Mol\* view and control frame playback, via four new commands inside the existing executor↔port architecture.

**Architecture:** Four `CommandSpec`s are appended to `VDV_COMMANDS`; the executor validates and routes them to four new `ExecutorContext` port members, which a real Mol\* adapter (`molstarExecutorContext`) and the test fake both implement. The topology reuses the existing `resolveStructure` hook; the coordinate stream gets a new symmetric `resolveCoordinates` hook. `SceneContext` gains a `trajectory` read-model. Off-GPU logic is Node-unit-tested against the fake port; the GPU/plugin-bound adapter is typecheck-gated and manually verified in the demo.

**Tech Stack:** TypeScript, Vitest (node env), molstar 5.10.1 (`loadTrajectory`, `AnimateModelIndex`, `ModelFromTrajectory`), React (demo only).

## Global Constraints

- **The agent-side barrel `src/index.ts` stays molstar-free.** New types, the `resolveCoordinates` hook, and the command specs are molstar-free and reachable from `src/index.ts` via the existing `export * from './types'` (for `types.ts` additions). molstar-dependent code lives behind `src/browser.ts`.
- **`src/types.ts` is a leaf module** — it must NOT import from `resolve-structure.ts`/`resolve-coordinates.ts` (that creates an import cycle, since those import from `types.ts`). Composite types referencing `LoadInput`/`ResolvedStructure` live in `resolve-coordinates.ts`.
- **Testing line:** off-GPU/off-DOM logic is automated in Node against the fake port; GPU/plugin-bound code (the real adapter, the demo) is typecheck-gated + manually verified. Never add an automated test that needs a WebGL context.
- **Command contract:** every command is `Command { name, input }`, validated at the executor boundary into a structured `CommandResult` (`ok` / `{ ok:false, error:{ code, message } }`). `VDV_COMMANDS` auto-derives the Anthropic tools via the existing adapter — no adapter changes needed.
- **Single-trajectory model** — one trajectory at a time, mirroring the single-structure model. No multi-trajectory bookkeeping.
- **Coordinates are agent-facing url-only** (`COORDINATE_SOURCES = ['url']`); raw bytes (`Uint8Array`) enter only via a host `resolveCoordinates` override, never from the model.
- **New error codes:** `no_trajectory` and `trajectory_mismatch`, added to the `ErrorCode` union in `src/errors.ts`.
- **molstar is pinned at 5.10.1.** The verified API: `loadTrajectory(plugin, { model, coordinates, preset:'default' })` from `molstar/lib/extensions/plugin/loaders` returns `{ model, coords, preset }` where `preset.model` is the `ModelFromTrajectory` node; playback via `plugin.managers.animation.play(AnimateModelIndex, {...})` / `.stop()`; manual seek by updating the `ModelFromTrajectory` transform's `modelIndex`. Atom-count mismatch throws `Frame element count mismatch, got X but expected Y` (`mol-model/structure/model/model.js:35`).
- **Do not break the existing suite** (90 tests green) or `pnpm typecheck`. Never `git add -A`/`git add .` — stage only the files each task names (`.DS_Store`, `MD_Data/` are untracked and must stay so).
- DRY, YAGNI, TDD, frequent commits.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/types.ts` (modify) | leaf molstar-free types: `COORDINATE_FORMATS`/`CoordinateFormat`, `COORDINATE_SOURCES`/`CoordinateSource`, `CoordinatesInput` | 1 |
| `src/resolve-coordinates.ts` (create) | `ResolvedCoordinates`, `ResolveCoordinates`, `defaultResolveCoordinates`, `LoadTrajectoryInput`, `ResolvedTrajectory` | 1 |
| `test/resolve-coordinates.test.ts` (create) | unit tests for `defaultResolveCoordinates` | 1 |
| `src/commands.ts` (modify) | extract a shared structure-source schema; append 4 trajectory `CommandSpec`s | 2 |
| `test/commands.test.ts` (modify) | catalog assertions for the 4 new commands | 2 |
| `src/errors.ts` (modify) | add `no_trajectory`, `trajectory_mismatch` to `ErrorCode` | 3 |
| `src/context.ts` (modify) | 4 new port members + `SceneContext.trajectory` | 3 |
| `src/mol/adapter.ts` (modify) | real Mol\* impl of the 4 port members (typecheck-gated) | 3 |
| `test/executor.test.ts` (modify) | extend the fake port (T3); dispatch/validation/error tests (T4) | 3, 4 |
| `src/executor.ts` (modify) | dispatch + validation for the 4 commands; `resolveCoordinates` option | 4 |
| `src/mol/create-mol-view.ts` (modify) | thread `resolveCoordinates` into `createExecutor` | 4 |
| `src/react/provider.tsx` (modify) | `MolViewConfig` picks up `resolveCoordinates` | 4 |
| `test/fixtures/structures.ts` (modify) | export `buildModelFromPDB` (refactor of existing helper) | 5 |
| `test/trajectory-node-spike.test.ts` (create) | pure-Node `frameCount` + mismatch-throw spike (non-blocking) | 5 |
| `examples/demo/src/panels/TrajectoryPanel.tsx` (create) | manual demo panel | 6 |
| `examples/demo/src/App.tsx` (modify) | mount the panel | 6 |
| `examples/demo/CHECKLIST.md` (modify) | trajectory manual-smoke steps | 6 |

**Task order & dependencies:** 1 (types+hook) → 2 (catalog) → 3 (port + real adapter + fake, all green together) → 4 (executor dispatch + wiring, consumes the port from 3) → 5 (spike, independent) → 6 (demo, consumes all). The port interface and its two implementations (real adapter + test fake) move together in Task 3 so `pnpm typecheck` and `pnpm test` are both green at every task boundary. Tasks 2 and 5 are independent of each other and of 3/4 except as noted.

---

### Task 1: Coordinate types + `resolveCoordinates` hook

**Files:**
- Modify: `src/types.ts` (append a new section after the `STRUCTURE_FORMATS` block, before the `// ── Command specs` section ~line 60)
- Create: `src/resolve-coordinates.ts`
- Test: `test/resolve-coordinates.test.ts`

**Interfaces:**
- Consumes: `LoadInput`, `ResolvedStructure` from `src/resolve-structure.ts`; `ResolveError` from `src/errors.ts`.
- Produces:
  - `src/types.ts`: `COORDINATE_FORMATS = ['xtc','trr','dcd','nctraj'] as const`; `type CoordinateFormat`; `COORDINATE_SOURCES = ['url'] as const`; `type CoordinateSource`; `interface CoordinatesInput { source: CoordinateSource; url?: string; format: CoordinateFormat }`.
  - `src/resolve-coordinates.ts`: `interface ResolvedCoordinates { url?: string; data?: Uint8Array; format: CoordinateFormat; isBinary: true }`; `type ResolveCoordinates = (input: CoordinatesInput) => Promise<ResolvedCoordinates>`; `const defaultResolveCoordinates: ResolveCoordinates`; `interface LoadTrajectoryInput { topology: LoadInput; coordinates: CoordinatesInput }`; `interface ResolvedTrajectory { topology: ResolvedStructure; coordinates: ResolvedCoordinates }`.

- [ ] **Step 1: Write the failing test** — create `test/resolve-coordinates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ResolveError } from '../src/errors';
import { defaultResolveCoordinates } from '../src/resolve-coordinates';

describe('defaultResolveCoordinates', () => {
  it('passes a coordinate url through with its format and isBinary', async () => {
    expect(
      await defaultResolveCoordinates({ source: 'url', url: 'https://x/c.xtc', format: 'xtc' }),
    ).toEqual({ url: 'https://x/c.xtc', format: 'xtc', isBinary: true });
  });

  it('accepts every supported coordinate format', async () => {
    for (const format of ['xtc', 'trr', 'dcd', 'nctraj'] as const) {
      const r = await defaultResolveCoordinates({ source: 'url', url: 'https://x/c', format });
      expect(r).toEqual({ url: 'https://x/c', format, isBinary: true });
    }
  });

  it('rejects a url source without a url', async () => {
    await expect(defaultResolveCoordinates({ source: 'url', format: 'xtc' })).rejects.toThrow(ResolveError);
  });

  it('rejects an unknown source', async () => {
    await expect(
      defaultResolveCoordinates({ source: 'file', url: 'x', format: 'xtc' } as any),
    ).rejects.toThrow(ResolveError);
  });

  it('rejects an invalid format value', async () => {
    await expect(
      defaultResolveCoordinates({ source: 'url', url: 'https://x/c', format: 'pdb' } as any),
    ).rejects.toThrow(ResolveError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test resolve-coordinates`
Expected: FAIL — `Failed to resolve import "../src/resolve-coordinates"` (module does not exist yet).

- [ ] **Step 3: Add the leaf types to `src/types.ts`**

Insert this block immediately after the `STRUCTURE_FORMATS` block (after line 58, before `// ── Command specs + JSON Schema ──`):

```ts
// ── Trajectory coordinates (load-trajectory) ────────────────────────────────

/** Binary per-frame coordinate stream formats van-der-view loads, paired with a topology. */
export const COORDINATE_FORMATS = ['xtc', 'trr', 'dcd', 'nctraj'] as const;
export type CoordinateFormat = (typeof COORDINATE_FORMATS)[number];

/**
 * Where load-trajectory pulls a coordinate stream from. Agent-facing: url only — binary
 * streams can't be text-inlined; raw bytes arrive via a host resolveCoordinates override.
 */
export const COORDINATE_SOURCES = ['url'] as const;
export type CoordinateSource = (typeof COORDINATE_SOURCES)[number];

/** Normalized "coordinates" field of the load-trajectory command. */
export interface CoordinatesInput {
  source: CoordinateSource;
  url?: string;
  format: CoordinateFormat;
}
```

- [ ] **Step 4: Create `src/resolve-coordinates.ts`**

```ts
import type { CoordinatesInput } from './types';
import { COORDINATE_FORMATS } from './types';
import type { LoadInput, ResolvedStructure } from './resolve-structure';
import { ResolveError } from './errors';

/** What a coordinate resolver returns: a URL or raw bytes, plus the format. Always binary. */
export interface ResolvedCoordinates {
  url?: string;
  data?: Uint8Array;
  format: CoordinatesInput['format'];
  isBinary: true;
}

/** Host-overridable hook turning a CoordinatesInput into a fetchable stream (auth/S3/bytes). */
export type ResolveCoordinates = (input: CoordinatesInput) => Promise<ResolvedCoordinates>;

/** The agent-facing inputs to a trajectory load: a topology + a coordinate stream. */
export interface LoadTrajectoryInput {
  topology: LoadInput;
  coordinates: CoordinatesInput;
}

/** The fully-resolved inputs handed to the adapter's loadTrajectory. */
export interface ResolvedTrajectory {
  topology: ResolvedStructure;
  coordinates: ResolvedCoordinates;
}

/** Require a non-empty string field; input is unvalidated JSON, so guard the type too. */
const requireString = (value: unknown, message: string): string => {
  if (typeof value !== 'string' || value.length === 0) throw new ResolveError('invalid_input', message);
  return value;
};

/** Default resolver: pass a coordinate URL through with its (validated) format. */
export const defaultResolveCoordinates: ResolveCoordinates = async (input) => {
  if (!COORDINATE_FORMATS.includes(input.format)) {
    throw new ResolveError(
      'invalid_input',
      `load-trajectory coordinates "format" must be one of ${COORDINATE_FORMATS.join(', ')}.`,
    );
  }
  switch (input.source) {
    case 'url':
      return {
        url: requireString(input.url, 'load-trajectory coordinates source "url" requires a non-empty string "url".'),
        format: input.format,
        isBinary: true,
      };
    default:
      throw new ResolveError('invalid_input', `unknown load-trajectory coordinates source "${String(input.source)}".`);
  }
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test resolve-coordinates`
Expected: PASS — 5 tests pass.

- [ ] **Step 6: Run the full gate**

Run: `pnpm test && pnpm typecheck`
Expected: all green (90 existing + 5 new = 95 tests), typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/resolve-coordinates.ts test/resolve-coordinates.test.ts
git commit -m "feat: coordinate types + resolveCoordinates hook"
```

---

### Task 2: Command catalog — 4 trajectory commands

**Files:**
- Modify: `src/commands.ts`
- Test: `test/commands.test.ts`

**Interfaces:**
- Consumes: `COORDINATE_FORMATS`, `COORDINATE_SOURCES` from `src/types.ts` (Task 1); existing `LOAD_SOURCES`, `STRUCTURE_FORMATS`, `deepFreeze`.
- Produces: `VDV_COMMANDS` now contains `load-trajectory`, `play-trajectory`, `stop-trajectory`, `set-frame`. Input shapes: `load-trajectory { topology:<structure source schema>, coordinates:{ source, url, format } }` (required `topology`,`coordinates`); `play-trajectory { fps?:number, loop?:boolean }`; `stop-trajectory {}`; `set-frame { index:integer }` (required `index`).

- [ ] **Step 1: Write the failing tests** — append to `test/commands.test.ts`. First, update the existing "contains exactly the v1 commands" test (lines 6-15) to the new full set:

```ts
  it('contains the v1 commands plus the trajectory cluster', () => {
    const names = VDV_COMMANDS.map((c) => c.name).sort();
    expect(names).toEqual([
      'focus',
      'get-scene-context',
      'highlight',
      'load-structure',
      'load-trajectory',
      'play-trajectory',
      'reset-camera',
      'set-frame',
      'stop-trajectory',
    ]);
  });
```

Then add a new `describe` block at the end of the file (before the final closing — it is its own top-level `describe`):

```ts
describe('VDV_COMMANDS — trajectory cluster', () => {
  const byName = (n: string) => VDV_COMMANDS.find((c) => c.name === n);

  it('requires topology and coordinates on load-trajectory', () => {
    const cmd = byName('load-trajectory');
    expect(cmd?.inputSchema.required).toEqual(['topology', 'coordinates']);
  });

  it('reuses the structure source shape for the topology and derives coordinate enums', () => {
    const cmd = byName('load-trajectory');
    const props = cmd?.inputSchema.properties as {
      topology: { properties: { source: { enum: string[] } } };
      coordinates: { properties: { source: { enum: string[] }; format: { enum: string[] } } };
    };
    expect(props.topology.properties.source.enum).toEqual([...LOAD_SOURCES]);
    expect(props.coordinates.properties.source.enum).toEqual([...COORDINATE_SOURCES]);
    expect(props.coordinates.properties.format.enum).toEqual([...COORDINATE_FORMATS]);
  });

  it('requires index on set-frame', () => {
    expect(byName('set-frame')?.inputSchema.required).toEqual(['index']);
  });

  it('gives play-trajectory optional fps/loop and no required fields', () => {
    const cmd = byName('play-trajectory');
    expect(cmd?.inputSchema.required ?? []).toEqual([]);
    expect(cmd?.inputSchema.properties).toHaveProperty('fps');
    expect(cmd?.inputSchema.properties).toHaveProperty('loop');
  });

  it('freezes the new command schemas against mutation', () => {
    expect(Object.isFrozen(byName('load-trajectory')?.inputSchema)).toBe(true);
  });
});
```

Update the imports at the top of `test/commands.test.ts` (line 3) to add the coordinate consts:

```ts
import { COORDINATE_FORMATS, COORDINATE_SOURCES, LOAD_SOURCES, NUMBERINGS, SELECTION_PRESETS } from '../src/types';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test commands`
Expected: FAIL — the "contains" test fails (only 5 names present) and the new `describe` fails (`load-trajectory` not found → `cmd` is `undefined`).

- [ ] **Step 3: Refactor the shared structure-source schema in `src/commands.ts`**

Replace the `load-structure` command object (lines 42-62) so its inline `inputSchema` becomes a named const reused by the topology. Add this const directly after `selectionSchema` (after line 35):

```ts
/** JSON Schema fragment for a structure source (shared by load-structure + load-trajectory topology). */
const structureSourceSchema = {
  type: 'object',
  properties: {
    source: { type: 'string', enum: [...LOAD_SOURCES], description: 'Where to load from.' },
    id: { type: 'string', description: 'PDB id, when source is "pdb" (e.g. "1CRN").' },
    url: { type: 'string', description: 'Structure URL, when source is "url".' },
    data: { type: 'string', description: 'Raw structure text, when source is "inline".' },
    format: {
      type: 'string',
      enum: [...STRUCTURE_FORMATS],
      default: 'mmcif',
      description: 'File format (default mmcif).',
    },
  },
  required: ['source'],
  additionalProperties: false,
} as const;

/** JSON Schema fragment for a binary coordinate stream (load-trajectory). */
const coordinatesSchema = {
  type: 'object',
  description: 'A binary per-frame coordinate stream (XTC/TRR/DCD/NCTRAJ) paired with the topology.',
  properties: {
    source: { type: 'string', enum: [...COORDINATE_SOURCES], description: 'Where to load coordinates from (url only).' },
    url: { type: 'string', description: 'Coordinate file URL.' },
    format: { type: 'string', enum: [...COORDINATE_FORMATS], description: 'Coordinate stream format.' },
  },
  required: ['source', 'url', 'format'],
  additionalProperties: false,
} as const;
```

Update the import at the top of `src/commands.ts` (line 2) to include the coordinate consts:

```ts
import { COORDINATE_FORMATS, COORDINATE_SOURCES, LOAD_SOURCES, NUMBERINGS, SELECTION_PRESETS, STRUCTURE_FORMATS } from './types';
```

Then change the `load-structure` entry to use the shared const (replace its `inputSchema: { ... }` block with):

```ts
  {
    name: 'load-structure',
    description: 'Load a molecular structure into the viewer by PDB id, URL, or inline text.',
    inputSchema: structureSourceSchema,
  },
```

- [ ] **Step 4: Append the 4 trajectory commands**

Add these four objects to the `VDV_COMMANDS` array, after the `reset-camera` entry (after line 100, inside the `deepFreeze<CommandSpec[]>([ ... ])` array):

```ts
  {
    name: 'load-trajectory',
    description:
      'Load an MD trajectory: a topology (model) plus a separate binary coordinate stream (XTC/TRR/DCD/NCTRAJ). Use this, not load-structure, when you have a coordinate file to animate.',
    inputSchema: {
      type: 'object',
      properties: {
        topology: structureSourceSchema,
        coordinates: coordinatesSchema,
      },
      required: ['topology', 'coordinates'],
      additionalProperties: false,
    },
  },
  {
    name: 'play-trajectory',
    description: 'Start animating the loaded trajectory (loops by default).',
    inputSchema: {
      type: 'object',
      properties: {
        fps: { type: 'number', description: 'Target frames per second (default ~30).' },
        loop: { type: 'boolean', description: 'Loop continuously (true, default) or play once (false).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'stop-trajectory',
    description: 'Stop trajectory animation.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'set-frame',
    description: 'Jump the loaded trajectory to a specific 0-based frame index.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'integer', description: '0-based frame index (0 .. frameCount-1).' },
      },
      required: ['index'],
      additionalProperties: false,
    },
  },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test commands`
Expected: PASS — all command-catalog tests pass, including the updated "contains" test and the new trajectory `describe`.

- [ ] **Step 6: Run the full gate**

Run: `pnpm test && pnpm typecheck`
Expected: all green (the Anthropic adapter auto-derives the 4 new tools; `test/adapters` stays green with no changes). typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/commands.ts test/commands.test.ts
git commit -m "feat: add trajectory cluster to the command catalog"
```

---

### Task 3: Port members + `SceneContext.trajectory` + real Mol\* adapter (typecheck-gated)

**Files:**
- Modify: `src/errors.ts`, `src/context.ts`, `src/mol/adapter.ts`
- Modify: `test/executor.test.ts` (extend the fake port only — no new tests this task)

**Interfaces:**
- Consumes: `ResolvedTrajectory` (resolve-coordinates, Task 1); `ResolvedStructure` (resolve-structure); molstar `loadTrajectory`, `AnimateModelIndex`, `ModelFromTrajectory`, `Trajectory`, `LoadTrajectoryParams`; existing `ExecutorError`.
- Produces:
  - `src/errors.ts`: `ErrorCode` union gains `'no_trajectory' | 'trajectory_mismatch'`.
  - `src/context.ts`: `ExecutorContext` gains `loadTrajectory(r: ResolvedTrajectory): Promise<void>`, `playTrajectory(o?: { fps?: number; loop?: boolean }): void`, `stopTrajectory(): void`, `setFrame(index: number): void`. `SceneContext` gains `trajectory?: { frameCount: number; currentFrame: number; isPlaying: boolean }`.
  - `src/mol/adapter.ts`: `molstarExecutorContext` satisfies the full extended `ExecutorContext`.

> **Why these move together:** adding the 4 members to the `ExecutorContext` interface breaks every implementer until it's updated. The real adapter (typecheck-gated) and the test fake (type-satisfying) are both updated in this task, so `pnpm typecheck` and `pnpm test` are both green at the task boundary. The adapter is GPU/plugin-bound — **confirm the state-builder call chain against the molstar `.d.ts` as you go** (`node_modules/molstar/lib/extensions/plugin/loaders.d.ts`, `.../mol-plugin-state/transforms/model.d.ts`, `.../animation/built-in/model-index.d.ts`); the code below is written against molstar 5.10.1 and should compile, but adjust call shapes if the published types differ — the binding contract is the `ExecutorContext` port, verified at runtime in Task 6's demo.

- [ ] **Step 1: Add the error codes** — in `src/errors.ts`, extend the `ErrorCode` union (after `'empty_selection'`, line 12):

```ts
export type ErrorCode =
  | 'invalid_input'
  | 'invalid_selection'
  | 'unsupported_selection' // reserved; retained for API compatibility (no longer thrown in v1)
  | 'no_structure'
  | 'no_trajectory'
  | 'trajectory_mismatch'
  | 'empty_selection'
  | 'unknown_command'
  | 'internal_error';
```

- [ ] **Step 2: Extend the port + scene context** — in `src/context.ts`, add the import and the new members:

At the top (after line 2), import the resolved-trajectory type:

```ts
import type { ResolvedTrajectory } from './resolve-coordinates';
```

Extend `SceneContext` (replace the interface body, lines 12-15):

```ts
export interface SceneContext {
  loaded: boolean;
  structures: { chains: string[] }[];
  /** Present only when a trajectory is loaded (the single read-model for playback state). */
  trajectory?: { frameCount: number; currentFrame: number; isPlaying: boolean };
}
```

Extend `ExecutorContext` (add the four members after `getSceneContext(): SceneContext;`, line 28):

```ts
  loadTrajectory(resolved: ResolvedTrajectory): Promise<void>;
  playTrajectory(options?: { fps?: number; loop?: boolean }): void;
  stopTrajectory(): void;
  setFrame(index: number): void;
```

- [ ] **Step 3: Extend the test fake so existing tests still compile** — in `test/executor.test.ts`, replace the `fakeContext` function (lines 12-25) so the fake satisfies the now-extended `ExecutorContext` (the 4 members are no-op mocks; behavioural tests come in Task 4):

```ts
function fakeContext(overrides: Partial<ExecutorContext> = {}) {
  const scene: SceneContext = { loaded: true, structures: [{ chains: ['A', 'B'] }] };
  const ctx: ExecutorContext = {
    getStructure: () => structure,
    loadStructure: vi.fn(async () => {}),
    highlight: vi.fn((_loci: SE.Loci) => {}),
    clearHighlight: vi.fn(),
    focus: vi.fn((_loci: SE.Loci) => {}),
    resetCamera: vi.fn(),
    getSceneContext: () => scene,
    loadTrajectory: vi.fn(async () => {}),
    playTrajectory: vi.fn(),
    stopTrajectory: vi.fn(),
    setFrame: vi.fn(),
    ...overrides,
  };
  return ctx;
}
```

- [ ] **Step 4: Implement the 4 members in the real adapter `src/mol/adapter.ts`.**

Add imports (after the existing molstar imports, lines 1-5):

```ts
import { loadTrajectory as loadMolstarTrajectory } from 'molstar/lib/extensions/plugin/loaders';
import { ModelFromTrajectory } from 'molstar/lib/mol-plugin-state/transforms/model';
import { AnimateModelIndex } from 'molstar/lib/mol-plugin-state/animation/built-in/model-index';
import type { Trajectory } from 'molstar/lib/mol-model/structure';
import type { LoadTrajectoryParams } from 'molstar/lib/extensions/plugin/loaders';
import type { ResolvedTrajectory } from '../resolve-coordinates';
import { ExecutorError } from '../errors';
```

(`ResolvedStructure` is already imported on line 5; reuse it for the model mapper.)

Inside `molstarExecutorContext`, add closure state + helpers above the `return {` (after the `getStructure` const, line 40):

```ts
  /** Tracks the one loaded trajectory: the ModelFromTrajectory node ref + frame metadata. */
  let traj: { modelRef: string; frameCount: number; isPlaying: boolean } | undefined;

  const toModelParam = (t: ResolvedStructure): LoadTrajectoryParams['model'] =>
    t.url !== undefined
      ? { kind: 'model-url', url: t.url, format: t.format, isBinary: t.isBinary }
      : { kind: 'model-data', data: t.data!, format: t.format };

  const toCoordsParam = (c: ResolvedTrajectory['coordinates']): LoadTrajectoryParams['coordinates'] =>
    c.url !== undefined
      ? { kind: 'coordinates-url', url: c.url, format: c.format, isBinary: true }
      : { kind: 'coordinates-data', data: c.data!, format: c.format };
```

In `loadStructure`, clear trajectory state on a fresh structure load — add as the first line of the method body (the method already calls `plugin.clear()`):

```ts
      traj = undefined;
```

Add the four members to the returned object (after `getSceneContext`'s closing, inside the `return { ... }`):

```ts
    async loadTrajectory(resolved: ResolvedTrajectory): Promise<void> {
      await plugin.clear();
      traj = undefined;
      let result;
      try {
        result = await loadMolstarTrajectory(plugin, {
          model: toModelParam(resolved.topology),
          coordinates: toCoordsParam(resolved.coordinates),
          preset: 'default',
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Mol* throws "Frame element count mismatch, got X but expected Y" when the
        // topology and coordinate atom counts disagree (mol-model/.../model.js:35).
        if (/element count mismatch/i.test(msg)) throw new ExecutorError('trajectory_mismatch', msg);
        throw e; // executor maps unknown throws to internal_error
      }
      const modelRef = result.preset.model.ref;
      const modelCell = plugin.state.data.cells.get(modelRef);
      const trajRef = modelCell?.transform.parent;
      const trajData = trajRef
        ? (plugin.state.data.cells.get(trajRef)?.obj?.data as Trajectory | undefined)
        : undefined;
      traj = { modelRef, frameCount: trajData?.frameCount ?? 1, isPlaying: false };
    },

    playTrajectory(options) {
      if (!traj) return;
      traj.isPlaying = true;
      void plugin.managers.animation.play(AnimateModelIndex, {
        mode:
          options?.loop === false
            ? { name: 'once', params: { direction: 'forward' } }
            : { name: 'loop', params: { direction: 'forward' } },
        duration: { name: 'computed', params: { targetFps: options?.fps ?? 30 } },
      });
    },

    stopTrajectory() {
      if (!traj) return;
      traj.isPlaying = false;
      void plugin.managers.animation.stop();
    },

    setFrame(index) {
      if (!traj) return;
      // Update the ModelFromTrajectory transform's modelIndex (the same param AnimateModelIndex drives).
      void plugin.build().to(traj.modelRef).update(ModelFromTrajectory, (old) => ({ ...old, modelIndex: index })).commit();
    },
```

Update `getSceneContext` to report the trajectory read-model. Replace its `return { ... }` (lines 87-93) with:

```ts
      const base = {
        loaded: structures.length > 0,
        structures: structures
          .map((ref) => ref.cell.obj?.data)
          .filter((s): s is Structure => s !== undefined)
          .map((s) => ({ chains: chainsOf(s) })),
      };
      if (!traj) return base;
      const modelCell = plugin.state.data.cells.get(traj.modelRef);
      const currentFrame =
        (modelCell?.transform.params as { modelIndex?: number } | undefined)?.modelIndex ?? 0;
      return { ...base, trajectory: { frameCount: traj.frameCount, currentFrame, isPlaying: traj.isPlaying } };
```

- [ ] **Step 5: Run the full gate**

Run: `pnpm typecheck && pnpm test`
Expected: **both green.** typecheck clean (the adapter satisfies the extended `ExecutorContext`; the fake satisfies it too). All existing tests pass (95 from Tasks 1-2; the new port members are exercised only in Task 4, but the fake/adapter must type-check now). No new automated tests this task — the adapter is GPU-bound (verified manually in Task 6).

- [ ] **Step 6: Commit**

```bash
git add src/errors.ts src/context.ts src/mol/adapter.ts test/executor.test.ts
git commit -m "feat: trajectory port members + real Mol* adapter"
```

---

### Task 4: Executor dispatch + `resolveCoordinates` wiring

**Files:**
- Modify: `src/executor.ts`, `src/mol/create-mol-view.ts`, `src/react/provider.tsx`
- Test: `test/executor.test.ts` (add the trajectory dispatch tests)

**Interfaces:**
- Consumes: `CoordinatesInput` (types, Task 1); `LoadInput` (resolve-structure); `ResolveCoordinates`, `defaultResolveCoordinates` (resolve-coordinates, Task 1); the `ExecutorContext`/`SceneContext` extensions + the extended fake (Task 3); existing `ExecutorError`, `isPlainObject`.
- Produces: `ExecutorOptions` gains `resolveCoordinates?: ResolveCoordinates`; `dispatch` handles the 4 new command names; `CreateMolViewOptions`/`MolViewConfig` accept `resolveCoordinates`.

- [ ] **Step 1: Write the failing executor tests** — in `test/executor.test.ts`, add `ExecutorError` to the imports at the top:

```ts
import { ExecutorError } from '../src/errors';
```

Add a `trajectoryScene` helper directly after the `fakeContext` function:

```ts
/** A scene whose getSceneContext reports a loaded trajectory of `frameCount` frames. */
function trajectoryScene(frameCount: number): SceneContext {
  return { loaded: true, structures: [{ chains: ['A'] }], trajectory: { frameCount, currentFrame: 0, isPlaying: false } };
}
```

Add a new top-level `describe` block at the end of the file:

```ts
describe('createExecutor — trajectory cluster', () => {
  it('resolves topology + coordinates and calls loadTrajectory with both', async () => {
    const ctx = fakeContext();
    const res = await createExecutor(ctx).dispatch({
      name: 'load-trajectory',
      input: {
        topology: { source: 'url', url: 'https://x/top.pdb', format: 'pdb' },
        coordinates: { source: 'url', url: 'https://x/c.xtc', format: 'xtc' },
      },
    });
    expect(res.ok).toBe(true);
    expect(ctx.loadTrajectory).toHaveBeenCalledWith({
      topology: { url: 'https://x/top.pdb', format: 'pdb' },
      coordinates: { url: 'https://x/c.xtc', format: 'xtc', isBinary: true },
    });
  });

  it('uses a host resolveCoordinates override', async () => {
    const ctx = fakeContext();
    const bytes = new Uint8Array([1, 2, 3]);
    const resolveCoordinates = vi.fn(async () => ({ data: bytes, format: 'xtc' as const, isBinary: true as const }));
    const res = await createExecutor(ctx, { resolveCoordinates }).dispatch({
      name: 'load-trajectory',
      input: {
        topology: { source: 'inline', data: 'TOPDATA', format: 'pdb' },
        coordinates: { source: 'url', url: 'https://x/c.xtc', format: 'xtc' },
      },
    });
    expect(res.ok).toBe(true);
    expect(resolveCoordinates).toHaveBeenCalledOnce();
    expect(ctx.loadTrajectory).toHaveBeenCalledWith({
      topology: { data: 'TOPDATA', format: 'pdb' },
      coordinates: { data: bytes, format: 'xtc', isBinary: true },
    });
  });

  it('returns invalid_input when topology is missing', async () => {
    const res = await createExecutor(fakeContext()).dispatch({
      name: 'load-trajectory',
      input: { coordinates: { source: 'url', url: 'https://x/c.xtc', format: 'xtc' } },
    });
    expect(errorOf(res).code).toBe('invalid_input');
  });

  it('returns invalid_input when coordinates is missing', async () => {
    const res = await createExecutor(fakeContext()).dispatch({
      name: 'load-trajectory',
      input: { topology: { source: 'pdb', id: '1crn' } },
    });
    expect(errorOf(res).code).toBe('invalid_input');
  });

  it('surfaces a trajectory_mismatch thrown by the adapter', async () => {
    const ctx = fakeContext({
      loadTrajectory: vi.fn(async () => {
        throw new ExecutorError('trajectory_mismatch', 'Frame element count mismatch, got 7 but expected 10.');
      }),
    });
    const res = await createExecutor(ctx).dispatch({
      name: 'load-trajectory',
      input: {
        topology: { source: 'pdb', id: '1crn' },
        coordinates: { source: 'url', url: 'https://x/c.xtc', format: 'xtc' },
      },
    });
    expect(errorOf(res).code).toBe('trajectory_mismatch');
  });

  it('returns no_trajectory for play/stop/set-frame when none is loaded', async () => {
    const exec = createExecutor(fakeContext()); // default scene has no trajectory
    expect(errorOf(await exec.dispatch({ name: 'play-trajectory', input: {} })).code).toBe('no_trajectory');
    expect(errorOf(await exec.dispatch({ name: 'stop-trajectory', input: {} })).code).toBe('no_trajectory');
    expect(errorOf(await exec.dispatch({ name: 'set-frame', input: { index: 0 } })).code).toBe('no_trajectory');
  });

  it('plays with fps/loop forwarded to the port', async () => {
    const ctx = fakeContext({ getSceneContext: () => trajectoryScene(309) });
    const res = await createExecutor(ctx).dispatch({
      name: 'play-trajectory',
      input: { fps: 15, loop: false },
    });
    expect(res.ok).toBe(true);
    expect(ctx.playTrajectory).toHaveBeenCalledWith({ fps: 15, loop: false });
  });

  it('plays with undefined options when none are given', async () => {
    const ctx = fakeContext({ getSceneContext: () => trajectoryScene(309) });
    await createExecutor(ctx).dispatch({ name: 'play-trajectory', input: {} });
    expect(ctx.playTrajectory).toHaveBeenCalledWith(undefined);
  });

  it('stops the loaded trajectory', async () => {
    const ctx = fakeContext({ getSceneContext: () => trajectoryScene(309) });
    const res = await createExecutor(ctx).dispatch({ name: 'stop-trajectory', input: {} });
    expect(res.ok).toBe(true);
    expect(ctx.stopTrajectory).toHaveBeenCalledOnce();
  });

  it('seeks to a valid frame index', async () => {
    const ctx = fakeContext({ getSceneContext: () => trajectoryScene(309) });
    const res = await createExecutor(ctx).dispatch({ name: 'set-frame', input: { index: 42 } });
    expect(res.ok).toBe(true);
    expect(ctx.setFrame).toHaveBeenCalledWith(42);
  });

  it('rejects an out-of-range frame index with invalid_input', async () => {
    const ctx = fakeContext({ getSceneContext: () => trajectoryScene(309) });
    const res = await createExecutor(ctx).dispatch({ name: 'set-frame', input: { index: 309 } });
    expect(errorOf(res).code).toBe('invalid_input');
    expect(ctx.setFrame).not.toHaveBeenCalled();
  });

  it('rejects a non-integer frame index with invalid_input', async () => {
    const ctx = fakeContext({ getSceneContext: () => trajectoryScene(309) });
    const res = await createExecutor(ctx).dispatch({ name: 'set-frame', input: { index: 1.5 } });
    expect(errorOf(res).code).toBe('invalid_input');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test executor`
Expected: FAIL — `unknown_command` for the trajectory names (dispatch doesn't handle them yet); the load-trajectory routing tests fail.

- [ ] **Step 3: Implement dispatch in `src/executor.ts`**

Add imports (after line 10, the resolve-structure import):

```ts
import { defaultResolveCoordinates } from './resolve-coordinates';
import type { ResolveCoordinates } from './resolve-coordinates';
import type { CoordinatesInput } from './types';
```

Extend `ExecutorOptions` (after the `resolveStructure?` field, line 15):

```ts
  /** Host hook to fetch a binary coordinate stream. Defaults to URL passthrough. */
  resolveCoordinates?: ResolveCoordinates;
```

In `createExecutor`, resolve the default (after line 42, the `resolveStructure` default):

```ts
  const resolveCoordinates = options.resolveCoordinates ?? defaultResolveCoordinates;
```

Add the four `case` blocks to the `switch` in `dispatch`, after the `case 'load-structure'` block (after line 54):

```ts
        case 'load-trajectory': {
          const input = asObject(command.input);
          if (!isPlainObject(input.topology)) {
            throw new ExecutorError('invalid_input', 'load-trajectory requires a "topology" object.');
          }
          if (!isPlainObject(input.coordinates)) {
            throw new ExecutorError('invalid_input', 'load-trajectory requires a "coordinates" object.');
          }
          const topology = await resolveStructure(input.topology as unknown as LoadInput);
          if (topology.url === undefined && topology.data === undefined) {
            throw new ExecutorError('internal_error', 'resolveStructure returned neither a url nor inline data.');
          }
          const coordinates = await resolveCoordinates(input.coordinates as unknown as CoordinatesInput);
          if (coordinates.url === undefined && coordinates.data === undefined) {
            throw new ExecutorError('internal_error', 'resolveCoordinates returned neither a url nor bytes.');
          }
          await ctx.loadTrajectory({ topology, coordinates });
          return ok();
        }
        case 'play-trajectory': {
          const input = asObject(command.input);
          if (ctx.getSceneContext().trajectory === undefined) {
            throw new ExecutorError('no_trajectory', 'no trajectory is loaded.');
          }
          const playOptions: { fps?: number; loop?: boolean } = {};
          if (typeof input.fps === 'number') playOptions.fps = input.fps;
          if (typeof input.loop === 'boolean') playOptions.loop = input.loop;
          ctx.playTrajectory(Object.keys(playOptions).length > 0 ? playOptions : undefined);
          return ok();
        }
        case 'stop-trajectory': {
          if (ctx.getSceneContext().trajectory === undefined) {
            throw new ExecutorError('no_trajectory', 'no trajectory is loaded.');
          }
          ctx.stopTrajectory();
          return ok();
        }
        case 'set-frame': {
          const input = asObject(command.input);
          const traj = ctx.getSceneContext().trajectory;
          if (traj === undefined) {
            throw new ExecutorError('no_trajectory', 'no trajectory is loaded.');
          }
          const index = input.index;
          if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= traj.frameCount) {
            throw new ExecutorError('invalid_input', `set-frame "index" must be an integer in [0, ${traj.frameCount}).`);
          }
          ctx.setFrame(index);
          return ok();
        }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test executor`
Expected: PASS — all executor tests pass (existing + the new trajectory `describe`).

- [ ] **Step 5: Thread `resolveCoordinates` through the browser layer.**

In `src/mol/create-mol-view.ts`, add the import (after line 5, the `ResolveStructure` import):

```ts
import type { ResolveCoordinates } from '../resolve-coordinates';
```

Add the option to `CreateMolViewOptions` (after the `resolveStructure?` field, line 18):

```ts
  /** Host hook to fetch a binary coordinate stream for load-trajectory. Defaults to URL passthrough. */
  resolveCoordinates?: ResolveCoordinates;
```

Pass it into the executor (line 58):

```ts
  const { dispatch } = createExecutor(ctx, {
    resolveStructure: opts.resolveStructure,
    resolveCoordinates: opts.resolveCoordinates,
  });
```

In `src/react/provider.tsx`, widen the `MolViewConfig` `Pick` (line 7):

```ts
export type MolViewConfig = Pick<CreateMolViewOptions, 'resolveStructure' | 'resolveCoordinates'>;
```

- [ ] **Step 6: Run the full gate**

Run: `pnpm test && pnpm typecheck`
Expected: all green — executor trajectory tests pass; typecheck clean end to end.

- [ ] **Step 7: Commit**

```bash
git add src/executor.ts test/executor.test.ts src/mol/create-mol-view.ts src/react/provider.tsx
git commit -m "feat: executor dispatch + resolveCoordinates wiring for the trajectory cluster"
```

---

### Task 5: Node trajectory-validation spike (non-blocking)

**Files:**
- Modify: `test/fixtures/structures.ts` (export a `buildModelFromPDB` helper, refactored from the existing private one)
- Create: `test/trajectory-node-spike.test.ts`

**Interfaces:**
- Consumes: existing `PDB_TINY`, `parsePDB`, `trajectoryFromPDB`, `modelFromTrajectory` in the fixtures; molstar `Model.trajectoryFromModelAndCoordinates`, `Coordinates.create`, `Time`.
- Produces: `buildModelFromPDB(pdb: string): Promise<Model>` exported from `test/fixtures/structures.ts`.

> **This task is exploratory but high-confidence.** It proves, in pure Node (no plugin/WebGL/XTC binary), that (a) fusing a model with N coordinate frames yields a trajectory of `frameCount === N`, and (b) an atom-count mismatch throws. It builds an **in-memory `Coordinates`** object, so it does not need a binary XTC fixture. If `Model.trajectoryFromModelAndCoordinates` unexpectedly requires a runtime/plugin context in Node, mark the failing `it` as `it.skip` with a one-line comment explaining the blocker and note it for the post-merge wiki sync — **this task does not block merge.**

- [ ] **Step 1: Export a Node model builder from `test/fixtures/structures.ts`.**

Add a `Model` type import (line 7, alongside `Trajectory`):

```ts
import type { Trajectory, Model } from 'molstar/lib/mol-model/structure';
```

Add an exported helper (after `buildStructureFromPDB`, line 59), and refactor `buildStructureFromPDB` to use it:

```ts
/** Build a single Model from PDB text in pure Node (the frame-0 model of the trajectory). */
export async function buildModelFromPDB(pdb: string): Promise<Model> {
  const parsed = await parsePDB(pdb, 'fixture').run();
  if (parsed.isError) throw new Error(`PDB parse failed: ${parsed.message}`);
  const traj = await trajectoryFromPDB(parsed.result).run();
  return modelFromTrajectory(traj);
}
```

Replace the body of `buildStructureFromPDB` (lines 54-59) so it reuses the new helper (DRY):

```ts
export async function buildStructureFromPDB(pdb: string): Promise<Structure> {
  return Structure.ofModel(await buildModelFromPDB(pdb)); // sync, no RuntimeContext
}
```

- [ ] **Step 2: Write the spike test** — create `test/trajectory-node-spike.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Model } from 'molstar/lib/mol-model/structure';
import { Coordinates, Time } from 'molstar/lib/mol-model/structure/coordinates';
import type { Frame } from 'molstar/lib/mol-model/structure/coordinates';
import { PDB_TINY, buildModelFromPDB } from './fixtures/structures';

/** A zeroed coordinate frame of `n` atoms (positions are irrelevant to the count check). */
function frame(n: number): Frame {
  return {
    elementCount: n,
    time: Time(0, 'step'),
    x: new Float32Array(n),
    y: new Float32Array(n),
    z: new Float32Array(n),
    xyzOrdering: { isIdentity: true },
  };
}

const coords = (counts: number[]) =>
  Coordinates.create(counts.map(frame), Time(1, 'step'), Time(0, 'step'));

describe('Node trajectory spike — model + coordinates fusion (pure Node)', () => {
  it('fuses a model with matching frames into a trajectory of frameCount N', async () => {
    const model = await buildModelFromPDB(PDB_TINY); // 10 atoms
    const trajectory = Model.trajectoryFromModelAndCoordinates(model, coords([10, 10, 10]));
    expect(trajectory.frameCount).toBe(3);
  });

  it('throws on an atom-count mismatch between topology and coordinates', async () => {
    const model = await buildModelFromPDB(PDB_TINY); // 10 atoms
    expect(() => Model.trajectoryFromModelAndCoordinates(model, coords([7]))).toThrow(
      /element count mismatch/i,
    );
  });
});
```

- [ ] **Step 3: Run the spike**

Run: `pnpm test trajectory-node-spike`
Expected: PASS — 2 tests pass (`frameCount === 3`; mismatch throws). **If either needs a plugin/RuntimeContext in Node**, convert that `it` to `it.skip` with a comment (`// Node fusion needs <X>; verified manually/typecheck instead`) and record the blocker for the wiki sync. Do not let this block the branch.

- [ ] **Step 4: Run the full gate**

Run: `pnpm test && pnpm typecheck`
Expected: all green (the `buildStructureFromPDB` refactor keeps every existing selection/executor test passing).

- [ ] **Step 5: Commit**

```bash
git add test/fixtures/structures.ts test/trajectory-node-spike.test.ts
git commit -m "test: pure-Node trajectory frameCount + mismatch spike"
```

---

### Task 6: Demo TrajectoryPanel (manual verification layer)

**Files:**
- Create: `examples/demo/src/panels/TrajectoryPanel.tsx`
- Modify: `examples/demo/src/App.tsx`, `examples/demo/CHECKLIST.md`

**Interfaces:**
- Consumes: `useMolView` (returns `MolView | undefined`); `MolView.dispatch(command)`; `SceneContext` (now with `trajectory`); the v1 demo UI (`Panel`, `ResultView`).
- Produces: a panel that dispatches `load-trajectory`/`play-trajectory`/`stop-trajectory`/`set-frame` and reads back the trajectory scene state.

> **Verification = the demo typechecks + builds**, plus the manual checklist (run by the user on a GPU, with a locally-served `MD_Data/`). No automated test. The demo consumes the library via Vite alias to TS source (no packaging).

- [ ] **Step 1: Create `examples/demo/src/panels/TrajectoryPanel.tsx`:**

```tsx
import { useState } from 'react';
import { useMolView } from 'van-der-view/browser';
import type { CommandResult, SceneContext } from 'van-der-view/browser';
import { Panel, ResultView } from '../ui';

/**
 * Manual trajectory panel. There is no bundled coordinate fixture (an XTC is large and
 * binary), so paste URLs to a locally-served topology + coordinate file — e.g. serve the
 * gitignored MD_Data/ folder with `npx serve MD_Data` and use its printed origin:
 *   topology:    http://localhost:3000/5GGS/5GGS_nowat.pdb   (format: pdb)
 *   coordinates: http://localhost:3000/5GGS/5GGS_nowat.xtc   (format: xtc)
 */
export function TrajectoryPanel() {
  const viewer = useMolView();
  const disabled = !viewer;
  const [topologyUrl, setTopologyUrl] = useState('http://localhost:3000/5GGS_nowat.pdb');
  const [coordsUrl, setCoordsUrl] = useState('http://localhost:3000/5GGS_nowat.xtc');
  const [frame, setFrame] = useState(0);
  const [result, setResult] = useState<CommandResult>();
  const [scene, setScene] = useState<SceneContext>();

  const run = async (command: Parameters<NonNullable<typeof viewer>['dispatch']>[0]) => {
    if (!viewer) return;
    setResult(await viewer.dispatch(command));
    const ctx = await viewer.dispatch({ name: 'get-scene-context', input: {} });
    if (ctx.ok) setScene(ctx.data as SceneContext);
  };

  const frameCount = scene?.trajectory?.frameCount ?? 1;

  return (
    <Panel title="Trajectory">
      <div style={{ display: 'grid', gap: 4 }}>
        <input value={topologyUrl} onChange={(e) => setTopologyUrl(e.target.value)} placeholder="topology .pdb URL" />
        <input value={coordsUrl} onChange={(e) => setCoordsUrl(e.target.value)} placeholder="coordinates .xtc URL" />
      </div>
      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        <button
          disabled={disabled}
          onClick={() =>
            run({
              name: 'load-trajectory',
              input: {
                topology: { source: 'url', url: topologyUrl, format: 'pdb' },
                coordinates: { source: 'url', url: coordsUrl, format: 'xtc' },
              },
            })
          }
        >
          Load trajectory
        </button>
        <button disabled={disabled} onClick={() => run({ name: 'play-trajectory', input: { fps: 15 } })}>
          Play
        </button>
        <button disabled={disabled} onClick={() => run({ name: 'stop-trajectory', input: {} })}>
          Stop
        </button>
      </div>
      <div style={{ marginTop: 8 }}>
        <label style={{ fontSize: 12 }}>
          frame {frame} / {frameCount - 1}
          <input
            type="range"
            min={0}
            max={Math.max(0, frameCount - 1)}
            value={frame}
            disabled={disabled}
            onChange={(e) => {
              const index = Number(e.target.value);
              setFrame(index);
              void run({ name: 'set-frame', input: { index } });
            }}
            style={{ width: '100%' }}
          />
        </label>
      </div>
      <ResultView result={result} />
      <pre style={{ margin: '8px 0 0', fontSize: 12, whiteSpace: 'pre-wrap', color: '#cde' }}>
        {scene?.trajectory ? JSON.stringify(scene.trajectory, null, 2) : '(load a trajectory to see frame state)'}
      </pre>
    </Panel>
  );
}
```

- [ ] **Step 2: Mount the panel in `examples/demo/src/App.tsx`.**

Add the import (after the `XrPanel` import, line 7):

```tsx
import { TrajectoryPanel } from './panels/TrajectoryPanel';
```

Add `<TrajectoryPanel />` to the panel column — after `<LoadPanel />` (line 15), so loading-related panels sit together:

```tsx
        <LoadPanel />
        <TrajectoryPanel />
```

- [ ] **Step 3: Run the demo gate**

Run: `pnpm --filter van-der-view-demo build`
Expected: SUCCESS — production bundle compiles (the large molstar chunk warning is normal). This also runs `tsc` on the demo via its build script, so the new panel typechecks.

> If the demo's build script does not run `tsc`, also run `pnpm --filter van-der-view-demo exec tsc --noEmit` and expect no errors.

- [ ] **Step 4: Update the manual checklist** — add a "Trajectory" section to `examples/demo/CHECKLIST.md`, after the numbered smoke steps (before the `## WebXR` heading):

```markdown
## Trajectory (MD playback)

Needs a locally-served topology + coordinate file. The `MD_Data/` folder is gitignored
(large, not bundled); serve it and paste the URLs into the **Trajectory** panel:

```bash
npx serve MD_Data/5GGS      # prints an origin, e.g. http://localhost:3000
```

1. **Load trajectory** — paste the `*_nowat.pdb` (topology) and `*_nowat.xtc` (coordinates)
   URLs, format pdb/xtc → "Load trajectory". The complex renders. A topology/coordinate
   atom-count mismatch surfaces a `trajectory_mismatch` error (no silent corruption).
2. **Play / Stop** — "Play" animates the frames (loops); "Stop" halts. Tune fps feel.
3. **Seek** — drag the frame slider; the structure jumps to that frame and the readout's
   `currentFrame` follows.
4. **Scene state** — the readout shows `frameCount / currentFrame / isPlaying`; it matches
   what's on screen.

> **MD_Data chain-id caveat (data, not library):** the `*_interactions.json` files label the
> antigen chain `Z`, but the `*_nowat` viewer files label it `A`. Use the viewer files' ids
> when selecting chains.
```

- [ ] **Step 5: Commit**

```bash
git add examples/demo/src/panels/TrajectoryPanel.tsx examples/demo/src/App.tsx examples/demo/CHECKLIST.md
git commit -m "feat(demo): trajectory panel + manual checklist"
```

---

## Verification

- **Automated (gates each off-GPU task):** `pnpm test && pnpm typecheck` green at every task boundary. New coverage: `defaultResolveCoordinates` (Task 1), the trajectory command catalog (Task 2), all four dispatch paths + validation + error mapping against the fake port (Task 4), and the pure-Node frameCount/mismatch spike (Task 5). Existing 90 tests stay green.
- **Typecheck-gated (Task 3):** the real `molstarExecutorContext` trajectory members compile against molstar 5.10.1 (the port + adapter + fake all move together so typecheck is green when Task 3 commits).
- **Demo build (Task 6):** `pnpm --filter van-der-view-demo build` succeeds with the new panel.
- **Manual (user, on a GPU, not blocking merge):** load an `MD_Data` PDB+XTC by URL, play/stop, seek via the slider, confirm `frameCount/currentFrame/isPlaying` — per the CHECKLIST trajectory section.
- **Final review:** dispatch a whole-branch code reviewer over the diff vs `main`.
- **Finish:** superpowers:finishing-a-development-branch → Push + PR (the user merges). Post-merge: wiki + docs sync (raw note, `command-schema`, `agent-command-flow`, `molstar-trajectories`, `testing-strategy`, `project-overview`/`index.md`), roadmap memory, then reconcile open PR #11.

## Out of scope (do not build)

Palindrome animation mode; frame-range trimming / sub-selection; multiple simultaneous
trajectories; in-XR playback; agent-facing inline/base64 coordinates; per-frame selection
scoping; coordinate-format auto-detection; new public type exports beyond what
`export * from './types'` already provides (matches the existing unexported `ResolveStructure`).

## Self-Review

- **Spec coverage:** load-trajectory (T2 catalog, T3 adapter, T4 dispatch) ✓; play/stop/set-frame (T2 catalog / T3 adapter / T4 dispatch) ✓; `resolveCoordinates` hook (T1, wired T4) ✓; topology reuses `resolveStructure` (T4 dispatch) ✓; `SceneContext.trajectory` (T3) ✓; `no_trajectory` (T3 code, T4 raised) / `trajectory_mismatch` (T3 code + adapter translates the Mol\* throw) ✓; Node spike (T5) ✓; demo panel (T6) ✓; out-of-scope cut listed ✓.
- **Type consistency:** `ResolvedTrajectory { topology: ResolvedStructure; coordinates: ResolvedCoordinates }` used identically in context.ts, executor (constructs `{ topology, coordinates }`), and adapter (`toModelParam`/`toCoordsParam`). Port member names (`loadTrajectory`/`playTrajectory`/`stopTrajectory`/`setFrame`) match across context.ts, executor calls, fake, and adapter. `SceneContext.trajectory` fields (`frameCount`/`currentFrame`/`isPlaying`) match across context.ts, executor validation, adapter, and demo.
- **Module layering:** `types.ts` stays a leaf (only `CoordinatesInput` + consts); composite types referencing `LoadInput`/`ResolvedStructure` live in `resolve-coordinates.ts` — no import cycle.
- **Placeholder scan:** every code step shows complete code; the only intentional openness is Task 5's documented `it.skip` fallback, which is by design (non-blocking spike).
