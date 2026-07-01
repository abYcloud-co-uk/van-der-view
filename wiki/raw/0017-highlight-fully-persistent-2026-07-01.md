---
source_id: 0017
title: Highlight is fully persistent — click-empty does NOT clear it (GPU-verified correction to 0016)
origin: "dev session 2026-07-01 (branch fix/highlight-persistence; GPU pass by user)"
fetched: 2026-07-01
type: user-note
supersedes: 0016
---

# Highlight is fully persistent (GPU-verified) — correcting 0016's "click-empty clears" claim

Supersedes [0016](0016-highlight-select-marking-2026-07-01.md) on one point only.
Everything else in 0016 (select-marking mechanism, native tint + outline, replace
semantics, survives hover + representation rebuilds, dissolves review #2/#4) stands.

## The correction

0016 stated an "accepted tradeoff": left-click on an empty canvas fires Mol\*'s
`clickDeselectAllOnEmpty` → `deselectAll()` → clears the highlight. **The GPU pass
showed this does NOT happen**, and source inspection explains why:

- `mol-plugin/behavior/dynamic/representation.js` — the `SelectLoci` behavior's click
  handler **early-returns unless `this.ctx.selectionMode` is true** (the guard is
  `if (!this.ctx.canvas3d || this.ctx.isBusy || !this.ctx.selectionMode) return;`).
  **All** click-select bindings — `clickSelect`, `clickSelectOnly`, and
  `clickDeselectAllOnEmpty` — are gated behind it.
- `mol-plugin/context.js` — `selectionMode` defaults to **`false`**
  (`selectionMode: this.ev.behavior(false)`), and `createMolView` does not enable it.

So in the default vdv viewer, **clicking empty canvas (and clicking atoms) does not
touch the highlight**.

## Actual behavior (GPU-verified 2026-07-01)

The `highlight` is **fully persistent**: hover, click (empty *or* atoms), `focus`, and
`set-color`/`set-representation` restyle all leave it intact. It clears **only** via:
the `clear-highlight` command, `MolView.clearHighlight()`, a replacing `highlight`, or a
scene reload. This matches the original "persists until explicitly cleared/replaced/
reloaded" guarantee — there is no click-empty tradeoff after all.

**Caveat:** a host that sets `plugin.selectionMode = true` (e.g. to expose Mol\*'s own
selection UI) re-enables the click bindings, at which point clicks would start affecting
the highlight (it shares the `structure.selection` set). Not the case for the default
viewer or the demo.
