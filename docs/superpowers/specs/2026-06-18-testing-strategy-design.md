# van-der-view — Testing Strategy (Design Spec)

**Date:** 2026-06-18
**Status:** Proposed (awaiting review)
**Related wiki pages:** `testing-strategy`, `agent-command-flow`, `command-schema`,
`headless-react`, `molstar-api`, `molstar-webxr`

## 1. Goals

Two concrete deliverables, settled in the 2026-06-18 brainstorm:

1. **Automated unit tests** for the library's pure logic, runnable in CI from day
   one (Node, no browser, no GPU).
2. **A dead-simple visual demo app** — no LLM, no chat — for manual, human-eye
   verification of rendering and the end-to-end command path.

Two explicit test focuses the user named:

- **F1 — adapter conversion:** a real Claude `tool_use` output is accurately
  normalized into a `Command { name, input }` the executor recognizes.
- **F2 — executor rendering:** manually triggering the executor actually loads a
  structure, highlights, focuses, etc., in the live Mol\* view.

## 2. The automated-vs-manual line (core decision)

The renderer is WebGL/browser-only; entering XR needs a real device + user
gesture. So we split by **what touches the GPU/DOM**:

| Layer | What it is | Verification | In CI? |
|---|---|---|---|
| **Adapters** (`toTools` / `toCommand`) | pure functions, per provider | **Automated unit** (Vitest, Node, fixtures) | ✅ |
| **Selection → loci** (`Selection → MolScript → StructureElement.Loci`) | pure data-model logic on a parsed `Structure` | **Automated unit** (Vitest, Node, 1CRN fixture) — ⚠️ assumes Node-buildable `Structure` (§7) | ✅ |
| **Executor "paint to screen"** (highlight/focus/camera/representation apply) | drives Mol\* managers against a live GL canvas | **Manual** (visual demo) | ❌ |
| **SSR-safety** | package imports + first-renders server-side without crashing | **Automated** — one `renderToString` smoke (Node/jsdom) | ✅ |
| **XR** (enter/exit, commands apply while presenting) | needs headset / WebXR emulator + user gesture | **Manual** smoke checklist | ❌ |

Rule of thumb: **data-model logic is automated in Node; anything that needs the
GPU or an XR device is verified by hand in the demo.**

## 3. Automated test suite

**Runner:** Vitest (TS-native, fast, shares tooling with the Vite demo). Two
environments: `node` for adapter + selection tests; `jsdom` for the SSR smoke.

### 3.1 Adapter tests (F1)

- Inputs: fixtures of Anthropic `tool_use` blocks
  (`{ type:'tool_use', id, name, input }`) — hand-authored and/or captured from
  real Claude responses, stored as JSON under `test/fixtures/tool-use/`.
- Assert `adapters.anthropic.toCommand(block)` → exact `Command { name, input }`.
- Assert malformed / unknown-tool input → a clean `CommandResult` error (not a
  throw-through), exercising the error path.
- Assert `toTools(specs)` → well-formed Anthropic tool defs.
- Governed by the per-command checklist (§5).

### 3.2 Selection → loci tests (F2, the bug-prone part)

- Load the bundled **1CRN** fixture into a headless Mol\* **data model** (no canvas).
- Assert the produced loci for: chain select (`auth_asym_id == 'A'`), a
  residue-range select, and **the `auth_seq_id` vs `label_seq_id` distinction**
  (the residue-mis-selection trap documented in `molstar-api`).
- ⚠️ **Load-bearing assumption:** building a `Structure` + running
  `Script.getStructureSelection` + `StructureSelection.toLociWithSourceUnits`
  does **not** require a WebGL context (it lives in `mol-model` / `mol-io`, not
  `mol-canvas3d`). Must be confirmed first in planning (§7). Fallback if false:
  these tests relocate behind the manual demo or a `headless-gl` integration job.

### 3.3 SSR-safety smoke

- `renderToString(<MolViewCanvas />)` in jsdom/Node.
- Assert: no throw; output is the placeholder (`<div><canvas/></div>`); **no
  molstar in the server output** (proves the dynamic-import-in-effect guard from
  `headless-react` holds).
- This is the **only** SSR test. **No per-framework matrix** — Next/Remix/TanStack
  share React SSR semantics and Vite has no SSR by default; one Node smoke catches
  the #1 real-world breakage (a server import touching `window`).
- Note: `'use client'` alone is **not** the guard — under Next App Router a
  `'use client'` module is still imported and first-rendered on the server. The
  guard is: no browser access at module top-level or during render, molstar
  lazy-imported inside `useEffect`, placeholder on first paint.

## 4. The demo app (manual harness)

A standalone **Vite** app under `examples/demo/`, client-only, **no LLM, no chat**.
Layout: `<MolViewCanvas>` + a sidebar with three blocks:

