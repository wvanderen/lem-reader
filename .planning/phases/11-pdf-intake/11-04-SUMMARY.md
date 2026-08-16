---
phase: 11-pdf-intake
plan: 04
subsystem: ingestion
tags: [pdf, base64, upload, client, calm-copy, bundle-boundary, tdd]

# Dependency graph
requires:
  - phase: 11-pdf-intake (11-01)
    provides: PDF_MAX_BYTES shared constant in src/ingestion/types.ts + widened IngestionRequestSchema pdf variant + refusal enum
  - phase: 07-url-ingestion
    provides: IngestionClient shared ingest() pipeline + IngestControl .status live-region surface + mapReasonToCopy pattern
  - phase: 08-markdown-library
    provides: file-upload dispatch precedent (handleFileSubmit, T-8-14 client cap, D8-17 filename channel)
provides:
  - ingestPdf(pdfBase64, filename?) client wrapper delegating to the single shared ingest pipeline
  - .pdf picker arm — accept=".md,.html,.pdf", meta copy, extension-aware PDF_MAX_BYTES client cap BEFORE any read
  - bytesToBase64 chunked (0x8000) binary→base64 helper safe for multi-MB files
  - mapReasonToCopy exported with the five EXACT Pattern-7 calm DOC-06 strings
  - tests/unit/pdf-copy.test.ts exact-string + no-jargon (T-11-04) guard
affects: [11-pdf-intake (11-05 client e2e proof, 11-06 calibration)]

# Tech tracking
tech-stack:
  added: []  # no new dependencies — pure client extension
  patterns:
    - "Extension-aware client cap branches on /\\.pdf$/i BEFORE any file read (Pitfall 7 — refused files never reach file.text()/arrayBuffer(), zero network cost)"
    - "Chunked String.fromCharCode spread + btoa in 0x8000-element slices avoids the spread call-stack limit on multi-MB binaries"
    - "Copy tables are byte-pinned in tests (em dashes included) — DOC-06 calm voice cannot silently drift through refactor"

key-files:
  created:
    - tests/unit/pdf-copy.test.ts
  modified:
    - src/ingestion/IngestionClient.ts
    - src/ingestion/IngestControl.tsx
    - tests/unit/ingestion-client.test.ts

key-decisions:
  - "No REFACTOR commit — the ingestPdf implementation is already the minimal mirror of the ingestMarkdown sibling (3-line wrapper + union widening); nothing to clean"
  - "mapReasonToCopy exported from IngestControl.tsx (not moved to a helper module) so the exact-string test pins the copy AT its live surface; direct .tsx import is safe in the jsdom unit project because Dexie opens lazily and the copy path never touches it"
  - "Client cap refuses before ANY read — a 15MB .pdf pick never materializes an ArrayBuffer, let alone a POST (T-11-02 mitigation at the earliest enforcement point)"
  - "The no-jargon guard iterates ALL 16 cataloged reasons (not just the five PDF ones), extending T-7-26 to the widened enum"

patterns-established:
  - "Binary upload arms read file.arrayBuffer() → chunked base64 → JSON envelope; text arms keep file.text()"
  - "Exact-copy tests import the map function from the component module — copy lives with its chrome, tests live in tests/unit/"

requirements-completed: []  # ING-04 closes at the end-to-end plans (11-05 e2e + 11-06 calibration) — 04-02 PAGE-01 split precedent

# Metrics
duration: 3min
completed: 2026-08-16
status: complete
---

# Phase 11 Plan 04: Client PDF Upload Path Summary

**ingestPdf wrapper + .pdf picker arm with extension-aware PDF_MAX_BYTES refusal before any read, chunked base64 encoding, and the five Pattern-7 calm DOC-06 refusal strings — exact-byte tested, with the client bundle proven free of pdfjs code.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-08-16T23:01:19Z
- **Completed:** 2026-08-16T23:04:12Z
- **Tasks:** 2/2 (Task 1 TDD: RED → GREEN; no refactor needed)
- **Files modified:** 4 (3 modified, 1 created)

## Accomplishments

