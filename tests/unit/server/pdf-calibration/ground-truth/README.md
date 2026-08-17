# ground-truth/ — human-corrected block labels (D11-06)

One JSON file per **admitted-class** corpus PDF (single-column, borderline),
named `<corpus-filename>.json` — e.g. corpus file `report.pdf` →
`ground-truth/report.pdf.json`. Refused classes (scanned, multi-column) need
no labels: their bar half is classification correctness only.

## Label format

An ordered array of block labels, one per block the reader should see, in
reading order:

```json
[
  { "kind": "heading", "level": 2, "textPrefix": "Introduction" },
  { "kind": "paragraph", "textPrefix": "This paper studies calm reading interfaces" },
  { "kind": "heading", "level": 3, "textPrefix": "Method" },
  { "kind": "paragraph", "textPrefix": "We assembled a corpus of six articles" }
]
```

- `kind` — the semantic reading: `"heading"`, `"paragraph"`, `"footnote"`,
  `"table header"`, or `"table content"` (vocabulary widened at the 11-06
  calibration review — the human corrector's kinds are the truth).
  Matching maps onto the extractor's vocabulary via an equivalence class:
  **heading-where-heading**, and every body-text kind (paragraph, footnote,
  table header, table content) matches an extracted **paragraph** block —
  PDF footnotes and tables ARE body text in Phase 11 (pdfToBlocks Pattern
  1), so the metric discriminates the behavior the thresholds control
  (heading-vs-body), never that intentional scope decision. Unsupported
  figure regions are not labeled (they still cost the denominator).
- `level` — optional, headings only (1–6, informational). The extractor
  clamps outline depth to levels 2–6 (bodies start at h2 — one-h1 rule);
  the agreement metric matches on **kind** + prefix, never level.
- `textPrefix` — the first ~40 normalized characters of the block's text.
  Matching is case/whitespace-insensitive prefix fuzzy match with ±1
  boundary drift; `agreement = matched-kind / max(labels, blocks)`.

## Authoring + review flow

1. The agent drafts labels from a first extraction (`npm run calibrate:pdf`
   output blocks).
2. **The human corrects them** (~30–60 min for 6–10 PDFs — 11-RESEARCH OQ5):
   fix wrong kinds, missing/extra blocks, and prefixes that drifted.
3. Corrected labels commit beside the manifest; `pdf-evidence.json`
   agreement numbers derive against them.

Ground truth is the promotion bar's numerator of truth — a wrong label file
makes a tuned threshold set pass or fail for the wrong reason. When the
metric and your reading of the document disagree, trust your reading.
