---
title: Headless Mol* in React (Next.js / Vite / Remix / TanStack)
slug: headless-react
type: how-to
status: stable
sources: [raw/0001-molstar-research.md, raw/0009-plan3a-browser-runtime-core-2026-06-22.md, "https://github.com/molstar/molstar/issues/648"]
updated: 2026-06-22
links: [molstar-api, agent-command-flow, project-overview, testing-strategy]
---

# Headless Mol* in React (Next.js / Vite / Remix / TanStack)

> Mol* is **browser/WebGL-only** — it touches `window`, `document`, and WebGL, so
> it must be **client-only**. This page covers mounting it without SSR breakage,
> the requirement behind van-der-view constraint #3 ([[project-overview]]).

## Key facts

- **No official React component** ships in `molstar`. You write your own wrapper:
  a `ref` + `useEffect` that initializes on mount and **`plugin.dispose()` on
  unmount** (releases the WebGL context — skipping this leaks GL contexts)
  (src: raw/0001).
- **Client-only is mandatory** under SSR frameworks. Maintainer-confirmed in Mol*
  issue #648 (src: raw/0001).
- ⚠️ **Do not mix CommonJS and ESM imports** of molstar — causes "Cannot use
  import statement outside a module" (src: raw/0001).

## Details

### The mount/unmount skeleton (headless path)

```tsx
'use client';
import { useEffect, useRef } from 'react';

export function MolView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let plugin: any;
    let cancelled = false;
    (async () => {
      const { PluginContext } = await import('molstar/lib/mol-plugin/context');
      const { DefaultPluginSpec } = await import('molstar/lib/mol-plugin/spec');
      if (cancelled) return;
      plugin = new PluginContext(DefaultPluginSpec());
      await plugin.init();
      await plugin.initViewerAsync(canvasRef.current!, containerRef.current!);
    })();
    return () => { cancelled = true; plugin?.dispose(); };
  }, []);

  return <div ref={containerRef}><canvas ref={canvasRef} /></div>;
}
```
See [[molstar-api]] for the post-init control calls. Dynamic `import()` inside
`useEffect` also keeps molstar out of the server bundle.

### van-der-view's realized React surface (Plan 3a, implemented — src: raw/0009)

The wrapper above is now shipped concretely as the **browser-side barrel `src/browser.ts`**:

- **`<MolViewProvider>`** — holds the `MolViewConfig` (a stable `EMPTY_CONFIG` sentinel
  by default) and the plugin; `import type` only for `PluginContext` (no static molstar).
- **`useMolView(): MolView | undefined`** — hands the assembled viewer (`dispatch` + `xr`)
  to the host's agent loop (see [[agent-command-flow]]).
- **`<MolViewCanvas/>`** — a **style-forwarding** wrapper: vdv owns the canvas DOM and all
  of the `dispose()` / dynamic-import / `'use client'` discipline; the **host controls
  size via CSS** (forwarded `className`/`style`). Its effect lazy-imports the mol layer
  inside `useEffect`, is keyed on `[plugin]` (re-inits when the plugin prop changes), and
  `.catch`es mount failures instead of throwing an unhandled rejection.

**SSR-safety is structural, not `'use client'`:** the barrel value-exports the React layer
but uses **`export type`** for mol-layer types, so importing it pulls no static molstar into
the value graph. Proven by an SSR `renderToString` smoke ([[testing-strategy]]).

**Dual-mode plugin ownership:** `createMolView({ plugin })` / `<MolViewProvider plugin={…}>`
**attaches** to a host-owned plugin and never disposes it; with no plugin, vdv
**creates+owns+disposes** its own ([[agent-command-flow]]).

### Per-framework notes

| Framework | What to do |
|---|---|
| **Next.js (App Router)** | `'use client'` on the component; or `next/dynamic(() => import('./MolView'), { ssr: false })`. Turbopack issues #1488/#1533/#1693 — fallback: copy `node_modules/molstar/build/viewer/molstar.js` to `/public`, load via `<Script>`, use `window.molstar`. (src: raw/0001) |
| **Vite** | Works as ESM; see issue #1527 (Vite + React Router). No SSR by default. |
| **Remix** | A `useEffect`-gated init never runs server-side; ensure the import is dynamic so it's not in the server bundle. |
| **TanStack (Start/Router)** | Same client-only rule; gate init in `useEffect`, dynamic import. |

### CSS

- **Truly headless (no `createPluginUI`):** no Mol* UI CSS needed.
- If you ever mount the stock UI: prebuilt `import "molstar/build/viewer/molstar.css"`
  (no toolchain — best for a redistributable lib) or SCSS skins
  `molstar/lib/mol-plugin-ui/skin/light.scss` (needs a SCSS toolchain).

### Don't copy these

- `molstar-react` (npm v0.5.2, 2023): stale, pinned to `molstar ^3.27`, and its
  cleanup **omits `plugin.dispose()`** (src: raw/0001).
- `pdbe-molstar`: maintained but ships a **Web Component**, not a React component;
  heavier than a headless wrapper.

## See also
- [[molstar-api]] — what to call after `initViewerAsync`
- [[agent-command-flow]] — how `useMolView()` hands the plugin to the executor
- [[project-overview]] — the framework-agnostic constraint this satisfies
- [[testing-strategy]] — the SSR `renderToString` smoke that verifies this guard

## Open questions
- ✅ **One wrapper vs hooks-only** — decided & shipped (Plan 3a): vdv ships a
  style-forwarding `<MolViewCanvas/>` **plus** `<MolViewProvider>`/`useMolView()`; vdv owns
  the canvas DOM, the host sizes it with CSS (src: raw/0009).
- Bundle strategy: peer-dep on `molstar` (consumer installs) vs. bundling. `react`/
  `react-dom` are now declared **peerDependencies** (`^18 || ^19`); the `molstar` packaging
  decision is the later packaging phase (src: raw/0009).
- Verify current Turbopack status against the pinned Next.js version.
- Real-browser mount of `<MolViewCanvas/>` (paint + resize) is **manual in Plan 3b** — the
  SSR smoke proves only the server path, not the GPU path (src: raw/0009).
