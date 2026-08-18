---
phase: 12-epub-intake
plan: 01
subsystem: ingestion
tags: [epub, zod, fast-xml-parser, fflate, synthetic-fixtures, dexie]

# Dependency graph
requires:
  - phase: 11-pdf-intake
    provides: exact-pin approval-record precedent (11-01-unpdf-approval.md), PDF_MAX_BYTES three-point cap pattern, self-verifying synthetic PDF generator discipline
provides:
  - EPUB_MAX_BYTES (src/ingestion/types.ts, re-exported by server/limits.ts) — three-point shared cap constant
  - EPUB_MAX_CHAPTERS / EPUB_EXTRACTION_TIMEOUT_MS / EPUB_MAX_ENTRY_BYTES + max()-derived MAX_INGEST_BODY_BYTES (server/limits.ts)
  - Fifth IngestionRequestSchema variant {epub base64, filename?}
  - Four IngestionFailureReasonEnum members (epub-protected, epub-unreadable, epub-empty, epub-too-large) — catalog 16 → 20
  - Second IngestionResponseSchema ok-variant {ok, book, articles min 1, skippedCount}
  - BookSchema + Book type; epub-chapter ArticleSource member; IngestionMeta.bookId/chapterIndex; SourceBadge "Book"
  - tests/unit/server/epub-fixtures.ts — 20 named self-verifying EPUB builders (the 12-02/12-04/12-05 fixture source)
  - .planning/phases/12-epub-intake/12-01-fxml-approval.md — the D12-15 legitimacy/approval record
affects: [12-02 adapter, 12-03 persistence, 12-04 client picker, 12-05 orchestrator e2e, 12-06 reader UX, 12-07 portability, 12-08 dist proof]

# Tech tracking
tech-stack:
  added: ["fast-xml-parser@5.10.1 (exact pin, human-approved D12-15, server-only)"]
  patterns: ["fixed-mtime zipSync fixtures (fflate Date.now() default breaks byte-determinism)", "stored marker entries for byte-present discriminators", "declared-size bomb patch (09-04 technique) EPUB edition", "'article'-key narrowing for the two-ok-variant envelope"]

key-files:
  created:
    - .planning/phases/12-epub-intake/12-01-fxml-approval.md
    - tests/unit/server/epub-fixtures.ts
  modified:
    - src/ingestion/types.ts
    - src/content/schema.ts
    - server/limits.ts
    - src/ingestion/library/SourceBadge.tsx
    - tests/unit/ingestion-schema.test.ts
    - src/ingestion/IngestionClient.ts
    - package.json

key-decisions:
  - "fast-xml-parser pinned exactly at 5.10.1 (user-approved D12-15 blocking-human gate, 2026-08-18) — the older-signal STACK.md-lineage pin that sidesteps the too-new SUS driver; approval record mirrors 11-01"
  - "Book ok-variant carries NO top-level confidence — each article keeps its own ingestionMeta.extractionConfidence (Pitfall 3 planner resolution: a duplicated envelope signal would fork the truth)"
  - "MAX_INGEST_BODY_BYTES derived from max(PDF_MAX_BYTES, EPUB_MAX_BYTES) — numerically identical today (equal 10MB caps), structurally correct for future divergence (Pitfall 2)"
  - "Fixture zipSync entries carry a fixed ZIP_EPOCH mtime — fflate stamps Date.now() when mtime is absent, which would make every rebuild byte-different (discovered by cross-process hash comparison)"
  - "Fixture module imports NOTHING from /server: BOMB_ENTRY_DECLARED_SIZE is exported and the 12-02 spec asserts it > EPUB_MAX_ENTRY_BYTES (keeps the generator plain-node-importable and dependency-light)"
  - "Two-ok-variant envelope narrowing: consumers narrow with 'article' in response; a book envelope arriving on a single-article client call refuses as server-error (the ingestEpub wrapper lands in 12-04)"
  - "ING-05 stays unchecked — foundation plan ships contracts + fixtures only; the requirement closes at the end-to-end plans (04-02 PAGE-01 / 09-01 PORT-01 / 10-01 RECV-01 split precedent)"

patterns-established:
  - "Stored-entry marker discipline: small META-INF/rights/encryption/license files and hostile-OPF variants zip at level 0 so discriminator markers are byte-present in built fixtures"
  - "TOC-counter self-check contract: top-level nav li at exactly 8 spaces / navPoint at 4 spaces — the module-load check proves builder divergence (4 vs 3) and catches matrix-flattening rot"

requirements-completed: []  # ING-05 closes at the end-to-end plans (12-05+); this plan ships foundations only — the 04-02/09-01/10-01 split precedent

# Metrics
duration: 25 min
completed: 2026-08-18
status: complete
---

# Phase 12 Plan 01: EPUB Intake Foundation Summary

