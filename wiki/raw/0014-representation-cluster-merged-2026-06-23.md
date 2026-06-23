---
source_id: 0014
title: v1.1a representation cluster merged (PR #21) — appearance model, GPU-verified
origin: "van-der-view repo — PR #21 (feat/v1.1a-representation) merged into main 2026-06-23; synthesized from the adapter, the appearance-model spec, the GPU passes, and three code-review rounds"
fetched: 2026-06-23
type: file-excerpt
supersedes: null
---

# v1.1a representation cluster — landing notes

Five agent commands (`set-representation`, `set-color`, `toggle-visibility`,
`measure-distance`, `add-label`) merged via PR #21, digested from the open PR #11
agent-side code. PR #11 was un-mergeable (8 file conflicts, a raw/0009 collision,
and it added 4 port members with no adapter impl → typecheck fail); it was treated
as design input + reusable agent-side source and is closed, its functionality folded in.

The agent-side schema (types + the 5 `CommandSpec`s) and `measure-distance` (pure-Node)
were straightforward. The hard, twice-rewritten part was the **GPU-side appearance model**.

## The 5 commands

| command | input | port member | Mol* realization |
|---|---|---|---|
| `set-representation` | `{ selection, type }` | `setRepresentation(loci,type): Promise<void>` | per-selection component + one representation of `type` |
| `set-color` | `{ selection, scheme? \| color? }` (exactly one) | `setColor(loci,color): Promise<void>` | color on that component's representation |
| `toggle-visibility` | `{ selection, visible:bool }` | `setVisibility(loci,visible): Promise<void>` | toggle the component, or per-loci transparency |
| `measure-distance` | `{ from:Selection, to:Selection }` | **none** (pure-Node) | centroid–centroid Å via `measure.ts` |
| `add-label` | `{ selection, text }` | `addLabel(loci,text): Promise<void>` | `measurement.addLabel`, replace-in-place |

- `type` ∈ `cartoon, ball-and-stick, spacefill, molecular-surface, gaussian-surface, point, line, ellipsoid`.
- `scheme` ∈ `element, chain, residue-index, secondary-structure, b-factor, hydrophobicity, sequence-id`.
- **No new error codes** — the cluster reused the existing taxonomy.
- The 4 mutator port members are `Promise<void>` and the executor **awaits** each, so a failed
  GPU op surfaces as a reported `internal_error` instead of a silent `ok()`.

## The appearance model — two rejected drafts, then GPU settled it

- **v1** (per-selection component drawn *over* the `default` preset) → double-draws
  (preset cartoon + new spacefill both visible); `set-color` spawned a whole-chain
  ball-and-stick layer; `toggle-visibility` didn't hide (preset still drew the atoms).
- **v2** (color moved onto the preset: hex → `setStructureOverpaint`, scheme → structure-wide
  `updateRepresentationsTheme`; preset hidden under transparency). A second review + a GPU pass
  proved it incoherent: color lived in a *different place* (the preset) than the representation it
  was meant to color (the vdv component), so they never composed — color didn't persist across a
  representation change, hex masked a later scheme, schemes went structure-wide, and the clear-all
  idempotency wiped other selections' colors.
- **GPU evidence that settled the design (user ran tests A–E on v2):** representation `spacefill`
  showed a *clean* spacefill with **no cartoon ghost** → **transparency-hiding the preset works**,
  so the fix does **not** need Mol*'s component-subtraction (carve-out). The other observations
  (color reverts to CPK after a rep change; solid blue stays blue under a b-factor scheme; b-factor
  recolors the whole 1HSG) confirmed the v2 incoherence.

### Final model — one owned component per selection

Each styled selection owns **one** vdv component (created via
`builders.structure.tryCreateComponentFromExpression`, keyed by a **full-identity** loci key)
holding its representation **and** color. The preset's draw of those atoms is hidden with
**per-loci transparency**. No structure-wide mutation, no clear-all, no overpaint.

- **Color lives on the component's representation** — hex → `color:'uniform' + colorParams:{value}`;
  scheme → `color:<theme name>`, which Mol\* scopes to the component's atoms → **schemes are
  per-selection** (not structure-wide). Color is stored on the cache entry, so it **persists**
  across later representation changes (`set-representation` re-applies it).
- **`set-color` with no prior representation** uses `defaultReprFor(loci)`: polymer → `cartoon`,
  else → `ball-and-stick` (mirrors the preset; no more dense whole-chain ball-and-stick).
