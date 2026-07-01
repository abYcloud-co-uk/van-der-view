# raw/ — Immutable source snapshots

This folder holds the **evidence** behind every claim in `../pages/`.

- Files are named `NNNN-slug.md`, numbered in ingest order.
- Each file is **immutable** once written. Do not edit a raw file to "update" it.
  Instead, ingest a new source as a new numbered file and set `supersedes:` in
  its frontmatter to the old `source_id`.
- Frontmatter schema is defined in `../CLAUDE.md` (raw/ schema section).

Think of this as an append-only log of what we learned and when. `pages/` is the
distilled, mutable knowledge; `raw/` is the permanent record it rests on.

## Index of sources

| id | file | origin | fetched |
|----|------|--------|---------|
| 0001 | [0001-molstar-research.md](0001-molstar-research.md) | internal research agent (Mol\* integration) | 2026-06-18 |
| 0002 | [0002-molviewspec-research.md](0002-molviewspec-research.md) | internal research agent (MolViewSpec) | 2026-06-18 |
| 0003 | [0003-design-decisions-2026-06-18.md](0003-design-decisions-2026-06-18.md) | dev session 2026-06-18 (design decisions, no external doc) | 2026-06-18 |
| 0004 | [0004-testing-strategy-decisions-2026-06-18.md](0004-testing-strategy-decisions-2026-06-18.md) | dev session 2026-06-18 (testing strategy, no external doc) | 2026-06-18 |
| 0005 | [0005-integration-recon-saas-2026-06-18.md](0005-integration-recon-saas-2026-06-18.md) | dev session 2026-06-18 (saas integration recon + deltas) | 2026-06-18 |
| 0006 | [0006-xr-voice-boundary-2026-06-18.md](0006-xr-voice-boundary-2026-06-18.md) | dev session 2026-06-18 (XR in-VR voice boundary decision) | 2026-06-18 |
| 0007 | [0007-node-structure-spike-2026-06-18.md](0007-node-structure-spike-2026-06-18.md) | dev session 2026-06-18 (Node-Structure spike + pnpm build-gate) | 2026-06-18 |
| 0008 | [0008-plan2-executor-core-2026-06-18.md](0008-plan2-executor-core-2026-06-18.md) | dev session 2026-06-18 (Plan 2 executor core implemented + merged, PR #8) | 2026-06-18 |
| 0009 | [0009-plan3a-browser-runtime-core-2026-06-22.md](0009-plan3a-browser-runtime-core-2026-06-22.md) | dev session 2026-06-22 (Plan 3a browser runtime core implemented + merged, PR #12) | 2026-06-22 |
| 0010 | [0010-molstar-trajectory-loading-2026-06-22.md](0010-molstar-trajectory-loading-2026-06-22.md) | dev session 2026-06-22 (molstar 5.10.1 source inspection — trajectory/topology+coordinates loading) | 2026-06-22 |
| 0011 | [0011-plan3b-demo-merged-verified-2026-06-22.md](0011-plan3b-demo-merged-verified-2026-06-22.md) | dev session 2026-06-22 (Plan 3b Vite demo merged PR #14 + manual GPU verification, except WebXR) | 2026-06-22 |
| 0012 | [0012-trajectory-cluster-merged-2026-06-23.md](0012-trajectory-cluster-merged-2026-06-23.md) | dev session 2026-06-23 (trajectory + playback cluster merged PR #17 + GPU-verified; external-review fix wave) | 2026-06-23 |
| 0013 | [0013-packaging-merged-2026-06-23.md](0013-packaging-merged-2026-06-23.md) | dev session 2026-06-23 (packaging merged PR #19 — tsup ESM dual-entry build, scoped GHP package, verify:package gate; external-review fix wave) | 2026-06-23 |
| 0014 | [0014-representation-cluster-merged-2026-06-23.md](0014-representation-cluster-merged-2026-06-23.md) | dev session 2026-06-23 (v1.1a representation cluster merged PR #21 — per-selection-component appearance model; 3 review rounds) | 2026-06-23 |
| 0015 | [0015-highlight-persistence-2026-07-01.md](0015-highlight-persistence-2026-07-01.md) | dev session 2026-07-01 (persistent highlight via overpaint + clear-highlight, #38; overpaint-on-representation-node gotcha + handle-clear serialization fix) | 2026-07-01 |
| 0016 | [0016-highlight-select-marking-2026-07-01.md](0016-highlight-select-marking-2026-07-01.md) | dev session 2026-07-01 (branch fix/highlight-persistence, pivot from overpaint to select-marking after review + user feedback; supersedes 0015) | 2026-07-01 |
