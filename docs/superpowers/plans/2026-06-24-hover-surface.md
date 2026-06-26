# Hover Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose hovered-structure info on the bare canvas via `MolView.subscribeHover` + a `<MolViewCanvas onHover>` prop, so a host can render its own tooltip without touching Mol\* internals (issue #29).

**Architecture:** A pure, molstar-dependent module `src/hover.ts` (Node-tested) holds `toHoverInfo` (event → `HoverInfo | null`) and `subscribeHoverEvents` (containment + mapping + unsubscribe wrapper over a structural hover source). `create-mol-view.ts` wires `MolView.subscribeHover` by calling the wrapper on `plugin.behaviors.interaction.hover`; `canvas.tsx` adds an `onHover` prop that subscribes through it. `browser.ts` exports the `HoverInfo` type.

**Tech Stack:** TypeScript, molstar 5.10.1, React 19, Vitest (tests run on TS source, no build), tsup (package build).

## Global Constraints

- molstar is pinned to **5.10.1**; `lociLabel` and loci/StructureProperties APIs are from this version (verified firsthand in the spec).
- `src/hover.ts` imports molstar, so it is part of the **browser entry only**. It MUST NOT be re-exported from the molstar-free barrel `src/index.ts` — only from `src/browser.ts`. (The `verify:package` molstar-free guard enforces this.)
- No new error codes; no change to `dispatch`/`CommandResult`/`SceneContext`/the `ExecutorContext` port/the command catalog.
- `label` is **plain text** — always `lociLabel(loci, { htmlStyling: false })`.
- `pnpm test` and `pnpm typecheck` run on TS source — no build needed for tests.
- Never `git add -A` (untracked gitignored local files exist: `.DS_Store`, `MD_Data/`, `.superpowers/`). Stage exact paths.
- Commits end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Branch is `feat/hover-surface` (already created off `main` @ `a4bbabc`; the spec commit `6807e84` is on it).

---

### Task 1: `toHoverInfo` + `HoverInfo` (pure extraction)

**Files:**
- Create: `src/hover.ts`
- Test: `test/hover.test.ts`

**Interfaces:**
- Consumes: `buildStructureFromPDB`, `PDB_TINY` from `test/fixtures/structures.ts`; `resolveSelection` from `src/selection.ts`.
- Produces:
  - `interface HoverInfo { label: string; chain?: string; residueName?: string; residueNumber?: number; atomName?: string; screen?: { x: number; y: number }; loci: Loci }`
  - `function toHoverInfo(event: InteractivityManager.HoverEvent): HoverInfo | null`

- [ ] **Step 1: Write the failing tests**

Create `test/hover.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import type { Structure } from 'molstar/lib/mol-model/structure';
import { StructureElement } from 'molstar/lib/mol-model/structure';
import { OrderedSet } from 'molstar/lib/mol-data/int';
import { Vec2 } from 'molstar/lib/mol-math/linear-algebra';
import type { InteractivityManager } from 'molstar/lib/mol-plugin-state/manager/interactivity';
import { PDB_TINY, buildStructureFromPDB } from './fixtures/structures';
import { resolveSelection } from '../src/selection';
import { toHoverInfo, type HoverInfo } from '../src/hover';

let structure: Structure;
beforeAll(async () => { structure = await buildStructureFromPDB(PDB_TINY); });

// Minimal HoverEvent: toHoverInfo reads only `current.loci` and `page`.
function hoverEvent(loci: unknown, page?: [number, number]): InteractivityManager.HoverEvent {
  return {
    current: { loci, repr: undefined },
    ...(page ? { page: Vec2.create(page[0], page[1]) } : {}),
  } as unknown as InteractivityManager.HoverEvent;
}

// A single-atom loci = first element of the first unit. PDB_TINY's first atom is N of GLY A 1.
function singleAtomLoci(s: Structure) {
  return StructureElement.Loci(s, [
    { unit: s.units[0], indices: OrderedSet.ofSingleton(0 as StructureElement.UnitIndex) },
  ]);
}

describe('toHoverInfo', () => {
  it('returns null for an empty loci (pointer over empty space)', () => {
    const empty = resolveSelection({ chain: 'Z' }, structure); // matches nothing
    expect(toHoverInfo(hoverEvent(empty))).toBeNull();
  });

  it('gives a plain-text (tag-free) label for a structure loci', () => {
    const residue = resolveSelection({ chain: 'A', residues: [1], numbering: 'auth' }, structure);
    const info = toHoverInfo(hoverEvent(residue)) as HoverInfo;
    expect(info.label.length).toBeGreaterThan(0);
    expect(info.label).not.toMatch(/<[^>]+>/); // no HTML tags
  });

  it('fills chain/residue fields for a structure loci, omitting atomName at residue granularity', () => {
    const residue = resolveSelection({ chain: 'A', residues: [1], numbering: 'auth' }, structure); // GLY1 = 3 atoms
    const info = toHoverInfo(hoverEvent(residue)) as HoverInfo;
    expect(info.chain).toBe('A');
    expect(info.residueName).toBe('GLY');
    expect(info.residueNumber).toBe(1);
    expect(info.atomName).toBeUndefined(); // 3-atom loci → not a single atom
  });

  it('sets atomName only when the loci is a single atom', () => {
    const info = toHoverInfo(hoverEvent(singleAtomLoci(structure))) as HoverInfo;
    expect(info.chain).toBe('A');
    expect(info.residueName).toBe('GLY');
    expect(info.residueNumber).toBe(1);
    expect(info.atomName).toBe('N'); // first atom of GLY A 1
  });

  it('derives screen coords from event.page, omitting them when absent', () => {
    const residue = resolveSelection({ chain: 'A', residues: [1], numbering: 'auth' }, structure);
    expect(toHoverInfo(hoverEvent(residue, [120, 340]))!.screen).toEqual({ x: 120, y: 340 });
    expect(toHoverInfo(hoverEvent(residue))!.screen).toBeUndefined();
  });

  it('always carries the raw loci', () => {
    const residue = resolveSelection({ chain: 'A', residues: [1], numbering: 'auth' }, structure);
    expect(toHoverInfo(hoverEvent(residue))!.loci).toBe(residue);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- hover`
