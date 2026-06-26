# Load Supersede + Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `load-structure`/`load-trajectory` from running superseded or redundant work on rapid in-place structure switches — via latest-wins supersession + dedup-on-same, both automatic and default-on.

**Architecture:** Two independent mechanisms in the molstar-free `executor.ts`. (A) `dispatch` gives every scene-mutating command an `AbortController`; a newly dispatched scene-replacing load aborts every earlier still-pending controller, and `execute` checks the signal at three points (returning a distinct `superseded` result) and threads it into `ctx.loadStructure`/`ctx.loadTrajectory`. (B) the executor remembers the resolved-url identity of the displayed structure (`lastLoadedKey`) and no-ops a reload of the same source. The only molstar-side change is the adapter honoring the threaded `AbortSignal` at its `await` boundaries.

**Tech Stack:** TypeScript, Vitest (Node), molstar 5.10.1 (pinned), React 18 (demo). `AbortController`/`AbortSignal`/`signal.throwIfAborted()` are platform globals (browser + Node test env) — no new dependency.

**Spec:** `docs/superpowers/specs/2026-06-26-load-supersede-dedup-design.md`

## Global Constraints

- **Zero new public API.** Both mechanisms are automatic; no `view.cancelPending()`, no `AbortSignal` on the command input. (YAGNI — spec section 9.)
- **`superseded` is an `ErrorCode`** and a benign, expected outcome (host reads it as "this load was intentionally dropped"), not a failure.
- **molstar-free boundary holds:** `errors.ts`, `context.ts`, `executor.ts` must NOT import molstar. Only `src/mol/adapter.ts` touches molstar.
- **Dedup key is url-based only** (`[url, format, isBinary].join('\u0000')`); inline-data loads are never deduped.
- **Adapter keeps its existing clear-first order**; it only ADDS `signal?.throwIfAborted()` checkpoints. No reordering.
- **Off-GPU logic is Node-tested; the molstar adapter is typecheck-gated + GPU/demo-verified** (project convention — no Node test for `adapter.ts`).
- **No new runtime dependencies** (`AbortController` is global) — nothing for the user to install.
- Never `git add -A` (gitignored: `.DS_Store`, `MD_Data/`, `.superpowers/`); stage only the exact files each step names. Commit messages end with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/errors.ts` | Add `'superseded'` to the `ErrorCode` union. | 1 |
| `src/context.ts` | Add optional `signal?: AbortSignal` to the `loadStructure`/`loadTrajectory` port methods. | 1 |
| `src/executor.ts` | Supersession (controllers/`pending`/abort sweep, three signal checks, signal threading) + dedup (`keyOf`/`lastLoadedKey`). | 1, 2 |
| `src/mol/adapter.ts` | `throwIfAborted()` checkpoints in `loadStructure`/`loadTrajectory`. | 3 |
| `test/executor.test.ts` | Node tests for supersession + dedup; a `gatedLoad` helper. | 1, 2 |
| `examples/demo/src/panels/SupersedePanel.tsx` | A rapid-switch + reload-same panel that logs each result code (manual GPU verification). | 4 |
| `examples/demo/src/App.tsx` | Mount `SupersedePanel`. | 4 |

---

## Task 1: latest-wins supersession (executor + port + error code)

**Files:**
- Modify: `src/errors.ts:7-16` (ErrorCode union)
- Modify: `src/context.ts:42,48` (port signatures)
- Modify: `src/executor.ts` (`fail` area, `execute`, load cases, catch, `dispatch`)
- Test: `test/executor.test.ts`

**Interfaces:**
- Consumes: existing `createExecutor(ctx, options)`, `fakeContext`/`errorOf` test helpers, `ExecutorContext`, `createSerializer`.
- Produces:
  - `ErrorCode` now includes `'superseded'`.
  - `ExecutorContext.loadStructure(resolved, signal?: AbortSignal): Promise<void>` and `loadTrajectory(resolved, signal?: AbortSignal): Promise<void>`.
  - `execute(command, signal?: AbortSignal)` and a `dispatch` that supersedes earlier pending loads.
  - A `gatedLoad()` test helper (reused by Task 2).

- [ ] **Step 1: Add the `superseded` error code**

In `src/errors.ts`, extend the union (after `'internal_error'`):

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
  | 'superseded'
  | 'internal_error';
```

