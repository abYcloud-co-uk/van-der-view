---
name: wiki-query
description: Answer a question from the van-der-view LLM wiki at wiki/, grounded in the synthesized pages/ (not the open internet). Cites pages and their raw sources, and offers to file durable new answers back into the wiki. Use when asked a question about the project, Mol*, MolViewSpec, WebXR, the command schema, or "what does the wiki say about X".
---

# wiki-query

Answer from the wiki. Implements the QUERY operation in `wiki/CLAUDE.md`.

## Inputs
`$ARGUMENTS` is the question. If empty, ask what the user wants to know.

## Procedure

1. **Map first.** Read `wiki/index.md` to locate candidate pages by cluster/hook.

2. **Read the relevant `pages/`.** Pull the pages that bear on the question (follow
   `[[links]]` as needed). Read their cited `raw/` files only if you need to
   confirm or quote a detail.

3. **Answer FROM the wiki.** Compose the answer from page content. **Cite** each
   claim as `page-slug` (and the `raw/NNNN` source where it matters). Carry
   through any `⚠️ unverified` flags — do not present a flagged guess as fact.

4. **On a miss, say so.** If the wiki does not cover it (or only as a stub), state
   that plainly. Do **not** silently fall back to general internet knowledge. Offer:
   *"Want me to `/wiki-ingest` a source on this?"*

5. **Compound (the key trick).** If answering required synthesizing something new,
   durable, and project-relevant, offer to file it back:
   - a new `pages/<slug>.md`, or
   - a section/Key-fact added to an existing page,
   and then update `index.md` and cross-links. Only do this on confirmation (or do
   it automatically if the user said "and save it").

## Rules
- Grounded > fluent. A cited answer beats a confident one.
- Distinguish what the wiki *states* from what you're *inferring*.
- Never invent citations. If a fact has no `raw/` backing, label it as unverified.
