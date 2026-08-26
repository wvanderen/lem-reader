---
phase: 15-application-shell-and-destinations
plan: "03"
subsystem: ui
tags: [react, library, session-restore, scroll, focus, a11y, strictmode, playwright, e2e, hash-router]

# Dependency graph
requires:
  - phase: 15-application-shell-and-destinations (Plan 01)
    provides: canonical #/highlights route + Highlights destination surface (D15-06/D15-07)
  - phase: 15-application-shell-and-destinations (Plan 02)
    provides: shell Primary nav (Library/Highlights links + brand link) — the return paths the matrix drives; destination derivation in App
  - phase: 14-navigation-and-library-contracts
    provides: view hash routes + replaceState discipline (D14-12/13/14/17), h1-focus substrate (D14-01/03/05/10), the D14-08 deferral this plan closes
provides:
  - librarySession.ts session-scoped restore seam (D15-12): capture/peek + pure viewMatches/clampScroll — zero React, zero storage imports
  - LibraryView capture-on-leave / restore-on-return: filters restore on ALL return paths; clamped scroll + row-link focus only on view match (D15-13); truthful per-field degradation (D15-14)
  - history.scrollRestoration = "manual" (App owns scroll on Back — Pitfall 3)
  - library-restore.spec.ts: the 3-path × match/mismatch × degradation matrix (a)-(f), chromium-green
  - reading-views.spec.ts supersession: captured+matched Back focuses the launched row link (D15-11 citations)
