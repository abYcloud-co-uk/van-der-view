import type { PluginContext } from 'molstar/lib/mol-plugin/context';
import { StructureElement, StructureProperties, Unit } from 'molstar/lib/mol-model/structure';
import type { Structure, Trajectory } from 'molstar/lib/mol-model/structure';
import type { ExecutorContext, FocusOptions, SceneContext } from '../context';
import type { ResolvedStructure } from '../resolve-structure';
import { loadTrajectory as loadMolstarTrajectory } from 'molstar/lib/extensions/plugin/loaders';
import { ModelFromTrajectory } from 'molstar/lib/mol-plugin-state/transforms/model';
import { AnimateModelIndex } from 'molstar/lib/mol-plugin-state/animation/built-in/model-index';
import type { LoadTrajectoryParams } from 'molstar/lib/extensions/plugin/loaders';
import type { ResolvedTrajectory } from '../resolve-coordinates';
import { Color } from 'molstar/lib/mol-util/color';
import { OrderedSet, SortedArray } from 'molstar/lib/mol-data/int';
import { setSubtreeVisibility } from 'molstar/lib/mol-plugin/behavior/static/state';
import { setStructureTransparency } from 'molstar/lib/mol-plugin-state/helpers/structure-transparency';
import type { StateObjectSelector } from 'molstar/lib/mol-state';
import { ExecutorError } from '../errors';
import { createSerializer } from '../util';
import type { ColorScheme, RepresentationType } from '../types';
import type { ColorSpec } from '../context';

/** Per-Structure chain-id cache. A Structure is immutable, so its chain list never
 *  changes; the WeakMap auto-evicts when the Structure is GC'd. get-scene-context is
 *  called often (the agent reads it before guessing selectors), so this avoids
 *  re-walking every unit on each call. */
const chainCache = new WeakMap<Structure, string[]>();

/** Distinct chain ids of a Structure, in first-seen order (auth for atomic units,
 *  label for coarse units — auth numbering isn't defined for coarse models). */
function chainsOf(structure: Structure): string[] {
  const cached = chainCache.get(structure);
  if (cached) return cached;
  const seen = new Set<string>();
  const loc = StructureElement.Location.create(structure);
  for (const unit of structure.units) {
    if (unit.elements.length === 0) continue;
    loc.unit = unit;
    loc.element = unit.elements[0];
    const id = Unit.isAtomic(unit)
      ? StructureProperties.chain.auth_asym_id(loc)
      : StructureProperties.chain.label_asym_id(loc);
    seen.add(id);
  }
  const chains = [...seen];
  chainCache.set(structure, chains);
  return chains;
}

/** Agent color-scheme names → Mol* color-theme registry names (all GPU-verified as real
 *  registered providers). NOTE: `residue-index` and `sequence-id` both map to Mol*'s
 *  `sequence-id` (rainbow N→C) — Mol* has no distinct residue-index theme, so the two
 *  render identically (a documented v1.1a equivalence, not a bug). */
const SCHEME_TO_THEME: Record<ColorScheme, string> = {
  element: 'element-symbol',
  chain: 'chain-id',
  'residue-index': 'sequence-id',
  'secondary-structure': 'secondary-structure',
  'b-factor': 'uncertainty', // Mol*'s B-factor theme is named 'uncertainty'
  hydrophobicity: 'hydrophobicity',
  'sequence-id': 'sequence-id',
};

/** A stable, collision-free cache key for a loci: each unit id plus its full element
 *  index list. Full-identity (not bounds+size) so two *different* same-cardinality
 *  selections over the same [start,end) range never collide onto one component — the
 *  per-selection component model relies on this key uniquely identifying a selection. */
function lociKey(loci: StructureElement.Loci): string {
  return loci.elements
    .map((e) => {
      const n = OrderedSet.size(e.indices);
      const idx = new Array<number>(n);
      for (let i = 0; i < n; i++) idx[i] = OrderedSet.getAt(e.indices, i);
      return `${e.unit.id}:${idx.join(',')}`;
    })
    .join('|');
}

