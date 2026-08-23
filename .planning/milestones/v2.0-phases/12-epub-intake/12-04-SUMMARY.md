---
phase: 12-epub-intake
plan: 04
subsystem: ingestion
tags: [epub, orchestrator, per-chapter-anchor-gate, book-envelope, content-hash-ids, middleware-413, dedupe-refuse]

# Dependency graph
requires:
  - phase: 12-epub-intake (Plan 02)
    provides: epubToBooks + the ChapterDraft/EpubToBooksResult contracts (bookMeta, chapters, skippedCount, originalFileHash — both hashes computed in-adapter)
  - phase: 12-epub-intake (Plans 01/03)
    provides: EPUB_MAX_BYTES + the widened book ok-variant IngestionResponseSchema; the ?format=epub client hint; BookSchema; max()-derived MAX_INGEST_BODY_BYTES
  - phase: 07-ingestion-substrate (Plan 05)
    provides: the locked 7-stage orchestrator + assertRoundTripAnchor (SC#1) + deriveConfidence + the IngestionError catch envelope
  - phase: 11-pdf-intake (Plan 03)
    provides: the fourth-branch template (decode → cap re-check → content-hash id), the guard-ordering cap proof pattern, the middleware two-guard structure
provides:
  - The fifth Stage-1 branch in server/ingest.ts — ingest({epub, filename?}) end-to-end at unit level: decode → EPUB_MAX_BYTES re-check → epubToBooks → book id epub-<shortHash(b64)> + admitted-order -cNN chapter ids → per-chapter UNCHANGED stages 2+ (parse → anchor gate → confidence → stamp) → book envelope {ok, book, articles, skippedCount}
  - Per-chapter honesty algebra (D12-11): adapter skips seed the count; parse/anchor/confidence stage failures increment and OMIT (per-chapter try/catch — never a whole-book failure); zero admitted → epub-empty
  - The Pitfall 2 middleware fix — format-aware 413 reasons at both guards (pre-read ?format=epub query hint; post-read parsed-body-key branch) with the historical pdf-too-large fallback preserved
  - tests/unit/server/ingest-epub.spec.ts — the 25-test server-side integration round-trip gate over the synthetic corpus (happy path, determinism, five TOC shapes, two skip-disclosure paths, ten refusals, caps, five middleware cells)
  - anchorGateFailBook fixture builder (21st) — periodic separator-run chapter that the adapter admits but the per-chapter anchor gate refuses (the stage-level skip path, exercised end-to-end)
affects: [12-05 orchestrator e2e (consumes the whole chain over HTTP), 12-06 reader/library UX (bookId grouping + skip disclosure copy), 12-07 portability, 12-08 dist proof, 12 calibration harness]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-chapter stage skip: the per-article stages 2+ run inside a per-chapter try/catch whose only effect on failure is skipped+=1 + omission — whole-book failure is reserved for zero admits (D12-11 algebra at orchestrator level)"
    - "Anchor-uniqueness fixture contract: synthetic prose for documents that can MERGE into one article must interleave a per-document token at least every ~64 graphemes (84 = 32 prefix + 20 window + 32 suffix is the ambiguity threshold for the shipped selector machinery)"
    - "Format-aware 413 copy: reason selection is copy-only at the pre-read guard (URL hint) and body-key-authoritative at the post-read guard, with the hint as non-JSON fallback — enforcement stays content-length-based and body-agnostic"

key-files:
  created:
    - tests/unit/server/ingest-epub.spec.ts
  modified:
    - server/ingest.ts
    - dev-server/ingest-middleware.ts
    - tests/unit/server/epub-fixtures.ts
    - tests/unit/server/epub-to-books.spec.ts

key-decisions:
  - "publishedAt is NORMALIZED, not passed through: Provenance.publishedAt is .datetime()-refined while BookSchema.publishedDate intentionally keeps the raw OPF dc:date string — a literal '2026-01-01' pass-through would fail ArticleSchema.parse on every dated fixture and defeat the plan's own pinned happy path. toIsoDatetimeOrNull carries the date only when Date parses it (date-only → midnight-UTC ISO); unparseable strings omit the field (tolerant, never a refusal)"
  - "Every persisted hash carries the 'sha256:' prefix (chapter originalHtmlHash and the book's originalFileHash) — the adapter returns bare hex, but every other persisted hash field in lem-reader is prefixed; uniform representation chosen over the plan's literal bare-hex pass-through (BookSchema.originalFileHash is z.string(); both forms parse)"
  - "The middleware post-read reason selection = parsed-body-key ?? URL-hint ?? pdf-too-large: the body key is the honest discriminator when the body IS parseable; the hint fallback keeps the pinned 11-03 non-JSON over-cap behavior byte-identical ('A'-chunk → pdf-too-large) while giving a chunked unparseable epub upload the correct copy"
  - "The over-cap orchestrator proof uses EPUB_MAX_BYTES+1 zero bytes (the pinned 11-03 guard-ordering pattern) instead of the plan's zip-padding routes — the typed epub-too-large (vs epub-unreadable from the parser) proves the re-check fires BEFORE parsing; the plan itself offered the simpler route when zip-padding is fragile"
  - "anchorGateFailBook ships ONE good chapter + ONE hostile chapter (the plan's description was a single readerable-looking chapter): a lone hostile chapter would zero-admit → epub-empty, and the pinned disclosure outcome is an ok envelope with skippedCount 1"
  - "isReaderable:true is passed to deriveConfidence per chapter — the adapter's D12-10 admission already established readerability (the draft would not exist otherwise); the 'unsupported' branch stays wired for honesty but is unreachable through this path"
  - "ING-05 stays unchecked — this plan proves the chain at unit/orchestrator level; the requirement closes at the end-to-end plans (12-05+), continuing the 04-02 PAGE-01 / 09-01 PORT-01 / 10-01 RECV-01 / 12-01/02/03 split precedent"

patterns-established:
  - "Fifth-branch divergence pattern: a multi-article Stage-1 format earns a dedicated early-return flow inside the shared try (its refusals still serialize through the ONE catch envelope) so the single-article stages stay byte-stable for every prior format"
  - "Prose-uniqueness contract for mergeable synthetic fixtures (see tech-stack patterns) — future fixture authors must respect the 84-grapheme threshold"

requirements-completed: []  # ING-05 closes at 12-05+ (the established phase split precedent; see key-decisions)

# Metrics
duration: 20 min
completed: 2026-08-18
status: complete
---

# Phase 12 Plan 04: EPUB Orchestrator Wiring Summary

**The fifth Stage-1 branch: ingest({epub}) decodes, cap-re-checks, and runs epubToBooks, then drives each ChapterDraft through the UNCHANGED parse → per-chapter anchor gate → confidence stages with skip-and-disclose accounting, deterministically-id'd chapters (epub-<hash> / -cNN), BookSchema-validated book envelopes, and format-aware middleware 413 copy — proven by a 25-test integration round-trip gate over the synthetic corpus**

## Performance

- **Duration:** 20 min
- **Started:** 2026-08-18T15:32:21Z
- **Completed:** 2026-08-18T15:52:49Z
- **Tasks:** 2
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments

- **Fifth Stage-1 branch (Task 1)**: `ingestEpubBook` in server/ingest.ts — base64 decode → decoded `EPUB_MAX_BYTES` re-check (third enforcement layer, `epub-too-large`) → `epubToBooks` → identity (`epub-<shortHash(b64)>` book, admitted-order zero-padded `-cNN` chapter ids — Pitfall 10: skipped chapters never renumber) → per-chapter loop running ArticleSchema.parse → assertRoundTripAnchor (the SAME imported SC#4 gate — no fork) → deriveConfidence → stamp → BookSchema.parse on the assembled record → the `{ok, book, articles, skippedCount}` envelope 12-03's client wrapper consumes. The D11-09 EPUB analog (consumeDuplicatedTitle per chapter) applied; provenance carries the book's joined byline + normalized publishedAt + the chapter's TOC-derived title; ingestionMeta carries `epub-chapter`/`upload`/bookId/chapterIndex
- **Per-chapter honesty (D12-11)**: adapter admission skips seed the count; any per-chapter stage failure (parse/anchor/confidence) increments `skipped` and omits the chapter inside its own try/catch — never a whole-book failure; zero admitted chapters refuses `epub-empty`
- **Pitfall 2 middleware fix (Task 1)**: both 413 guards now select the reason — pre-read from the `?format=epub` query hint (copy-only; enforcement stays content-length-based), post-read from the parsed body key with the hint default — an over-cap EPUB never sees PDF copy; `MAX_INGEST_BODY_BYTES` stays the max()-derived import from server/limits (verified — no local re-derivation)
- **Integration round-trip gate (Task 2)**: 25 tests — happy path (4 chapters, `-c00..-c03` in order, per-article bookId/chapterIndex/source, OPF book fields, joined byline, consumed doubled title), determinism (identical ids across two ingests — the dedupe-refuse foundation), five TOC shapes (publisher-split merge proof, front-matter leading unit, degenerate descent, NCX, OEBPS + `fallbackUsed:false` corroboration), skip disclosure via BOTH paths (adapter-level `mixedAdmissionBook` + stage-level `anchorGateFailBook`), ten typed refusals (3× `epub-protected`, 6× `epub-unreadable`, `epub-empty`), the orchestrator cap guard-ordering proof, and five middleware 413 cells (both reason branches at both guards + historical fallback)
- **anchorGateFailBook fixture (Task 2)**: builder 21 — a good chapter plus a periodic separator-run chapter (`* * * …`) the D12-10 admission passes (real block mass) but whose normalized text cannot round-trip a TextQuoteSelector (every sample window occurs at N>1 offsets with identical periodic context → `ambiguous`), exercising the stage-level skip path end-to-end; stored marker + self-check discriminator added

## Task Commits

Each task was committed atomically:

1. **Task 1: Fifth Stage-1 branch + per-chapter stages 2+ + book assembly + middleware fix** — `e0c07fb` (feat)
2. **Task 2: Integration round-trip gate + mixedAdmission/anchorGateFail fixture** — `18734b6` (test)

## Files Created/Modified

- `server/ingest.ts` — the fifth Stage-1 branch: `ingestEpubBook` (per-chapter stages 2+ loop, skip/disclose accounting, book assembly + BookSchema.parse), `stripEpubExtension`, `toIsoDatetimeOrNull`, Stage-0 widened to five variants
- `dev-server/ingest-middleware.ts` — format-aware 413 reasons (`tooLargeReasonFromUrl`/`tooLargeReasonFromBody` + `refuseTooLarge(res, reason)`); two-guard structure otherwise byte-identical
- `tests/unit/server/epub-fixtures.ts` — `anchorGateFailBook` builder + self-check registration/discriminator; `chapterParagraphs` prose-uniqueness fix (Rule 1)
- `tests/unit/server/ingest-epub.spec.ts` — NEW: the 25-test integration round-trip gate (438 lines)
- `tests/unit/server/epub-to-books.spec.ts` — merge-order markers updated to the new per-document tokens (proof intent unchanged)

## Decisions Made

- See key-decisions above (publishedAt normalization; sha256: prefix uniformity; post-read reason fallback chain; zero-buffer cap proof; anchorGateFailBook two-chapter shape; isReaderable:true; ING-05 stays open per the phase split precedent).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Plan contradiction] OPF dc:date could not pass through to Provenance.publishedAt literally**
- **Found during:** Task 1 (implementing the per-chapter provenance assembly)
- **Issue:** The plan's literal `publishedAt: bookMeta.publishedDate ?? undefined` fails its own pinned happy path: Provenance.publishedAt is `.datetime()`-refined while the fixtures' OPF dates are bare `2026-01-01` — every dated chapter would throw at ArticleSchema.parse, be skipped by the per-chapter catch, and reduce validBookEpub3 to zero admits (epub-empty)
- **Fix:** `toIsoDatetimeOrNull` — Date-parsable strings normalize to full ISO datetimes (`2026-01-01` → `2026-01-01T00:00:00.000Z`, pinned by test); unparseable strings omit the field. The BOOK record keeps the raw dc:date string (BookSchema.publishedDate is intentionally not datetime-refined)
- **Files modified:** server/ingest.ts
- **Verification:** happy-path test asserts `publishedAt === "2026-01-01T00:00:00.000Z"` on all 4 chapters; full suite green
- **Committed in:** e0c07fb

**2. [Rule 1 - Bug] The 12-01 fixture prose made the D12-09 publisher-split merge un-admittable at the new per-chapter anchor gate**
- **Found during:** Task 2 (publisherSplitBook pinned at 3 articles returned 2 — the merged chapter was skipped)
- **Issue:** `chapterParagraphs` shared long identical prose runs across documents (every document's paragraphs 1–3 were near-identical). Within a single-document article that is harmless, but the merged ch1a+ch1b article contains the same 20-grapheme windows at N=2 offsets with identical ±32 context → `ambiguous` → the per-chapter anchor gate correctly refused the merged chapter. No gate ran at adapter level (12-02), so the hazard first surfaced here
- **Fix:** `chapterParagraphs` now interleaves a `Prose N.K` document token every ≤~64 graphemes (the ambiguity threshold is 84 = 32 prefix + 20 window + 32 suffix), keeping every cross-document shared run far below it; the 12-02 adapter spec's merge-order markers updated to the new tokens (`Prose 1.1` before `Prose 2.1`) — same proof, both documents present, spine order preserved
- **Files modified:** tests/unit/server/epub-fixtures.ts, tests/unit/server/epub-to-books.spec.ts
- **Verification:** publisherSplitBook → 3 articles with both documents' text (pinned); the full unit suite (including the 29 12-02 adapter tests) green
- **Committed in:** 18734b6

---

**Total deviations:** 2 auto-fixed (2 plan-contradiction/bug resolutions)
**Impact on plan:** Both reconcile the plan's pinned outcomes with its literal mechanics — outcomes never loosened (3-article merge, dated-chapter admission both proven). No scope creep.

## Issues Encountered

- vitest swallows `console.log` in this project's configuration — debugging was done through forced-assertion scratch specs (removed after use; never committed).

## Verification Evidence (plan-level)

- `npx vitest run tests/unit/server/ingest-epub.spec.ts` — **25/25 green**
- `npx vitest run tests/unit/server/ingest-pdf.spec.ts tests/unit/server/ingest-adapter.spec.ts` — **26/26 green** (no 7-stage regression for url/paste/markdown/pdf)
- `npx tsc --noEmit` — exit 0 (after both tasks)
- Server suite: 275 passed / 0 failed / 10 intentional skips
- **Full unit suite: 1063 passed / 0 failed / 10 intentional skips** (`npm run test:unit -- --run`) — 12-03's 1038 + this plan's 25
- Acceptance greps: `epubToBooks(new Uint8Array` ✓, `-c${String(i).padStart(2, "0")}` ✓, `skipped += 1` ×2 ✓, `IngestionError("epub-empty")` ✓, `BookSchema.parse` ✓, assertRoundTripAnchor unchanged (same export, called at ingestEpubBook L314 + single-article tail) ✓, middleware `format=epub` pre-read check + `"epub" in parsed` post-read branch ✓

## Threat Mitigation Proof (plan threat_model)

- T-12-09 (oversized upload): orchestrator decoded re-check throws `epub-too-large` — pinned by the zero-buffer guard-ordering test (zeros are not a zip; epub-unreadable would fire if the re-check were later)
- T-12-13 (book envelope forgery): `BookSchema.parse` on the assembled record before the boundary + every article through `ArticleSchema.parse` — pinned by the happy-path re-parse loop; client re-parse lands via 12-03's two-layer wrapper
- T-12-14 (per-chapter work amplification): adapter timeout race + chapter cap upstream; skip accounting bounds stage work — pinned by anchorGateFailBook (a hostile chapter costs bounded stage work, disclosed honestly)
- T-12-07 (DRM posture): refusal passes the typed reason through the existing catch envelope verbatim; zero orchestrator DRM code, zero marker bytes — pinned by the three epub-protected tests

## User Setup Required

None - no external service configuration required.

## Authentication Gates

None.

## Next Phase Readiness

- 12-05 (orchestrator e2e) can drive the real UI picker against the real middleware — the exact envelope `{ok, book, articles, skippedCount}` its client half (12-03) parses is now produced and pinned
- 12-06 (reader/library UX) consumes `listBooks`/`getBook` + the `bookId` grouping index; the D12-11 disclosure copy must reuse 12-03's byte-pinned "N chapters could not be read." phrasing
- The middleware format-aware reasons get re-asserted at e2e in 12-06 (per the plan's verification note)
- The prose-uniqueness contract is documented in the fixture generator for future builder authors

## Self-Check: PASSED

- Key files exist on disk (`[ -f ]`: tests/unit/server/ingest-epub.spec.ts created; server/ingest.ts, dev-server/ingest-middleware.ts, tests/unit/server/epub-fixtures.ts, tests/unit/server/epub-to-books.spec.ts modified)
- Commits `e0c07fb` + `18734b6` present in `git log`; zero file deletions
- All task acceptance criteria re-verified (greps + suite exits listed above)

---
*Phase: 12-epub-intake*
*Completed: 2026-08-18*
