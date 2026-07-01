import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { DefaultPluginSpec } from 'molstar/lib/mol-plugin/spec';
import type { Command, CommandResult } from '../types';
import type { SceneContext } from '../context';
import type { ResolveStructure } from '../resolve-structure';
import type { ResolveCoordinates } from '../resolve-coordinates';
import { createExecutor } from '../executor';
import { molstarExecutorContext } from './adapter';
import { createXrApi, type MolViewXR } from './xr';
import { subscribeHoverEvents, type HoverInfo } from '../hover';

export interface CreateMolViewOptions {
  /** Canvas to render into. Required unless an already-initialized `plugin` is given. */
  canvas?: HTMLCanvasElement;
  /** Container the canvas fills (sized by the host via CSS). Required unless `plugin` is given. */
  container?: HTMLDivElement;
  /** Attach to a plugin the host already mounted; van-der-view will NOT dispose it. */
  plugin?: PluginContext;
  /** Host hook to fetch auth-protected / internal structures. Defaults to RCSB/url/inline. */
  resolveStructure?: ResolveStructure;
  /** Host hook to fetch a binary coordinate stream for load-trajectory. Defaults to URL passthrough. */
  resolveCoordinates?: ResolveCoordinates;
}

/** The mounted viewer handle returned to the host. */
export interface MolView {
  dispatch(command: Command): Promise<CommandResult>;
  getSceneContext(): SceneContext;
  clearHighlight(): Promise<void>;
  /**
   * Subscribe to pointer-hover changes for a host tooltip. The callback gets a `HoverInfo`
   * for whatever is under the cursor, or `null` when the pointer leaves a target. Returns an
   * unsubscribe. A throwing callback is contained (it can't break Mol*'s own hover-highlight).
   * The empty initial state is NOT delivered — the first call corresponds to an actual hover
   * (or, if you subscribe while already hovering, that live target).
   */
  subscribeHover(cb: (info: HoverInfo | null) => void): () => void;
  xr: MolViewXR;
  /** Escape hatch: the underlying Mol* plugin. */
  plugin: PluginContext;
  /** Re-fit the canvas after a container resize (ResizeObserver covers the common cases). */
  handleResize(): void;
  /** Dispose the plugin — only if van-der-view created it (a host-provided plugin is left alone). */
  dispose(): void;
}

/**
 * Create (or attach to) a Mol* plugin and wire it to the provider-agnostic executor.
 * Pure imperative core — the React layer (canvas.tsx) calls this inside useEffect.
 */
export async function createMolView(opts: CreateMolViewOptions): Promise<MolView> {
  const ownsPlugin = opts.plugin === undefined;
  let plugin = opts.plugin;
  if (plugin === undefined) {
    if (!opts.canvas || !opts.container) {
      throw new Error('createMolView requires { canvas, container } unless an initialized plugin is provided.');
    }
    plugin = new PluginContext(DefaultPluginSpec());
    try {
      await plugin.init();
      const ok = await plugin.initViewerAsync(opts.canvas, opts.container);
      if (!ok) throw new Error('Mol* initViewerAsync failed to set up a WebGL context (no canvas3d).');
    } catch (err) {
      plugin.dispose();
      throw err;
    }
  }

  const ctx = molstarExecutorContext(plugin);
  const { dispatch } = createExecutor(ctx, {
    resolveStructure: opts.resolveStructure,
    resolveCoordinates: opts.resolveCoordinates,
  });
  const xr = createXrApi(plugin);
  // Snapshot the narrowed (non-undefined) plugin; the returned closures must close over this const, not the reassignable `let`.
  const bound = plugin;

  return {
    dispatch,
    getSceneContext: () => ctx.getSceneContext(),
    clearHighlight: () => ctx.clearHighlight(),
    subscribeHover: (cb) => subscribeHoverEvents(bound.behaviors.interaction.hover, cb),
    xr,
    plugin: bound,
    handleResize: () => bound.canvas3d?.handleResize(),
    dispose: () => {
      if (ownsPlugin) bound.dispose();
    },
  };
}
