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
import { OrderedSet } from 'molstar/lib/mol-data/int';
import { setSubtreeVisibility } from 'molstar/lib/mol-plugin/behavior/static/state';
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

/** A stable cache key for a loci (its units + element index sets). Two loci over
 *  the same atoms produce the same key → the same per-selection component. */
function lociKey(loci: StructureElement.Loci): string {
  return loci.elements
    .map((e) => `${e.unit.id}:${OrderedSet.toArray(e.indices).join(',')}`)
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
   *  last-applied style, re-applied when the other changes. */
  type CompEntry = {
    component: Awaited<ReturnType<typeof plugin.builders.structure.tryCreateComponentFromExpression>>;
    repr?: Awaited<ReturnType<typeof plugin.builders.structure.representation.addRepresentation>>;
    reprType?: RepresentationType;
    color?: ColorSpec;
  };
  const components = new Map<string, CompEntry>();

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
    if (entry.repr) await plugin.build().delete(entry.repr).commit();
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
    entry.repr = await plugin.builders.structure.representation.addRepresentation(entry.component, props as any);
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
      void (async () => {
        const component = await componentFor(loci);
        if (!component) return;
        const key = lociKey(loci);
        await applyStyle(key, type, components.get(key)?.color);
      })();
    },

    setColor(loci, color) {
      void (async () => {
        const component = await componentFor(loci);
        if (!component) return;
        const key = lociKey(loci);
        // Default to ball-and-stick when coloring a selection that has no representation yet.
        const type = components.get(key)?.reprType ?? 'ball-and-stick';
        await applyStyle(key, type, color);
      })();
    },

    setVisibility(loci, visible) {
      void (async () => {
        const component = await componentFor(loci);
        if (!component) return;
        setSubtreeVisibility(plugin.state.data, component.ref, !visible);
      })();
    },

    addLabel(loci, text) {
      // The measurement manager takes a loci directly — no per-selection component.
      void plugin.managers.structure.measurement.addLabel(loci, { visualParams: { customText: text } });
    },
  };
}
