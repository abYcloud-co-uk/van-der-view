import type { Structure, StructureElement } from 'molstar/lib/mol-model/structure';
import type { ResolvedStructure } from './resolve-structure';
import type { ResolvedTrajectory } from './resolve-coordinates';
import type { ColorScheme, RepresentationType } from './types';

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

/** Trajectory playback options (named so the port and the executor can't drift). */
export interface PlayTrajectoryOptions {
  /** Target frames per second (> 0; the adapter defaults to ~30). */
  fps?: number;
  /** Loop continuously (default) or play once. */
  loop?: boolean;
}

/**
 * How to color a selection: either a built-in data-driven `scheme` or a single
 * solid `hex` color. The executor validates the agent's input down to exactly one
 * of these before handing it to the host adapter.
 */
export type ColorSpec = { scheme: ColorScheme } | { hex: string };

/**
 * The high-level port the executor drives. A real Mol* plugin adapter (Plan 3) or a
 * test fake implements this — so the executor never touches Mol* managers directly.
 */
export interface ExecutorContext {
  getStructure(): Structure | undefined;
  loadStructure(resolved: ResolvedStructure, signal?: AbortSignal): Promise<void>;
  highlight(loci: StructureElement.Loci): Promise<void>;
  clearHighlight(): Promise<void>;
  focus(loci: StructureElement.Loci, options?: FocusOptions): void;
  resetCamera(): void;
  getSceneContext(): SceneContext;
  loadTrajectory(resolved: ResolvedTrajectory, signal?: AbortSignal): Promise<void>;
  playTrajectory(options?: PlayTrajectoryOptions): void;
  stopTrajectory(): void;
  setFrame(index: number): void;
  /** Set the representation (draw style) of a selection. */
  setRepresentation(loci: StructureElement.Loci, type: RepresentationType): Promise<void>;
  /** Recolor a selection, by scheme or by a single solid color. */
  setColor(loci: StructureElement.Loci, color: ColorSpec): Promise<void>;
  /** Show (`visible: true`) or hide (`visible: false`) a selection. */
  setVisibility(loci: StructureElement.Loci, visible: boolean): Promise<void>;
  /** Place a 3D text label at the center of a selection. */
  addLabel(loci: StructureElement.Loci, text: string): Promise<void>;
}
