---
title: Testing Strategy
slug: testing-strategy
type: decision
status: stable
sources: [raw/0003-design-decisions-2026-06-18.md, raw/0004-testing-strategy-decisions-2026-06-18.md, raw/0007-node-structure-spike-2026-06-18.md, raw/0008-plan2-executor-core-2026-06-18.md, raw/0009-plan3a-browser-runtime-core-2026-06-22.md, raw/0011-plan3b-demo-merged-verified-2026-06-22.md, raw/0012-trajectory-cluster-merged-2026-06-23.md, "docs/superpowers/specs/2026-06-18-testing-strategy-design.md"]
updated: 2026-06-23
links: [agent-command-flow, command-schema, molstar-api, headless-react, molstar-webxr, molstar-trajectories]
---

# Testing Strategy

> How van-der-view is tested: **automated Node unit tests** for everything that
> doesn't touch the GPU (adapters, `selection → loci`, SSR-safety), and a **manual
> Vite demo app** (no LLM, no chat) for rendering and XR. Design locked 2026-06-18
> (src: raw/0004); full spec at
> `docs/superpowers/specs/2026-06-18-testing-strategy-design.md`.

## Key facts
- Two deliverables: an **automated unit suite** (CI-able from day one) and a
  **dead-simple visual demo** for manual, human-eye verification (src: raw/0004).
- Two named focuses: **F1** adapter conversion (Claude `tool_use` → `Command`);
  **F2** manual executor trigger (load/highlight/focus actually render) (src: raw/0004).
- **The line:** split by what touches the GPU/DOM. Data-model logic is automated
  in Node; anything needing the GPU or an XR device is verified by hand (src: raw/0004).
- Runner: **Vitest** — `node` env for adapter + selection, `jsdom` for the SSR
  smoke (src: raw/0004).

## What is automated (Node, in CI)
| Target | Test | Note |
|---|---|---|
| **Adapters** (`toTools`/`toCommand`) | fixtures of Anthropic `tool_use` → assert exact `Command`; malformed → clean error | F1; see [[agent-command-flow]] |
| **Selection → loci** | load a structure into a headless data model; assert loci for chain, residue-range, **auth vs label**, and the **7 presets** | F2; ✅ **implemented** — executor + `resolveSelection` + the pure-Node preset queries, on real Node-built fixtures incl. `PDB_HET`/`PDB_NUCLEIC` (src: raw/0008, raw/0009) |
| **SSR-safety** | `renderToString(<MolViewProvider><MolViewCanvas/></MolViewProvider>)` in jsdom → no throw, placeholder out, no molstar in output | ✅ **implemented** `test/ssr.test.tsx`; see [[headless-react]] |
| **XR wrappers** | `createXrApi(stubPlugin)` → null-safe `isSupported`/`isPresenting`/`request`/`end` | ✅ **implemented** `test/xr.test.ts` (stub plugin; device path manual) — [[molstar-webxr]] |

Plan 3a brought the suite to **88 tests** green (`pnpm test` / `pnpm typecheck`); the SSR
smoke needed `vitest.config.ts` to also glob `test/**/*.test.tsx` (src: raw/0009).

⚠️ **`'use client'` is not the SSR guard.** Under Next App Router a `'use client'`
module is still imported and first-rendered server-side. The guard is: molstar
lazy-imported inside `useEffect`, no browser access at module top-level or during
render, placeholder on first paint ([[headless-react]]). The smoke test verifies it.
**No per-framework matrix** — Next/Remix/TanStack share React SSR semantics; one
Node smoke catches the #1 breakage (a server import touching `window`) (src: raw/0004).

## What is manual (visual demo, not in CI)

Plan 3a's **GPU/plugin-bound code is typecheck-gated, not unit-tested** — the real Mol\*
adapter (`molstarExecutorContext`), `createMolView`, and the `<MolViewCanvas/>` mount are
proven by `tsc` + manual run, since exercising them needs a real WebGL context (src:
raw/0009). They get eyeballed in the demo below (Plan 3b).

