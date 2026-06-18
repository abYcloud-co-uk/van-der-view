---
title: Testing Strategy
slug: testing-strategy
type: decision
status: stub
sources: [raw/0003-design-decisions-2026-06-18.md]
updated: 2026-06-18
links: [agent-command-flow, molstar-api]
---

# Testing Strategy

> ⚠️ **Stub — not yet designed.** Deliberately deferred to its own focused
> brainstorm (decided 2026-06-18, src: raw/0003). This page tracks the open thread
> and what we already know about the shape.

## What we already know

- **Cleanly unit-testable** (mocks/fixtures, no browser):
  - the **executor** — provider-agnostic, takes `Command { name, input }`, drives a
    mockable `plugin`/managers ([[agent-command-flow]]).
  - the **adapters** — pure `toTools` / `toCommand`; test with tool_use / tool_call
    fixtures.
- **Harder** (needs a real or fixture structure / real rendering):
  - `Selection → MolScript → loci` resolution ([[molstar-api]]).
  - full-loop integration (Mol\* is **WebGL/browser-only**).
- **Potential asset:** Mol\*'s `HeadlessPluginContext` renders in Node via
  `headless-gl` (src: raw/0001 / [[molstar-api]]) — may allow CI integration tests
  without a browser. Needs evaluation.

## Open questions (the agenda for the testing brainstorm)
- Browser-based real rendering (Playwright / Vitest browser mode) **vs** mocking
  `PluginContext` — the core fork.
- Does `HeadlessPluginContext` + `headless-gl` work in our CI, and is it worth it?
- Test runner / framework choice (Vitest assumed, TBD).
- Per-framework SSR smoke tests (Next/Vite/Remix/TanStack).
- Fixture structures (a tiny PDB) for selection/loci and integration tests.
- Coverage targets per layer (executor/adapters high; integration thinner).

## See also
- [[agent-command-flow]] — the units under test
- [[molstar-api]] — `HeadlessPluginContext`, managers, selection
