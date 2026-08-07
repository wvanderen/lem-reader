---
status: resolved
resolved_by: "05-06"
trigger: "Diagnose pagination regression: P1 overloaded, P2-P4 nearly empty (UAT Phase 5 Test 11, aeon essay-long-form fixture). find_root_cause_only."
created: 2026-08-07T20:00:00Z
updated: 2026-08-07T20:30:00Z
---

## Current Focus

ROOT CAUSE CONFIRMED via empirical Playwright reproduction (throwaway specs, since removed).
hypothesis: CONFIRMED — pageContentBoxHeightPx is set to the scrolling-body natural height on initial load → engine packs entire article on 1 page.
next_action: return diagnosis (find_root_cause_only — no fix).

## Symptoms

expected: Paginated mode produces even, viewport-sized page fragments with content distributed across pages (Phase 4 contract).
actual: Pagination broken — page sizes wildly uneven. For aeon.co essay-long-form fixture ("The looting of science fiction"): P1 = nearly ENTIRE article (keyboard-shortcuts help, title/byline, "1 of 4", intro paragraph, multiple body paragraphs, AND the Thiel blockquote). P2 ~2 sentences. P3 ~1 sentence. P4 ~2 sentences. 4 pages produced, content distribution severely broken.
errors: None reported (no crash; just wrong page distribution).
reproduction: UAT Phase 5 Test 11. Open essay-long-form fixture in paginated mode.
started: After Phase 5 (05-05) changes: fragmentRenderer data-block-index on fragment blocks + domMeasurer/engine selector re-scope.

## Evidence

- timestamp: 2026-08-07T20:00
  checked: DOM nesting in ArticleView paginated branch (src/routes/ArticleView.tsx:1125-1198)
  found: `<article class="article-body paginated-surface">` contains BOTH `<div class="article-body-measurement"><ArticleBody highlights={[]}/></div>` (full N blocks) AND `<PaginatedSurface>` (renders `<section class="page-fragment">` with sliced blocks). articleEl = the shared <article>.
  implication: At measure time, articleEl contains measurement-body blocks (descendants of .article-body-measurement, NOT .page-fragment) + page-fragment blocks (descendants of .page-fragment).

- timestamp: 2026-08-07T20:00
  checked: Selector logic `[data-block-index]:not(.page-block-index])` evaluation (src/measurement/domMeasurer.ts:106-110, engine.ts:243-251)
  found: Selector means "elements with data-block-index that are NOT descendants of .page-fragment". This is valid Selectors L4 (complex selector inside :not). Measurement-body blocks are NOT descendants of .page-fragment → INCLUDED. Page-fragment blocks ARE descendants of .page-fragment → EXCLUDED.
  implication: Selector returns the measurement-body's N blocks; count matches article.blocks.length so engine defense (engine.ts:164) passes. Logic appears SOUND on paper.

- timestamp: 2026-08-07T20:00
  checked: Pagination algorithm (src/pagination/fragment.ts:142-325)
  found: Fit decision uses measurement.blocks[i].heightPx (Case A: heightPx <= remainingPx → place whole). Split decision uses measurement.blocks[i].lineBoxes via chooseSplit. If heights are near-zero, all blocks fit on P1 → would produce ~1 page. To get 4 pages with P1 overloaded, something else is happening.
  implication: If P1 holds nearly everything AND there are 4 pages, either heights are tiny (engine crams P1) then overflow-guard splits off tiny tail pages, OR lineBoxes are empty causing split failures that push whole blocks.

- timestamp: 2026-08-07T20:00
  checked: Post-render overflow guard (src/pagination/overflowGuard.ts, PaginatedSurface.tsx:361-458)
  found: After pagination commits, guard measures live .page-fragment scrollHeight vs articleEl.clientHeight. If overflow, refragmentOverflowingPage splits at first offending child. Iterates (each setPages re-fires). chooseLargestWidowLegalSplit reads LIVE DOM line boxes.
  implication: If engine produces 1 overloaded page, guard SHOULD split iteratively until no overflow. Symptom (P1 still huge, P2-P4 tiny) suggests guard split off only small tail chunks OR guard isn't iterating OR engine itself produces the 4 uneven pages.