/** The default draw style for a set-color on a selection with no explicit representation
 *  yet: mirror the `default` preset's split — polymer → cartoon, everything else →
 *  ball-and-stick — so "color chain A" yields a colored cartoon, not a dense whole-chain
 *  ball-and-stick (the original v1 complaint). A mixed polymer+ligand selection collapses
 *  to one style (cartoon if any polymer) — a documented v1.1a limitation. */
function defaultReprFor(loci: StructureElement.Loci): RepresentationType {
  const loc = StructureElement.Location.create(loci.structure);
  for (const e of loci.elements) {
    if (OrderedSet.size(e.indices) === 0) continue;
    loc.unit = e.unit;
    loc.element = e.unit.elements[OrderedSet.getAt(e.indices, 0)];
    if (StructureProperties.entity.type(loc) === 'polymer') return 'cartoon';
  }
  return 'ball-and-stick';
}

/** The polymer-only subset of a loci. A cartoon draws only polymer, so when a selection
 *  mixes polymer with waters/ligands we hide just this subset of the preset — leaving the
 *  non-polymer atoms drawn by the preset instead of vanishing (hidden but never redrawn).
 *  Returns an empty-elements loci if the selection has no polymer. */
function polymerSubsetLoci(loci: StructureElement.Loci): StructureElement.Loci {
  const loc = StructureElement.Location.create(loci.structure);
  const elements: { unit: Unit; indices: OrderedSet<StructureElement.UnitIndex> }[] = [];
  for (const e of loci.elements) {
    loc.unit = e.unit;
    const kept: StructureElement.UnitIndex[] = [];
    const n = OrderedSet.size(e.indices);
    for (let i = 0; i < n; i++) {
      const p = OrderedSet.getAt(e.indices, i);
      loc.element = e.unit.elements[p];
      if (StructureProperties.entity.type(loc) === 'polymer') kept.push(p);
    }
    if (kept.length > 0) {
      elements.push({ unit: e.unit, indices: OrderedSet.ofSortedArray(SortedArray.ofSortedArray(kept)) });
    }
  }
  return StructureElement.Loci(loci.structure, elements);
}

/**
 * The real ExecutorContext: drives a live Mol* plugin behind the Plan-2 port, so
 * the provider-agnostic executor never touches Mol* managers directly.
 */
