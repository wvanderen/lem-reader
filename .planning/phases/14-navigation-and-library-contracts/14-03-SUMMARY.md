---
phase: 14-navigation-and-library-contracts
plan: 03
subsystem: ui
tags: [document-title, focus-management, tabindex-h1, route-change, vitest, jsdom]

# Dependency graph
requires:
  - phase: 14-navigation-and-library-contracts
    plan: 01
    provides: pageMeta.setDocumentTitle (suffix + separator + 64-char truncation, the ONE helper)
  - phase: 14-navigation-and-library-contracts
    plan: 02
    provides: the h1-focus effect precedent (mount warm-gated + keyed, eslint-disable discipline) + hasAppHistory already threaded to both views by App
provides:
  - ArticleView title effect keyed [article, chapterContext, status] — article / EPUB chapter (combined, upgrade-safe) / error forms
  - ArticleView most-specific-wins focus layering at ONE decision point — h1-default inside the restore effect's no-restore fall-through (D14-05/D14-10 ordering preserved by construction)
  - ArticleView error h1 focus parity via a status-keyed effect (D14-06)
  - ReviewView title + warm-gated mount h1 focus (D14-02/D14-01/D14-03)
  - Both h1s + the review h1 carry tabIndex={-1} + refs (texts/levels byte-stable)
affects: [14-04 (3-engine e2e proves deep-link/restore/error ordering + EPUB chapter title + review title/warm focus in real browsers)]

# Tech tracking
tech-stack:
  added: []  # zero packages installed (T-14-SC accept — none needed)
  patterns:
    - "Terminal fall-through focus: the h1-default decision lives INSIDE the restore effect's no-restore branch, after the byte-unchanged jumpPendingRef early return — never a third competing mount effect (Pitfall 1)"
    - "hasAppHistory is per-arrival truth: read inside effects but deliberately NOT in their dep arrays (App flips it only on destination hashchange, which coincides with the articleId change that re-runs them); eslint-disable comments carry the rationale"

key-files:
  created: []
  modified:
    - src/routes/ArticleView.tsx
    - src/routes/review/ReviewView.tsx
    - tests/component/ArticleView.test.tsx

key-decisions:
  - "NAV-04 NOT marked complete — 14-03 ships the full title + focus wiring, but the 3-engine real-browser proofs (deep-link-wins D14-05, restore-wins D14-10, EPUB chapter title D14-07, review title + warm h1 focus) are 14-04 Task 2's documented scope; requirements-completed is [] (the 14-01 LIB-07 / 14-02 split precedent)"
  - "hasAppHistory omitted from the restore-effect deps on purpose: listing it would re-fire the restore (scroll + a dismissed ResumeBanner resurrecting) if it ever flipped with the article unchanged; the per-arrival rationale lives in an eslint-disable comment at the deps array"
  - "loadLocation mocked in ArticleView.test.tsx via importOriginal spread (saveLocation stays real for useScrollSave) to pin the no-restore fall-through deterministically; the default ({ok:true, location:null}) is set in the file-level beforeEach so the 10 pre-existing tests keep the same silent no-banner branch — proven by their unchanged green run"
  - "TDD RED shape with negative pins: the loading-no-title and cold-no-focus cases pass at RED by construction (they assert absence); the positive cases failed for the right reasons (no write / no focus code) — documented in both RED commit bodies"

patterns-established:
  - "Deterministic restore-fall-through testing: mock the store seam's read with the discriminated-union fall-through value rather than relying on jsdom's Dexie-unavailable classification"

requirements-completed: []  # NAV-04 closes at 14-04 (3-engine proof — see key-decisions)

# Metrics
duration: 9 min
completed: 2026-08-25
status: complete
---

# Phase 14 Plan 03: Navigation & Library Contracts — Destination Titles + Focus Summary

**Truthful per-destination document.title (article / EPUB chapter / review / error) plus the uniform route-change h1-focus rule with most-specific-wins layering inside ArticleView — deep-link jump > saved-location restore > h1 default — and error-state parity**