- [ ] **Step 2: Add the optional signal to the port**

In `src/context.ts`, change the two load methods of `ExecutorContext`:

```ts
  loadStructure(resolved: ResolvedStructure, signal?: AbortSignal): Promise<void>;
```
```ts
  loadTrajectory(resolved: ResolvedTrajectory, signal?: AbortSignal): Promise<void>;
```

(The molstar adapter's current zero-`signal` implementations stay assignable — a function taking fewer params satisfies a wider signature — so `adapter.ts` still typechecks unchanged until Task 3.)

- [ ] **Step 3: Write the failing supersession tests + `gatedLoad` helper**

In `test/executor.test.ts`, add the helper just after the `errorOf` helper (near line 47):

```ts
/** A loadStructure fake that blocks on a manual gate, records each resolved arg, and
 *  (like the real adapter) honors abort only AFTER its await — so a load held here is
 *  "in-flight" until released, then bails if its signal was aborted meanwhile. */
function gatedLoad() {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const calls: unknown[] = [];
  const loadStructure = vi.fn(async (resolved: unknown, signal?: AbortSignal) => {
    calls.push(resolved);
    await gate;
    signal?.throwIfAborted();
  });
  return { loadStructure, release, calls };
}

/** Resolve the microtask + macrotask queue so a just-dispatched load reaches the gate. */
const flush = () => new Promise((r) => setTimeout(r, 0));
```

Then add a new describe block at the end of the file:

```ts
describe('createExecutor — supersession (#27)', () => {
  it('supersedes earlier in-flight and queued loads; only the latest survives', async () => {
    const { loadStructure, release, calls } = gatedLoad();
    const exec = createExecutor(fakeContext({ loadStructure }));
    const pA = exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } });
    await flush();                                   // A enters the gate → in-flight
    const pB = exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1hsg' } });
    const pC = exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '4hhb' } });
    release();
    const [rA, rB, rC] = await Promise.all([pA, pB, pC]);
    expect(errorOf(rA).code).toBe('superseded');     // in-flight: aborted at throwIfAborted
    expect(errorOf(rB).code).toBe('superseded');     // queued: bailed at execute top
    expect(rC.ok).toBe(true);                        // survivor
    expect(loadStructure).toHaveBeenCalledTimes(2);  // A (in-flight) + C; B never called
  });

  it('threads an AbortSignal into ctx.loadStructure', async () => {
    const ctx = fakeContext();
    await createExecutor(ctx).dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } });
    expect(ctx.loadStructure).toHaveBeenCalledWith(
      { url: 'https://files.rcsb.org/download/1CRN.cif', format: 'mmcif' },
      expect.any(AbortSignal),
    );
  });

  it('supersedes a non-load mutation queued before a load', async () => {
    const { loadStructure, release } = gatedLoad();
    const ctx = fakeContext({ loadStructure });
    const exec = createExecutor(ctx);
    const pLoad1 = exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } });
    await flush();                                   // load1 in-flight
    const pColor = exec.dispatch({ name: 'set-color', input: { selection: { chain: 'A' }, color: '#ff0000' } });
    const pLoad2 = exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1hsg' } });
    release();
    const [r1, rColor, r2] = await Promise.all([pLoad1, pColor, pLoad2]);
    expect(errorOf(r1).code).toBe('superseded');     // in-flight load superseded by load2
    expect(errorOf(rColor).code).toBe('superseded'); // queued set-color superseded by load2
    expect(ctx.setColor).not.toHaveBeenCalled();
    expect(r2.ok).toBe(true);
  });

  it('lets get-scene-context bypass the queue during an in-flight load', async () => {
    const { loadStructure, release } = gatedLoad();
    const exec = createExecutor(fakeContext({ loadStructure }));
    const pLoad = exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } });
    await flush();                                   // load in-flight (gated)
    const read = await exec.dispatch({ name: 'get-scene-context', input: {} });
    expect(read.ok).toBe(true);                      // resolved now, not blocked behind the load
    release();
    await pLoad;
  });
});
```

- [ ] **Step 4: Run the new tests to verify they fail**

Run: `pnpm exec vitest run test/executor.test.ts -t "supersession"`
Expected: FAIL — `dispatch` doesn't supersede (e.g. `rB.code` is `ok`/`undefined` not `superseded`; `loadStructure` called 3×), and the signal-threading test fails (called with 1 arg).

- [ ] **Step 5: Implement supersession in `src/executor.ts`**

(a) After the `fail` declaration (line 28), add the shared message:

```ts
/** err() with the code constrained to the shared ErrorCode union (catches typos / divergence). */
const fail = (code: ErrorCode, message: string): CommandResult => err(code, message);

/** Message for a load/mutation dropped because a newer scene-replacing load superseded it. */
const SUPERSEDED_MSG = 'superseded by a newer scene load.';
```

(b) Change the `execute` signature and add the top-of-function check (line 123):

```ts
  async function execute(command: Command, signal?: AbortSignal): Promise<CommandResult> {
    if (signal?.aborted) return fail('superseded', SUPERSEDED_MSG);
    try {
```

(c) In the `load-structure` case, add the post-resolve check and thread `signal`:

```ts
        case 'load-structure': {
          const resolved = await resolveStructure(asObject(command.input) as unknown as LoadInput);
          if (signal?.aborted) return fail('superseded', SUPERSEDED_MSG);
          if (resolved.url === undefined && resolved.data === undefined) {
            throw new ExecutorError('internal_error', 'resolveStructure returned neither a url nor inline data.');
          }
          await ctx.loadStructure(resolved, signal);
          return ok();
        }
```

(d) In the `load-trajectory` case, add the pre-call check and thread `signal` (the last lines of the case):

```ts
          const coordinates = await resolveCoordinates(input.coordinates as unknown as CoordinatesInput);
          if (coordinates.url === undefined && coordinates.data === undefined) {
            throw new ExecutorError('internal_error', 'resolveCoordinates returned neither a url nor bytes.');
          }
          if (signal?.aborted) return fail('superseded', SUPERSEDED_MSG);
          await ctx.loadTrajectory({ topology, coordinates }, signal);
          return ok();
        }
```

(e) Make the catch block map an abort to `superseded` first (line 258):

```ts
    } catch (e) {
      if (signal?.aborted) return fail('superseded', SUPERSEDED_MSG);
      if (e instanceof ExecutorError) return fail(e.code, e.message);
      return fail('internal_error', e instanceof Error ? e.message : String(e));
    }
```

(f) Replace the `readOnly`/`serialize`/`dispatch` block (lines 273-277) with the supersession-aware version (keep the explanatory comment above it at 264-272):

```ts
  const readOnly = new Set<Command['name']>(['get-scene-context', 'measure-distance']);
  // A scene-replacing load clears the scene, so when one is dispatched every earlier
  // still-pending mutation (queued or in-flight) targets a scene about to vanish — abort
  // them so they bail (returning `superseded`) instead of running superseded work (#27).
  const sceneReplacing = new Set<Command['name']>(['load-structure', 'load-trajectory']);
  const serialize = createSerializer();
  const pending = new Set<AbortController>();
  function dispatch(command: Command): Promise<CommandResult> {
    if (readOnly.has(command.name)) return execute(command);
    const controller = new AbortController();
    if (sceneReplacing.has(command.name)) {
      for (const c of pending) c.abort();
    }
    pending.add(controller);
    return serialize(() => execute(command, controller.signal)).finally(() => {
      pending.delete(controller);
    });
  }
```

- [ ] **Step 6: Update the four existing assertions for the threaded signal**

Threading `signal` adds a second argument to every `ctx.loadStructure`/`ctx.loadTrajectory` call, so four existing `toHaveBeenCalledWith` assertions in `test/executor.test.ts` need the extra matcher:

- `test/executor.test.ts:172` (resolves a PDB id):
```ts
    expect(ctx.loadStructure).toHaveBeenCalledWith(
      { url: 'https://files.rcsb.org/download/1CRN.cif', format: 'mmcif' },
      expect.any(AbortSignal),
    );
```
- `test/executor.test.ts:187` (host resolveStructure override):
```ts
    expect(ctx.loadStructure).toHaveBeenCalledWith({ data: 'INLINE', format: 'pdb' }, expect.any(AbortSignal));
```
- `test/executor.test.ts:269` (loadTrajectory with both):
```ts
    expect(ctx.loadTrajectory).toHaveBeenCalledWith(
      {
        topology: { url: 'https://x/top.pdb', format: 'pdb' },
        coordinates: { url: 'https://x/c.xtc', format: 'xtc', isBinary: true },
      },
      expect.any(AbortSignal),
    );
```
- `test/executor.test.ts:288` (host resolveCoordinates override):
```ts
    expect(ctx.loadTrajectory).toHaveBeenCalledWith(
      {
        topology: { data: 'TOPDATA', format: 'pdb' },
        coordinates: { data: bytes, format: 'xtc', isBinary: true },
      },
      expect.any(AbortSignal),
    );
```

- [ ] **Step 7: Run the full executor suite to verify green**

Run: `pnpm exec vitest run test/executor.test.ts`
Expected: PASS — all supersession tests pass and the four updated assertions pass.

- [ ] **Step 8: Typecheck**

Run: `pnpm typecheck`
Expected: exit 0 (no errors; `adapter.ts` still assignable to the widened port).

- [ ] **Step 9: Commit**

```bash
git add src/errors.ts src/context.ts src/executor.ts test/executor.test.ts
git commit -m "feat: latest-wins supersession for scene-replacing loads (#27)

A newly dispatched load-structure/load-trajectory aborts every earlier
still-pending mutation; superseded ones return a distinct 'superseded'
result and (via the threaded AbortSignal) skip remaining work.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: dedup-on-same (executor)

**Files:**
- Modify: `src/executor.ts` (import, `keyOf` helper, `lastLoadedKey`, both load cases)
- Test: `test/executor.test.ts`

**Interfaces:**
- Consumes: Task 1's `execute(command, signal?)`, the load cases, `gatedLoad`/`flush` test helpers, `ResolvedStructure` from `./resolve-structure`.
- Produces: dedup behavior — a `load-structure` whose resolved url-source equals the displayed one is a no-op; `keyOf(resolved)` identity; `lastLoadedKey` cleared at every load commit and on any trajectory load.

- [ ] **Step 1: Write the failing dedup tests**

Append to `test/executor.test.ts` a new describe block (reuses `gatedLoad`/`flush`/`errorOf` from Task 1):

```ts
describe('createExecutor — dedup-on-same (#27)', () => {
  it('dedups a reload of the currently-displayed source (no second loadStructure)', async () => {
    const ctx = fakeContext();
    const exec = createExecutor(ctx);
    const r1 = await exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } });
    const r2 = await exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(ctx.loadStructure).toHaveBeenCalledTimes(1); // second was a dedup no-op
  });

  it('does not dedup when a different load came in between (key invalidated)', async () => {
    const ctx = fakeContext();
    const exec = createExecutor(ctx);
    await exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } });
    await exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1hsg' } });
    await exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } });
    expect(ctx.loadStructure).toHaveBeenCalledTimes(3);
  });

  it('never dedups inline-data loads (no stable url identity)', async () => {
    const ctx = fakeContext();
    const resolveStructure = vi.fn(async () => ({ data: 'INLINE', format: 'pdb' as const }));
    const exec = createExecutor(ctx, { resolveStructure });
    await exec.dispatch({ name: 'load-structure', input: { source: 'inline', data: 'INLINE', format: 'pdb' } });
    await exec.dispatch({ name: 'load-structure', input: { source: 'inline', data: 'INLINE', format: 'pdb' } });
    expect(ctx.loadStructure).toHaveBeenCalledTimes(2);
  });

  it('does not dedup the load that supersedes an in-flight same-source load (scene was cleared)', async () => {
    const { loadStructure, release } = gatedLoad();
    const exec = createExecutor(fakeContext({ loadStructure }));
    const pB = exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } });
    await flush();                                    // B in-flight: it already committed (key → undefined)
    const pA2 = exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } });
    release();
    const [rB, rA2] = await Promise.all([pB, pA2]);
    expect(errorOf(rB).code).toBe('superseded');
    expect(rA2.ok).toBe(true);
    expect(loadStructure).toHaveBeenCalledTimes(2);   // A2 reloaded; did NOT wrongly dedup into a blank scene
  });

  it('clears the dedup key after a trajectory load (a later same-url structure reloads)', async () => {
    const ctx = fakeContext();
    const exec = createExecutor(ctx);
    await exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } });
    await exec.dispatch({
      name: 'load-trajectory',
      input: {
        topology: { source: 'url', url: 'https://x/top.pdb', format: 'pdb' },
        coordinates: { source: 'url', url: 'https://x/c.xtc', format: 'xtc' },
      },
    });
    await exec.dispatch({ name: 'load-structure', input: { source: 'pdb', id: '1crn' } });
    expect(ctx.loadStructure).toHaveBeenCalledTimes(2); // the post-trajectory 1crn is NOT deduped
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `pnpm exec vitest run test/executor.test.ts -t "dedup-on-same"`
Expected: FAIL — without dedup, the first test calls `loadStructure` twice (expected once); the trajectory-clears-key test calls it once (expected twice).

