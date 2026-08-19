---
phase: 13-polish-and-acceptance
plan: 10
subsystem: ui
tags: [popover-api, react, accessibility, e2e, playwright, css]

# Dependency graph
requires:
  - phase: 13-04
    provides: the Option A article-top metadata spot + firstPageReservedPx reserve machinery this plan restructures
  - phase: 13-09
    provides: the stable-first-paint pending window + the chrome/polish spec conventions
provides:
  - Top-bar tag affordance (tags-trigger icon + popover="auto" light-dismiss panel wrapping the byte-unchanged TagEntry)
  - Compact provenance-only article-top spot (byline·date, book-context, source link — zero buttons)
  - Per-article Export highlights relocated into the AnnotationsDrawer header row
  - Realigned + strengthened geometry/tag/export specs incl. the new tag-popover spec (open/edit/persist/light-dismiss/Esc/focus-restore + axe)
  - Honest full-suite gate green with the latent-race repairs it surfaced (workers cap at 3)
affects: [polish-and-acceptance, any-future-reader-chrome-work]

# Tech tracking
tech-stack:
  added: []  # zero packages (T-13-10-SC honored)
  patterns:
    - "Popover API popover=auto + toggle-event close seam: ONE seam routes light-dismiss, Esc, and programmatic closes through onCloseTags + trigger focus restore (Pitfall 1)"
    - "App-lifted open state + Header trigger + ArticleView surface — the third instance of the drawerOpen ownership pattern (settings, drawer, tags)"
    - "loadAllTags reads ONLY Dexie article rows — fixture articles cannot carry tags; tag-flow e2e must seed a real row (the portability seedRows convention)"
    - "deleteDatabase + never-closed raw seed connections can wedge a later Dexie versioned reopen into a blocked upgrade — seed-bearing specs use prepareFreshPage (clear-stores) instead"

key-files:
  created:
    - tests/e2e/chrome/tag-popover.spec.ts
  modified:
    - src/App.tsx
    - src/reader/Header.tsx
    - src/routes/ArticleView.tsx
    - src/reader/annotations/AnnotationsDrawer.tsx
    - src/app.css
    - tests/component/ArticleView.test.tsx
    - tests/e2e/chrome/header-geometry.spec.ts
    - tests/e2e/library/search-tag-filter.spec.ts
    - tests/e2e/portability/highlights-export.spec.ts
    - tests/e2e/forced-colors.spec.ts
    - tests/e2e/pdf-intake.spec.ts
    - tests/e2e/progress.spec.ts
    - tests/e2e/section-announce.spec.ts
    - tests/e2e/persistence.spec.ts
    - playwright.config.ts

key-decisions:
  - "G5 disposition: tag affordance = top-bar popover beside the reader controls; article-top spot = provenance-only; Export highlights = the drawer (highlight-scoped action in the highlight-scoped surface)"
  - "Popover close seam = the native toggle event (newState closed), not per-path handlers — light-dismiss/Esc/programmatic all restore focus to the captured trigger"
  - "Gate-owning plan fixes the races the gate surfaces (09-07 precedent): pre-existing 13-09-class latent races repaired test-side after b033e57 bisection proved them pre-plan"
  - "e2e workers capped at 3 — the only convergent fix for the moving-target webkit goto-starvation under multi-user load"

patterns-established:
  - "tags-trigger mirrors annotations-trigger geometry exactly (44×44 transparent chrome, accent only when expanded)"
  - "CSS-locator counts for closed-popover/closed-dialog DOM; role queries only after the surface opens"

requirements-completed: [POLISH-03]

# Metrics
duration: 74 min
completed: 2026-08-19
status: complete
---

# Phase 13 Plan 10: Gap G5 — tag affordance → top-bar popover + compact provenance spot + drawer-housed export Summary