affects: [15-04 phase gate (3-engine matrix), NAV-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "StrictMode simulated-unmount separation via a reachedReadyRef only the async load completion can set — capture cleanups must never trust mount-time invocations"
    - "Departure scroll tracked in a ref by a passive scroll listener, never window.scrollY at cleanup — the unmatched-fragment navigation resets scrollY synchronously BEFORE hashchange (probed: ['hashchange:0','scroll:0'])"
    - "Restore ordering: clamped scrollTo FIRST, then focus (preventScroll iff the target intersects the restored viewport — Pitfall 5)"
    - "Dynamic launch-target discovery in e2e (first fully-visible row link / last row link) instead of hard-coded rows — survives grid-column layout"

key-files:
  created:
    - src/ingestion/library/librarySession.ts
    - tests/unit/library/library-session.test.ts
    - tests/e2e/library/library-restore.spec.ts
  modified:
    - src/ingestion/library/LibraryView.tsx
    - src/App.tsx
    - tests/e2e/library/reading-views.spec.ts

key-decisions:
  - "View-mismatch degrade = the fresh warm h1 default (plain h1 focus at the ready gate, scroll reset to top): the plan's ready-gate text said 'nothing further' but its own matrix (c) + must-have truths pin h1 focus + fresh reset — the matrix is the executable truth"
  - "reachedReadyRef gate on the capture (Rule 1): dev StrictMode's simulated unmount ran the capture cleanup on every mount, poisoning cold loads (peek non-null → restore on a load with no prior library) and clobbering real snapshots (fresh lastLaunchedRef null); only the async Promise.all completion sets the flag, which the synchronous simulated cycle can never reach"
  - "scrollTopRef passive-listener tracking (Rule 1): window.scrollY at unmount cleanup is ALWAYS 0 for in-page link departures — the browser's scroll-to-fragment for unmatched ids runs synchronously inside the click default action, before hashchange; the poisoned scroll EVENT fires only after the component unmounted and removed its listener"
  - ".library-list is a 3-column grid at ≥1024px — matrix scroll offsets target the real row band (~y 1450+) and launch targets are discovered dynamically rather than assumed single-column"
  - "Clamp case (f) launches the LAST row (a bundled fixture — fixtures render after Dexie rows and survive corpus deletion) so the row-found path stays visible at the clamped bottom and the clamp offset remains authoritative"
  - "Deferred (out of scope): 3 pre-existing eslint errors in src/portability/zipSlip.ts (Phase 9, commit 9793d1f) logged to deferred-items.md — all 15-03 files lint clean"

requirements-completed: [NAV-03]

# Metrics
duration: 75 min
completed: 2026-08-26
status: complete
---

# Phase 15 Plan 03: Library Return-Context Restore Summary

**Session-scoped library restore (D15-11..14): a pure librarySession seam + LibraryView capture-on-leave/restore-on-return with view-match gating, clamped scroll, and launched-row focus — proven by a six-case return-path × degradation e2e matrix, with two StrictMode/fragment-scroll traps found and fixed by the matrix itself.**

## Performance

- **Duration:** 75 min (16:01–17:16 UTC)
- **Tasks:** 3 (all TDD-style: Task 1 RED, Task 2 GREEN, Task 3 integration + matrix)
- **Files:** 6 (3 created, 3 modified)

## Accomplishments

- **Task 1 (`d162c70`, test):** RED unit contract for librarySession (11 cases: null-peek cold load, round-trip + overwrite, peek-idempotence, viewMatches exact equality, clampScroll bottom clamp) + the library-restore harness (reading-views clear-rows beforeEach discipline, 12-article schema-built corpus, openView readiness helper, chromium-green sentinel proving 18 rows + viewport overflow).
- **Task 2 (`12c7f6d`, feat):** `librarySession.ts` — module singleton + pure comparators under the readingState store-seam discipline (zero React, zero storage imports; grep-verified 0 hits); `history.scrollRestoration = "manual"` set once early in the AppInner mount effect (exactly one hit in src; reload losing browser scroll restore consciously accepted per D15-12/D14-17).
- **Task 3 (`06bd4aa`, feat):** LibraryView capture/restore wiring — delegated launch capture on the library-list ul (ids parsed from the constant-template href, T-15-08), lazy filter initializers (filters restore on ALL return paths, D15-13), mount-h1 deferral when a snapshot exists, and the ONE ready-gated restore decision point: clamped scrollTo → row-link focus (preventScroll iff intersecting) / null-launched h1 focus with preventScroll / row-gone + mismatch h1 default. The (a)-(f) matrix + reading-views supersession all green.

## Task Commits

1. **Task 1: Wave 0 — RED unit cases + harness scaffold** — `d162c70` (test)
2. **Task 2: librarySession pure module + manual scroll ownership** — `12c7f6d` (feat)
3. **Task 3: view-matched restore integration + matrix + supersession** — `06bd4aa` (feat)

## Files Created/Modified

- `src/ingestion/library/librarySession.ts` — NEW: LibraryContextSnapshot, captureLibraryContext (single write point, overwrite semantics), peekLibraryContext (peek-not-take), viewMatches, clampScroll
- `tests/unit/library/library-session.test.ts` — NEW: 11-case pure contract (GREEN since Task 2)
- `tests/e2e/library/library-restore.spec.ts` — NEW: harness + sentinel + matrix (a)-(f)
- `src/ingestion/library/LibraryView.tsx` — capture refs (live context, launched id, scroll, reached-ready), filter initializers, mount-focus deferral, ready-gated restore, delegated ul onClick
- `src/App.tsx` — scrollRestoration = "manual" in the AppInner mount effect (Pitfall 3)
- `tests/e2e/library/reading-views.spec.ts` — deliberate supersession (D15-11 citations): Back with captured+matched row → row link focused; new no-capture cold-boot edge keeps the uniform h1 rule

## Decisions Made

- **Mismatch = fresh h1 default** (plan-internal ambiguity): the ready-gate spec text ("nothing further") read literally would leave a warm mismatch arrival with NO focus (a D14-01 regression and a contradiction with the plan's own matrix case (c) and must-have truths); resolved toward the executable truth — plain h1 focus + scroll reset fresh, both pinned by matrix (c).
- **Both Rule 1 fixes were found by the plan's own matrix** (the RED-first discipline doing its job): the StrictMode capture poisoning surfaced as the reading-views cold-load failure, and the fragment-scroll poison surfaced as matrix (d)'s scroll assertion — each fixed with a minimal ref-based gate and verified against the full suite.
- **Probe-then-delete debugging:** four temporary Playwright probe tests + window hooks instrumented the live capture/restore and event ordering (`['hashchange:0','scroll:0']`), were deleted before the Task 3 commit, and their findings are encoded in the production comments (the ref declarations document both traps for future readers).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] StrictMode simulated unmount ran the capture cleanup at mount time**
- **Found during:** Task 3 (reading-views cold-load test failed: h1 focused on a cold `#/finished` load)
- **Issue:** dev StrictMode double-invokes effects (mount → simulated-unmount cleanup → remount); the unmount-only capture ran during the simulated cycle — (a) cold loads captured a snapshot, so peek() ≠ null turned them into "returns" (restore + focus on a load with no prior library — D14-03 violation), and (b) on real returns the artifact capture overwrote the true departure snapshot with fresh-mount values (new lastLaunchedRef = null), losing the launched row id
- **Fix:** `reachedReadyRef` set only by the async load completion; the capture cleanup returns early while it is false. The synchronous simulated cycle can never see it true; real post-ready departures always pass. A pre-ready REAL departure also skips (previous snapshot stays — the last fully-known context, truthful per D15-14)
- **Files modified:** src/ingestion/library/LibraryView.tsx
- **Verification:** reading-views 20/20 chromium incl. the cold-load + supersession tests; matrix green
- **Committed in:** 06bd4aa

**2. [Rule 1 - Bug] window.scrollY at unmount is always 0 for link departures (fragment-scroll poison)**
- **Found during:** Task 3 (matrix (d) scroll assertion: restore landed at 0; probes showed the capture stored scrollTop 0 in every flow)
- **Issue:** every in-page link departure (row open, shell link, brand) navigates to an unmatched fragment; the browser's scroll-to-fragment resets scrollY to 0 synchronously inside the click's default action — BEFORE the hashchange handler and thus before the unmount cleanup. The plan's "live window.scrollY at cleanup" premise is falsified in real browsers; (a)/(f) had passed only via default-focus auto-scroll landing inside tolerance
- **Fix:** `scrollTopRef` fed by a passive window scroll listener mounted with LibraryView; the capture reads the ref. The poisoned scroll EVENT fires after the hashchange — after the component unmounted and removed its listener — so the 0 can never reach the ref (event ordering probed and pinned in the comment). Non-click departures (browser Back from the library) never fragment-scroll; their events keep the ref live
- **Files modified:** src/ingestion/library/LibraryView.tsx
- **Verification:** matrix (a)/(b)/(d) scroll restorations now deterministic (|restored − y0| ≤ 60 with real offsets); (f) clamps at the live maxScroll
- **Committed in:** 06bd4aa

**3. [Rule 3 - Blocking] Task-1 header comment tripped the acceptance grep**
- **Found during:** Task 2 AC verification (`rg 'from "react"|dexie|persistence'` must return 0 hits)
- **Issue:** the module header's own prose ("zero Dexie/persistence imports") matched the grep
- **Fix:** reworded the comment ("zero storage-layer imports"); the criterion now passes literally
- **Files modified:** src/ingestion/library/librarySession.ts
- **Committed in:** 12c7f6d

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bugs, 1 Rule 3 blocker)
**Impact on plan:** No scope creep — both Rule 1 fixes are minimal ref-based gates inside the plan's own architecture (ONE capture write point, refs hold live values) and are required for the plan's must-have truths to hold in real browsers at all. Out-of-scope discovery logged: 3 pre-existing eslint errors in `src/portability/zipSlip.ts` (Phase 9) recorded in `deferred-items.md`, not fixed (scope boundary).