- [ ] **Step 3: Implement dedup in `src/executor.ts`**

(a) Add `ResolvedStructure` to the resolve-structure import (line 13):

```ts
import type { LoadInput, ResolveStructure, ResolvedStructure } from './resolve-structure';
```

(b) Add the `keyOf` helper at module level, right after `SUPERSEDED_MSG`:

```ts
/** A stable identity key for a resolved structure source: url-based only (inline data has
 *  no cheap stable identity, so it is never deduped). NUL-joined so a url can't forge a
 *  collision with a different (url, format, isBinary) triple. */
function keyOf(resolved: ResolvedStructure): string | undefined {
  return resolved.url !== undefined
    ? [resolved.url, resolved.format, resolved.isBinary].join('\u0000')
    : undefined;
}
```

(c) Inside `createExecutor`, declare the per-executor state right after the
`resolveStructure`/`resolveCoordinates` defaults (just before `async function execute`):

```ts
  // The url-identity of the structure currently displayed (undefined while a load is in
  // flight, after a trajectory load, or after an inline load). A load-structure whose
  // resolved source equals this is a no-op — the structure is already shown.
  let lastLoadedKey: string | undefined;
```

(d) Replace the `load-structure` case body with the dedup-aware version:

```ts
        case 'load-structure': {
          const resolved = await resolveStructure(asObject(command.input) as unknown as LoadInput);
          if (signal?.aborted) return fail('superseded', SUPERSEDED_MSG);
          if (resolved.url === undefined && resolved.data === undefined) {
            throw new ExecutorError('internal_error', 'resolveStructure returned neither a url nor inline data.');
          }
          const key = keyOf(resolved);
          if (key !== undefined && key === lastLoadedKey) return ok(); // already displayed → no-op
          lastLoadedKey = undefined; // committing: the scene is about to be cleared
          await ctx.loadStructure(resolved, signal);
          lastLoadedKey = key;
          return ok();
        }
```

