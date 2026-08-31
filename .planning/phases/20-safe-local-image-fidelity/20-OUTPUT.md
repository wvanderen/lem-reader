# Phase 20 Output — Honest Full-Suite Gate + IMG Closure Ledger

Phase gate record for 20-safe-local-image-fidelity (plan 20-07).
Discipline: the 04-11/09-07/19-05 permanent-record format — every invocation
recorded honestly, counts verbatim, no silent subset/grep/engine-skip.

---

## Task 1 — Honest Full-Suite Gate

### Invocation history (all invocations, honestly recorded)

| # | Command | Started (UTC) | Result | Failures |
|---|---------|---------------|--------|----------|
| 1 | `npm run test` | 2026-08-31T20:24Z | exit 1 | 2 (e2e) — classified below |
| 2 | `npm run test` | 2026-08-31T20:51Z | exit 1 | 1 (e2e) — classified below |
| 3 | `npm run test:unit -- --run && npm run test:e2e -- --workers=2` | 2026-08-31T21:08Z | **exit 0** | 0 — the permanent green record |

All invocations: fresh dev server (port 5173 killed before each run — the
15-04 aged-server lesson), full suite, no grep/spec/engine filtering. Unit and
e2e ran in the same invocation (`npm run test` composition).

### Failure classification (invocations 1–2)

**Invocation 1 (2 failures):**

1. `[firefox] tests/e2e/toc/restoration-cue.spec.ts:440` — reduced-motion
   instant-clear cell, 6s poll on the timer-driven `is-fading` class.
   **Class: environment (engine starvation under load).** Phase 18 spec;
   Phase 20 touched nothing in its area (the only Phase 20 app.css change is
   additive figure selectors). Re-run in isolation on firefox: **9/9 green**,
   the exact cell at 5.9s against its 6s window (the 18-04
   isolation-green-then-harness lesson; machine load 5.7–9.97 during the run).
2. `[webkit] tests/e2e/ingestion/happy-path.spec.ts:187` — the 20-04
   asset-envelope cell, waitForURL timeout with the page stuck on the library
   (the add never navigated). **Class: pre-existing documented engine
   boundary.** `save(article, assets)` writes D20-15 `data: Blob` rows
   through Dexie; Playwright's WebKit refuses ALL Blob puts into IndexedDB
   (UnknownError — probe-verified in 20-05, re-probed 20-06 and 20-08;
   deferred-items.md). 20-06-SUMMARY already named this exact cell as failing
   on webkit; it was never surfaced before because no 3-engine full gate ran
   after 20-04 added the cell (interim gates were chromium-only). Carried with
   the documented `test.skip(browserName === "webkit")` per the 20-05/20-06/
   20-08 pattern — commit `3fd2a30`; residual ledger 4 → 5 (deferred-items.md).
   The open Rule-4 row-shape alternative (Uint8Array rows) stays with the
   human — never auto-applied.

**Invocation 2 (1 failure, different cell + engine — the moving-tail
starvation signature):**

- `[chromium] tests/e2e/annotations/persist-reload.spec.ts:127` — Phase 19
  span reload cell; the restored mark never reached visibility within the
  expect window after reload. **Class: environment (starvation flake).** Green
  in run 1, green in 20-08's 3-engine annotations sweep (273/273), green in
  isolation re-run (3/3, the cell at 3.2s). Machine load oscillated 6–14
  during this window.

**Contention control (invocation 3):** the documented bounded `--workers=2`
setting — the 18-04/13-10 precedent (config `workers: 3` is converged for
load 6–10; the machine spent the gate window oscillating above it, and two
consecutive plain runs produced two different isolation-green tail flakes,
i.e. scheduling starvation, not code). Recorded here as the invocation
command; assertions, engines, and spec selection byte-unchanged.

### The green permanent record (invocation 3)

Command: `npm run test:unit -- --run && npm run test:e2e -- --workers=2`

- **Unit (vitest):** `Test Files  103 passed | 2 skipped (105)` ·
  `Tests  1580 passed | 13 skipped (1593)` — **0 failed**
- **E2e (Playwright — chromium + firefox + webkit + chromium-throttled-mobile
  perf harness):** `15 skipped` · `1642 passed (23.5m)` — **0 failed**
- **Exit code: 0**

### Residual skip reconciliation (never silently green)

- **Unit — 13 skips:** the documented intentional set carried unchanged since
  the Phase 15/18 gates (same count as the 19-05 gate record).
