---
id: 260908-nk2
title: Fix library page flicker — feedback aside flashes during load
created: 2026-09-08
completed: 2026-09-08
status: complete
files_modified:
  - src/ingestion/library/LibraryView.tsx
  - tests/component/App.test.tsx
commits:
  - 279ecbe: "fix(library): mount feedback aside only after library load settles"
  - e334e14: "test(app): pin feedback-aside absence during library load"
duration_min: 10
---

# Quick 260908-nk2: Fix library page flicker — feedback aside flashes during load

One-liner: The `#/` library route's `.project-feedback` aside is now gated on `status !== "loading"`, so the "Share feedback on GitHub" link no longer flashes inside the viewport during the initial short-page load before rows push it below the fold.

## What Changed

### Task 1 — Gate the project-feedback aside on the settled load (279ecbe)

`src/ingestion/library/LibraryView.tsx`: the `.project-feedback` aside (formerly L763-775, direct child of `<main>` after the `.status` live region) is wrapped in `{status !== "loading" && (…)}`. Inner markup is byte-identical (class names, `aria-label`s, href, target, rel, visible text, `visually-hidden` span — including the original single-line span source shape, which Prettier at printWidth 100 preserves verbatim). A dense JSX comment tagged **Quick 260908-nk2** (mirroring the Plan 16-03 status-region comment style, plain quick-task prose per the 260908-h9l precedent) documents the flash-of-wrong-content motivation, the ready-OR-error gate, and the refreshKey no-remount guarantee.

### Task 2 — Adapt App.test.tsx + pin the no-flash behavior (e334e14)

`tests/component/App.test.tsx`:

1. The route-swap test's feedback-link assertion converted from synchronous `getByRole` to `await screen.findByRole(...)` — after Task 1 the link is absent in the loading state the sync query was hitting (the red half of the predicted red→green pair: exactly 1 test failed between Tasks 1 and 2, at the assertion the plan named). The chained `toHaveAttribute("href", …)` is unchanged.
2. New regression test ("feedback aside never flashes during the library load"): `listArticlesMock.mockReturnValue(new Promise(() => {}))` holds the component in the loading window indefinitely; asserts `queryByRole("link", …Share feedback…)` is `toBeNull()` (aside NOT in the DOM while pending) and the h1 "Saved articles" IS present synchronously (confirms loading state, not empty mount). Explanatory comment in the file's established voice.

## Verification Results

| Command | Result |
| --- | --- |
| `npx vitest run tests/component/App.test.tsx` | ✅ 18/18 passed (17 before + 1 new) |
| `npx eslint src/ingestion/library/LibraryView.tsx tests/component/App.test.tsx` | ✅ clean |
| `npx tsc --noEmit` | ✅ clean |
| `npx prettier --check` (both touched files) | ✅ clean (belt — repo baseline is Prettier-clean) |
| `npm run test:unit -- --run` (optional belt) | ✅ 1637 passed / 0 failed / 13 skipped (intentional set) — 104 files passed, 2 skipped |

Red→green pair confirmed: after Task 1 alone, exactly the one predicted test failed (sync feedback-link query in the loading state); Task 2 turned it green and added the pinning test.

## Deviations from Plan

None — plan executed exactly as written. Two verification notes (not deviations):

- **Prettier self-check (Rule 1-adjacent, self-caught):** the first Task 1 edit broke the span line as `{" "}on GitHub…`; project Prettier (printWidth 100) keeps the span on one line exactly as the original source — applied, restoring byte-identical inner markup. Verified the file was Prettier-clean at baseline and after.
- **Never-settling-mock soundness probe (pre-edit diligence):** confirmed `loadAllLocations`/`loadAllTags` reject in jsdom (no IndexedDB; `MissingAPIError`) while `listBooks` fail-quietly resolves. `Promise.all` therefore rejects on a later task-queue turn, but the regression test's assertions run synchronously on the same call stack as `render(<App />)` — no task queue can drain in between, so the test deterministically observes `status === "loading"` (probe test passed before the real edit; final suite confirms).

## Success Criteria Check

- [x] Loading `#/` never paints the feedback aside; appears only after the load settles (ready or error)
- [x] No aside unmount/remount flicker on remove/add/edit refreshes (load effect never resets status to "loading" — verified at L441/L445, only `ready`/`error` writes)
- [x] Aside markup byte-identical; all byte-stable library anchors (main#main, h1, .status region, ul.library-list) untouched
- [x] Touched test file green (18/18); lint and typecheck clean; full unit suite green (belt)

## Self-Check: PASSED

- `src/ingestion/library/LibraryView.tsx` modified — FOUND in commit 279ecbe
- `tests/component/App.test.tsx` modified — FOUND in commit e334e14
- Commits 279ecbe, e334e14 present on main via `git log`
