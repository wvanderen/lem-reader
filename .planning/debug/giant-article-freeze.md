# Debug Session — Giant article freezes tab / multi-second lag persists after 2 fix rounds

---
status: resolved
created: 2026-08-20
updated: 2026-08-20
trigger: "The slowness is still there. That article is so massive the browser thinks the tab is frozen trying to load it. In scroll mode you'll eventually reach white space where the article hasn't loaded yet. It'll snap in and the progress bar will catch up at the same time. Takes probably around 10 seconds to switch mode. If you wait a moment the first page turn is snappy but trying to turn it again and it takes around 5 seconds."
---

## Symptoms

**Article:** https://marxist.com/russia-how-the-bureaucracy-seized-power-part-one-the-russian-working-class-takes-power.htm — ingested in the library, ~100k+ graphemes, image-heavy. Reproduce in dev server (`npm run dev`).

1. **On open:** browser treats the tab as frozen ("page unresponsive") for seconds.
2. **Scrolling mode:** scrolling reaches WHITE SPACE where content "hasn't loaded yet"; it snaps in after ~5-10s and the progress hairline catches up at the same moment.
3. **Mode switch:** ~10 seconds to flip scrolling↔paginated.
4. **Paginated turns:** after waiting, FIRST turn is snappy; SECOND+ turns take ~5s each (suggests per-turn work re-arms — overflow-guard iterations, repagination, or re-measure).

## Prior fix rounds (already landed — do NOT re-litigate, verify)

