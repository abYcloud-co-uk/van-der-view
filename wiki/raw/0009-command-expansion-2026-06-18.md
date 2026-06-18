---
source_id: 0009
title: Command expansion — appearance/visibility/measurement/label commands implemented
origin: "dev session 2026-06-18; task: van-der-view new command expansion (Downloads/vdv-command-expansion-prompt.md)"
fetched: 2026-06-18
type: user-note
supersedes: null
---

# Command expansion — 5 new commands (implemented, 2026-06-18)

Dev-born knowledge: the v1 catalog (5 commands) was expanded with **5 new commands**
that surface more of Mol\*'s built-in capability through the same Command / adapter /
executor seam (src: raw/0008). Pure TypeScript, unit-tested in pure Node. 95 tests;
`tsc --noEmit` and `vitest run` green. The existing 5 commands and types were left
intact (the union only grew).

## What landed (`src/`)
- `types.ts` — new shared const arrays + types:
  - `REPRESENTATION_TYPES` (`cartoon | ball-and-stick | spacefill | molecular-surface |
    gaussian-surface | point | line | ellipsoid`) → `RepresentationType`.
  - `COLOR_SCHEMES` (`element | chain | residue-index | secondary-structure | b-factor |
    hydrophobicity | sequence-id`) → `ColorScheme`.
  - Input interfaces `SetRepresentationInput`, `SetColorInput`, `ToggleVisibilityInput`,
    `MeasureDistanceInput`, `AddLabelInput`, and the `MeasureDistanceResult` data shape.
- `measure.ts` — **new pure-Node module**: `centroidOfLoci(loci)` (mean atom position via
  `StructureElement.Loci.forEachLocation` + `Location.position`, `Vec3`) and
  `distanceBetweenLoci(a, b)` (centroid-to-centroid `Vec3.distance`). No plugin/WebGL —
  unit-testable like `resolveSelection` (src: raw/0007).
- `context.ts` — `ExecutorContext` port extended with `setRepresentation / setColor /
  setVisibility / addLabel`, plus the `ColorSpec` union (`{ scheme } | { hex }`). The
  real Mol* adapter (Plan 3) and the test fake implement them.
- `commands.ts` — 5 new `CommandSpec` entries with LLM-facing descriptions (concrete
  JSON examples in each). Enums derive from the shared const arrays (no drift), reusing
  the existing `selectionSchema` fragment (measure-distance reuses it for `from`/`to`).
- `executor.ts` — 5 new `dispatch` cases + reusable validation helpers (`requireString`,
  `requireBoolean`, `requireEnum`, `requireColorSpec`, `requireSelectionAt(key)`,
  `nonEmptyLociFor`). `requireSelection` was generalized to `requireSelectionAt` so
  measure-distance can pull `from`/`to`.

## The 5 commands
| command | input | executor → port | returns data |
|---|---|---|---|
| `set-representation` | `{ selection, type: RepresentationType }` | `ctx.setRepresentation(loci, type)` | — |
| `set-color` | `{ selection, scheme? \| color? }` (exactly one) | `ctx.setColor(loci, {scheme}\|{hex})` | — |
| `toggle-visibility` | `{ selection, visible: boolean }` | `ctx.setVisibility(loci, visible)` | — |
| `measure-distance` | `{ from: Selection, to: Selection }` | none (pure `distanceBetweenLoci`) | `{ distanceAngstrom }` |
| `add-label` | `{ selection, text: string }` | `ctx.addLabel(loci, text)` | — |

## Key decisions
- **No new error codes.** Reuses the closed `ErrorCode` union (raw/0008): bad
  enum/type/missing field → `invalid_input`; no-match selection → `empty_selection`;
  no structure → `no_structure`.
- **set-color is scheme XOR hex.** Enforced in the executor (`requireColorSpec`), not the
  JSON Schema (the minimal `JSONSchema` type can't express oneOf and Anthropic tolerates
  the looser schema). `required` is just `['selection']`; description states the rule.
  Hex is validated `^#[0-9a-fA-F]{6}$`.
- **measure-distance computes in pure data, returns the number.** Center-to-center of the
  matched atoms. It does not need an `ExecutorContext` method — the high-value part for the
  agent is the returned scalar, fed back as `tool_result`.
- **`set-color` validates the color spec before resolving the loci** so a malformed color
  fails fast (and deterministically) regardless of whether a structure is loaded.

## OPEN (flagged, not decided)
- Representation/color **component management**: today the port call is fire-and-forget per
  selection; add/remove/update of named Mol\* *components* (selection+repr pairs) is deferred.
- **measure-distance** is centroid-to-centroid only; specific-atom / nearest-atom distance,
  and angle/dihedral measurements, are deferred. Multi-atom selections average (consistent
  with the `toLociWithSourceUnits` multi-model union noted in raw/0008).
- **add-label** has no id/handle, so labels can't yet be removed/updated individually; a
  label registry is deferred.
- **Named colors** (e.g. "red") are not accepted — hex only — to keep validation total.
- The real `PluginContext`→`ExecutorContext` adapter for all 4 new port methods is a Plan-3
  handoff (maps `type`/`scheme` to Mol\* repr/color theme names; `setVisibility` and
  `addLabel` to the structure-component manager / measurement manager).