(e) In the `load-trajectory` case, clear the key at the commit point (add the
`lastLoadedKey = undefined` line just before `await ctx.loadTrajectory`):

```ts
          if (signal?.aborted) return fail('superseded', SUPERSEDED_MSG);
          lastLoadedKey = undefined; // a trajectory replaces the structure scene; never deduped
          await ctx.loadTrajectory({ topology, coordinates }, signal);
          return ok();
```

- [ ] **Step 4: Run the dedup suite to verify green**

Run: `pnpm exec vitest run test/executor.test.ts -t "dedup-on-same"`
Expected: PASS — all five dedup tests pass.

- [ ] **Step 5: Run the full suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: full Vitest suite PASS (supersession + dedup + all prior tests), typecheck exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/executor.ts test/executor.test.ts
git commit -m "feat: dedup-on-same for load-structure (#27)

Reloading the currently-displayed source is a no-op (returns ok). Keyed
by resolved url identity; inline loads never dedup. lastLoadedKey is
cleared at every load commit so an in-flight-superseded or post-trajectory
reload of the same url still reloads (no blank-scene dedup).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: adapter checkpoints (in-flight cancel)

**Files:**
- Modify: `src/mol/adapter.ts:248-266` (`loadStructure`), `src/mol/adapter.ts:313-349` (`loadTrajectory`)

