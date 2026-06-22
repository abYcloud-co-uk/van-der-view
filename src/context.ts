import type { Structure, StructureElement } from 'molstar/lib/mol-model/structure';
import type { ResolvedStructure } from './resolve-structure';

/** Camera focus options (subset surfaced to the agent). */
export interface FocusOptions {
  durationMs?: number;
  zoomOut?: boolean;
}

/** Minimal read-model of the scene, returned by get-scene-context. */
export interface SceneContext {
  loaded: boolean;
  structures: { chains: string[] }[];
}

/**
 * The high-level port the executor drives. A real Mol* plugin adapter (Plan 3) or a
 * test fake implements this — so the executor never touches Mol* managers directly.
 */
export interface ExecutorContext {
  getStructure(): Structure | undefined;
  loadStructure(resolved: ResolvedStructure): Promise<void>;
  highlight(loci: StructureElement.Loci): void;
  clearHighlight(): void;
  focus(loci: StructureElement.Loci, options?: FocusOptions): void;
  resetCamera(): void;
  getSceneContext(): SceneContext;
}
