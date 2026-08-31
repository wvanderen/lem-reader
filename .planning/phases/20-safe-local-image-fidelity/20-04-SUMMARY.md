---
phase: 20-safe-local-image-fidelity
plan: 04
subsystem: ui
tags: [react, object-urls, asset-provider, reserved-geometry, figure-placeholder, fixture-corpus, dexie, base64, img-03]

# Dependency graph
requires:
  - phase: 20-safe-local-image-fidelity (Plan 01)
    provides: three-state FigureBlock (asset:/refused/legacy) + stored orientation-corrected dims, assetRef contract
  - phase: 20-safe-local-image-fidelity (Plan 02)
    provides: IngestionSuccess.assets ValidatedAsset[] + validateEnvelopeAssets transport chain, asset envelope on both ok-variants
  - phase: 20-safe-local-image-fidelity (Plan 03)
    provides: Dexie v6 assets store + bulkGetAssets discriminated read + save(article, assets)/saveBook(book, articles, BookAsset[]) atomic lifecycles
provides:
  - AssetProvider/useAssetUrl optional-context hook — per-article object-URL map (fixture registry FIRST, Dexie second) with provider-owned create/revoke lifecycle
  - figureAssetIds(article) renderer-side block walk (the AddDialog book-arm attribution twin)
  - BlockRenderer FigureMedia — img ONLY on the resolved-object-URL branch; one .figure-placeholder surface for refused/legacy/broken (D20-14)
  - app.css geometry tokens (--figure-media-max-h, --figure-placeholder-ratio) + figure>img rule + .figure-placeholder surface
  - fixtureAssetRegistry — 7 authentic encoder-produced per-format samples (incl. animated GIF + EXIF-orientation-6 JPEG) with module-load byte-magic self-verification
  - figure-heavy.canonical.json regenerated to local asset: refs + stored dims + originalSrc provenance (alt/caption byte-identical)
  - AddDialog threads validated assets into save(article, assets) + saveBook(..., BookAsset[]) (book path dormant-empty until 20-06)
