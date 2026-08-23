---
phase: 09-versioned-export-import
plan: 02
subsystem: portability
tags: [markdown, escaping, annotations, resolveQuoteSelector, dexie, zod, vitest, fake-indexeddb]

# Dependency graph
requires:
  - phase: 09-versioned-export-import
    provides: src/portability/ pure-module conventions (09-01), tests/unit/portability harness, STATE-04 safeParse drop discipline
  - phase: 05-durable-highlights-and-notes
    provides: HighlightRecordSchema/NoteRecordSchema dual-selector records, resolveQuoteSelector tri-state (D5-02/ANNO-07)
  - phase: 08-markdown-pipeline-and-personal-library
    provides: loadAllLocations whole-library bulk-read precedent, Dexie v4 5-store schema
provides:
  - src/portability/markdown.ts — fixed highlights-only Markdown template renderer (D9-06..D9-09) with escapeMarkdownLine structure-injection guard (T-9-05)
  - HighlightEntry + HighlightSection types + live tri-state collectHighlightEntries reusing the shipped resolver
  - loadAllHighlights whole-library bulk read (highlightsStore, mirrors loadAllLocations)
  - loadAllNotes whole-library bulk read (notesStore, mirrors loadAllLocations)
  - tests/unit/portability/{markdown,bulk-reads}.test.ts — 24 unit tests locking the template byte-for-byte + the bulk-read contract