**fast-xml-parser@5.10.1 exact-pinned behind the D12-15 human gate, plus the additive EPUB schema/enum/cap widening (book ok-variant, BookSchema, epub-chapter badge, 20-reason catalog, four EPUB caps) and a 20-builder self-verifying synthetic EPUB fixture generator**

## Performance

- **Duration:** 25 min (Tasks 2–3, after the Task 1 approval pause)
- **Started:** 2026-08-18T14:18:58Z (post-approval resume; Task 1 gate ran before this timestamp)
- **Completed:** 2026-08-18T14:43:47Z
- **Tasks:** 3 (1 blocking-human gate + 2 auto)
- **Files modified:** 12 (2 created, 10 modified)

## Accomplishments

- **D12-15 gate closed**: fast-xml-parser installed at the human-approved exact pin 5.10.1 (no caret) with the legitimacy/approval record committed (`12-01-fxml-approval.md`, the 11-01 unpdf precedent — pin choice 5.10.1 vs 5.11.0 resolved by the human; registry evidence re-verified live at the checkpoint)
- **Additive contract widening every Wave-2+ plan compiles against**: fifth `{epub, filename?}` request variant; enum catalog 16 → 20 (epub-protected/epub-unreadable/epub-empty/epub-too-large); second `{ok, book, articles min 1, skippedCount}` response ok-variant; `BookSchema` + `epub-chapter` source + `bookId`/`chapterIndex` meta; `SourceBadge` "Book"; all shipped byte-stable for existing members (Pitfall 9 discipline — existing article ok-variant parses unchanged, unit-pinned)
- **Four EPUB resource caps**: `EPUB_MAX_BYTES` (10MB, shared three-point constant in /src, re-exported by limits.ts per the import-direction rule), `EPUB_MAX_CHAPTERS` (1000), `EPUB_EXTRACTION_TIMEOUT_MS` (30s), `EPUB_MAX_ENTRY_BYTES` (64MiB filter-before-inflate), `MAX_INGEST_BODY_BYTES` re-derived from `max(PDF, EPUB)`
- **Self-verifying synthetic EPUB generator**: 20 named builders covering the full 12-RESEARCH Wave-0 discriminator matrix (TOC shapes, publisher split, NCX, OEBPS nesting, DRM variants, corrupt/entity/proto/slip/bomb, admission shapes); module-load self-check throws on determinism/discriminator/mimetype-first/divergence violations (proved live — it caught a missing marker during development); zero binary fixtures committed

## Task Commits

Each task was committed atomically:

1. **Task 1: Approve fast-xml-parser legitimacy + exact pin (D12-15, T-12-SC)** — blocking-human gate, no commit (approval signal `"approved 5.10.1"` recorded in the approval doc, committed with Task 2)
2. **Task 2: Install pinned fast-xml-parser + widen schemas, limits, badge** — `0ae003e` (feat)
3. **Task 3: Self-verifying synthetic EPUB fixture generator** — `0ba3b23` (test)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `.planning/phases/12-epub-intake/12-01-fxml-approval.md` — D12-15 approval record (pin, evidence, hardening contract, gate closure)
- `package.json` / `package-lock.json` — fast-xml-parser@5.10.1 exact pin
- `src/ingestion/types.ts` — epub request variant, EPUB_MAX_BYTES, four enum members, book ok-variant
- `src/content/schema.ts` — epub-chapter source, bookId/chapterIndex, BookSchema + Book type
- `server/limits.ts` — Phase 12 caps block + max()-derived transport cap
- `src/ingestion/library/SourceBadge.tsx` — `case "epub-chapter"` → "Book"
- `tests/unit/ingestion-schema.test.ts` — 7-member source enum, 20-reason exact order, epub request/response cases, BookSchema describe
- `tests/unit/server/epub-fixtures.ts` — 20 builders + module-load self-check (1376 lines)
- `src/ingestion/IngestionClient.ts` — Rule 3 narrowing fix (book envelope on single-article call → server-error)
- `tests/unit/server/ingest-pdf.spec.ts`, `tests/unit/server/normalization.spec.ts`, `tests/unit/server/pdf-calibration/harness.ts` — Rule 3 narrowing fixes

## Decisions Made

