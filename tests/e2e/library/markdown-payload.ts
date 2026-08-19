// tests/e2e/library/markdown-payload.ts
// Plan 13-06 (Option A — human decision 2026-08-18) — the shared, non-spec
// home of the PROVEN .md upload payload, extracted from
// ./markdown-upload.spec.ts so the ACPT-06 core-flow spine
// (tests/e2e/portability/core-flow-spine.spec.ts) reuses the exact bytes
// (REUSE-DO-NOT-FORK) WITHOUT importing a spec module: importing a .spec.ts
// from another spec re-registers the source spec's cells in the importer's
// module registry (measured: the spine's --list grew 3 → 15 cells), and a
// dynamic import hard-errors because Playwright registration APIs are
// load-phase only. Same helper convention as portability/_portability.ts and
// annotations/_fixtures.ts — this filename is not matched by Playwright's
// default testMatch, so it registers nothing.
//
// Payload provenance (Plan 08-05, unchanged bytes): rich enough to clear the
// ING-06 confidence thresholds (blockCount >= 3 AND textLength >= 500 — the
// threshold gates the markdown path identically to the URL/paste paths) and
// varied enough that the round-trip anchor gate samples 5 grapheme offsets
// that all resolve to confident.
export const MARKDOWN_WITH_FRONTMATTER = `---
title: "The Discipline of Calm Reading"
author: "An Experiment in Leisure"
date: "2026-08-13"
---

# The Discipline of Calm Reading

The first paragraph opens the essay and runs long enough to clear the ING-06
confidence threshold on its own. Long-form publishing rewards patience: the
reader who slows down to read every word meets the author on the author's
terms, not on the terms of a feed.

The second paragraph continues the long-form prose. The reading engine cannot
tell this markdown-derived article from a fixture or an ingested URL — that
is the load-bearing invariant of Phase 7 and Phase 8. Pagination, annotation,
location restore, and the accessible reading surface all behave identically
because the article IS a CanonicalArticle by the time it reaches ArticleView.

## A Section on Lists

The essay touches on three habits:

- Read deliberately, not greedily.
- Mark only what you would quote aloud.
- Return to what you have marked.

> The reader who annotates sparingly annotates well.

Inline \`code\` is rendered as a code mark, and a fenced code block follows:

\`\`\`
function calm(page) {
  return page.read({ pauseBetween: true });
}
\`\`\`
`;
