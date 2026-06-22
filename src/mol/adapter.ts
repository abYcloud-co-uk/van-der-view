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
import { ExecutorError } from '../errors';

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

/**
 * The real ExecutorContext: drives a live Mol* plugin behind the Plan-2 port, so
 * the provider-agnostic executor never touches Mol* managers directly.
 */
export function molstarExecutorContext(plugin: PluginContext): ExecutorContext {
  const getStructure = (): Structure | undefined =>
    plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data;

  /** Tracks the one loaded trajectory: the ModelFromTrajectory node ref + frame metadata. */
  let traj: { modelRef: string; frameCount: number; isPlaying: boolean } | undefined;

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
      traj = undefined;
      // load-structure replaces the scene: v1 is single-structure, and every later
      // command reads structures[0], so a prior structure must be cleared first
      // (otherwise a second load would be appended and silently ignored).
      await plugin.clear();
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
      return { ...base, trajectory: { frameCount: traj.frameCount, currentFrame, isPlaying: traj.isPlaying } };
    },

    async loadTrajectory(resolved: ResolvedTrajectory): Promise<void> {
      await plugin.clear();
      traj = undefined;
      let result;
      try {
        result = await loadMolstarTrajectory(plugin, {
          model: toModelParam(resolved.topology),
          coordinates: toCoordsParam(resolved.coordinates),
          preset: 'default',
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Mol* throws "Frame element count mismatch, got X but expected Y" when the
        // topology and coordinate atom counts disagree (mol-model/.../model.js:35).
        if (/element count mismatch/i.test(msg)) throw new ExecutorError('trajectory_mismatch', msg);
        throw e; // executor maps unknown throws to internal_error
      }
      const modelRef = (result.preset as { model?: { ref: string } } | undefined)?.model?.ref;
      if (!modelRef) {
        throw new ExecutorError('internal_error', 'loadTrajectory: molstar returned no model ref (unexpected preset shape).');
      }
      const modelCell = plugin.state.data.cells.get(modelRef);
      const trajRef = modelCell?.transform.parent;
      const trajData = trajRef
        ? (plugin.state.data.cells.get(trajRef)?.obj?.data as Trajectory | undefined)
        : undefined;
      traj = { modelRef, frameCount: trajData?.frameCount ?? 1, isPlaying: false };
    },

    playTrajectory(options) {
      if (!traj) return;
      traj.isPlaying = true;
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
      traj.isPlaying = false;
      void plugin.managers.animation.stop();
    },

    setFrame(index) {
      if (!traj) return;
      // Update the ModelFromTrajectory transform's modelIndex (the same param AnimateModelIndex drives).
      void plugin.build().to(traj.modelRef).update(ModelFromTrajectory, (old) => ({ ...old, modelIndex: index })).commit();
    },
  };
}
