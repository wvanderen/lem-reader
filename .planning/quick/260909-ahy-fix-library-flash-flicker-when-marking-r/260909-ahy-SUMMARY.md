---
phase: quick-260909-ahy
plan: 01
subsystem: ingestion/library
tags: [library, continue-reading-strip, reading-state, e2e-regression, ux-flicker]
requires: []
provides:
  - "stale-while-revalidate strip reload via refreshKey prop (no remount, no section collapse)"
  - "optimistic read-state in ReadingStateButton (no stale-label regression across write→reload gap)"
  - "e2e probe lock: strip DOM identity survives a mark-read refresh"
affects:
  - src/ingestion/library/LibraryView.tsx
  - src/ingestion/library/ContinueReadingStrip.tsx
  - src/ingestion/library/ReadingStateButton.tsx
  - tests/e2e/library/progress-recent.spec.ts
tech-stack:
  added: []
  patterns:
    - "refreshKey as effect-dep prop instead of React key remount (stale-while-revalidate)"
    - "optimistic local state bridging write-completion → parent-reload (clear on catch-up/error)"
key-files:
  created: []
  modified:
    - src/ingestion/library/ContinueReadingStrip.tsx
    - src/ingestion/library/LibraryView.tsx
    - src/ingestion/library/ReadingStateButton.tsx
    - tests/e2e/library/progress-recent.spec.ts
decisions:
  - "Strip reload = refreshKey PROP driving a [refreshKey] effect (cancelled-flag cleanup preserved); entries deliberately NOT reset on re-run — stale entries render until fresh data lands"
  - "ReadingStateButton label authority = optimisticRead ?? isRead; optimistic value set at click, cleared when isRead catches up (reload landed) or on error (honest revert + existing retry alert)"
  - "data-flash-probe attribute is the e2e remount detector — React never writes it, so its survival proves DOM identity across the refresh"
metrics:
  duration: 25 min
  completed: 2026-09-09
  tasks: 3
  files: 4
status: complete
---

# Quick 260909-ahy: Fix library flash/flicker when marking read/unread — Summary

Stale-while-revalidate strip reload (refreshKey prop replaces the remount-by-key flash) + optimistic read-state in ReadingStateButton + an e2e probe test proving strip DOM identity survives a mark-read refresh.

## What Was Built

**Task 1 — refreshKey prop instead of key-remount (`a254060`)**
- `ContinueReadingStrip.tsx`: optional `refreshKey?: number` prop (default 0); load effect deps `[]` → `[refreshKey]`; effect body, cancelled-flag cleanup, and Promise.all derivation byte-unchanged; `entries` deliberately NOT reset on re-run — previously-derived entries keep the section mounted (stale-while-revalidate) until fresh data replaces them. A legitimately-empty strip still renders null once FRESH data lands (single data-driven change, not a flash cycle). Header comment extended citing Quick 260909-ahy and the commit-109fb3d root cause.
- `LibraryView.tsx`: strip mount drops `key={refreshKey}`, threads `refreshKey={refreshKey}` as a prop; inline comment documents the mount-once + re-derive-through-prop contract. The `[refreshKey]` load effect, librarySession seam, `.status` live region, 260908-nk2 feedback gate, and view-switcher counts untouched.
- `onReadingStateChange` is render-only (never referenced in the effect), so `[refreshKey]` satisfies react-hooks/exhaustive-deps exactly as `[]` did — confirmed by clean lint.

**Task 2 — optimistic read-state in ReadingStateButton (`f8d9eff`)**
- `optimisticRead: boolean | null` (null = prop authority); `effectiveRead = optimisticRead ?? isRead` drives both the visible label and the `${label}: ${title}` aria-label; "Saving…" pending text byte-stable.
- Click handler sets `setOptimisticRead(!effectiveRead)` alongside `setPending(true)` — accessible name flips to the target action at click time, covering the window where `pending` is already false (write done, refreshKey bumped) but the parent reload hasn't landed.
- Catch-up effect (`[isRead, optimisticRead]`): when the prop matches the optimistic value, clear it — label authority hands back to the prop. Error path: `setError(true)` AND `setOptimisticRead(null)` — honest revert + existing role="alert" retry copy. Props signature, class names, error copy unchanged; both call sites (LibraryRow `isRead={isFinished}`, strip `isRead={false}`) work unmodified.

