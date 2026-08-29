---
phase: 17-reader-owned-metadata
plan: 03
subsystem: ui
tags: [react, metadata-overrides, effective-values, markdown-export, review-panel, playwright, vitest]

requires:
  - phase: 17-reader-owned-metadata
    provides: ArticleSchema readerTitle/readerAuthor override fields + the one effectiveTitle/effectiveAuthor derivation module (Plan 17-01)
  - phase: 17-reader-owned-metadata
    provides: Library-side effective-value swap + EditMetadataDialog write path (Plan 17-02 — the surfaces this plan joins)
provides:
  - Reader-side effective-value consumption at all five ArticleView sites (document.title standalone + chapter-combo ARTICLE half, export filename, byline, h1) with chapter-neighbor and book-half surfaces deliberately canonical
  - Review-side effective title at all four sites (ReviewView options sort, select option labels, section h2; reviewFilter article sort key)
  - Markdown export effective values (citation line via effectiveAuthor + effectiveTitle, per-article h1, library ## section heading, unlocated-section sort) — OQ5 pinned effective in code
  - Unit proof that export content carries the override (canonical title asserted ABSENT) and no-override articles render byte-stable
affects: [17-04 bundle v3 + metadata conflicts, 17-05 migration + cross-surface behavioral e2e]

tech-stack:
  added: []
  patterns:
    - "Display-source swap discipline: only the VALUE source changes (effectiveTitle(article) replaces article.provenance.title); markup shapes, ids, guards, refs, and tabIndex stay byte-stable so fixture-pinned specs stay green without edits"
    - "Byline truth-consistency: all three author expressions (guard, rendered text, separator condition) swap together so an override-only author can never render an empty guarded block"
    - "Chapter/book canonical carve-out in code comments: every deliberately-unchanged canonical read carries a D17-05/D17-06 citation so the next audit grep can classify it"

key-files:
  created: []
  modified:
    - src/routes/ArticleView.tsx
    - src/routes/review/ReviewView.tsx
    - src/routes/review/reviewFilter.ts
    - src/portability/markdown.ts
    - tests/unit/portability/markdown.test.ts

key-decisions:
  - "OQ5 pinned in code: the per-article export filename uses effectiveTitle (sanitizeFilename guard unchanged, id unchanged) — the exported file is named what the reader calls the article"
  - "The chapter-combo document.title swaps ONLY the article half; the book half stays chapterContext.book.title byte-identical (D14-07 format contract; books not overridable — D17-05)"
  - "reviewFilter.ts diff held to import + sort-key operands only (the plan's explicit diff-shape acceptance gate); its two header comments still cite the historical provenance.title localeCompare lineage — recorded here rather than edited"
  - "requirements-completed: [META-02] — the downstream half (reader, review, export presentation) closes here on top of 17-02's library half; the cross-surface behavioral e2e proof lands in 17-05 as planned"

patterns-established:
  - "Effective-value swap site table: five ArticleView + three ReviewView + one reviewFilter + four markdown.ts sites, each swapped with a phase-tagged comment — the 17-05 cross-surface e2e can grep-audit against this list"

requirements-completed: [META-02]

duration: 4 min
completed: 2026-08-29
status: complete
---

# Phase 17 Plan 03: Reader/Review/Export Effective-Value Surfaces Summary

**All reader-, review-, and export-presentation consumers of article title/author now derive from the one effectiveMetadata module (8 call sites across ArticleView/ReviewView/reviewFilter/markdown.ts), with chapter/book surfaces deliberately canonical and export override behavior unit-proven (canonical title asserted absent from the export)**

## Performance

- **Duration:** 4 min
- **Started:** 2026-08-29T23:53:10Z
- **Completed:** 2026-08-29T23:57:25Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- ArticleView's five reader sites read effectiveTitle/effectiveAuthor: standalone document.title, the ARTICLE half of the chapter-combo title (book half byte-identical), the per-article export filename (OQ5 pinned), the byline (all three author expressions swapped together inside the untouched truthy guard + publishedAt logic), and the h1 (ref/tabIndex byte-stable)
- Highlights review shows and sorts the one effective name: select option labels, options sort comparator, section h2 (ReviewView), and the article section sort key (reviewFilter — both localeCompare operands)
- Markdown export cites and headings the effective values: citation line (author + italic title), per-article `# Highlights — …` h1, library `## …` section heading, and the unlocated-section sort key
- Strengthen-only unit extension (3 cases): override present → override in citation/headings with the canonical title string asserted ABSENT (D17-09 one name); no-override → byte-stable regression; sections order by EFFECTIVE title (override pulls article to front)

## Task Commits

Each task was committed atomically (Task 2 via TDD cycle):

1. **Task 1: ArticleView — document.title, byline, h1, export filename on effective values** - `f1527df` (feat)
2. **Task 2: ReviewView + reviewFilter + markdown export on effective values** - `dc24f34` (test: RED — 2 failing new-behavior cases / 21 passing) + `43911e5` (feat: GREEN — 43/43)

**Plan metadata:** (final docs commit below)

## TDD Gate Compliance

Task 2 (`tdd="true"`) followed RED → GREEN with both gate commits in order:
- RED: `dc24f34` `test(17-03):` — vitest exit 1 with exactly the 2 new-behavior cases failing (override-content + effective-sort); the regression case passed as expected
- GREEN: `43911e5` `feat(17-03):` — same suites 43/43, exit 0

## Files Created/Modified
- `src/routes/ArticleView.tsx` — import + the five display-source swaps; neighbor region and every SectionAnnouncer/ResumeBanner/Header line untouched
- `src/routes/review/ReviewView.tsx` — import + options sort, option label text, section h2 text; header comment updated to name the effective title
- `src/routes/review/reviewFilter.ts` — import + article sort key operands only
- `src/portability/markdown.ts` — import + citation line, per-article h1, library section heading, unlocated-section sort; orderSectionsByRecency doc comment updated
- `tests/unit/portability/markdown.test.ts` — +1 describe (3 cases), pure additions

## Decisions Made
- **Byline triple-swap** — guard, rendered text, and ` · ` separator condition all read effectiveAuthor so the guard and render share one truth (an override-only author with no publishedAt renders the byline, never an empty block); publishedAt branch logic byte-unchanged
- **Comments carry the canonical carve-out** — each deliberately-unchanged canonical read (neighbor titles, book halves) now has an inline D17-05/D17-06 citation, making the plan's success-criterion grep self-documenting
- **reviewFilter comment stasis** — the diff-shape acceptance gate ("only the sort-key operand change") was honored strictly; the file's two historical lineage comments (L27, L115 citing the markdown.ts L253 precedent origin) were left untouched and recorded here instead

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed
**Impact on plan:** N/A

## Issues Encountered
None. (The plan's stated import path "`../ingestion/library/effectiveMetadata` from routes files" was written for ArticleView's depth; the review files correctly use `../../ingestion/…` per their existing import grammar — a path-depth detail, not a deviation from intent.)

## Verification Results

| Gate | Command | Result |
|------|---------|--------|
| Task 1 greps | `rg -c 'effectiveTitle'/'effectiveAuthor' src/routes/ArticleView.tsx` | 5 / 4 (≥4 required; combo line keeps `chapterContext.book.title` adjacent to `effectiveTitle(article)`) |
| Task 1 neighbor canon | `rg -n 'neighbor\?\.provenance\.title'` in the L1233-1243 region; sed-window check | neighbor read unchanged; NO effective call in that region |
| Task 1 non-consumers | `git diff --stat` on SectionAnnouncer/ResumeBanner/Header | empty — not modified |
| Task 1 e2e gate | `npx playwright test browse-open.spec.ts v1-regression.spec.ts --project=chromium` | 11/11 passed (fixtures carry no overrides → text byte-stable) |
| Task 2 TDD RED | `npx vitest run tests/unit/portability/markdown.test.ts` | exit 1 — 2 failed (new behavior) / 21 passed |
| Task 2 GREEN gate | `npx vitest run tests/unit/portability/markdown.test.ts tests/unit/review-filter.test.ts` | 43/43 passed, exit 0, no prior case removed |
| Task 2 greps | `rg -c 'effectiveTitle'` ReviewView=4, reviewFilter=2, markdown=6 (+2 effectiveAuthor) | all sites swapped |
| reviewFilter diff shape | `git diff src/routes/review/reviewFilter.ts` | import line + sort operands only |
| Success-criterion audit | `rg -n 'provenance\.title' src/` (excl. schema/persistence/fixtures) | only deliberate canonical surfaces: ArticleView neighbor L1249, effectiveMetadata fallback, EditMetadataDialog canonical placeholder, LibraryView chapter-title map (+2 historical comments) — no forked title logic |
| Typecheck | `npx tsc` | exit 0 |
| Lint (changed files) | `npx eslint <5 changed files>` | exit 0 |
| Full unit suite (honest gate) | `npm run test:unit -- --run` | 1321 passed / 0 failed / 13 intentional skips (92 files + 2 skipped files), exit 0 |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- META-02's downstream half complete: Reader (document.title/byline/h1/filename), Highlights (labels/order/sections), and export presentation (citations/headings/sort) all consume the single derivation on top of 17-02's library half
- Ready for 17-04 (bundle v3 + metadata conflicts — overrides already ride ArticleSchema) and 17-05 (cross-surface behavioral e2e against this plan + 17-02 merged)
- Blockers: none. Deferred zipSlip.ts lint debt (pre-existing, Phase 09) remains tracked in deferred-items.md.

---
*Phase: 17-reader-owned-metadata*
*Completed: 2026-08-29*

## Self-Check: PASSED

All 5 key-files exist on disk and modified as described; all three task commits verified in git log (f1527df, dc24f34, 43911e5); all acceptance criteria and plan-level verification gates recorded above with honest results.
