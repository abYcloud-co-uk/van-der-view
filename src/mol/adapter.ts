import type { PluginContext } from 'molstar/lib/mol-plugin/context';
import { StructureElement, StructureProperties, Unit } from 'molstar/lib/mol-model/structure';
import type { Structure } from 'molstar/lib/mol-model/structure';
import type { ExecutorContext, FocusOptions, SceneContext } from '../context';
import type { ResolvedStructure } from '../resolve-structure';

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

  return {
    getStructure,

    async loadStructure(resolved: ResolvedStructure): Promise<void> {
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
      return {
        loaded: structures.length > 0,
        structures: structures
          .map((ref) => ref.cell.obj?.data)
          .filter((s): s is Structure => s !== undefined)
          .map((s) => ({ chains: chainsOf(s) })),
      };
    },
  };
}
