---
phase: 13-polish-and-acceptance
plan: 03
subsystem: ui
tags: [css, dialog-centering, modal, whatwg, library-view, playwright, e2e, polish]

# Dependency graph
requires:
  - phase: 02-settings
    provides: WipeConfirm dialog + STATE-05 corrupt-row trigger path, settings panel gear + import input
  - phase: 08-library
    provides: LibraryView structure + LibraryRow/library-list anchors, RemoveConfirm row-trash trigger, IngestControl
  - phase: 09-portability
    provides: ImportPreviewDialog + _portability.ts harness (prepareFreshPage/seedRows/openSettings/buildBundleZip)
  - phase: 05-annotations
    provides: NotePopover modal dialog + annotations/_fixtures.ts selection helpers ("n" activation path)
provides:
  - "margin:auto on the four centered modal dialogs (highlight-popover, wipe-confirm, library-remove-confirm, import-preview) restoring UA dialog:modal centering (POLISH-04 / D13-14)"
  - "tests/e2e/chrome/dialog-centering.spec.ts — boundingBox centering assertions, 4 modals × real UI paths × 3 engines (12 cells)"
  - "LibraryView bounded tidy: header row + three ordered sections (continue → add content+status → library list) with token-only spacing (POLISH-06 / D13-16)"
  - "tests/e2e/chrome/library-tidy.spec.ts — DOM-order + byte-stable-anchor assertions (2 tests × 3 engines)"
affects: [13-VERIFICATION.md acceptance records, phase-13 UAT]

# Tech tracking
tech-stack:
  added: []  # zero installs (T-13-SC)
  patterns:
    - "Viewport-centering assertion recipe: open each modal through its real UI path → scrollTo(0,0) → locator.boundingBox() vs page.viewportSize() with ±24px tolerance per axis"
    - "about:blank hop forces a true navigation when seeding must be observed by a cold load (hash-only goto is same-document — the app never reloads)"
    - "Margin-collapsing section wrappers: no padding/border on tidy sections so children's own margins collapse through — one --space-xl rhythm without doubled gaps"

key-files:
  created:
    - tests/e2e/chrome/dialog-centering.spec.ts
    - tests/e2e/chrome/library-tidy.spec.ts
  modified:
    - src/app.css
    - src/ingestion/library/LibraryView.tsx

key-decisions:
  - "margin:auto as a single shorthand (not a margin-inline/margin-block split) on exactly the four centered modals — the minimal restoration of the UA stylesheet's dialog:modal centering; side sheets byte-unchanged"
  - "scrollTo(0, 0) before boundingBox() measurement — a fixed-position dialog never moves, so settling scroll top makes Playwright's box coordinates unambiguously viewport-relative on every engine"
  - "No section labels in the LibraryView tidy (no aria-labels, no headings) — the D13-16 audit names ordering/density/weight, not missing copy; prefer none"
  - "Scoping .library-section-add > .status in tests — the library page carries TWO .status live regions (IngestControl's inner one + LibraryView's byte-stable one)"

patterns-established:
  - "Real-UI dialog-opening matrix in e2e: note editor via select+`n`, wipe-confirm via corrupt settings row + cold load, remove-confirm via row trash, import-preview via valid bundle through settings — all reused from shipped harnesses (REUSE-DO-NOT-FORK)"
  - "Comment prose avoids greppable property names (transition/animation) so acceptance greps stay clean — the 13-01 discipline applied again"

requirements-completed: [POLISH-04, POLISH-06]

# Metrics
duration: 12 min
completed: 2026-08-19
status: complete
---

# Phase 13 Plan 03: Chrome Polish — Dialog Centering + Library Tidy Summary

**margin:auto restored on the four centered modal dialogs (WHATWG §15.3.3 root cause) and LibraryView regrouped into a header row + three calm ordered sections — proven by 18 new 3-engine e2e cells with every existing library spec green byte-unchanged**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-19T02:01:34Z
- **Completed:** 2026-08-19T02:14:15Z
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- POLISH-04 closed: the note editor, wipe confirmation, library remove confirmation, and import preview all open centered in the viewport on chromium/firefox/webkit — the reported top-left-corner bug is gone, CSS-only, zero JS positioning
- The intentional side sheets (settings panel, annotations drawer) are byte-unchanged — the diff touches no line inside their rule blocks (verified per-hunk); their `margin: 0` inline-end anchoring is documented in-place as deliberate
- POLISH-06 closed: the library home reads as a header row (h1 + quiet Review-highlights button) then three ordered sections — continue reading, add content (IngestControl with the .status live region directly following), library list (search, tag filter, rows)
- Byte-stable anchors proven: main#main skip-link target, h1 "Saved articles", the .status live-region semantics, LibraryRow markup, and both hash-assignment fallbacks preserved; the cancelled-flag load effect is untouched
- Full regression honest: 81 library cells, 30 reduced-motion cells, 39 a11y (axe) cells, 54 dialog-adjacent cells, and the complete unit suite (1186 passed / 0 failed / 13 intentional skips — the 13-02 baseline) all green

## Task Commits

Each task was committed atomically:

1. **Task 1: Restore dialog centering (4 modals) + centering spec** — `23fa1e5` (feat)
2. **Task 2: LibraryView bounded tidy + tidy assertions** — `0aaf8b7` (feat)

## Files Created/Modified
- `src/app.css` — margin:auto + explanatory comments on the four centered modal blocks; new .library-header / .library-section token-only spacing rules (zero motion properties)
- `src/ingestion/library/LibraryView.tsx` — structure-only reorg into header row + three sections; anchors and load effect byte-stable
- `tests/e2e/chrome/dialog-centering.spec.ts` — 4 parameterized modals × real UI opening paths × boundingBox centering assertions (±24px both axes), 12 cells
- `tests/e2e/chrome/library-tidy.spec.ts` — DOM ordering via compareDocumentPosition + byte-stable anchor assertions, 6 cells

## Decisions Made
- **Single-shorthand `margin: auto`** over a logical-property split — the minimal, engine-uniform restoration of the UA centering the WHATWG rendering spec describes; the adjacent comments now cite the spec section and the D13-14 root cause so the regression cannot silently return.
- **Scroll-settle before measurement**: `window.scrollTo(0, 0)` before `boundingBox()` makes the fixed-position dialog's coordinates unambiguous under every Playwright scroll interpretation; the ±24px tolerance absorbs subpixel + classic-scrollbar viewport variance (firefox/webkit).
- **Unlabeled sections**: the tidy adds grouping structure without any new copy — the audit named ordering/density/weight, not missing labels, and the plan prefers none.
- **Test selector scoping**: `.library-section-add > .status` distinguishes LibraryView's byte-stable live region from IngestControl's inner one (two .status elements share the page).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] wipe-confirm e2e never opened the dialog on first run**
- **Found during:** Task 1 (first spec run — 9/12 passed, wipe-confirm failed on all 3 engines)
- **Issue:** `page.goto` from the mounted library view to a hash-only article URL is a same-document navigation — the app never reloads, so the freshly seeded corrupt settings row is never read and WipeConfirm stays closed (the dialog resolved but `open` stayed false)
- **Fix:** about:blank hop before the article goto forces a true cold-load navigation (the cold-load-no-snap.spec.ts `coldLoad` precedent)
- **Files modified:** tests/e2e/chrome/dialog-centering.spec.ts
- **Verification:** 12/12 cells green (chromium, firefox, webkit)
- **Committed in:** 23fa1e5 (Task 1 commit)

**2. [Rule 3 - Blocking] tidy CSS comment tripped the motion-property acceptance grep**
- **Found during:** Task 2 (acceptance verification)
- **Issue:** The plan's added-lines grep for `transition|animation` must return 0, but my zero-motion comment named the properties in prose (the exact 13-01 deviation class)
- **Fix:** Reworded the comment to "Zero motion properties by design" (13-01 comment discipline)
- **Files modified:** src/app.css
- **Verification:** `git diff src/app.css | grep "^+" | grep -cE "transition|animation"` → 0
- **Committed in:** 0aaf8b7 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes necessary for green gates and honest acceptance greps. Zero production behavior beyond the planned CSS/markup changes; no scope creep.

## Issues Encountered
None beyond the deviations above.

## Verification Results
- `npx playwright test tests/e2e/chrome/dialog-centering.spec.ts` — 12/12 passed (chromium, firefox, webkit; both axes ±24px)
- `npx playwright test tests/e2e/chrome/library-tidy.spec.ts` — 6/6 passed (chromium, firefox, webkit)
- Plan verification (combined): `npx playwright test tests/e2e/chrome/dialog-centering.spec.ts tests/e2e/chrome/library-tidy.spec.ts` — 18/18 passed
- Regression: `npx playwright test tests/e2e/library/` — 81/81 passed, `git diff --name-only tests/e2e/library/` empty (byte-unchanged)
- Regression: `npx playwright test tests/e2e/reduced-motion.spec.ts` — 30/30 passed (run after both tasks' CSS changes)
- Dialog-adjacent sanity: persistence + import-preview + remove-cascade + note-popover-focus + cold-load-no-snap — 54/54 passed
- a11y (axe) with the new library structure — 39/39 passed
- `npx vitest run` (full unit suite) — 1186 passed / 0 failed / 13 intentional skips; `npx tsc --noEmit` — clean
- Prohibitions: per-block awk shows `margin: auto` exactly once in each of the four centered blocks; settings-panel/annotations-drawer hunts absent from `git diff -U0` (byte-unchanged, both still carry `margin: 0`); task-1 diff touches no .tsx file; added CSS lines contain 0 motion-property matches

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- POLISH-04 + POLISH-06 closed; the chrome e2e directory (tests/e2e/chrome/) is established for the remaining Phase 13 chrome specs (13-04 header slim / back affordance per the phase plan set)
- No blockers; all suites green at the 13-02 baseline or better

## Self-Check: PASSED

All 4 key files exist on disk (src/app.css, src/ingestion/library/LibraryView.tsx, tests/e2e/chrome/dialog-centering.spec.ts, tests/e2e/chrome/library-tidy.spec.ts); both task commits (23fa1e5, 0aaf8b7) present in git log.

---
*Phase: 13-polish-and-acceptance*
*Completed: 2026-08-19*
