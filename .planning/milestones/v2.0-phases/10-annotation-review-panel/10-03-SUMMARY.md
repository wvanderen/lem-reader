---
phase: 10-annotation-review-panel
plan: 03
subsystem: annotations
tags: [react, typescript, hash-router, deep-link, history-api, annotations, playwright, e2e]

# Dependency graph
requires:
  - phase: 10-annotation-review-panel (Plan 10-02)
    provides: the three-view router grammar with the /h/<highlightId> capture (jumpHighlightId on the article View) + ReviewView at #/review
  - phase: 10-annotation-review-panel (Plan 10-01)
    provides: the six Wave-0 e2e sentinels (jump-bidirectional.spec.ts strengthened here)
  - phase: 05-annotations (D5-11)
    provides: the handleNavigateBack jump tail (fragmentContainingOffset/turnToPage, findScrollTarget/scrollIntoView, Firefox focus settle guard)
provides:
  - ArticleView jumpHighlightId prop + App.tsx pass-through — the deep-link consumption seam (D10-03)
  - On-mount readiness-gated jump effect (three settles: article load, highlight resolution, first pagination commit) with a ~5s bounded rAF retry cap and calm no-op terminal paths
  - The first history.replaceState call site in src/ (silent /h/ suffix strip — never location.hash)
  - jumpPendingRef restore suppression (Pitfall 3 — deep-link wins over saved-location restore) + jumpConsumedRef same-mount re-jump guard
  - Deep-link e2e matrix: paginated arrival, scrolling arrival, refresh-no-rejump, calm no-op, back-to-#/review (5 tests × 3 engines)
