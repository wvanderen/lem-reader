---
phase: quick-260908-oht-finish-detection
plan: 01
subsystem: reading-completion
tags: [completion, pagination, scroll-save, mark-read, e2e-repair]
requires:
  - "useScrollSave debounce/flush machinery (18-03)"
  - "pageStartGlobalOffset / fragmentContainingOffset anchor math (04-04)"
  - "graphemeLength D-05 substrate"
provides:
  - "pageAnchorOffset — committed-page anchor with the last-page-of-multi-page pin"
  - "committedPageProgressRatio — hairline ratio reaching exactly 1 on the final page"
  - "atScrollBottom — pure scroll-bottom predicate (4px epsilon)"
  - "saveLocationNow — synchronous flush seam on useScrollSave"
  - "leaveArticleToLibrary — the ONE shared close-navigation contract"
  - "MarkReadAndClose — explicit end-of-article completion affordance (both modes)"
affects:
  - "Library Finished derivation (reads offset=total rows — unchanged modules, new writers)"
tech-stack:
  added: []
  patterns:
    - "committed-page anchor pin (pure helper composition — no forked offset math)"
    - "flush-not-schedule persistence seam for navigation-adjacent writes"
key-files:
  created:
    - src/reader/MarkReadAndClose.tsx
    - tests/unit/pagination/pageAnchor.test.ts
    - tests/unit/useScrollSave.test.ts
    - tests/unit/MarkReadAndClose.test.tsx
  modified:
    - src/pagination/anchor.ts
    - src/pagination/progress.ts
    - src/reader/PaginatedSurface.tsx
    - src/reader/useScrollSave.ts
    - src/reader/BackToLibrary.tsx
    - src/routes/ArticleView.tsx
    - src/app.css
    - tests/unit/pagination/progress-formula.test.ts
    - tests/component/PaginatedSurface.test.tsx
    - tests/e2e/library/progress-recent.spec.ts
    - tests/e2e/pagination/repagination-anchor.spec.ts
    - tests/e2e/portability/core-flow-spine.spec.ts
decisions:
  - "Completion pin lives at the COMMITTED-PAGE level (pageAnchorOffset), one level above the byte-unchanged fragment-level paginatedProgressRatio"
  - "saveLocationNow flushes synchronously — unmount cancels debounces, so the explicit button must never schedule"
  - ".mark-read-close-page centers via width:fit-content + auto inline margins (the nav precedent's text-align cannot center a button that IS the fixed box)"
  - "e2e runner repaired before any triage: the progress-recent module-load crash had silently killed the whole Playwright run since 2026-09-07"
metrics:
  duration: 123 min
  completed: 2026-09-09
status: complete
---

# Quick Task 260908-oht: Fix article completion detection + add Mark read and close — Summary

Articles never passively finished because only page/block START offsets were
persisted (last page ≈ 0.90, scroll bottom < 0.98 whenever the final block
exceeds 2%), and no explicit mark-read gesture existed. This task pins the
committed-page anchor to `graphemeLength` (final page of a multi-page set),
pins the scroll-save path at the document bottom, adds end-landing so
restores/mode-toggles never un-finish a finished article, and ships a
"Mark read and close" button that flush-persists `offset = total` and closes
through the shared Back-to-library contract — with zero changes to
FINISHED_THRESHOLD, readingState.ts, bookProgress.ts, or
ContinueReadingStrip.tsx (verified byte-unchanged via `git diff`).

## What Was Built

**Task 1 — Passive completion (TDD: RED 287a312 → GREEN 4ac4d9a)**
- `pageAnchorOffset(article, pages, idx)` in `src/pagination/anchor.ts`:
  empty/out-of-range → 0; last page of a MULTI-page set →
  `graphemeLength(article)`; otherwise byte-identical
  `pageStartGlobalOffset`. A one-page set keeps anchor 0 (POLISH-02
  open-reads-0 preserved).
- `committedPageProgressRatio` in `src/pagination/progress.ts`: the hairline
  ratio over the committed-page anchor — exactly 1 on the final page of a
  multi-page set; `paginatedProgressRatio` byte-unchanged.