✅ **Realized & GPU-verified (Plan 3b, src: raw/0011).** The demo is built and merged
(`examples/demo/`, PR #14) and **manually GPU-verified** (2026-06-22): canvas paint, load
(1CRN inline + 1HSG pdb, replace-on-load), highlight/clear, focus + the zoomOut slider,
reset, scene-context, the stepper, paste-`tool_use`, and error surfacing **all confirmed
working** — so the typecheck-gated 3a render path is now visually validated. ⏸️ **WebXR is
the one piece still untested** (no headset available); Enter/Exit XR + in-headset behavior
are deferred until a device is on hand ([[molstar-webxr]]).

A standalone **Vite** app at `examples/demo/`, client-only, **no LLM/chat** (src: raw/0004, raw/0011):
- **Preset command buttons** → `viewer.dispatch(Command)` directly (F2).
- **Paste `tool_use` box** → `adapters.anthropic.toCommand` → show normalized
  `Command` → dispatch (eyeball F1 + F2 together with real Claude output).
- **Scene-context readout** → `viewer.getSceneContext()` (the shipped
  `get-scene-context` read tool) — see what the agent sees.
- **Sequence stepper** — a `Next` button / Enter key fires a preset sequence one
  command at a time; single-person, no autoplay.
- **XR** — an `Enter XR` button (user-gesture rule; gate on `xr.isSupported`) + a
  manual smoke checklist (headset or Chrome WebXR emulator): enter → stereo render
  → commands apply while `isPresenting` → exit. See [[molstar-webxr]].

**Fixtures:** **1CRN** (crambin, 46 res, chain A, no ligand) bundled for selection
tests + basic presets; **1HSG** (HIV protease + indinavir) fetched by id for the
focus-ligand preset (src: raw/0004).

### Trajectory cluster (PR #17, src: raw/0012)

Same split: the dispatch/validation/error-mapping/`resolveCoordinates` logic is **Node-unit-tested**
via the fake port, plus a **pure-Node spike** (`test/trajectory-node-spike.test.ts`) that proves
`frameCount` + the atom-count-mismatch throw with an **in-memory `Coordinates`** (no binary XTC
fixture). The real adapter (molstar `loadTrajectory`/`AnimateModelIndex`/`ModelFromTrajectory`) is
typecheck-gated + **GPU-verified** (2026-06-23) via the demo `TrajectoryPanel` — load/play/stop/seek,
and a topology/coordinate mismatch keeps the prior scene. Suite = **116 tests**. The demo serves the
gitignored `MD_Data/` over `npx serve --cors` ([[molstar-trajectories]]).

## Coverage
No numeric % gate initially — a **per-command checklist** instead (src: raw/0004):
- each v1 command: ≥1 `tool_use → Command` test + ≥1 malformed → error test;
- selection-bearing commands: ≥1 Node loci test incl. auth-vs-label;
- 1 SSR smoke; paint-to-screen + XR = manual only.

## Out of scope / deferred
Per-framework SSR matrix; Playwright / browser-mode automated rendering;
`headless-gl` integration job; in-XR direct atom picking (not in Mol\*'s documented
bindings — [[molstar-webxr]]); immersive-headset stepping; numeric coverage gate
(src: raw/0004).

## See also
- [[agent-command-flow]] — the units under test (adapter + executor)
- [[command-schema]] — the v1 commands the per-command checklist covers
- [[molstar-api]] — `Selection → loci`, the bug-prone path
- [[headless-react]] — the SSR guard the smoke test verifies
- [[molstar-webxr]] — the XR manual checklist

## Open questions
- ✅ **Node-buildable `Structure` — confirmed** (src: raw/0007): `Structure.ofModel`
  + `Script.getStructureSelection` + `toLociWithSourceUnits` run in pure Node, no
  WebGL/three. F2 selection tests are Node unit tests. ⚠️ pnpm build-gate: molstar
  pulls `@scarf/scarf` — handled in `pnpm-workspace.yaml` (see raw/0007).
- **1HSG ligand resname** (`MK1`?) and the **1CRN Node parse entry** (`mol-io`/`mol-model`).
- Whether to later add a `headless-gl` integration job for real Node-side rendering.
