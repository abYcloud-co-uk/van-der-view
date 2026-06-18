---
title: Testing Strategy
slug: testing-strategy
type: decision
status: stable
sources: [raw/0003-design-decisions-2026-06-18.md, raw/0004-testing-strategy-decisions-2026-06-18.md, "docs/superpowers/specs/2026-06-18-testing-strategy-design.md"]
updated: 2026-06-18
links: [agent-command-flow, command-schema, molstar-api, headless-react, molstar-webxr]
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
| **Selection → loci** | load bundled **1CRN** into a headless data model; assert loci for chain, residue-range, and **auth vs label** | F2; ⚠️ assumes Node-buildable `Structure` (Open questions) |
| **SSR-safety** | `renderToString(<MolViewCanvas/>)` in jsdom → no throw, placeholder out, no molstar in output | one test only; see [[headless-react]] |

⚠️ **`'use client'` is not the SSR guard.** Under Next App Router a `'use client'`
module is still imported and first-rendered server-side. The guard is: molstar
lazy-imported inside `useEffect`, no browser access at module top-level or during
render, placeholder on first paint ([[headless-react]]). The smoke test verifies it.
**No per-framework matrix** — Next/Remix/TanStack share React SSR semantics; one
Node smoke catches the #1 breakage (a server import touching `window`) (src: raw/0004).

## What is manual (visual demo, not in CI)
A standalone **Vite** app at `examples/demo/`, client-only, **no LLM/chat** (src: raw/0004):
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
- ⚠️ **Node-buildable `Structure`** — confirm `Script.getStructureSelection` +
  `toLociWithSourceUnits` run in Node with no WebGL (the premise of the selection
  tests). If false, they relocate to a `headless-gl` job or the demo.
- **1HSG ligand resname** (`MK1`?) and the **1CRN Node parse entry** (`mol-io`/`mol-model`).
- Whether to later add a `headless-gl` integration job for real Node-side rendering.