## Verification Results

- `npx vitest --run tests/unit/library/library-session.test.ts` → 11/11 GREEN (Task 2+)
- `npx vitest --run tests/unit/library/library-session.test.ts tests/component/App.test.tsx` → 28/28 (router grammar untouched)
- `npx vitest --run` (full unit suite) → **1302 passed / 0 failed / 13 skipped** (the documented intentional skip set)
- `npx playwright test tests/e2e/library/library-restore.spec.ts tests/e2e/library/reading-views.spec.ts --project=chromium` → **27/27** (sentinel + matrix (a)-(f) + superseded reading-views)
- Blast radius: `tests/e2e/library/ + chrome/back-nav + review-panel/route-entry + chrome/shell-nav + chrome/library-tidy --project=chromium` → **79/79**
- `rg "scrollRestoration" src/` → exactly 1 hit (App.tsx mount effect)
- `rg 'from "react"|dexie|persistence' src/ingestion/library/librarySession.ts` → 0 hits
- Phase diff contains no `db.version(` changes (Pitfall 9 — no store changes); no Dexie imports anywhere in librarySession.ts
- `npx tsc --noEmit` → clean; eslint clean on all six 15-03 files (pre-existing zipSlip.ts errors excepted — see deferred-items.md)
- 3-engine matrix + honest full-suite gate: Plan 15-04 (per the plan's `<verification>`)

## Issues Encountered

None beyond the deviations above. The two Rule 1 fixes consumed most of the debugging budget; both were closed inside the fix-attempt limit with probe evidence rather than retries.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- NAV-03 closed: all three return paths restore filters; view-matched returns restore clamped scroll + launched-row focus; every degradation lands calmly and truthfully.
- Plan 15-04 (phase gate) re-runs library-restore + reading-views (+ shell-nav et al.) across chromium/firefox/webkit; engine-exposure risks pre-mitigated: focus/scroll assertions rely on toBeFocused retries + settled-scroll reads (no timing races), and the geometry helpers (first-visible/last-row discovery) compute from live layout rather than hard-coded positions. webkit's known sequential-navigation divergence does not apply (no Tab-walk in this spec).
- The fragment-scroll and StrictMode traps are documented at both ref declarations in LibraryView.tsx — future capture-on-unmount work (e.g. Phase 16 library redesign) should read those comments first.

## Self-Check: PASSED

- Commit `d162c70` (Task 1, test) found in git log ✓
- Commit `12c7f6d` (Task 2, feat) found in git log ✓
- Commit `06bd4aa` (Task 3, feat) found in git log ✓
- src/ingestion/library/librarySession.ts exists, exports all five symbols ✓
- tests/unit/library/library-session.test.ts exists (11 cases GREEN) ✓
- tests/e2e/library/library-restore.spec.ts exists (sentinel + matrix (a)-(f)) ✓
- No file deletions in any task commit; no unintended untracked files (deferred-items.md committed with this plan's docs) ✓

---
*Phase: 15-application-shell-and-destinations*
*Completed: 2026-08-26*