- See key-decisions above; all seven carry forward to STATE.md.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two-ok-variant envelope broke `.ok`-based type narrowing**
- **Found during:** Task 2 (schema widening)
- **Issue:** Adding the second `{ok: true, book, articles, skippedCount}` variant meant `ok: true` no longer uniquely discriminates the envelope — `tsc --noEmit` failed at 4 consumer files (`IngestionClient.ts` L166-168, `ingest-pdf.spec.ts`, `normalization.spec.ts`, `pdf-calibration/harness.ts`) accessing `.article`/`.confidence`/`.reason` off the widened union
- **Fix:** `"article" in response` key-narrowing guards at every consumer; `IngestionClient.ingest()` refuses a book envelope on single-article calls as `server-error` (contract violation for that call — the `ingestEpub` wrapper lands in 12-04); the pdf-calibration harness records an unreachable book-envelope branch honestly as `refused:server-error`
- **Files modified:** src/ingestion/IngestionClient.ts, tests/unit/server/ingest-pdf.spec.ts, tests/unit/server/normalization.spec.ts, tests/unit/server/pdf-calibration/harness.ts
- **Verification:** `npx tsc --noEmit` exit 0; the four affected suites + ingestion-schema + pdf-copy all green (88/88 in the targeted run; full unit suite 991/0)
- **Committed in:** 0ae003e (Task 2 commit)

**2. [Rule 3 - Blocking] Invalid base64 literal in the new epub request test**
- **Found during:** Task 2 (test extension)
- **Issue:** The epub-payload sample literal was not valid base64 (would fail `z.string().base64()`)
- **Fix:** Computed the real value with node (`"PK\x03\x04"` → `UEsDBA==`)
- **Files modified:** tests/unit/ingestion-schema.test.ts
- **Verification:** ingestion-schema suite green
- **Committed in:** 0ae003e (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes are direct consequences of the planned widening (its downstream type effects), required for the plan's own `tsc --noEmit` acceptance criterion. No scope creep.

## Issues Encountered

- **Plan's Task 3 verify command literal exits 1**: `npx vitest run tests/unit/server/epub-fixtures.ts --typecheck.only` reports "No test files found" — the fixture module is not a spec file (matches neither server spec glob). The command's intent (typecheck the module) is satisfied by the equivalent `npx vitest run --typecheck.only --typecheck.include "tests/unit/server/epub-fixtures.ts"` (exit 0, 991 tests green in the typecheck pass) and by `npx tsc --noEmit` (exit 0; tsconfig includes `tests/`). Documented here rather than papered over.
- **fflate determinism gotcha (discovered pre-emptively)**: `zipSync` stamps `Date.now()` into DOS time fields when an entry carries no `mtime` — cross-process builds hash differently. Every fixture entry carries the fixed `ZIP_EPOCH`; the self-check's double-rebuild assertion pins it. Recorded as a pattern for 12-02+ consumers.
- **Self-check proved itself during development**: it caught the imageChapterBook markers living in a deflated (byte-invisible) chapter doc — fixed by storing that marker-bearing entry. This is exactly the rot the 10-04 seed-time precedent exists to catch.

## Verification Evidence (plan-level)

- `npx vitest run tests/unit/ingestion-schema.test.ts` — 59/59 green
- `npx tsc --noEmit` — exit 0
- `node -e "import('./tests/unit/server/epub-fixtures.ts')…"` — `fixtures OK 3771`, 20/20 builders exported, module-load self-check passing
- `grep -rn 'from "fast-xml-parser"' src/` — no matches (client bundle clean; dist/ grep proof lands at 12-08)
- Full unit suite after all tasks: **991 passed / 0 failed / 10 intentional skips** (`npm run test:unit -- --run`)
- `pdf-copy.test.ts` no-jargon guard still green with the 20-reason catalog (new epub reasons fall to the existing calm default until 12-04 ships dedicated copy)

## User Setup Required

None — no external service configuration required.

## Authentication Gates

None. The Task 1 D12-15 blocking-human gate was a planned package-legitimacy checkpoint (not an auth gate); approval `"approved 5.10.1"` received 2026-08-18 via the orchestrator.

## Next Phase Readiness

- Every Wave-2+ plan (12-02 adapter, 12-03 Dexie v5, 12-04 client picker, 12-05 orchestrator e2e, 12-06 reader UX, 12-07 portability, 12-08 dist proof) imports the widened contracts committed here
- 12-02 consumes the named fixture builders and asserts `BOMB_ENTRY_DECLARED_SIZE > EPUB_MAX_ENTRY_BYTES` against the real cap (the exported coupling point)
- `mapReasonToCopy` epub cases land in 12-04 (which owns IngestControl); until then the widened reasons map to the calm default — verified non-breaking
- The spec files (epub-to-books.spec.ts / ingest-epub.spec.ts / epub-intake.spec.ts) are NOT pre-created — each lands with the plan that owns its full content, per the objective's scope note

## Self-Check: PASSED

- All key-files exist on disk (`[ -f ]` verified: approval doc, epub-fixtures.ts, all modified sources)
- Commits `0ae003e` + `0ba3b23` present in `git log`
- All task acceptance criteria re-verified (enum arrays, caps, badge case, grep gates, vitest/tsc exits)

---
*Phase: 12-epub-intake*
*Completed: 2026-08-18*