- **260819-tld (9d4a24b, c1e230c, 9bd73ee):** grapheme segmentation caches — locale-keyed Intl.Segmenter cache, per-article grapheme index (O(1) pageStartGlobalOffset, O(pages) fragmentContainingOffset), per-element length cache, findAllOccurrences fast path.
- **260820-beo (d3267e5, 8bef7cd, d12d54a):** binary-search line walk in readLineBoxes (O(lines×log L) probes), time-sliced async measureAllBlocks (~10ms slices, scheduler.yield fallback setTimeout), Chromium longtask tripwire e2e (reported 0 entries — yet the user still freezes → the tripwire spec likely doesn't reproduce the real conditions: wrong fixture/viewport/no image load storm/no scroll, or DEV-mode overhead not exercised).

Both rounds' full unit suites + tsc green; behavior (offsets/coverage) unchanged.

## Evidence so far (code-read, unverified by profiler)

- Symptoms persist despite fixes ⇒ STOP GUESSING. **First action: real measurement.** Profile the actual article in the dev server via Playwright + CDP (longtask PerformanceObserver with attribution, trace categories or Tracing.start/stop, optional Manual screenshot timeline). Capture: open → scroll to bottom → mode switch → 5 page turns. Report top long tasks with attribution/stacks, total layout/paint/script time, and WHERE time goes per phase.
- Leading hypotheses to CONFIRM or ELIMINATE with data (in priority order):
  - H1: **Re-measure storm + forced full-page relayouts.** TriggerCoalescer fires on every img load (capture-phase load listener + ResizeObserver on articleEl, 400ms debounce → full measureAllBlocks). Image-heavy article scrolling ⇒ repeated full passes; between time-slices, image loads/style changes dirty layout ⇒ each getClientRects after a yield may force a FULL relayout of a gigantic DOM (the hidden `.article-body-measurement` + live body). Would explain freeze + white-space-snap-in + progress catching up.
  - H2: **Overflow-guard iteration per turn.** Guard runs after every page commit (deps [pages, currentPageIdx]); scrolling-geometry heights mispredict paginated rendering ⇒ correction loops: rAF + measure + setPages + re-render per iteration. Explains "second turn slow" (each correction shifts later pages → subsequent turns re-guard). Note replaceOverflowPage renumbers/inserts pages — possible guard thrash.
  - H3: **DEV-mode overhead**: publishDev hook computes splittingGraphemeLength for EVERY block on EVERY pagination pass (not served by round-1 index — different coordinate system), plus React StrictMode double-invocation in dev. Production build may be much faster — worth measuring both.
  - H4: **React render cost of gigantic article bodies** (always-mounted full ArticleBody + page fragment + measurement body), possibly compounded by highlights/annotation context scanning the whole DOM.
  - H5: **paginateDocument per-pass cost** over ~hundreds of blocks (pure JS, but with DEV hook + fragmentation churn per guard correction it re-runs repeatedly).
- The tripwire e2e claiming 0 longtasks MUST be reconciled with the user's freeze — likely a fixture/condition gap. Fix the spec to reproduce reality before trusting it again.

## Constraints

- D-05 offset contract + persisted data inviolable. Page-fragment rendering semantics unchanged. No new deps.
- Full unit suite must stay green (1244 passing baseline). Lint has known pre-existing zipSlip.ts failures — out of scope.
- Any fix must be verifiable with before/after numbers from the profiler on the real article.

## Eliminated

- H1 (re-measure storm / forced relayouts): NOT in profile — measureAllBlocks/readLineBoxes/getClientRects absent from top-30 self-time; the ingested article has 0 figures (509 p + 23 h + 30 bq), so no image-load storm exists for this content.
- H2 (overflow-guard iteration): absent from profile; guard runs but is noise at this scale.
- H3 (publishDev splittingGraphemeLength): absent from top-30 (O(article) once per pagination pass in DEV — ~100ms class, not seconds).
- H5 (paginateDocument per-pass cost): absent from profile.

## Evidence

- timestamp: 2026-08-20T15:05Z — Playwright+Chromium (headless, 1280×800) dev server, real article (u-b67e49ade862, 562 blocks, ~173k chars, 121 pages at 18px):
  - LoAF/longtask: open = 3 tasks / 24.6s total (max 12.3s); scroll = 2×6.1s; mode-switch = 6.2s. ALL attributed to `MessagePort.onmessage @ react-dom_client.js` (React render loop) — one task `DOMWindow.onkeydown @ ArticleView.tsx` (the "m" toggle).
  - Wall times: h1@18.4s, trusted-commit@30.9s, paginated→scrolling switch 12.9s (docHeight 69,689px), scrolling→paginated ~6.2s.
  - Renderer context destroyed mid-scroll (OOM-class crash under continuous re-render).
- timestamp: 2026-08-20T15:20Z — CDP CPU profile (1ms sampling) over 30-step scroll burst in scrolling mode, **191.7s sampled**:
  - `computeBlockGlobalStart @ src/content/render/BlockRenderer.tsx:206` — **181.1s self time (94.4%)**; next entries: GC 2.4s, jsxDEV 2.3s, graphemeClusters-inner (normalizeText.ts:91) 2.1s. Measurement/pagination/guard code: absent.
  - ROOT CAUSE CONFIRMED: O(n²) `computeBlockGlobalStart` (per-block O(i) walk re-segmenting all preceding blocks' graphemes) runs on EVERY ArticleBody render; ArticleView re-renders on EVERY scroll event (unthrottled `setProgress`, READ-05 effect ArticleView.tsx:1252-1264) and on EVERY page turn (`onAnchorChange`→`setPageState`, ArticleView.tsx:468) → ~158k Intl.Segmenter segmentations (~48M chars) per render, ×2 under dev StrictMode.
  - Symptom mapping: scroll freeze/white-space-snap-in = per-scroll-event quadratic re-renders starving paint; 10s mode switch = one quadratic render of the swapped body (+hidden measurement body in paginated); ~5s later turns = pageState mirror re-render of hidden quadratic body; open freeze = first quadratic render(s).

## Current Focus

hypothesis: "CONFIRMED + FIXED — quadratic computeBlockGlobalStart in ArticleBody render, triggered per scroll event (unthrottled setProgress) and per page turn (setPageState mirror)"
test: "fix A (O(n) memoized highlight-gated block-start index), fix B (rAF-coalesced scroll progress), fix C (memo(ArticleBody) + stable EMPTY_HIGHLIGHTS) — verified by before/after Playwright profiles dev+prod, full unit gate 1244 green, e2e targeted suites green (one pre-existing unrelated failure)"
expecting: "met — see Resolution"
next_action: "commit + close"

## Resolution

**root_cause:** O(n²) `computeBlockGlobalStart` in ArticleBody's render (per-block O(i) grapheme re-segmentation of all preceding blocks ≈ 158k Intl.Segmenter calls / ~48M chars per render on the 562-block article), re-executed on EVERY owner re-render — and ArticleView re-rendered on every scroll event (unthrottled READ-05 `setProgress`) and every page turn (`onAnchorChange`→`setPageState` mirror). CPU profile: 181.1s of 191.7s sampled (94.4%) in that one function during a scroll burst. H1/H2/H3/H5 eliminated (absent from profile; the ingested article has 0 figures so no image-load storm exists).

**fix** (3 changes, all render-side; measurement/pagination engine untouched; D-05 offsets byte-identical — same cumulative arithmetic, computed once):
1. `src/content/render/BlockRenderer.tsx` — replace the per-render quadratic walk with a `useMemo` cumulative `BlockHighlightIndex` (starts+lens, one linear pass), gated on `effectiveHighlights.length > 0` (the no-highlight common case — incl. the hidden measurement body — now does ZERO grapheme segmentation per render).
2. `src/content/render/BlockRenderer.tsx` — `memo(ArticleBody)` with comparator (article identity + explicit highlights identity) so progress/pageState updates in the owner no longer re-render the 562-block tree; context (HighlightOverlay) updates still propagate.
3. `src/routes/ArticleView.tsx` — rAF-coalesced READ-05 scroll progress (one read per frame; mirrors the file's selectionchange pattern) + module-level `EMPTY_HIGHLIGHTS` for the two measurement-body call sites so the memo comparator holds.

**verification (before → after, real article u-b67e49ade862, Chromium 1280×800):**

| metric | dev before | dev after | prod after |
|---|---|---|---|
| h1 visible | 18.4s | 0.18s | 0.08s |
| trusted measurement commit | 30.9s | 0.76s | — (seam absent) |
| paginated→scrolling switch | 12.9s | 3.1s* | <6s* |
| scroll to bottom (97 steps) | renderer crash (OOM-class) | completes, wall 14.1s | completes, wall 14.1s |
| scrolling→paginated switch | ~6.2s | 0.39s | <8s* |
| page turn (mid-article) | ~5s | 30-73ms | no longtask |
| max longtask (whole flow) | 12,298ms | 138ms | 81ms |

\* prod fallback waits are fixed-timeout upper bounds (no DEV seam); no longtask >81ms observed.

**gates:** tsc clean; unit 1244 passed / 13 skipped (baseline intact); eslint clean on changed files; e2e pagination+measurement+annotations+progress+typography-live-apply+reflow: 416 passed; longtask-smoke (small fixture) green; NEW giant-article tripwire green (12 entries, max 115ms, budget 250ms).

**tripwire reconciliation:** the spec's 0-entries result was a conditions gap, now closed by a second test in the same file: synthetic ~170k-char/~570-block article (deterministic, no fixture bloat) through open→scroll→mode-switch×2→turns asserting ≤250ms longtasks + functional turn advancement. It fails hard (6-12s tasks) on regression of this class.

**follow-ups (out of scope, flagged):**
- PRE-EXISTING (fails on HEAD without this session's diff, 3/3 repeats): `tests/e2e/pagination/page-turn-controls.spec.ts:71` "Space advances to page 4" — the documented PAGE-02 rapid-press race (ArrowRight→Space) on small fixtures; needs its own session.
- D4-10 anchor scroll listener (ArticleView) still runs queryBlocks+computeTopVisibleOffset per scroll event (ref-only writes, ~16ms self in profile — negligible now, but a rAF coalesce would be principled polish).
- publishDev `splittingGraphemeLength` (PaginatedSurface) re-segments the whole article per pagination pass in DEV (~100ms class; invisible in profile top-30). Cappable later; not load-bearing.