- **Preset-hiding is scoped to what the rep draws.** A `cartoon` draws only polymer, so for
  cartoon only the **polymer subset** of the selection is hidden — otherwise non-polymer atoms
  (waters/ligands) in the selection are hidden yet never redrawn and *vanish* (a GPU-round-1 bug:
  coloring `{chain:'A'}` on 1HSG made chain A's waters disappear). The whole selection is restored
  (transparency 0) *before* hiding (transparency 1) so switching rep types leaves no stale-hidden
  atoms. (A later 0-layer shadows an earlier 1-layer per `Transparency.merge`, which processes
  layers latest-first.)
- **`toggle-visibility`**: an owned selection toggles its component via `setSubtreeVisibility`
  (preset already hidden); an unstyled selection uses per-loci transparency `visible ? 0 : 1`.
- **Serialization**: all four mutators run on **one global op chain** — they share the single
  preset transparency cell and the component tree, so even calls on *different* selections must not
  interleave read-modify-write commits (a per-loci-key lock wouldn't stop a chain-A vs chain-B race
  on the shared cell). They are infrequent GPU writes, so global serialization is free.

## Mol* 5.10.1 appearance APIs (verified against `.d.ts` + sources)

- `plugin.builders.structure.tryCreateComponentFromExpression(structureCell, expression, key)` —
  loci → component, via `StructureElement.Bundle.fromLoci(loci)` → `Bundle.toExpression`.
- `plugin.builders.structure.representation.addRepresentation(component, { type, color, colorParams })`.
- `setStructureTransparency(plugin, components, value, lociGetter, types?)` /
  `clearStructureTransparency(…)` from `mol-plugin-state/helpers/structure-transparency`. `value: 1`
  = invisible, `0` = opaque; layers are appended and merged at render (`mol-theme/transparency.js`
  `Transparency.merge` processes latest-first, so a later layer wins for overlapping atoms).
- `setSubtreeVisibility(plugin.state.data, ref, value)` from `mol-plugin/behavior/static/state`
  (`true` = hidden).
- `plugin.managers.structure.measurement.addLabel(loci, { visualParams: { customText } })`.
- Preset components = `plugin.managers.structure.hierarchy.current.structures[0].components`
  (`StructureComponentRef[]`); each has `.cell.transform.ref`.
- Per-atom entity type for the polymer test = `StructureProperties.entity.type(location)` →
  `"polymer" | "non-polymer" | "water" | "branched" | "macrolide"`.

### Color-scheme → Mol* theme name (GPU-verified real providers)

`element`→`element-symbol`, `chain`→`chain-id`, `secondary-structure`→`secondary-structure`,
`hydrophobicity`→`hydrophobicity`, `sequence-id`→`sequence-id`, **`b-factor`→`uncertainty`**
(Mol\*'s B-factor theme is named `uncertainty`), **`residue-index`→`sequence-id`**. ⚠️ Mol\* has
**no distinct residue-index theme**, so `residue-index` and `sequence-id` map to the same provider
and render identically (rainbow N→C) — kept as agent-friendly synonyms, documented so it isn't read
as a bug. There was no rejected alternative; `uncertainty` is genuinely the B-factor theme.

## Known limitations (single-representation model) — deferred to v1.1b

One selection ⇒ one component ⇒ one representation. So a selection that **mixes polymer + a bound
ligand** draws as one type: `set-color`'s cartoon default doesn't render the ligand and the
preset-hide leaves it in its original color (it stays *visible*, just uncolored); and
hide→color→re-hide on a mixed selection can leave its non-polymer atoms visible. Pure-polymer /
single-kind selections are fully correct. The proper fix is **multi-representation components**
(cartoon for polymer + ball-and-stick for non-polymer, both colored) → v1.1b. Also single-structure
only: the transparency `lociGetter` ignores the `structure` arg Mol\* passes (correct while there is
one loaded structure; would no-op for multi-model/assembly components).

## Testing

- Off-GPU logic Node-unit-tested: schema/catalog, `measure.ts` (centroid/distance), the executor
  (routing, validators, `internal_error`-on-reject, and the `null`-as-absent color guard). Suite =
  **142 tests**, `pnpm typecheck` 0, `pnpm verify:package` green (agent-side entry molstar-free).
- The adapter (`src/mol/adapter.ts`) is **typecheck-gated** and **GPU-verified by the user** via the
  demo `RepresentationPanel` (A/B target toggle + two hex colors for cross-selection checks).
- GPU-verified behaviors: color persists across representation changes; schemes apply per-selection
  on 1HSG (chain A b-factor, chain B untouched); hex no longer masks a later scheme; per-loci
  hide/show; `set-color` with no prior representation → a natural colored cartoon; a colored chain
  keeps its waters visible; coloring chain A then chain B leaves both colors intact.

## Process notes (three review rounds)

1. First external review → "full rework" → v2.
2. Second external review (xhigh) → v2 also architecturally broken → user chose **GPU-test v2
   first**, then rebuild informed by what the GPU actually showed. (The key lesson: the breakages
   were visual/compositional, so two blind typecheck-only attempts both shipped broken models;
   GPU-in-the-loop was required.)
3. Third external review (on v3) → accepted: `null` color guard (`!= null`), the global op-chain
   (cross-loci shared-cell race), `lociKey` computed once, extracted `presetOnlyComponents()`.
   Rejected: the "redundant restore" in `hidePresetCoverage` (deliberate — drops a prior wider hide
   on a rep-type switch). Deferred: the single-representation-model limitations above.
