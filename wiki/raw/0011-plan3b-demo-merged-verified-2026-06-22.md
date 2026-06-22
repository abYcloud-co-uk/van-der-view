---
source_id: 0011
title: Plan 3b — Vite demo + manual XR merged & GPU-verified (except WebXR)
origin: "dev session 2026-06-22 (PR #14 merged); manual GPU verification by the user 2026-06-22"
fetched: 2026-06-22
type: user-note
supersedes: null
---

# Plan 3b — Vite demo merged (PR #14) and GPU-verified except WebXR (2026-06-22)

Dev-born knowledge. Plan 3 was decomposed into 3a (runtime core, raw/0009) and **3b (the
manual verification layer)**. 3b is implemented (subagent-driven, 8 tasks) and merged to
`main` (PR #14), then GPU-verified by the user.

## What landed (`examples/demo/`)
- A client-only **Vite + React demo** (no LLM, no chat) that drives the real Plan-3a Mol\*
  adapter on a GPU. Six panels, each wired through `useMolView()`: **Load** (1CRN inline via
  `?raw` + 1HSG via the pdb/RCSB source), **Commands** (highlight / focus with a **zoomOut
  slider** / reset / clear), **SceneContext** (dispatches `get-scene-context`), **Stepper**
  (Next/Enter over a preset `Command[]`), **PasteToolUse** (`adapters.anthropic.toCommand` →
  dispatch), **Xr** (gesture-gated Enter/Exit gated on `isSupported`). Plus `CHECKLIST.md`.
- **Wiring:** `examples/demo` is a pnpm workspace member but consumes the library via Vite
  `resolve.alias` to TS source (`van-der-view` → `src/index.ts`, `van-der-view/browser` →
  `src/browser.ts`) — **not** a `workspace:*` dep, so no packaging was pulled forward.

## Two library fixes (from an external review; spec-sanctioned on the 3b branch)
- **`src/mol/xr.ts`: `MolViewXR.subscribeSupported(cb)`** — Mol\*'s `xr.isSupported` is a
  `BehaviorSubject` that flips true only after the async WebXR probe resolves, so a one-shot
  read at render left the demo's XR button stuck on "not available." Unit-tested (suite 88 → 90).
- **`src/browser.ts`: `export type { SceneContext, FocusOptions }`** (type-only, no runtime
  molstar) so consumers can type `getSceneContext()` output instead of `unknown`.

(Also fixed: StepperPanel's global Enter handler now ignores typing fields + IME composition.)

## Verification status (user GPU run, 2026-06-22)
- ✅ **All non-XR functionality confirmed working on a real GPU:** canvas paints; load 1CRN
  (inline) and 1HSG (pdb, replaces the scene); highlight chain/ligand + clear; focus + the
  zoomOut slider; reset-camera; scene-context readout; the stepper; paste-`tool_use`; and
  error surfacing. So the **typecheck-gated Plan-3a render path** (`molstarExecutorContext`,
  `createMolView`, the `<MolViewCanvas/>` mount) is now **visually validated**, not just
  type-checked.
- ⏸️ **WebXR is the one unverified piece** — the user has no XR headset, so Enter/Exit XR and
  in-headset behavior are **untested and deferred** until a device is available. (The
  hardware-free Immersive Web Emulator path in `CHECKLIST.md` was not exercised either.)
- No specific `focus.zoomOut` default was mandated; the numeric-factor behavior is accepted
  as-is.

## Roadmap after 3b
v1 runtime is complete and verified (sans XR). Next candidates: **packaging** (build +
`exports` split of `src/index.ts` vs `src/browser.ts`); a **trajectory + playback command
cluster** for the `MD_Data` MD trajectories ([[molstar-trajectories]]); the **v1.1
representation cluster** (`highlight.style` + `color`/`set-representation`/`load-scene`/`toggle-xr`).
