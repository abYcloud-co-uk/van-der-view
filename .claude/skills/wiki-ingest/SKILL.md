---
name: wiki-ingest
description: Ingest new knowledge into the van-der-view LLM wiki at wiki/ — either an external source (URL, file, pasted text) OR knowledge born from the work itself (a design decision, an API gotcha, an empirical finding with no external document). Captures it into raw/, then synthesizes/updates interlinked pages/ and the index. Use when adding to the wiki, "ingest this", "add this to the wiki", "记到 wiki 里", after researching a topic, or after making/discovering something durable during development.
---

# wiki-ingest

Turn a new source into durable, synthesized knowledge in `wiki/`. Implements the
INGEST operation defined in `wiki/CLAUDE.md` (always read that file first — it is
the schema of record).

## Inputs
`$ARGUMENTS` is one of:
- a **URL**, a **file path**, or **pasted text** (an external source), or
- a **decision / observation / gotcha** described in words, with **no external
  document** — knowledge produced by the work itself (e.g. "we decided v1 commands
  are X", "Mol\* 5.11 changed `focusLoci` to an options object, found while coding").

If empty, ask what to ingest. If it's dev-born knowledge, the "source" is that
observation/decision itself — capture it as a note (see step 2b).

## Procedure

1. **Read the constitution.** Open `wiki/CLAUDE.md` for the current page and raw
   schemas. Open `wiki/index.md` to see what already exists.

2. **Acquire the source.**
   - URL → fetch it (WebFetch / WebSearch as needed). For a deep topic, it's fine
     to fan out a research subagent and capture its report.
   - File → read it.
   - Pasted text → use as-is.

2b. **Dev-born knowledge (no external document).** When the input is a decision,
   an empirically discovered gotcha, or a finding from the work itself, the
   *source is that observation*. Capture it as a short note rather than fetching
   anything:
   - Write the raw file with `type: user-note`, `origin: "dev session <date>"`
     (or a commit/PR ref if there is one). Record **what** was decided/observed,
     **when**, and **why** / how it was discovered — enough that the claim is
     traceable later.
   - This almost always lands in a `decision`-type page (e.g. `command-schema`,
     `project-overview`) or folds a Key fact into an existing entity page — and
     often **graduates** a page's `status` (draft → stable) or **resolves an Open
     question**. Do that in step 4.

3. **Capture verbatim into `raw/`.** Assign the next `NNNN` id (look at existing
   `raw/` files). Create `wiki/raw/NNNN-slug.md` with the raw frontmatter
   (`source_id`, `title`, `origin`, `fetched`, `type`, `supersedes`) and the
   captured content. **Never edit an existing raw file** — if this updates a prior
   source, set `supersedes:` to its id. Today's date for `fetched:` (ask if unknown;
   do not invent).

4. **Synthesize into `pages/` — dedup FIRST.** Search existing pages for the
   entities/concepts this source touches.
   - If a page exists → fold new facts in, update `updated:`, add the new `raw/`
     ref to `sources:`, bump `status` if it graduated (stub→draft→stable).
   - If not → create `wiki/pages/<slug>.md` with full frontmatter and the body
     structure (Summary → Key facts → Details → See also → Open questions).
   - **One entity per page.** Split if a source covers several.
   - Every non-obvious claim gets an inline source ref `(src: raw/NNNN-...)`.
   - Mark anything unverified `⚠️ unverified` and list it under Open questions.

5. **Wire links.** Add `[[slug]]` cross-links in prose and reciprocate in the
   `links:` frontmatter of related pages.

6. **Update `index.md`.** Add new pages to the right cluster with a one-line hook,
   refresh the page/source counts and `Last updated`, and roll up any new open
   questions. Update `raw/README.md`'s source table.

7. **Report.** Tell the user: which raw file was added, which pages were created
   vs updated, and any new open questions surfaced.

## Rules
- Evidence before claims: if it's not in `raw/`, it's not a fact yet.
- Prefer updating an existing page over creating a near-duplicate.
- Keep it terse and source-anchored — this is a reference, not an essay.
