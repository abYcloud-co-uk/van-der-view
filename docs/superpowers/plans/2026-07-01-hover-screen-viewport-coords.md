# Hover `screen` → viewport coordinates (#39) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `HoverInfo.screen` deliver true viewport/client coordinates so a host's `position: fixed` tooltip tracks the cursor wherever the canvas sits, fixing the top-left misplacement when the canvas is inset (#39).

**Architecture:** Mol\*'s hover `event.page` is canvas-relative (not DOM `pageX/pageY`). The conversion needs `canvas.getBoundingClientRect()` (DOM-only), so we keep the math a pure Node-testable helper in `src/hover.ts` and thread an *optional* transform through `subscribeHoverEvents`; only the DOM read lives at the browser seam in `src/mol/create-mol-view.ts`. The demo gains a reversible "Inset canvas" toggle so the fix is GPU-verifiable.

**Tech Stack:** TypeScript, Mol\* 5.10.1, Vitest (Node, off-GPU logic), React (demo), tsup build.

## Global Constraints

- `HoverInfo` shape, `onHover`, and `MolView.subscribeHover` **signatures are unchanged** — zero host codegen impact. No new fields.
- No new `ErrorCode`; no command-schema change.
- `toHoverInfo` and `viewportFromCanvasRelative` stay **pure** (no plugin/WebGL/DOM) so they run in Node/SSR. The only DOM access (`getBoundingClientRect`) lives in `src/mol/create-mol-view.ts`.
- `screen` contract = **viewport/client coordinates** (like `clientX/clientY`): `{ x: rect.left + canvasRelX, y: rect.top + canvasRelY }`, **no** scroll term.
- Existing `test/hover.test.ts` cases must keep passing unchanged (they call `subscribeHoverEvents` with two args; `toHoverInfo` still returns raw canvas-relative `screen`).
- `src/*` logic is Node-tested; GPU/DOM-bound code (`create-mol-view.ts`, demo) is typecheck-gated + manually GPU-verified — do not add Node tests that require a real plugin/WebGL.
- Commands: `pnpm test`, `pnpm typecheck` (covers `src` + `test`), `pnpm --dir examples/demo typecheck` (demo has its own tsconfig).

---

### Task 1: Pure conversion helper + optional transform in `src/hover.ts`

**Files:**
- Modify: `src/hover.ts` (add `viewportFromCanvasRelative`; add optional `transformScreen` param to `subscribeHoverEvents`; update `HoverInfo.screen` JSDoc + the `event.page` comment in `toHoverInfo`)
- Test: `test/hover.test.ts` (add a `viewportFromCanvasRelative` block; add two `subscribeHoverEvents` cases)

**Interfaces:**
- Consumes: `HoverInfo`, `toHoverInfo`, `HoverSource`, `subscribeHoverEvents` (all already in `src/hover.ts`).
- Produces:
  - `viewportFromCanvasRelative(rect: { left: number; top: number }, p: { x: number; y: number }): { x: number; y: number }` — returns `{ x: rect.left + p.x, y: rect.top + p.y }`.
  - `subscribeHoverEvents(source: HoverSource, cb: (info: HoverInfo | null) => void, transformScreen?: (p: { x: number; y: number }) => { x: number; y: number }): () => void` — applies `transformScreen` to `info.screen` when both are present, before seed-suppression/delivery.

- [ ] **Step 1: Write the failing tests**

Add this import to the top of `test/hover.test.ts` (extend the existing `../src/hover` import):

```ts
import {
  subscribeHoverEvents,
  toHoverInfo,
  viewportFromCanvasRelative,
  type HoverInfo,
  type HoverSource,
} from '../src/hover';
```

Add a new `describe` block (place it after the `toHoverInfo` describe, before `fakeSource`):

```ts
describe('viewportFromCanvasRelative', () => {
  it('adds the canvas rect offset to a canvas-relative point (inset canvas)', () => {
    expect(viewportFromCanvasRelative({ left: 200, top: 120 }, { x: 30, y: 40 })).toEqual({ x: 230, y: 160 });
  });

  it('is identity for a canvas at the viewport origin', () => {
    expect(viewportFromCanvasRelative({ left: 0, top: 0 }, { x: 55, y: 66 })).toEqual({ x: 55, y: 66 });
  });
});
```