- All five PaginatedSurface anchor consumers (pagination-effect capture,
  onAnchorChange, commitTurn, turnToPage, getCurrentAnchorOffset) + the
  progress memo route through the pinned helpers; repagination from the last
  page re-anchors to the NEW last page via fragmentContainingOffset's +∞
  clamp.
- `atScrollBottom` pure helper (BOTTOM_EPSILON_PX = 4; non-scrollable never
  finishes; overshoot true) + the scroll listener pins
  `scheduleSaveAtOffset(graphemeLength(article))` at the document bottom.
- End-landing in ArticleView: scrolling restore + the D4-10
  paginated→scrolling apply scroll to the absolute document bottom when the
  offset ≥ total, so the first scroll-save re-pins total; the restoration
  marker claims in both branches.
- Tests: pageAnchor boundary table (5), committedPageProgressRatio table
  (7 new), atScrollBottom table (9), PaginatedSurface onAnchorChange
  component cells (3) — 38/38 green.

**Task 2 — MarkReadAndClose + shared navigation (TDD: RED e7da8a5 → GREEN 08abf58)**
- `leaveArticleToLibrary(hasAppHistory)` extracted from BackToLibrary (the
  ONE `history.back()`/`"#/"` contract — Pitfall 7; T-Q02 mitigated).
- `MarkReadAndClose`: native labeled button, save-before-navigate order,
  Tab/Enter/Space only, `flow`/`page` placements.
- `.mark-read-close` quiet-button register (token-for-token .back-to-library
  shape: 44px touch target, hairline border, accent hover, zero motion) +
  fixed-band page placement + the `:has()` chapter-nav coexistence bump.
- Tests: accessible name both placements, ordered spy array proving
  onMarkRead-before-back, `#/` fallback path, placement classes,
  BackToLibrary regression — 6/6 green.

**Task 3 — Wiring + the honest full gate (98a3ced, e1949d4, 7737cdf)**
- `useScrollSave` now returns `{ scheduleLocationSave, saveLocationNow }`;
  the flush seam stashes pendingRef, clears the timer, and calls `flush()`
  synchronously (mandatory: unmount cleanup cancels debounces and nulls
  pendingRef). Single `saveLocation` call-site family preserved; T-Q01
  mitigated.
- `handleMarkRead` flush-persists `graphemeLength(article)` then navigates
  through the shared contract. Scrolling branch mounts the flow button
  after `<ArticleBody>` (before chapter nav); paginated branch mounts the
  fixed-band button on the SAME final-page gate as the chapter nav (a
  one-page article satisfies 1 === 1 — its only finish path).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] e2e runner was entirely dead at base**
- **Found during:** Task 3 full gate — `npm run test:e2e` executed ZERO
  tests (module-load TypeError) and exited 1.
- **Issue:** `progress-recent.spec.ts` indexed `fixtures[1]/[2]` at load;
  the non-GSD commit b13eba5 (2026-09-07, "Getting Started library guide")
  reduced `fixtures` to one article. Every `npm test` since then ran no e2e
  coverage at all.
- **Fix:** Harness repaired (commit e1949d4) — strip fixtures are Node-built
  schema-valid standalones seeded via the library-restore `seedArticleRows`
  discipline; every assertion unchanged; spec green 5/5 chromium.
- **Files:** tests/e2e/library/progress-recent.spec.ts

**2. [Rule 1 - Spec pinned old semantics] repagination-anchor viewport-resize test**
- **Found during:** Task 3 e2e gate (30s timeout: Next disabled after resize).
- **Issue:** essay-long-form is exactly 3 pages at 1280×720; the test's two
  Next clicks landed on the LAST page, whose committed anchor now pins to
  total by design — resize re-anchors to the NEW last page, so the
  mid-article probe cannot run.
- **Fix (strengthen-only):** the mid-article probe turns to page 2 (its
  original intent); a NEW test pins the honest expectation — resize from
  the last page lands on the NEW last page (currentPageIdx ===
  pagesLength − 1, Next aria-disabled, more pages at 480×700). 12/12 cells
  green across 3 engines.
- **Files:** tests/e2e/pagination/repagination-anchor.spec.ts

