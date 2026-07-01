---
source_id: 0016
title: Highlight pivot — overpaint to select-marking (review + user feedback, 2026-07-01)
origin: "dev session 2026-07-01 (branch fix/highlight-persistence, pivot from overpaint to select-marking after review + user feedback)"
fetched: 2026-07-01
type: user-note
supersedes: 0015
---

# Highlight pivot: overpaint → select-marking

After the initial overpaint implementation (raw/0015) landed on
`fix/highlight-persistence`, an external review and user feedback prompted a
pivot. This file records the pivot; raw/0015 remains as the superseded history.

## Why overpaint was abandoned

Overpaint (`setStructureOverpaint`) replaces a selection's geometry color with a
solid 100% color (e.g. yellow). Reviewers and the user noted that this reads as
**"recolored"**, not **"highlighted"** — there is no outline, no glow, no
semi-transparency, just a flat solid recolor over the representation. It was
also fragile:

- `setStructureOverpaint` attaches its decorator **as a child of the
  representation node**. When `set-color` or `set-representation` rebuilds
  that node, the overpaint child is silently dropped — so restyling a
  highlighted selection wiped the highlight, requiring the adapter to track
  `highlightLoci` and re-assert it (a non-trivial footgun).
- The handle-clear serialization problem (raw/0015 finding #4) showed the two
  serializers could race during a load.

## The new approach: Mol* select-marking channel

The shipped approach uses Mol\*'s **native select-marking channel**:

```ts
// highlight:
plugin.managers.interactivity.lociSelects.selectOnly({ loci }, false);
//   ↑ applyGranularity=false keeps exactly the resolved loci (no atom→chain expansion)

// clearHighlight:
plugin.managers.interactivity.lociSelects.deselectAll();
```

Both are **synchronous manager calls**. The port members stay `Promise<void>` —
the adapter methods are `async` wrappers around the synchronous calls; they are
**not** wrapped in `serialize` (no state-tree nodes, no race).

## What the native highlight looks like

Mol\*'s select channel produces:
- a **~30% color tint** (renderer `highlightStrength` default 0.3, `selectColor`)
- a **marking-pass edge outline / glow** (the `marking` post-process pass, enabled
  by default)

This is NOT a solid recolor. The effect reads as a real highlight.

Colors (Mol\* defaults, left at native values — vdv does not override them):
- hover channel (`lociHighlights`): `highlightColor` = pink rgb(255,102,153)
- select channel (`lociSelects`): `selectColor` = green rgb(51,255,25)

vdv uses the **select** channel, so the default highlight look is a green
tint + outline. The color is the global `selectColor`; it is tunable (renderer
params) but left at the native default.

## Persistence

Select is a **different channel** from hover. Mol\*'s built-in hover behavior
writes only to `lociHighlights` — it never touches `lociSelects` — so pointer
hover does NOT clear the vdv highlight. That was the root bug (#38).

Clicking atoms in the default plugin config does not clear it either: the default
`clickSelect` / `clickSelectOnly` behavior bindings are empty.

**Accepted tradeoff:** The default plugin binds **left-click on empty canvas** to
`deselectAll()` via the `clickDeselectAllOnEmpty` behavior. So clicking an empty
area of the canvas clears the highlight. This is accepted: it follows Mol\*'s
native selection UX, and `clear-highlight` / `MolView.clearHighlight()` + a scene
reload are the explicit clear paths.

## Replace semantics

`lociSelects.selectOnly()` (note: `selectOnly`, not `select`) **replaces** the
prior selection atomically: one call both clears the previous select and marks
the new loci. This is the correct replace-semantics primitive.

## How this dissolves earlier review findings

The pivot to select-marking also dissolves two findings that the overpaint
approach needed code to fix:

- **Finding #2 (set-color/set-representation drops highlight):** With overpaint,
  rebuilding a representation node dropped the overpaint child. With
  select-marking, the selection lives in `structure.selection` (a manager set,
  not a decorator on a representation node) and Mol\* **re-applies the marking**
  from `structure.selection` across any representation rebuild automatically. No
  `highlightLoci` tracking needed.
- **Finding #4 (handle-clear race with loadStructure):** With overpaint, routing
  the handle's `clearHighlight()` through `dispatch` was necessary to avoid a
  race between the adapter serializer and the executor serializer. With
  select-marking, `deselectAll()` is a safe render-time op that can be called
  anytime — no state-tree mutation, no serialization domain conflict.

## Behavior summary

| Property | Value |
|---|---|
| Mol\* channel | `lociSelects` (select-marking) |
| Look | native ~30% tint + marking-pass edge outline (green by default) |
| Persistent across hover | yes — hover writes to `lociHighlights`, never `lociSelects` |
| Persistent across representation rebuilds | yes — re-applied from `structure.selection` |
| Replace semantics | `selectOnly` replaces atomically |
| Clear paths | `clear-highlight` command / `MolView.clearHighlight()` / scene reload (`plugin.clear()`) / left-click-on-empty-canvas (native Mol\* default) |
| No-new-error-code | correct — no new `ErrorCode` |
| Input schema | unchanged (`{ selection }`) |
| Suite | 189 tests |
| Status | post-v0.4.0, unreleased |
