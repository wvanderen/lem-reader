---
status: resolved
trigger: "UAT Test 2: uploading tests/fixtures/pdf/synthetic-outline.pdf is REFUSED with 'Couldn't reliably read this page' instead of being admitted with outline bookmarks coerced to structured h2/h3 headings"
created: 2026-08-17T14:20:00Z
updated: 2026-08-17T21:05:00Z
resolved_by: "11-07 (commit 6f8c655)"
---

## Current Focus

hypothesis: CONFIRMED — ingest() refuses the fixture with `extraction-unsupported` because pdfToBlocks returns isReaderable=false (textBearingPages=0: pages carry 6/4 real items, below scannedItemFloor=8, while above near-empty floors), and ingest's `!isReaderable` guard returns { ok:false, reason:"extraction-unsupported" } → mapReasonToCopy → "Couldn't reliably read this page." NOT an 11-06 regression; never worked through the full pipeline.
test: Empirical probe (temp vitest spec, safe paths only) ran ingest() + pdfToBlocks + classifyDocument on the real fixture bytes.
expecting: —
next_action: None — diagnosis complete. Hand off to plan-phase --gaps.

## Symptoms

expected: Uploading tests/fixtures/pdf/synthetic-outline.pdf in the app ADMITS the document with outline bookmarks coerced to structured h2/h3 headings (not one undifferentiated blob).
actual: Upload is REFUSED with "Couldn't reliably read this page".
errors: Refusal copy "Couldn't reliably read this page." is produced by mapReasonToCopy for THREE enum members: `extraction-unsupported`, `extraction-too-low-confidence`, `round-trip-anchor-failed`. The actual reason here (empirically) is `extraction-unsupported` (from ingest() L329 `!isReaderable` guard). NOTE: the issue brief's premise that the copy "maps to a pdf-* typed refusal reason" was incorrect — every pdf-* reason has its OWN distinct copy; pdf-scanned's copy is "This PDF looks like scanned images rather than text…".
reproduction: Upload the fixture via the app's file picker (UAT Test 2), or call `ingest({ pdf: base64(fixture), filename })` — returns { ok:false, reason:"extraction-unsupported" }.
started: Not a recent regression — the fixture has NEVER admitted through the full pipeline. The `!isReaderable → extraction-unsupported` guard landed in dcc8780 (Phase 7, 07-05); the PDF Stage-1 branch landed later in b198e7e (11-03). Surfaced only now because no automated test exercises the full pipeline on this fixture (coverage gap), and UAT is the first end-to-end manual pass.

## Eliminated

- hypothesis: 11-06 calibration (903bec3, b5fe525) raised scanned floors / changed weights → pdf-scanned refusal.
  evidence: Three independent refutations. (1) Copy mapping: `pdf-scanned` maps to "This PDF looks like scanned images rather than text. An OCR tool could convert it first." — NOT the observed copy. (2) Empirical classifyDocument verdict on the real fixture: {totalPages:2, textBearingPages:0, nearEmptyPages:0, scanned:false} — pages are 254/153 non-ws chars, far above nearEmptyCharFloor=15. (3) `git show d932c7b:server/pdfToBlocks.ts` proves scannedItemFloor=8, scannedCharFloor=40, nearEmptyItemFloor=3, nearEmptyCharFloor=15, and `isReaderable: blocks.length >= 3 && textBearingPages >= 1` were ALL identical BEFORE 11-06; the 11-06 diff added furniture/script-band/section-arm logic but did not touch the floors or isReaderable.
  timestamp: 2026-08-17T14:40:00Z
- hypothesis: 11-06 furniture stripping removes the isolated page titles ("Outlined Document"/"Second Section" are short, isolated first bands — furniture candidates).
  evidence: Furniture stripping requires bare-page-number shape OR digit-normalized repetition on ≥ furnitureRepeatPages (3) pages. Titles repeat once each (2-page doc), and are not bare page numbers. Probe's per-page real-item dump shows titles still present (6/4 items counted on stripped pages; classifyDocument verdict identical).
  timestamp: 2026-08-17T14:40:00Z
- hypothesis: pdf-multi-column misdetection.
  evidence: Empirical verdict multiColumn:false (single-column fixture geometry; no gutters).
  timestamp: 2026-08-17T14:40:00Z
- hypothesis: round-trip-anchor-failed (the other member of the same copy family).
  evidence: Refusal happens EARLIER in ingest() — the `!isReaderable` guard at L329 runs before ArticleSchema.parse/assertRoundTripAnchor; probe returned reason:"extraction-unsupported" directly.
  timestamp: 2026-08-17T14:40:00Z

## Evidence

- timestamp: 2026-08-17T14:22:00Z
  checked: src/ingestion/IngestControl.tsx mapReasonToCopy (L51-83)
  found: "Couldn't reliably read this page." is returned for `extraction-unsupported`, `extraction-too-low-confidence`, `round-trip-anchor-failed`. All pdf-* reasons have distinct copies (pdf-scanned → "This PDF looks like scanned images…"; pdf-unreadable → "This PDF couldn't be opened…").
  implication: The observed copy implicates the extraction-* family, NOT pdf-scanned. The issue brief's copy→pdf-* premise was wrong.
- timestamp: 2026-08-17T14:26:00Z
  checked: tests/fixtures/pdf/generate-synthetic-pdfs.ts outlineSpec()
  found: Fixture = 2 pages; each drawn line = one BT/ET block = one pdfjs text item. Page 1: title + 5 wrapped body lines; Page 2: title + 3 wrapped body lines.
  implication: Pages inherently carry few items; any per-page item floor near/above ~5 will classify them non-text-bearing.