- timestamp: 2026-08-07T20:00
  checked: Measurement body CSS (src/app.css:893-924)
  found: .article-body-measurement { position:absolute; top:0; left:0; width:100%; visibility:hidden; pointer-events:none } inside .article-body.paginated-surface { position:relative; overflow:hidden; height:calc(100vh - ...) }. visibility:hidden preserves layout boxes (getBoundingClientRect returns real heights).
  implication: Heights should be real. width:100% should match page-fragment width. No obvious CSS regression.

## Eliminated

- hypothesis: Phase 5 selector `[data-block-index]:not(.page-fragment [data-block-index])` is invalid or returns wrong/zero heights.
  evidence: DISPROVEN by empirical Playwright probe. `querySelectorAll` returns exactly 8 elements (the measurement-body blocks), correctly excluding the 3 page-fragment blocks (selectorAllCount=11, scopedCount=8). Measured heights are CORRECT (desktop: p0=172.78, p1=201.58, p2=172.78, blockquote=115.19, p4=143.98, p5=143.98, p6=172.78, p7=28.80; sum ≈1151px). Line boxes (Range.getClientRects over text nodes) are populated correctly (5-18 per block). The selector is valid Selectors L4 (complex selector inside :not()) and behaves exactly as intended.
  timestamp: 2026-08-07T20:20

