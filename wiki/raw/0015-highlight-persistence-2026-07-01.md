---
source_id: 0015
title: Persistent highlight (overpaint) + clear-highlight command — issue #38, branch fix/highlight-persistence
origin: "dev session 2026-07-01 (branch fix/highlight-persistence, closes #38; spec+plan under docs/superpowers/)"
fetched: 2026-07-01
type: user-note
supersedes: null
---

# Persistent highlight via overpaint + `clear-highlight` (#38)

Dev-born knowledge from fixing issue #38 ("highlight is transient — cleared by any
pointer hover"). Captured on branch `fix/highlight-persistence` (post-v0.4.0,
**currently unreleased**). Spec: `docs/superpowers/specs/2026-07-01-highlight-persistence-design.md`;
plan: `docs/superpowers/plans/2026-07-01-highlight-persistence.md`. Suite at 189 tests.

## The bug

`highlight` wrote to `plugin.managers.interactivity.lociHighlights.highlightOnly({ loci })`
— Mol\*'s **hover-marking** channel. Mol\*'s built-in hover behavior (from
`DefaultPluginSpec`) overwrites that channel on every pointer move, so any mouse
movement over the canvas instantly cleared a programmatic highlight.

## The fix (shipped on this branch)

- The vdv **`highlight` command is now a persistent Mol\* overpaint layer**:
  `setStructureOverpaint` / `clearStructureOverpaint` from
  `molstar/lib/mol-plugin-state/helpers/structure-overpaint`. Overpaint is a
  **state-tree representation modifier**, orthogonal to the render-time hover/select
  marking overlay and the camera — so the highlight survives hover / click / `focus`.
- **Replace semantics**: a new `highlight` wholesale-clears prior overpaint then
  repaints. Overpaint is **highlight-exclusive** in this adapter (set-color colors the
  vdv component's representation; preset-hiding uses the *transparency* node), so a
  wholesale `clearStructureOverpaint(plugin, presetComponents())` is a safe replace step.
- **Default color** yellow `Color(0xffff00)`, deliberately distinct from Mol\*'s pink
  hover marker (`rgb(255,102,153)`, `mol-gl/renderer.js` `highlightColor`).
- New dispatchable **`clear-highlight`** command (empty input schema `{}`) removes it;
  `MolView.clearHighlight()` (the handle) does too. Port members `highlight()` /
  `clearHighlight()` and `MolView.clearHighlight()` are now **`Promise<void>`** (were
  `void`); the executor awaits them.
- `highlight`'s **input schema is unchanged** (`{ selection }`) — no host codegen
  impact. **No new error code**: a failing overpaint commit propagates to the
  executor's existing catch → `internal_error` (consistent with the other appearance
  mutators, which also await and map GPU failures to `internal_error`).
- A scene reload (`load-structure` / `load-trajectory` → `plugin.clear()` +
  `components.clear()`) drops the highlight; the adapter also resets its tracked
  `highlightLoci` there.

## API gotcha (empirical, external-review finding #2) — the load-bearing lesson

`setStructureOverpaint` attaches its overpaint decorator **as a child of the
representation node** (`OverpaintStructureRepresentation3DFromBundle`). `set-color` /
`set-representation` rebuild a vdv component's representation node (delete +
`addRepresentation`), which **drops that overpaint child** — so restyling a highlighted
selection silently wiped the highlight, contradicting the "persists until
replaced/cleared/reloaded" guarantee.

**Fix:** the adapter tracks the active `highlightLoci` and **re-asserts** the overpaint
(a `paintHighlight(loci)` = clear-then-paint helper) at the end of `setColor` /
`setRepresentation` when a highlight is live; `clearHighlight` and every scene reload
clear it. This **corrects the original spec claim** that "no last-loci tracking is
needed" — that reasoning held only for *replace* semantics, not for surviving a
representation rebuild.

## Serialization gotcha (external-review finding #4)

The `MolView` handle's `clearHighlight()` originally ran on the **adapter
appearance-serializer**, but `loadStructure` runs on the **executor serializer** (a
different serialization domain) and is not wrapped in the adapter one — so a handle
clear could run `clearStructureOverpaint` against a half-built tree mid
`plugin.clear()`/`applyPreset`. **Fix:** route the handle's `clearHighlight()` through
`dispatch({ name: 'clear-highlight', input: {} })` so it shares the executor FIFO with
loads (no race; and it correctly waits for a load that would clear the highlight
anyway). The dispatched `clear-highlight` command is a normal non-load mutation on that
same FIFO — intentionally NOT put in the read-only bypass set (that would reintroduce
the race).

## Documented limitation (accepted; review finding #1, pushed back)

Overpaint colors **existing drawn geometry only** — a highlight on atoms no
representation draws (e.g. waters absent from the `default` preset) shows nothing yet
still returns `ok()`. Not a regression: the old loci marker also only marked drawn
geometry. Surfacing it as an error was judged out of scope for the minimal fix.

## Deferred / latent (review finding #7, pushed back)

The overpaint `lociGetter` (`async () => loci`) ignores the `structure` argument Mol\*
passes for multi-structure correctness — harmless in the v1 single-structure model,
and the same known limitation already noted for the transparency getter (see
molstar-appearance Open questions). Revisit with multi-structure (v1.1b).

## Review outcome

External high-effort review (4 finders, 8 surviving findings). **Fixed:** #2 (restyle
drops highlight), #4 (handle clear race), #5 (wiki claims lacked a `raw/` source — this
file), #8 (index.md missing clear-highlight). **Pushed back with reasoning:** #1
(documented no-op limitation), #3 (clear-highlight blocking behind a load is benign —
the load clears the highlight; the suggested read-only bypass would create #4's race),
#6 (`internal_error` on commit failure is intended + consistent), #7 (multi-structure
latent, deferred). Internal opus whole-branch review found no Critical/Important.
