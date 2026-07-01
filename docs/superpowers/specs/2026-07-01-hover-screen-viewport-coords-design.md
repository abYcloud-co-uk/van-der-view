# Fix `HoverInfo.screen` to true viewport coordinates (issue #39)

**Date:** 2026-07-01
**Issue:** [#39](https://github.com/abYcloud-co-uk/van-der-view/issues/39) — "HoverInfo.screen is canvas-relative, not document pageX/pageY as documented — host tooltips misplace when the canvas is inset"
**Status:** approved design → writing-plans
**Scope:** post-v0.4.0, currently unreleased. Bundles with #38 (persistent highlight, merged PR #40) into the next release.

---

## Problem

`HoverInfo.screen` is the pointer position vdv hands a host so it can place its own
tooltip on the bare canvas (from the hover surface, #29 / PR #30). Its docstring
(`src/hover.ts:28-31`) promises **document coordinates** — "pageX/pageY, scroll-inclusive."

It is actually **canvas-relative**. `src/hover.ts:62` copies Mol\*'s hover event `page`
field verbatim:

```ts
if (event.page) info.screen = { x: event.page[0], y: event.page[1] };
```

But `HoverEvent.page` is **not** the DOM `pageX/pageY`. In
`molstar/lib/mol-canvas3d/helper/interaction-events.js` the hover is emitted as
`page: Vec2.create(this.endX, this.endY)`, where `endX/endY` come from the input
observer's **canvas-relative** `x, y` (client coords minus the canvas bounding rect;
`endY` is even y-flipped internally — the same file computes `input.height - this.endY`
to build the pick ray). Mol\*'s field is misleadingly named.

### Impact

A host that positions a `position: fixed` tooltip at `screen` gets the right place
**only when the canvas sits at the viewport origin**. When the canvas is inset — e.g. a
right-hand panel — the tooltip is offset by the canvas's `left`/`top` and lands in the
wrong place (top-left of the window). Found integrating v0.4.0 into a host with
`<MolViewCanvas>` in a right-side panel.

### Why the demo masked it

The demo canvas is `.vdv-canvas { flex: 1 }` on the **left**, rail on the right
(`examples/demo/src/theme.css:62-64`). So `rect.left ≈ 0, rect.top ≈ 0`, and
canvas-relative *happens to equal* viewport coords. The bug is structurally invisible in
the current demo layout.

---

## Decision: `screen` becomes viewport/client coordinates

`HoverInfo.screen` will deliver **viewport/client coordinates** (like `clientX/clientY`):

```
screen = { x: rect.left + canvasRelX, y: rect.top + canvasRelY }   // no scroll term
```

A host drops it straight into a `position: fixed` tooltip (`left: screen.x, top: screen.y`)
and it is correct **wherever the canvas sits — inset or not, scrolled or not — with zero
host math.** This matches both the demo and the reporting host, which use `position: fixed`.

Rejected alternative — **document/page coords** (`+ window.scrollX/scrollY`): keeps the
old "pageX/pageY" wording but forces the common `position: fixed` host to *subtract*
scroll. That is the awkward contract we have today; we drop it.

No change to the `HoverInfo` shape, to `onHover`, or to `subscribeHover` signatures →
**zero host codegen impact.** No new error code. No command-schema change.

---

## Constraint driving the architecture

The conversion needs `canvas.getBoundingClientRect()` — **DOM-only**. It cannot live in
`toHoverInfo`, which is **pure / Node / SSR-safe** (PR #30's review explicitly upheld
this). So the DOM access stays at the browser seam, and the math stays a pure,
Node-testable helper. The canvas element is reachable from the plugin as
`plugin.canvas3dContext?.canvas` (verified: `Canvas3DContext.canvas?: HTMLCanvasElement`,
set for both vdv-owned and host-provided plugins).

---

## Design

### 1. `src/hover.ts` (pure layer — Node-tested)

- **`toHoverInfo`** — logic unchanged; still sets `screen` from `event.page`. Only its
  JSDoc changes to state the value is **canvas-relative pre-transform**, converted to
  viewport coords by the browser seam before a host sees it.

- **New pure helper** — Node-testable, no DOM:
  ```ts
  /** Convert a canvas-relative pointer position to viewport/client coordinates by adding
   *  the canvas's on-screen offset. `rect` is the canvas's getBoundingClientRect(). */
  export function viewportFromCanvasRelative(
    rect: { left: number; top: number },
    p: { x: number; y: number },
  ): { x: number; y: number } {
    return { x: rect.left + p.x, y: rect.top + p.y };
  }
  ```

- **`subscribeHoverEvents`** — gains an **optional** third parameter:
  ```ts
  export function subscribeHoverEvents(
    source: HoverSource,
    cb: (info: HoverInfo | null) => void,
    transformScreen?: (p: { x: number; y: number }) => { x: number; y: number },
  ): () => void
  ```
  After mapping, if `info?.screen && transformScreen`, replace `info.screen` with
  `transformScreen(info.screen)` **before** the seed-suppression / `cb` delivery. When
  `transformScreen` is absent the value passes through unchanged → **all existing Node
  tests stand.** The seed-drop, throw-containment, and unsubscribe behavior are unchanged.

- **`HoverInfo.screen` docstring** rewritten:
  > Pointer position as **viewport/client coordinates** (like `clientX/clientY`) — ready
  > for a `position: fixed` tooltip (`left: screen.x, top: screen.y`), correct wherever the
  > canvas sits. Absent on non-pointer emits.

  The scroll caveat is removed.

### 2. `src/mol/create-mol-view.ts` (browser/DOM layer — typecheck-gated + demo-verified)

`subscribeHover` supplies the transform:

```ts
subscribeHover: (cb) =>
  subscribeHoverEvents(bound.behaviors.interaction.hover, cb, (p) => {
    const canvas = bound.canvas3dContext?.canvas;
    if (!canvas) return p; // can't convert without the element — degrade to canvas-relative, never throw
    const rect = canvas.getBoundingClientRect();
    return viewportFromCanvasRelative(rect, p);
  }),
```

`MolView.subscribeHover` JSDoc updated to note `screen` is viewport coords for a
`position: fixed` tooltip.

### 3. Demo (`examples/demo/`) — make the inset case GPU-verifiable

The current full-viewport layout can't show the bug. Add a **reversible "Inset canvas"
dev-tools checkbox**:

- Lift an `inset` boolean to `App`; pass it into `HoverLayer` (which owns `.vdv-canvas`).
- When on, apply a class (`vdv-canvas--inset`) that offsets the canvas container by a
  clearly visible margin (e.g. `margin: 120px 0 0 200px`) with a visible outline so the
  inset is obvious.
- A checkbox in the "Dev tools" drawer toggles it.
- Verification: with inset ON, hover a residue → the tooltip tracks the cursor (proving
  `rect.left/top` is applied). With the pre-fix code it would jump toward the top-left.
- Update the `App.tsx` tooltip comment: `screen` is viewport/client coords for
  `position: fixed`; no scroll math.

### 4. Docs / wiki

- **`wiki/raw/0018-...`** — capture the empirical finding (Mol\* `HoverEvent.page` is
  canvas-relative, not `pageX/pageY`; `endY` is y-flipped internally) and the decision
  (vdv converts to viewport coords at the browser seam). `type: user-note`,
  `origin: "dev session 2026-07-01 (branch fix/hover-screen-coords, #39)"`, `supersedes: null`.
- The glossary's hover mention (`wiki/pages/glossary.md:24`) is about highlight-vs-selection,
  not `screen`, so no glossary edit is required for #39; add the raw/0018 ref only if a page
  gains a `screen`/coords claim. (There is no dedicated hover-surface wiki page today; a
  brief pointer may be added but is not required for this fix.)
- **CLAUDE.md** status bullet + **memory** synced after merge, alongside the #38+#39 release.

### 5. Tests

`test/hover.test.ts`:
- `viewportFromCanvasRelative` — pure math: adds `rect.left`/`rect.top`; handles zero rect
  (identity) and a non-zero rect (offset applied).
- `subscribeHoverEvents` with a `transformScreen` — the transform is applied to a delivered
  `info.screen`; a `null` info and an info without `screen` are untouched; passthrough when
  no transform is given (covered by existing tests, which pass none).
- Existing hover tests are **unchanged** (they call `subscribeHoverEvents` with two args).

---

## Non-goals

- No new `HoverInfo` fields (no separate `page` + `client`). YAGNI for a v0.x surface; the
  single most-useful value is the ready-to-use viewport coord.
- No change to click surface (`onClick`/`subscribeClick` remains a deferred #29 follow-up).
- No change to the hover label / structured fields.

## Verification

- `pnpm test` — new + existing suite green (suite grows from 189).
- `pnpm typecheck` and `pnpm --dir examples/demo typecheck`.
- Demo GPU pass with "Inset canvas" ON: tooltip tracks the cursor.

## Files touched

| File | Change |
|---|---|
| `src/hover.ts` | new pure `viewportFromCanvasRelative`; optional `transformScreen` on `subscribeHoverEvents`; JSDoc on `HoverInfo.screen` + `toHoverInfo` |
| `src/mol/create-mol-view.ts` | `subscribeHover` supplies the rect-based transform; JSDoc |
| `test/hover.test.ts` | tests for the helper + transform application |
| `examples/demo/src/App.tsx` | `inset` state + checkbox wiring; tooltip comment |
| `examples/demo/src/theme.css` | `.vdv-canvas--inset` offset style |
| `wiki/raw/0018-...md` | empirical finding + decision |
| `CLAUDE.md`, memory | post-merge sync (with the release) |
