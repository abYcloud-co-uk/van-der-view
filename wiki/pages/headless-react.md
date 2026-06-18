---
title: Headless Mol* in React (Next.js / Vite / Remix / TanStack)
slug: headless-react
type: how-to
status: stable
sources: [raw/0001-molstar-research.md, "https://github.com/molstar/molstar/issues/648"]
updated: 2026-06-18
links: [molstar-api, project-overview]
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
- [[project-overview]] — the framework-agnostic constraint this satisfies

## Open questions
- Will van-der-view ship one wrapper component, or just hooks (`useMolstar`) +
  bring-your-own-canvas?
- Bundle strategy: peer-dep on `molstar` (consumer installs) vs. bundling.
- Verify current Turbopack status against the pinned Next.js version.
