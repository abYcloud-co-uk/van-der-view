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
