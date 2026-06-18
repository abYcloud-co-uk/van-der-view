import type { Structure, StructureElement } from 'molstar/lib/mol-model/structure';
import type { ResolvedStructure } from './resolve-structure';
import type { ColorScheme, RepresentationType } from './types';

/** Camera focus options (subset surfaced to the agent). */
export interface FocusOptions {
  durationMs?: number;
}

/**
 * How to color a selection: either a built-in data-driven `scheme` or a single
 * solid `hex` color. The executor validates the agent's input down to exactly one
 * of these before handing it to the host adapter.
 */
export type ColorSpec = { scheme: ColorScheme } | { hex: string };

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

  /** Set the representation (draw style) of a selection. */
  setRepresentation(loci: StructureElement.Loci, type: RepresentationType): void;
  /** Recolor a selection, by scheme or by a single solid color. */
  setColor(loci: StructureElement.Loci, color: ColorSpec): void;
  /** Show (`visible: true`) or hide (`visible: false`) a selection. */
  setVisibility(loci: StructureElement.Loci, visible: boolean): void;
  /** Place a 3D text label at the center of a selection. */
  addLabel(loci: StructureElement.Loci, text: string): void;
}