- hypothesis: Phase 5 selector change INTRODUCED the regression.
  evidence: DISPROVEN. Checked out the last Phase 4 commit eac0845 (before ANY Phase 5 change: e572436 and later) and ran the same diagnostic. RAW engine output is ALSO pagesLength=1 (1 mega-page). The 1-mega-page bug is LATENT since Phase 4 (the pageContentBoxHeightPx geometry code dates to 04-06/04-09). Phase 5 merely re-scoped the selector; the selector is behavior-preserving for measurement (returns the same 8 measurement-body blocks with the same heights as Phase 4's `[data-block-index]`).
  timestamp: 2026-08-07T20:40

- hypothesis: trustedView heights are near-zero (measurement collapsed).
  evidence: DISPROVEN. The re-pagination that follows (when pageContentBoxHeightPx re-reads 654) produces correctly-distributed pages (3 pages desktop, 6 pages phone) with correct splits (e.g. blockquote split 165/298). If trustedView heights were near-zero, the re-pagination would ALSO cram everything on 1 page. It does not. Heights are correct; the page HEIGHT is wrong on the first pass.
  timestamp: 2026-08-07T20:30

## Evidence

- timestamp: 2026-08-07T20:00
  checked: DOM nesting in ArticleView paginated branch (src/routes/ArticleView.tsx:1125-1198)
  found: `<article class="article-body paginated-surface">` contains BOTH `<div class="article-body-measurement"><ArticleBody highlights={[]}/></div>` (full N blocks) AND `<PaginatedSurface>` (renders `<section class="page-fragment">` with sliced blocks). articleEl = the shared <article>.
  implication: At measure time, articleEl contains measurement-body blocks (descendants of .article-body-measurement, NOT .page-fragment) + page-fragment blocks (descendants of .page-fragment).

- timestamp: 2026-08-07T20:00
  checked: Selector logic `[data-block-index]:not(.page-fragment [data-block-index])` evaluation (src/measurement/domMeasurer.ts:106-110, engine.ts:243-251)
  found: Valid Selectors L4. Empirically returns 8 measurement-body blocks (excludes 3 page-fragment blocks). COUNT matches article.blocks.length (8), so engine defense (engine.ts:164) passes. Heights correct.
  implication: Selector is innocent.

- timestamp: 2026-08-07T20:25
  checked: RAW engine output (first __lemPagination publication, before overflow guard) across phone/tablet/desktop viewports — throwaway Playwright probe.
  found: pagesLength=1 on ALL THREE viewports — engine packs ALL 8 blocks whole on a single page. For 8 blocks (height sum ≈1151px desktop, ≈2523px phone) to all fit on one page, the engine's pageContentBoxHeightPx must be ≥ the sum — i.e. the SCROLLING-BODY height (~1148-1313px), NOT the pinned paginated-surface height (desktop 654, phone 494).
  implication: pageContentBoxHeightPx is wrong (inflated to scrolling height) on the first pagination pass. This is "P1 contains nearly the ENTIRE article" — the user's primary symptom.

- timestamp: 2026-08-07T20:30
  checked: State evolution polling (every 60ms for 3.5s) of pagesLength + article height — throwaway Playwright probe.
  found: t=0-367ms: scrolling branch mounted (article className="article-body", NOT paginated-surface). t=437ms: pagesLen=1 (first pagination, already paginated-surface class, articleH=654). t=499→866ms: pagesLen 2→3 (correction as pageContentBoxHeightPx re-reads 654). The first geometry-effect rAF fires while the SCROLLING branch is mounted (trustedView null → scrolling branch renders first) and captures the tall scrolling height (~1148-1313). Only after trustedView commits does the branch flip to paginated-surface and the geometry effect re-read 654.
  implication: The 1-mega-page is produced because pageContentBoxHeightPx leaks the scrolling-body height into the first pagination pass. The synchronous reset (ArticleView.tsx:658-662, Plan 04-09) only fires on MODE SWAPS (isPaginated !== prevIsPaginated); on initial load paginated is the default from the start, so NO reset fires and the stale scrolling height leaks through.

- timestamp: 2026-08-07T20:40
  checked: Phase 4 commit eac0845 (before Phase 5) — same RAW diagnostic.
  found: RAW engine output is ALSO pagesLength=1 (1 mega-page).
  implication: Bug is LATENT since Phase 4, NOT introduced by Phase 5. Phase 5's selector is a red herring. The bug was masked because (a) the downstream re-pagination corrects it within ~0.5-0.9s (racy — the user observed the uncorrected/partially-corrected state), and (b) the automated no-overflow e2e (tests/e2e/pagination/no-overflow-invariant.spec.ts) is fooled: it waits 600ms (past the correction) AND `.page-fragment { height: 100% }` makes fragmentEl.scrollHeight === articleEl.clientHeight for non-overflowing pages, so it never asserts the broken initial state.

- timestamp: 2026-08-07T20:35
  checked: Seeded-highlight reproduction (user's "registers on load" condition) — throwaway probe using seedHighlightRecord pattern.
  found: SETTLED state (3s) is still reasonable (3 pages desktop, 6 phone). The highlight does NOT change the root cause; it only adds re-render timing variability. The user's persistent "4 pages, P1 overloaded" is the uncorrected/partially-corrected 1-mega-page state observed before the racy re-pagination completes (machine/timing dependent).

## Resolution

root_cause: On initial article load in paginated mode (the default), `pageContentBoxHeightPx` (the page height passed to the pagination engine) is set to the SCROLLING-body's natural height (~1148-1313px) by ArticleView's geometry effect's first requestAnimationFrame callback. That rAF fires while the SCROLLING branch is still mounted — because trustedView is null on the first render, ArticleView renders the scrolling `<article class="article-body">` (no pinned height) instead of the paginated branch, so getBoundingClientRect().height returns the full natural article height. Only AFTER trustedView commits does the branch flip to `<article class="article-body paginated-surface">` (CSS height pinned to calc(100vh-...) ≈ 654px) and the geometry effect re-read 654. But the FIRST pagination pass already consumed the inflated height and packed the ENTIRE article onto a single page (P1 = everything). The Plan 04-09 synchronous reset (ArticleView.tsx:658-662) only fires on user MODE SWAPS (isPaginated !== prevIsPaginated); it does NOT cover initial load where paginated is the default mode from the start. The Phase 5 measurement-selector change is NOT the cause (exonerated: returns correct 8 blocks + correct heights; bug reproduces identically at the pre-Phase-5 commit eac0845).

fix: (deferred to gap-closure plan — find_root_cause_only) Ensure pageContentBoxHeightPx reflects the paginated-surface height (or 0) BEFORE the first pagination pass runs. Candidate directions: (a) gate the geometry read on the paginated-surface class being active (only read articleEl.height when classList.contains("paginated-surface")) so the scrolling-branch height is never captured; (b) reset pageContentBoxHeightPx to 0 on initial mount in paginated mode (not only on mode swap) so the pagination effect waits for the correct geometry; (c) derive the page height from the .page-fragment's intended content box rather than the shared articleEl whose geometry differs between branches. ALSO fix the no-overflow e2e to actually detect this: assert against the rendered content height / per-block bottoms (not the height:100%-clamped scrollHeight) and assert the RAW initial pagination, so the masked regression is caught.

verification: (pending — find_root_cause_only; no fix applied)
files_changed: []
