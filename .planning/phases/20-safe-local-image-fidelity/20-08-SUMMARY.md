---
phase: 20-safe-local-image-fidelity
plan: 08
subsystem: verification
tags: [e2e, imagery, offline-proof, reserved-geometry, decode-matrix, refusal-matrix, axe, img-03, img-05, img-06, corpus-realignment]

# Dependency graph
requires:
  - phase: 20-safe-local-image-fidelity (Plan 04)
    provides: AssetProvider/useAssetUrl + FigureMedia reserved-geometry renderer + fixtureAssetRegistry + regenerated figure-heavy corpus
  - phase: 20-safe-local-image-fidelity (Plan 06)
    provides: EPUB container-extraction model changes (D12-16 retirement) the corpus sweep realigns against
provides:
  - tests/e2e/imagery/ — the four 3-engine specs proving IMG-03/05/06 in real browsers: offline-reopen (non-vacuous route-abort guard + zero third-party requests), geometry (reserved-vs-rendered aspect, page-count identity across load events, both-mode placeholder, tall-figure cap), decode-matrix (5 formats × 3 engines), refusal-matrix (D19-01 caption marks inside refused figures + the IMG-05 AxeBuilder placeholder scan)
  - capture.ts placeholder-surface caption alignment fix (Rule 1) — refused/legacy figure captions are genuinely highlightable (D19-01 holds through the 20-04 placeholder); the empty-alt "Image unavailable." note refuses ineligible (no silent wrong anchors)
  - Strengthen-only corpus realignment with per-decision D20 citations (open-every-fixture figure-heavy cell strengthened to local decoded imgs)
  - deferred-items.md webkit ledger updated 3 → 4 documented e2e skips for the 20-07 gate
