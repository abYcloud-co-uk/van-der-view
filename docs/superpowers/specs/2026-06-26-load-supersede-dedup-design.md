# Load Supersede + Dedup — Design Spec

**Status:** Approved (brainstorm 2026-06-26)
**Branch:** `feat/load-supersede-dedup` (off `main` @ `fb9a986`)
**Closes:** issue #27 (load supersede/cancel — rapid reloads run every superseded load in full)

## 1. Goal

Stop wasting GPU/parse work on `load-structure` (and its sibling `load-trajectory`)
when a host drives rapid in-place structure switches on one `MolView`. Two
independent, automatic mechanisms, both default-on, **zero new public API**:

- **latest-wins supersession** — a newly dispatched scene-replacing load aborts every
  earlier still-pending scene mutation (queued *or* in-flight); the superseded load
  skips its remaining `download`/`parse`/`applyPreset` work and resolves a distinct
  `superseded` result. Solves the issue's `A->B->C` rapid-switch case.
- **dedup-on-same** — a `load-structure` whose resolved source equals the structure
  currently displayed is a no-op (returns `ok()`), skipping the entire reload. Solves
  the "repeatedly load the same address" case. Zero stored bytes (size-1 by
  construction, matching the consumer's "load another -> drop the old" framing).

The two are orthogonal: dedup can't help `A->B->C` (all different), supersession can't
help `A->A` (same source). Both live in the molstar-free `executor.ts`; the only
molstar-side change is honoring an `AbortSignal` threaded through the port.

## 2. Verified facts (firsthand, 2026-06-26, molstar 5.10.1)

- `executor.ts:275-277` — `dispatch` routes scene mutations through `createSerializer()`
  (FIFO, #23); reads (`get-scene-context`/`measure-distance`) bypass the queue (#4). The
  serializer only **orders**; it has no notion of cancel/supersede.
- `adapter.ts:248-266` — `loadStructure` runs unconditionally to completion:
  `animation.stop()` -> `traj = undefined` -> `plugin.clear()` -> `components.clear()` ->
  `download`(ghost)/`rawData` -> `parseTrajectory` -> `applyPreset(trajectory, 'default')`.
  No abort check anywhere between `clear()` and `applyPreset`.
- `adapter.ts:313-349` — `loadTrajectory` snapshots the prior scene, clears, then runs
  the **single opaque** `loadMolstarTrajectory(...)` call (download+parse+preset inside
  one await); restores the snapshot only on a mismatch/shape failure.
- `context.ts:42,48` — port methods today: `loadStructure(resolved): Promise<void>` and
  `loadTrajectory(resolved): Promise<void>`. No signal parameter.
- `errors.ts:7-16` — `ErrorCode` is a closed union; `ExecutorError(code, message)` carries
  it. The executor's catch maps `ExecutorError -> fail(e.code)`, everything else ->
  `internal_error` (`executor.ts:258-261`).
- `types.ts:10-21` — `CommandResult = {ok:true,data?} | {ok:false,error:{code,message}}`;
  `ok()` / `err(code, message)`. `CommandResult.error.code` is a plain `string` for
  consumers (the union is internal), so adding a code is non-breaking.
- `AbortController`/`AbortSignal`/`signal.throwIfAborted()` are global in the Node test
  env (vitest) and the browser — no polyfill needed.

## 3. The two mechanisms

### 3.1 latest-wins supersession (executor)

`dispatch` gains per-command abort tracking:

```ts
const SCENE_REPLACING = new Set<Command['name']>(['load-structure', 'load-trajectory']);
const readOnly = new Set<Command['name']>(['get-scene-context', 'measure-distance']); // unchanged
const pending = new Set<AbortController>();
const serialize = createSerializer();

function dispatch(command: Command): Promise<CommandResult> {
  if (readOnly.has(command.name)) return execute(command);          // no controller, immediate
  const controller = new AbortController();
  if (SCENE_REPLACING.has(command.name)) {
    for (const c of pending) c.abort();                              // supersede earlier pending
  }
  pending.add(controller);
  return serialize(() => execute(command, controller.signal))
    .finally(() => pending.delete(controller));
}
```

- Only **loads** trigger the abort sweep; every non-read command is *abortable* (gets a
  controller, joins `pending`) but only loads *abort* others. A command dispatched
  **after** the latest load is never superseded by it (it isn't in `pending` yet when the
  load's sweep runs).
- `controller.abort()` with no argument sets `signal.reason` to a default `AbortError`
  `DOMException`; the executor gates on `signal.aborted`, not on the reason, so no custom
  reason object is needed. Aborting an already-settled controller is a harmless no-op.
- `execute` always **resolves** a `CommandResult` (never rejects), so the serializer chain
  stays healthy; `.finally` removes the controller on every outcome.

`execute(command, signal?)` checks the signal at three points and returns `superseded`:

```ts
async function execute(command: Command, signal?: AbortSignal): Promise<CommandResult> {
  if (signal?.aborted) return fail('superseded', SUPERSEDED_MSG);   // (1) queued -> bail before any work
  try {
    switch (command.name) {
      case 'load-structure': {
        const resolved = await resolveStructure(...);
        if (signal?.aborted) return fail('superseded', SUPERSEDED_MSG); // (2) superseded during host fetch
        if (resolved.url === undefined && resolved.data === undefined) throw new ExecutorError('internal_error', ...);
        // ... dedup (section 3.2) ...
        await ctx.loadStructure(resolved, signal);                  // signal threaded into the adapter
        lastLoadedKey = keyOf(resolved);
        return ok();
      }
      // load-trajectory similar (post-resolve check + signal threaded + lastLoadedKey = undefined at commit)
      // ... other commands unchanged ...
    }
  } catch (e) {
    if (signal?.aborted) return fail('superseded', SUPERSEDED_MSG); // (3) abort surfaced as a throw -> superseded, not internal_error
    if (e instanceof ExecutorError) return fail(e.code, e.message);
    return fail('internal_error', e instanceof Error ? e.message : String(e));
  }
}
```

`SUPERSEDED_MSG = 'superseded by a newer scene load.'`

### 3.2 dedup-on-same (executor)

```ts
let lastLoadedKey: string | undefined;

// url-based identity only; inline data has no cheap stable identity -> never deduped.
// NUL ('\u0000') separator so a url can't forge a collision with a different
// (url, format, isBinary) triple.
function keyOf(resolved: ResolvedStructure): string | undefined {
  return resolved.url !== undefined
    ? [resolved.url, resolved.format, resolved.isBinary].join('\u0000')
    : undefined;
}
```

Inside `load-structure`, after the post-resolve abort check and the url/data presence
check, **before** calling `ctx.loadStructure`:

```ts
const key = keyOf(resolved);
if (key !== undefined && key === lastLoadedKey) return ok();        // already displayed -> no-op
lastLoadedKey = undefined;                                          // COMMIT: scene about to be cleared
await ctx.loadStructure(resolved, signal);
lastLoadedKey = key;                                                // success (key may be undefined for inline)
return ok();
```

`load-trajectory`, at its commit point (before `await ctx.loadTrajectory`):
`lastLoadedKey = undefined` (a trajectory replaces the structure scene and is never
deduped).

**Key invariant:** while a load is in progress `lastLoadedKey` is `undefined`; it equals a
real key only after a load **fully succeeded** and nothing has cleared the scene since.
This is what makes the two mechanisms compose correctly without an explicit
"invalidate-on-supersede" step — see section 4.

## 4. Edge-case analysis (why A + B compose; commands are serialized, no real concurrency)

| Scenario | Trace | Outcome |
|---|---|---|
| `A` shown, host re-sets content `A` (no burst) | `A2` not aborted -> `key A == lastLoadedKey(A)` -> **dedup no-op** | `A` stays, zero work, no flash OK |
| `A->B->C` rapid | dispatch C aborts B's controller; B bails at `execute` top (`superseded`, never touched scene); C loads fully | C shown OK |
| `A->B->A2` rapid, all queued | B bails at top (never committed -> `lastLoadedKey` still `A`); `A2` key `A == A` -> **dedup no-op** | `A` never cleared, zero work OK |
| `A->B(in-flight, already cleared)->A2` | B committed (`lastLoadedKey` already `undefined`) -> aborted -> throws at a checkpoint -> `superseded`; `A2`: `A != undefined` -> **reloads A** | A reloaded (scene *was* cleared by B), no empty-scene bug OK |
| `set-color`, then `load B` | dispatch B aborts the queued `set-color` -> it returns `superseded` (it targeted the soon-cleared scene); B loads | correct, B wins OK |
| `load B`, then `set-color` | `set-color` isn't a load -> aborts nothing -> queued after B -> runs on B | correct OK |

The "commit clears the key" trick distinguishes *queued-then-superseded* (key intact ->
dedup still valid) from *in-flight-then-superseded* (key already cleared -> reload) purely
by **where** the superseded load bailed. No bookkeeping needed.

## 5. Adapter checkpoints (in-flight cancel)

`adapter.ts` keeps the **existing clear-first order**; it only adds `signal?.throwIfAborted()`
at the await boundaries:

```ts
async loadStructure(resolved, signal) {
  signal?.throwIfAborted();                        // superseded before we start
  await plugin.managers.animation.stop();
  traj = undefined;
  await plugin.clear();
  components.clear();
  signal?.throwIfAborted();                        // skip download + parse + preset
  const data = resolved.url !== undefined ? await ...download(...) : await ...rawData(...);
  signal?.throwIfAborted();                        // skip parse + preset
  const trajectory = await plugin.builders.structure.parseTrajectory(data, resolved.format);
  signal?.throwIfAborted();                        // skip preset
  await plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default');
}
```

`loadTrajectory(resolved, signal)`: `signal?.throwIfAborted()` at the top (before
`animation.stop`/`clear`) and immediately before the `loadMolstarTrajectory(...)` call.

- Checkpoints sit **between** molstar steps, never inside one -> no half-built state. An
  abort landing mid-`download` can't cancel molstar's in-flight fetch (it completes), but
  `parse`+`preset` are still skipped.
- `loadMolstarTrajectory` is a **single opaque call** (download+parse+preset internally):
  an in-flight trajectory load **cannot** be interrupted mid-call. Only a *queued*
  trajectory load is skipped (the executor-top check already covers that; the adapter
  pre-call check is belt-and-suspenders for direct port calls). **Documented limitation.**
- A superseded in-flight `loadStructure` that bailed after `clear()` leaves the scene
  blank for the microtask until the superseding load runs — identical to today's
  clear-first blank window during any load. Out of scope to change (a future clear-last
  reorder would remove it).

## 6. Files

| File | Change |
|---|---|
| `src/errors.ts` | Add `'superseded'` to the `ErrorCode` union. |
| `src/context.ts` | `loadStructure(resolved, signal?: AbortSignal)` + `loadTrajectory(resolved, signal?: AbortSignal)` (optional -> existing fakes/tests still typecheck). |
| `src/executor.ts` | `pending`/controllers + abort sweep; `signal` param on `execute`; three abort checks; `lastLoadedKey` + `keyOf` + dedup; thread `signal` into `ctx.loadStructure`/`ctx.loadTrajectory`. |
| `src/mol/adapter.ts` | `throwIfAborted()` checkpoints in `loadStructure`/`loadTrajectory` (signature gains optional `signal`). |
| `examples/demo/` | A "rapid A->B->C" button that fires three loads back-to-back and logs each result code, so supersession/dedup are visible on a GPU. |
| `test/executor.test.ts` | New Node tests (section 8). |

## 7. Error handling & semantics

- `superseded` is a **benign, expected outcome**, not a failure: the host should read it as
  "this load was intentionally dropped because a newer one replaced it." The issue's
  consumer explicitly wants to ignore stale results — a distinct code enables exactly that
  and keeps real failures (`internal_error`, `trajectory_mismatch`, ...) uncontaminated.
- A dedup hit returns `ok()` (no data) — the requested structure **is** displayed, so this
  is honest. No no-op flag (YAGNI).
- **Behavior change (intended):** dedup makes "reload the identical source" a no-op, so it
  no longer resets prior `set-color`/`set-representation`/etc. on that structure. For an
  in-place `content`-prop viewer this is the desired no-flash behavior; documented so it
  isn't a surprise.
- **Limitation:** a host using per-call presigned URLs gets a different `resolved.url` each
  resolve -> dedup never hits (no harm, no benefit). Stable URLs / RCSB pdb ids / inline
  loads behave as designed (inline never dedups).

## 8. Testing

All supersession + dedup logic lives in the molstar-free executor -> **fully Node-testable**
with the existing `fakeContext`. The adapter checkpoints are typecheck-gated + GPU/demo
verified, per project convention (no Node test for the molstar adapter).

New `test/executor.test.ts` cases:

1. **dedup hit** — dispatch `load-structure` for the same pdb id twice -> `ctx.loadStructure`
   called **once**; second result is `ok`.
2. **dedup miss across a different load** — `A`, `B`, `A` -> `ctx.loadStructure` called
   **3x** (the middle `B` cleared the key).
3. **inline never dedups** — two inline-data loads -> `ctx.loadStructure` called **twice**.

Shared fake for the supersession tests:
`loadStructure = vi.fn(async (resolved, signal) => { calls.push(resolved); await gate; signal?.throwIfAborted(); })`
— mirrors the adapter (honors abort only **after** its await, like a post-`download`
checkpoint).

4. **in-flight + queued supersession (one test)** — `const pA = dispatch(loadA)`; **await a
   microtask** so A enters the gated fake (now in-flight); `const pB = dispatch(loadB)`;
   `const pC = dispatch(loadC)`; `release()`. Assert: `pA` resolves `superseded` (in-flight
   abort — fake **was** called for A, its `throwIfAborted` fired), `pB` resolves
   `superseded` (queued abort — fake **never called** for B, bailed at `execute` top), `pC`
   resolves `ok` (survivor); the fake saw exactly A and C (`calls.length === 2`).
   *Without the `await` before dispatching B, A would bail at the `execute` top too — a
   queued, not in-flight, supersession.*
5. **signal threaded** — `ctx.loadStructure` called with `(resolved, expect.any(AbortSignal))`.
6. **non-load superseded by a trailing load** — `set-color` then `load` -> the `set-color`
   resolves `superseded` (dispatched before the load's sweep), `ctx.setColor` not called.
7. **read bypass unaffected** — `get-scene-context` dispatched during a gated load resolves
   immediately (not queued, not superseded).

## 9. Out of scope (YAGNI / deferred)

- `view.cancelPending()` or an `AbortSignal` on the command input (explicit host control) —
  layerable later; the automatic default covers the filed issue.
- A multi-entry byte/structure LRU cache (reuse a *non-current* structure on `A->B->A`) —
  excluded by the consumer's size-1 "drop the old" framing.
- Clear-last reorder of `loadStructure` (remove the blank-during-load flash) — a real UX
  win but it changes GPU-verified behavior; separate future item.
- Cancelling molstar's in-flight `fetch` / interrupting `loadMolstarTrajectory` mid-call.
