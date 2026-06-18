# Plan 3a — Browser Runtime Core: Design Spec

**Date:** 2026-06-18
**Status:** approved (brainstorming) → ready for writing-plans
**Slice of:** Plan 3 (browser-side React mount + real adapter + SSR smoke + Vite demo + XR).
Plan 3 was decomposed into **3a (this doc — runtime core)** and **3b (Vite demo +
manual XR/visual checklist, depends on 3a)**.

---

## Goal

Make the library actually drive a **real Mol\* instance in a real React app**: mount
the plugin (client-only, lifecycle-safe), implement the live `ExecutorContext` adapter
over Mol\*'s managers/builders, finish the *simple* v1 commands Plan 2 stubbed, and
expose XR state/events — with an **SSR smoke test** plus **Node unit tests** for
everything that does not touch the GPU.

After 3a: a developer can `<MolViewProvider><MolViewCanvas/></MolViewProvider>`,
`useMolView().dispatch(command)`, and see a real structure load/highlight/focus. The
GPU-bound rendering is verified by hand in **3b**.

## Context (what already exists)

- **Agent-side core (Plan 1, merged):** command schema, v1 catalog (`src/commands.ts`),
  Anthropic adapter. Public via the molstar-free barrel `src/index.ts`.
- **Browser executor core (Plan 2, merged):** `createExecutor(ctx, opts).dispatch(command)`
  over the `ExecutorContext` **port** (`src/context.ts`), `resolveSelection`
  (`src/selection.ts`), `defaultResolveStructure` (`src/resolve-structure.ts`). The port
  is implemented by a **test fake** today; 3a adds the **real Mol\* implementation**.
- Architecture is locked in `wiki/` — `headless-react`, `molstar-api`, `molstar-webxr`,
  `agent-command-flow`, `command-schema`, `testing-strategy`. This spec only resolves the
  remaining Plan-3 forks and the 3a build plan.

## Locked decisions (this brainstorming session)

1. **Decomposition:** build & merge **3a (runtime core)** first, subagent-driven; **3b
   (Vite demo + manual XR)** after.
2. **React surface:** ship **Provider + hook + a `<MolViewCanvas/>` component** (vdv owns
   the canvas DOM + the `dispose()` / dynamic-import / `'use client'` discipline).
   `<MolViewCanvas/>` is a **style-forwarding thin wrapper** — the host controls size with
   normal CSS (`style`/`className`/parent flex-grid/`aspectRatio`); the canvas fills its
   container and Mol\* tracks container resize. Caveat documented: the container needs a
   real height or the canvas collapses to 0 (generic WebGL gotcha).
3. **Plugin-instance ownership (already locked, restated):** vdv supports **both** — it
   creates+owns the plugin (and disposes it), **or** attaches to a host-provided plugin
   (`plugin` prop / `createMolView({plugin})`) and **never** disposes that one.
4. **3a cut line:** finish the *simple* v1 commands; **defer `highlight.style`** (persistent
   representation/color/opacity) to the v1.1 representation cluster (it overlaps
   `color`/`set-representation`).

---

## Scope

### In scope (3a)

| Unit | Responsibility |
|---|---|
| `src/mol/adapter.ts` | `molstarExecutorContext(plugin): ExecutorContext` — the real 7-member port impl over Mol\* managers/builders |
| `src/mol/create-mol-view.ts` | `createMolView(opts): Promise<MolView>` — plugin create/init/dispose lifecycle, builds the executor, wires XR; the imperative core (framework-agnostic) |
| `src/mol/xr.ts` | thin wrappers over `plugin.canvas3d.xr` BehaviorSubjects (state + subscribe) |
| `src/react/provider.tsx` | `<MolViewProvider>` + React context |
| `src/react/canvas.tsx` | `<MolViewCanvas/>` — renders container+canvas, runs `createMolView` in `useEffect`, disposes on unmount; forwards `style`/`className`/`id`/`...rest` to the container |
| `src/react/use-mol-view.ts` | `useMolView(): MolView \| undefined` |
| `src/browser.ts` | barrel for the molstar/React surface — **NOT** re-exported from `src/index.ts` |
| MODIFY `src/selection.ts` | real preset selectors (`all/polymer/protein/nucleic/ligand/ion/water`) replacing `unsupported_selection` |
| MODIFY `src/context.ts` | `FocusOptions += zoomOut?: boolean` |
| MODIFY `src/executor.ts` | forward `zoomOut` into the focus options |
| MODIFY `src/commands.ts` | drop `highlight.style` from the **v1** `input_schema` (moves to v1.1) |

