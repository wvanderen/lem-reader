---
phase: 13-polish-and-acceptance
plan: 07
subsystem: ui
tags: [css, library-view, inline-svg, icon-button, content-measure, playwright, e2e, gap-closure, polish]

# Dependency graph
requires:
  - phase: 13-polish-and-acceptance (Plan 03)
    provides: LibraryView bounded tidy (header row + three ordered sections), .library-header/.library-section token-spacing rules, library-tidy.spec.ts anchor discipline
  - phase: 08-library
    provides: LibraryRow markup + .library-row-remove button with the byte-stable aria-label template, RemoveConfirm cascade gating
  - phase: 02-settings
    provides: GearIcon inline-SVG icon anatomy (Header.tsx) this plan's TrashIcon mirrors
provides:
  - ".library-section-add measure rule (max-width 1100px + margin-inline auto) — G1 closed: the add-content section joins the shared centered measure its siblings carry"
  - "TrashIcon local inline-SVG waste-bin glyph in LibraryRow.tsx + .library-row-remove quiet destructive icon-button rule — G3 closed: src/ is emoji-as-icon free"
  - "library-tidy.spec.ts \"add section shares the library measure (G1)\" — boundingBox width ≤ 1100 + 1px center parity vs .library-list at 1400×900, equal-width cell at 360×640"
affects: [13-VERIFICATION.md acceptance records, phase-13 UAT gap closure G1/G3]

# Tech tracking
tech-stack:
  added: []  # zero installs (T-13-07-SC)
  patterns:
    - "Measure-parity e2e assertion: locator.boundingBox() width caps + horizontal-center delta (≤1px) between sibling sections at wide viewport, equal-width at narrow viewport — pins the shared content measure permanently"
    - "Local icon-component reuse: TrashIcon follows the GearIcon anatomy verbatim (prop-driven ariaHidden, focusable=false) so icon glyphs stay consistent across the app"

key-files:
  created: []
  modified:
    - src/app.css
    - src/ingestion/library/LibraryRow.tsx
    - tests/e2e/chrome/library-tidy.spec.ts

key-decisions:
  - ".library-section-add mirrors .library-header's exact centering pattern (max-width 1100px + margin-inline auto); the wrapper stays padding/border-free so the 13-03 margin-collapsing rhythm is preserved — .ingest-control's own block, side-sheet rules, and dialog rules untouched"
  - "TrashIcon keeps the remove button's type/className/aria-label template byte-identical (remove-cascade.spec.ts + dialog-centering.spec.ts locate the button by that accessible name); only the glyph child swapped"
  - ".library-row-remove mirrors the .tag-chip-remove discipline: transparent background/border, 4px radius, var(--touch) box, var(--ink-soft) at rest, hover shifts color AND border-color to var(--destructive) so consequence is conveyed beyond the accessible name (forced-colors-safe)"

patterns-established:
  - "Comment prose avoids greppable motion-property names so acceptance greps stay clean (13-01/13-03 discipline held again — both tasks' added CSS lines grep 0)"
  - "No fixed sleeps in measure assertions: gate on the visible .library-list > li row, then direct boundingBox() reads after each setViewportSize"

requirements-completed: [POLISH-06]

# Metrics
duration: 3 min
completed: 2026-08-19
status: complete
---

# Phase 13 Plan 07: Gap Closure — Library Measure + Trash Icon Summary

**G1+G3 closed: the Add-an-article section now sits inside the shared centered 1100px measure (proven by new boundingBox parity assertions at 1400×900 and 360×640) and the library row remove control renders a real inline-SVG waste-bin in a quiet destructive icon button — src/ is emoji-as-icon free**

## Performance

