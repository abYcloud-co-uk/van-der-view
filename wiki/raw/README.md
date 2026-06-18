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
