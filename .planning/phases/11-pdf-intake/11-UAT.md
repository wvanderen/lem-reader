---
status: complete
phase: 11-pdf-intake
source: [11-01-SUMMARY.md, 11-02-SUMMARY.md, 11-03-SUMMARY.md, 11-04-SUMMARY.md, 11-05-SUMMARY.md, 11-06-SUMMARY.md, 11-07-SUMMARY.md, 11-VERIFICATION.md]
started: 2026-08-17T19:12:20Z
updated: 2026-08-17T21:20:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Upload and read a single-column PDF
expected: Picker accepts .pdf; uploading a single-column text PDF (e.g. tests/fixtures/pdf/synthetic-single-column.pdf) navigates to #/article/pdf-<hash>, shows the filename-derived title, readable paginated body, and a "PDF" badge on the library row
result: pass

### 2. Outline PDF yields section headings
expected: Upload tests/fixtures/pdf/synthetic-outline.pdf; the resulting article shows structured section headings (outline bookmarks become h2/h3 headings) rather than one undifferentiated text blob
result: pass
note: re-tested after gap-closure Plan 11-07 (commit 6f8c655) — user confirmed structured headings render

### 3. Scanned PDF refused calmly with no side effects
expected: Upload tests/fixtures/pdf/synthetic-scanned.pdf; calm "looks like scanned images" copy appears in the .status live region (no jargon like "pdf-scanned"), URL stays on the library page, no PDF-badged library row is added
result: pass

### 4. Multi-column PDF refused calmly with no side effects
expected: Upload tests/fixtures/pdf/synthetic-two-column.pdf; calm "multiple text columns" copy appears in the status region, no navigation away from the library, no new row
result: pass

### 5. Corrupt PDF refused calmly with no side effects
expected: Upload tests/fixtures/pdf/synthetic-corrupt.pdf; calm "couldn't be opened" copy appears in the status region, no navigation, no new row
result: pass

### 6. Identical re-upload dedupes
expected: Re-upload the exact same PDF bytes as a previously admitted one; the status shows "Already in your library." and the library row count does not increase (no duplicate)
result: pass

### 7. Oversized PDF refused client-side before upload
expected: Pick a .pdf larger than 10MB (e.g. `mkfile 11m big.pdf`); refusal copy appears immediately in the status region (too-large message), no network request/ingest spinner — refusal happens before the file is read
result: pass

### 8. Highlight on a PDF article survives reload
expected: Open an admitted PDF article, select text, use the toolbar to create a highlight; reload the page fully; the highlight re-renders at the same text with the same identity (no lost/duplicated marks)
result: pass

### 9. Reading position restores on a PDF article
expected: Open an admitted PDF article, switch to scrolling mode (M shortcut), scroll down ~a screen, wait a moment; reload the page; the reading position restores near where you scrolled (not top-of-article)
result: pass

### 10. PDF extraction timeout (30s) fires calmly
expected: Hang or stall an extraction (pathologically complex PDF); after 30s a typed server-error envelope with the timeout message reaches the status region as calm copy; no worker/proxy leak — subsequent ingests still succeed
result: skipped
reason: no natural 30s fixture; user chose the skip over temp-lowering the cap. CORRECTION (11-VERIFICATION.md, post-11-07 cycle): the timeout race (timer rejects, timer cleared, destroy in finally) is wired in server/pdfToBlocks.ts but is NOT exercised by any test — the earlier "unit-covered in pdf-to-blocks.spec.ts" claim was factually incorrect. The behavior remains unverified; a fake-timers unit test would close it with zero production changes.

## Summary

total: 10
passed: 9
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps

- truth: "synthetic-outline.pdf admits with outline bookmarks coerced to structured h2/h3 headings"
  status: resolved
  reason: "Fixed by gap-closure Plan 11-07 (commit 6f8c655): isReaderable relaxed to blocks.length >= 3 && (textBearingPages >= 1 || nearEmptyPages === 0); PDF_THRESHOLDS byte-untouched (calibration replay pin green); three-level regression coverage added (adapter isReaderable + ingest full-pipeline + browser e2e × 3 engines, 24/24 green). Verifier mechanically confirmed the diff and re-ran suites. Test 2 awaiting manual re-test to flip."
  severity: major
  test: 2
  fixed_by: "11-07"
  fix_commit: "6f8c655"
  root_cause: "pdfToBlocks isReaderable (server/pdfToBlocks.ts L1332) required textBearingPages >= 1, but synthetic-outline.pdf's two pages carry 6/4 real text items — below scannedItemFloor=8 — so textBearingPages=0 while nearEmptyPages=0 (chars >> floor 15) and scanned:false. The orchestrator (server/ingest.ts L329-331) correctly refused extraction-unsupported; the fixture never admitted through the full pipeline (adapter-level test asserted blocks only, never isReaderable/ingest; e2e never uploaded the outline fixture)."
  missing:
    - "Relax the textBearingPages >= 1 conjunct (e.g. admit when blocks.length >= 3 && (textBearingPages >= 1 || nearEmptyPages === 0)); do NOT lower scannedItemFloor — it is a corpus-calibrated value and would require re-running the 11-06 calibration harness"
    - "Add full-pipeline regression test: ingest() on synthetic-outline.pdf -> ok:true with h2 outline headings"
    - "Add e2e upload coverage for synthetic-outline.pdf"
  debug_session: ".planning/debug/resolved/synthetic-outline-pdf-refusal.md"
