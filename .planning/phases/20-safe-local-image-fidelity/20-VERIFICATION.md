---
phase: 20-safe-local-image-fidelity
verified: 2026-08-31T21:42:55Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 20: Safe Local Image Fidelity — Verification Report

**Phase Goal:** Readers retain meaningful figures and captions as safe, offline, portable content stable in both reading modes.
**Verified:** 2026-08-31T21:42:55Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Supported ingestion preserves reliably recoverable figures, alternative text, and captions canonically (SC1) | ✓ VERIFIED | `src/content/schema.ts:106` `assetRef` regex `^asset:img-[a-z0-9]{12}$`; three-state FigureBlock (`src: union([httpUrl, assetRef]).optional()`, `originalSrc`, `width/height`); `server/assetStage.ts` `runAssetStage`/`rewriteFiguresWithAssets` with the splittingBlockText byte-identity contract asserted in `assetStage.spec.ts` (13/13, green in my re-run); Markdown refused-FigureBlock cells; EPUB container extraction in `server/epubToBooks.ts` (zero network — no fetch/safeFetch call in the file) with `epub-to-books.spec.ts` 36/36; e2e happy-path asset cell (chromium+firefox) + epub-intake 41 passed/1 documented skip across 3 engines (gate record, arithmetically reproduced — see Behavioral Spot-Checks) |
| 2 | Assets outside approved network, type, byte, pixel, count, animation, or decode limits are calmly refused without unsafe fetches (SC2) | ✓ VERIFIED | `server/fetchImageAsset.ts` — `fetchImageAsset` calls `safeFetchCore(url, IMAGE_FETCH_PROFILE)` (line 112; the ONLY fetch entry; one 9-measure pipeline, never forked); typed refusals `"fetch"\|"type"\|"bytes"\|"pixels"\|"animated"` returned never thrown; `fetchImageAsset.spec.ts` 30/30 incl. SVG-bytes-under-lying-png-header (line 362), animated GIF/WebP/APNG, pixel bomb, byte-cap boundary, EXIF orientation swap (line 181); 8 cap constants in `src/ingestion/types.ts` re-exported from `server/limits.ts` matching the 20-OUTPUT cap table exactly; `epub-to-books.spec.ts:529` count-cap cell (126-figure corpus → exactly 120 admissions + per-figure `"count"` refusal + twin dedupe) + IHDR-patched 65536² bomb; `tests/e2e/ingestion/ssrf-matrix.spec.ts` untouched since Phase 07 commit `009cc32` (git log) — the byte-stability claim holds |
| 3 | Reopening renders supported images from local assets and never contacts third-party image hosts (SC3) | ✓ VERIFIED | `BlockRenderer.tsx` FigureMedia emits `<img>` ONLY on the `objectUrl !== undefined && !broken` branch; `AssetProvider.tsx` per-article object-URL map (fixture registry first, `bulkGetAssets` second) with create/revoke symmetry; `tests/e2e/imagery/offline-reopen.spec.ts` — NON-VACUOUS route-abort guard (`page.route` registered pre-navigation + collector + a live probe cell proving both instrument halves fire) with `blob:` src + `naturalWidth > 0` + external array asserted empty across three reopen shapes (50 passed/1 documented webkit skip across 3 engines); delete cascades in one transaction (`LibrarySource.ts:117,200`, `booksStore.ts:186,197`); assets-cascade 12 + library-source 3 cells (combined 15/15) green |
| 4 | Figures render semantically with stable geometry and calm failures in both modes without content or location loss (SC4) | ✓ VERIFIED | `geometry.spec.ts` 4 cells: reserved-vs-rendered aspect identity at uncapped viewport incl. EXIF-rotated fixture, page-count identity across image load (no fallback banner), placeholder in BOTH modes with caption visible, tall-figure letterbox under `--figure-media-max-h`; `refusal-matrix.spec.ts` 4 cells: identical placeholder with visible alt + zero img elements, caption highlightable inside refused figures (D19-01 via the `capture.ts` figcaption alignment fix), both-mode open, AxeBuilder WCAG scan zero serious/critical on all 3 engines; `.figure-placeholder` CSS surface with zero transition/animation properties |
| 5 | Assets export/import with validation, limits, conflicts, no broken references, and documented deletion lifecycle (SC5) | ✓ VERIFIED | `bundle.ts` schemaVersion `1\|2\|3\|4` union + `AssetExportMeta` (per-asset sha256); `manifest.ts` assets block hashes `JSON.stringify(bundle.assets ?? [])` on both sides; `ExportImportService.ts` — `assets/<articleId>/<assetId>` entries, `loadAllAssets` on export, `isSafeEntryName` on every entry, byteLength + sha256 import gates, dangling-ref article skip with preview warnings, puts-only `applyImport`; `conflicts.ts` — assets ride D9-14 article resolution via `assetsToWrite`, ConflictKind union unchanged (no asset kind); bundle-v4 35 + validate-bundle 12 = 47/47 unit green; portability e2e 61 passed/2 documented skips across 3 engines |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Required Artifacts