Expected: FAIL — `Cannot find module '../src/hover'` (file not created yet).

- [ ] **Step 3: Write the minimal implementation**

Create `src/hover.ts`:

```ts
import { Loci } from 'molstar/lib/mol-model/loci';
import { StructureElement, StructureProperties } from 'molstar/lib/mol-model/structure';
import { OrderedSet } from 'molstar/lib/mol-data/int';
import { lociLabel } from 'molstar/lib/mol-theme/label';
import type { InteractivityManager } from 'molstar/lib/mol-plugin-state/manager/interactivity';

/**
 * Host-facing info about whatever is currently under the pointer, surfaced so a host can
 * render its own tooltip on the bare canvas without reaching into Mol* internals (#29).
 */
export interface HoverInfo {
  /** Ready-to-display, plain-text label — `lociLabel(loci, { htmlStyling: false })`, the same
   *  content Mol*'s native viewport tooltip shows. */
  label: string;
  /** auth chain id (e.g. 'A'); present only for a structure-element loci. */
  chain?: string;
  /** residue name (auth_comp_id, e.g. 'GLY'); structure-element loci only. */
  residueName?: string;
  /** residue number (auth_seq_id); structure-element loci only. */
  residueNumber?: number;
  /** atom name (auth_atom_id, e.g. 'CA') — only when the hovered loci is a single atom;
   *  omitted at residue/chain granularity, where it would be a misleading "first atom". */
  atomName?: string;
  /** screen coords (pageX/pageY) from the hover event; absent on non-pointer emits. */
  screen?: { x: number; y: number };
  /** the raw molstar loci, for advanced hosts. */
  loci: Loci;
}

/**
 * Map a Mol* hover event to a `HoverInfo`, or `null` when nothing is under the pointer
 * (empty loci — pointer left the structure). Pure: no plugin/WebGL — `lociLabel` and the
 * StructureProperties accessors run in Node. The real loci is `event.current.loci`.
 */
export function toHoverInfo(event: InteractivityManager.HoverEvent): HoverInfo | null {
  const loci = event.current.loci;
  if (Loci.isEmpty(loci)) return null;

  const info: HoverInfo = { label: lociLabel(loci, { htmlStyling: false }), loci };
  if (event.page) info.screen = { x: event.page[0], y: event.page[1] };

  if (StructureElement.Loci.is(loci)) {
    const loc = StructureElement.Location.create(loci.structure);
    // First non-empty element is representative for chain/residue (a hover loci at residue
    // granularity shares them across all its atoms).
    for (const e of loci.elements) {
      if (OrderedSet.size(e.indices) === 0) continue;
      loc.unit = e.unit;
      loc.element = e.unit.elements[OrderedSet.getAt(e.indices, 0)];
      info.chain = StructureProperties.chain.auth_asym_id(loc);
      info.residueName = StructureProperties.residue.auth_comp_id(loc);
      info.residueNumber = StructureProperties.residue.auth_seq_id(loc);
      if (StructureElement.Loci.size(loci) === 1) {
        info.atomName = StructureProperties.atom.auth_atom_id(loc);
      }
      break;
    }
  }
  return info;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- hover`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/hover.ts test/hover.test.ts