- **E2e — 15 skips** = 10 carried (the Phase 15/18 documented set, identical
  count to the 19-05 gate) + **5 Phase-20 documented engine-boundary skips**:
  - 2 × 20-05 portability (round-trip SC#4 assets; import-preview
    dangling-ref) — WebKit Blob→IndexedDB
  - 1 × 20-06 epub-intake (admitted-chapter-figure render cell) — same
    boundary
  - 1 × 20-08 imagery (offline-reopen Dexie-asset reopen cell) — same
    boundary
  - 1 × 20-07 gate (happy-path asset-envelope cell, added 20-04) — same
    boundary, surfaced by this gate's first 3-engine run (commit `3fd2a30`)
- All five trace to the single documented root cause in
  `deferred-items.md` (Playwright WebKit build cannot put ANY Blob value into
  IndexedDB; real Safari supports IDB Blob storage, Safari 10+). Chromium +
  firefox carry every affected flow.

### Fixes this gate produced

| Commit | Type | Justification |
|--------|------|---------------|
| `3fd2a30` | fix | Documented webkit skip on the 20-04 asset cell per the deferred-items WebKit Blob→IDB boundary (probe-verified ×3; 20-06-SUMMARY pre-named the cell); ledger 4 → 5; the 20-05/20-06/20-08 pattern; T-20-28 honest recording |

No stale-pin realignments and no production regressions surfaced: every
failure classified as environment or pre-existing documented boundary.

---

## Task 2 — IMG Closure Ledger

Every requirement maps to the plan(s) + spec(s) that prove it end-to-end.
REQUIREMENTS.md rows are all `[x] Complete` — flipped by the **proving**
plans, never by the substrate plans (the 04-02 PAGE-01 / 19-01 honest-split
precedent; 20-01/20-02/20-03/20-04 shipped machinery with
`requirements-completed: []` and stay that way in their SUMMARYs).

