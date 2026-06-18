# wiki/ — LLM Knowledge Base (Constitution)

This directory is an **LLM-maintained wiki** in the style of Andrej Karpathy's
"LLM Wiki" pattern. It is a *compounding* knowledge base about the
**van-der-view** project: a headless React bridge that lets an AI agent control
the Mol\* 3D molecular renderer via a lightweight, standardized JSON command
schema.

The agent (you) writes and maintains this wiki. The human sources material,
explores, and asks questions. Knowledge accumulates here so it does not have to
be rediscovered every session.

> **Golden rule for answering questions:** answer from the synthesized `pages/`,
> not from the open internet or from memory. If `pages/` does not cover it, say
> so and offer to ingest a source. Every non-obvious claim must trace to a file
> in `raw/`.

---

## Layout

```
wiki/
├─ CLAUDE.md      ← this file: schema + the three operations
├─ index.md       ← the map: clusters, every page with a one-line hook, open questions
├─ raw/           ← immutable source snapshots (the evidence)
│  ├─ README.md
│  └─ NNNN-slug.md
└─ pages/         ← synthesized, interlinked entity pages (the knowledge)
   └─ slug.md
```

Two layers, kept strictly separate:

- **`raw/`** is the **evidence**: verbatim or lightly-cleaned source material
  (web pages, research reports, pasted notes, file excerpts). **Immutable** —
  once written, a raw file is never edited. New information about the same
  source gets a *new* raw file that supersedes the old one (note it in the
  frontmatter). Raw files are append-only history.

- **`pages/`** is the **knowledge**: deduplicated, synthesized entity pages that
  the agent freely rewrites. Every claim on a page cites the `raw/` file it came
  from. Pages are the *only* thing read to answer a query.

The compounding trick: a good answer produced during a query can be **filed back
into `pages/`** as a new page or section, so exploration becomes permanent.

---

## Page schema (`pages/*.md`)

Every page begins with YAML frontmatter:

```yaml
---
title: Human Readable Title
slug: kebab-case-slug          # must equal the filename without .md
type: entity                   # entity | concept | how-to | decision
status: stable                 # stub | draft | stable
sources: [raw/0002-molviewspec-research.md, "https://molstar.org/mol-view-spec-docs/"]
updated: 2026-06-18            # YYYY-MM-DD, the date this page was last synthesized
links: [molstar-api, command-schema]   # slugs of related pages
---
```

| Field | Meaning |
|---|---|
| `type` | `entity` = a concrete thing (a library, an API, a format). `concept` = an idea or term. `how-to` = a procedure. `decision` = a project choice / design proposal. |
| `status` | `stub` = placeholder, little content. `draft` = in progress / unverified. `stable` = synthesized and source-backed. |
| `sources` | `raw/` filenames and/or URLs backing this page. At least one for any non-`stub`. |
| `updated` | Date of last synthesis. Stale dates are a lint signal. |
| `links` | Slugs of related pages. Should be reciprocated where it makes sense. |

### Body structure

```markdown
# Title

> One-sentence summary (what this is, in plain language).

## Key facts
- Bullets a reader needs first. Each non-obvious fact ends with a source ref.

## Details
Prose / tables / code. Group by sub-topic. Keep claims source-anchored.

## See also
- [[other-slug]] — why it's related

## Open questions
- Things unverified or unknown. Empty list is fine; the heading stays.
```

### Conventions

- **Cross-links** use `[[slug]]` (double brackets), e.g. `[[molstar-webxr]]`.
  A `[[slug]]` with no matching page is a *wanted page* — a TODO marker, not an
  error. `/wiki-lint` reports them.
- **Source refs** inline use the form `(src: raw/0001-molstar-research.md)` or a
  markdown link to a URL. Prefer pointing at a `raw/` file over a bare URL so the
  evidence is local and immutable.
- **One entity per page.** If a page tries to cover two things, split it.
- **Confidence:** mark anything not directly verified as `⚠️ unverified` inline,
  and add it to **Open questions**. Never launder a guess into a fact.

---

## raw/ schema (`raw/NNNN-slug.md`)

Sources are numbered in ingest order: `0001-`, `0002-`, … Frontmatter:

```yaml
---
source_id: 0002
title: MolViewSpec research report
origin: "internal research agent"      # URL, file path, "pasted by user", etc.
fetched: 2026-06-18
type: research-report                  # web-page | research-report | file-excerpt | user-note | paper
supersedes: null                       # source_id this replaces, or null
---
```

Body = the captured content. Immutable after writing.

---

## The three operations

These are implemented as Claude Code skills in `.claude/skills/`. The skills are
the *how*; this section is the *contract* they honor.

### 1. INGEST — `/wiki-ingest <url | file | pasted text>`
Turn a new source into knowledge.
1. Capture the source verbatim into a new `raw/NNNN-slug.md` (assign the next id).
2. Extract the claims that matter for this project.
3. Create or update the affected `pages/` — **dedup first**: search existing
   pages and fold new facts in rather than spawning a near-duplicate page.
4. Add inline source refs pointing at the new raw file.
5. Update `index.md` (new pages, changed hooks) and reciprocate `[[links]]`.

### 2. QUERY — `/wiki-query "<question>"`
Answer from the wiki.
1. Read `index.md` to locate relevant pages.
2. Read those `pages/` and answer **from them**, citing page + raw source.
3. If the wiki does not cover it, say so plainly and offer to `/wiki-ingest`.
4. If the answer synthesized something new and durable, offer to file it back as
   a new page or section (the compounding trick).

### 3. LINT — `/wiki-lint`
Keep the wiki healthy. Report (and optionally fix):
- broken `[[links]]` (wanted pages) and orphan pages (no inbound links, not in index);
- pages whose `sources` are empty or point at a missing `raw/` file;
- stale `updated` dates and lingering `stub`/`draft` status;
- duplicate/overlapping pages that should merge;
- contradictions between pages;
- `index.md` drift (pages missing from the map, or listed but deleted).

---

## Style

- Be terse and factual. This is a reference, not an essay.
- Prefer tables and bullets over paragraphs.
- Never delete sourced facts to "tidy up" — supersede them with better-sourced ones.
- When unsure, say so. A flagged unknown is worth more than a confident error.