1. **Preset command buttons** (F2) — `Load 1CRN`, `Highlight chain A`,
   `Focus residues 10–20`, `Reset camera`, `Focus ligand` (loads 1HSG). Each →
   `viewer.dispatch(Command)` directly. The manual executor trigger.
2. **Paste `tool_use` box** (F1 + F2 together) — a textarea; paste a real Claude
   `tool_use` JSON → run `adapters.anthropic.toCommand` → **show the normalized
   `Command`** → `dispatch` → watch the canvas. Eyeballs *conversion + rendering*
   in one shot with real Claude output, no LLM in the loop.
3. **Scene-context readout** — live display of `viewer.getSceneContext()` (the same
   `get-scene-context` read tool we ship) so you can see "what the agent would see."

**Sequence stepper:** a `Next` button (and the Enter key) advances a preset command
sequence one command at a time — single-person, **no autoplay**. Used both for
ordinary desktop stepping and for the XR check.

**XR slot:**

- An `Enter XR` button (satisfies the WebXR user-gesture rule; gated on
  `xr.isSupported`).
- A manual **XR smoke checklist**, run on a headset or the Chrome DevTools WebXR
  emulator: enter succeeds → scene renders in stereo → commands dispatched via the
  stepper apply while `isPresenting` → exit succeeds.
- **Deferred:** stepping commands from *inside* an immersive headset (you can't
  reach the desktop key). Revisit later by binding a spare controller button. AR
  magic-window / desktop preview keep the DOM, so the stepper works there.

**Fixtures used by the demo:**

- **1CRN** (crambin, 46 residues, chain A, no ligand/water, ~4 KB) — bundled, for
  load/highlight/focus-residue presets and all selection tests.
- **1HSG** (HIV-1 protease + indinavir) — fetched by PDB id from RCSB for the
  focus-ligand preset (network is fine in a demo). Ligand resname (`MK1`)
  ⚠️ verify in planning. Demo-only; not needed by the Node tests.

## 5. Coverage targets

No numeric % gate initially (premature + flaky-prone). Instead a **per-command
checklist**, enforced by review:

- Every v1 command (`load-structure`, `highlight`, `focus`, `get-scene-context`,
  `reset-camera`): **≥1** `tool_use → Command` adapter test **and ≥1**
  malformed-input → error test.
- Selection-bearing commands (`highlight`, `focus`): **≥1** Node loci-resolution
  test, **including the auth-vs-label case**.
- **1** SSR `renderToString` smoke.
- "Paint to screen" glue + XR: **manual only** (demo + checklist), 0 automated.
- Add a soft coverage report later, once the surface stabilizes (not a hard gate).

## 6. CI

- CI runs the **Vitest automated suite only**: adapters + selection→loci + SSR
  smoke. Node-only, no browser, no GPU → fast, deterministic, cheap.
- The demo and the XR checklist are **human-run**, not in CI.
- Future (deferred): a Mol\* `HeadlessPluginContext` + `headless-gl` integration
  job for real Node-side rendering — evaluated only if the manual demo proves
  insufficient.

## 7. To verify in planning (load-bearing)

1. **Node-buildable `Structure`** — confirm `Structure` construction +
   `Script.getStructureSelection` + `StructureSelection.toLociWithSourceUnits`
   run in Node with no WebGL (the premise under §3.2). If false, selection tests
   relocate (headless-gl job or manual demo).
2. **1HSG ligand resname** (`MK1`?) for the focus-ligand preset selector.
3. **1CRN parse path in Node** (which `mol-io` / `mol-model` entry parses the
   bundled PDB without a plugin/canvas).
4. Demo location convention (`examples/demo/` assumed).

## 8. Explicitly out of scope / deferred

- Per-framework SSR matrix (replaced by the single Node smoke).
- Automated rendering tests via Playwright / Vitest browser mode (manual demo
  instead for v1).
- `headless-gl` integration job (deferred; re-evaluate later).
- In-XR direct manipulation / atom picking — depends on Mol\* native XR picking,
  which is **not** in its documented controller bindings (`molstar-webxr`);
  ⚠️ feasibility unverified. Its own brainstorm later.
- Immersive-headset command stepping (deferred; needs a controller-button binding).
- Numeric coverage gate.

## 9. Repo layout (sketch)

```
src/                        # library
  adapters/anthropic.ts     # toTools / toCommand
  executor/...              # dispatch + Selection→loci
  react/MolViewCanvas.tsx   # 'use client', dynamic-imports molstar in useEffect
test/
  adapters/*.test.ts        # F1
  selection/*.test.ts       # F2 (Node, 1CRN)
  ssr/renderToString.test.ts
  fixtures/
    1crn.pdb
    tool-use/*.json
examples/demo/              # Vite app (manual harness: buttons, paste box, stepper, XR)
```