affects: [20-05 portability (fixture refs + registry discipline), 20-06 epub (fills the book envelope the AddDialog wiring already threads), 20-08 verification (consumes the registry + the four imagery spec surfaces)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional-context resolution hook (null outside provider — the useOptionalHighlightOverlay pattern) so the renderer compiles byte-unchanged for legacy callers"
    - "Dedicated FigureMedia child component for hook-owning media state — rules-of-hooks forbids per-case hooks in BlockView's kind switch"
    - "Provider lifecycle: revoked-flag checked AFTER each createObjectURL so late-async interleavings revoke immediately — create/revoke symmetry under every interleaving incl. StrictMode twin-mount"
    - "Fixture bytes embedded as base64 constants with sync byte-magic self-verification at module load (async Web Crypto makes load-time hash re-checks impossible browser-side; the hash linkage is proven by the client re-hash chain in e2e)"
    - "RED placeholder stub keeps the RED commit tsc-clean (second application of the 20-02 scaffolding precedent, after 20-03)"

key-files:
  created:
    - src/fixtures/figure-assets.ts
    - src/content/assets/AssetProvider.tsx
    - tests/unit/content/asset-provider.test.tsx
  modified:
    - src/fixtures/articles/figure-heavy.canonical.json
    - src/fixtures/index.ts
    - src/ingestion/AddDialog.tsx
    - src/ingestion/IngestionClient.ts
    - src/content/render/BlockRenderer.tsx
    - src/routes/ArticleView.tsx
    - src/app.css
    - tests/e2e/ingestion/happy-path.spec.ts
    - tests/component/AddDialog.test.tsx
    - tests/component/BlockRenderer.test.tsx
    - tests/unit/annotations/list-highlight-render.test.tsx

key-decisions:
  - "originalSrc keeps the wikimedia URLs on the regenerated fixture (D20-12 provenance — mirrors rewriteFiguresWithAssets' real output); the acceptance grep was over-broad, the security property verified instead is zero remote src keys"
  - "EpubIngestionSuccess.assets: ValidatedAsset[] (parallel to the article path) computed via the 20-02-exported validateEnvelopeAssets — empty until 20-06; the AddDialog book arm attributes chapters via its own block walk (model-driven, never envelope-driven)"
  - "FigureMedia extracted as a child component (not inline in the figure case) so the broken-swap useState + useAssetUrl live in a hook-legal position; the figcaption JSX stays byte-identical in the figure case"
  - "Registry carries all 7 format samples under the figure-heavy id; unreferenced rows are inert (provider filters per-figure refs) — the 20-08 decode-matrix seeds every format with zero new fixtures"
  - "The placeholder's aspect-ratio is an inline style (stored dims else var(--figure-placeholder-ratio)); max-height cap applies to BOTH the img and the placeholder so no figure box can exceed a page (Pitfall 3)"

patterns-established:
  - "Fixture-registry-first resolution: fixture article ids never open Dexie (the inMemoryRepository discipline, now at the asset layer)"
  - "Sanctioned spec realignment pattern for the legacy-remote-src behavior change: cite UI-SPEC §Regression Targets deliberate change + D-decision in the spec comment"

requirements-completed: []  # IMG-03/IMG-05/IMG-06 render-halves shipped structurally, but all three close at the 3-engine e2e/corpus plans (20-08 imagery specs) — mirrors the 04-02 PAGE-01 / 20-01/02/03 split precedent

# Metrics
duration: 12min
completed: 2026-08-31
status: complete
---

# Phase 20 Plan 04: Reserved-Geometry Rendering + Placeholder Surface + Fixture Corpus Summary

**Per-article AssetProvider resolving local blob object-URLs (fixture registry first, Dexie second, leak-free lifecycle) + a BlockRenderer figure case that emits img only for resolved local refs with model-determined reserved boxes and ONE calm placeholder for every non-asset state, over a regenerated local-asset fixture corpus and validated-asset save wiring**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-31T15:50:26Z
- **Completed:** 2026-08-31T16:02:44Z
- **Tasks:** 2 (Task 2 TDD: RED→GREEN)
- **Files modified:** 14 (3 created, 11 modified)

## Accomplishments

- **IMG-03 render-half shipped structurally**: the img element is emitted ONLY on the resolved-object-URL branch (FigureMedia gates on `useAssetUrl(block.src)`, which returns undefined for absent srcs, remote httpUrl srcs, and unresolved refs) — a remote URL has no code path to an `<img src>`; the offline route-abort e2e proof lands in 20-08-T1
- **IMG-05/06 render-half shipped**: reserved geometry is fully model-determined before decode (stored dims → width/height attrs + inline aspect-ratio; refused/legacy → the 3/2 default token; both surfaces capped by `--figure-media-max-h` at half the paginated page content box, Pitfall 3), and onError swaps to the placeholder INSIDE the same reserved box (Pitfall 5) — decode is paint, never layout (D20-13)
- **D20-14 one surface**: refused-at-ingest, legacy remote-src, and broken-at-read figures render the IDENTICAL `.figure-placeholder` (quiet-chrome anatomy: raised surface + hairline + 4px radius + column-flex centered, 20px aria-hidden image glyph, visible alt or the verbatim `Image unavailable.` note) with the figcaption branch byte-identical in every state (D19-01)
- **Pitfall 9 closed by unit proof**: the provider owns the full object-URL lifecycle — created once per article open (exactly one URL per referenced asset), all revoked on articleId change/unmount, with the revoked-flag guard making every async interleaving leak-free (12/12 cells incl. StrictMode twin-mount symmetry)
- **The corpus is local-asset-backed**: figure-heavy's two wikimedia srcs became `asset:img-<12hex>` refs (EXIF-rotated JPEG stored 200×320 + PNG 240×180) backed by a 7-sample registry of authentic encoder-produced bytes (ffmpeg/libwebp/sips output; the EXIF sample is real JPEG bytes with the 20-01 APP1 segment spliced after SOI) that decode in real browsers and self-verify byte-magic at module load
- **Validated assets flow into saves end-to-end**: the happy-path e2e cell round-trips registry bytes through the client's decode→byteLength→sha256 re-hash chain, saves article+assets in one transaction, and reopens the article with local imgs (naturalWidth > 0, blob: srcs) — resolution through Dexie, not the fixture registry (non-fixture article id)

## Task Commits

Each task was committed atomically (Task 2 TDD: RED test commit → GREEN feat commit):

1. **Task 1: Fixture asset corpus + save-call wiring** — `c70e8d1` (feat)
2. **Task 2: AssetProvider + BlockRenderer figure case + geometry CSS** — `5b98d25` (test/RED) + `53984bc` (feat/GREEN) + `4da1f3b` (test/GREEN spec-cell corrections — the two cells fixed while making the suite green; initially left unstaged, caught by the post-close-out worktree check)

## TDD Gate Compliance

- Task 2: RED `5b98d25` (10 failing cells against the tsc-clean placeholder stub; 2 vacuously-green regression locks — the outside-provider + registry-blob cells) → GREEN `53984bc` (12/12) ✓ — two spec cells were corrected en route (`4da1f3b`: a waitFor asserted the wrong call on the no-refs path, and a duplicate-testid query)
- Task 1 is not TDD-flagged: behavior-locked by the e2e cell (green at Task 2's gate — see deviation 2) + the full unit suite

## Files Created/Modified

- `src/fixtures/figure-assets.ts` — NEW: `fixtureAssetRegistry` (Map figure-heavy → 7 AssetRecordRow-shaped rows; Blob at module init, deterministic createdAt), assetIds = img-<sha256 slice 12>, sync byte-magic self-verification (the 11-01 precedent)
- `src/content/assets/AssetProvider.tsx` — NEW: `AssetProvider` (resolve loop: figureAssetIds → registry-first / bulkGetAssets-second, revoked-guarded create/revoke), `useAssetUrl` optional-context hook, `figureAssetIds` container-recursing walk
- `tests/unit/content/asset-provider.test.tsx` — NEW: 12 cells — optional context, registry-first ordering (Dexie spy), per-ref create discipline + inert orphans, missing-row/ok:false calm unresolved, unmount/article-switch/StrictMode create-revoke symmetry, block-walk order + dedupe, registry Blob backing
- `src/fixtures/articles/figure-heavy.canonical.json` — two figure srcs → asset: refs + width/height + originalSrc; alt/caption byte-identical (git diff shows only src/originalSrc/width/height lines)
- `src/fixtures/index.ts` — re-exports fixtureAssetRegistry (src/fixtures stays the one import surface)
- `src/ingestion/AddDialog.tsx` — url/paste + file arms thread `result.assets` into `save(article, assets)`; book arm threads `bookAssetsForChapters(...)` (block-walk attribution) into saveBook
- `src/ingestion/IngestionClient.ts` — `EpubIngestionSuccess.assets: ValidatedAsset[]` via validateEnvelopeAssets (see deviation 1)
- `src/content/render/BlockRenderer.tsx` — FigureMedia component (img-on-resolved-branch / placeholder surface / onError broken swap); figure case delegates the media box, figcaption branch untouched
- `src/routes/ArticleView.tsx` — AssetProvider wraps the `<article>` element (both the visible body and the hidden measurement body inside)
- `src/app.css` — `--figure-media-max-h` + `--figure-placeholder-ratio` in :root; `.article-body figure > img` geometry rule; `.figure-placeholder` surface (zero transition/animation — D20-09 trivially satisfied)
- `tests/e2e/ingestion/happy-path.spec.ts` — third cell: asset-envelope URL ingest → local img naturalWidth > 0 + blob: src
- Realigned (sanctioned): `tests/component/BlockRenderer.test.tsx` (legacy-src figure → placeholder cells + the empty-alt note cell), `tests/unit/annotations/list-highlight-render.test.tsx` (media-surface no-marks cell), `tests/component/AddDialog.test.tsx` (mock gains `assets: []` — the 20-02 ripple precedent)

## Decisions Made

- originalSrc on the regenerated fixture keeps the wikimedia URLs — it IS the D20-12 provenance ("where the bytes would have come from") and mirrors exactly what `rewriteFiguresWithAssets` writes for accepted figures; the Task-1 acceptance grep (`rg upload.wikimedia` → 0) was over-broad and conflicts with the task's own "add originalSrc" instruction — the verified property is zero remote URLs under any `src` key
- `EpubIngestionSuccess.assets` is the flat `ValidatedAsset[]` (parallel to the single-article `IngestionSuccess.assets`) rather than BookAsset-shaped: the envelope carries no articleId, so chapter attribution is model-driven and lives in AddDialog's walk; 20-06 L90's "verify the shapes line up; adjust the AddDialog book call only if the shape differs" anticipates exactly this seam
- FigureMedia is a child component rather than inline case code because the broken-swap `useState` + `useAssetUrl` cannot live inside BlockView's per-kind switch (rules-of-hooks); extracting ONLY the media box keeps the figcaption branch literally in place — the strictest reading of the byte-identical acceptance
- The placeholder's default aspect comes from an inline `var(--figure-placeholder-ratio)` (per plan text) while the height cap lives in the CSS class for BOTH media surfaces — Pattern 4's "capped in height so a placeholder never exceeds a page"

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] EpubIngestionSuccess.assets extension (file beyond Task 1's list)**
- **Found during:** Task 1 (AddDialog book-arm wiring)
- **Issue:** the plan mandates "the book path passes chapter assets into saveBook", but EpubIngestionSuccess carried no assets — AddDialog had nothing to thread (a literal `[]` would be a stub contradicting the must_haves truth "threads success.assets into save/saveBook")
- **Fix:** `EpubIngestionSuccess.assets: ValidatedAsset[]` computed inside ingestEpub via the 20-02-exported `validateEnvelopeAssets` (its doc comment anticipated exactly this reuse); empty until 20-06 fills the envelope — 20-06-PLAN L90 explicitly states "AddDialog wiring already threads from 20-04 Task 1"
- **Files modified:** src/ingestion/IngestionClient.ts (+ tests/component/AddDialog.test.tsx mock ripple)
- **Verification:** tsc clean; full unit suite green
- **Committed in:** c70e8d1

**2. [Rule 3 - Sequencing] Task 1's e2e cell could only go green after Task 2's renderer**
- **Found during:** Task 1 verification (first e2e run)
- **Issue:** the cell asserts `figure img` naturalWidth > 0, impossible while the pre-Task-2 renderer emits `<img src="asset:…">` (unloadable scheme) — the plan orders the spec (Task 1) ahead of the renderer it asserts (Task 2)
- **Fix:** committed the cell with Task 1 carrying an explicit sequencing note (the 20-02 scaffolding-cast precedent: ship one task ahead with a note, verify the moment the consumer lands); the cell went green at Task 2's gate (3/3 chromium) and Task 1's acceptance is satisfied at plan level
- **Files modified:** tests/e2e/ingestion/happy-path.spec.ts
- **Verification:** 3/3 happy-path cells green on chromium post-Task-2
- **Committed in:** c70e8d1 (cell) + 53984bc (renderer that closes it)

**3. [Rule 1 - Acceptance-overbroad] wikimedia-grep vs originalSrc provenance**
- **Found during:** Task 1 acceptance run
- **Issue:** `rg upload.wikimedia figure-heavy.canonical.json` returns 2 — both are the MANDATED originalSrc provenance fields (D20-12), not srcs; the check contradicts the task's own action text
- **Fix:** kept originalSrc per the action + D20-12; verified the security-relevant property instead (`rg '"src": "https'` → 0 matches; no remote URL reaches an img by construction)
- **Files modified:** none (decision)
- **Verification:** zero remote src keys; schema parse green in the full unit suite
- **Committed in:** c70e8d1

**4. [Rule 1 - Sanctioned realignment] legacy-img spec cells**
- **Found during:** Task 2 (full unit suite first run)
- **Issue:** BlockRenderer.test.tsx + list-highlight-render.test.tsx asserted `<img>` elements for remote-src figures — now the placeholder by design (UI-SPEC §Regression Targets deliberate change #1: "Legacy remote-src figures render placeholders — 19-05 strengthen-only precedent, specs change honestly")
- **Fix:** realigned with per-cell justification comments citing D20-14/IMG-03; strengthened with the empty-alt `Image unavailable.` note cell (the verbatim-copy acceptance)
- **Files modified:** tests/component/BlockRenderer.test.tsx, tests/unit/annotations/list-highlight-render.test.tsx
- **Verification:** full unit suite 1532/0/13
- **Committed in:** 53984bc

---

**Total deviations:** 4 auto-fixed (1 missing critical, 1 sequencing blocker, 2 honest-realignment)
**Impact on plan:** All four were correctness/honesty requirements of the planned design (the plan's own action text and the UI-SPEC's sanctioned-changes list). No scope creep; one file beyond the plan's list (IngestionClient.ts, +14 lines).

## Issues Encountered

- Long base64 literals were transcription-mangled when hand-pasted into figure-assets.ts (3 of 7 samples) — caught by an immediate hash re-verification loop, fixed by regenerating the literals programmatically from the source bytes; the committed registry is hash-verified against its assetIds (12/12 spec + a dedicated round-trip cell)
- jsdom lacks URL.createObjectURL/revokeObjectURL — the spec installs recording stubs per test (the 20-03 harness-platform discipline; production code unchanged)

## User Setup Required

None — no external services, no new packages (composition over 20-01/02/03 outputs, exactly as PATTERNS predicted; the fixture bytes were generated with locally-installed ffmpeg/libwebp/sips at authoring time and are embedded as constants).

## Threat Surface

All four threat-register mitigations landed as planned: T-20-05 (img only on the resolved object-URL branch — structural; route-abort proof in 20-08-T1), T-20-15 (reserved aspect boxes + media-height cap), T-20-16 (provider-owned create/revoke symmetry, unit-proven incl. StrictMode), T-20-17 (unresolved ref renders the placeholder inside the same reserved box). No new security-relevant surface beyond the plan's threat model.

## Next Phase Readiness

- 20-05 (portability) consumes the fixture refs + the orphan-entries-inert discipline; loadAllAssets/bulkGetAssets unchanged
- 20-06 (EPUB) fills the book envelope its AddDialog wiring already threads; `validateEnvelopeAssets` + the BookAsset attribution walk are in place
- 20-08 (verification) consumes the registry (decode-matrix seeding for all 5 formats × 3 engines), the EXIF-rotated sample (geometry spec), and the four imagery spec surfaces; corpus spot-checks here were fully green (open-every-fixture 31/31, reading-views, capture-highlight 9/9 on chromium) — the registry-first design means figure-heavy renders real local imgs with zero network
- IMG-03/IMG-05/IMG-06 stay Pending in REQUIREMENTS.md by design — all three close at 20-08's 3-engine proofs, mirroring the 20-01/02/03 split precedent

## Self-Check: PASSED

- Created files exist: src/fixtures/figure-assets.ts ✓, src/content/assets/AssetProvider.tsx ✓, tests/unit/content/asset-provider.test.tsx ✓
- All three task commits present in git log: c70e8d1, 5b98d25, 53984bc ✓
- Verification commands re-run: `npx vitest run tests/unit/content/asset-provider.test.tsx` → 12/12 ✓; `npx playwright test tests/e2e/ingestion/happy-path.spec.ts --project=chromium` → 3/3 ✓; full unit suite → 1532 passed / 0 failed / 13 documented skips ✓; `rg '"src": "https' src/fixtures/articles/figure-heavy.canonical.json` → 0 ✓; transition/animation inside the new CSS rules → 0 ✓; `--figure-media-max-h`/`--figure-placeholder-ratio` declarations present ✓; figcaption JSX byte-identical (git diff) ✓; corpus spot-checks (open-every-fixture, reading-views, capture-highlight) green on chromium ✓

---
*Phase: 20-safe-local-image-fidelity*
*Completed: 2026-08-31*