**G5 closed at the user's bar: tags edit from a light-dismiss top-bar popover (native Popover API, focus-restoring), the article opens with quiet provenance lines only, and Export highlights lives in the annotations drawer — with the honest full-suite gate green (2284 passed / 0 failed / 19 skipped, exit 0).**

## Performance

- **Duration:** 74 min
- **Started:** 2026-08-19T21:36:03Z
- **Completed:** 2026-08-19T22:50:32Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- Tag affordance moved out of the article flow into a `tags-trigger` icon button (new inline-SVG TagIcon) inline-start of the annotations trigger, opening a `popover="auto"` role=dialog panel that wraps the **byte-unchanged** TagEntry; one toggle-event close seam handles light-dismiss, Esc, and programmatic closes with trigger focus restore.
- The article-top spot is now a compact provenance block (byline·date, epub book-context line, source link) with **zero buttons**; `.article-top-actions` deleted from component and CSS; the measure-once firstPageReservedPx reserve machinery is untouched and simply much smaller.
- Per-article Export highlights relocated into the AnnotationsDrawer header row via new `onExportHighlights`/`exportingHighlights` props; the handler, disabled state, and the visually-hidden announcement region all stay in ArticleView.
- Specs strengthened, not weakened: header-geometry pins zero-buttons-in-spot + css-scoped drawer export count; the new tag-popover spec covers open/edit/persist/light-dismiss/Esc/focus-restore + drawer export announce + axe on the open state; the portability export-content gate gained the drawer-open step with every content + announcement assertion byte-preserved.
- The honest full-suite gate surfaced and closed a pre-existing latent-race class (see Deviations) and now exits 0 in a single plain invocation.

## Task Commits

Each task was committed atomically:

1. **Task 1: Tag affordance → top-bar popover** — `3977351` (feat)
2. **Task 2: Compact spot + drawer export + specs** — `4a2b85b` (feat)
3. **Gate repair: latent races** — `25db7b5` (test)
4. **Gate repair: workers cap** — `e56b900` (chore)

## Verification Results

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | clean (exit 0) |
| Task suites (search-tag-filter + header-geometry + v1-regression) | 42 passed, 3 engines |
| Task suites (tag-popover + header-geometry + dialog-centering + a11y + portability highlights-export) | 75 passed, 3 engines |
| `tests/e2e/pagination/` + `open-every-fixture.spec.ts` | 234 passed |
| `tests/e2e/chrome/` + `tests/e2e/polish/` | 72 passed |
| `tests/e2e/library/` + `a11y.spec.ts` + `epub-intake.spec.ts` | 165 passed |
| `tests/e2e/portability/` | 39 passed |
| `npx vitest run` | 1200 passed / 0 failed / 13 skipped |
| Byte-freeze (TagEntry, PageIndicator, settingsStore, applyTheme, fragment.ts, firstPageReserved.test.ts; 09-07 cap lines; emoji sweep) | all byte-unchanged / absent |
| **`npm run test` (the honest full-suite gate)** | **exit 0 — unit 1200 passed / 0 failed / 13 skipped + e2e 1084 passed / 0 failed / 6 skipped (10.2m)** |
| `npm run perf` (re-verified post workers-cap) | D6-04 gate PASSED, exit 0 |

Gate history (recorded honestly, the 13-06/09-07 precedent): run 1 exit 1 (16 failures — 11 latent-race cells repaired in 25db7b5 + 5 webkit goto-starvation), run 2 exit 1 (5 webkit goto-starvation, moving target; fresh dev server ruled out), run 3 exit 1 (5 different webkit goto-starvation cells — concurrency is the driver), run 4 **exit 0** after the workers cap (e56b900). The 19 skips are the documented intentional set (13 unit + 6 e2e incl. the 2 SSRF residuals × 3 engines).

