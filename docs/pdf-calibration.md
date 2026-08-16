# PDF Calibration — threshold tuning against real PDFs (SC#4b, D11-04/05/06)

The font-size→heading and vertical-gap→paragraph thresholds (and every
detection number in `server/pdfToBlocks.ts`'s `PDF_THRESHOLDS`) are
calibrated against **real PDFs** before promotion. This document is the
workflow contract: how evidence is derived locally and replayed in CI.

## Why real PDFs stay local (the accepted limitation)

Real articles carry licensing and size constraints, so the corpus lives in
`corpus/pdf/` — **gitignored** (D11-04). What commits is the **derived
evidence** only:

- `tests/unit/server/pdf-calibration/manifest.json` — corpus file list +
  SHA-256 integrity hashes + expected class + producer
- `tests/unit/server/pdf-calibration/ground-truth/*.json` — human-corrected
  block labels for admitted-class PDFs
- `tests/unit/server/pdf-calibration/pdf-evidence.json` — the derived
  record: per-file verdicts, agreement numbers, and the exact
  `PDF_THRESHOLDS` snapshot that produced them

This mirrors the Phase 3 committed-`calibration/fingerprint.json`
discipline: a recorded artifact is the durable truth; the local corpus is
the re-derivation path. **CI cannot re-derive the numbers** — it replays the
committed record against the bar. That limitation was explicitly accepted
at phase planning.

## The promotion bar (D11-06)

`validateEvidence` (in `tests/unit/server/pdf-calibration/harness.ts`)
enforces, inside `npm run test` via the always-on `replay.spec.ts`:

1. **Classification correctness, every entry:** single-column and borderline
   PDFs → `admitted` (borderline — pull quotes/sidebars — is the D11-02
   admit-side tuning pressure); scanned → `refused:pdf-scanned`; multi-column
   → `refused:pdf-multi-column` (the specific reason — a scanned doc refused
   as multi-column is still a misclassification).
2. **Agreement ≥ 0.90, every admitted entry:** extracted structure vs
   ground-truth labels (`matched-kind / max(labels, blocks)`, ±1 boundary
   drift) AND `anchorRoundTrip: true` (the SC#4a selector round-trip gate
   passed on the real PDF inside `ingest`).
3. **No placeholders:** results non-empty (refuse-empty — the
   `fingerprint.compare.ts` exit-2 precedent), thresholds present, hashes
   agreeing with the manifest.

## Local derive workflow

1. **Place the corpus.** Put 6–10 real PDFs into `corpus/pdf/` spanning all
   four classes (see that directory's README for composition) with varied
   producers (Word, LaTeX, InDesign/print where available).
2. **Report the classification.** Tell the agent each filename → class (+
   producer if known). The agent computes SHA-256 values and authors
   `manifest.json`.
3. **Draft + correct ground truth.** The agent drafts labels from a first
   extraction; you correct them (see `ground-truth/README.md` for the
   format; ~30–60 min for the corpus).
4. **Derive.** `npm run calibrate:pdf` — env-gated
   (`PDF_CALIBRATION_DERIVE=1`) so CI never attempts the local-only derive.
   The derive verifies corpus presence + SHA-256 against the manifest
   (refuses on mismatch or absence), runs the real pipeline
   (`ingest({pdf})` → `pdfToBlocks` → the current `PDF_THRESHOLDS`),
   computes agreement, and writes `pdf-evidence.json`.
5. **Review + tune to bar.** If any file misclassifies or any admitted PDF
   lands below 0.90, adjust `PDF_THRESHOLDS` in `server/pdfToBlocks.ts` —
   balanced BOTH directions (D11-02: refuse multi-column, admit
   single-column; borderline is the pressure point) — confirm
   `npx vitest run tests/unit/server/pdf-to-blocks.spec.ts` stays green
   (synthetic extreme cases must never flip), and re-derive.
6. **Commit derived evidence only** — manifest, ground truth,
   `pdf-evidence.json`, and any `PDF_THRESHOLDS` change. Never the PDFs.

## CI replay contract

- `replay.spec.ts` runs in the normal vitest `server` project (always-on,
  part of `npm run test`). It loads the committed `manifest.json` +
  `pdf-evidence.json` and runs `validateEvidence` — a regressed threshold
  set, a drifted hash, or a below-bar agreement fails the build.
- **Missing record fails loudly:** if `pdf-evidence.json` is absent the
  spec fails with *"calibration requires the local corpus — see
  docs/pdf-calibration.md"* — never a silent skip (T-11-15).
- `derive.spec.ts` is the LOCAL-only derive driver, gated by
  `describe.skipIf(process.env.PDF_CALIBRATION_DERIVE !== "1")` — the one
  documented, visible skip in normal runs (the accepted D11-04 CI
  limitation). It runs the corpus verification, the derive, the
  refuse-empty write guard, and the committed write.
- The derive rides vitest (not plain `node`) because vitest owns the repo's
  TS module resolution; exit semantics map to spec pass/fail — "exit 2"-class
  refusals (missing corpus, tampered SHA-256, empty results) are failing
  assertions inside the spec.
