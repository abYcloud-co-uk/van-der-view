---
source_id: 0004
title: van-der-view testing strategy decisions (brainstorming session)
origin: "dev session 2026-06-18 — testing brainstorm with user (jyc); full spec at docs/superpowers/specs/2026-06-18-testing-strategy-design.md"
fetched: 2026-06-18
type: user-note
supersedes: null
---

# Testing strategy decisions — 2026-06-18 brainstorm

Dev-born knowledge: decisions made collaboratively while designing van-der-view's
testing approach. No external document — the source is this session; the full
design spec lives at `docs/superpowers/specs/2026-06-18-testing-strategy-design.md`.
Graduates the `testing-strategy` page stub → stable.

## Goals (decided)
- Automated unit tests, CI-able from day one (Node, no browser, no GPU).
- A dead-simple visual demo app — no LLM, no chat — for manual, human-eye
  verification of rendering and the end-to-end command path.
- Two named focuses: **F1** = adapter conversion (Claude `tool_use` → `Command`);
  **F2** = manual executor trigger (load/highlight/focus actually render).

## The automated-vs-manual line (core decision)
Split by what touches the GPU/DOM:
- **Automated unit (Node, in CI):** adapters (pure `toTools`/`toCommand`);
  `selection → loci` resolution; one SSR `renderToString` smoke.
- **Manual (visual demo, not in CI):** executor "paint to screen" (highlight /
  focus / camera / representation apply); XR (enter/exit, commands-apply-while-
  presenting).
- Rule of thumb: data-model logic is automated in Node; anything needing the GPU
  or an XR device is verified by hand in the demo.

## Automated suite (decided)
- Runner: **Vitest** (`node` env for adapter + selection; `jsdom` for SSR smoke).
- Adapter tests: fixtures of Anthropic `tool_use` blocks → assert exact `Command`;
  malformed / unknown → clean `CommandResult` error.
- `selection → loci`: load bundled **1CRN** into a headless data model (no canvas);
  assert loci for chain select, residue-range, and the `auth_seq_id` vs
  `label_seq_id` distinction.
  - ⚠️ Load-bearing assumption: building a `Structure` + `Script.getStructureSelection`
    + `toLociWithSourceUnits` runs in Node without WebGL (`mol-model` / `mol-io`,
    not `mol-canvas3d`). Must be confirmed in planning; if false, these relocate
    to a `headless-gl` job or the manual demo.
- SSR smoke: `renderToString(<MolViewCanvas/>)` in jsdom → no throw, outputs
  placeholder, no molstar in server output. ONE test only — no per-framework
  matrix. (`'use client'` alone is NOT the guard: Next App Router still imports +
  first-renders the module server-side; the guard is dynamic-import molstar in
  `useEffect` + placeholder render.)

## Demo app (decided)
- Standalone Vite app at `examples/demo/`, client-only, no LLM / chat.
- `<MolViewCanvas>` + sidebar: (1) preset command buttons → `dispatch(Command)`
  directly; (2) paste-`tool_use` textarea → `adapters.anthropic.toCommand` → show
  normalized `Command` → dispatch (eyeball conversion + render together with real
  Claude output); (3) scene-context readout via `viewer.getSceneContext()`.
- Sequence stepper: a `Next` button / Enter key advances a preset command sequence
  one at a time — single-person, no autoplay.
- XR slot: `Enter XR` button (user-gesture rule; gate on `xr.isSupported`) + a
  manual XR smoke checklist (headset or Chrome WebXR emulator): enter → stereo
  render → commands apply while `isPresenting` → exit. Immersive-headset stepping
  deferred (you can't reach the desktop key; revisit via a controller-button
  binding).
- Fixtures: **1CRN** (crambin, 46 res, chain A, no ligand) bundled for selection
  tests + basic presets; **1HSG** (HIV protease + indinavir) fetched by id for the
  focus-ligand preset (ligand resname `MK1` ⚠️ verify).

## Coverage (decided)
- No numeric % gate initially. Per-command checklist instead:
  - each v1 command: ≥1 `tool_use → Command` adapter test + ≥1 malformed → error test;
  - selection-bearing commands (highlight/focus): ≥1 Node loci test incl. auth-vs-label;
  - 1 SSR smoke; paint-to-screen + XR = manual only, 0 automated.
- Soft coverage report later, once the surface stabilizes.

## Out of scope / deferred (decided)
- Per-framework SSR matrix (replaced by the single Node smoke).
- Playwright / Vitest browser-mode automated rendering (manual demo for v1).
- `headless-gl` integration job (deferred; re-evaluate if manual demo insufficient).
- In-XR direct manipulation / atom picking (not in Mol* documented bindings,
  feasibility unverified — its own brainstorm later).
- Immersive-headset command stepping; numeric coverage gate.

## To verify in planning (load-bearing)
- Node-buildable `Structure` (premise of the selection tests).
- 1HSG ligand resname; 1CRN Node parse entry point.
- Demo location convention (`examples/demo/` assumed).
