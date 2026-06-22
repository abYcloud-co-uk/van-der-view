# Plan 3b — Vite demo + manual XR (design spec)

_Date: 2026-06-22 · Status: approved · Branch: `feat/plan3b-vite-demo` (off `main`)_

## Context

van-der-view's three cores are merged on `main`: the agent-side core (Plan 1), the
browser-side executor core (Plan 2), and the **browser runtime core (Plan 3a, PR #12)** —
the real Mol\* adapter `molstarExecutorContext`, `createMolView` + XR wrappers, and the
React mount (`<MolViewProvider>` / `useMolView()` / `<MolViewCanvas/>`), exposed via the
molstar-dependent barrel `src/browser.ts`.

Plan 3a's **GPU/plugin-bound code is typecheck-gated, not unit-tested** — exercising the
real adapter needs a live WebGL context, which the Node suite cannot provide. **Plan 3b is
that missing manual verification layer:** a client-only Vite demo app that drives the real
adapter on a GPU, plus a manual XR checklist. It is the deliberate "manual, human-eye"
half of the locked testing strategy (`wiki/pages/testing-strategy.md`, raw/0004), whose
demo shape (the five panels and the two fixtures) this spec realizes.

This is mostly a **manual deliverable**: the automated output is a demo that **builds and
typechecks clean**; the **GPU + XR verification is the developer's manual run**. That run
may surface bugs in 3a's GPU code (only typechecked so far) — fixing those is in scope for
3b and is the whole reason the layer exists.

## Goals

- A standalone, client-only Vite + React app at `examples/demo/`, **no LLM and no chat**,
  that mounts `<MolViewCanvas/>` and exercises every v1 command against a real Mol\*
  instance on the GPU.
- All **five** demo panels from the testing-strategy spec: preset command buttons, a
  scene-context readout, a sequence stepper, a paste-`tool_use` box, and an Enter/Exit-XR
  control.
- A **`CHECKLIST.md`** capturing the manual smoke steps, including a hardware-free XR path
  (the Immersive Web Emulator).
- The demo consumes the library exactly as a real installer would — through
  `van-der-view` (agent-side) and `van-der-view/browser` (browser-side) imports.

## Non-goals (explicitly out of scope for 3b)

- No LLM call / chat UI (the paste-`tool_use` box stands in for real Claude output).
- No automated browser / Playwright / `headless-gl` rendering tests — 3b is the manual
  layer by design.
- No packaging: no `dist` build, no package `exports` map, no published entry points.
  (Packaging is the next, separate plan.)
- No new v1.1 commands (`color` / `set-representation` / `load-scene` / `toggle-xr`),
  no `highlight.style`.

## Locked decisions (from the 2026-06-22 brainstorm)

1. **Scope = all five panels** (preset buttons, scene-context readout, sequence stepper,
   paste-`tool_use` box, Enter/Exit-XR). Nothing deferred.
2. **Library wiring = Vite aliases to TS source.** `examples/demo` is a **pnpm workspace
   member** (so its own `vite`/`@vitejs/plugin-react`/`react` dev-deps install and hoist;
   `molstar` already resolves from the root) — but it consumes the library through
   **`resolve.alias`**, *not* a `workspace:*` dependency on a built package. This keeps the
   demo code reading like a real install while pulling **zero** packaging work forward.
   - `van-der-view` → `src/index.ts` (agent-side: `adapters`, `commands`).
   - `van-der-view/browser` → `src/browser.ts` (React mount + `MolView` types).
3. **Demo tsconfig is separate** from the library's `pnpm typecheck` gate — demo code never
   gates the library's CI.
4. **Fixtures:** **1CRN** bundled and loaded via the **`inline`** source (a Vite `?raw`
   import → `builders.data.rawData`); **1HSG** loaded via the **`pdb`** source (RCSB
   `download`). Together they cover both load paths and the replace-on-load `clear()`.
5. **XR has no hardware code-fork:** one Enter/Exit button gated on `xr.isSupported`;
   `CHECKLIST.md` documents both a real headset and the Immersive Web Emulator.
6. **`focus.zoomOut` is tuned by eye** via a slider in the focus panel — the open item the
   wiki flags for the demo.

## Architecture

### File layout (purely additive; no `src/` edits unless verification finds a 3a bug)

The demo package is named **`van-der-view-demo`** (the name `pnpm --filter` targets).

```
examples/demo/
  package.json          # name: van-der-view-demo; vite + @vitejs/plugin-react; react/react-dom from root hoist
  vite.config.ts        # @vitejs/plugin-react + the two resolve.alias entries
  tsconfig.json         # demo-local (jsx: react-jsx); NOT referenced by the lib typecheck
  index.html            # <div id="root"> + module script → src/main.tsx
  CHECKLIST.md          # the manual smoke + XR/emulator checklist
  src/
    main.tsx            # createRoot → <MolViewProvider><App/></MolViewProvider>
    App.tsx             # CSS-grid layout: <MolViewCanvas/> (sized) + the panel column
    fixtures.ts         # `?raw` import of fixtures/1crn.pdb; the 1HSG pdb id
    fixtures/
      1crn.pdb          # bundled crambin fixture (46 res, chain A, no ligand)
    panels/
      LoadPanel.tsx
      CommandsPanel.tsx
      SceneContextPanel.tsx
      StepperPanel.tsx
      PasteToolUsePanel.tsx
      XrPanel.tsx
```

⚠️ The fixture lives **under `src/`, not `public/`**: Vite's `?raw` import resolves through
the bundler from the source tree, whereas `public/` assets are copied verbatim and are not
module-importable. (If a fixture ever needs to be served by URL instead, that's the `public/`
+ `fetch()` path — not used here.)

Root-level additions: `pnpm-workspace.yaml` gains `packages: ['examples/*']` (alongside the
existing `@scarf` allow-build settings); optionally a root convenience script
`demo: pnpm --filter van-der-view-demo dev`. No change to `src/`, `vitest.config.ts`, or the
root `tsconfig.json` is expected.

### Mounting

`main.tsx` wraps the app in `<MolViewProvider>` (no `plugin` prop → vdv creates+owns its
own plugin). `App.tsx` renders a sized container holding `<MolViewCanvas style={{height}}/>`
(the host-sizing contract: a real height, or the canvas is 0×0) next to a column of panels.
Every panel reads the viewer with `useMolView()`, which returns `MolView | undefined` until
the canvas effect has mounted — panels render a disabled/"initializing…" state while
undefined.

### The five panels (each wired through `useMolView()`)

| Panel | Wiring | Verifies |
|---|---|---|
| **LoadPanel** | "Load 1CRN" → `dispatch({name:'load-structure', input:{source:'inline', data: CRN_PDB, format:'pdb'}})`; "Load 1HSG" → `{source:'pdb', id:'1hsg'}` | `rawData` + `download` paths; replace-on-load `clear()` |
| **CommandsPanel** | buttons → `highlight` (chain `A`; preset `ligand`), `focus` (with a **zoomOut slider** 1–4 and an optional `durationMs`), `reset-camera`, plus `viewer.clearHighlight()` | highlight/focus/reset render; zoomOut magnitude felt by eye |
| **SceneContextPanel** | a refresh button (and post-dispatch refresh) calling `viewer.getSceneContext()`, rendering `loaded` + per-structure `chains` | the `get-scene-context` "up" channel matches what's on screen |
| **StepperPanel** | a hardcoded `Command[]` (e.g. load → highlight → focus → reset); Next button / Enter key fires the next one; shows index + last `CommandResult` | real-time incremental control, one step at a time |
| **PasteToolUsePanel** | textarea of a raw Anthropic `tool_use` JSON → `adapters.anthropic.toCommand(block)` → show normalized `Command` → `dispatch` → show `CommandResult` | F1 (adapter) + F2 (render) together, with real Claude output |

Every dispatch surfaces its `CommandResult` (ok/error) in the panel so error codes
(`invalid_input`, `empty_selection`, …) are visible, not swallowed.

### XR

`XrPanel` reads `viewer.xr.isSupported` / `viewer.xr.isPresenting` (subscribing to their
change events) and shows a single Enter/Exit button. The button calls `xr.request()` /
`xr.end()` **from the real click handler** (honoring the WebXR user-gesture rule). When
`isSupported` is false the button is disabled with a hint pointing at `CHECKLIST.md`. No
hardware branch in code.

### Fixtures

- **1CRN** lives at `examples/demo/src/fixtures/1crn.pdb`, imported as a string via Vite's
  `?raw` query (`import CRN_PDB from './fixtures/1crn.pdb?raw'`) and loaded through the
  `inline` source — deterministic, offline, and exercises `builders.data.rawData`.
- **1HSG** is loaded by id through the `pdb` source, exercising the default RCSB resolver +
  `builders.data.download` (requires network).

## Verification & success criteria

**Automated (what I deliver, CI-able):**
- `examples/demo` typechecks against its own tsconfig.
- `pnpm --filter van-der-view-demo build` produces a production bundle without error.
- The root `pnpm test` / `pnpm typecheck` for the library stay green and unchanged (the
  demo is not in their scope).

**Manual (the developer's GPU run — `CHECKLIST.md`):**
1. `pnpm --filter van-der-view-demo dev` → canvas paints (non-zero size, dark viewport).
2. Load 1CRN (inline) → cartoon renders; Load 1HSG (pdb) → replaces the scene (1CRN gone).
3. highlight chain A / preset `ligand` → transient highlight shows; clear-highlight clears.
4. focus → camera moves; sweep the zoomOut slider 1→4 and confirm the pull-back scales
   sensibly (record a comfortable default to feed back into the docs).
5. reset-camera → returns to the default view.
6. SceneContext readout matches what's on screen (loaded flag + chains).
7. Stepper advances through its sequence one command per click/Enter.
8. Paste a real Anthropic `tool_use` block → normalized `Command` shown → dispatch renders.
9. XR: on a headset **or** the Immersive Web Emulator — Enter → stereo render → a command
   applies while presenting → Exit. Gated button disabled when unsupported.

Any defect found in steps 1–9 that traces to 3a's GPU code is fixed on this branch (with a
note in the commit) — that feedback loop is the point of the manual layer.

## Testing strategy for this plan

3b adds **no automated tests** (it is the manual layer). Confidence comes from: (a) the
demo typechecking + building, (b) the library suite staying green, and (c) the manual
checklist run. This matches the locked strategy's "paint-to-screen + XR = manual only".

## Handoffs / after 3b

- Feed the eyeballed `focus.zoomOut` comfortable default back into the docs (and consider a
  schema `default`).
- **Packaging** (the next plan): a real build + the package `exports` map splitting the
  molstar-free `src/index.ts` from the molstar-dependent `src/browser.ts`; at that point the
  demo *could* switch from Vite aliases to a `workspace:*` dependency to dogfood the exports.
- Still-deferred 3a follow-ups (not 3b-blocking): multi-model selection scoping, host
  error-code passthrough, XR early-subscribe to `canvas3d.xr` before `initViewerAsync`,
  richer coarse-model chain handling.

## Out of scope (restated)

Vite/Playwright automated rendering; `headless-gl`; packaging/build/exports; v1.1 commands
and `highlight.style`; any LLM/chat integration; a per-framework SSR demo matrix.
