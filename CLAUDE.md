# van-der-view

Headless, configurable React library that bridges an AI agent (LLM chatbot) and
the Mol\* 3D molecular renderer via a lightweight standardized JSON command
schema. Full context: `wiki/pages/project-overview.md`.

## Knowledge base — consult it, then feed it

This repo keeps an **LLM-maintained wiki** at `wiki/`. It is the project's memory
for Mol\*, MolViewSpec, WebXR, the command schema, and architecture decisions.
Its pages are source-cited against `wiki/raw/`.

**Before researching or deciding** anything about those topics:
1. Read `wiki/index.md` (the map), then the relevant `wiki/pages/*.md`.
2. Or run `/wiki-query "<question>"`.
3. Prefer the wiki over re-searching the web — that's the point of it.

**After learning something durable** (a new fact, a resolved decision):
- File it back with `/wiki-ingest <source>` so the next session inherits it.
- Keep `wiki/pages/` and `wiki/index.md` in sync; `/wiki-lint` checks health.

The wiki's own schema and rules live in `wiki/CLAUDE.md` (auto-loaded when working
under `wiki/`). Do not duplicate them here.

## Status

Early implementation — the **agent-side, browser-side executor, and browser runtime
cores have all landed** (`src/`):

- **Agent-side** (Plan 1, merged): the command schema types, the v1 command catalog
  (`commands`), and the Anthropic adapter (`tools.anthropic`, `adapters`). Exposed via
  the molstar-free public barrel `src/index.ts`.
- **Browser-side executor** (Plan 2, merged): `selection` (Selection → Mol\* loci,
  auth/label), `resolve-structure` (data sourcing), the `ExecutorContext` port
  (`context`), and `createExecutor().dispatch()` (`executor`). Depends on `molstar`;
  intentionally **not** in the agent-side barrel.