**Task 3 — e2e regression lock (`888b600`)**
- New test in progress-recent.spec.ts: "marking a row read does not remount the continue-reading strip (Quick 260909-ahy)". Seeds both strip standalones with mid-article locations, tags `.continue-reading-strip` with `data-flash-probe="alive"`, clicks the bundled fixture's mark-as-read (not a strip member), asserts the accessible name flips to `/^Mark as unread:/` (holds in both the optimistic transient and the settled state — cannot flake on reload timing), gates on `.finished-mark` visible (reload landed), then asserts the probe attribute survives and both strip entries persist.

## Verification Results (per task)

| Task | npx tsc | npm run lint | Playwright |
|------|---------|--------------|------------|
| 1 | ✅ pass | ✅ pass | ✅ progress-recent + metadata-edit: 45/45 (chromium/firefox/webkit) |
| 2 | ✅ pass | ✅ pass | ✅ card-actions: 3/3 (chromium/firefox/webkit) |
| 3 | ✅ pass | ✅ pass | ✅ progress-recent incl. new test: 18/18 (chromium/firefox/webkit) |

Plan-level extra verification:
- `npx vitest run tests/unit/persistence/article-read-state.test.ts` — ✅ 5/5 (persistence seam untouched)
- `npx playwright test tests/e2e/library/` — 228 passed / 9 failed; **all 9 verified pre-existing** (see Deviations)
- `npx playwright test tests/e2e/epub-intake.spec.ts` (the plan's recommended book-flow check) — 26 passed / 15 failed; **all 15 verified pre-existing**, and every strip-related cell passes (Continue-Reading entry, reopen-resume, finished-book-leaves-strip)
- Full `npm run test` not run to exit-0 for the same pre-existing reason (the stale expectations live inside the suite).

## Task 3 Red/Green Proof

- **RED**: temporarily restored `key={refreshKey}` on the strip mount in LibraryView → ran the new test (chromium) → FAILED exactly at the probe assertion: `locator('.continue-reading-strip[data-flash-probe="alive"]')` — "element(s) not found" (React recreated the section; the remount detector fired).
- **GREEN**: reverted to `refreshKey={refreshKey}` → same test PASSED (563ms). Working tree verified byte-clean against HEAD afterward.

## Deviations from Plan

None — all three tasks executed exactly as written. One scope-boundary finding logged (not fixed, per the scope rule):

**Pre-existing e2e failures (out of scope, verified empirically)**
- Method: `git checkout c631810 -- src tests` (the pre-task commit), ran the suspect specs, restored HEAD. Identical failure sets at both commits — zero new failures from this task.
- 9 cells in `tests/e2e/library/` (reading-views L640 corpus sanity ×3 engines; library-restore L491 (e) + L533 (f) ×3 engines) and 15 cells in `tests/e2e/epub-intake.spec.ts` (L241/L356/L542/L651/L1211 ×3 engines) all bake in the pre-260907-pw1 seven-fixture library shape; `src/fixtures` has carried ONE bundled article since that change (e.g. `.library-list > li` expected 8 = 1 book + 7 fixtures, receives 2).
- Logged to `deferred-items.md` in this quick-task directory; fix is test-expectation realignment only (the 13-06 stale-expectation precedent), no product code.

## Commits

| Commit | Type | Subject |
|--------|------|---------|
| a254060 | fix | re-derive continue-reading strip via refreshKey prop, not key-remount |
| f8d9eff | fix | optimistic read-state in ReadingStateButton |
| 888b600 | test | lock continue-reading strip DOM identity across mark-read refresh |

## Self-Check: PASSED

- Files exist: ContinueReadingStrip.tsx ✅, LibraryView.tsx ✅, ReadingStateButton.tsx ✅, progress-recent.spec.ts ✅ (all modified at HEAD)
- Commits exist in git log: a254060 ✅, f8d9eff ✅, 888b600 ✅
- No file deletions in any task commit; no stray untracked files outside `.planning/` (deferred-items.md intentionally left for the orchestrator's docs commit)
