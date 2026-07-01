---
title: Mol* Appearance (per-selection representation, color, visibility)
slug: molstar-appearance
type: how-to
status: stable
sources: [raw/0014-representation-cluster-merged-2026-06-23.md, raw/0001-molstar-research.md]
updated: 2026-07-01
links: [molstar-api, command-schema, agent-command-flow, glossary, project-overview]
---

# Mol* Appearance (per-selection representation, color, visibility)

> How van-der-view restyles **part of a structure** — change a selection's
> representation, recolor it, hide/show it, label it — without disturbing the rest
> of the scene. Realized by the **v1.1a representation cluster** (PR #21, merged
> 2026-06-23; src: raw/0014). Distinct from whole-structure loading ([[molstar-api]]).

## Key facts

- Each styled selection owns **one component** (`builders.structure.tryCreateComponentFromExpression(structureCell, expression, key)`, where `expression = StructureElement.Bundle.toExpression(Bundle.fromLoci(loci))`), holding **one representation** that carries both its draw `type` and its color (src: raw/0014).
- The `default` preset's draw of those atoms is hidden with **per-loci transparency**, so the owned component is the only thing rendered for them — **no double-draw, no structure-wide mutation, no clear-all** (src: raw/0014).
- **Color lives on the component's representation**, so it **persists** across representation changes and a **scheme scopes to the selection** (not the whole structure): hex → `color:'uniform' + colorParams:{value}`; scheme → `color:<theme name>` (src: raw/0014).
- ⚠️ A selection draws with **one** representation. A mixed polymer+ligand selection can't color/hide both cleanly — deferred to multi-representation components in v1.1b (Open questions).
- **Overpaint layer** (`setStructureOverpaint`/`clearStructureOverpaint`) is used by the persistent `highlight` command (fix #38, [[command-schema]]): highlight paints a yellow layer directly over existing geometry (replace semantics — a new highlight wipes the prior one, `clear-highlight` removes it entirely). Distinct from the transparency-based preset hiding and from color-on-representation above. ⚠️ Overpaint only covers existing geometry — atoms with no active representation won't show the highlight.
- The model took **two rejected drafts + a GPU pass** to get right — the breakages were visual/compositional, invisible to typecheck (src: raw/0014).

## Details

### The 5 commands → port → Mol*

| command | port member | Mol* realization |
|---|---|---|
| `set-representation {selection,type}` | `setRepresentation(loci,type)` | own component → `addRepresentation(component,{type, …color})` → hide preset coverage |
| `set-color {selection, scheme?\|color?}` | `setColor(loci,color)` | own component → `addRepresentation` with `uniform`+`colorParams` (hex) or a color theme (scheme) → hide preset coverage |
| `toggle-visibility {selection,visible}` | `setVisibility(loci,visible)` | owned → `setSubtreeVisibility`; unstyled → per-loci transparency `visible?0:1` |
| `add-label {selection,text}` | `addLabel(loci,text)` | `measurement.addLabel(loci,{visualParams:{customText}})`, deletes the prior label for that key |
| `measure-distance {from,to}` | **none** (pure-Node) | centroid–centroid Å, no Mol* call ([[command-schema]]) |

The 4 mutators are `Promise<void>` and the executor **awaits** each → a failed GPU op becomes a
reported `internal_error`, not a silent `ok()` (src: raw/0014).

### Mol* 5.10.1 appearance APIs (verified)

```ts
import { setStructureTransparency } from 'molstar/lib/mol-plugin-state/helpers/structure-transparency';
import { setSubtreeVisibility } from 'molstar/lib/mol-plugin/behavior/static/state';
// per-selection component + representation:
const comp = await plugin.builders.structure.tryCreateComponentFromExpression(structureCell, expr, key);
await plugin.builders.structure.representation.addRepresentation(comp, { type, color, colorParams });
// hide the preset's draw of `loci` (value 1 = invisible, 0 = opaque):
await setStructureTransparency(plugin, presetComponents, 1, async () => loci);
setSubtreeVisibility(plugin.state.data, comp.ref, true); // true = hidden
```
- Preset components = `plugin.managers.structure.hierarchy.current.structures[0].components` (`StructureComponentRef[]`, each with `.cell.transform.ref`). Hide the preset **minus** our own vdv components (else transparency hides the representation we just drew).
- **Transparency layers are appended and merged at render** — `mol-theme/transparency.js` `Transparency.merge` processes layers **latest-first** and shadows earlier overlapping layers, so a later `0`-layer un-hides atoms an earlier `1`-layer hid. This is why "restore the whole selection (0) then hide what the rep draws (1)" works for switching rep types (src: raw/0014).
- Polymer test for the default style / the cartoon polymer-subset = `StructureProperties.entity.type(location) === 'polymer'`.

### Color scheme → Mol* theme name

| agent `scheme` | Mol* theme | note |
|---|---|---|
| `element` | `element-symbol` | CPK |
| `chain` | `chain-id` | |
| `secondary-structure` | `secondary-structure` | |
| `b-factor` | **`uncertainty`** | Mol\*'s B-factor theme is named `uncertainty` |
| `hydrophobicity` | `hydrophobicity` | |
| `sequence-id` | `sequence-id` | rainbow N→C |
| `residue-index` | **`sequence-id`** | ⚠️ Mol\* has no distinct residue-index theme → renders identically to `sequence-id`; kept as a synonym |

(src: raw/0014 — names GPU-verified as real registered providers.)

### Why this model (not the rejected ones)

- A per-selection component drawn **over** the preset double-draws; coloring the **preset**
  (overpaint / structure-wide retheme) puts color in a different place than the representation it
  colors, so they don't compose (color won't persist, hex masks schemes, schemes go structure-wide,
  clear-all wipes other selections). Putting **both** representation and color on the **one owned
  component**, and hiding the preset under it, makes them compose. The GPU pass confirmed
  transparency-hiding works, so no Mol\* component-subtraction (carve-out) is needed (src: raw/0014).

## Relevance to van-der-view

- ✅ Shipped as the **v1.1a representation cluster** (PR #21, src: raw/0014). Adds the 4 mutator port
  members (`set*`/`addLabel`, all `Promise<void>`), the pure-Node `measure.ts`, and a demo
  `RepresentationPanel`. Off-GPU logic is Node-tested (**142 tests**); the adapter is typecheck-gated
  + GPU-verified. See [[command-schema]] and [[agent-command-flow]].
- All mutations are **per-selection / per-loci** — coloring or hiding one selection never disturbs
  another (the headline property the rejected models lacked).

## See also
- [[command-schema]] — the agent-facing command/`Selection` contract these realize
- [[molstar-api]] — single-structure loading, selection→loci, camera (the static path)
- [[agent-command-flow]] — the executor/adapter seam these mutators sit behind
- [[glossary]] — loci, component, representation
- [[project-overview]] — where the representation cluster sits on the roadmap

## Open questions
- **Multi-representation components (v1.1b)** — to color/hide a mixed polymer+ligand selection
  correctly, one component needs two representations (cartoon + ball-and-stick), both colored. Today
  such a selection draws as one type (the ligand stays visible but uncolored). Needs its own GPU pass.
- **Multi-structure** — the transparency `lociGetter` ignores the `structure` argument Mol\* passes;
  correct only with one loaded structure. Revisit for multi-model/assembly components.
- **`highlight.style`** — the styled-highlight variant deferred from v1 is still open (v1.1b),
  separate from this per-selection restyle ([[command-schema]]).