**Interfaces:**
- Consumes: the widened port (`loadStructure(resolved, signal?)`, `loadTrajectory(resolved, signal?)`), the signal threaded by Task 1's executor.
- Produces: an in-flight `loadStructure` that bails (throws its abort) at each `await` boundary when superseded — skipping `download`/`parse`/`applyPreset`. The executor maps the throw to `superseded`.

> **Verification model:** `adapter.ts` is GPU-bound and not Node-tested (project convention). This task is gated by `pnpm typecheck`; its runtime behavior is verified by hand on a GPU in Task 4. The Node tests in Tasks 1-2 already prove the executor's half via a fake that mirrors these checkpoints.

- [ ] **Step 1: Add checkpoints to `loadStructure`**

Replace the `loadStructure` method (lines 248-266) with the signal-aware version (same clear-first order, only `throwIfAborted()` added):

```ts
    async loadStructure(resolved: ResolvedStructure, signal?: AbortSignal): Promise<void> {
      signal?.throwIfAborted();
      // Stop any running trajectory animation so it doesn't keep ticking against the cleared scene.
      await plugin.managers.animation.stop();
      traj = undefined;
      // load-structure replaces the scene: v1 is single-structure, and every later
      // command reads structures[0], so a prior structure must be cleared first
      // (otherwise a second load would be appended and silently ignored).
      await plugin.clear();
      components.clear();
      signal?.throwIfAborted();                       // superseded → skip download + parse + preset
      const data =
        resolved.url !== undefined
          ? await plugin.builders.data.download(
              { url: resolved.url, isBinary: resolved.isBinary },
              { state: { isGhost: true } },
            )
          : await plugin.builders.data.rawData({ data: resolved.data! });
      signal?.throwIfAborted();                       // superseded → skip parse + preset
      const trajectory = await plugin.builders.structure.parseTrajectory(data, resolved.format);
      signal?.throwIfAborted();                       // superseded → skip preset
      await plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default');
    },
```