All 25 source artifacts + 17 test artifacts exist, are substantive, and are wired. Full checks:

| Artifact | Lines | Status | Details |
|----------|-------|--------|---------|
| `server/fetchImageAsset.ts` | 189 | ✓ VERIFIED | exports `fetchImageAsset`, `sniffImageAsset`, `ImageAsset`, `ImageAssetRefusal`, `IMAGE_FETCH_PROFILE` |
| `server/safeFetch.ts` | 283 | ✓ VERIFIED | `safeFetchCore(rawUrl, profile)` parameterized core; document wrapper byte-stable over it |
| `server/assetStage.ts` | 282 | ✓ VERIFIED | `runAssetStage`, `rewriteFiguresWithAssets`, `AssetResolution` stage supertype; refusedCount disclosure |
| `server/ingest.ts` | 845 | ✓ VERIFIED | `runAssetStage` wired (line 721) post-extract pre-stamp; envelope + extractionWarnings |
| `server/epubToBooks.ts` | 1229 | ✓ VERIFIED | `sniffImageAsset` seam (line 854), `figureSrcResolver` hook, `rewriteFiguresWithAssets` reuse (line 876); ZERO fetch calls |
| `src/content/schema.ts` | 440 | ✓ VERIFIED | `assetRef` regex, FigureBlock three-state union with NO data: arm |
| `src/ingestion/types.ts` | 245 | ✓ VERIFIED | all 8 cap constants matching 20-OUTPUT table + `AssetEnvelopeSchema` on both ok-variants |
| `src/persistence/db.ts` | 263 | ✓ VERIFIED | `version(6).stores({ ..., assets: "[articleId+assetId], articleId" })`; v1..v5 unchanged, no `.upgrade()` (4 comment-only matches) |
| `src/persistence/assetsStore.ts` | 194 | ✓ VERIFIED | `AssetRecordSchema`, `putAssets`, `bulkGetAssets`, `loadAllAssets`, `deleteAssetsForArticle` |
| `src/ingestion/LibrarySource.ts` | 249 | ✓ VERIFIED | `save(article, assets?)` one-transaction upsert with old-row range-delete first |
| `src/persistence/booksStore.ts` | 301 | ✓ VERIFIED | array-transaction `db.assets` cascade on saveBook/removeBook |
| `src/fixtures/figure-assets.ts` | 343 | ✓ VERIFIED | 7 authentic encoder-produced samples incl. animatedGif + jpegExifRotated, module-load byte-magic self-verification |
| `src/content/assets/AssetProvider.tsx` | 156 | ✓ VERIFIED | `AssetProvider`, `useAssetUrl`, `figureAssetIds`; revoked-flag-after-create discipline |
| `src/content/render/BlockRenderer.tsx` | 884 | ✓ VERIFIED | FigureMedia: img ONLY on resolved-object-URL branch; one `.figure-placeholder` surface |
| `src/routes/ArticleView.tsx` | 2667 | ✓ VERIFIED | `AssetProvider` wraps the article (line 2332) |
| `src/ingestion/AddDialog.tsx` | 636 | ✓ VERIFIED | `save(result.article, result.assets)` + `saveBook(..., bookAssetsForChapters(...))` (lines 288, 391-394, 442) |
| `src/portability/bundle.ts` | 132 | ✓ VERIFIED | `z.literal(4)` union + `AssetExportMeta` |
| `src/portability/manifest.ts` | 71 | ✓ VERIFIED | assets block in hash union, `?? []` both sides |
| `src/portability/ExportImportService.ts` | 541 | ✓ VERIFIED | assets/ entries, import gates, applyImport puts |
| `src/portability/conflicts.ts` | 852 | ✓ VERIFIED | `assetsToWrite` on ResolvedImportPlan; ConflictKind unchanged |
| `src/app.css` | 3947 | ✓ VERIFIED | `--figure-media-max-h: calc((100dvh - 48px - 2 * 48px) * 0.5)`, `--figure-placeholder-ratio: 3 / 2`, figure>img + .figure-placeholder rules, zero transitions |
| `src/annotations/capture.ts` | 596 | ✓ VERIFIED | figcaption-element caption alignment (the 20-08 Rule 1 fix) |
| `tests/e2e/imagery/*` (4 specs + helpers) | 745 total | ✓ VERIFIED | all four spec surfaces present with the claimed cells |
| `20-OUTPUT.md` / `deferred-items.md` | 171 / 77 | ✓ VERIFIED | gate record + ledger + residuals; counts independently reproduced |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| `server/fetchImageAsset.ts` | `server/safeFetch.ts` | `safeFetchCore(url, IMAGE_FETCH_PROFILE)` | ✓ WIRED (line 112) |
| `server/ingest.ts` | `server/assetStage.ts` | `runAssetStage` post-extract pre-stamp | ✓ WIRED (line 721) |
| `server/assetStage.ts` | `server/fetchImageAsset.ts` | bounded-concurrency `fetchImageAsset` per unique src | ✓ WIRED |
| `server/epubToBooks.ts` | `server/fetchImageAsset.ts` | `sniffImageAsset(entry)` network-free seam | ✓ WIRED (line 854; no fetchImageAsset call in EPUB path) |
| `server/epubToBooks.ts` | `server/htmlToBlocks.ts` | `figureSrcResolver` hook | ✓ WIRED (lines 711, 742) |
| `server/epubToBooks.ts` | `server/assetStage.ts` | `rewriteFiguresWithAssets` reuse | ✓ WIRED (line 876) |
| `src/ingestion/LibrarySource.ts` | `src/persistence/db.ts` | `db.assets.where("articleId").delete()` in save/remove transactions | ✓ WIRED (lines 117-124, 200) |
| `src/persistence/booksStore.ts` | `src/persistence/db.ts` | array-transaction with `db.assets` | ✓ WIRED (lines 186-199) |
| `src/routes/ArticleView.tsx` | `src/content/assets/AssetProvider.tsx` | provider wraps article | ✓ WIRED (line 2332) |
| `src/content/render/BlockRenderer.tsx` | `src/content/assets/AssetProvider.tsx` | `useAssetUrl(block.src)` | ✓ WIRED (line 364) |
| `src/ingestion/AddDialog.tsx` | `src/ingestion/LibrarySource.ts` | `save(article, result.assets)` / `saveBook(..., assets)` | ✓ WIRED (lines 288, 391, 442) |
| `src/portability/ExportImportService.ts` | `src/persistence/assetsStore.ts` | `loadAllAssets` export + `db.assets` puts in applyImport | ✓ WIRED (lines 93, 124, 444) |
| `src/portability/conflicts.ts` | `src/portability/ExportImportService.ts` | `plan.assetsToWrite` → puts-only closure | ✓ WIRED (line 444) |
| `src/ingestion/IngestionClient.ts` | `src/portability/manifest.ts` | `sha256Hex` reuse in `validateEnvelopeAssets` transport gate | ✓ WIRED (lines 30, 94-103) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `FigureMedia` (BlockRenderer) | `objectUrl` from `useAssetUrl` | `AssetProvider` → fixture registry or `bulkGetAssets` Dexie rows → `URL.createObjectURL(row.data)` | Yes — real per-format bytes; e2e asserts `blob:` src + `naturalWidth > 0` | ✓ FLOWING |
| `AssetProvider` | asset rows | Dexie v6 assets store written by `save(article, assets)` from validated envelope | Yes — offline-reopen e2e proves persisted-blob reopen with zero external requests | ✓ FLOWING |
| `ExportImportService` | bundle assets | `loadAllAssets()` → zip entries `assets/<articleId>/<assetId>` | Yes — raw-row byte-equality + sha256 verified at import (unit 47/47 + e2e 61/2) | ✓ FLOWING |
| `assetStage` rewrite | accepted assets | `fetchImageAsset` per unique src through `safeFetchCore` | Yes — real bytes hashed to `img-<12hex>` matching assetId (client re-hash gate) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full unit suite (single invocation, per constraints) | `npm run test:unit -- --run` | `Test Files 103 passed \| 2 skipped (105)` · `Tests 1580 passed \| 13 skipped (1593)` — exit 0, 14.67s — **exactly reproduces the 20-07 gate record's unit counts** | ✓ PASS |
| E2e gate record arithmetic (no re-run per verification constraints — 20-07 record is the evidence) | `npx playwright test --list` per project | chromium 552 + firefox 552 + webkit 552 + throttled 1 = **1657 total = 1642 passed + 15 skipped exactly**; skip-site audit: chromium 2 (ssrf unconditional) + firefox 4 (+2 longtask) + webkit 9 (+5 Phase-20 WebKit boundary) = **15 exactly** | ✓ PASS |
| WebKit skip ledger (5 Phase-20 skips, one root cause) | grep `test.skip` across e2e | offline-reopen:122, round-trip:998, import-preview:532, epub-intake:1312, happy-path:201 — all `browserName === "webkit"` with documented reasons; all cite deferred-items.md | ✓ PASS |
| Gate commit `3fd2a30` exists and matches record | `git show 3fd2a30` | Commit present: happy-path webkit skip + deferred-items ledger 4→5, exactly as recorded in 20-OUTPUT.md | ✓ PASS |
| Unit skip arithmetic (13 claimed) | enumerate skip sites | pdf derive 3 + epub derive 3 + spike-jsdom-workers 7 (workerd-down ctx.skip) = **13 exactly**; 2 skipped files = the two derive describes; 105 spec files on disk = 103+2 | ✓ PASS |
| Closure-ledger per-spec counts | `npx vitest list` | fetchImageAsset 30 ✓, assetStage 13 ✓, epub-to-books 36 ✓, asset-provider 12 ✓, library-source 3 ✓, bundle-v4 35 + validate-bundle 12 = 47 ✓, assets-cascade 12 + library-source 3 = combined 15 ✓ | ✓ PASS |
| E2e per-directory counts (3-engine) | `playwright --list` × 3 | imagery 17×3 = 51 = 50 passed + 1 skip ✓; epub-intake 14×3 = 42 = 41 + 1 ✓; portability 21×3 = 63 = 61 + 2 ✓ | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared by this phase; the phase's probe discipline (WebKit Blob→IDB probe evidence) is recorded in deferred-items.md and consumed via the documented test.skip pattern. SKIPPED (no probe scripts declared).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| IMG-01 | 20-06 (substrate 20-02) | Figures/alt/captions preserved canonically when reliably recoverable | ✓ SATISFIED | asset-ref rewrite + byte-identity contract (assetStage.spec), EPUB container extraction (epub-to-books.spec 36/36, zero network), e2e epub-intake 41/1 + happy-path asset cell; REQUIREMENTS.md row [x] |
| IMG-02 | 20-06 (substrate 20-01) | SSRF-safe asset fetch with all limit families | ✓ SATISFIED | safeFetchCore single pipeline, fetchImageAsset.spec 30/30 (type/animated/bomb/EXIF), sniff caps in EPUB incl. 65536² bomb + 126-figure count cap, caps verified in code; ssrf-matrix untouched since Phase 07; REQUIREMENTS.md row [x] |
| IMG-03 | 20-08 (substrate 20-03/20-04) | Local assets, zero third-party contact, deletion lifecycle | ✓ SATISFIED | img-on-resolved-branch-only renderer, non-vacuous route-abort offline guard e2e, one-transaction save/cascade (combined 15/15); REQUIREMENTS.md row [x] |
| IMG-04 | 20-05 | Versioned export/import round-trip with validation/conflicts/limits | ✓ SATISFIED | bundle v4 + manifest sha256 + import gates + D9-14 ride (47/47 unit), portability e2e 61/2; REQUIREMENTS.md row [x] |
| IMG-05 | 20-08 (on 20-04 renderer) | Semantic figures, stable geometry, calm fallbacks both modes | ✓ SATISFIED | geometry.spec 4 cells + refusal-matrix 4 cells incl. AxeBuilder zero serious/critical on 3 engines; REQUIREMENTS.md row [x] |
| IMG-06 | 20-08 (on 20-04 renderer) | Image events cannot destabilize pagination; location preserved | ✓ SATISFIED | page-count identity across load + no fallback banner cell, decode-matrix 5×3 engines green, decode-is-paint reserved boxes; REQUIREMENTS.md row [x] |