### Out of scope (3a)

- The **Vite demo** and **manual XR/visual checklist** → **3b**.
- `highlight.style` + the v1.1 representation cluster (`color`, `set-representation`,
  `load-scene`, the `toggle-xr` **command**).
- Host-defined/open `ErrorCode` set; multi-model selection scoping; schema-driven
  validation refactor; `dispatch(rawProviderBlock)` convenience overload.
- Package **`exports` map, build step, peer-dep finalization** → the later packaging phase.
  3a only sets up the `src/browser.ts` **source** barrel.

---

## Public API surface

```ts
// src/mol/create-mol-view.ts — the imperative core (no React)
createMolView(opts: CreateMolViewOptions): Promise<MolView>;

interface CreateMolViewOptions {
  canvas?: HTMLCanvasElement;     // required unless `plugin` is supplied already-initialized
  container?: HTMLElement;        // required unless `plugin` is supplied already-initialized
  plugin?: PluginContext;         // attach to a host plugin; vdv will NOT dispose it
  resolveStructure?: ResolveStructure;   // host override; defaults to defaultResolveStructure
}

interface MolView {
  dispatch(command: Command): Promise<CommandResult>;   // Command only (host runs adapters.anthropic.toCommand itself)
  getSceneContext(): SceneContext;
  clearHighlight(): void;
  xr: MolViewXR;
  plugin: PluginContext;          // escape hatch
  handleResize(): void;           // manual resize trigger (ResizeObserver covers the common cases)
  dispose(): void;                // disposes the plugin only if vdv created it
}

interface MolViewXR {
  isSupported(): boolean;
  isPresenting(): boolean;
  request(): Promise<void>;       // must be called from a real user gesture (WebXR rule)
  end(): Promise<void>;
  subscribe(cb: (presenting: boolean) => void): () => void;   // returns unsubscribe
}
```

React layer (thin wrappers over `createMolView`):

```tsx
<MolViewProvider config={{ resolveStructure }} plugin={existing?}>
  <MolViewCanvas style={{ height: '100%' }} className="viewer" />
  <Chat />
</MolViewProvider>

// in a descendant:
const view = useMolView();          // MolView | undefined (undefined until <MolViewCanvas/> mounted+inited)
if (view) await view.dispatch(cmd);
```

- `<MolViewCanvas/>` dynamically `import()`s molstar inside `useEffect` (keeps it out of
  the server bundle), calls `createMolView({ canvas, container, plugin, resolveStructure })`,
  publishes the resulting `MolView` to context, and calls `view.dispose()` on unmount.
- `useMolView()` returns `undefined` until the canvas has mounted and init resolved. A
  `dispatch` before readiness is impossible through this hook (host guards on truthiness);
  via the imperative `createMolView` the returned `MolView` is always already-ready.

## The adapter — `molstarExecutorContext(plugin): ExecutorContext`

Every signature is **verified against `node_modules/molstar/lib/**/*.d.ts`** during the
plan (a checked step), and confirmed visually in the 3b demo.

| port member | real Mol\* call (to verify) |
|---|---|
| `getStructure()` | `plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data` |
| `loadStructure(r)` | `builders.data.download({ url, isBinary })` or `builders.data.rawData({ data })` → `builders.structure.parseTrajectory(data, r.format)` → `builders.structure.hierarchy.applyPreset(traj, 'default')` |
| `highlight(loci)` | `plugin.managers.interactivity.lociHighlights.highlightOnly({ loci })` (transient) |
| `clearHighlight()` | `plugin.managers.interactivity.lociHighlights.clearHighlights()` |
| `focus(loci, opts)` | `plugin.managers.camera.focusLoci(loci, { durationMs, /* zoomOut → larger extraRadius */ })` |
| `resetCamera()` | `plugin.managers.camera.reset()` |
| `getSceneContext()` | build `{ loaded, structures: [{ chains: string[] }] }` from `hierarchy.current.structures` (enumerate distinct chain ids per structure) |

`ResolvedStructure.format` is `'mmcif' | 'pdb'`; `isBinary` selects `download` binary mode.
Mol\* load failures are wrapped in `ExecutorError('internal_error', …)` so `dispatch`
returns a structured `CommandResult` (the closed `ErrorCode` union is unchanged in 3a).