export function molstarExecutorContext(plugin: PluginContext): ExecutorContext {
  const getStructure = (): Structure | undefined =>
    plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data;

  /** Tracks the one loaded trajectory: the ModelFromTrajectory node ref + frame count.
   *  Playback state is read live from the animation manager, not mirrored here. */
  let traj: { modelRef: string; frameCount: number } | undefined;

  /** Per-selection visual components (replace-in-place model). Keyed by lociKey.
   *  `repr` is the current representation selector; `reprType`/`color` are the
   *  last-applied style, re-applied when the other changes; `label` is the prior
   *  add-label node (deleted before re-adding, matching the replace-in-place model). */
  type CompEntry = {
    component?: Awaited<ReturnType<typeof plugin.builders.structure.tryCreateComponentFromExpression>>;
    repr?: Awaited<ReturnType<typeof plugin.builders.structure.representation.addRepresentation>>;
    reprType?: RepresentationType;
    color?: ColorSpec;
    label?: StateObjectSelector;
  };
  const components = new Map<string, CompEntry>();

  /** One serialized op chain for ALL appearance mutations. They share plugin state — the
   *  single preset transparency cell and the component tree — so even calls on *different*
   *  selections must not interleave their read-modify-write commits (a per-loci-key lock
   *  wouldn't stop a chain-A vs chain-B race on the shared transparency cell). These ops are
   *  infrequent GPU writes, so a global chain costs nothing real. */
  const serialize = createSerializer();

  /** The preset's structure components (`default` preset from load-structure). The
   *  transparency helper hides their coverage of a styled selection, so the vdv
   *  component is the only thing drawn for those atoms (no double-draw). */
  const presetComponents = () =>
    plugin.managers.structure.hierarchy.current.structures[0]?.components ?? [];

  /** Preset components MINUS every vdv component we own — the target for preset-hiding, so
   *  transparency never targets (and hides) a representation we just drew. */
  const presetOnlyComponents = () => {
    const vdvRefs = new Set(
      [...components.values()].map((e) => e.component?.ref).filter((r): r is string => !!r),
    );
    return presetComponents().filter((c) => !vdvRefs.has(c.cell.transform.ref));
  };

  /** Hide the preset's draw of a styled selection so the owned vdv component is the only
   *  thing rendered for those atoms. A cartoon draws only polymer, so for cartoon we hide
   *  just the polymer subset — otherwise non-polymer atoms (waters/ligands) in the selection
   *  would be hidden yet never redrawn. The whole selection is restored first so switching
   *  rep types never leaves stale-hidden atoms behind. Targets the preset only, never our
   *  own vdv components. */
  async function hidePresetCoverage(
    loci: StructureElement.Loci,
    type: RepresentationType,
  ): Promise<void> {
    const presetOnly = presetOnlyComponents();
    if (presetOnly.length === 0) return;
    const toHide = type === 'cartoon' ? polymerSubsetLoci(loci) : loci;
    // Two passes BY DESIGN (not a redundant restore): restore the whole selection, THEN hide
    // only what this rep draws. Switching rep types (e.g. spacefill→cartoon) must drop the
    // prior, wider hide so its atoms don't stay invisible. Cost is one extra transparency layer.
    await setStructureTransparency(plugin, presetOnly, 0, async () => loci);
    await setStructureTransparency(plugin, presetOnly, 1, async () => toHide);
  }

  /** Get-or-create the per-selection component for a loci (key precomputed by the caller). */
  async function componentFor(
    loci: StructureElement.Loci,
    key: string,
  ): Promise<NonNullable<CompEntry['component']> | undefined> {
    const existing = components.get(key);
    if (existing?.component) return existing.component;
    const structureCell = plugin.managers.structure.hierarchy.current.structures[0]?.cell;
    if (!structureCell) return undefined;
    const bundle = StructureElement.Bundle.fromLoci(loci);
    const expression = StructureElement.Bundle.toExpression(bundle);
    const component = await plugin.builders.structure.tryCreateComponentFromExpression(
      structureCell,
      expression,
      `vdv-${key}`,
    );
    if (!component) return undefined;
    components.set(key, { ...(existing ?? {}), component });
    return component;
  }

  /** (Re)build the single representation for a component with the given type + color. */
  async function applyStyle(
    key: string,
    type: RepresentationType,
    color: ColorSpec | undefined,
  ): Promise<void> {
    const entry = components.get(key);
    if (!entry?.component) return;
    // Finding 7: drop the prior repr *and clear the cached ref* before rebuilding, so a
    // throw in addRepresentation below leaves the entry pointing at no repr (clean) rather
    // than a deleted node. The throw then propagates (Part A await → internal_error).
    if (entry.repr) await plugin.build().delete(entry.repr).commit();
    entry.repr = undefined;
    const props: Record<string, unknown> = { type };
    if (color) {
      if ('hex' in color) {
        props.color = 'uniform';
        props.colorParams = { value: Color.fromHexStyle(color.hex) };
      } else {
        props.color = SCHEME_TO_THEME[color.scheme];
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- addRepresentation's prop union is built-in-typed; we pass a validated subset
    const repr = await plugin.builders.structure.representation.addRepresentation(entry.component, props as any);
    entry.repr = repr;
    entry.reprType = type;
    entry.color = color;
  }

  const toModelParam = (t: ResolvedStructure): LoadTrajectoryParams['model'] =>
    t.url !== undefined
      ? { kind: 'model-url', url: t.url, format: t.format, isBinary: t.isBinary }
      : { kind: 'model-data', data: t.data!, format: t.format };

  const toCoordsParam = (c: ResolvedTrajectory['coordinates']): LoadTrajectoryParams['coordinates'] =>
    c.url !== undefined
      ? { kind: 'coordinates-url', url: c.url, format: c.format, isBinary: true }
      // ResolvedCoordinates.data is Uint8Array<ArrayBufferLike>; molstar expects Uint8Array<ArrayBuffer>.
      // The cast is safe: only callers that supply a plain Uint8Array (never SharedArrayBuffer) reach here.
      : { kind: 'coordinates-data', data: c.data! as Uint8Array<ArrayBuffer>, format: c.format };

  return {
    getStructure,

    async loadStructure(resolved: ResolvedStructure): Promise<void> {
      // Stop any running trajectory animation so it doesn't keep ticking against the cleared scene.
      await plugin.managers.animation.stop();
      traj = undefined;
      // load-structure replaces the scene: v1 is single-structure, and every later
      // command reads structures[0], so a prior structure must be cleared first
      // (otherwise a second load would be appended and silently ignored).
      await plugin.clear();
      components.clear();
      const data =
        resolved.url !== undefined
          ? await plugin.builders.data.download(
              { url: resolved.url, isBinary: resolved.isBinary },
              { state: { isGhost: true } },
            )
          : await plugin.builders.data.rawData({ data: resolved.data! });
      const trajectory = await plugin.builders.structure.parseTrajectory(data, resolved.format);
      await plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default');
    },

    highlight(loci) {
      plugin.managers.interactivity.lociHighlights.highlightOnly({ loci });
    },

    clearHighlight() {
      plugin.managers.interactivity.lociHighlights.clearHighlights();
    },

    focus(loci, options?: FocusOptions) {
      // zoomOut is a factor (1 = fit). For >1, widen the framed sphere proportionally to
      // the structure's size so the pull-back is visible regardless of structure scale;
      // <=1 (or omitted) leaves Mol*'s default extraRadius (a tight fit with a small pad).
      const factor = options?.zoomOut;
      const extra =
        factor !== undefined && factor > 1
          ? { extraRadius: (factor - 1) * loci.structure.boundary.sphere.radius }
          : {};
      plugin.managers.camera.focusLoci(loci, { durationMs: options?.durationMs, ...extra });
    },

    resetCamera() {
      plugin.managers.camera.reset();
    },

    getSceneContext(): SceneContext {
      const structures = plugin.managers.structure.hierarchy.current.structures;
      const base = {
        loaded: structures.length > 0,
        structures: structures
          .map((ref) => ref.cell.obj?.data)
          .filter((s): s is Structure => s !== undefined)
          .map((s) => ({ chains: chainsOf(s) })),
      };
      if (!traj) return base;
      const modelCell = plugin.state.data.cells.get(traj.modelRef);
      const currentFrame =
        (modelCell?.transform.params as { modelIndex?: number } | undefined)?.modelIndex ?? 0;
      // isPlaying is read live from the animation manager (not a local mirror), so it
      // correctly reads false once a non-looping ('once') playback finishes on its own.
      return {
        ...base,
        trajectory: { frameCount: traj.frameCount, currentFrame, isPlaying: plugin.managers.animation.isAnimating },
      };
    },

    async loadTrajectory(resolved: ResolvedTrajectory): Promise<void> {
      // Stop any running animation, then snapshot the current scene BEFORE clearing so a
      // failed load (e.g. a topology/coordinate atom-count mismatch) can restore it rather
      // than leaving the viewer blank. The snapshot is only ever restored on the failure
      // path, so a successful load carries no behavioural change.
      await plugin.managers.animation.stop();
      const priorScene = plugin.state.data.getSnapshot();
      await plugin.clear();
      components.clear();
      traj = undefined;
      let result;
      try {
        result = await loadMolstarTrajectory(plugin, {
          model: toModelParam(resolved.topology),
          coordinates: toCoordsParam(resolved.coordinates),
          preset: 'default',
        });
      } catch (e) {
        await plugin.state.data.setSnapshot(priorScene).run(); // restore the prior scene
        const msg = e instanceof Error ? e.message : String(e);
        // Mol* throws "Frame element count mismatch, got X but expected Y" when the
        // topology and coordinate atom counts disagree (mol-model/.../model.js:35).
        if (/element count mismatch/i.test(msg)) throw new ExecutorError('trajectory_mismatch', msg);
        throw e; // executor maps unknown throws to internal_error
      }
      const modelRef = (result.preset as { model?: { ref: string } } | undefined)?.model?.ref;
      if (!modelRef) {
        await plugin.state.data.setSnapshot(priorScene).run();
        throw new ExecutorError('internal_error', 'loadTrajectory: molstar returned no model ref (unexpected preset shape).');
      }
      const modelCell = plugin.state.data.cells.get(modelRef);
      const trajRef = modelCell?.transform.parent;
      const trajData = trajRef
        ? (plugin.state.data.cells.get(trajRef)?.obj?.data as Trajectory | undefined)
        : undefined;
      traj = { modelRef, frameCount: trajData?.frameCount ?? 1 };
    },

    playTrajectory(options) {
      if (!traj) return;
      void plugin.managers.animation.play(AnimateModelIndex, {
        mode:
          options?.loop === false
            ? { name: 'once', params: { direction: 'forward' } }
            : { name: 'loop', params: { direction: 'forward' } },
        duration: { name: 'computed', params: { targetFps: options?.fps ?? 30 } },
      });
    },

    stopTrajectory() {
      if (!traj) return;
      void plugin.managers.animation.stop();
    },

    setFrame(index) {
      if (!traj) return;
      const t = traj;
      // Clamp defensively — the executor already range-checks, but the port is callable directly.
      const modelIndex = Math.max(0, Math.min(index, t.frameCount - 1));
      // Stop playback first: a running AnimateModelIndex recomputes the frame from elapsed
      // time on its next tick and would immediately clobber this manual seek.
      void (async () => {
        await plugin.managers.animation.stop();
        await plugin.build().to(t.modelRef).update(ModelFromTrajectory, (old) => ({ ...old, modelIndex })).commit();
      })();
    },

    setRepresentation(loci, type) {
      return serialize(async () => {
        // Own a vdv component for this selection, (re)draw it with the new type while keeping
        // any color the selection already carries, then hide the preset's draw of those atoms
        // so only our style shows. Color persists because it lives on the entry, not the preset.
        const key = lociKey(loci);
        const component = await componentFor(loci, key);
        if (!component) return;
        await applyStyle(key, type, components.get(key)?.color);
        await hidePresetCoverage(loci, type);
      });
    },

    setColor(loci, color) {
      return serialize(async () => {
        // Color lives ON the per-selection vdv component (hex → uniform colorParams, scheme →
        // a color theme scoped to the component's atoms) — NOT as overpaint/retheme of the
        // preset. So it persists across set-representation, schemes apply per-selection rather
        // than structure-wide, and coloring one selection never disturbs another. With no prior
        // representation, default to a natural style for the selection's contents.
        const key = lociKey(loci);
        const component = await componentFor(loci, key);
        if (!component) return;
        const type = components.get(key)?.reprType ?? defaultReprFor(loci);
        await applyStyle(key, type, color);
        await hidePresetCoverage(loci, type);
      });
    },

    setVisibility(loci, visible) {
      return serialize(async () => {
        const component = components.get(lociKey(loci))?.component;
        if (component) {
          // Owned selection: the preset's coverage is already hidden and the vdv component
          // draws it, so just toggle that component (setSubtreeVisibility: true = hidden).
          setSubtreeVisibility(plugin.state.data, component.ref, !visible);
        } else {
          // Unstyled selection: hide/show the preset's draw of these atoms via per-loci
          // transparency (1 = hidden, 0 = restored). A later 0-layer shadows the prior 1-layer
          // for the same atoms (Transparency.merge), so restore is scoped — other selections
          // (and other hidden selections) are untouched, no clear-all.
          await setStructureTransparency(plugin, presetOnlyComponents(), visible ? 0 : 1, async () => loci);
        }
      });
    },

    addLabel(loci, text) {
      return serialize(async () => {
        // Replace-in-place: delete the prior label for this loci before adding the new one
        // (finding 8 — otherwise duplicate labels stack).
        const key = lociKey(loci);
        const entry = components.get(key);
        if (entry?.label) await plugin.build().delete(entry.label).commit();
        const result = await plugin.managers.structure.measurement.addLabel(loci, {
          visualParams: { customText: text },
        });
        if (result) components.set(key, { ...(components.get(key) ?? {}), label: result.representation });
      });
    },
  };
}