**3. [Rule 1 - Fragile heuristic] core-flow-spine toolbar click intercepted by header**
- **Found during:** Task 3 e2e gate (90s stall; trace + snapshot diagnosis).
- **Issue:** machine A's 60% scroll clamps to the document bottom on the
  short md article → the NEW scroll-bottom pin saves offset = total →
  machine B's restore hits the NEW end-landing (absolute bottom) → the
  spec's blockTwo picker chose the topmost in-viewport block, partially
  under the 48px fixed header → the selection toolbar's Highlight button
  was pointer-intercepted forever.
- **Fix (strengthen-only):** the blockTwo picker requires the block's top
  (where the 0..24-char selection renders) to clear the header (rect.top ≥
  56) — the assertion contract (second highlight through the real UI) is
  unchanged. Green 3/3 engines.
- **Files:** tests/e2e/portability/core-flow-spine.spec.ts

**4. [Rule 1 - Visual register] .mark-read-close-page literal CSS would render a full-width bar**
- **Found during:** Task 2 CSS authoring.
- **Issue:** the plan's literal property list (position:fixed; left:0;
  right:0; text-align:center; margin:0) blockifies the button's inline-flex
  display → the bordered box stretches full-width, violating the required
  "same quiet-button register" (the .chapter-nav-page precedent centers an
  inline-block CHILD via text-align; here the button IS the box).
- **Fix:** `width: fit-content; margin-inline: auto` between left:0/right:0
  (the standard absolutely-positioned centering resolution) — same fixed
  band, same z-index, centered quiet button.
- **Files:** src/app.css

## Gate Results (honest)

- `npx tsc` — clean. `npm run lint` — clean.
- `npm run test:unit -- --run` — **1672 passed / 0 failed / 13 skipped**.
- e2e: runner REPAIRED (was executing zero tests at base). Of the 197
  failures the repaired runner surfaced in the full 3-engine run, 6 cells
  (the two spec/feature interaction points above) were fixed strengthen-only
  and are green; **the remaining ~191 are pre-existing at base commit
  9ce8287**, all traced to the non-GSD commits b13eba5/e7c5886
  (single-article starter library: readiness sentinel "The looting of
  science fiction", row-count arithmetic, fixtures.find crashes, review-join
  dropping corpus highlights). Logged in `deferred-items.md` per the plan's
  scope-boundary instruction ("do not fix unrelated specs"); `npm test`
  exit 0 is unachievable at this base without those out-of-scope repairs.
- A/B note: a baseline worktree comparison was attempted and discarded as
  invalid — the user's long-lived :5173 dev server (started 2026-09-07) was
  reused by both runs, so both served the same code. Attribution above rests
  on per-failure evidence (error messages, page snapshots, traces, fixture
  archaeology) instead.

## Verification Checklist (from the plan)

1. ✅ Final page of multi-page article → hairline 1, offset = total (component + pure tests; ratio exactly 1)
2. ✅ Scroll bottom → offset = total (pure boundary table; full-suite unit gate)
3. ✅ Mark read and close in BOTH modes — flush-persist before navigation, shared contract, keyboard-operable, 44px, tokens-only CSS
4. ✅ Finished state stable across reopen (scrolling) and final-page→scrolling toggle (end-landing re-pins)
5. ✅ One-page article reads 0% on open (POLISH-02 pinned in both new tables) and finishes via the button (1 === 1 gate)
6. ✅ Book chapters finish through the same machinery — readingState.ts / bookProgress.ts / ContinueReadingStrip.tsx / paginatedProgressRatio byte-unchanged (`git diff` shows no rows for them)
7. ⚠️ tsc + lint + full unit suite green; `npm test` exit 0 blocked ONLY by the documented pre-existing e2e debt (see Gate Results)

## Self-Check: PASSED

- Created files exist: src/reader/MarkReadAndClose.tsx, tests/unit/pagination/pageAnchor.test.ts, tests/unit/useScrollSave.test.ts, tests/unit/MarkReadAndClose.test.tsx — FOUND
- Commits exist: 287a312, 4ac4d9a, e7da8a5, 08abf58, 98a3ced, e1949d4, 7737cdf — FOUND (git log)
- Byte-unchanged guard: readingState.ts, bookProgress.ts, ContinueReadingStrip.tsx, paginatedProgressRatio — VERIFIED
