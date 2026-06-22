import type { PluginContext } from 'molstar/lib/mol-plugin/context';

/** Host-facing XR state/control — thin wrappers over plugin.canvas3d.xr. */
export interface MolViewXR {
  isSupported(): boolean;
  isPresenting(): boolean;
  request(): Promise<void>; // must be called from a real user gesture (WebXR rule)
  end(): Promise<void>;
  subscribe(cb: (presenting: boolean) => void): () => void;
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
  };
}
