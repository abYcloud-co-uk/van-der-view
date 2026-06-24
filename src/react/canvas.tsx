'use client';
import { useEffect, useRef, type CSSProperties, type HTMLAttributes } from 'react';
import { useMolViewContext } from './provider';

/**
 * Props for {@link MolViewCanvas}. Omits the DOM `onError` (a SyntheticEvent handler) so the
 * name can carry a viewer init-error callback instead (#24); everything else is forwarded to
 * the container <div>.
 */
export interface MolViewCanvasProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'> {
  /** Called if viewer initialization fails (WebGL context creation, missing molstar peer, …).
   *  Lets the host render an error state — otherwise a failed init is indistinguishable from a
   *  slow-but-pending one (`useMolView()` stays `undefined` either way). */
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
      onErrorRef.current?.(err instanceof Error ? err : new Error(msg));
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
