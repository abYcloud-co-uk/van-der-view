---
name: wiki-lint
description: Health-check the van-der-view LLM wiki at wiki/. Finds broken [[links]], orphan pages, missing/empty sources, stale dates, lingering stubs, duplicate pages, contradictions, and index drift; reports them and optionally fixes. Use for "lint the wiki", "check the wiki health", or periodic maintenance.
---

# wiki-lint

Keep the wiki healthy. Implements the LINT operation in `wiki/CLAUDE.md`.

## Inputs
`$ARGUMENTS` (optional): `--fix` to apply safe fixes, otherwise report-only.
A path/slug to scope the lint to one page is also allowed.

## Procedure

1. **Inventory.** List `wiki/pages/*.md`, `wiki/raw/*.md`, and read
   `wiki/index.md` and `wiki/CLAUDE.md`.

2. **Run checks** and collect findings:

   | Check | Flag when |
   |---|---|
   | Broken `[[links]]` | a `[[slug]]` has no `pages/slug.md` (a "wanted page") |
   | Orphan pages | a page has no inbound `[[links]]` and is absent from `index.md` |
   | Missing sources | `sources:` is empty/absent on a non-`stub` page, or references a `raw/` file that doesn't exist |
   | Frontmatter integrity | `slug` ≠ filename; missing `type`/`status`/`updated`; invalid enum value |
   | Staleness | `updated:` far in the past, or `status: stub`/`draft` lingering |
   | Link reciprocity | `A.links` lists `B` but `B.links` omits `A` (where it ought to be mutual) |
   | Duplicates | two pages covering the same entity (candidates to merge) |
   | Contradictions | two pages asserting conflicting facts |
   | Index drift | a page missing from `index.md`, or listed there but deleted; stale counts/date |
   | Raw integrity | `raw/README.md` table out of sync; a `supersedes` pointing at a missing id |

3. **Report.** Group findings by severity (broken/missing = high; staleness/
   reciprocity = medium; style = low). For each, give the file and a one-line fix.

4. **Fix (only with `--fix`, and only safe edits).** E.g. add reciprocal links,
   correct a slug, refresh `index.md` counts/date, add a missing page to the map.
   Do **not** auto-resolve contradictions or merge pages without asking — surface
   those for a human decision.

## Rules
- Report-only by default. Mutating fixes require `--fix`.
- Never delete sourced content to "clean up". Flag, don't destroy.
- Contradictions and merges are human calls — present, don't decide.