Orphaned requirements: NONE — REQUIREMENTS.md maps exactly IMG-01..06 to Phase 20; plan frontmatter union covers all six; the honest-split precedent (substrate plans 20-01..20-04 keep `requirements-completed: []`, closure by proving plans 20-05/20-06/20-08 + the 20-07 ledger) is followed exactly as documented, and every ledger row's evidence pointers were independently verified above.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | Zero TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers across all 25 source + 17 test Phase-20 files scanned | — | None |

**INFO notes (non-blocking, for the record):**
1. 20-OUTPUT.md ledger phrases the 20-03 evidence as "assets-cascade.spec 15/15 + library-source 3/3"; the underlying run (per 20-03-SUMMARY) is the combined two-file vitest run = 15/15 (12 + 3 cells). The evidence is real and verified; only the compressed phrasing could mislead a literal reader. INFO.
2. The green gate invocation used `--workers=2` (documented 18-04/13-10 contention control) — honestly recorded as the invocation command; specs, engines, and assertions byte-unchanged (config `workers` affects concurrency only). INFO.
3. Gate invocations 1–2 (exit 1) are recorded verbatim with per-failure classification (environment starvation, proven by isolation re-runs; pre-existing documented WebKit boundary) — the honest-record discipline held. INFO.

### Human Verification Required