Add these two cases inside the existing `describe('subscribeHoverEvents', ...)` block:

```ts
  it('applies transformScreen to a delivered info.screen (canvas-relative → viewport)', async () => {
    const structure = await buildStructureFromPDB(PDB_TINY);
    const residue = resolveSelection({ chain: 'A', residues: [1], numbering: 'auth' }, structure);
    const { source, emit } = fakeSource();
    const cb = vi.fn();
    subscribeHoverEvents(source, cb, (p) => ({ x: p.x + 200, y: p.y + 120 }));
    emit(hoverEvent(residue, [30, 40]));
    expect((cb.mock.calls[0][0] as HoverInfo).screen).toEqual({ x: 230, y: 160 });
  });

  it('does not apply transformScreen when there is no screen, and passes through raw when no transform', async () => {
    const structure = await buildStructureFromPDB(PDB_TINY);
    const residue = resolveSelection({ chain: 'A', residues: [1], numbering: 'auth' }, structure);

    // transform given, but the event carries no page → no screen → transform not applied, no throw
    const withXform = fakeSource();
    const cbX = vi.fn();
    subscribeHoverEvents(withXform.source, cbX, (p) => ({ x: p.x + 1, y: p.y + 1 }));
    withXform.emit(hoverEvent(residue)); // no page
    expect((cbX.mock.calls[0][0] as HoverInfo).screen).toBeUndefined();

    // no transform (default) → screen passes through canvas-relative (unchanged contract)
    const noXform = fakeSource();
    const cbN = vi.fn();
    subscribeHoverEvents(noXform.source, cbN);
    noXform.emit(hoverEvent(residue, [30, 40]));
    expect((cbN.mock.calls[0][0] as HoverInfo).screen).toEqual({ x: 30, y: 40 });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- hover`
Expected: FAIL — `viewportFromCanvasRelative` is not exported ("not a function" / TS import error), and the transform cases fail because the third arg is ignored.

- [ ] **Step 3: Add the pure helper**

In `src/hover.ts`, add this function immediately after `toHoverInfo` (after its closing `}` near line 76), before the `HoverSource` interface:

```ts
/**
 * Convert a canvas-relative pointer position (what Mol*'s hover event carries — see the
 * `event.page` note in `toHoverInfo`) to viewport/client coordinates by adding the canvas's
 * on-screen offset. `rect` is the canvas element's `getBoundingClientRect()`. Pure: the DOM
 * read (the rect) is done at the browser seam (`createMolView`), keeping this Node-testable.
 */
export function viewportFromCanvasRelative(
  rect: { left: number; top: number },
  p: { x: number; y: number },
): { x: number; y: number } {
  return { x: rect.left + p.x, y: rect.top + p.y };
}
```

- [ ] **Step 4: Add the optional `transformScreen` param to `subscribeHoverEvents`**

In `src/hover.ts`, change the signature and apply the transform. Replace the current parameter list:

```ts
export function subscribeHoverEvents(
  source: HoverSource,
  cb: (info: HoverInfo | null) => void,
): () => void {
```

with:

```ts
export function subscribeHoverEvents(
  source: HoverSource,
  cb: (info: HoverInfo | null) => void,
  transformScreen?: (p: { x: number; y: number }) => { x: number; y: number },
): () => void {
```

Then, inside the `source.subscribe` callback, insert the transform application **between** the `toHoverInfo` try/catch and the `if (!primed)` seed block:

```ts
    // event.page is canvas-relative; the browser seam supplies a transform to viewport coords.
    // A direct caller with no transform leaves screen canvas-relative.
    if (info?.screen && transformScreen) info.screen = transformScreen(info.screen);
```

(For reference, the block becomes:)

```ts
    let info: HoverInfo | null = null;
    try {
      info = toHoverInfo(event);
    } catch (err) {
      console.error('[van-der-view] subscribeHover: toHoverInfo failed:', err);
    }
    // event.page is canvas-relative; the browser seam supplies a transform to viewport coords.
    // A direct caller with no transform leaves screen canvas-relative.
    if (info?.screen && transformScreen) info.screen = transformScreen(info.screen);
    // Drop only a leading "nothing hovered" seed (the BehaviorSubject's initial replay); deliver
    // everything after, and deliver a seed that is itself a hover.
    if (!primed) {
      primed = true;
      if (info === null) return;
    }
```

