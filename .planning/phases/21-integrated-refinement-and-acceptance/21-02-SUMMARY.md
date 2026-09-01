---
phase: 21-integrated-refinement-and-acceptance
plan: 02
subsystem: ui
tags: [css-anchor-positioning, popover-api, playwright, e2e, geometry, focus-restore, a11y]

# Dependency graph
requires:
  - phase: 13-polish
    provides: popover="auto" tag surface + toggle-event focus-restore seam (13-10 G5), quiet-chrome trigger anatomy
  - phase: 18-orientation
    provides: engine-honest focus-assertion pattern (D18-04 webkit divergence), geometry-spec harness precedents (toc-geometry)
provides:
  - ".tags-trigger anchor-name + re-anchored .tag-popover block — the codebase's first CSS-anchored element (D21-05)"
  - "Viewport-kept popover via position-try-fallbacks with a border-box-honest width cap — no manual clamp math, no JS listeners"
  - "tests/e2e/chrome/tag-menu-geometry.spec.ts — the 5-cell × 3-engine geometry proof (adjacency, resize-follow, 240px viewport-keep, Esc + light-dismiss focus-restore)"
affects: [21-04 (POLISH-11 audit validates this corrected anchoring), 21-05/21-06 (ACPT-07 spine + ACPT-08 matrix inherit the geometry spec as regression net)]

# Tech tracking
tech-stack:
  added: [] # nothing installed — browser-platform CSS only (probe-verified on the pinned Playwright 1.61.1 engines)
  patterns:
    - "CSS anchor positioning for overlay geometry (D21-05): anchor-name on the trigger + position-anchor/position-area/position-try-fallbacks on the surface; the browser owns geometry — zero JS resize/scroll listeners"
    - "Width caps on padded/bordered overlays must be border-box honest: a content-box width cap governs only the content box, so chrome (2×padding + 2×border) silently widens the rendered box past the cap"

key-files:
  created:
    - tests/e2e/chrome/tag-menu-geometry.spec.ts
  modified:
    - src/app.css
    - tests/e2e/chrome/tag-popover.spec.ts

key-decisions:
  - "D21-05 implemented as pure CSS anchor positioning (probe-verified 2026-08-31 on the pinned engines): position-area block-end span-inline-end + position-try-fallbacks flip-block/flip-inline; old header-fixed insets DELETED (not zeroed — author insets fight position-area per RESEARCH Pitfall 2)"
  - "[Rule 1] .tag-popover gains box-sizing: border-box — the min(420px, 100vw - 2*md) cap governed content-box only, so the rendered box was 100vw+2px at narrow widths (unfittable by ANY fallback); the border-box fix keeps the declaration byte-identical while making the cap govern the outer box"
  - "Desktop popover renders 420px outer (was an accidental 454 = 420 content + 34 chrome) — the cap's evident intent; collateral specs (toc-navigation, search-tag-filter, tag-popover, ArticleView component) all green on the narrower box"
  - "The geometry spec asserts engine-identical geometry truths (adjacency/resize/viewport-keep) with NO engine skips; only focus-restore branches per engine (webkit's documented weaker not-trapped shape — the D18-04 honesty precedent)"

patterns-established:
  - "Geometry-assertion harness: readBoxes via page.evaluate (sub-pixel-precise getBoundingClientRect) + expectAdjacentBelowTrigger/expectOverlapsTriggerColumn helpers that hold at BOTH position-try inline outcomes, so resize-follow stays honest without pinning which fallback won"

requirements-completed: [POLISH-08]

# Metrics
duration: 16min
completed: 2026-09-01
status: complete
---

# Phase 21 Plan 02: Tag-Menu Anchoring Summary

