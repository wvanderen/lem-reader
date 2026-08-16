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

- `kind` — `"heading"` or `"paragraph"` (the labeled structure; unsupported
  figure regions are not labeled).
- `level` — optional, headings only (2–6). Informational for review; the
  agreement metric matches on **kind** (heading-where-heading,
  paragraph-where-paragraph).
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
