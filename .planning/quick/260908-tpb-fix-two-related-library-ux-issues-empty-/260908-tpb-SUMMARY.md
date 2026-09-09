---
phase: quick-260908-tpb-library-ux-fixes
plan: 01
subsystem: library-home
tags: [library, ux, css, e2e]
requires: []
provides:
  - ".library-empty measure wrapper for per-view membership empty states (D14-26 branch)"
  - "unconditionally-mounted .library-section-continue chrome (D16-14 superseded)"
affects:
  - "src/ingestion/library/LibraryView.tsx"
  - "src/app.css"
  - "tests/e2e/library/reading-views.spec.ts"
  - "tests/e2e/chrome/library-tidy.spec.ts"
key-files:
  created: []
  modified:
    - src/ingestion/library/LibraryView.tsx
    - src/app.css
    - tests/e2e/library/reading-views.spec.ts
    - tests/e2e/chrome/library-tidy.spec.ts
decisions:
  - "D16-14 SUPERSEDED (2026-09-08 user feedback): the continue section is pinned chrome above the view switcher — mounts unconditionally on all four views; the original duplication/mismatch rationale is consciously traded for chrome stability. D16-15 strip component byte-unchanged (verified 0-line diff)."
  - ".library-empty joins the shared 1100px centered measure with the --space-lg block-start rhythm of .library-search/.library-no-matches; h2 margin-block-start zeroed per the .library-header h1 / .continue-reading-strip h2 precedents."
metrics:
  duration: 24 min
  completed: "2026-09-09"
status: complete
---

# Quick Task 260908-tpb: Library empty-state gutter + strip view stability Summary

**One-liner:** Wrapped the per-view membership empty state in a `.library-empty` container joining the shared 1100px centered measure, and removed the D16-14 `view === "all"` gate so the Continue reading strip stays mounted on all four library views.

## What Was Built

### Task 1 — Empty state joins the shared 1100px measure (commit 2ad0739)

- `src/ingestion/library/LibraryView.tsx`: the D14-26 membership-empty branch renders the SAME `h2` + `p` inside a `<div className="library-empty">` — element kinds and copy strings byte-stable (heading-name role queries keep passing untouched; verified by the unmodified D14-26 test, green on all 3 engines). Comment extended with the 2026-09-08 user-feedback provenance.
- `src/app.css`: `.library-empty { max-width: 1100px; margin: var(--space-lg) auto 0 auto; }` + `.library-empty h2 { margin-block-start: 0; }`, placed immediately after the no-matches cluster (the closest empty-copy precedent). Token-only; zero motion properties (A11Y-06).
- `tests/e2e/library/reading-views.spec.ts`: NEW test "per-view empty state joins the shared library measure (2026-09-08 gutter fix)" mirroring the library-tidy G1 pattern — 1400×900 on `#/finished` (unseeded corpus ⇒ membership-empty): `.library-empty` and `.library-header` each ≤ 1100px wide with horizontal centers within 1px; 360×640 narrow parity (equal widths). Green on chromium/firefox/webkit.

### Task 2 — Continue strip mounted on every view (commit df33679)

- `src/ingestion/library/LibraryView.tsx`: removed the `{view === "all" && (…)}` conditional — `<section className="library-section library-section-continue">` mounts unconditionally. Comment block rewritten per the Dxx-xx supersession discipline (D16-14 superseded by 2026-09-08 user feedback; original rationale recorded; D16-15 byte-unchanged note retained).
- `ContinueReadingStrip.tsx`: **byte-unchanged** (verified: `git diff ef2f484..HEAD -- src/ingestion/library/ContinueReadingStrip.tsx` = 0 lines). Still returns null while loading / when the unfinished set is empty.
- `tests/e2e/library/reading-views.spec.ts`: strip test UPDATED (not deleted) — retitled "Continue Reading strip: mounted and visible on every view — all, unread, in-progress, and finished (D16-14 superseded; D16-15 byte-unchanged)"; seeds the corpus (STANDALONE_PROGRESS mid-article location ⇒ cards exist) then asserts `.library-section-continue` + `.continue-reading-strip` visible and containing "Continue reading" on each of the four views. Describe-block comment records the supersession; its strengthen-only sentence remains true for every test above.
- `tests/e2e/chrome/library-tidy.spec.ts`: stale "prepareFreshPage lands on #/, the All view, so the continue section is present" comment refreshed (comment-only; the ordering assertion byte-unchanged).

### Task 3 — Honest verification gate (no files modified)

- **Affected e2e set (6 specs, 3 engines):** `reading-views`, `search-tag-filter`, `progress-recent`, `v1-regression`, `chrome/library-tidy`, `metadata-edit` — **150 passed / 3 failed**.
- **Pre-existing failures (diffed honestly, NOT introduced here):** the 3 failures are `reading-views.spec.ts:640 "corpus sanity: the imported policy derives the designed corpus"` on chromium/firefox/webkit — listed VERBATIM in `.planning/quick/260908-oht-fix-article-completion-detection-and-add/deferred-items.md` ("reading-views:640 corpus sanity"), caused by the 09-07 non-GSD commit `b13eba5` reducing the bundled `fixtures` corpus to the single `getting-started` article (`EXPECTED_COUNTS.unread` is now 3, the stale pin expects 9). Pure Node-side expectation over module constants — untouched by this change block.
- **Unit:** `npm run test:unit -- --run` — 1672 passed / 13 skipped (documented intentional skips) / 0 failed.
- **Lint:** `npm run lint` — clean (exit 0).
- **Typecheck:** `npx tsc --noEmit` — clean (exit 0).

## Deviations from Plan

None — plan executed exactly as written. The only test failures encountered were the documented pre-existing corpus-sanity set, handled per the plan's own honesty protocol (diffed against the deferred-items.md known set; recorded above; never silently re-run to green).

## Commits

| Task | Commit | Files |
| ---- | ------ | ----- |
| 1 | 2ad0739 | LibraryView.tsx, app.css, reading-views.spec.ts |
| 2 | df33679 | LibraryView.tsx, reading-views.spec.ts, library-tidy.spec.ts |
| 3 | (verification only — no commit) | — |

## Self-Check: PASSED

- Files exist: LibraryView.tsx, app.css, reading-views.spec.ts, library-tidy.spec.ts (all modified in commits 2ad0739/df33679 — confirmed via `git diff --stat`).
- Commits exist on main: 2ad0739, df33679.
- No unintended deletions (`git diff --diff-filter=D` empty), no untracked files left behind.
- ContinueReadingStrip.tsx and EMPTY_COPY strings byte-unchanged.