affects: [09-versioned-export-import plans 09-03..09-05 (export service + UI call sites compose these)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fixed Markdown template locked byte-for-byte by full-string-equality tests (citation omission rules, markers, footer counts)"
    - "Leading-run-only markdown escaping: per-char for symbol runs, period-only for ordered markers (CommonMark backslash escapes apply only before ASCII punctuation)"
    - "Whole-library bulk read = toArray + per-row safeParse + silent drop + plain-array return (loadAllLocations mirror, third instance)"

key-files:
  created:
    - src/portability/markdown.ts
    - tests/unit/portability/markdown.test.ts
    - tests/unit/portability/bulk-reads.test.ts
  modified:
    - src/persistence/highlightsStore.ts
    - src/persistence/notesStore.ts

key-decisions:
  - "HighlightSection exported alongside the six required symbols — sections need a nameable type for renderLibraryHighlights/orderSectionsByRecency callers (Plan 09-05)"
  - "escapeMarkdownLine escapes only the PERIOD of a leading digit-run-period ('1974\\\\.' not '\\\\1974\\\\.') — a backslash before a digit renders literally in CommonMark and would corrupt the reader's text"
  - "Every entry renders from its STORED highlight.quote.exact regardless of status — the captured passage IS the text, so orphans (absent article OR unresolvable quote) never drop (D9-09)"
  - "requirements-completed stays [] — PORT-01/PORT-03 close at the plans proving end-to-end export behavior (mirrors the 04-02 PAGE-01 / 06-01 ACPT-03 / 09-01 PORT-01 split precedent)"

patterns-established:
  - "Tri-state honest inclusion on the external-tool surface: *[approx]* / *[orphan]* markers + exact-counts footers extend ANNO-07 beyond the reader UI"

requirements-completed: []  # PORT-01/PORT-03 stay open — 09-02 ships the pure renderer + read surface; they close at the end-to-end export plans

# Metrics
duration: 7 min
completed: 2026-08-15
status: complete
---

# Phase 9 Plan 2: Highlights Markdown Renderer + Bulk Reads Summary

**Fixed highlights-only Markdown renderer (blockquote + citation + Note lines, honest *[approx]*/[orphan] tri-state, byte-for-byte template-locked) + loadAllHighlights/loadAllNotes whole-library bulk reads mirroring loadAllLocations — 24 new unit tests, full portability dir 64/64 green, db.ts byte-unchanged**

## Performance

- **Duration:** 7 min
- **Started:** 2026-08-15T18:00:58Z
- **Completed:** 2026-08-15T18:07:50Z
- **Tasks:** 2
- **Files modified:** 5 (1 src module, 2 stores, 2 unit specs)

## Accomplishments
- `src/portability/markdown.ts` — the D9-06..D9-09 fixed template: per-article (`# Highlights — {title}`) and library-wide (`# Highlights` + `## {title}` sections + `_Totals: …_`) renderers, `> — {author}, *{title}*` citation with author-omission and `([source](url))` rules, `> Note:` lines, honest tri-state markers + exact-counts footers
- `escapeMarkdownLine` (T-9-05) backslash-escapes ONLY leading structure runs (hash/dash/plus/asterisk/greater-than per-char; digit-run-period period-only) — stored highlight/note text cannot forge headings, lists, or nested blockquotes; mid-text punctuation untouched
- `collectHighlightEntries` reuses the SHIPPED `resolveQuoteSelector` from `../content/normalizeText` (REUSE-DO-NOT-FORK) for live confident/ambiguous/orphan status; absent articles map to orphan without dropping the highlight or its note (D9-09)
- `loadAllHighlights`/`loadAllNotes` — the two missing whole-library reads (RESEARCH Pitfall 5) mirroring `loadAllLocations` exactly: `toArray()` + per-row safeParse + silent corrupt-row drop + plain-array return; `src/persistence/db.ts` byte-unchanged (Pitfall 9)
- `orderSectionsByRecency` — located sections by latest `savedAt` descending, then unlocated by title ascending, input never mutated

## Task Commits

Each task was committed atomically:

1. **Task 1: Fixed highlights Markdown renderer with honest tri-state inclusion (TDD)** - `051023a` (test/RED) + `246b147` (feat/GREEN)
2. **Task 2: loadAllHighlights + loadAllNotes bulk store loaders (TDD)** - `f3ab65a` (test/RED) + `832ed78` (feat/GREEN)

## TDD Gate Compliance

Both TDD tasks followed RED → GREEN with the required commit sequence:

| Task | RED commit | GREEN commit | REFACTOR | Status |
|------|-----------|--------------|----------|--------|
| Task 1 (markdown renderer) | `051023a` | `246b147` | not needed (minimal module) | Pass |
| Task 2 (bulk reads) | `f3ab65a` | `832ed78` | not needed (additive store functions) | Pass |

RED specs failed on the not-yet-created module / not-yet-exported functions (feature-absent signal, mirroring the 09-01 key decision); GREEN runs passed 18/18 and 6/6 respectively.

## Files Created/Modified
- `src/portability/markdown.ts` - HighlightEntry + HighlightSection types, escapeMarkdownLine, collectHighlightEntries, renderArticleHighlights, renderLibraryHighlights, orderSectionsByRecency (pure, no DOM, no I/O)
- `src/persistence/highlightsStore.ts` - + loadAllHighlights (mirrors loadAllLocations; header-doc cites Plan 09-02 + Pitfall 5)
- `src/persistence/notesStore.ts` - + loadAllNotes (symmetric)
- `tests/unit/portability/markdown.test.ts` - 18 tests: byte-for-byte template lock, marker/footer/citation rules, orphan-with-note never-drop, escaping matrix, live tri-state collection, section ordering
- `tests/unit/portability/bulk-reads.test.ts` - 6 tests on the fake-indexeddb harness: corrupt-row drop both stores, plain-array contract, empty-store []

## Decisions Made
- Exported `HighlightSection` beyond the six required symbols — `renderLibraryHighlights(sections)` and `orderSectionsByRecency(sections, locations)` need a nameable section type; Plan 09-05's export service is the first external consumer
- `escapeMarkdownLine` escapes only the period of a leading ordered-list marker (`1974\.`): CommonMark backslash escapes apply only before ASCII punctuation, so escaping a digit would leak a literal backslash into the reader's quote; documented in the module comment
- Orphan entries render from stored `highlight.quote.exact` in every case — the plan's "article absent from the provided articles" case is covered end-to-end (collect → orphan status + attached note → render → both lines asserted)
- Latest-`savedAt` wins when an article has location rows across multiple revisions (orderSectionsByRecency matches by articleId across ALL provided LocationRecords, unit-tested)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. `npm run build` exit 0 at both GREEN commits; the pre-existing >500 kB chunk-size warning is informational and unrelated.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The PORT-03 pure side + the PORT-01 export read surface are complete: the export service (Plan 09-03) composes `dexieLibrarySource.list()` + `loadAllHighlights/loadAllNotes/loadAllLocations/loadSettings` + `collectHighlightEntries` + the renderers + `downloadBlob`
- `sanitizeFilename` (09-01) remains the mandated filename path for per-article `.md` downloads at the UI call site (T-9-06, enforced in Plan 09-05 Task 3)
- No Dexie schema change anywhere in this plan — `git diff --stat src/persistence/db.ts` empty (Pitfall 9 held)

---
*Phase: 09-versioned-export-import*
*Completed: 2026-08-15*

## Self-Check: PASSED

All 5 created/modified files verified present on disk; all 4 task commits (051023a, 246b147, f3ab65a, 832ed78) verified in git log. Plan-level verification re-run green: `npx vitest run tests/unit/portability` 5 files / 64 tests exit 0; `npm run build` exit 0; `git diff --stat src/persistence/db.ts` empty.
