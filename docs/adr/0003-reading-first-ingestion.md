# Reading-first ingestion: admit readable text, disclose limits

Web-article ingestion refused at the article level whenever anything was imperfect: Mozilla's `isProbablyReaderable` heuristic vetoed the page before extraction, and the round-trip anchor gate (`assertRoundTripAnchor`) refused any article where one of five 20-character sample quotes resolved as ambiguous. A production case (marxist.com, "Trotsky's struggle to rejuvenate the Bolshevik party" — 84 clean blocks, confidence "high", refused because the opening phrase "After Lenin had been" appears twice) proved the gates block exactly the reader the product is for: someone who wants the text. We decided that readable text is never refused: extraction is always attempted; the anchor gate and the readability signal become inputs to *flags*, not vetoes; only zero extracted text, unreachable/unsafe endpoints, and formats with nothing honest to show (scanned PDFs, DRM, multi-column) remain refusals.

Limits are disclosed in place, never silent: `annotationsDegraded` (ambiguous anchor samples — highlights may be unreliable; orphan samples still refuse, as a normalization-bug canary), a count-first `extractionWarning` whenever unsupported blocks are present, and one note region at the top of the reading view carrying the low-confidence sentence, "Some content could not be processed. See the original." (linked to `provenance.sourceUrl` when it exists), and the warnings. EPUB chapters follow the same split: anchor-ambiguous chapters are admitted flagged, chapters that fail parse or the orphan canary are still skipped and counted.

## Considered Options

- Relaxing the anchor gate's threshold (refuse only when ≥3 of 5 samples fail) — rejected: keeps refusing some readable articles; the flag is honest at any threshold.
- Deleting the anchor gate — rejected: the orphan arm is a real bug canary for derive/resolve asymmetry.
- Folding annotation degradation into `extractionWarnings` strings — rejected: extraction fidelity and annotation fidelity are different concepts and will diverge.

## Consequences

- The confidence catalog loses the `unsupported` state (collapses into `low`) and the never-emitted `extraction-too-low-confidence` reason is removed from the failure catalog.
- The v2.0 "no silent garbage" honesty principle is reworded, not abandoned: the no-garbage guarantee moves from the ingest gate to the visible note. Copy is byte-pinned by tests, as before.