| Req | Requirement (abridged) | Closed by | Evidence (plan · spec · counts) |
|-----|------------------------|-----------|----------------------------------|
| **IMG-01** | Figures/alt/captions preserved in the canonical sanitized model when reliably recoverable | **20-06** (with 20-02 substrate) | 20-02: URL/paste/Markdown rewrite to `asset:img-<12hex>` refs with alt+caption substrate byte-identity asserted against the real `splittingBlockText` (assetStage.spec 13/13; 87 cells across the four server specs). 20-06: EPUB container extraction, D12-16 retired (epub-to-books.spec 36/36 incl. the 8-cell 20-06 describe; epub-intake e2e 41 passed/1 documented skip/0 failed across 3 engines; happy-path asset cell chromium+firefox) |
| **IMG-02** | Secondary assets fetch SSRF-safe with redirect/address/media-type/byte/pixel/count/animation/decode limits | **20-06** (with 20-01 substrate) | 20-01: same 9-measure pipeline via `safeFetchCore` — ssrf-matrix 19 vectors byte-stable + 6 new image-profile safeFetchCore cells; fetchImageAsset.spec 30/30 (5 valid formats, animated GIF/WebP/APNG, SVG-under-lying-header, pixel bomb, byte-cap boundary, EXIF). 20-02: stage caps count/budget/deadline (assetStage.spec). 20-06: sniff caps minus fetch over container bytes incl. the IHDR-patched 65536² bomb + 126-figure count-cap corpus |
| **IMG-03** | Saved articles never contact third-party image hosts; local assets with explicit lifecycle + deletion | **20-08** (with 20-03/20-04 substrate) | 20-03: one-transaction save/upsert + article/book delete cascades, rollback-proven (assets-cascade.spec 15/15 + library-source 3/3). 20-04: `img` emitted ONLY on the resolved object-URL branch (asset-provider 12/12). 20-08: offline-reopen — probe-verified route-abort guard + external-request array asserted empty across three reopen shapes; imagery 50 passed/1 documented skip/0 failed across 3 engines |
| **IMG-04** | Assets round-trip through versioned export/import with validation, conflicts, bundle limits, no broken refs | **20-05** | bundle-v4.spec + validate-bundle 47/47 (v4 union, manifest sha256 block, bomb/integrity gates, dangling skip, D9-14 ride, rollback); portability e2e 61 passed/2 documented skips/0 failed across 3 engines with raw-row byte-equality + local `naturalWidth > 0` render on machine B; the two verbatim preview warnings |
| **IMG-05** | Figures render semantically with stable intrinsic geometry + calm fallbacks in both reading modes | **20-08** (on 20-04's renderer) | geometry.spec: reserved-vs-rendered aspect identity at uncapped viewport (incl. EXIF-rotated fixture), placeholder in BOTH modes with captions visible, tall-figure clamp; refusal-matrix: identical one-surface placeholder, visible alt, D19-01 caption-mark cell, IMG-05 AxeBuilder scan zero serious/critical on all 3 engines |
| **IMG-06** | Image load/decode/failure/size cannot silently clip/duplicate/omit/reorder/destabilize pagination; canonical location preserved | **20-08** (on 20-04's renderer) | geometry.spec: page-count identity across a full walk decoding both fixture imgs + no PaginationFallbackBanner + tall-figure clamp with pagination intact; decode-matrix: 15/15 cells (5 formats × 3 engines, blob: src + naturalWidth > 0 + D20-13 attribute round-trip); decode is paint never layout (D20-13 — reserved boxes are model-determined pre-decode) |

**20-04's render-half truths are closed only by 20-08's e2e proofs** — 20-04
shipped the structural renderer guarantees (img-on-resolved-branch-only,
reserved boxes, one placeholder surface) with `requirements-completed: []`;
IMG-03/05/06 flipped at 20-08, the plan whose specs prove them in real
browsers. All six REQUIREMENTS.md rows trace to green automated runs in this
gate (T-20-28: claims trace to the green invocation above, not summaries).

## Cap sanity re-check (D20-11 — generous bomb-stoppers, not reading-police)

Constants verified in code (`src/ingestion/types.ts`, re-exported from
`server/limits.ts`; geometry in `src/app.css`) against the corpus evidence
the phase produced:

| Constant | Value | A3 reference | Phase corpus evidence | Verdict |
|----------|-------|--------------|----------------------|---------|
| `MAX_ASSET_BYTES` | 16 MB | per-asset ≈ 8–16 MB | refusal boundary exercised by the byte-cap unit cell; no corpus case near it | keep |
| `MAX_ASSET_PIXELS` | 16,777,216 | = pdf.js `MAX_IMAGE_PIXELS` (one family) | 20-06 IHDR-patched 65536² (≈4.3 Gpx) bomb refuses `"pixels"` | keep |
| `ASSET_FETCH_TIMEOUT_MS` | 15 s | — | mirrors `REQUEST_TIMEOUT_MS`; no evidence argues | keep |
| `ASSET_STAGE_DEADLINE_MS` | 60 s | D20-04 per-article budget | deadline unit cells (pre-expired + mid-flight) | keep |
| `ASSET_FETCH_CONCURRENCY` | 4 | A6 | bounded-pool peak unit cell | keep |
| `MAX_FIGURES_PER_ARTICLE` | 120 | count ≈ 100–150 | 20-06 126-figure corpus: exactly 120 admissions + per-figure `"count"` refusal + twin dedupe | keep |
| `MAX_ARTICLE_ASSET_BYTES` | 150 MB | total ≈ 100–150 MB | per-book running-guard unit cells (Pitfall 6) | keep |
| `MAX_ASSET_RESPONSE_BYTES` | 3 MB | OQ1 resolution | base64 ≈ 4 MB keeps the Vercel 4.5 MB ceiling honest; running-budget unit cells | keep |
| `--figure-media-max-h` | `calc((100dvh - 48px - 2 * 48px) * 0.5)` (half the paginated content box) | A7 | 20-08 tall-figure clamp + page-count identity cells | keep |
| `--figure-placeholder-ratio` | `3 / 2` | A7 | both-mode placeholder cells | keep |

**Verdict: no cap number's phase-produced evidence argues for tuning.** All
constants stay named + commented where they live; any future tuning is a
follow-up commit, never a silent edit (D20-11). Honest boundary note: the
corpus the phase produced is fixture/synthetic (authentic-format registry
samples, spam corpora, patched bombs) — it proves the caps fire as
bomb-stoppers, which is the bar D20-11 sets; true in-the-wild photo-essay
measurement (A3's "measure, then lock" at full fidelity) remains available as
backlog if any reading-police symptom ever appears against real content.

## Residuals (recorded honestly — T-20-29)

1. **Animated AVIF passes the animation gate** — `is-animated` covers
   GIF/APNG/WebP only (20-RESEARCH Pitfall 8, VERIFIED against the official
   README). Accepted per Assumption A4: rare in longform publishing; revisit
   on corpus evidence. → `deferred-items.md` (entry added by this plan).
2. **Playwright-WebKit Blob→IndexedDB boundary** — 5 documented e2e skips
   (2× 20-05, 1× 20-06, 1× 20-08, 1× surfaced by this gate), all one root
   cause; the open Rule-4 row-shape alternative stays with the human. →
   `deferred-items.md` (probe evidence + option recorded since 20-05).
3. **Cap tuning** — none argued by corpus evidence; see the table above.

Phase 20 closes: every IMG-01..06 requirement traced to green automated
evidence in this gate's invocation; the honest record is permanent above.