- [ ] **Step 5: Update the JSDoc / comments (contract wording)**

In `src/hover.ts`, replace the `HoverInfo.screen` docstring (currently lines 28-31):

```ts
  /** Pointer position as **document** coordinates (pageX/pageY, scroll-inclusive) from the hover
   *  event; absent on non-pointer emits. A viewport-anchored tooltip (`position: fixed`) in a
   *  scrolling layout must offset by the scroll (subtract `window.scrollX`/`scrollY`); the
   *  full-viewport demo needs no offset because it does not scroll. */
  screen?: { x: number; y: number };
```

with:

```ts
  /** Pointer position as **viewport/client coordinates** (like `clientX/clientY`): drop it
   *  straight into a `position: fixed` tooltip (`left: screen.x, top: screen.y`) and it is
   *  correct wherever the canvas sits on the page. Absent on non-pointer emits. (Converted from
   *  Mol*'s canvas-relative hover coord at the browser seam — see `subscribeHoverEvents`.) */
  screen?: { x: number; y: number };
```

In the same file, replace the `event.page` line inside `toHoverInfo` (currently line 62):

```ts
  if (event.page) info.screen = { x: event.page[0], y: event.page[1] };
```

with:

```ts
  // event.page is Mol*'s CANVAS-RELATIVE pointer position (misleadingly named — it is NOT DOM
  // pageX/pageY; y is canvas-internal). Kept raw here so this stays pure; the browser seam
  // (createMolView.subscribeHover) converts it to viewport coords before a host sees it.
  if (event.page) info.screen = { x: event.page[0], y: event.page[1] };
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test -- hover`
Expected: PASS — the two new `viewportFromCanvasRelative` cases and the two new `subscribeHoverEvents` cases pass; all pre-existing hover cases still pass.

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/hover.ts test/hover.test.ts
git commit -m "fix(hover): add viewportFromCanvasRelative + optional screen transform (#39)"
```

---

### Task 2: Convert to viewport coords at the browser seam (`create-mol-view.ts`)

**Files:**
- Modify: `src/mol/create-mol-view.ts` (import `viewportFromCanvasRelative`; `subscribeHover` supplies the rect-based transform; update `MolView.subscribeHover` JSDoc)

**Interfaces:**
- Consumes: `viewportFromCanvasRelative` and the 3-arg `subscribeHoverEvents` from Task 1; `plugin.canvas3dContext?.canvas` (Mol\* `Canvas3DContext.canvas?: HTMLCanvasElement`); `bound.behaviors.interaction.hover` (existing hover source).
- Produces: `MolView.subscribeHover(cb)` now delivers `info.screen` in viewport coords.

- [ ] **Step 1: Extend the hover import**

In `src/mol/create-mol-view.ts`, replace line 10:

```ts
import { subscribeHoverEvents, type HoverInfo } from '../hover';
```

with:

```ts
import { subscribeHoverEvents, viewportFromCanvasRelative, type HoverInfo } from '../hover';
```

- [ ] **Step 2: Supply the transform in `subscribeHover`**

In the returned object (currently line 85), replace:

```ts
    subscribeHover: (cb) => subscribeHoverEvents(bound.behaviors.interaction.hover, cb),
```

with:

```ts
    // Mol*'s hover coord is canvas-relative; convert to viewport/client coords using the live
    // canvas rect so a host's position:fixed tooltip tracks the cursor wherever the canvas sits
    // (#39). getBoundingClientRect is read per-event (layout/scroll can change). If the canvas
    // element isn't available, degrade to canvas-relative rather than throw.
    subscribeHover: (cb) =>
      subscribeHoverEvents(bound.behaviors.interaction.hover, cb, (p) => {
        const canvas = bound.canvas3dContext?.canvas;
        if (!canvas) return p;
        const rect = canvas.getBoundingClientRect();
        return viewportFromCanvasRelative(rect, p);
      }),
