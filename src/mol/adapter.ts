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
import type { ColorTheme } from 'molstar/lib/mol-theme/color';
import { OrderedSet } from 'molstar/lib/mol-data/int';
import { setSubtreeVisibility } from 'molstar/lib/mol-plugin/behavior/static/state';
import {
  setStructureOverpaint,
  clearStructureOverpaint,
} from 'molstar/lib/mol-plugin-state/helpers/structure-overpaint';
import {
  setStructureTransparency,
  clearStructureTransparency,
} from 'molstar/lib/mol-plugin-state/helpers/structure-transparency';
import type { StateObjectSelector } from 'molstar/lib/mol-state';
import { ExecutorError } from '../errors';
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

/** Agent color-scheme names → Mol* color-theme registry names. The two flagged
 *  with ⚠ are best-guess and must be confirmed in the demo (spike 2). */
const SCHEME_TO_THEME: Record<ColorScheme, string> = {
  element: 'element-symbol',
  chain: 'chain-id',
  'residue-index': 'sequence-id', // ⚠ confirm against the color-theme registry
  'secondary-structure': 'secondary-structure',
  'b-factor': 'uncertainty', // ⚠ Mol*'s B-factor theme is named 'uncertainty'
  hydrophobicity: 'hydrophobicity',
  'sequence-id': 'sequence-id',
};

/** A compact, stable cache key for a loci. Built from each unit id plus the index
 *  set's bounds + cardinality (not the full materialized index array — finding 10).
 *  Caveat: two *different* same-cardinality selections sharing the same [start,end)
 *  bounds collide to one key — acceptable for the v1.1a single-selection demo. */
function lociKey(loci: StructureElement.Loci): string {
  return loci.elements
    .map((e) => `${e.unit.id}:${OrderedSet.start(e.indices)}-${OrderedSet.end(e.indices)}:${OrderedSet.size(e.indices)}`)
    .join('|');
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

  /** In-flight op per loci-key (findings 4/5): each mutator chains onto the prior op
   *  for the same key so concurrent same-loci calls can't race (double-delete /
   *  non-atomic create). The stored promise swallows rejection so a failed prior op
   *  doesn't poison the chain; the awaiter still sees the real throw via `next`. */
  const inflight = new Map<string, Promise<unknown>>();
  function serialize<T>(key: string, work: () => Promise<T>): Promise<T> {
    const prev = inflight.get(key) ?? Promise.resolve();
    const next = prev.then(work);
    inflight.set(key, next.catch(() => {}));
    return next;
  }

  /** The preset's structure components (`default` preset from load-structure). The
   *  overpaint/transparency helpers operate on these in place, so v1.1a commands
   *  modify the preset's coverage rather than layering an independent component. */
  const presetComponents = () =>
    plugin.managers.structure.hierarchy.current.structures[0]?.components ?? [];

  /** Get-or-create the per-selection component for a loci. */
  async function componentFor(
    loci: StructureElement.Loci,
  ): Promise<NonNullable<CompEntry['component']> | undefined> {
    const key = lociKey(loci);
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
      const key = lociKey(loci);
      return serialize(key, async () => {
        // Create-or-reuse the vdv component, (re)apply the single representation, then
        // hide the preset's draw of those atoms so only the new style shows (finding 2).
        const component = await componentFor(loci);
        if (!component) return;
        await applyStyle(key, type, components.get(key)?.color);
        // The vdv components WE created (now in the hierarchy) must NOT be transparency-hidden —
        // hiding them would hide the very representation we just drew. Target the preset coverage
        // ONLY: preset components MINUS every tracked vdv component (by its transform ref).
        const vdvRefs = new Set(
          [...components.values()].map((e) => e.component?.ref).filter((r): r is string => !!r),
        );
        const presetOnly = presetComponents().filter((c) => !vdvRefs.has(c.cell.transform.ref));
        await setStructureTransparency(plugin, presetOnly, 1, async () => loci);
      });
    },

    setColor(loci, color) {
      const key = lociKey(loci);
      return serialize(key, async () => {
        if ('hex' in color) {
          // Solid color: overpaint the selection on the preset's existing representations.
          // clearStructureOverpaint clears ALL overpaint on the preset comps (no per-loci
          // scope in molstar) — acceptable v1.1a single-selection simplification.
          const comps = presetComponents();
          await clearStructureOverpaint(plugin, comps);
          await setStructureOverpaint(plugin, comps, Color.fromHexStyle(color.hex), async () => loci);
        } else {
          // Data-driven scheme: structure-wide retheme (schemes are not per-sub-selection
          // in molstar). The selection is accepted but the recolor covers the whole structure.
          // The JSDoc on UpdateThemeParams.color sanctions a cast for arbitrary theme names.
          await plugin.managers.structure.component.updateRepresentationsTheme(presetComponents(), {
            color: SCHEME_TO_THEME[color.scheme] as ColorTheme.BuiltIn,
          });
        }
      });
    },

    setVisibility(loci, visible) {
      const key = lociKey(loci);
      return serialize(key, async () => {
        if (visible) {
          // Restore: clearStructureTransparency clears ALL transparency on the preset comps
          // (no per-loci scope) — acceptable v1.1a single-selection simplification.
          await clearStructureTransparency(plugin, presetComponents());
        } else {
          await setStructureTransparency(plugin, presetComponents(), 1, async () => loci);
        }
        // Also toggle any vdv component for this loci so a re-styled selection hides/shows too.
        const component = components.get(key)?.component;
        if (component) setSubtreeVisibility(plugin.state.data, component.ref, !visible);
      });
    },

    addLabel(loci, text) {
      const key = lociKey(loci);
      return serialize(key, async () => {
        // Replace-in-place: delete the prior label for this loci before adding the new one
        // (finding 8 — otherwise duplicate labels stack).
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
