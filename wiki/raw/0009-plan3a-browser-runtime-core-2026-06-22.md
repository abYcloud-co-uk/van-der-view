---
source_id: 0009
title: Plan 3a — browser runtime core (React mount + real Mol* adapter) implemented & merged
origin: "dev session 2026-06-22 (PR #12, merge 81e9b6d); design docs/superpowers/specs/2026-06-18-plan3a-browser-runtime-core-design.md; plan docs/superpowers/plans/2026-06-18-plan3a-browser-runtime-core.md"
fetched: 2026-06-22
type: user-note
supersedes: null
---

# Plan 3a — Browser runtime core (implemented, merged PR #12, 2026-06-22)

Dev-born knowledge: **Plan 3 was decomposed** into **3a = runtime core** (this work)
and **3b = Vite demo + manual XR** (next). Plan 3a was implemented subagent-driven
and merged to `main` (PR #12, merge commit `81e9b6d`). It makes the library drive a
**real Mol\* instance in a real React app** — the executor's `ExecutorContext` port,
which Plan 2 only satisfied with a test fake, now has a real adapter. 88 tests;
`pnpm test` / `pnpm typecheck` green.

## What landed (`src/`)

- **`src/mol/adapter.ts` — `molstarExecutorContext(plugin: PluginContext): ExecutorContext`.**
  The real adapter; implements all 7 port members against live Mol\* managers. Resolves
  the Plan-2 handoff "real `PluginContext`→`ExecutorContext` adapter" (src: raw/0008).
  - `loadStructure` begins with `await plugin.clear()` — **load-structure replaces the
    scene** (v1 is single-structure; every later command reads `structures[0]`, so a
    prior structure must be cleared or a second load is appended and silently ignored).
    Then `builders.data.download` (url) or `builders.data.rawData` (inline) →
    `parseTrajectory(data, format)` → `hierarchy.applyPreset(traj, 'default')`.
  - `highlight` → `managers.interactivity.lociHighlights.highlightOnly({ loci })`;
    `clearHighlight` → `…clearHighlights()`.
  - `focus(loci, options?)` → `managers.camera.focusLoci(loci, { durationMs, ...extra })`.
  - `resetCamera` → `managers.camera.reset()`.
  - `getStructure` / `getSceneContext` read
    `managers.structure.hierarchy.current.structures` (loaded flag + per-structure chains).
  - **Chain enumeration is memoized** in a `WeakMap<Structure, string[]>` (`chainsOf`):
    a `Structure` is immutable so its chain list never changes; `get-scene-context` is
    called often (agent reads it before guessing selectors), so this avoids re-walking
    every unit per call. Auth id (`auth_asym_id`) for atomic units, **label id
    (`label_asym_id`) for coarse units** — auth numbering isn't defined for coarse models.

- **`src/selection.ts` — real preset selectors.** The 7 v1 presets resolve via Mol\*'s
  **own pure-Node** `StructureSelectionQueries.<name>.query(new QueryContext(structure))`
  then `StructureSelection.toLociWithSourceUnits(...)`. `PRESET_QUERIES:
  Record<SelectionPreset, StructureSelectionQuery>` maps `all|polymer|protein|nucleic|
  ligand|ion|water` to the matching `StructureSelectionQueries.<name>`. An unknown preset
  → `invalid_selection`; a valid preset matching nothing → empty loci → `empty_selection`.
  This **removes `unsupported_selection` from the v1 throw path** (it is now a reserved,
  unused code, kept for API compatibility).

- **`src/mol/xr.ts` — `createXrApi(plugin): MolViewXR`.** Thin null-safe wrappers over
  `plugin.canvas3d?.xr` (`isSupported`/`isPresenting`/`request`/`end` + a change
  subscription). Null-safe because the adapter may be built **before `initViewerAsync`**
  (no `canvas3d` yet). Unit-tested with a stub plugin (`test/xr.test.ts`).

- **`src/mol/create-mol-view.ts` — `createMolView(opts): Promise<MolView>`.** Owns plugin
  lifecycle + assembly into a `MolView` (dispatch + xr + dispose). **Dual-mode plugin
  ownership:** if given a host `plugin` it attaches and **never disposes** it; otherwise it
  creates+owns+disposes its own. The create path is wrapped in try/catch (dispose on
  failure + throw if `initViewerAsync` returns `false`). Typecheck-gated (GPU-bound; real
  rendering verified by hand in Plan 3b).

- **React surface (`src/react/`):**
  - `provider.tsx` — `<MolViewProvider>`, `useMolViewContext()`, `MolViewConfig`. Uses a
    stable `EMPTY_CONFIG` sentinel (avoids re-creating the config object each render) and
    `import type { PluginContext }` (no static value import of molstar).
  - `canvas.tsx` — **`<MolViewCanvas/>`**: a style-forwarding wrapper. vdv owns the canvas
    DOM + the `dispose()` / dynamic-import / `'use client'` SSR discipline; the **host
    controls size via CSS** (forwarded `className`/`style`). The effect **lazy-imports the
    mol layer** via `await import()` inside `useEffect`, keyed on `[plugin]` (re-inits when
    the plugin prop changes), and `.catch(...)`es mount failures (no unhandled rejection).
  - `use-mol-view.ts` — `useMolView(): MolView | undefined`.

- **`src/browser.ts`** — the **browser-side barrel** (molstar-dependent; deliberately
  **not** in the agent-side `src/index.ts`). **Value-exports** the React layer; uses
  **`export type`** for mol-layer types so importing the barrel pulls **no static molstar
  into the value graph** (SSR-safe).

- **`src/context.ts` / `src/commands.ts` / `src/executor.ts`:**
  - `FocusOptions { durationMs?: number; zoomOut?: number }` — **`zoomOut` is a NUMERIC
    factor** (resolved the boolean/number fork): `1` = fit the selection, `2` ≈ frame
    twice as wide for context. The adapter realizes it as
    `extraRadius = (factor - 1) * loci.structure.boundary.sphere.radius` (scaled by
    structure size so the pull-back is visible at any scale); `<= 1`/omitted leaves Mol\*'s
    default tight fit. The executor forwards `durationMs`/`zoomOut` only when numeric and
    passes `undefined` when neither is set.
  - **`highlight.style` was dropped from the v1 schema** — deferred to the **v1.1
    representation cluster** (the 3a cut line). `highlight` is just `{ selection }` in v1.

## SSR guard (realized + proven)

The guard is **not** `'use client'` (under Next App Router a `'use client'` module is
still imported + first-rendered server-side). The realized guard: **no static molstar in
the React/browser value graph** — `canvas.tsx` lazy-imports the mol layer inside
`useEffect`; `provider.tsx` uses `import type`; `browser.ts` uses `export type` for
mol-layer types. Proven by **`test/ssr.test.tsx`** (jsdom): `renderToString(<MolViewProvider>
<MolViewCanvas/></MolViewProvider>)` → no throw, canvas placeholder out, **no molstar
server-side**.

## Testing split (this plan)

- **Automated (Node, in CI):** preset selectors (new `PDB_HET`/`PDB_NUCLEIC` fixtures),
  XR wrappers (stub plugin), the SSR smoke. Existing executor/adapter/selection tests stay
  green. 88 tests total.
- **Typecheck-gated + manual in 3b:** the real adapter rendering (load/highlight/focus/
  reset/scene-context), `createMolView`, the React mount, `<MolViewCanvas/>` resize, and
  XR enter/apply/exit — per the locked strategy (automate off-GPU; eyeball GPU).

## Config/deps (Task 1)

`package.json`: `react`/`react-dom` as **peerDependencies** (`^18 || ^19`) + dev installs
(react 19), `jsdom` dev. `tsconfig.json`: `"jsx": "react-jsx"`. `vitest.config.ts`:
`include` now also globs `test/**/*.test.tsx` (needed or the SSR test isn't collected).

## New handoffs to Plan 3b (next)

- The **Vite demo + manual XR / visual checklist** — where `focus.zoomOut` magnitude and
  overall **camera feel get tuned by eye** (the numeric factor's exact comfortable value).

## Deferred / known follow-ups (not v1-blocking)

- **Coarse-model chains** (#2): `chainsOf` already falls back to `label_asym_id` for
  non-atomic units; richer coarse-model handling is future.
- **Error-code semantics** (#5): `unsupported_selection` is now **reserved but never
  thrown** in v1 (all presets implemented; unknown preset → `invalid_selection`).
- **XR early-subscribe** (#6): subscribing to `canvas3d.xr` state **before**
  `initViewerAsync` (canvas3d created lazily) — the wrappers are null-safe today.
- **Multi-model selection scoping** — `toLociWithSourceUnits` still unions across models.
- **Packaging** — build + package `exports` (the molstar-free `src/index.ts` vs the
  molstar-dependent `src/browser.ts`) is the later packaging phase.

## Resolves (open questions)

The Plan-3-handoffs rollup (real adapter, preset selectors, `clearHighlight`/`zoomOut`)
is **resolved** — except `highlight.style`, which moved to v1.1.
