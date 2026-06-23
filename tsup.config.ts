import { defineConfig } from 'tsup';

export default defineConfig({
  // Two public entries: "." (agent-side, molstar-free) and "./browser" (molstar/React).
  entry: { index: 'src/index.ts', browser: 'src/browser.ts' },
  format: ['esm'],
  dts: true,
  treeshake: true,
  // Keep canvas.tsx's lazy import('./mol/...') as its own chunk, so neither
  // index.js nor browser.js pulls molstar at module-load.
  splitting: true,
  target: 'es2022',
  sourcemap: true,
  clean: true,
  // Regexes (not bare names): molstar's deep imports (molstar/lib/...) and
  // react-dom/server must stay external, never bundled.
  external: [/^molstar(\/|$)/, /^react(-dom)?(\/|$)/],
});