- **Duration:** 3 min
- **Started:** 2026-08-19T21:02:20Z
- **Completed:** 2026-08-19T21:05:26Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- G1 (POLISH-06) closed at the user bar: one scoped rule `.library-section-add { max-width: 1100px; margin-inline: auto; }` brings the add-content section into the same centered measure as `.library-header`, `.continue-reading-strip`, `.library-search`, `.tag-filter`, and `.library-list` — no more edge-to-edge card; wrapper stays padding/border-free so the 13-03 margin-collapsing rhythm is untouched
- G3 (icon policy / D13-12) closed at the user bar: the remove button's emoji glyph is now a local `TrashIcon` inline-SVG component following GearIcon anatomy exactly (20×20, viewBox 0 0 24 24, fill none, stroke currentColor, strokeWidth 1.75, round caps/joins, aria-hidden, focusable=false); repo-wide waste-bin emoji sweep over src/ returns zero files
- New quiet icon-button rule `.library-row-remove` (+ `:hover`) mirrors the .tag-chip-remove discipline — transparent rest state, 44px var(--touch) box, var(--ink-soft), hover conveys consequence via var(--destructive) on color AND border-color
- Strengthened library-tidy.spec.ts pins the parity permanently: "add section shares the library measure (G1)" asserts both boxes ≤ 1100 wide with a shared horizontal center within 1px at 1400×900, then equal widths at 360×640 (no narrow-viewport regression)
- Full regression green: 81/81 library cells, 30/30 reduced-motion cells, 27/27 remove-cascade + dialog-centering + tidy cells across chromium/firefox/webkit, 39/39 library unit tests, tsc clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Constrain the add section to the shared 1100px measure + strengthen library-tidy parity assertions (G1)** — `7d87c34` (fix)
2. **Task 2: Replace the LibraryRow emoji glyph with an inline-SVG trash icon + quiet icon-button styling (G3)** — `9314152` (fix)

## Files Created/Modified
- `src/app.css` — `.library-section-add` measure rule (after `.library-section`) + `.library-row-remove`/`:hover` quiet destructive icon-button rules (next to the library-row block); zero motion properties in all added lines
- `src/ingestion/library/LibraryRow.tsx` — TrashIcon local component + glyph swap inside the byte-stable remove button; header comment updated without naming the old emoji character
- `tests/e2e/chrome/library-tidy.spec.ts` — new "add section shares the library measure (G1)" test (3 viewports/engines cells follow the existing direct-read discipline)

## Decisions Made
- **Measure rule placement and shape**: added directly after `.library-section` with a comment citing G1 + the sibling-measure discipline; uses the exact centering pattern `.library-header` already carries. `.ingest-control`'s own block, side-sheet rules, and dialog rules were not touched (verified: zero `ingest` mentions in the diff hunks outside the new scoped rule).
- **Byte-stability over refactor**: the remove button's `type="button"`, `className="library-row-remove"`, and aria-label template `Remove ${article.provenance.title} from library` stayed byte-identical because dialog-centering.spec.ts and remove-cascade.spec.ts locate the control by that accessible name — only the glyph child changed.
- **Hover conveys consequence on two channels** (color + border-color both to var(--destructive)), mirroring .tag-chip-remove so forced-colors users still get shape + accessible name.

## Deviations from Plan

None - plan executed exactly as written.

Both tasks' acceptance gates passed on the first run; no Rule 1-4 deviations were triggered.

## Issues Encountered
None.

## Verification Results
- `npx playwright test tests/e2e/chrome/library-tidy.spec.ts` — 9/9 passed (3 tests × chromium/firefox/webkit), including the new measure-parity test
- `npx playwright test tests/e2e/library/remove-cascade.spec.ts tests/e2e/chrome/dialog-centering.spec.ts tests/e2e/chrome/library-tidy.spec.ts` — 27/27 passed (accessible name unchanged)
- `npx vitest run tests/unit/library/` — 39/39 passed
- `npx playwright test tests/e2e/library/` — 81/81 passed (full library regression, 81-cell baseline)
- `npx playwright test tests/e2e/reduced-motion.spec.ts` — 30/30 passed (zero-motion discipline holds after CSS edits)
- `npx tsc --noEmit` — clean
- Icon sweep: repo-wide waste-bin emoji search over src/ → zero files
- Motion-property grep: `git diff src/app.css` added lines → 0 matches for the two CSS motion property names (both tasks)
- Acceptance greps: `.library-section-add` rule present with `max-width: 1100px` + `margin-inline: auto`; `function TrashIcon(` with `viewBox="0 0 24 24"` + `focusable="false"` mounted in the `.library-row-remove` button; `.library-row-remove` rule uses `var(--touch)` with hover `var(--destructive)`

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- G1 + G3 from the Phase 13 user review are closed with permanent e2e pins; the remaining gap-closure plans (G2/G4/G5 per the 13-UAT.md register) proceed independently
- No blockers; every suite green at or above the 13-02 baseline

## Self-Check: PASSED

All 3 modified files exist on disk (src/app.css, src/ingestion/library/LibraryRow.tsx, tests/e2e/chrome/library-tidy.spec.ts); both task commits (7d87c34, 9314152) present in git log.

---
*Phase: 13-polish-and-acceptance*
*Completed: 2026-08-19*