- **Browser runtime core** (Plan 3a, merged — PR #12): the real Mol\* adapter
  `molstarExecutorContext` (`src/mol/adapter.ts`) behind the port, `createMolView` +
  XR wrappers (`src/mol/`), and the React mount `<MolViewProvider>`/`useMolView()`/
  `<MolViewCanvas/>` (`src/react/`), exposed via the molstar-dependent barrel
  `src/browser.ts`. Off-GPU code (presets, XR wrappers, SSR smoke) is Node-tested (88
  tests); GPU/plugin-bound code (adapter, `createMolView`, the canvas mount) is
  typecheck-gated and verified by hand in Plan 3b. v1 schema cut: `highlight.style`
  deferred to v1.1; `focus.zoomOut` is a numeric factor.
- **Vite demo** (Plan 3b, merged — PR #14): a client-only manual-verification app at
  `examples/demo/` (panels, no LLM/chat) that drives the real adapter on a GPU; consumes the
  lib via Vite alias to TS source (added `MolViewXR.subscribeSupported`; `src/browser.ts` also
  re-exports the `SceneContext` type). **GPU-verified** for all non-XR functionality. **WebXR is now
  GPU-verified too** (2026-06-24, on a **Meta Quest 3S**): run via `adb reverse tcp:5173` so the headset
  reaches `localhost` (a secure context — required for `navigator.xr`; a LAN-IP HTTP origin is not, and
  greys the XR button out), with Vite bound to **IPv4** (`--host 127.0.0.1`; the default IPv6-only
  `[::1]` breaks adb reverse). Enter-VR + in-headset render confirmed.
- **Trajectory + playback cluster** (merged — PR #17, GPU-verified 2026-06-23): four commands
  (`load-trajectory`/`play-trajectory`/`stop-trajectory`/`set-frame`) that load an MD topology +
  a separate binary coordinate stream and drive frame playback. Adds the molstar-free
  `resolveCoordinates` host hook (symmetric with `resolveStructure`), four `ExecutorContext`
  port members + a `SceneContext.trajectory` read-model, the `no_trajectory`/`trajectory_mismatch`
  error codes, and a demo `TrajectoryPanel`. Off-GPU logic is Node-tested (incl. a pure-Node
  frameCount/mismatch spike); the adapter (molstar `loadTrajectory`/`AnimateModelIndex`) is
  typecheck-gated + GPU-verified. Suite now **116 tests**. See `wiki/pages/molstar-trajectories.md`.
- **Packaging** (merged — PR #19): the no-build library is now a buildable, publishable **ESM package**
  `@abycloud-co-uk/van-der-view` on the org **GitHub Packages** registry. tsup dual-entry build
  (`dist/index.js` = the `.` agent-side/molstar-free export, `dist/browser.js` = `./browser`), with
  `molstar` an **optional** peer + `react`/`react-dom` **required** peers, and a `verify:package`
  release gate (typecheck→test→build→publint→attw→molstar-free guard→dist smoke) that `prepublishOnly`
  runs. Publish is a Release-triggered workflow using `GITHUB_TOKEN`. See `wiki/pages/packaging.md`.
- **v1.1a representation cluster** (merged — PR #21, GPU-verified 2026-06-23): five commands
  (`set-representation`/`set-color`/`toggle-visibility`/`measure-distance`/`add-label`), agent-side
  digested from the now-closed PR #11. The new work is the GPU-side **appearance model**: each styled
  selection owns **one** component (keyed by a full-identity loci key) holding its representation **and**
  color, with the preset's draw hidden under **per-loci transparency** — so color persists across
  representation changes, schemes apply **per-selection** (not structure-wide), and styling one
  selection never disturbs another. `set-color` is scheme *or* hex; `measure-distance` is pure-Node
  (`measure.ts`, no port member); the 4 mutator port members are `Promise<void>` and the executor
  awaits them (fail→`internal_error`). Took two rejected drafts (component-over-preset; color-on-preset)
  + a GPU pass to settle. No new error codes. Off-GPU logic Node-tested (suite now **142 tests**); the
  adapter is typecheck-gated + GPU-verified. See `wiki/pages/molstar-appearance.md`.
- **v0.2.0 — first bug-fix release** (PR #25 fixes + PR #26 version bump, 2026-06-24; published to GitHub
  Packages; **verified live downstream** — `abYcloud-co-uk/abycloud-platform` swapped its viewer to vdv 0.2.0,
  CI green, Amplify-deployed, real WebGL render confirmed). Two consumer-found bugs, fixed TDD-first:
  **#23** — `dispatch` now serializes scene-mutating commands through a shared FIFO `createSerializer`
  (`src/util.ts`, also used by the adapter), so rapid `load-structure` calls can't race and show the wrong
  structure; **pure reads (`get-scene-context`/`measure-distance`) bypass the queue** so progress-polling
  isn't blocked behind an in-flight load. **#24** — `<MolViewCanvas onError={(e: Error) => …}>` (+ exported
  `MolViewCanvasProps`) surfaces a failed init (WebGL / missing molstar peer) instead of leaving
  `useMolView()` undefined; a throwing callback is contained. Addressed a 7-finding external review (#1/#3/#4/#6
  fixed, #2/#5 pushed back with reasoning). Suite now **149 tests**.

So the v1 runtime + the trajectory cluster + packaging + the v1.1a representation cluster are complete and
**fully GPU-validated including WebXR**, the library is buildable/publishable, and **v0.2.0 is published and in
production downstream**. Next (`docs/superpowers/plans/`): **v1.1b** (`highlight.style` + `load-scene`/`toggle-xr`,
plus **multi-representation components** for mixed polymer+ligand selections — the one deferred limitation of the
v1.1a appearance model), **trajectory follow-ups** (in-XR playback, palindrome/trim/multi-trajectory), and
**load supersede/cancel** (open issue #27 — a newer `load-structure` should abort a superseded in-flight one;
FIFO already fixed the #23 race, this is the performance follow-up). A **public npm** release is the packaging
follow-up (deferred to a stable version; GitHub Packages needs auth even for public packages).

Commands:
- `pnpm test` — run the Vitest suite (`pnpm test:watch` to watch)
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm build` — tsup → `dist/` (ESM, `.` + `./browser` entries, `.d.ts`)
- `pnpm verify:package` — full release gate (typecheck→test→build→publint→attw→molstar-free guard→dist smoke)

`pnpm test`/`pnpm typecheck` run on TS source — no build needed for tests. The published package is
built by `pnpm build` (tsup); `dist/` is gitignored. See `wiki/pages/packaging.md`.