- [ ] **Step 2: Add checkpoints to `loadTrajectory`**

In the `loadTrajectory` method (line 313), change the signature and add two checkpoints — one at the top, one immediately before the `loadMolstarTrajectory` try (the single opaque call can't be interrupted mid-flight):

```ts
    async loadTrajectory(resolved: ResolvedTrajectory, signal?: AbortSignal): Promise<void> {
      signal?.throwIfAborted();
      // Stop any running animation, then snapshot the current scene BEFORE clearing so a
      // failed load (e.g. a topology/coordinate atom-count mismatch) can restore it rather
      // than leaving the viewer blank. The snapshot is only ever restored on the failure
      // path, so a successful load carries no behavioural change.
      await plugin.managers.animation.stop();
      const priorScene = plugin.state.data.getSnapshot();
      await plugin.clear();
      components.clear();
      traj = undefined;
      signal?.throwIfAborted();                       // superseded → skip the (uninterruptible) load
      let result;
      try {
        result = await loadMolstarTrajectory(plugin, {
```

(Leave the rest of `loadTrajectory` unchanged.)

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: exit 0 — the adapter now matches the widened port exactly; `signal?.throwIfAborted()` typechecks (global `AbortSignal`).

- [ ] **Step 4: Run the full suite (no regressions)**

Run: `pnpm test`
Expected: full Vitest suite PASS (unchanged — no Node test exercises the adapter; this confirms nothing else broke).

- [ ] **Step 5: Commit**

```bash
git add src/mol/adapter.ts
git commit -m "feat: honor AbortSignal at load checkpoints in the molstar adapter (#27)

loadStructure throwIfAborted()s after clear/download/parse so a superseded
in-flight load skips the remaining download+parse+preset; loadTrajectory
checks at the top and before its single opaque load call.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: demo rapid-switch verification

**Files:**
- Create: `examples/demo/src/panels/SupersedePanel.tsx`
- Modify: `examples/demo/src/App.tsx` (import + mount before the `{/* PANELS */}` marker)

**Interfaces:**
- Consumes: `useMolView()` and `viewer.dispatch(...)` from `@abycloud-co-uk/van-der-view/browser`; `Panel`/`ResultView` from `../ui`; the `CommandResult` type.
- Produces: a manual-verification panel; no exported API.

- [ ] **Step 1: Create the panel**

Create `examples/demo/src/panels/SupersedePanel.tsx`:

```tsx
import { useState } from 'react';
import { useMolView } from '@abycloud-co-uk/van-der-view/browser';
import type { CommandResult } from '@abycloud-co-uk/van-der-view';
import { Panel } from '../ui';

const code = (r: CommandResult) => (r.ok ? 'ok' : r.error.code);

/** Manual GPU verification for #27 (supersession + dedup). The library has no LLM here;
 *  these buttons fire raw load-structure commands so the result codes are observable. */
export function SupersedePanel() {
  const viewer = useMolView();
  const [log, setLog] = useState<string[]>([]);
  const disabled = !viewer;
  const load = (id: string) =>
    viewer!.dispatch({ name: 'load-structure', input: { source: 'pdb', id } });

  return (
    <Panel title="Supersede / Dedup (#27)">
      <button
        disabled={disabled}
        onClick={async () => {
          // Fire three different structures back-to-back without awaiting: latest wins.
          const results = await Promise.all([load('1crn'), load('1hsg'), load('4hhb')]);
          setLog(['rapid 1crn→1hsg→4hhb:', ...results.map((r, i) => `  #${i + 1}: ${code(r)}`)]);
        }}
      >
        Rapid A→B→C (expect first two superseded, last ok)
      </button>{' '}
      <button
        disabled={disabled}
        onClick={async () => {
          // Load the same structure twice in a row (sequential): the second is a dedup no-op.
          const first = await load('1crn');
          const second = await load('1crn');
          setLog([`reload same 1crn:`, `  first: ${code(first)}`, `  second: ${code(second)} (dedup → ok, no reload)`]);
        }}
      >
        Reload same (dedup)
      </button>
      <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{log.join('\n')}</pre>
    </Panel>
  );
}
```

- [ ] **Step 2: Mount it in the demo**

In `examples/demo/src/App.tsx`, add the import beside the other panel imports:

```tsx
import { SupersedePanel } from './panels/SupersedePanel';
```

and mount it immediately before the `{/* PANELS */}` marker:

```tsx
        <SupersedePanel />
        {/* PANELS */}
```

- [ ] **Step 3: Typecheck the demo**

Run: `pnpm --dir examples/demo exec tsc --noEmit`
Expected: exit 0. (If the demo has no local `tsc` script, run the demo's typecheck the same way the repo does — check `examples/demo/package.json` `scripts`; use that command. Expected: 0 errors.)

- [ ] **Step 4: Manual GPU verification**

Run the demo dev server (`pnpm --dir examples/demo dev`) on a GPU-capable browser. Then:
1. Click **Rapid A→B→C** — confirm the log shows `#1: superseded`, `#2: superseded`, `#3: ok`, and the final render is **4hhb** (the last). No blank/stuck viewer.
2. Load **1CRN** once via the Load panel, then click **Reload same (dedup)** — confirm `second: ok (dedup)` and the structure does NOT flash/reload (no blank frame). 
3. (Optional) Apply a color via the Representation panel, then **Reload same** — confirm the color persists (dedup no-op does not reset, per spec section 7).

Record the outcome in the PR description (GPU-verified, date, hardware).

- [ ] **Step 5: Commit**

```bash
git add examples/demo/src/panels/SupersedePanel.tsx examples/demo/src/App.tsx
git commit -m "demo: rapid-switch + reload-same panel for #27 verification

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] `pnpm test` — full Vitest suite green (149 baseline + the new supersession/dedup tests).
- [ ] `pnpm typecheck` — lib typecheck exit 0.
- [ ] `pnpm verify:package` — full release gate green (typecheck→test→build→publint→attw→molstar-free guard→dist smoke). The molstar-free guard in particular confirms `errors.ts`/`context.ts`/`executor.ts` stayed molstar-free.
- [ ] Demo GPU verification recorded (Task 4 Step 4).
- [ ] Then: superpowers:finishing-a-development-branch (push + PR; the user runs external review and merges).