git commit -m "$(cat <<'EOF'
feat: add toHoverInfo + HoverInfo (pure hover extraction) (#29)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `subscribeHoverEvents` (containment + mapping + unsubscribe wrapper)

**Files:**
- Modify: `src/hover.ts` (append)
- Test: `test/hover.test.ts` (append)

**Interfaces:**
- Consumes: `toHoverInfo`, `HoverInfo` from Task 1.
- Produces:
  - `interface HoverSource { subscribe(observer: (event: InteractivityManager.HoverEvent) => void): { unsubscribe(): void } }`
  - `function subscribeHoverEvents(source: HoverSource, cb: (info: HoverInfo | null) => void): () => void`

Rationale: this isolates the only behavior-bearing part of the subscription (map via
`toHoverInfo`, contain a throwing host callback so it can't break the shared Subject,
return an unsubscribe) behind a structural source type, so it is Node-testable with a
fake source. The real `plugin.behaviors.interaction.hover` (a `BehaviorSubject`) is
structurally assignable to `HoverSource`.

- [ ] **Step 1: Write the failing tests**

Append to `test/hover.test.ts`:

```ts
import { vi } from 'vitest';
import { subscribeHoverEvents, type HoverSource } from '../src/hover';

function fakeSource() {
  let observer: ((e: InteractivityManager.HoverEvent) => void) | undefined;
  const unsubscribe = vi.fn();
  const source: HoverSource = {
    subscribe: (o) => { observer = o; return { unsubscribe }; },
  };
  return { source, unsubscribe, emit: (e: InteractivityManager.HoverEvent) => observer!(e) };
}

describe('subscribeHoverEvents', () => {
  it('maps events through toHoverInfo and delivers them to the callback', async () => {
    const structure = await buildStructureFromPDB(PDB_TINY);
    const residue = resolveSelection({ chain: 'A', residues: [1], numbering: 'auth' }, structure);
    const { source, emit } = fakeSource();
    const cb = vi.fn();
    subscribeHoverEvents(source, cb);

    emit(hoverEvent(residue));
    expect(cb).toHaveBeenCalledTimes(1);
    expect((cb.mock.calls[0][0] as HoverInfo).chain).toBe('A');

    const empty = resolveSelection({ chain: 'Z' }, structure);
    emit(hoverEvent(empty));
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb.mock.calls[1][0]).toBeNull();
  });

  it('contains a throwing callback (so it cannot break the shared hover Subject)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const structure = await buildStructureFromPDB(PDB_TINY);
    const residue = resolveSelection({ chain: 'A', residues: [1], numbering: 'auth' }, structure);
    const { source, emit } = fakeSource();
    subscribeHoverEvents(source, () => { throw new Error('host boom'); });

    expect(() => emit(hoverEvent(residue))).not.toThrow();
    expect(errorSpy.mock.calls.some((c) => String(c[0]).includes('callback threw'))).toBe(true);
    errorSpy.mockRestore();
  });

  it('returns an unsubscribe that tears down the source subscription', () => {
    const { source, unsubscribe } = fakeSource();
    const off = subscribeHoverEvents(source, vi.fn());
    expect(unsubscribe).not.toHaveBeenCalled();
    off();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- hover`
Expected: FAIL — `subscribeHoverEvents`/`HoverSource` not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `src/hover.ts`:

```ts
/** Minimal structural shape of the Mol* hover Subject (`plugin.behaviors.interaction.hover`),
 *  so the wiring is testable with a fake source and needs no rxjs import. */
export interface HoverSource {
  subscribe(observer: (event: InteractivityManager.HoverEvent) => void): { unsubscribe(): void };
}

/**
 * Subscribe to a hover source, deliver each event mapped through `toHoverInfo` (or `null`)
 * to `cb`, and return an unsubscribe. Both the mapping and the host callback are contained:
 * a throw must not propagate into the rxjs Subject, which is the SAME Subject that drives
 * Mol*'s hover-highlight — an uncontained throw would break core rendering, not just the host.
 */
export function subscribeHoverEvents(
  source: HoverSource,
  cb: (info: HoverInfo | null) => void,
): () => void {
  const sub = source.subscribe((event) => {
    let info: HoverInfo | null = null;
    try {
      info = toHoverInfo(event);
    } catch (err) {
      console.error('[van-der-view] subscribeHover: toHoverInfo failed:', err);
    }
    try {
      cb(info);
    } catch (err) {
      console.error('[van-der-view] subscribeHover callback threw:', err);
    }
  });
  return () => sub.unsubscribe();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- hover`
Expected: PASS (9 tests total in the file).

- [ ] **Step 5: Commit**

```bash
git add src/hover.ts test/hover.test.ts
git commit -m "$(cat <<'EOF'
feat: add subscribeHoverEvents wrapper (contain + map + unsubscribe) (#29)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire `MolView.subscribeHover` + export `HoverInfo`

**Files:**
- Modify: `src/mol/create-mol-view.ts` (`MolView` interface + returned object)
- Modify: `src/browser.ts` (export the `HoverInfo` type)

**Interfaces:**
- Consumes: `subscribeHoverEvents`, `HoverInfo` from `src/hover.ts`; `plugin.behaviors.interaction.hover` (a `BehaviorSubject<InteractivityManager.HoverEvent>`).
- Produces: `MolView.subscribeHover(cb: (info: HoverInfo | null) => void): () => void`; `HoverInfo` re-exported from the browser entry.

This task is GPU-adjacent (it touches the live plugin), so it is **typecheck-gated**, not
unit-tested directly — the behavior it delegates to is covered by Task 2, the prop wiring
by Task 4, and the live Subject by the demo (Task 5).

- [ ] **Step 1: Add the import to `src/mol/create-mol-view.ts`**

After the existing `import { createXrApi, type MolViewXR } from './xr';` line, add:

```ts
import { subscribeHoverEvents, type HoverInfo } from '../hover';
```

- [ ] **Step 2: Add `subscribeHover` to the `MolView` interface**

In `src/mol/create-mol-view.ts`, inside `export interface MolView { ... }`, add after the `clearHighlight(): void;` line:

```ts
  /**
   * Subscribe to pointer-hover changes for a host tooltip. The callback gets a `HoverInfo`
   * for whatever is under the cursor, or `null` when the pointer is over empty space.
   * Returns an unsubscribe. A throwing callback is contained (it can't break Mol*'s own
   * hover-highlight). Note: fires once on subscribe with the current state (usually `null`).
   */
  subscribeHover(cb: (info: HoverInfo | null) => void): () => void;
```

- [ ] **Step 3: Implement it in the returned object**

In `src/mol/create-mol-view.ts`, in the `return { ... }` object, add after `clearHighlight: () => ctx.clearHighlight(),`:

```ts
    subscribeHover: (cb) => subscribeHoverEvents(bound.behaviors.interaction.hover, cb),
```

(If TypeScript reports the `BehaviorSubject` is not assignable to `HoverSource`, wrap it:
`subscribeHoverEvents({ subscribe: (o) => bound.behaviors.interaction.hover.subscribe(o) }, cb)`.)

- [ ] **Step 4: Export `HoverInfo` from the browser entry**

In `src/browser.ts`, add alongside the other `export type` lines (e.g. next to the `MolViewCanvasProps` export):

```ts
export type { HoverInfo } from './hover';
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. (Confirms the `BehaviorSubject` → `HoverSource` assignability and the new interface member.)

- [ ] **Step 6: Verify the molstar-free barrel stays clean**

Run: `pnpm test -- public`
Expected: PASS — `test/public.test.ts` asserts the agent-side entry imports nothing from molstar; `hover.ts` must only be reachable from `browser.ts`, never `index.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/mol/create-mol-view.ts src/browser.ts
git commit -m "$(cat <<'EOF'
feat: MolView.subscribeHover + export HoverInfo (#29)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `onHover` prop on `MolViewCanvas`

**Files:**
- Modify: `src/react/canvas.tsx` (`MolViewCanvasProps`, signature, init effect)
- Test: `test/canvas.test.tsx` (append a describe block)

**Interfaces:**
- Consumes: `MolView.subscribeHover` (Task 3); `HoverInfo` from `src/hover.ts`.
- Produces: `MolViewCanvasProps.onHover?: (info: HoverInfo | null) => void`.

Coverage note: the throwing-callback containment lives in `subscribeHoverEvents` (Task 2,
already tested). The canvas test mocks `createMolView` with a fake `subscribeHover` stub, so
it verifies **wiring + unsubscribe-on-unmount**, not containment.

- [ ] **Step 1: Write the failing test**

Append to `test/canvas.test.tsx`. Note the existing file's top-level `vi.mock('../src/mol/create-mol-view', ...)` makes `createMolView` a mock that throws by default; here we override it per-test with `mockResolvedValueOnce` to return a fake view. Add this import near the top (after the existing imports):

```ts
import { createMolView } from '../src/mol/create-mol-view';
```

Then append this describe block at the end of the file:

```ts
describe('MolViewCanvas — onHover (#29)', () => {
  it('wires onHover through subscribeHover and unsubscribes on unmount', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let hoverCb: ((info: unknown) => void) | undefined;
    const unsub = vi.fn();
    const fakeView = {
      dispose: vi.fn(),
      subscribeHover: vi.fn((cb: (info: unknown) => void) => { hoverCb = cb; return unsub; }),
    };
    vi.mocked(createMolView).mockResolvedValueOnce(
      fakeView as unknown as Awaited<ReturnType<typeof createMolView>>,
    );

    const onHover = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MolViewProvider>
          <MolViewCanvas onHover={onHover} />
        </MolViewProvider>,
      );
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(fakeView.subscribeHover).toHaveBeenCalledTimes(1);

    // The canvas passes a stable wrapper; firing it calls the host onHover with the same value.
    const info = { label: 'GLY 1', chain: 'A', loci: {} };
    act(() => { hoverCb!(info); });
    expect(onHover).toHaveBeenCalledWith(info);
    act(() => { hoverCb!(null); });
    expect(onHover).toHaveBeenLastCalledWith(null);

    await act(async () => { root.unmount(); });
    expect(unsub).toHaveBeenCalledTimes(1);
    container.remove();
    errorSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- canvas`
Expected: FAIL — `MolViewCanvas` has no `onHover` prop / `subscribeHover` never called.

- [ ] **Step 3: Add `onHover` to the props interface**

In `src/react/canvas.tsx`, first add the type import at the top (after the existing React import line):

```ts
import type { HoverInfo } from '../hover';
```

Then in `export interface MolViewCanvasProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'> {`, add after the `onError?: ...` member:

```ts
  /** Called on pointer hover with info about the element under the cursor, or `null` when the
   *  pointer is over empty space — for rendering a custom tooltip on the bare canvas (#29). A
   *  throwing callback is contained. */
  onHover?: (info: HoverInfo | null) => void;
```

- [ ] **Step 4: Destructure `onHover` and add a ref**

Change the function signature from `export function MolViewCanvas({ onError, ...props }: MolViewCanvasProps) {` to:

```ts
export function MolViewCanvas({ onError, onHover, ...props }: MolViewCanvasProps) {
```

Then after the existing `onErrorRef` lines (`const onErrorRef = useRef(onError); onErrorRef.current = onError;`), add:

```ts
  // Ref so a changing onHover identity doesn't re-run the init effect (keyed on [plugin]).
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;
```

- [ ] **Step 5: Subscribe in the init effect and unsubscribe on cleanup**

In the `useEffect(() => { ... }, [plugin])`, add `let unsubHover: (() => void) | undefined;` right after `let created: { dispose(): void } | undefined;`.

Then, inside the async IIFE, after `registerView(view);`, add:

```ts
      // Subscribe unconditionally (one cheap listener): a host that adds onHover later works
      // without a re-init, and the ref indirection keeps the [plugin] effect stable.
      unsubHover = view.subscribeHover((info) => onHoverRef.current?.(info));
```

Then in the cleanup `return () => { ... }`, add `unsubHover?.();` before `created?.dispose();`:

```ts
    return () => {
      disposed = true;
      unsubHover?.();
      ctxRef.current.registerView(undefined);
      created?.dispose();
    };
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test -- canvas`
Expected: PASS (the new test plus the two existing #24/#3 tests).

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/react/canvas.tsx test/canvas.test.tsx
git commit -m "$(cat <<'EOF'
feat: MolViewCanvas onHover prop (#29)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Demo tooltip + full verification gate

**Files:**
- Modify: `examples/demo/src/App.tsx`

**Interfaces:**
- Consumes: `MolViewCanvas` `onHover` (Task 4); `HoverInfo` from the published browser entry.

This is the GPU/manual-verification surface (the demo drives the real adapter). No automated
test; ends with the full suite + typecheck gate.

- [ ] **Step 1: Add a hover tooltip overlay to the demo**

Rewrite `examples/demo/src/App.tsx` to track hover state and render a fixed-position tooltip:

```tsx
import { useState } from 'react';
import { MolViewCanvas, type HoverInfo } from '@abycloud-co-uk/van-der-view/browser';
import { LoadPanel } from './panels/LoadPanel';
import { CommandsPanel } from './panels/CommandsPanel';
import { SceneContextPanel } from './panels/SceneContextPanel';
import { StepperPanel } from './panels/StepperPanel';
import { PasteToolUsePanel } from './panels/PasteToolUsePanel';
import { XrPanel } from './panels/XrPanel';
import { TrajectoryPanel } from './panels/TrajectoryPanel';
import { RepresentationPanel } from './panels/RepresentationPanel';

export function App() {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif', background: '#111', color: '#eee' }}>
      <MolViewCanvas style={{ flex: 1, height: '100vh' }} onHover={setHover} />
      {hover && (
        <div
          style={{
            position: 'fixed',
            left: (hover.screen?.x ?? 0) + 14,
            top: (hover.screen?.y ?? 0) + 14,
            pointerEvents: 'none',
            background: 'rgba(0,0,0,0.85)',
            border: '1px solid #444',
            borderRadius: 4,
            padding: '4px 8px',
            fontSize: 12,
            maxWidth: 320,
            zIndex: 10,
          }}
        >
          <div>{hover.label}</div>
          {hover.chain && (
            <div style={{ color: '#9cf', marginTop: 2 }}>
              {hover.chain} · {hover.residueName} {hover.residueNumber}
              {hover.atomName ? ` · ${hover.atomName}` : ''}
            </div>
          )}
        </div>
      )}
      <div style={{ width: 380, overflowY: 'auto', padding: 16, background: '#181818', borderLeft: '1px solid #333' }}>
        <h1 style={{ fontSize: 16, marginTop: 0 }}>van-der-view demo</h1>
        <LoadPanel />
        <TrajectoryPanel />
        <CommandsPanel />
        <RepresentationPanel />
        <SceneContextPanel />
        <StepperPanel />
        <PasteToolUsePanel />
        <XrPanel />
        {/* PANELS */}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run the full suite**

Run: `pnpm test`
Expected: PASS — previously 149, now ~158 (Task 1 +6, Task 2 +3, Task 4 +1 ≈ 159).

- [ ] **Step 3: Typecheck the library (src + test)**

Run: `pnpm typecheck`
Expected: no errors. (Root tsconfig `include: ["src","test"]` — this does NOT cover the demo.)

- [ ] **Step 4: Typecheck the demo**

Run: `pnpm --filter van-der-view-demo typecheck`
Expected: no errors. The demo's tsconfig `paths` map `@abycloud-co-uk/van-der-view/browser` → `../../src/browser.ts` (TS source), so this resolves directly to source — no build needed first — and confirms the new `HoverInfo` export and `onHover` prop are visible to a consumer.

- [ ] **Step 5: Build (confirms the package entry + types compile)**

Run: `pnpm build`
Expected: tsup succeeds; `dist/browser.js` + `.d.ts` emitted with the new `subscribeHover`/`HoverInfo`/`onHover`.

- [ ] **Step 6: Commit**

```bash
git add examples/demo/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(demo): hover tooltip overlay driven by onHover (#29)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Manual GPU verification (user, on a real GPU)**

Run the demo (`pnpm --filter van-der-view-demo dev --host 127.0.0.1`), load a structure, and
hover atoms/residues. Confirm: the tooltip follows the cursor, shows a sensible plain-text
label, the chain/residue line populates, `atomName` appears only when hovering at element
granularity, and the tooltip disappears over empty space. This is the acceptance gate for the
GPU-bound subscription path.

---

## Notes for the implementer

- After Task 4, the agent-side guard (`test/public.test.ts`) and `verify:package`'s molstar-free
  check both still pass because `hover.ts` is only imported by `create-mol-view.ts` and
  `canvas.tsx` (browser entry), never by `src/index.ts`.
- Do not add rxjs as a dependency — `HoverSource` is a structural type precisely to avoid it.
- The whole feature is additive: no signatures change, no error codes, the molstar-free barrel
  is untouched. Releasing it is a minor version bump (planned: bundle with #27 into 0.3.0).