```

- [ ] **Step 3: Update the `MolView.subscribeHover` JSDoc**

In `src/mol/create-mol-view.ts`, replace the current `subscribeHover` docstring (currently lines 30-36) with one that states the coord contract. Replace:

```ts
  /**
   * Subscribe to pointer-hover changes for a host tooltip. The callback gets a `HoverInfo`
   * for whatever is under the cursor, or `null` when the pointer leaves a target. Returns an
   * unsubscribe. A throwing callback is contained (it can't break Mol*'s own hover-highlight).
   * The empty initial state is NOT delivered — the first call corresponds to an actual hover
   * (or, if you subscribe while already hovering, that live target).
   */
```

with:

```ts
  /**
   * Subscribe to pointer-hover changes for a host tooltip. The callback gets a `HoverInfo`
   * for whatever is under the cursor, or `null` when the pointer leaves a target. Returns an
   * unsubscribe. A throwing callback is contained (it can't break Mol*'s own hover-highlight).
   * The empty initial state is NOT delivered — the first call corresponds to an actual hover
   * (or, if you subscribe while already hovering, that live target).
   *
   * `info.screen` is in **viewport/client coordinates** (ready for a `position: fixed` tooltip),
   * converted here from Mol*'s canvas-relative hover coord via the live canvas rect (#39).
   */
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. (This file is GPU/DOM-bound — it has no Node test; it is typecheck-gated here and GPU-verified in Task 3's demo pass. Do NOT add a Node test that needs a real plugin.)

- [ ] **Step 5: Commit**

```bash
git add src/mol/create-mol-view.ts
git commit -m "fix(hover): convert screen to viewport coords via canvas rect in subscribeHover (#39)"
```

---

### Task 3: Demo "Inset canvas" toggle (GPU-verifiable) + tooltip comment

**Files:**
- Modify: `examples/demo/src/App.tsx` (lift `inset` state to `App`; `HoverLayer` takes an `inset` prop and applies `vdv-canvas--inset`; add the Dev-tools checkbox; canvas `height: '100%'`; update tooltip comment)
- Modify: `examples/demo/src/theme.css` (add `.vdv-canvas--inset` offset style)

**Interfaces:**
- Consumes: `MolViewCanvas`, `HoverInfo` (from `@abycloud-co-uk/van-der-view/browser`); the viewport-coord `screen` from Task 2.
- Produces: nothing consumed by later tasks (verification harness only).

- [ ] **Step 1: Rewrite `App.tsx` to add the inset toggle**

Replace the entire contents of `examples/demo/src/App.tsx` with:

```tsx
import { useState } from 'react';
import { MolViewCanvas, type HoverInfo } from '@abycloud-co-uk/van-der-view/browser';
import { AgentPanel } from './panels/AgentPanel';
import { LoadPanel } from './panels/LoadPanel';
import { CommandsPanel } from './panels/CommandsPanel';
import { SceneContextPanel } from './panels/SceneContextPanel';
import { StepperPanel } from './panels/StepperPanel';
import { PasteToolUsePanel } from './panels/PasteToolUsePanel';
import { XrPanel } from './panels/XrPanel';
import { TrajectoryPanel } from './panels/TrajectoryPanel';
import { RepresentationPanel } from './panels/RepresentationPanel';
import { SupersedePanel } from './panels/SupersedePanel';

/**
 * Canvas + a cursor-following hover tooltip. Owns the hover state HERE (not in `App`) so a
 * pointer-move re-renders only this subtree — the panel column is spared. `inset` offsets the
 * canvas from the viewport origin so the #39 fix is visible: the tooltip must still track the
 * cursor (proving `screen` carries the canvas rect offset).
 */
function HoverLayer({ inset }: { inset: boolean }) {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  return (
    <div className={inset ? 'vdv-canvas vdv-canvas--inset' : 'vdv-canvas'}>
      <MolViewCanvas style={{ width: '100%', height: '100%' }} onHover={setHover} />
      {/* Render only when we have a position (`screen` may be absent on a non-pointer emit), so the
          tooltip never pins to the corner. `screen` is viewport/client coords (like clientX/clientY):
          a position:fixed tooltip at `screen` tracks the cursor wherever the canvas sits — no scroll
          or offset math (#39). */}
      {hover?.screen && (
        <div className="vdv-tooltip" style={{ left: hover.screen.x + 14, top: hover.screen.y + 14 }}>
          <div>{hover.label}</div>
          {/* `!= null`, not truthiness — a real blank auth chain id ('') still has residue detail. */}
          {hover.chain != null && (
            <div className="vdv-tooltip__meta">
              {hover.chain} · {hover.residueName} {hover.residueNumber}
              {hover.atomName ? ` · ${hover.atomName}` : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function App() {
  const [inset, setInset] = useState(false);
  return (
    <div className="vdv-app">
      <HoverLayer inset={inset} />
      <aside className="vdv-rail">
        <div className="vdv-rail__brand">
          <h1>
            van-der-<span className="vdv-accent">view</span>
          </h1>
          <span className="vdv-tag">Molecular AI Canvas</span>
        </div>

        {/* Primary surface: the conversational agent. */}
        <AgentPanel />

        {/* Everything else is developer tooling, tucked into a collapsible drawer. */}
        <details className="vdv-drawer">
          <summary>Dev tools</summary>
          <label className="vdv-inset-toggle">
            <input type="checkbox" checked={inset} onChange={(e) => setInset(e.target.checked)} />
            Inset canvas (verify #39 — tooltip must still track the cursor)
          </label>
          <LoadPanel />
          <TrajectoryPanel />
          <CommandsPanel />
          <RepresentationPanel />
          <SceneContextPanel />
          <StepperPanel />
          <PasteToolUsePanel />
          <XrPanel />
          <SupersedePanel />
        </details>
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Add the inset style to `theme.css`**

In `examples/demo/src/theme.css`, add immediately after the `.vdv-canvas { ... }` rule (currently line 64):

```css
/* Verification harness for #39: offset the canvas from the viewport origin so `rect.left/top`
   are non-zero. A position:fixed tooltip at HoverInfo.screen must still land on the cursor. */
.vdv-canvas--inset { margin: 120px 0 0 200px; outline: 2px dashed var(--vdv-color-primary); outline-offset: -2px; }

.vdv-inset-toggle { display: flex; align-items: center; gap: var(--vdv-space-xs); margin-bottom: var(--vdv-space-sm); font-size: 0.85rem; }
```

- [ ] **Step 3: Typecheck the demo**

Run: `pnpm --dir examples/demo typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add examples/demo/src/App.tsx examples/demo/src/theme.css
git commit -m "demo: add Inset canvas toggle to verify hover screen viewport coords (#39)"
```

> **GPU verification (performed by the human during the verify phase, not the implementer):** run the demo, open Dev tools, tick "Inset canvas", hover a residue — the tooltip tracks the cursor (with the pre-fix code it jumped toward the top-left).

---

### Task 4: Wiki raw snapshot (durable capture)

**Files:**
- Create: `wiki/raw/0018-hover-screen-viewport-coords-2026-07-01.md`
- Modify: `wiki/raw/README.md` (add the 0018 row to the source table)

**Interfaces:** none (documentation).

- [ ] **Step 1: Create the raw snapshot**

Create `wiki/raw/0018-hover-screen-viewport-coords-2026-07-01.md`:

```markdown
---
source_id: 0018
title: HoverInfo.screen fixed to viewport coords — Mol*'s hover event.page is canvas-relative, not pageX/pageY (#39)
origin: "dev session 2026-07-01 (branch fix/hover-screen-coords, closes #39)"
fetched: 2026-07-01
type: user-note
supersedes: null
---

# `HoverInfo.screen` → viewport coordinates (#39)

Dev-born knowledge from fixing issue #39 ("HoverInfo.screen is canvas-relative, not document
pageX/pageY as documented"). Branch `fix/hover-screen-coords`, post-v0.4.0, currently
unreleased. Spec: `docs/superpowers/specs/2026-07-01-hover-screen-viewport-coords-design.md`;
plan: `docs/superpowers/plans/2026-07-01-hover-screen-viewport-coords.md`.

## The bug

`src/hover.ts` set `HoverInfo.screen` straight from Mol*'s hover `event.page`, and documented it
as document coords ("pageX/pageY, scroll-inclusive"). But Mol*'s `HoverEvent.page` is **NOT** DOM
`pageX/pageY` — it is **canvas-relative**. In
`molstar/lib/mol-canvas3d/helper/interaction-events.js` the hover is emitted as
`page: Vec2.create(this.endX, this.endY)`, where `endX/endY` are the input observer's
canvas-relative `x, y` (client coords minus the canvas bounding rect); `endY` is even y-flipped
internally (the same file computes `input.height - this.endY` for the pick ray). So a host's
`position: fixed` tooltip placed at `screen` was correct only when the canvas sat at the viewport
origin; an inset canvas (e.g. a right-side panel) offset the tooltip to the top-left. The
full-viewport demo masked it because there `rect.left/top ≈ 0`, so canvas-relative == viewport.

## The fix (shipped on this branch)

`HoverInfo.screen` now carries **viewport/client coordinates** (like `clientX/clientY`):
`{ x: rect.left + canvasRelX, y: rect.top + canvasRelY }`, **no** scroll term — a `position: fixed`
tooltip at `screen` tracks the cursor wherever the canvas sits, scrolled or not, with zero host
math. Chosen over document/page coords (which would force the common `position: fixed` host to
subtract scroll).

Conversion needs `canvas.getBoundingClientRect()` (DOM-only), so it is split to keep the pure
layer Node-testable:
- `toHoverInfo` (pure) still emits the raw canvas-relative coord.
- New pure `viewportFromCanvasRelative(rect, p)` = `{ x: rect.left + p.x, y: rect.top + p.y }`.
- `subscribeHoverEvents` gains an **optional** `transformScreen` param, applied to `info.screen`;
  no transform → passthrough (existing Node tests unchanged).
- `src/mol/create-mol-view.ts` `subscribeHover` supplies the transform, reading the live canvas via
  `plugin.canvas3dContext?.canvas` (works for vdv-owned and host-provided plugins); if the canvas
  is unavailable it degrades to canvas-relative rather than throwing.

## No API/schema impact

`HoverInfo` shape, `onHover`, and `MolView.subscribeHover` signatures are unchanged — no host
codegen impact. No new `ErrorCode`; no command-schema change. Demo gains a reversible "Inset
canvas" dev-tools toggle so the fix is GPU-verifiable (the default full-viewport layout can't
show it). Suite grows from 189.
```

- [ ] **Step 2: Add the 0018 row to the raw index**

In `wiki/raw/README.md`, append this row to the "Index of sources" table (after the 0017 row):

```markdown
| 0018 | [0018-hover-screen-viewport-coords-2026-07-01.md](0018-hover-screen-viewport-coords-2026-07-01.md) | dev session 2026-07-01 (branch fix/hover-screen-coords — HoverInfo.screen fixed to viewport coords; Mol* event.page is canvas-relative, #39) | 2026-07-01 |
```

> Note: no existing `wiki/pages/*.md` documents `HoverInfo.screen` (the glossary's hover entry is about highlight-vs-selection, not `screen`), so there is no page `sources:` list to update and no page claim to cite raw/0018 yet. This is an accepted documentation gap for the minimal fix — a dedicated hover-surface page is out of scope.

- [ ] **Step 3: Commit**

```bash
git add wiki/raw/0018-hover-screen-viewport-coords-2026-07-01.md wiki/raw/README.md
git commit -m "docs(wiki): capture #39 hover screen viewport-coords fix (raw/0018)"
```

---

## After all tasks

- Dispatch the final whole-branch code review (superpowers:requesting-code-review) on the branch diff vs `main`.
- Human GPU verification of the demo inset toggle (Task 3 note).
- superpowers:finishing-a-development-branch → push + PR.
- **Post-merge (not branch tasks):** sync `CLAUDE.md` status bullet + `memory/roadmap.md`/`MEMORY.md`, and cut the release bundling #38 + #39.

## Self-Review

**Spec coverage:** viewport-coord decision → Tasks 1-2; pure/Node split → Task 1; browser-seam DOM read → Task 2; demo inset toggle + tooltip comment → Task 3; raw/0018 + doc-gap note → Task 4; no-API/schema/error-code → Global Constraints; verification commands → each task. Post-merge CLAUDE.md/memory + release → "After all tasks". All covered.

**Placeholder scan:** none — every code step carries full code; commands have expected output.

**Type consistency:** `viewportFromCanvasRelative(rect, p)` and the 3-arg `subscribeHoverEvents(source, cb, transformScreen?)` are defined identically in Task 1 and consumed with matching shapes in Task 2; the demo `HoverLayer({ inset })` prop and `vdv-canvas--inset` class match between Task 3's App.tsx and theme.css.