**Trigger-hugging tag popover via CSS anchor positioning (the codebase's first anchored element): adjacent below .tags-trigger at its inline-end area, viewport-kept at 240px through native flip fallbacks with a border-box-honest width cap, resize-following with zero JS listeners — proven in 5 geometry cells × chromium/firefox/webkit**

## Performance

- **Duration:** 16 min
- **Started:** 2026-09-01T13:24:34Z
- **Completed:** 2026-09-01T13:40:34Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- The tag popover now tracks its TRIGGER, not the header's visual corner: `anchor-name: --tags-trigger` on the header button + `position-anchor`/`position-area: block-end span-inline-end`/`position-try-fallbacks: flip-block, flip-inline`/`inset: auto`/`margin: var(--space-xs)` on the popover — ~6 declarations replacing the `top: calc(48px + …)`/`inset-inline-end` fixed block (deleted, not zeroed, per RESEARCH Pitfall 2).
- The popover=auto interaction contract is byte-stable (top layer, light-dismiss, Esc; `role="dialog"` + `aria-label="Article tags"`; zero motion properties): the existing tag-popover.spec.ts close-path/axe contract passes untouched (9/9, 3 engines).
- POLISH-08 proven as geometry in real browsers: adjacency at 1280×800 (top edge at trigger bottom + the 4px calm gap; inline span at the trigger's inline-end area — the old corner pin was ~150px+ away), resize-follow 1280→360 with the popover still open, and full in-viewport containment at 240×600 — all engine-identical, zero fixed sleeps, zero JS listeners.
- Esc and light-dismiss close paths restore focus to the trigger on chromium/firefox; webkit asserts the documented weaker not-trapped shape (D18-04 honesty precedent, verbatim-in-spirit from tag-popover.spec.ts).

## Task Commits

Each task was committed atomically:

1. **Task 1: CSS anchor positioning replaces the header-fixed block** — `f875350` (feat)
2. **Task 2: Cross-engine geometry spec — adjacency, resize-follow, viewport-keep, focus-restore** — `47619d4` (test; includes the Rule 1 border-box fix the viewport-keep cell surfaced)

**Plan metadata:** (see final docs commit)

## Files Created/Modified
- `src/app.css` — `.tags-trigger` gains `anchor-name: --tags-trigger`; `.tag-popover` re-anchored wholesale (anchor declarations + `inset: auto` + `margin: var(--space-xs)` + `box-sizing: border-box`); block comment cites D21-05, the popover=auto retention, the 2026-08-31 probe, and the zero-motion note
- `tests/e2e/chrome/tag-menu-geometry.spec.ts` (NEW) — 5-cell geometry proof on the tag-popover.spec.ts harness (prepareFreshPage, BASE :5173, expect/expect.poll/waitForFunction only)
- `tests/e2e/chrome/tag-popover.spec.ts` — light-dismiss rationale comment realigned to the D21-05 trigger-anchored geometry (comment-only; the dynamic outside-point computation is unchanged)

## Decisions Made
- Anchor mechanism per plan/RESEARCH Pattern 1 exactly; no JSX changes anywhere (the DOM split is a non-issue — anchor-name is document-scoped).
- The adjacency assertion pins BOTH clauses: vertical (top ≥ trigger bottom − 0.5px, gap ≤ 4px + 2.5 sub-pixel) and inline (popover right edge within 4px margin ± tolerance of the trigger's right edge) — the inline clause is the discriminator that fails the old header-corner geometry.
- Resize-follow asserts adjacency + horizontal overlap with the trigger's column (both hold at either inline fallback outcome) rather than pinning which fallback won — engine-honest at 360 where flip-inline engages.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Width cap was content-box — the rendered popover could never fit the viewport at narrow widths**
- **Found during:** Task 2 (first run of the 240×600 viewport-keep cell — engine-identical failure: right edge 246 > 240 on all 3 engines)
- **Issue:** `.tag-popover` sizes content-box (no global border-box reset in this app); `width: min(420px, calc(100vw - 2*md))` capped only the content box, so 2×16px padding + 2×1px border made the OUTER box 100vw+2px — no flip fallback can fit a 242px box in a 240px viewport. (Pre-existing: the old header-fixed popover silently overflowed inline-start the same way; nothing asserted it until this plan's viewport-keep truth.)
- **Fix:** `box-sizing: border-box` on `.tag-popover` — the cap's declaration stays byte-identical while finally governing the outer box. Probe-verified on all 3 engines before committing: 240→[28..236] fits, 1280 keeps inline-end trigger alignment (pop.right = trigger.right − 4).
- **Files modified:** src/app.css
- **Verification:** viewport-keep cell green × 3 engines; the full 24-cell run (both specs) green; collateral specs (toc-navigation 72-cell run incl. search-tag-filter, ArticleView component 13/13) green on the 34px-narrower desktop box
- **Committed in:** 47619d4 (part of the Task 2 commit)

**2. [Rule 3 - Blocking] Syntax error in the resize-follow poll chain**
- **Found during:** Task 2 (first `npx playwright test` invocation)
- **Issue:** Mismatched parens in the `expect.poll(...)` chain (transform error before any test ran).
- **Fix:** Rewrote as `await expect.poll(async () => {...}, { timeout }).toBe(true)`.
- **Files modified:** tests/e2e/chrome/tag-menu-geometry.spec.ts
- **Verification:** Spec parses and runs; resize-follow green × 3 engines
- **Committed in:** 47619d4 (part of the Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both necessary — the border-box fix is the minimum change that makes the plan's own viewport-keep truth physically satisfiable without manual clamp math (the prohibited path). No scope creep: diff is exactly the plan's files_modified set.

## Issues Encountered
- The 240px viewport-keep failure was diagnosed by direct probe (engine geometry dump at 240/320/360/1280) before any fix — the engine-identical signature pointed at a real geometry bug, not environment (the project's cross-engine regression lesson). The research probe's "fits at 240px" evidence held for a corner-aligned trigger; the real app's trigger sits three buttons inward, which is exactly what made the dishonest cap fatal.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- POLISH-08 closed with cross-engine geometry proof; the anchor-positioning pattern (first in the codebase) is established for any future anchored surface.
- Ready for 21-03 (POLISH-10 Highlights cohesion) — independent of this plan's files.
- The honest full-suite gate for the phase (npm run test + lint) remains 21-06's concern; this plan's contribution is green as recorded (24/24 targeted + 72/72 collateral e2e, 13/13 component, 33/33 reduced-motion).

## Self-Check: PASSED

- Key files exist on disk: tests/e2e/chrome/tag-menu-geometry.spec.ts (282 lines ≥ 80 min), src/app.css, tests/e2e/chrome/tag-popover.spec.ts.
- Commits exist in git log: f875350 (feat), 47619d4 (test).
- Plan-level verification re-run: both specs 24/24 green on chromium/firefox/webkit; reduced-motion 33/33; no JSX changes, no listener code, no motion properties (grep-verified).

---
*Phase: 21-integrated-refinement-and-acceptance*
*Completed: 2026-09-01*