## Finishing v1 (the simple commands)

- **Preset selectors** (`src/selection.ts`): map the 7 preset names to Mol\*'s own
  `StructureSelectionQueries` (`all/polymer/protein/nucleic/ligand/ion/water` exist in
  `mol-plugin-state/helpers/structure-selection-query`). **Plan must confirm** these run
  **Node-side** against a fixture `Structure` (no plugin/WebGL). If they do → presets are
  **automated-tested** like the existing selection tests. If a given query needs the
  plugin, fall back to hand-written MolScript for that preset (still Node-testable). An
  unknown preset stays `invalid_selection`; a known preset matching nothing →
  `empty_selection` (existing executor behavior).
- **`focus.zoomOut: boolean`** (`src/context.ts` `FocusOptions`, forwarded by
  `src/executor.ts`): when `true`, pass a larger `extraRadius` to `focusLoci` (exact value
  verified against `focusLoci` defaults). The executor only forwards it when present
  (mirrors the existing `durationMs` handling).
- **`clearHighlight`**: wired in the adapter and surfaced on `MolView.clearHighlight()`.
  **No new agent command** in v1 — a fresh `highlightOnly` already replaces the previous
  highlight (YAGNI); revisit a `clear-highlight` command only if a need appears.
- **`highlight.style` → v1.1**: removed from the v1 `highlight` `input_schema` in
  `src/commands.ts` so the LLM is not advertised a param the executor drops. Re-introduced
  with the v1.1 representation cluster. Wiki `command-schema` updated to mark it v1.1.

## Testing

Follows the locked `testing-strategy`: automate everything off the GPU; verify rendering by
hand (in 3b).

**Automated (Vitest, CI):**
- `test/selection.test.ts` — extend with preset loci assertions: positive on the 1CRN
  fixture for `all`/`polymer`/`protein`; `ligand`/`ion`/`water` → empty on 1CRN. **Add a
  tiny HETATM-bearing fixture** (small bundled PDB/mmCIF snippet) to assert a *positive*
  `ligand`/`water` selection.
- `test/executor.test.ts` — `focus` forwards `zoomOut` into the fake port's focus options
  (present when set, absent when omitted).
- `test/ssr.test.tsx` — **jsdom** env: `renderToString(<MolViewProvider><MolViewCanvas/></MolViewProvider>)`
  → no throw, a placeholder/container element is emitted, the server output contains **no
  molstar internals**, and molstar is not imported during render (the guard
  `headless-react` describes).

**Manual (deferred to 3b):** the real adapter rendering (load/highlight/focus/reset/
scene-context actually change the canvas), `<MolViewCanvas/>` resize behavior, XR
enter/apply-while-presenting/exit.

**New dependencies:** `react` + `react-dom` as **peerDependencies** (and devDependencies
for tests), `@types/react` + `@types/react-dom`; the SSR test runs under the **jsdom**
Vitest environment (per-file `// @vitest-environment jsdom` or a config entry).

## Risks / things the plan must pin down

- **Mol\* signature drift** — `hierarchy.current.structures[...]`, `focusLoci` options
  (`extraRadius`/`minRadius`/`durationMs`), `canvas3d.xr` shape, `parseTrajectory`/`applyPreset`
  names: all verified against `node_modules/molstar/lib/**/*.d.ts` as explicit plan steps.
- **`StructureSelectionQueries` Node-usability** — confirm before committing the preset
  approach; fallback is hand-written MolScript per preset.
- **`canvas3d` timing** — `plugin.canvas3d` is only available after `initViewerAsync`; the
  XR wrappers must guard against a not-yet-initialized canvas3d.
- **Container sizing** — `<MolViewCanvas/>` must forward sizing props and document the
  "give it a height" caveat; verify whether Mol\* observes the container (ResizeObserver)
  or only `window`, and add a `ResizeObserver` fallback if needed.
- **SSR guard correctness** — molstar must be reachable **only** via the dynamic `import()`
  inside `useEffect`; nothing at module top-level or render may touch `window`/WebGL.

## Open questions (carried, not blocking 3a)

- Public package entry point shape (subpath `van-der-view/react` vs `/browser`) and
  peer-dep vs bundle — **packaging phase**.
- Whether to ever open `ErrorCode` to host-defined codes.
- `dispatch(rawProviderBlock)` convenience overload.
- Residues-without-chain selection documented as "matches that residue number in **all**
  chains" — no code change in 3a.