## Files Created/Modified
- `src/App.tsx` — tagsOpen state lifted beside drawerOpen, view-swap reset, Header/ArticleView prop threads
- `src/reader/Header.tsx` — tags-trigger button + local TagIcon glyph (GearIcon anatomy)
- `src/routes/ArticleView.tsx` — popover surface + toggle-event close seam + compacted articleTopMeta + export props threaded to the drawer
- `src/reader/annotations/AnnotationsDrawer.tsx` — Export highlights button in the header row via new props
- `src/app.css` — `.tags-trigger` (+ open-state variant), `.tag-popover`, minimal `.article-top-meta`; `.article-top-actions` + scoped overrides deleted
- `tests/e2e/chrome/tag-popover.spec.ts` — NEW: the full popover contract + drawer export announce + axe
- `tests/e2e/chrome/header-geometry.spec.ts` — realigned + strengthened to the new anatomy
- `tests/e2e/library/search-tag-filter.spec.ts` — popover-open steps in every TagEntry interaction
- `tests/e2e/portability/highlights-export.spec.ts` — drawer-open step before the relocated button; announcement assertion untouched
- `tests/component/ArticleView.test.tsx` — new required props
- `tests/e2e/forced-colors.spec.ts`, `tests/e2e/pdf-intake.spec.ts`, `tests/e2e/progress.spec.ts`, `tests/e2e/section-announce.spec.ts`, `tests/e2e/persistence.spec.ts` — gate-surfaced latent-race repairs
- `playwright.config.ts` — workers capped at 3 (starvation convergence)

## Decisions Made
- **Popover ownership mirrors AnnotationsDrawer exactly**: App lifts `tagsOpen`, Header renders the trigger, ArticleView mounts the surface — the third instance of the pattern (settings, drawer, tags).
- **One close seam**: the popover `toggle` event (newState "closed") routes ALL close paths (light-dismiss, Esc, hidePopover) through `onCloseTags()` + captured-trigger focus restore — no per-path handlers.
- **CSS-locator counts for closed surfaces**: header-geometry counts `.tag-entry`/`.annotations-drawer-export` via CSS (closed popover/dialog DOM matches CSS locators; role/visibility queries do not) — documented in the specs.
- **webkit focus-restore quirk**: the popover focus assertion asserts the weaker not-trapped contract on webkit (the documented drawer-view.spec.ts close-lifecycle quirk; chromium/firefox assert the strict trigger restore).
- **Gate-owning plan fixes what the gate surfaces** (09-07 precedent) — including the workers cap, chosen over per-spec budget whack-a-mole after two runs proved the starvation target moves.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Component tests needed the new required props**
- **Found during:** Task 1 (tsc gate)
- **Issue:** `tests/component/ArticleView.test.tsx` mounts ArticleView directly; the new required `tagsOpen`/`onCloseTags` props broke compilation (7 call sites).
- **Fix:** Added `tagsOpen: false` + `onCloseTags: () => {}` to the withProps helper.
- **Files modified:** tests/component/ArticleView.test.tsx
- **Verification:** tsc clean; 7/7 component tests pass.
- **Committed in:** 3977351 (part of the Task 1 commit)

**2. [Rule 1 - Bug] search-tag-filter had FOUR TagEntry interaction sites, not two**
- **Found during:** Task 1
- **Issue:** The plan named "BOTH ArticleView tag flows" (~146–155, ~205–214) but the spec has four popover-dependent sites: test 1's fill, test 2's fill, test 2's chip-REMOVE after returning to the article, and test 4's fill — all unreachable with the popover closed.
- **Fix:** Inserted the popover-open step (trigger click + `.tag-popover` visible) before every interaction, matching the plan's exact step shape.
- **Files modified:** tests/e2e/library/search-tag-filter.spec.ts
- **Verification:** 42 passed across 3 engines.
- **Committed in:** 3977351