## Performance

- **Duration:** 9 min
- **Started:** 2026-08-25T18:18:55Z
- **Completed:** 2026-08-25T18:27:57Z
- **Tasks:** 3 (Tasks 2 + 3 TDD: RED→GREEN each)
- **Files modified:** 3 (0 created, 3 modified — exactly the plan's files_modified list)

## Accomplishments

- ArticleView title effect keyed exactly `[article, chapterContext, status]`: error → `"Couldn't open this article"` (apostrophe, no trailing period — the visible h1 keeps its own), article + chapterContext → the combined `"<chapter> — <book>"` content portion (the helper truncates the COMBINED string at 64 and appends the suffix — D14-07, upgrade-safe when the tolerant Book lookup resolves late), article alone → plain provenance.title, loading (article null) → NO write (T-14-06 — transient states never lie)
- Focus layering at ONE decision point (Pitfall 1): the h1-default `articleH1Ref.current?.focus()` lives inside the restore effect's no-restore fall-through — the `jumpPendingRef` early return above it stayed byte-unchanged, so a pending deep-link jump can never reach the h1 default (D14-05); a successful restore keeps its scroll/banner and never focuses the h1 (D14-10); `hasAppHistory` gates the call so cold loads/reloads never move focus (D14-03)
- Error parity (D14-06): a warm error arrival focuses the error-branch h1 via ONE small status-keyed effect — a failed open is a truthful destination
- ReviewView: mount effect calls `setDocumentTitle("Review highlights")` then focuses the h1 only when `hasAppHistory` — the LibraryView 14-02 twin; no cleanup, no live region (Pitfall 9 / D14-09)
- All three h1s gain ONLY `tabIndex={-1}` + refs — texts and levels byte-stable ("Review highlights", "Couldn't open this article.", article provenance title)
- Zero App.tsx changes, zero store changes, zero overlay title/focus code (D14-11 by construction); diff vs plan start touches exactly the three planned files

## Task Commits

Each task was committed atomically (TDD: RED → GREEN per task):

1. **Task 1: ReviewView title + warm-gated mount h1 focus** — `53b514c` (feat)
2. **Task 2 RED: failing title cases** — `2f7fd08` (test)
3. **Task 2 GREEN: per-destination title effect** — `9107647` (feat)
4. **Task 3 RED: failing focus-wiring cases** — `d985441` (test)
5. **Task 3 GREEN: focus layering + error parity** — `2e21c7b` (feat)

**Plan metadata:** see final docs commit below.

## Files Created/Modified

- `src/routes/ArticleView.tsx` — NEW title effect keyed `[article, chapterContext, status]` with all three forms; NEW refs `articleH1Ref` + `errorH1Ref`; both h1s gain `tabIndex={-1}`; NEW h1-default focus branch inside the restore effect's fall-through; NEW status-keyed error-focus effect; setDocumentTitle import (the ONE helper)
- `src/routes/review/ReviewView.tsx` — NEW `h1Ref` + `tabIndex={-1}` on the h1; NEW mount effect (setDocumentTitle + hasAppHistory-gated focus, eslint-disable mount-only — the LibraryView precedent); setDocumentTitle import
- `tests/component/ArticleView.test.tsx` — NEW title describe (3 cases: standalone exact string, error exact string, loading no-write sentinel) + NEW focus describe (3 cases: warm h1 default, cold no-focus with non-vacuous wait, warm error h1); loadLocation mocked via importOriginal spread with a file-level beforeEach default

## Decisions Made

- **Requirements stay open until 14-04** (`requirements-completed: []`): 14-03 ships the complete title + focus implementation, but NAV-04's real-browser proofs (focus timing across engines, deep-link/restore ordering, EPUB chapter title, review destination) are Plan 14-04 Task 2's documented scope — the 14-01 LIB-07 and 14-02 split precedent.
- **hasAppHistory stays out of the focus effects' dep arrays** (documented via eslint-disable at each deps line): App flips it only on real destination hashchange, which coincides with the articleId change that re-runs the effects via `[article]`; listing it would re-fire the restore scroll and resurrect a dismissed ResumeBanner if it ever flipped with the article unchanged.
- **loadLocation mock shape**: `{ok: true, location: null}` (first-open) rather than `{ok: false}` — pins the same silent fall-through branch the real jsdom path takes, but deterministically; `importOriginal` spread keeps `saveLocation` real for useScrollSave.
- **Negative-pin RED shape accepted and documented**: the two absence-asserting cases (loading no-title, cold no-focus) pass at RED by construction; their positive siblings failed for the right reasons, so the gate discipline holds.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **Prettier churn reverted (process note, zero shipped impact):** checking formatting discipline with `prettier --write` on ReviewView.tsx reformatted 8 pre-existing constructs — the file (like the repo at large) has pre-existing prettier drift and prettier is not lint-enforced (`npm run format` is manual). The churn was reverted and the plan edits re-applied, keeping the diff to exactly the planned surface; ESLint + tsc + the review-panel suite were re-run green on the final state.

## TDD Gate Compliance

| Task | RED | GREEN | Notes |
|------|-----|-------|-------|
| Task 2 (title effect) | ✓ `2f7fd08` (2 failed / 8 passed — the two positive title forms absent) | ✓ `9107647` (10/10) | The loading no-write pin passed at RED by construction (asserts absence) |
| Task 3 (focus layering) | ✓ `d985441` (2 failed / 11 passed — the warm + error focus wiring absent) | ✓ `2e21c7b` (13/13) | The cold no-focus pin passed at RED by construction; its non-vacuous wait (loadLocation called + microtask flush) makes it load-bearing at GREEN |

Both gate sequences present in `git log`. Task 1 was a behavior-addition task gated by the review-panel chromium regression (30/30) — no TDD cycle required by the plan.

## User Setup Required

None - no external service configuration required.

## Verification Evidence

- `npx vitest run tests/component/ArticleView.test.tsx` → exit 0 (13/13; plan verification command)
- `npx playwright test tests/e2e/review-panel --project=chromium` → exit 0 (30/30; plan verification command, run on the final committed state)
- Regression sweep beyond the plan gate: happy-path + back-nav + route-entry chromium 12/12; full unit suite 1289 passed / 0 failed / 13 skipped (the documented intentional set)
- `npx tsc --noEmit` → exit 0; targeted `npx eslint` on all three touched files → exit 0
- Deps-array acceptance: `}, [article, chapterContext, status]);` present exactly once (title effect); h1-default call site at the restore fall-through AFTER the byte-unchanged `if (jumpPendingRef.current) return;`
- `git diff --name-only` vs plan start → exactly the three planned files; no App.tsx, no store, no overlay code; zero untracked files

## Known Stubs

None — every surface this plan ships is complete and wired. The browser-scope proofs (deep-link/restore/error focus ordering, EPUB chapter title, review title + warm h1 focus across chromium/firefox/webkit) are Plan 14-04 Task 2's documented validation scope, not stubs (Pitfall 7 boundary — jsdom owns strings/wiring only).

## Next Phase Readiness

- 14-04 Task 2 can pin `toHaveTitle`/`toBeFocused` directly: article `<title> — Lem Reader`, EPUB `Chapter — Book — Lem Reader`, review + warm h1, error title + h1, cold-load immunity, and overlay title stability (no overlay title code exists to drift)
- The seeded-location e2e harness can drive the restore-wins case against the existing banner/scroll machinery untouched
- No blockers. Ready for 14-04.

## Self-Check: PASSED

All 3 modified files exist on disk; all 5 task commit hashes (53b514c, 2f7fd08, 9107647, d985441, 2e21c7b) verified in git log; all task acceptance criteria and plan-level verification commands re-run green (see Verification Evidence).
