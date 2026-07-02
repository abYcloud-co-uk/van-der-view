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
  (`commands`), and the Anthropic + OpenAI-compatible adapters (`tools.anthropic` /
  `tools.openai`, `adapters`; the OpenAI adapter also serves DeepSeek — see PR #35 below).
  Exposed via the molstar-free public barrel `src/index.ts`.
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
- **Hover surface** (merged — PR #30, closes #29, 2026-06-25; consumer-driven; demo GPU-verified). Exposes the
  hovered-structure info on the bare canvas so a host renders its own tooltip without touching Mol\* internals:
  **`MolView.subscribeHover(cb)`** (root) + **`<MolViewCanvas onHover>`** (sugar) + exported **`HoverInfo`**
  (`{ label, chain?, residueName?, residueNumber?, atomName?, screen?, loci }`; `label` = plain text via
  `lociLabel({htmlStyling:false})`; structured fields = the representative first element; `atomName` only on a
  single-atom hover; `screen` = pageX/pageY). New pure Node-tested `src/hover.ts` (`toHoverInfo` +
  `subscribeHoverEvents` — contains a throwing host callback so it can't break Mol\*'s shared hover Subject, and
  drops the BehaviorSubject's leading "nothing hovered" seed). The canvas subscribes **only when `onHover` is
  present** (a dedicated effect) — zero per-pointer-move work otherwise. GPU-bound wiring is typecheck-gated +
  demo-verified. Built brainstorm→spec→plan→subagent-driven (5 tasks, per-task + opus final review) then an
  8-finding external review (7 fixed incl. the subscribe-only-when-`onHover` perf fix + seed suppression; 2
  pushed back — keep `screen` as page coords since `toHoverInfo` is pure/Node/SSR, and the adapter loci idioms
  differ enough to leave). **Hover only** — click (`onClick`/`subscribeClick`) is a deferred follow-up (the
  extraction layer is built to be reused). Suite now **161 tests**. Spec/plan:
  `docs/superpowers/{specs,plans}/2026-06-24-hover-surface*`.
- **Load supersede + dedup** (merged — PR #32, closes #27, 2026-06-26; demo GPU-verified). Two automatic,
  default-on optimizations for rapid in-place structure switches, **zero new public API**: **latest-wins
  supersession** — a newly dispatched scene-replacing load (`load-structure`/`load-trajectory`) aborts every
  earlier still-pending **load** (loads-only — non-load mutations always run FIFO), returning a distinct
  **`superseded`** `ErrorCode` and skipping its remaining download/parse/preset via an `AbortSignal` threaded
  into the port and honored at the adapter's `await` checkpoints; and **dedup-on-same** — a `load-structure`
  whose resolved url-source equals the displayed structure is a no-op `ok()` (url-keyed `keyOf`; inline never
  dedups; `lastLoadedKey` is cleared at every load commit so the two mechanisms compose). Executor logic is
  Node-tested; the adapter checkpoints are typecheck-gated + demo-verified. Built
  brainstorm→spec→plan→subagent-driven (4 tasks, per-task + opus final review) then an xhigh external review
  (8 findings: **3 fixed** — loads-only supersession resolving a silent mutation-drop when a superseding load
  deduped, a post-await abort recheck, and moving the trajectory checkpoint before `clear()` to avoid a blank;
  **4 pushed back** with reasoning as documented design; a subagent's NUL-byte-in-source slip was caught + fixed
  mid-flight). Reload-same is now a no-op that does **not** reset prior styling/camera — intended for the
  in-place `content`-prop viewer. Suite now **172 tests**. Spec/plan (incl. §10 review revisions):
  `docs/superpowers/{specs,plans}/2026-06-26-load-supersede-dedup*`.
- **v0.3.0 release** (merged + published to GitHub Packages 2026-06-26) — bundled the hover surface (#29) and the
  load supersede/dedup cluster (#27) on top of v0.2.0; one new error code (`superseded`), no breaking changes.
- **Conversational DeepSeek agent + OpenAI adapter** (PR #35, merged 2026-06-28; **released in v0.4.0**
  2026-06-30; demo GPU-verified). Core: the reserved `notImplemented('openai')` stub is now a real
  **OpenAI-compatible adapter** `src/adapters/openai.ts` (DeepSeek's API is OpenAI-compatible, so the one adapter
  serves both; the divergence is that inbound `function.arguments` is a JSON *string* the adapter `JSON.parse`s),
  wired as `adapters.openai` + public `tools.openai`, with `OpenAITool`/`OpenAIToolCall` types and the dist-smoke
  gate extended. No new runtime dependency. Demo: a conversational DeepSeek `AgentPanel` + agent loop routing
  tool_calls through `adapters.openai.toCommand`→`view.dispatch` (key handled server-side in the Vite dev proxy
  `POST /api/chat`, never in the browser bundle), plus a "Kinetic Precision" UI redesign. Suite now **186 tests**.
  An xhigh review found no library defects; its demo/doc follow-ups (chat-failure turn-loss, unbounded history,
  proxy UTF-8 + base-URL) are tracked in `fix/pr-35-followups`.
- **Persistent-highlight fix** (issue #38, PR #40 merged 2026-07-01; **released in v0.5.0**;
  **demo GPU-verified 2026-07-01**). The `highlight` command now uses Mol\*'s
  **select-marking channel** (`plugin.managers.interactivity.lociSelects.selectOnly({ loci }, false)`) — the
  native ~30% tint + marking-pass edge outline, persistent across hover and representation rebuilds (selection
  lives in `structure.selection`); `clear-highlight` command + async `MolView.clearHighlight()` call
  `lociSelects.deselectAll()`. Port signatures promoted to `highlight(loci): Promise<void>` and
  `clearHighlight(): Promise<void>` (were `void`). Replace semantics: `selectOnly` atomically replaces the
  prior selection. **Fully persistent (GPU-verified):** hover, click (empty or atoms), and restyle all leave
  it intact — Mol\*'s click bindings are gated behind `selectionMode` (off by default), so click-empty does
  *not* clear it (caveat: a host enabling `plugin.selectionMode` re-enables them).
  An initial overpaint approach was pivoted to select-marking after review + user feedback (reads as a solid
  recolor, no outline; also fragile across `set-color`/`set-representation`) — the pivot dissolved review
  findings #2 and #4. `highlight`'s input schema is **unchanged** (`{ selection }`) — no host codegen impact.
  No new error code. Suite now **189 tests**. See `wiki/pages/molstar-appearance.md` and `wiki/pages/glossary.md`.
- **Hover `screen` → viewport coordinates** (issue #39, PR #41 merged 2026-07-02; **released in v0.5.0**;
  **demo GPU-verified 2026-07-02**). `HoverInfo.screen` was documented as document coords (`pageX/pageY`) but
  actually delivered Mol\*'s **canvas-relative** coord (`event.page` = `clientX/Y − canvasRect.left/top`), so a
  host's `position: fixed` tooltip misplaced whenever the canvas was inset (e.g. a right-side panel; the
  full-viewport demo masked it). It now delivers true **viewport/client coords** (`rect.left/top + canvasRel`,
  no scroll term) — correct wherever the canvas sits. Split to keep the pure layer Node-testable: `toHoverInfo`
  still emits the raw canvas-relative coord; new pure `viewportFromCanvasRelative(rect,p)`; `subscribeHoverEvents`
  gained an optional `transformScreen` param (contained in a try/catch so a throwing transform can't break Mol\*'s
  shared hover Subject — external-review fix); the only DOM read (`getBoundingClientRect` via
  `plugin.canvas3dContext?.canvas`) lives in `create-mol-view.ts`. `HoverInfo` shape / `onHover` /
  `subscribeHover` signatures **unchanged** — no host codegen impact; no new error code. ⚠️ **Release note:**
  `screen` is now viewport coords, not the mis-documented page coords — downstream reading the raw value should
  drop offset math. Demo adds a reversible "Inset canvas" verification toggle. Suite now **194 tests**. See
  `wiki/raw/0018-hover-screen-viewport-coords-2026-07-01.md`.

So the v1 runtime + the trajectory cluster + packaging + the v1.1a representation cluster + the hover surface +
the load supersede/dedup cluster are complete and **fully GPU-validated including WebXR**, the library is
buildable/publishable, and **v0.5.0 is published** (bundling #38 persistent-highlight + #39 hover-screen-coords;
v0.4.0 shipped the OpenAI/DeepSeek adapter #35; v0.2.0 verified in production downstream). Next
(`docs/superpowers/plans/`): a **click surface** follow-up to hover (#29 shipped hover only), **v1.1b**
(`highlight.style` + `load-scene`/`toggle-xr`, plus **multi-representation components** for mixed polymer+ligand
selections — the one deferred limitation of the v1.1a appearance model), and **trajectory follow-ups** (in-XR
playback, palindrome/trim/multi-trajectory). Deferred from #27: cancelling molstar's in-flight download (the FIFO
serializer makes the survivor wait for a superseded load's download to finish) and raw-input dedup for I/O-heavy
resolvers. A **public npm** release is the packaging follow-up (deferred to a stable version; GitHub Packages
needs auth even for public packages).

Commands:
- `pnpm test` — run the Vitest suite (`pnpm test:watch` to watch)
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm build` — tsup → `dist/` (ESM, `.` + `./browser` entries, `.d.ts`)
- `pnpm verify:package` — full release gate (typecheck→test→build→publint→attw→molstar-free guard→dist smoke)

`pnpm test`/`pnpm typecheck` run on TS source — no build needed for tests. The published package is
built by `pnpm build` (tsup); `dist/` is gitignored. See `wiki/pages/packaging.md`.