None. All five success criteria have behavioral evidence: unit behaviors re-verified by a fresh full-suite run in this verification (1580/0/13, exit 0); e2e behaviors carried by the 20-07 gate record whose integrity was independently established (exact count reproduction from `--list` × 4 projects, exact skip-site audit, gate commit `3fd2a30` verified, spec cells inspected to be non-vacuous). The two documented residuals below are recorded decisions, not unverified truths.

**Documented residuals (recorded honestly in deferred-items.md — NOT gaps):**
- **Animated AVIF passes the animation gate** (`is-animated@2.0.2` covers GIF/APNG/WebP only) — accepted per Assumption A4 (rare in longform publishing), with a defined reopening trigger (corpus containing animated AVIF). Deliberate, documented, non-silent.
- **Playwright-WebKit Blob→IndexedDB engine boundary** — 5 documented e2e skips, all one probe-verified root cause (UnknownError on ALL Blob puts; raw Uint8Array/ArrayBuffer put fine); chromium + firefox carry every affected flow; real Safari supports IDB Blob (Safari 10+). The open Rule-4 row-shape alternative (Uint8Array rows) stays with the human as recorded — never auto-applied. Treated as documented behavior per the verification mandate.

### Gaps Summary

No gaps. Every roadmap success criterion is verified against actual code and tests: all artifacts exist at substantive size and are wired end-to-end (fetch → sniff → stage → envelope → transport re-validation → save → render → export/import → cascade); all prohibitions hold (single SSRF pipeline, no data: URI arm, no upgrade callback, renderer never fetches, no transitions, no new ConflictKind, EPUB zero network, no cover extraction); the honest full-suite gate record's counts reproduce exactly from the specs on disk (unit re-run green; e2e 1642+15=1657 arithmetically exact); and all six IMG requirements are closed with evidence pointers that check out. The phase goal — safe, offline, portable figures and captions stable in both reading modes — is achieved in the codebase.

---

_Verified: 2026-08-31T21:42:55Z_
_Verifier: the agent (gsd-verifier)_
