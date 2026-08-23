---
phase: 12-epub-intake
verified: 2026-08-18T16:40:00Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
deferred:
  - truth: "Manual screen-reader acceptance of the new book/chapter surfaces (BookRow disclosure, chapter-nav, context line)"
    addressed_in: "Phase 13"
    evidence: "Phase 13 SC#3: 'The documented screen-reader acceptance flows complete on NVDA+Firefox with zero blocker/major findings, closing the v1.0 ACPT-02 coverage boundary A4' (12-06 summary explicitly queues the webkit sequential-nav divergence and manual SR flows for this pass)"
---

# Phase 12: EPUB Intake Verification Report

**Phase Goal:** Readers can add an EPUB book to their library, surfaced as per-chapter articles under a book grouping (Option A) — preserving every v1.0 substrate contract at chapter granularity.
**Verified:** 2026-08-18T16:40:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | **SC#1**: Reader can upload a DRM-free EPUB and the library shows it as a book grouping with expandable chapter articles (Option A: one article per chapter + thin Book record) | ✓ VERIFIED | Full chain wired and behaviorally proven. Picker: `isEpub` branch before any read + `accept=".md,.html,.pdf,.epub"` (IngestControl.tsx L224-239, L386). Client: `ingestEpub` → POST `/api/ingest?format=epub` with per-article `ArticleSchema.parse` re-validation (IngestionClient.ts L157-204). Server: `ingestEpubBook` fifth Stage-1 branch with `epub-<hash>`/`-cNN` ids and `BookSchema.parse` (server/ingest.ts L243-345). Persistence: Dexie `version(5)` books store + articles `bookId` index, no `.upgrade()` (db.ts L189-195; last db.ts commit is the 12-03 append — v1-v4 untouched). UI: BookRow `aria-expanded`/`aria-controls` disclosure with nested chapter sub-rows, LibraryView `bookId` partition (chapters never top-level), skip disclosure, `removeBook` sole call site in BookRemoveConfirm Proceed. e2e `epub-intake.spec.ts` SC#1 describe (7 cases: grouping, disclosure, tag/search, continue-reading, progress, cascade, dedupe) green in recorded run 3; ingest-epub.spec.ts 25/25 re-run live by verifier — PASS |
| 2 | **SC#2**: Each chapter opens in the reader and paginates, annotates, and restores location identically to other articles; two-mode reading works at chapter granularity | ✓ VERIFIED | Chapters ride the unchanged per-article substrate: `assertRoundTripAnchor` imported unchanged and called per chapter (server/ingest.ts L314) — no fork. e2e SC#2 case "a chapter annotates + restores location in BOTH modes exactly like an article" (epub-intake.spec.ts L848) with persistence.spec tolerances, green in the recorded honest full-suite run (e2e 1000/0/6, exit 0 — 12-08-OUTPUT.md run 3); HEAD is docs-only (`9d8c591`, `065538f`) beyond the record commit `3f43082` — zero source drift since the green run. Server-side chapter gating re-proven live by verifier (ingest-epub.spec 25/25) |
| 3 | **SC#3**: Cross-chapter navigation (next/previous chapter) and book-level progress work; reopening a book resumes at the last-read chapter | ✓ VERIFIED | ArticleView `nav.chapter-nav`: scrolling in-flow before/after body; paginated Next on final page only / Previous on first page only, `position:fixed` chrome (L1653-1698; app.css L2849+). `bookProgress.ts` pure derivations: `deriveBookProgress` over exported `FINISHED_THRESHOLD` (imported from ContinueReadingStrip — no forked 0.98), `resolveResumeChapterId` max-savedAt, `chapterOrdinal` (L72-127). Strip entry "BookTitle — Chapter N of M". e2e SC#3 describe (3 cases incl. re-skim-wins D12-07) green in recorded run 3 |
| 4 | **SC#4**: EPUB parser isolated behind an adapter, epub.js renderer NOT used inside React, round-trip anchor test gates every successfully extracted chapter | ✓ VERIFIED | Adapter isolation: server/epubToBooks.ts (1062 lines) is pure bytes→result (no Dexie/React; src/ imports are type-only + zipSlip helper; zero Readability references; DRM allowlist URI appears exactly once as pass condition). Renderer absence — verifier's own greps: **zero** matches for `epubjs`/`epub.js`/`@futurepress`/`readium` tokens across src/, server/, dev-server/, functions/, package.json; **zero** `fast-xml-parser` imports under src/; exact pin `"fast-xml-parser": "5.10.1"` + `"fflate": "0.8.3"` in package.json. Client bundle: **zero** `fast-xml-parser`/`jsdom`/`unpdf`/`pdfjs` references in dist/assets (verified against the on-disk 12-08 build). Anchor gate per chapter: ingest-epub.spec `anchorGateFailBook` case (L243) proves stage-level skip end-to-end; calibration evidence records `anchorRoundTrip: true` on all 7 admitted real books; replay.spec.ts re-run live by verifier — PASS |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

