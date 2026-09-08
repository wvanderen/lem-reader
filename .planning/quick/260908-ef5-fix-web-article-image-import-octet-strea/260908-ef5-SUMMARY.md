---
phase: quick-260908-ef5
plan: 01
subsystem: ingestion
tags: [images, ssrf, srcset, ingestion, headers]
requires:
  - "D20-12 one-pipeline SSRF substrate (safeFetchCore profile seam)"
  - "D20-10 magic-byte sniff as sole image admission authority"
provides:
  - "admit-opaque content-type gate mode — octet-stream CDN images admit via the sniff"
  - "browser-like Accept + validated-article-origin Referer on image fetches"
  - "inline paragraph-image hoisting to FigureBlocks (honest, never silent)"
  - "srcset best-candidate selection (largest width ≤ 1600, density fallback)"
affects:
  - server/safeFetch.ts
  - server/fetchImageAsset.ts
  - server/assetStage.ts
  - server/ingest.ts
  - server/htmlToBlocks.ts
tech-stack:
  added: []
  patterns:
    - "SafeFetchProfile contentTypeGate (strict | admit-opaque) — parameterize, never fork"
    - "profile.headers merged after User-Agent — absent field keeps document profile byte-identical"
    - "pure never-throw srcset parser with URL-constructor http(s) resolution"
key-files:
  created: []
  modified:
    - server/safeFetch.ts
    - server/fetchImageAsset.ts
    - server/assetStage.ts
    - server/ingest.ts
    - server/htmlToBlocks.ts
    - tests/unit/server/safe-fetch.spec.ts
    - tests/unit/server/fetchImageAsset.spec.ts
    - tests/unit/server/assetStage.spec.ts
    - tests/unit/server/extraction.spec.ts
decisions:
  - "Sniff stays the sole admission authority (D20-10): only empty/application/octet-stream/binary/octet-stream are admitted past the gate — exhaustive membership, no catch-all; text/html challenge pages keep the early pre-read refusal under BOTH modes"
  - "Referer derives ONLY from the SSRF-validated article finalUrl origin (new URL(finalUrl).origin on the url path); paste/html-upload/markdown/pdf paths omit it — a request header, never a fetch target (T-EF5-02)"
  - "Paragraph-first hoisting: inline imgs become figures AFTER the paragraph, empty paragraph omitted, captions always empty (figcaption cannot nest in p → D-05 substrate + assertRoundTripAnchor provably unaffected); headings deliberately NOT hoisted"
  - "srcset width descriptors take precedence over density when mixed; largest width up to and including 1600, else largest overall; density-only picks smallest ≥ 1, else largest below 1; bare-URL = density 1"
  - "data-srcset deliberately NOT rescued — ALLOW_DATA_ATTR:false stays the load-bearing Pitfall 4 defense (Readability's pre-sanitize lazy-load swap handles data-src)"
metrics:
  duration: 10 min
  completed: 2026-09-08
  tasks: 3
  files: 9
status: complete
requirements: [IMG-01, IMG-02, ING-07]
---

# Quick Task 260908-ef5: Fix web-article image import Summary

**One-liner:** Web-article images now import through the one-pipeline SSRF substrate — octet-stream CDN responses admit via the magic-byte sniff, image fetches carry browser-like Accept plus a validated-article-origin Referer, inline paragraph images hoist to honest FigureBlocks, and srcset selects the best candidate instead of the placeholder src.

## What Was Built

All four repro-confirmed gaps closed, with the document fetch profile byte-identical throughout:

1. **Advisory content-type gate (Task 1, commit `a3ba402`)** — `SafeFetchProfile` gained `contentTypeGate: "strict" | "admit-opaque"` (absent = strict). The new `isOpaqueContentType` helper normalizes the declared header (pre-semicolon, trimmed, lowercased) and admits only the exhaustive set {empty, application/octet-stream, binary/octet-stream}; the existing substring test is kept as `substringAllowed` and the throw fires only when both arms fail. `IMAGE_FETCH_PROFILE` selects `admit-opaque` — S3/CDN/signed-URL images serving real bytes under opaque headers reach `sniffImageAsset`, which stays the sole admission authority (D20-10); an octet-stream-labeled HTML challenge page still refuses on its bytes (`"type"`).
2. **Accept + Referer on image fetches (Task 2, commit `758e1e0`)** — `SafeFetchProfile` gained an optional `headers` Record merged AFTER the User-Agent literal (absent field = exactly today's single-header shape). `IMAGE_FETCH_PROFILE` advertises the browser image Accept (svg+xml included — the sniff still refuses SVG bytes). `fetchImageAsset(url, { refererOrigin })` upgrades the per-call profile with a Referer only when a non-empty origin is threaded; `assetStage` forwards it (second argument `undefined` when absent); `ingest.ts` derives it from `new URL(finalUrl).origin` on the url path only. Redirect recursion threads the profile, so headers persist per hop.
3. **Inline-image hoisting + srcset selection (Task 3, commit `8e59fb4`)** — `srcset` joined `ALLOWED_ATTR` with a documented injection-surface analysis (parser-only consumption, URL-constructor resolution, httpUrl re-validation at parse; `ALLOW_DATA_ATTR:false` untouched). The pure never-throw `selectSrcsetCandidate` implements the width-then-density precedence rules with malformed parts skipped calmly; `figureBlock` lets the chosen candidate override src before the unchanged http(s) test/resolver logic. The `visit()` paragraph arm hoists every `el.querySelectorAll("img")` match to its own FigureBlock AFTER the paragraph (img-only paragraphs omit the empty paragraph; unresolvable inline imgs produce the same honest UnsupportedBlock as a bare top-level img — no silent drop, one admission code path).

## Commits

| Task | Commit | Subject |
| ---- | ------ | ------- |
| 1 | `a3ba402` | fix(ingestion): make the image content-type gate truly advisory |
| 2 | `758e1e0` | fix(ingestion): send browser-like Accept + article-origin Referer on image fetches |
| 3 | `8e59fb4` | fix(ingestion): hoist inline paragraph images + select best srcset candidate |

## Test Results

| Gate | Result |
| ---- | ------ |
| Task 1 — safe-fetch.spec.ts + fetchImageAsset.spec.ts | 72/72 passed |
| Task 2 — fetchImageAsset.spec.ts + assetStage.spec.ts + safe-fetch.spec.ts | 91/91 passed |
| Task 3 — extraction.spec.ts + mxss.spec.ts + epub-to-books.spec.ts | 92/92 passed |
| Cross-task — whole `tests/unit/server/` | 417 passed / 0 failed / 13 skipped (intentional) |
| `npm run lint` | exit 0 |
| Full unit suite (`npm run test:unit -- --run`) | 1635 passed / 0 failed / 13 skipped |
| e2e `tests/e2e/ingestion/ssrf-matrix.spec.ts` | 0 files touched — the 19-vector pin is byte-stable by construction (document-profile byte-stability cells pin request headers + octet-stream refusal); e2e run skipped per the plan's "only if cheap" allowance |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - test assertion] Heading byte-stability cell expected the wrong byte-stable value**
- **Found during:** Task 3 verification (first run)
- **Issue:** The heading scope-guard cell asserted run text `"Heading"`, but the pre-existing walk emits `"Heading "` — `extractInline` has no img arm, so the trailing space before the img survives (exactly the pre-change output the cell exists to pin).
- **Fix:** Corrected the assertion to `"Heading "` with a comment stating it is byte-stable with the pre-260908-ef5 walk.
- **Files modified:** tests/unit/server/extraction.spec.ts
- **Commit:** `8e59fb4`

No other deviations — the plan executed exactly as written.

## Out-of-Scope Discovery (logged, not fixed)

One transient 5s-timeout failure of `tests/unit/server/normalization.spec.ts` ("extracted sample round-trips to confident") appeared during an intermediate full-directory run: the fixture `scripts/source-html/essay-long-form.html` carries 7 real aeonmedia.co CDN images, so the spec performs real network fetches with ~2s headroom under the 5s vitest timeout. Baseline verified green in an isolated temp worktree at `50ea94c` (3/3) and the changed tree green on 3/3 re-runs + the final full-suite run — pre-existing network flakiness, unrelated to this task. Filed in `deferred-items.md` per the scope-boundary rule.

## Invariants Held

- 9-measure pipeline unforked (D20-12) — the profile seam was extended, never forked; the document profile passes no gate and no headers, pinned by exact-equality header cells.
- Sniff authoritative (D20-10) — octet-stream admission is decided by bytes; HTML-under-octet-stream refuses `"type"`.
- Never-throw per-figure contract (D20-05) — `fetchImageAsset` still returns typed refusals only.
- Disclosure over silence (Honesty) — inline unresolvable imgs yield the UnsupportedBlock; refused counts still ride `extractionWarnings`.
- No `data:` URI arm anywhere; no `dangerouslySetInnerHTML`; `ALLOW_DATA_ATTR:false` untouched (mxss suite green).
- D-05 annotation substrate unchanged — hoisted figures carry empty captions; `assertRoundTripAnchor` unaffected (assetStage substrate byte-identity cells green).
- No schema change, no e2e change, no new dependencies.

## Self-Check: PASSED

- All 5 modified server modules + 4 modified spec files exist on disk and carry the changes (verified via commits below).
- Commits `a3ba402`, `758e1e0`, `8e59fb4` present in `git log`.
- All verification gates green (see Test Results).
