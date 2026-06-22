import type { PluginContext } from 'molstar/lib/mol-plugin/context';

/** Host-facing XR state/control — thin wrappers over plugin.canvas3d.xr. */
export interface MolViewXR {
  isSupported(): boolean;
  isPresenting(): boolean;
  request(): Promise<void>; // must be called from a real user gesture (WebXR rule)
  end(): Promise<void>;
  /** Subscribe to presenting (enter/exit XR) changes. Returns an unsubscribe fn. */
  subscribe(cb: (presenting: boolean) => void): () => void;
  /**
   * Subscribe to support changes. `isSupported` starts false and flips true only after
   * the async `navigator.xr.isSessionSupported()` probe resolves — so a one-shot read at
   * mount can miss real support. Observe it here (fires immediately with the current
   * value). Returns an unsubscribe fn.
   */
  subscribeSupported(cb: (supported: boolean) => void): () => void;
}

/**
 * Wrap a plugin's XR manager. canvas3d only exists after initViewerAsync, so every
 * accessor is null-safe: before init (or where XR is absent) state reads false and
 * controls are no-ops.
 */
export function createXrApi(plugin: PluginContext): MolViewXR {
  const xr = () => plugin.canvas3d?.xr;
  return {
    isSupported: () => xr()?.isSupported.value ?? false,
    isPresenting: () => xr()?.isPresenting.value ?? false,
    request: async () => { await xr()?.request(); },
    end: async () => { await xr()?.end(); },
    subscribe: (cb) => {
      const sub = xr()?.isPresenting.subscribe(cb);
      return () => sub?.unsubscribe();
    },
    subscribeSupported: (cb) => {
      const sub = xr()?.isSupported.subscribe(cb);
      return () => sub?.unsubscribe();
    },
  };
}
