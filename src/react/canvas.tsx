'use client';
import { useEffect, useRef, type CSSProperties, type HTMLAttributes } from 'react';
import { useMolViewContext } from './provider';

/**
 * Props for {@link MolViewCanvas}. Omits the DOM `onError` (a SyntheticEvent handler) so the
 * name can carry a viewer init-error callback instead (#24); everything else is forwarded to
 * the container <div>.
 */
export interface MolViewCanvasProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'> {
  /** Called once if **viewer initialization** fails (WebGL context creation, a missing molstar
   *  peer, …) — lets the host render an error state instead of an indefinite pending one
   *  (`useMolView()` stays `undefined` either way). It does NOT cover per-command failures after a
   *  successful mount: those come back as an error `CommandResult` from `dispatch`. (#7) */
  onError?: (error: Error) => void;
}

/**
 * Renders the Mol* canvas inside a host-sizable container. Style/className/data-*
 * are forwarded to the container <div>, so the host controls size with normal CSS
 * (give the container a real height — a 0-height container yields a 0-size canvas).
 *
 * SSR-safe: molstar is reached only via a dynamic import inside useEffect, which
 * does not run during renderToString — so nothing touches WebGL/window server-side.
 */
export function MolViewCanvas({ onError, ...props }: MolViewCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctx = useMolViewContext();
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  // Ref so a changing onError identity doesn't re-run the init effect (keyed on [plugin]).
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const { plugin } = ctx;

  // Re-initialize when the host `plugin` changes — covers a host that mounts the
  // canvas first and resolves its Mol* PluginContext asynchronously, passing it on a
  // later render. On that transition the prior (vdv-created) instance is disposed and
  // a fresh one attaches to the host plugin; a host plugin is never disposed by vdv.
  // config is read via ctxRef so config churn alone does not re-init. (Pass a stable
  // plugin reference — a new identity every render would thrash the viewer.)
  useEffect(() => {
    let disposed = false;
    let created: { dispose(): void } | undefined;
    (async () => {
      const { createMolView } = await import('../mol/create-mol-view');
      if (disposed || !canvasRef.current || !containerRef.current) return;
      const { config, registerView } = ctxRef.current;
      const view = await createMolView({
        canvas: canvasRef.current,
        container: containerRef.current,
        plugin,
        resolveStructure: config.resolveStructure,
        resolveCoordinates: config.resolveCoordinates,
      });
      if (disposed) { view.dispose(); return; }
      created = view;
      registerView(view);
    })().catch((err) => {
      // Mount failure. Log so it isn't a silent unhandled rejection AND surface it to the host via
      // onError (#24). `molstar` is an optional peer (the agent-side entry never needs it), so a
      // module-resolution error here means the browser entry's molstar peer wasn't installed —
      // give an actionable hint in that case.
      //
      // Suppress stale runs: `disposed` is set by cleanup on unmount or a [plugin] re-init, so a
      // failure reaching here is from a superseded/unmounted run — the live run (if any) fires
      // onError from its own catch. A stable live mount keeps disposed===false, so real init
      // failures still surface to the host (#2).
      if (disposed) return;
      const msg = err instanceof Error ? err.message : String(err);
      if (/molstar/i.test(msg) && /cannot find|module not found|failed to (resolve|fetch|load)/i.test(msg)) {
        console.error(
          '[van-der-view] <MolViewCanvas> could not load "molstar" — it is a required peer ' +
            'dependency for the browser entry. Install it (e.g. `npm install molstar`). Original error:',
          err,
        );
      } else {
        console.error('[van-der-view] <MolViewCanvas> failed to initialize Mol*:', err);
      }
      // Let the host render an error state instead of an indefinite pending/undefined view.
      // Contain a throwing callback so it can't escape as an unhandled rejection on this terminal
      // promise chain (#3).
      try {
        onErrorRef.current?.(err instanceof Error ? err : new Error(msg));
      } catch (callbackError) {
        console.error('[van-der-view] <MolViewCanvas> onError callback threw:', callbackError);
      }
    });
    return () => {
      disposed = true;
      ctxRef.current.registerView(undefined);
      created?.dispose();
    };
  }, [plugin]);

  const { style, ...rest } = props;
  const containerStyle: CSSProperties = { position: 'relative', ...style };
  return (
    <div ref={containerRef} style={containerStyle} {...rest}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
