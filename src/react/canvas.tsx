'use client';
import { useEffect, useRef, type CSSProperties, type HTMLAttributes } from 'react';
import { useMolViewContext } from './provider';

/**
 * Renders the Mol* canvas inside a host-sizable container. Style/className/data-*
 * are forwarded to the container <div>, so the host controls size with normal CSS
 * (give the container a real height — a 0-height container yields a 0-size canvas).
 *
 * SSR-safe: molstar is reached only via a dynamic import inside useEffect, which
 * does not run during renderToString — so nothing touches WebGL/window server-side.
 */
export function MolViewCanvas(props: HTMLAttributes<HTMLDivElement>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctx = useMolViewContext();
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  // Initialize once on mount; capture latest config/plugin via ref to avoid re-mount churn.
  useEffect(() => {
    let disposed = false;
    let created: { dispose(): void } | undefined;
    void (async () => {
      const { createMolView } = await import('../mol/create-mol-view');
      if (disposed || !canvasRef.current || !containerRef.current) return;
      const { config, plugin, registerView } = ctxRef.current;
      const view = await createMolView({
        canvas: canvasRef.current,
        container: containerRef.current,
        plugin,
        resolveStructure: config.resolveStructure,
      });
      if (disposed) { view.dispose(); return; }
      created = view;
      registerView(view);
    })();
    return () => {
      disposed = true;
      ctxRef.current.registerView(undefined);
      created?.dispose();
    };
  }, []);

  const { style, ...rest } = props;
  const containerStyle: CSSProperties = { position: 'relative', ...style };
  return (
    <div ref={containerRef} style={containerStyle} {...rest}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