affects: [20-07 full-suite gate (counts the 4-skip residual set; IMG closure ledger), any future capture/annotation work (the figcaption-element alignment contract)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Guard-instrument non-vacuity probe: before asserting an empty external-request array, a first cell proves BOTH instrument halves fire live (an in-page fetch IS aborted AND IS collected) — the Pitfall 1 discipline applied to negative-space assertions"
    - "Registry-backed seeding under the fixture id: a plain Dexie article row with id figure-heavy shadows the bundled fixture (ingested wins) while the AssetProvider resolves its asset: refs through the in-memory registry — engine-complete seeding with ZERO IndexedDB Blob puts (the plan's own fixture-registry seeding option; the decode truth is the engine codec, not the storage)"
    - "Uncapped-viewport identity vs capped-clamp pinning: the aspect-identity cell raises the viewport above the media cap so stored dims size the box exactly; the tall-figure cell pins the clamp behavior (attrs pin width, cap clamps height, object-fit keeps the paint undistorted)"

key-files:
  created:
    - tests/e2e/imagery/_helpers.ts
    - tests/e2e/imagery/offline-reopen.spec.ts
    - tests/e2e/imagery/geometry.spec.ts
    - tests/e2e/imagery/decode-matrix.spec.ts
    - tests/e2e/imagery/refusal-matrix.spec.ts
  modified:
    - src/annotations/capture.ts
    - tests/unit/annotations/capture-offset-mapping.test.ts
    - tests/e2e/open-every-fixture.spec.ts
    - .planning/phases/20-safe-local-image-fidelity/deferred-items.md

key-decisions:
  - "decode-matrix + the tall-geometry cell seed plain article rows under the registry-backed figure-heavy id (Dexie row shadows the fixture via ingested-wins; assets resolve from in-memory registry blobs) — 15/15 decode cells green on ALL three engines with zero engine skips, where Dexie-blob seeding would have forced webkit skips on every cell"
  - "Rule 1 production fix in capture.ts: Phase 19's caption alignment assumed alt is an img attribute; the 20-04 placeholder renders alt as DOM text, so every refused/legacy figure caption capture misaligned to empty-span (the plan's own D19-01 must-have truth was unprovable). Caption endpoints now align against the state-independent figcaption element; placeholder alt anchors from windowStart 0; the empty-alt note refuses ineligible"
  - "Geometry semantics pinned honestly: under the media cap the width/height attributes pin width while the cap clamps height (the box ratio diverges from stored; object-fit: contain keeps the PAINT undistorted — the UI-SPEC letterbox acceptance). The aspect-identity cell asserts the UNCAPPED exact identity at a raised viewport; the tall cell asserts the clamp — no pin stronger than the design"
  - "offline-reopen's Dexie-asset cell carries the documented webkit skip (deferred-items boundary); the offline GUARANTEE itself stays engine-complete via the fixture-corpus + legacy-remote cells (guard + collector live on every engine)"

patterns-established:
  - "Non-vacuity probe cell for negative-space guards (prove the instrument, then assert the empty array)"
  - "Registry-backed-id seeding: engine-complete asset resolution for imagery specs without Blob puts"

requirements-completed: [IMG-03, IMG-05, IMG-06]

# Metrics
duration: 27min
completed: 2026-08-31
status: complete
---

# Phase 20 Plan 08: 3-Engine Imagery Matrix + Corpus Pin Realignment Summary

**The four imagery specs prove 20-04's renderer guarantees in real browsers — zero third-party requests on reopen via a probe-verified route-abort guard (50/1/0 cells across chromium/firefox/webkit), reserved geometry with page-count identity across decode, 15 per-format decode cells, calm refusals with D19-01 caption marks and a clean axe scan — over a strengthen-only corpus realignment and one honest Rule 1 fix making refused-figure captions genuinely highlightable**

## Performance

- **Duration:** 27 min
- **Started:** 2026-08-31T19:53:31Z
- **Completed:** 2026-08-31T20:21:22Z
- **Tasks:** 2
- **Files modified:** 9 (5 created, 4 modified)

## Accomplishments

- **IMG-03 proven end-to-end (T-20-05)**: offline-reopen registers the abort guard for every non-localhost http(s) URL BEFORE any navigation, proves the instrument live (an in-page probe fetch IS aborted AND IS collected), then asserts the external-request array empty across three reopen shapes — the fixture-corpus figure article (all engines), the Dexie-persisted asset-row article (chromium+firefox, documented webkit boundary), and the legacy remote-src article whose placeholder renders with the remote URL never requested (all engines)
- **IMG-05/06 proven (T-20-15)**: geometry pins the reserved-vs-rendered identity (client box ratio == stored w/h at an uncapped viewport, including the EXIF-rotated fixture whose DECODED natural ratio matches the orientation-corrected stored box), page-count identity across a full walk that decodes both fixture imgs (no PaginationFallbackBanner), the placeholder in BOTH reading modes with captions visible, and the tall-figure clamp under the media cap with pagination intact
- **D20-08 decode matrix**: jpeg/png/webp/gif/avif × chromium/firefox/webkit — 15 green cells, each asserting blob: src + naturalWidth > 0 + the D20-13 attribute round-trip, via the plan's fixture-registry seeding option (engine-complete, zero skips)
- **D20-14/D19-01 proven**: refused + legacy figures render the identical placeholder with visible alt and surviving captions; the caption-mark cell captures a real highlight INSIDE a refused figure's figcaption through the live toolbar and asserts the rendered mark (plus zero marks on the media surface, D19-02); the article opens normally in both modes
- **IMG-05 axe row closed**: refusal-matrix runs the AxeBuilder scan (WCAG_TAGS, the a11y.spec.ts precedent) against the seeded placeholder state — zero serious/critical violations plus the heading-order/list guards, on all three engines (the scan lives here because post-regen no swept fixture renders a placeholder)
- **Corpus honesty (T-20-29)**: open-every-fixture's figure-heavy cell STRENGTHENED with the D20-12 citation (two local decoded imgs where the old pin asserted only "body renders"); stale remote-Wikimedia comments realigned with citations; library/pagination needed ZERO changes (20-04/20-06 had realigned their own sanctioned cells — 160/160 chromium green, uncited)

## Task Commits

Each task was committed atomically:

1. **Task 1: The four imagery specs** — `be5d3be` (feat; includes the Rule 1 capture.ts fix + its unit cells + the deferred-items ledger update)
2. **Task 2: Corpus pin realignment** — `48cf757` (test; strengthen-only with citations)

**Plan metadata:** final docs commit (this commit)

## TDD Gate Compliance

Not a TDD-flagged plan (type: execute). The refusal-matrix caption cell functioned as the failing probe for the Rule 1 fix: RED observed in-browser (empty-span refusal, toolbar stuck on the idle hint), fix applied, cell green across all three engines, plus three permanent unit cells (c3/c4/c5) locking the behavior.

## Files Created/Modified

- `tests/e2e/imagery/_helpers.ts` — NEW: registry sample table + verification, makeFigureArticle (ArticleSchema-validated figure blocks), seedImageryArticle (prepareFreshPage + seedRows), visible-surface figure/placeholder locators, waitForDecoded, findPageWith (walk-pages)
- `tests/e2e/imagery/offline-reopen.spec.ts` — NEW: armGuard (pre-navigation abort route + collector), the four cells (probe / fixture-corpus / Dexie-rows / legacy-remote)
- `tests/e2e/imagery/geometry.spec.ts` — NEW: aspect identity (raised viewport), page-count identity walk, both-mode placeholder, tall-figure cap
- `tests/e2e/imagery/decode-matrix.spec.ts` — NEW: 5 formats × 3 engines via registry-backed seeding
- `tests/e2e/imagery/refusal-matrix.spec.ts` — NEW: placeholder/alt/caption cells, D19-01 caption-mark cell, both-mode open cells, the IMG-05 axe scan
- `src/annotations/capture.ts` — figure alignment rewritten: caption endpoints align against the figcaption element (state-independent); placeholder-alt endpoints from windowStart 0 (separator-skip branch absorbs the DOM's missing BLOCK_SEPARATOR); empty-alt note refuses ineligible
- `tests/unit/annotations/capture-offset-mapping.test.ts` — cells c3 (placeholder caption → true offset), c4 (fallback note → ineligible, no position), c5 (visible-alt anchor + boundary-granularity documentation)
- `tests/e2e/open-every-fixture.spec.ts` — strengthen-only figure-heavy cell + three D20-12-cited comment realignments
- `.planning/phases/20-safe-local-image-fidelity/deferred-items.md` — webkit ledger 3 → 4 for the 20-07 gate

## Decisions Made

- **Registry-backed-id seeding** (decode-matrix + tall-geometry): seeding a plain article row under id "figure-heavy" exploits two shipped contracts — ingested-wins id collision (composite repository) and registry-first asset resolution (AssetProvider) — so figures resolve from in-memory blobs with createObjectURL never touching IndexedDB. The engine-codec truth is complete on webkit; the Dexie-blob TRANSPORT is separately proven (offline cell + happy-path + 20-06 epub cell)
- **The Rule 1 fix is a production change in a "no production code changes" plan**: the plan's own must-have truth ("captions still highlightable … per D20-14, D19-01 — refusal-matrix.spec") was structurally unprovable — Phase 19's caption alignment predates the 20-04 placeholder. Fixing the alignment is the plan's intent (prove the guarantees; never weaken the spec); the fix is minimal, unit-locked, and regression-proven (1580 unit + 273 annotation e2e + epub-intake/a11y cross-checks green)
- **Geometry pins match the shipped design, not an idealized one**: under the media cap, attrs pin width and the cap clamps height (ratio diverges; object-fit keeps the paint undistorted — UI-SPEC letterbox acceptance + Auto-Resolved #8). The identity cell raises the viewport above the cap; the tall cell pins the clamp. No pin stronger than the design; nothing weakened
- **The axe scan assertion set mirrors a11y.spec.ts exactly** (WCAG_TAGS + serious/critical filter + the heading-order/list explicit guards) — same bar, seeded placeholder state

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Refused/legacy figure captions were NOT highlightable — Phase 19 caption alignment vs the 20-04 placeholder surface**
- **Found during:** Task 1 (refusal-matrix caption-mark cell, first chromium run)
- **Issue:** capture.ts's figure alignment assumed the figure element's textContent is caption-only ("alt is an `<img>` attribute, not a text node"). The 20-04 placeholder renders the alt as VISIBLE DOM TEXT (D20-06), so every caption endpoint in a refused/legacy figure misaligned against the caption-only window — both endpoints clamped equal and the toolbar refused with "empty-span". The plan's D19-01 must-have truth was unprovable
- **Fix:** caption endpoints align against the figcaption ELEMENT (text byte-identical in every media state — D19-01) with the caption window; placeholder-alt endpoints align from windowStart 0 (the alt IS substrate text; buildRawToNormMap's separator-skip branch absorbs the missing BLOCK_SEPARATOR); the empty-alt "Image unavailable." note — placeholder chrome with no substrate coordinates — refuses `ineligible` whole (D19-02's gap rule extends to the media surface; no silent wrong anchors)
- **Files modified:** src/annotations/capture.ts, tests/unit/annotations/capture-offset-mapping.test.ts
- **Verification:** unit 20/20 in the capture spec; full unit suite 1580 passed / 0 failed / 13 documented skips; annotations e2e 273 passed / 0 failed across all three engines; epub-intake + a11y chromium cross-checks 29/29
- **Committed in:** be5d3be

**2. [Rule 3 - Engine boundary] WebKit cannot seed Dexie asset rows (pre-existing, documented)**
- **Found during:** Task 1 design (anticipated by the plan's read_first pointers to 20-05/20-06)
- **Issue:** offline-reopen's "ingested article + Dexie asset rows" cell seeds Blob values through raw IndexedDB — impossible on Playwright WebKit (deferred-items.md, probe-verified twice)
- **Fix:** documented `test.skip(browserName === "webkit")` on exactly that cell (the 20-05/20-06 honest pattern); the offline guarantee stays engine-complete via the fixture-corpus + legacy-remote cells; every other imagery cell runs on all engines (decode-matrix via registry seeding); deferred-items.md residual count 3 → 4 for the 20-07 gate
- **Files modified:** tests/e2e/imagery/offline-reopen.spec.ts, .planning/phases/20-safe-local-image-fidelity/deferred-items.md
- **Verification:** tests/e2e/imagery across 3 engines → 50 passed / 1 documented skip / 0 failed
- **Committed in:** be5d3be

---

**Total deviations:** 2 auto-fixed (1 production bug the plan existed to surface, 1 pre-existing engine boundary handled per the phase ledger)
**Impact on plan:** Both were required to execute the plan's own mandates (the D19-01 truth; the 3-engine gate). The production delta is one function in capture.ts (+ its unit cells) — flagged here and in the commit message because the plan's artifacts list said "no production code changes"; the change proves the plan's must-have rather than weakening any spec.

## Issues Encountered

- First-run geometry assertions were stronger than the shipped cap semantics (capped boxes pin width via attrs; ratio equality only holds uncapped) — pinned honestly: raised-viewport identity cell + clamp cell, instead of filing a non-bug as a 20-04 regression
- The open-every-fixture strengthening initially raced paginated mode (page-1 fragments carry no figures; the count poll caught the transient pre-pagination scrolling mount) — reshaped to the proven mode-swap + visible-body discipline

## User Setup Required

None — no external services, no new packages.

## Threat Surface

Both proof-half threat mitigations landed as planned: T-20-05 (pre-navigation route-abort guard + probe-verified collector + asserted-empty arrays across three reopen shapes), T-20-15 (page-count identity across a decoding walk + no-fallback-banner + tall-figure clamp cell). T-20-29 held: the only corpus change is strengthen-only with inline D20-12 citations; library/pagination untouched; git diff proves test-only files in Task 2. The capture.ts fix narrows surface (a wrong-anchor class becomes a typed refusal).

## Next Phase Readiness

- 20-07 (closure ledger + full-suite gate) must count the 4 documented e2e skips (2× 20-05, 1× 20-06, 1× 20-08) and record IMG-03/05/06 as closed HERE (20-04's deferred render-half truths are now browser-proven; the webkit transport residual is a test-engine limit documented in deferred-items.md, not a product gap)
- The figcaption-element alignment contract is now the shape any future capture work (e.g. ANNO-13 cross-page selections) builds on

## Verification Evidence

- `npx playwright test tests/e2e/imagery --project=chromium --project=firefox --project=webkit` → **50 passed / 1 documented skip / 0 failed** ✓
- `npx playwright test tests/e2e/open-every-fixture.spec.ts --project=chromium` → 9/9 ✓ (Task 2 gate)
- `npx playwright test tests/e2e/library tests/e2e/pagination --project=chromium` → 160/160 ✓ (Task 2 gate)
- `npm run test:unit -- --run` → 1580 passed / 0 failed / 13 documented skips ✓
- `npx playwright test tests/e2e/annotations` (3 engines) → 273/273 ✓ (capture-fix regression proof)
- `npx playwright test tests/e2e/epub-intake.spec.ts tests/e2e/a11y.spec.ts --project=chromium` → 29/29 ✓ (figure-surface cross-check)
- `npx tsc --noEmit` → clean ✓
- Acceptance greps: `page.route` present in offline-reopen.spec.ts ✓ (prohibitions); guard registered pre-navigation (armGuard before every navigation) ✓; external array asserted `toEqual([])` in all three article cells ✓; every realigned expectation in open-every-fixture carries a D20-12 citation ✓; Task 2 git diff test-only ✓

## Self-Check: PASSED

- Created files exist: tests/e2e/imagery/{_helpers,offline-reopen,geometry,decode-matrix,refusal-matrix} ✓ (5/5 FOUND)
- Task commits present in git log: be5d3be, 48cf757 ✓
- Verification commands re-run with the recorded results above (imagery 3-engine gate re-verified after the final edit) ✓

---
*Phase: 20-safe-local-image-fidelity*
*Completed: 2026-08-31*
