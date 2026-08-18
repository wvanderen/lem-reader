# Phase 12 — Deferred Items (out-of-scope discoveries, logged per the scope-boundary rule)

## 12-08 (EPUB calibration) — real-corpus findings outside this plan's scope

1. **Anchor-gate allocation churn on whole-novel chapters (default-heap OOM).**
   `assertRoundTripAnchor` + `ArticleSchema.parse` over Buddenbrooks' single
   3290-block (~700k-grapheme) chapter drive several GB of transient
   allocation (`graphemeClusters` re-computed per sample × per
   derive/resolve call; `findAllOccurrences` slices+joins per candidate
   position — src/annotations/resolution.ts). The default ~4GB Node heap
   OOMs; the corpus derive completes in ~90s with
   `--max-old-space-size=8192` (now baked into `npm run calibrate:epub`).
   Exposure: a reader uploading a real novel through the local dev
   middleware could OOM it. Prior articles (PDF corpus included) were ≤8×
   smaller, so this never surfaced before. Fix path: memoize
   normalizeText/graphemeClusters per-article inside the gate (the 09-03
   MemoizedArticleText precedent) and make `findAllOccurrences` allocation-
   linear; NOT fixed here — substrate change beyond 12-08's calibration
   scope, synthetic suites + e2e unaffected.

2. **Per-chapter stage loop has no timeout.** `withEpubTimeout` (30s) wraps
   `epubToBooks` (Stage 1) only; `ingestEpubBook`'s per-chapter
   parse/anchor/confidence loop (server/ingest.ts) is unbounded — the
   Buddenbrooks derive spent ~40s in stages 2+ alone. A hostile book sized
   under EPUB_MAX_CHAPTERS could grind the middleware well past any
   request budget. Fix path: race the whole `ingestEpubBook` body against
   EPUB_EXTRACTION_TIMEOUT_MS (T-12-14's stated intent); NOT fixed here —
   production-behavior change beyond the calibration plan, logged for
   phase review.

3. **Reader-manufactured anchor ambiguity from identical unsupported-block
   fallback text.** Two relative-src images in one chapter downgrade to the
   SAME synthetic `plainDescription` ("An image whose source could not be
   normalized to a valid URL."), so the article's opening text repeats and
   the offset-0 anchor sample resolves `ambiguous` (observed:
   accessible_epub_3's admitted-at-floor front-matter unit skipped per
   D12-11). Honest per the ANNO-07 contract, but the repetition is the
   reader's own fallback string, not book content. Fix path (if ever
   needed): make unsupported-image descriptions per-block unique or exclude
   synthetic descriptions from the anchor-substrate sampling; NOT fixed —
   the skip is disclosed and the behavior is contract-consistent.