affects: [10-annotation-review-panel (plans 10-04, 10-05, 10-06)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Readiness-gated mount effect: bounded rAF retry loop (performance.now cap) over three async settles with terminal calm-no-op paths — extends the cancelled-flag + rAF location-restore shape"
    - "Effect-declaration-order coordination: the jump effect is declared BEFORE the location-restore effect so it claims jumpPendingRef in the same commit — no race window (Pitfall 3)"
    - "history.replaceState silent strip (first call site in src/): fragment-only URL rewrite fires no hashchange/popstate, so the router never re-parses mid-view (Pitfall 1)"
    - "Highlights-load detection via atomic batch populate: non-empty api.highlights = eager load completed; an absent entry is terminal (Pitfall 4) rather than wait-forever"

key-files:
  created: []
  modified:
    - src/routes/ArticleView.tsx
    - src/App.tsx
    - tests/e2e/review-panel/jump-bidirectional.spec.ts
    - .planning/phases/10-annotation-review-panel/10-VALIDATION.md

key-decisions:
  - "RECV-01 stays unchecked — this plan proves the ARRIVAL half of RECV-01.c + RECV-01.i; the click-from-row loop and full end-to-end panel behavior close in 10-04/10-06 (04-02 PAGE-01 / 10-01/10-02 split precedent)"
  - "Loaded-and-absent is terminal, not wait-forever: the eager batch-resolve populates api.highlights atomically ([] → full set), so a non-empty array without the jump id means definitively not found → immediate calm no-op + strip (the ~5s cap remains the backstop for the empty-array/never-settling cases in BOTH modes)"
  - "The jump effect is declared before the location-restore effect (effects run in declaration order) and claims jumpPendingRef synchronously — this closes the restore/jump race without state plumbing (Pitfall 3)"
  - "jumpConsumedRef keys on `${article.id}::${highlightId}` so article identity churn / highlight reloads cannot re-jump within a mount, while a genuinely new deep link on an article swap still jumps"
  - "The e2e seedCorpus helper reloads the page after wipeDatabase + before seedRows: a hash-only goto is same-document, so without the reload Dexie never re-declares its schema and seedRows' raw indexedDB.open recreates a store-less v1 DB whose open connection blocks Dexie's v4 upgrade (articles hang at 'Opening article…')"
  - "The scrolling-arrival test reloads after seeding the reader-prefs row — SettingsProvider reads the row once at boot, so the persistence.spec.ts seed-then-reload discipline is required for hydration"

patterns-established:
  - "Deep-link arrival assertion trio: mark visible (paginated renders marks only on the live fragment) → retry-assert activeElement data-highlight-id (navigate-back toPass shape) → URL lost /h/"
  - "Same-document-navigation seeding trap: wipe → reload → seed → hash-navigate (documents why prepareFreshPage-style helpers exist)"

requirements-completed: []

# Metrics
duration: 12 min
completed: 2026-08-16
status: complete
---

# Phase 10 Plan 03: Deep-Link Jump (Arrival Half) Summary

**ArticleView consumes the /h/<highlightId> route param — readiness-gated on-mount jump (article + highlight-resolve + first-pagination settles, ~5s bounded rAF retry) reusing the D5-11 tail verbatim, silently strips the suffix via src/'s first history.replaceState, suppresses the saved-location restore while pending, and proves focused arrival in both reading modes across chromium/firefox/webkit (15/15)**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-16T00:51:18Z
- **Completed:** 2026-08-16T01:03:50Z
- **Tasks:** 2
- **Files modified:** 4 (2 source + 1 e2e spec + 1 planning artifact)

## Accomplishments

- `src/routes/ArticleView.tsx` — optional `jumpHighlightId?: string` prop + a dedicated on-mount jump effect (handleNavigateBack untouched): bounded rAF readiness loop over the three settles (research Pitfall 2) with terminal calm-no-op paths for unresolved/absent ids and the retry cap (Pitfall 4, T-10-03c); jump tail reused EXACTLY (fragmentContainingOffset→turnToPage paginated, findScrollTarget→scrollIntoView center scrolling, focusMark through BOTH rAF and setTimeout(120) — the Firefox settle guard); suffix stripped with `history.replaceState(null, "", `#/article/${article.id}`)` — the first History-API write in src/ (Pitfall 1, T-10-03b); `jumpPendingRef` makes the location-restore effect observably skip while the jump is pending (Pitfall 3 — declared-before ordering guarantees the claim wins) and `jumpConsumedRef` prevents same-mount re-jumps.
- `src/App.tsx` — `jumpHighlightId={view.jumpHighlightId}` threaded into ArticleView (the 10-02 capture is now consumed); the stale "not threaded yet" comment updated to the 10-03 reality (4-line comment-text change, no other logic touched).
- `tests/e2e/review-panel/jump-bidirectional.spec.ts` — sentinel replaced with five tests × 3 engines: paginated arrival (focused mark + stripped URL), scrolling arrival (seeded prefs + hydrate reload + mode pin), refresh-no-rejump (suffix gone → no jump; restore may scroll but never focuses the mark), calm no-op for `nonexistent-id` (normal open, no error surface, stripped), and back-to-#/review (hash-assignment push then goBack returns to the panel — SC#2 arrival half). Corpus: a 10-paragraph makeArticle with a confidentHighlightOn anchor ~60% deep so arrival provably requires a page turn / real scroll.
- `10-VALIDATION.md` — row RECV-01.c mapping updated to 10-03 T2 with the arrival-half/click-from-row split noted (execution flags left to the phase verifier, mirroring the 10-01 backfill precedent).

## Task Commits

Each task was committed atomically:

1. **Task 1: jumpHighlightId prop + readiness-gated on-mount jump + replaceState strip** — `2d862ed` (feat)
2. **Task 2: Deep-link e2e — arrival, no-re-jump, calm no-op (both reading modes)** — `8fc96d4` (test)

## Files Created/Modified

- `src/routes/ArticleView.tsx` — jumpHighlightId prop, jump effect (refs + bounded rAF loop + terminal paths + D5-11 tail + replaceState strip), restore-effect jumpPending guard
- `src/App.tsx` — prop pass-through + comment truthing
- `tests/e2e/review-panel/jump-bidirectional.spec.ts` — real deep-link coverage (sentinel replaced in place)
- `.planning/phases/10-annotation-review-panel/10-VALIDATION.md` — RECV-01.c row backfill

## Decisions Made

- **RECV-01 not marked complete** — the arrival half of RECV-01.c + RECV-01.i is proven here; the click-from-panel-row loop and full end-to-end panel behavior close in 10-04/10-06 (`requirements-completed: []`, mirroring 10-01/10-02).
- **Loaded-and-absent ⇒ immediate terminal** — the eager batch-resolve populates `api.highlights` atomically, so a non-empty array lacking the jump id is definitive; stripping immediately is calmer than waiting out the cap. The plan's "keep waiting" reading applies to the not-yet-loaded (empty-array) case, which still rides the ~5s cap backstop in BOTH modes (covering storage failures and zero-highlight articles too).
- **Declaration-order coordination over state** — placing the jump effect before the restore effect makes the pending-flag claim race-free without extra React state; documented in both effects' comments.
- **App.tsx comment truthing** — the plan said "nothing else changes", but the 10-02 comment explicitly claimed the prop was not threaded and would be a tsc error; the 4-line comment update keeps the file honest with zero functional drift.

## Deviations from Plan

None - plan executed exactly as written. (Task 2's two harness fixes — the schema-declaring reload and the seed-then-reload hydration — are test-authoring corrections to the spec being written, not deviations from plan instructions; both are documented in key-decisions for future plans.)

## Issues Encountered

- **First e2e run failed 15/15 (chromium/firefox) with articles stuck at "Opening article…"** — root cause: after `wipeDatabase`, the spec's hash-only `goto(BASE/#/)` is a same-document navigation, so the app never re-booted; `seedRows`' raw `indexedDB.open("lem-reader")` then recreated the wiped DB as a store-less v1 whose lingering open connection blocked Dexie's v4 upgrade forever. webkit escaped only because its deleteDatabase gets blocked (the DB survived with stores). Fixed by adding `page.reload()` in seedCorpus before seeding (the library fixtures-union also meant the "Your library is empty" signal could never render — replaced with a fixture-row-visible check).
- **Scrolling arrival failed on all engines (mode still paginated)** — SettingsProvider reads reader-prefs once at boot, before the seed wrote the row. Fixed with the persistence.spec.ts seed-then-reload discipline. Both fixes verified green twice.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The deep-link arrival pipeline is complete and consumed by nothing else yet — Plan 10-04 strengthens listing/tri-state specs against the shipped ReviewView surface; Plan 10-06 closes the click-from-row loop (panel row pushes the deep link, Back returns to the origin row) and runs the full-suite gate.
- `jumpPendingRef`/`jumpConsumedRef` semantics are documented in ArticleView comments; 10-06's row-click e2e can rely on the same arrival assertions via `expectFocusedArrival`-shaped helpers.
- No blockers.

## Verification Evidence

| Check | Result |
|-------|--------|
| `npm run build` | exit 0 (tsc clean; includes the new spec under `tests/`) |
| `npm run test:unit -- --run` (full unit, no subsets) | 871 passed / 0 failed / 7 intentional skips (65 files) — identical to the 10-02 baseline |
| `npx playwright test tests/e2e/review-panel/jump-bidirectional.spec.ts` (run 1) | 15/15 passed (chromium + firefox + webkit) |
| `npx playwright test tests/e2e/review-panel/jump-bidirectional.spec.ts` (run 2, stability) | 15/15 passed |
| `npx playwright test tests/e2e/annotations/navigate-back.spec.ts tests/e2e/persistence.spec.ts tests/e2e/review-panel/route-entry.spec.ts` (targeted regression) | 45/45 passed |
| `npm run lint` | 3 pre-existing zipSlip.ts errors only (the documented 10-01 baseline); zero new violations |
| Acceptance greps (Task 1) | jumpHighlightId prop + fragmentContainingOffset/findScrollTarget/history.replaceState in the effect; rAF + setTimeout(120) on one focusMark closure; replaceState(null, "", `#/article/…`) with zero location.hash in ArticleView; jumpPendingRef referenced in both effects; App.tsx prop pass present |

## Self-Check: PASSED

- All key-files exist on disk (`src/routes/ArticleView.tsx`, `src/App.tsx`, `tests/e2e/review-panel/jump-bidirectional.spec.ts`)
- Both task commits present in git log (`2d862ed`, `8fc96d4`)
- All acceptance criteria re-run and passing (see Verification Evidence)

---
*Phase: 10-annotation-review-panel*
*Completed: 2026-08-16*