- **ingestPdf(pdfBase64, filename?)** posts the exact `{pdf, filename}` envelope through the single shared `ingest()` pipeline — JSON parse, typed-refusal throw, `res.ok` guard, and STATE-04 `ArticleSchema.parse` re-validation reused unchanged (no fork). RED→GREEN TDD: both new tests failed with `ingestPdf is not a function` before implementation, 13/13 green after.
- **Extension-aware client cap**: `/\.pdf$/i` picks PDF_MAX_BYTES (imported from `./types`) with the calm `pdf-too-large` copy; `.md/.html` keep the existing 5MB + `response-too-large` branch. Refusal happens BEFORE any read — an over-cap pick costs zero reads and zero network (Pitfall 7).
- **Binary dispatch arm**: `file.arrayBuffer()` → `bytesToBase64` (0x8000-element chunks, `String.fromCharCode` spread + `btoa`) → `await ingestPdf(b64, file.name)`. Dispatch order `.md → ingestMarkdown`, `.pdf → ingestPdf`, else `ingestHtml`; dedupe-refuse `has()` + save/navigation flow reused verbatim (identical bytes → `pdf-<hash>` id collision, D7-07 + D11).
- **Five calm copy entries** shipped with EXACT Pattern-7 strings (em dashes U+2014 included in pdf-unreadable + pdf-multi-column) and `mapReasonToCopy` exported; `tests/unit/pdf-copy.test.ts` pins every string byte-for-byte and guards ALL 16 reasons against jargon markers (no `Exception`, no `Error:`, no enum hyphenation like `pdf-` leaking into copy).
- **Bundle boundary proven (Pitfall 12)**: `npm run build` exit 0; `grep -r "InvalidPDFException" dist/` → no matches; zero `unpdf` imports under `src/` (one prose comment only).

## Task Commits

Each task was committed atomically:

1. **Task 1: ingestPdf client wrapper** — `ccf45b1` (test, RED) + `62d6590` (feat, GREEN)
2. **Task 2: Picker arm + size cap + base64 encode + calm copy** — `185ae77` (feat)

## Files Created/Modified

- `src/ingestion/IngestionClient.ts` — `ingestPdf` export + widened private body union with `{pdf, filename?}`
- `src/ingestion/IngestControl.tsx` — accept `.pdf`, meta copy, extension-aware cap, `bytesToBase64`, PDF dispatch arm, exported `mapReasonToCopy` with five PDF cases
- `tests/unit/ingestion-client.test.ts` — `ingestPdf` POST-body + typed-refusal (`pdf-scanned`) tests
- `tests/unit/pdf-copy.test.ts` — exact-string + no-jargon guard (three tests)

## Decisions Made

- No REFACTOR commit for the TDD task — the implementation is the minimal mirror of the `ingestMarkdown` sibling; there was nothing to clean without changing behavior.
- `mapReasonToCopy` stays in and is exported from `IngestControl.tsx` rather than moving to a helper module — the exact-string test pins the copy at its live surface, and the jsdom unit project imports the `.tsx` safely (Dexie opens lazily; the copy path never touches it).
- The no-jargon test covers all 16 cataloged reasons, not just the five new ones — widening T-7-26 to the widened enum.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Client upload path complete: picker → cap → base64 → POST → typed refusal → calm copy, all unit-proven.
- Ready for 11-05: end-to-end PDF upload proof in real browsers (fixtures at `tests/fixtures/pdf/` exercise the full client→middleware→adapter loop).
- Bundle boundary verified once; 11-05's e2e gate should re-assert it stays clean.

## Self-Check: PASSED

- tests/unit/pdf-copy.test.ts — FOUND
- .planning/phases/11-pdf-intake/11-04-SUMMARY.md — FOUND
- Commits ccf45b1 (test RED), 62d6590 (feat GREEN), 185ae77 (feat Task 2), c479413 (docs) — all FOUND in git log
- TDD gates: RED commit precedes GREEN commit for Task 1 ✓

---
*Phase: 11-pdf-intake*
*Completed: 2026-08-16*