- timestamp: 2026-08-17T14:30:00Z
  checked: server/pdfToBlocks.ts isReaderable (L1332) + ingest() guard (server/ingest.ts L329-331)
  found: `isReaderable: blocks.length >= 3 && textBearingPages >= 1`; ingest refuses `!isReaderable` with reason "extraction-unsupported" BEFORE parse/anchor/confidence stages.
  implication: textBearingPages=0 forces refusal regardless of assembled block quality.
- timestamp: 2026-08-17T14:38:00Z
  checked: Empirical probe (temp vitest spec; safe ingest/pdfToBlocks/classifyDocument paths) on real fixture bytes
  found: ingest → {ok:false, reason:"extraction-unsupported"} → copy "Couldn't reliably read this page." Adapter: blocks.length=5, isReaderable=false, blocks = [h2 "Outlined Document", paragraph, paragraph, h2 "Second Section", paragraph] — outline coercion WORKS at adapter level. Per-page: page1 realItems=6 nonWsChars=254; page2 realItems=4 nonWsChars=153. classifyDocument: {textBearingPages:0, nearEmptyPages:0, scanned:false, multiColumn:false}.
  implication: Root cause confirmed end-to-end; detection verdicts correct, blocks correct; ONLY the isReaderable conjunct `textBearingPages >= 1` fails (6<8, 4<8 items vs scannedItemFloor=8).
  note: Probe v1 initially got reason "pdf-unreadable" — artifact of my own raw getDocumentProxy diagnostic poisoning the shared pdfjs worker (DataCloneError on reused/transferred bytes), the exact caveat in the brief. Reordered probe (ingest first, fresh bytes per call) eliminated it. The app path (IngestControl → ingestPdf → edge function) is unaffected.
- timestamp: 2026-08-17T14:41:00Z
  checked: synthetic-single-column.pdf (the ADMITTING UAT fixture) per-page counts
  found: page1=9 items/386 chars, page2=7 items/288 chars, page3=4 items/248 chars → textBearingPages=1. Admits by exactly ONE item on ONE page (9 vs floor 8).
  implication: The `textBearingPages >= 1` conjunct is knife-edge fragile for synthetic fixtures; outline fixture (max 6 items/page) could never satisfy it.
- timestamp: 2026-08-17T14:43:00Z
  checked: git history (dcc8780 Phase 7 guard; b198e7e 11-03 pdf branch; d932c7b pre-11-06 thresholds; 903bec3+b5fe525 11-06 diffs)
  found: Guard predates PDF branch; floors + isReaderable formula unchanged by 11-06.
  implication: Latent bug since 11-03, not a calibration regression. 11-02-SUMMARY flagged the exact condition ("admits with zero text-bearing pages — harmless today (its blocks still assemble)") but verified only adapter-level behavior, missing that ingest() refuses !isReaderable.
- timestamp: 2026-08-17T14:44:00Z
  checked: Test coverage (tests/unit/server/pdf-to-blocks.spec.ts L120-124, L375-393; tests/unit/server/ingest-pdf.spec.ts; tests/e2e/pdf-intake.spec.ts)
  found: Unit "synthetic-outline.pdf resolves (admitted, not refused)" calls pdfToBlocks DIRECTLY — asserts only that it resolves with a blocks array; never asserts isReaderable, never runs ingest(). ingest-pdf.spec.ts runs full ingest() on single-column/corrupt/scanned/two-column ONLY. e2e pdf-intake.spec.ts uploads single-column/two-column/scanned/corrupt ONLY.
  implication: Coverage gap — no automated test could catch this; explains why it surfaced only at manual UAT.

## Resolution

root_cause: `ingest()` (server/ingest.ts L329-331) refuses the upload with `extraction-unsupported` because `pdfToBlocks` (server/pdfToBlocks.ts L1332) returns `isReaderable: blocks.length >= 3 && textBearingPages >= 1` = false: the fixture's pages carry 6 and 4 real text items (254/153 non-ws chars), below `PDF_THRESHOLDS.scannedItemFloor = 8`, so `classifyDocument` yields textBearingPages = 0 — while nearEmptyPages = 0 (chars ≫ nearEmptyCharFloor 15), so the pdf-scanned gate correctly does NOT fire. `mapReasonToCopy("extraction-unsupported")` renders "Couldn't reliably read this page." The document-level assembly itself is correct (5 blocks, outline bookmarks coerced to h2 "Outlined Document"/"Second Section"). NOT an 11-06 calibration regression — the guard (dcc8780, Phase 7) predates the PDF branch (b198e7e, 11-03) and the floors/isReaderable formula are unchanged since 11-02 (d932c7b); the fixture has never admitted through the full pipeline, and no automated test covers the full pipeline for it (coverage gap).
fix: (direction only — not applied) Either (A) relax the `textBearingPages >= 1` conjunct in pdfToBlocks' isReaderable (the scanned gate independently refuses majority-near-empty documents, so the conjunct double-guards; a middle-band allowance such as `|| nearEmptyPages === 0` would admit this class), or (B) lower scannedItemFloor — but it is a corpus-calibrated value (also the multiColumn denominator) and must be re-validated against the 11-06 calibration harness. Plus: add full-pipeline regression tests (ingest() on synthetic-outline.pdf → ok:true with h2 headings; e2e upload coverage).
verification: N/A (diagnose-only mode). Empirical reproduction captured via probe: ingest({pdf}) → {ok:false, reason:"extraction-unsupported"}; adapter → 5 blocks, isReaderable=false; classifyDocument → textBearingPages 0, nearEmptyPages 0.
files_changed: []