**3. [Rule 3 - Blocking] tag-popover spec harness: fixture rows cannot carry tags + a seeding deadlock**
- **Found during:** Task 2
- **Issue:** (a) `loadAllTags` reads only Dexie article rows — tagging a bundled fixture is a silent no-op, so the persistence flow needed a seeded row; (b) my first harness combined `deleteDatabase` (beforeEach) with `seedRows`' never-closed raw versionless connection — when the delete landed mid-boot, the raw open created a v1 empty DB and Dexie's versioned reopen wedged into a blocked upgrade ("Opening article…" forever); (c) the library view mounted before the seed never remounts on hashchange (the 08-05 lesson).
- **Fix:** Seeded a `makeArticle` Dexie row via the portability helpers, opened it by direct goto, and switched beforeEach to `prepareFreshPage` (clear-stores, never deleteDatabase) — the dialog-centering convention.
- **Files modified:** tests/e2e/chrome/tag-popover.spec.ts
- **Verification:** 9/9 across 3 engines.
- **Committed in:** 4a2b85b

**4. [Rule 1 - Bug] The honest gate surfaced a pre-existing latent-race class (proven pre-plan)**
- **Found during:** plan-level verification (`npm run test` run 1: 16 failures)
- **Issue:** Four specs failed deterministically under the current timing on BOTH plan and pre-plan code (bisected at b033e57): forced-colors' `.article-body a`.first() resolves to the hidden measurement-clone anchor (the 13-09 always-clone pending DOM); pdf-intake SC#1's bare getByText trips strict mode against the clone copy; progress' scroll-to-bottom and section-announce's scroll-past-h2 ride window scrolling that the paginated default locks (they only ever passed on the pre-13-09 scrolling pending paint). Plus webkit goto-starvation cells (persistence, highlights-export) and a moving set of late-suite webkit `page.goto` >30s timeouts across runs 2–3 with zero code-level failures.
- **Fix:** forced-colors + pdf-intake scoped to the visible surface (the repo's own `_fixtures` selector discipline); progress + section-announce pin scrolling via the real mode toggle (header-geometry precedent); persistence + highlights-export budgets doubled (the documented 09-07 precedent); workers capped at 3 to converge the starvation.
- **Files modified:** tests/e2e/forced-colors.spec.ts, tests/e2e/pdf-intake.spec.ts, tests/e2e/progress.spec.ts, tests/e2e/section-announce.spec.ts, tests/e2e/persistence.spec.ts, tests/e2e/portability/highlights-export.spec.ts, playwright.config.ts
- **Verification:** final `npm run test` exit 0 (unit 1200/0/13 + e2e 1084/0/6); `npm run perf` exit 0 post-cap.
- **Committed in:** 25db7b5 + e56b900

---

**Total deviations:** 4 auto-fixed (1 missing critical, 2 blocking, 1 bug)
**Impact on plan:** All fixes necessary for the plan's own gates (compile, spec correctness, the honest full-suite exit 0). The latent-race repairs touch specs outside the plan's file list but were surfaced BY the plan's gate and follow the 09-07 gate-ownership precedent; assertions were strengthened, never weakened.

## Issues Encountered
None beyond the deviations above. No auth gates; no package installs (T-13-10-SC honored).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 13 plan 10 of 10 complete — the wave-5 gap-closure cycle (G1–G5) ends with the whole suite green in one plain invocation.
- Ready for phase verification/UAT (13-VERIFICATION.md, 13-UAT.md) and milestone close-out.
- Standing environment note: the e2e workers cap (3) trades ~3 minutes of suite wall-clock for starvation immunity on shared machines.

## Self-Check: PASSED

- tests/e2e/chrome/tag-popover.spec.ts exists (created)
- All key-files.modified present on disk
- Commits 3977351, 4a2b85b, 25db7b5, e56b900 present in git log
- Byte-freeze verified over b033e57..HEAD (six frozen files byte-unchanged; 09-07 cap lines absent from the app.css diff; zero emoji introduced)
- Honest full-suite gate: exit 0, counts recorded above

---
*Phase: 13-polish-and-acceptance*
*Completed: 2026-08-19*