### Deferred Items

Items not yet met but explicitly addressed in later milestone phases.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Manual screen-reader acceptance of the new book/chapter surfaces (incl. the webkit sequential keyboard-nav divergence logged in 12-06) | Phase 13 | Phase 13 SC#3: NVDA+Firefox acceptance flows with zero blocker/major findings |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/epubToBooks.ts` | The swappable EPUB parser adapter + EPUB_THRESHOLDS (≥300 lines) | ✓ VERIFIED | 1062 lines; exports `epubToBooks`, `EPUB_THRESHOLDS`, `normalizeEpubHref`, `withEpubTimeout`, `assertChapterCap`; parse chain unzip→slip→DRM→container→OPF→nav\|NCX→TOC-merge→sanitize+walk→downgrade→admission all present |
| `tests/unit/server/epub-fixtures.ts` | Self-verifying synthetic EPUB generator (≥200 lines, 20+ builders) | ✓ VERIFIED | 1462 lines; 21 builders (20 + `anchorGateFailBook` from 12-04); module-load self-check |
| `tests/unit/server/epub-to-books.spec.ts` | Adapter unit matrix (≥250 lines) | ✓ VERIFIED | 334 lines, 29 tests enumerated via `vitest list`; DRM marker-byte + fontObfuscatedBook pass-through cases present |
| `tests/unit/server/ingest-epub.spec.ts` | Integration round-trip gate (≥150 lines) | ✓ VERIFIED | 438 lines, 25 tests — re-run live by verifier: PASS |
| `src/persistence/booksStore.ts` | Store seam: listBooks/getBook/saveBook/removeBook/setBookTags/hasBook (≥100 lines) | ✓ VERIFIED | 252 lines; all six exports; `saveBook` and `removeBook` each exactly ONE `db.transaction` |
| `src/persistence/db.ts` | Dexie v5 append — books store + bookId index, no `.upgrade()` | ✓ VERIFIED | L189-195; `books!: Table<Book, string>`; only commit touching db.ts since 08-02 is the 12-03 append |
| `src/ingestion/library/bookProgress.ts` | Pure progress/resume derivations | ✓ VERIFIED | 3 exports; `FINISHED_THRESHOLD` imported from ./ContinueReadingStrip (no local 0.98) |
| `src/ingestion/library/BookRow.tsx` (≥120) / `BookRemoveConfirm.tsx` (≥60) | Expandable book row / book-scoped destructive confirm | ✓ VERIFIED | 208 / 174 lines; `removeBook` invoked from exactly ONE executable call site (BookRemoveConfirm L121); `data-initial-focus` on the non-destructive button |
| `src/routes/ArticleView.tsx` | Chapter context line + chapter-nav, epub-chapter only | ✓ VERIFIED | Tolerant `getBook` lookup gated on `source === "epub-chapter"` (L888); `· Chapter N of M` via `chapterOrdinal` (L1551-1554); 4 nav mount points (L1653-1698) |
| `src/portability/bundle.ts` | schemaVersion 1\|2 union + optional books array | ✓ VERIFIED | L43 `z.union([z.literal(1), z.literal(2)])`; L54 `books: z.array(BookSchema).optional()` (composed, not re-declared); peek `> 2` (ExportImportService L239) |
| `src/portability/conflicts.ts` | Book-id conflict kind (skip-by-default) | ✓ VERIFIED | `"book"` kind (L52); identical-hash no-op; overwrite puts; keep-both = skip |
| `src/portability/ExportImportService.ts` | Books in export + atomic import transaction | ✓ VERIFIED | `listBooks()` in export Promise.all (L85); `schemaVersion: 2` (L115); `db.books` in both transaction branches (L334, L378, L388); imported chapters re-stamped with top-level `bookId` |
| `tests/e2e/epub-intake.spec.ts` | SC#1+SC#2+SC#3+refusal e2e (≥250 lines) | ✓ VERIFIED | 1251 lines; 4 describes covering all three SCs + 4-class refusal no-side-effect gates; green in recorded run 3 |
| `tests/unit/server/epub-calibration/` | Harness + manifest + evidence + replay (harness ≥120 lines) | ✓ VERIFIED | harness.ts 453 lines with all six exports; derive.spec.ts env-gated; replay.spec.ts ALWAYS-ON (no env gate — verified by read); manifest 7 books + 2 honest gap records; evidence 7/7 admitted |
| `docs/epub-calibration.md` (≥30) / `corpus/epub/README.md` / `.gitignore` | Local-only corpus convention | ✓ VERIFIED | 101 lines; `git check-ignore corpus/epub/x.epub` exits 0; only README tracked under corpus/epub/ |
| `dev-server/ingest-middleware.ts` | Format-aware 413 reasons | ✓ VERIFIED | `tooLargeReasonFromUrl` (format=epub hint) + `tooLargeReasonFromBody` (parsed-body-key branch); MAX_INGEST_BODY_BYTES imported from limits (max-derived) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `src/ingestion/types.ts` | `server/limits.ts` | EPUB_MAX_BYTES re-export (three-point cap) | ✓ WIRED | limits.ts L111-112 `export { EPUB_MAX_BYTES }` |
| `src/content/schema.ts` | `src/ingestion/library/SourceBadge.tsx` | `case "epub-chapter"` exhaustive badge | ✓ WIRED | SourceBadge.tsx L51 |
| `server/epubToBooks.ts` | `server/htmlToBlocks.ts` | `sanitizeExtractedHtml` shared ING-07 path | ✓ WIRED | Imported + called (L56, L741); zero Readability references |
| `server/epubToBooks.ts` | `src/portability/zipSlip.ts` | `isSafeEntryName` on every entry | ✓ WIRED | L54, L339 |
| `server/ingest.ts` | `server/epubToBooks.ts` | Fifth Stage-1 branch calls adapter | ✓ WIRED | L39, L261; `assertRoundTripAnchor` per chapter L314 |
| `src/ingestion/IngestControl.tsx` | `src/persistence/booksStore.ts` | `hasBook` dedupe-refuse → `saveBook` | ✓ WIRED | L265 `hasBook` precedes L271 `saveBook` |
| `src/persistence/db.ts` | `src/content/schema.ts` | `Table<Book, string>` typed by BookSchema inference | ✓ WIRED | db.ts L98 |
| `src/ingestion/library/bookProgress.ts` | `ContinueReadingStrip.tsx` | FINISHED_THRESHOLD import (never forked) | ✓ WIRED | bookProgress L35; threshold exported at strip L56 |
| `src/routes/ArticleView.tsx` | `booksStore` / `bookProgress` | `getBook` + `chapterOrdinal` | ✓ WIRED | L83-84, L888-891 |
| `src/portability/ExportImportService.ts` | `booksStore` / `db.books` | `listBooks` export join + books in import transaction | ✓ WIRED | L40, L85, L334 |
| `package.json` | `derive.spec.ts` | `calibrate:epub` env-gated script | ✓ WIRED | package.json L16 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| BookRow | `chapters` sub-rows | LibraryView `chaptersByBook` fold over loaded articles grouped by `ingestionMeta.bookId` (live Dexie reads) | Yes | ✓ FLOWING |
| ContinueReadingStrip | book entries | `listBooks()` + raw LocationRecords → `deriveBookProgress`/`resolveResumeChapterId` | Yes | ✓ FLOWING |
| ArticleView context line | `chapterContext` | `getBook(meta.bookId)` tolerant load in the article-load effect | Yes | ✓ FLOWING |
| epub-evidence.json | verdict rows | `deriveEvidence` over real `ingest({epub})` runs (env-gated local derive, 2026-08-18T21:01Z) | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Server chain end-to-end (happy path, determinism, TOC shapes, anchor-gate skip, refusals, caps) | `npx vitest run tests/unit/server/ingest-epub.spec.ts` | 25/25 passed (2.4s) | ✓ PASS |
| Committed calibration evidence validates at the D12-12 bar + thresholds pin (T-12-20) | `npx vitest run tests/unit/server/epub-calibration/replay.spec.ts` | 3/3 passed | ✓ PASS |
| Adapter unit matrix exists | `npx vitest list tests/unit/server/epub-to-books.spec.ts` | 29 tests enumerated | ✓ PASS |
| 3-engine e2e (SC#1/2/3 + refusals) | Recorded honest full-suite run 3 (12-08-OUTPUT.md): e2e 1000/0/6, exit 0 | All epub-intake/a11y/portability cells green; verifier cross-checked: commits `e66cdde`/`3f43082` exist, working tree clean, HEAD docs-only beyond the record — no source drift | ✓ PASS (recorded, commit-verified) |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| (no `scripts/*/tests/probe-*.sh` in this repo — calibration replay serves as the always-on probe and was executed live above) | `npx vitest run tests/unit/server/epub-calibration/replay.spec.ts` | 3/3 passed, exit 0 | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ING-05 | 12-01..12-08 (all eight declare it) | Reader can add a book by uploading an EPUB, surfaced as per-chapter articles under a book grouping (Option A, substrate contracts preserved) | ✓ SATISFIED | All four SCs verified above; REQUIREMENTS.md marks ING-05 `[x]` Complete (Phase 12). No orphaned requirements — ING-05 is the only requirement mapped to Phase 12 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none — zero TBD/FIXME/XXX in all 14 phase-modified source files scanned; zero TODO/HACK/PLACEHOLDER in the new modules) | — | — | — | — |

Deferred production findings (honestly logged in `deferred-items.md`, none violating a must-have truth):

| # | Finding | Severity | Assessment |
|---|---------|----------|-----------|
| 1 | Anchor-gate allocation churn: whole-novel chapters (Buddenbrooks, ~700k graphemes) OOM the default ~4GB Node heap; `calibrate:epub` carries 8GB headroom; fix path identified (09-03 memoization precedent) | ⚠️ Warning | Honest scope boundary — no SC or plan truth requires in-place optimization; a real novel uploaded through the local dev middleware could OOM it. Deserves backlog priority |
| 2 | Per-chapter stage loop (stages 2+ in `ingestEpubBook`) is unbounded — `withEpubTimeout` wraps only `epubToBooks` (Stage 1), leaving T-12-14's stated intent partially unrealized | ⚠️ Warning | Hardening gap, honestly disclosed; chapter cap + skip accounting still bound work; not covered by any later phase — recommend capture into the backlog |
| 3 | Identical unsupported-image fallback descriptions can manufacture anchor ambiguity (observed skip is disclosed per D12-11) | ℹ️ Info | Contract-consistent (ANNO-07); skip disclosed, never silent |

### Human Verification Required

None open for this phase. The one manual-verification item in 12-VALIDATION.md (corpus shape expectations) was executed by the human at the 12-08 Task 2 blocking checkpoint with per-book derivation bases recorded in manifest.json. Manual screen-reader acceptance of the new surfaces is explicitly Phase 13 scope (SC#3) — recorded under Deferred Items, not pending here.

### Gaps Summary

No gaps. All four roadmap success criteria are achieved and evidenced in the codebase: the upload→book-grouping pipeline is fully wired end-to-end (picker → client → middleware → orchestrator fifth branch → adapter → Dexie v5 → grouped library UI) and behaviorally proven (25/25 integration tests re-run live; 12-case × 3-engine e2e green in the recorded honest full-suite run with commits verified and zero source drift since); chapters ride the unchanged v1.0 substrate with the round-trip anchor gate applied per chapter; cross-chapter navigation, book progress, and reopen-resume work at book granularity; and all four SC#4 structural gates (adapter isolation, no vendor renderer anywhere, clean client bundle, per-chapter anchor gating) were re-verified by direct grep against src/, server/, package.json, and dist/assets. The D12-12 calibration bar holds on 7/7 real books with replay-pinned thresholds. Three deferred production findings are honest scope boundaries (two warnings recommended for backlog capture), not must-have violations.

---

_Verified: 2026-08-18T16:40:00Z_
_Verifier: the agent (gsd-verifier)_
