---
phase: 11-pdf-intake
plan: 03
subsystem: ingestion
tags: [pdf, orchestrator, fourth-branch, title-chain, doubled-title, body-cap, 413, round-trip-gate, tdd]

# Dependency graph
requires:
  - phase: 07-url-ingestion
    provides: the staged orchestrator + IngestionError typed-refusal catch + assertRoundTripAnchor (SC#1 gate)
  - phase: 08-markdown-library
    provides: the markdown Stage-1 branch precedent (D8-17 title chain shape, D8-18 md-<hash> id, stripMarkdownExtension)
  - phase: 11-pdf-intake (11-01)
    provides: unpdf@1.8.1 pin, PDF_MAX_BYTES/MAX_INGEST_BODY_BYTES caps, synthetic fixture corpus
  - phase: 11-pdf-intake (11-02)
    provides: pdfToBlocks adapter (five-field contract, typed refusals, saneInfoTitle)
provides:
  - The fourth Stage-1 branch — ingest({pdf, filename}) produces pdf-<shortHash(b64)>-id articles through the UNCHANGED stages 2+ (ArticleSchema.parse → assertRoundTripAnchor → deriveConfidence → stamp)
  - D11-07 title chain in the orchestrator — sane Info-title (adapter-side isSanePdfTitle) ?? stripPdfExtension(filename) ?? "PDF document"
  - D11-09 consumeDuplicatedTitle — leading-heading fuzzy match against the final title, pdf-path-only, one-h1-per-page discipline preserved
  - Decoded PDF_MAX_BYTES re-check on the pdf path (third enforcement layer) refusing pdf-too-large BEFORE parsing
  - Pre-read content-length + post-read raw-length body caps (413 pdf-too-large) in the Vite ingest middleware (Pitfall 7 / T-11-02)
  - tests/unit/server/ingest-pdf.spec.ts — 20-test fourth-branch integration suite incl. SC#4a round-trip re-proof
affects: [11-pdf-intake (11-05 browser e2e, 11-06 calibration harness)]

# Tech tracking
tech-stack:
  added: []  # no new dependencies — composes 11-01 caps + 11-02 adapter
  patterns:
    - "Middleware cap guards return the typed IngestionResponse envelope with HTTP 413 (not 400) — transport-size refusals are distinguishable from parse refusals"
    - "pulled-flag Readable stub proves a guard fired BEFORE body accumulation (flowing mode never started — Pitfall 7 not-read proof)"
    - "Title-match normalization treats hyphens/underscores as whitespace — the filename channel slugifies spaces, so 'calm-report.pdf' ↔ heading 'Calm Report' must match"

key-files:
  created:
    - tests/unit/server/ingest-pdf.spec.ts
  modified:
    - server/ingest.ts
    - dev-server/ingest-middleware.ts

key-decisions:
  - "D11-09 title-match normalization collapses [-_\\s]+ uniformly — hyphens in filenames are spaces in titles; without this the canonical filename-channel doubled-title case never matches"
  - "stripPdfExtension lives in server/ingest.ts (orchestrator-owned chain, mirroring stripMarkdownExtension's shape per 11-PATTERNS L129) and is exported for the unit table"
  - "Invalid content-length headers fall through to the post-read re-check instead of refusing — the second guard still bounds the body, so garbage headers cannot bypass the cap"
  - "ingest-pdf.spec.ts created fresh by this plan (no 11-01 sentinel predecessor — checker scope revision honored)"

patterns-established:
  - "Fourth-branch discipline: a new Stage-1 variant only supplies extract + id/title/metadata; stages 2+ are shared code, never forked (locked invariant held by the same destructuring block)"
  - "Byte-accurate body caps: content-length pre-read + Buffer.byteLength(raw) post-read against ONE constant (MAX_INGEST_BODY_BYTES)"

requirements-completed: []  # ING-04 closes at the end-to-end plans (11-05 e2e + 11-06 calibration) — 04-02 PAGE-01 split precedent

# Metrics
duration: 10min
completed: 2026-08-16
status: complete
---

# Phase 11 Plan 03: PDF Fourth Branch + Orchestrator Integration Summary

**The pdf Stage-1 branch wired into the orchestrator (pdf-<hash> ids, D11-07 title chain, D11-09 doubled-title consume) with a decoded-size re-check and 413-typed middleware body caps, proven by a 20-test integration suite including the SC#4a round-trip anchor re-proof.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-16T23:06:30Z
- **Completed:** 2026-08-16T23:16:47Z
- **Tasks:** 2/2 (both TDD: RED → GREEN per task)
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- **Fourth Stage-1 branch** — `ingest({ pdf, filename })` decodes base64, re-checks the decoded length against `PDF_MAX_BYTES` (the third enforcement layer after the client picker and the content-length guard) BEFORE any parsing, calls `pdfToBlocks` over a `Uint8Array` view, and derives `id = pdf-<shortHash(b64)>` — identical bytes always produce identical ids regardless of filename (D7-07 save-once substrate, content-hash mirroring D8-18).
- **D11-07 title chain** — `provenancePartial.title` (set by the adapter ONLY when `isSanePdfTitle` passed — checked-Info is PRIMARY) ?? `stripPdfExtension(filename)` ?? `"PDF document"`. The url/paste/markdown chains are byte-unchanged.
- **D11-09 consume** — `consumeDuplicatedTitle(blocks, title)` drops a leading heading whose normalized text fuzzy-matches the final title (case/whitespace-insensitive containment, either direction); applied pdf-path-only after title resolution. The body never repeats the provenance-rendered title.
- **Locked invariant held** — stages 2+ (`ArticleSchema.parse` → `assertRoundTripAnchor` → `deriveConfidence` → stamp) run on the SAME code for all four branches; the plan's key_link greps (`pdfToBlocks`, `MAX_INGEST_BODY_BYTES`, `assertRoundTripAnchor`) all verified.
- **Middleware body caps (Pitfall 7 / T-11-02)** — content-length over `MAX_INGEST_BODY_BYTES` refused 413 `pdf-too-large` BEFORE `readBody` attaches a data listener (the pulled-flag test proves flowing mode never started); chunked requests re-checked by byte length after readBody; under-cap bodies delegate through `handleIngestBody` unchanged (locked base64-in-JSON transport decision).
- **Verification** — `npx vitest run tests/unit/server/ingest-pdf.spec.ts` → 20/20; full unit suite → 936 passed / 0 failed / 7 intentional skips; `npx tsc --noEmit` → exit 0; eslint clean on all three touched files.

## Task Commits

Each task followed TDD (RED test commit → GREEN implementation commit):

1. **Task 1: Fourth Stage-1 branch + title chain + doubled-title consume** — `c1201a0` (test, RED) + `b198e7e` (feat, GREEN)
2. **Task 2: Middleware body cap + integration suite** — `9084255` (test, RED) + `d6612d8` (feat, GREEN)

**Plan metadata:** this commit (docs: complete plan).

## Files Created/Modified

- `server/ingest.ts` — Stage 0 counts four variants; the pdf branch (decoded re-check, five-field destructure, `pdf-<shortHash(b64)>` id, `pdfFilenameHint`); the D11-07 chain in the title fallback; `stripPdfExtension` + `consumeDuplicatedTitle` exported pure helpers; the consume applied before assembly
- `dev-server/ingest-middleware.ts` — `refuseTooLarge` helper + both cap guards (content-length pre-read, post-read raw byte-length); route-match/response pattern otherwise unchanged
- `tests/unit/server/ingest-pdf.spec.ts` (361 lines) — 20 tests: happy path (id/source/origin/title/confidence/blocks), neutral title fallback, id stability, four typed refusals (incl. guard-ordering proof: oversized zeros → `pdf-too-large` not `pdf-unreadable`), consumeDuplicatedTitle table, stripPdfExtension table, SC#4a round-trip re-proof, four middleware tests (both cap paths + delegate + fall-through)

## Decisions Made

- **Hyphen/underscore-aware title matching.** The first GREEN run failed the canonical filename-channel case (`calm-report.pdf` ↔ heading `Calm   Report`): filenames slugify spaces to hyphens, so whitespace-only normalization never matches the exact case D11-09's filename fallback creates. `normalizeForTitleMatch` collapses `[-_\s]+` uniformly on both sides (documented as a Rule 2 deviation below).
- **Invalid content-length falls through.** A garbage header value cannot bypass the cap — the post-read re-check still bounds the body — while a valid over-cap number is refused without reading.
- **`stripPdfExtension` exported from `server/ingest.ts`** (not markdownToBlocks-style sibling placement) — the chain is orchestrator-owned per 11-PATTERNS L129; export enables the direct unit table.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Hyphen/underscore-aware D11-09 title normalization**
- **Found during:** Task 1 (GREEN run)
- **Issue:** The plan's "case/whitespace-insensitive containment" reading misses the canonical filename-channel doubled-title case — `calm-report.pdf` (title `calm-report`) vs a page-1 heading `Calm Report`. Filenames slugify spaces to hyphens, so without separator-uniform normalization the consume never fires for exactly the channel the filename fallback creates.
- **Fix:** `normalizeForTitleMatch` collapses `[-_\s]+` to a single space on both sides; empty normalized strings never match (an empty heading cannot fuzzy-match every title).
- **Files modified:** server/ingest.ts
- **Verification:** consumeDuplicatedTitle table 5/5 green, including the hyphen case.
- **Committed in:** b198e7e (Task 1 GREEN)

**2. [Rule 1 - Test bug] Response stub did not mirror Node's setHeader semantics**
- **Found during:** Task 2 (GREEN run)
- **Issue:** The 413 + envelope assertions passed but the content-type assertion failed — Node's `ServerResponse.setHeader` stores header names lowercase; the stub stored `"Content-Type"` verbatim while assertions read `"content-type"`.
- **Fix:** Stub lowercases names on store.
- **Files modified:** tests/unit/server/ingest-pdf.spec.ts
- **Verification:** 20/20 green.
- **Committed in:** d6612d8 (Task 2 GREEN)

**3. [Rule 3 - Blocking] Type fixes surfaced by transitively checking the middleware**
- **Found during:** Task 2 (tsc gate)
- **Issue:** The suite's new import of `dev-server/ingest-middleware.ts` pulls the file into the main tsconfig program (include: src, tests — the import graph reaches it) for the first time, surfacing two errors under its stricter flags: `Connect.ServerResponse` does not exist in vite's Connect namespace (the response type is `http.ServerResponse`), and the pre-existing `url.split("?")[0].endsWith(...)` is possibly-undefined under `noUncheckedIndexedAccess`.
- **Fix:** `import type { ServerResponse } from "node:http"` in both files; `const path = url.split("?")[0] ?? url;` guard.
- **Files modified:** dev-server/ingest-middleware.ts, tests/unit/server/ingest-pdf.spec.ts
- **Verification:** `npx tsc --noEmit` exit 0; full unit suite green.
- **Committed in:** d6612d8 (Task 2 GREEN)

---

**Total deviations:** 3 auto-fixed (1 missing critical, 1 test bug, 1 blocking)
**Impact on plan:** All three were correctness requirements of the planned work (the consume's real-world case, honest test semantics, type safety under the project's strict flags). No scope creep; the locked stages-2+ invariant and the transport decision are untouched.

## TDD Gate Compliance

Both tasks carried `tdd="true"` and produced the full gate sequence in git log:

| Task | RED (test) | GREEN (feat) | Status |
|------|-----------|--------------|--------|
| 1 | c1201a0 | b198e7e | Pass |
| 2 | 9084255 | d6612d8 | Pass |

Task 1 RED failed 12/12 for the right reason (`consumeDuplicatedTitle is not a function` — the export/branch absent). Task 2 RED failed exactly the 2 cap tests (400 server-error instead of 413 typed envelope) while the 18 pre-existing tests stayed green. No REFACTOR commit — both GREEN implementations landed clean.

## Issues Encountered

None beyond the auto-fixed deviations.

## Authentication Gates

None.

## Known Stubs

None. Every shipped surface is real and exercised through the real orchestrator (`ingest()`), the real adapter (`pdfToBlocks` over real pdf.js extraction), and the real middleware handler (captured from a fake `ViteDevServer.middlewares.use`).

## Threat Flags

None beyond the plan's own threat model. All four registered mitigations are implemented and unit-proven: T-11-02 (both cap paths 413 before pipeline work), T-11-10 (id stability unit-asserted across filenames), T-11-11 (typed refusals serialize verbatim through the existing catch), T-11-12 (consumeDuplicatedTitle fuzzy-match table).

## User Setup Required

None.

## Next Phase Readiness

- **Ready for 11-05** (browser e2e): the full client→middleware→orchestrator→adapter path is now wired end-to-end; the synthetic fixtures at `tests/fixtures/pdf/` exercise upload, admission, and every refusal class; `waitForURL(/#\/article\/pdf-/)` will observe real ids.
- **Ready for 11-06** (calibration): the orchestrator consumes `pdfToBlocks` outputs unchanged — threshold tuning stays entirely inside the 11-02 adapter surface (`PDF_THRESHOLDS`).
- **Notes for later plans:** (a) The middleware cap is enforced in the Vite dev middleware only — `functions/api/ingest.ts` (the production-future Pages Function shape) does not read bodies via this middleware and would need its own cap when that runtime is revisited (out of Phase 11 scope per the 07-01 HYBRID CONTINGENCY). (b) An encrypted-PDF refusal still has no fixture (11-02 note) — the e2e proof should rely on the unit lock or extend the generator.

## Self-Check: PASSED

7/7 verified — all 3 touched files exist on disk; all 4 task commits (c1201a0, b198e7e, 9084255, d6612d8) present in git log; plan verification re-run green (20/20 spec, tsc exit 0, full unit suite 936/0/7); must_haves artifact greps confirmed (`pdf-${shortHash` in ingest.ts, `MAX_INGEST_BODY_BYTES` in the middleware, spec ≥150 lines at 361).

---
*Phase: 11-pdf-intake*
*Completed: 2026-08-16*
