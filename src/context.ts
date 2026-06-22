import type { Structure, StructureElement } from 'molstar/lib/mol-model/structure';
import type { ResolvedStructure } from './resolve-structure';
import type { ResolvedTrajectory } from './resolve-coordinates';

/** Camera focus options (subset surfaced to the agent). */
export interface FocusOptions {
  durationMs?: number;
  /** Zoom-out factor: 1 (or omitted) fits the selection; >1 frames proportionally wider. */
  zoomOut?: number;
}

/** Minimal read-model of the scene, returned by get-scene-context. */
export interface SceneContext {
  loaded: boolean;
  structures: { chains: string[] }[];
  /** Present only when a trajectory is loaded (the single read-model for playback state). */
  trajectory?: { frameCount: number; currentFrame: number; isPlaying: boolean };
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
  loadTrajectory(resolved: ResolvedTrajectory): Promise<void>;
  playTrajectory(options?: { fps?: number; loop?: boolean }): void;
  stopTrajectory(): void;
  setFrame(index: number): void;
}
