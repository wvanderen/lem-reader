---
phase: 06-prototype-acceptance
plan: 01
subsystem: testing
tags: [playwright, e2e, accessibility, acpt-03, edge-conditions, font-failure, high-zoom, wcag-reflow]

# Dependency graph
requires:
  - phase: 04-responsive-pagination-and-dual-mode-navigation
    provides: the [data-block-index] 1:1 block↔element mapping, the M shortcut mode toggle (D4-06), the always-mounted hidden .article-body-measurement (Plan 04-08)
  - phase: 03-trustworthy-layout-measurement
    provides: the document.fonts.ready gate (D3-06), the __lemLastTrustedConstraints DEV hook, last-valid-view (PAGE-06) + stale-epoch drop (PAGE-07)
  - phase: 05-durable-highlights-and-notes
    provides: the annotations/_fixtures.ts shared harness (openArticle/switchMode/modeToggle/wipeDatabase/FIXTURES)
provides:
  - "Shared D6-09 edge-condition invariant helper (tests/e2e/_edge-invariant.ts → assertEdgeInvariant) encoding all three clauses: (a) keyboard-reachable content in both reading modes, (b) required-function controls present, (c) body + article-body scrollWidth ≤ clientWidth + 1"
  - "ACPT-03 high-zoom gap spec (tests/e2e/high-zoom.spec.ts) — 400% + 320 CSS px reflow across 6 fixtures × 3 engines"
  - "ACPT-03 font-failure gap spec (tests/e2e/font-failure.spec.ts) — block/delay/swap via injected @font-face + page.route across 3 engines"
affects: [06-prototype-acceptance, 06-05 (audits the 4 existing edge specs against assertEdgeInvariant), 06-06 (phase verification)]

# Tech tracking
tech-stack:
  added: []  # No new packages — reuses the locked @playwright/test 1.61.1
  patterns:
    - "Shared edge-condition invariant helper (D6-09) — one assertEdgeInvariant(page, {fixture, condition}) applied uniformly by every ACPT-03 edge spec (NEW + audited)"
    - "Font-failure non-vacuous injection — route registered BEFORE addStyleTag so it intercepts the request the @font-face injection triggers (the app loads zero web fonts; routing the unmodified app is a vacuous-pass trap)"
    - "High-zoom load-bearing reflow — page.setViewportSize({width:320}) is the cross-engine WCAG 1.4.10 mechanism; document.body.style.zoom is secondary/engine-variable (chromium yes, firefox 126+, webkit partial)"

key-files:
  created:
    - "tests/e2e/_edge-invariant.ts — shared D6-09 invariant helper (assertEdgeInvariant) + re-exported harness"
    - "tests/e2e/high-zoom.spec.ts — ACPT-03 high-zoom gap spec (400% + 320px, 6 fixtures × 3 engines)"
    - "tests/e2e/font-failure.spec.ts — ACPT-03 font-failure gap spec (block/delay/swap, 3 engines)"
  modified: []

key-decisions:
  - "assertEdgeInvariant asserts on VISIBLE blocks only — the [data-block-index]:not(.article-body-measurement ...) selector (mirrors visibleBlock in _fixtures.ts). The raw [data-block-index] count would include the always-mounted aria-hidden measurement clone (Plan 04-08) which is user-select:none + pointer-events:none and therefore NOT keyboard-reachable."
  - "High-zoom runs assertEdgeInvariant at the 320px setViewportSize layout FIRST, then applies document.body.style.zoom='4' as a SECONDARY no-content-lost check. This keeps the (c) overflow assertion on the load-bearing cross-engine layout; the zoom (engine-variable per Pitfall 3) only proves content survives."
  - "Font-failure: route registered BEFORE addStyleTag (RESEARCH-proven non-vacuous pattern — the route must be active when the @font-face injection triggers the request). page.on('request') verifies the font URL was actually requested, failing the test if the injection was vacuous (Pitfall 1 guard)."
  - "Font-failure SWAP reuses stale-drop.spec.ts's rapid-trigger race shape (3 viewport + 3 typography changes) with the injected font active throughout — proves the PAGE-07 stale-epoch guard holds under font-failure conditions."
  - "ACPT-03 is NOT marked complete in REQUIREMENTS.md by this plan — it spans Plan 06-01 (NEW gap specs, this plan) AND Plan 06-05 (audit of the 4 existing edge specs). requirements-completed is [] mirroring the 04-02 PAGE-01 split precedent (PAGE-01 stayed unchecked until Plan 04-04). Plan 06-05 closes ACPT-03."

patterns-established:
  - "Pattern: every ACPT-03 edge spec (NEW + audited in 06-05) imports assertEdgeInvariant from _edge-invariant.ts and applies it uniformly — one D6-09 bar everywhere"
  - "Pattern: font-route interception in tests requires injecting a @font-face first (page.addStyleTag) — the app ships zero web fonts, so bare page.route on a woff2 glob is always vacuous"

requirements-completed: []  # ACPT-03 spans 06-01 + 06-05; completes in Plan 06-05 (mirrors 04-02 PAGE-01 split precedent)

# Metrics
duration: 13 min
completed: 2026-08-08
status: complete
---

# Phase 6 Plan 01: ACPT-03 Edge Gap Specs Summary

**Shared D6-09 edge-invariant helper plus the two genuine ACPT-03 gap specs (high-zoom at 400% + 320 CSS px reflow; font-failure block/delay/swap via injected @font-face + page.route) — 30/30 green across chromium, firefox, and webkit.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-08-08T14:36:16Z
- **Completed:** 2026-08-08T14:49:10Z
- **Tasks:** 3
- **Files modified:** 3 (all new test-tier files; zero production code changed)

## Accomplishments
- Shipped the reusable D6-09 edge-condition invariant (`assertEdgeInvariant`) that every ACPT-03 edge spec — the two NEW gap specs here + the four audited existing specs in Plan 06-05 — applies uniformly. Encodes all three clauses: (a) keyboard-reachable content in BOTH reading modes, (b) required-function controls present, (c) body + article-body no horizontal overflow (WCAG 1.4.10).
- Closed the genuine ACPT-03 **high-zoom** gap (no existing spec exercised 400% zoom + 320 CSS px reflow). `page.setViewportSize({width:320,height:800})` is the load-bearing cross-engine reflow assertion; `document.body.style.zoom="4"` is a secondary engine-aware no-content-lost check. Iterates all 6 fixtures.
- Closed the genuine ACPT-03 **font-failure** gap (no existing spec exercised the real font-load pipeline end-to-end). Injects a `@font-face` via `page.addStyleTag` then `page.route`-intercepts the injected URL in three modes (block/delay/swap) on essay-long-form, proving the D3-06 font gate, PAGE-06 last-valid-view, and PAGE-07 stale-epoch drop hold against a genuinely pending web font.
- Verified non-vacuity throughout: `page.on('request')` proves the injected font is actually requested; `_edge-invariant.ts` is NOT enumerated as a Playwright spec (leading-underscore + no `.spec`/`.test` suffix).

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared edge-condition invariant helper** — `e00d2e2` (test)
2. **Task 2: High-zoom gap spec (400% + 320 CSS px reflow)** — `7ac0b12` (test)
3. **Task 3: Font-failure gap spec (block/delay/swap)** — `0754489` (test)

## Files Created/Modified
- `tests/e2e/_edge-invariant.ts` — Non-spec helper module exporting `assertEdgeInvariant(page, {fixture, condition})` (all three D6-09 clauses) + re-exported harness (`FIXTURES`, `openArticle`, `switchMode`, `modeToggle`, `drawerTrigger`, `wipeDatabase`, etc.) so every edge spec imports from one place.
- `tests/e2e/high-zoom.spec.ts` — ACPT-03 high-zoom gap spec. Iterates all 6 FIXTURES at `setViewportSize({width:320,height:800})`, calls `assertEdgeInvariant`, then applies `document.body.style.zoom="4"` asserting only no-content-lost. Plus a focused 320px no-horizontal-overflow test (WCAG 1.4.10 direct proof).
- `tests/e2e/font-failure.spec.ts` — ACPT-03 font-failure gap spec. Three modes (BLOCK=`route.abort`, DELAY=`route.continue` after 1500ms, SWAP=font active + rapid-trigger race mirroring stale-drop.spec.ts) via injected `@font-face` + `page.route`. Each mode asserts V7 (pageerror guard) + `assertEdgeInvariant`.

## Decisions Made
- **assertEdgeInvariant targets visible blocks only.** The selector `[data-block-index]:not(.article-body-measurement [data-block-index])` (mirrors `visibleBlock` in `_fixtures.ts`). The raw `[data-block-index]` count would include the always-mounted aria-hidden measurement clone (Plan 04-08), which is `user-select:none` + `pointer-events:none` and therefore NOT keyboard-reachable — asserting on it would be vacuous for the (a) clause.
- **High-zoom: setViewportSize load-bearing, zoom secondary.** `assertEdgeInvariant` runs at the 320px `setViewportSize` layout FIRST (the cross-engine WCAG 1.4.10 mechanism), THEN `document.body.style.zoom="4"` is applied as a secondary no-content-lost check. This keeps the (c) overflow assertion on the load-bearing layout; the engine-variable zoom (Pitfall 3) only proves content survives.
- **Font-failure: route before addStyleTag (non-vacuous).** The route is registered BEFORE `addStyleTag` so it is active when the injected `@font-face` triggers the font request (the app loads zero web fonts — bare `page.route('**/*.woff2')` intercepts nothing = Pitfall 1). `page.on('request')` verifies the font URL was actually requested, failing the test if the injection was vacuous.
- **Font-failure SWAP reuses the stale-drop rapid-trigger race.** The "swap" surface is the injected font being part of the active set while rapid viewport + typography changes fire multiple measurement epochs; the PAGE-07 stale-epoch guard must drop every older-epoch result, leaving only the FINAL constraints committed (asserted via `__lemLastTrustedConstraints`).
- **ACPT-03 NOT marked complete by this plan.** ACPT-03 spans Plan 06-01 (NEW gap specs, this plan) AND Plan 06-05 (audit of the 4 existing edge specs against the invariant). `requirements-completed: []` mirrors the 04-02 PAGE-01 split precedent; Plan 06-05 closes ACPT-03.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `!important` to the injected `@font-face` font-family rule**
- **Found during:** Task 3 (font-failure.spec.ts)
- **Issue:** The plan's prescribed `addStyleTag` content applied `font-family: "TestInjectedFont", var(--font-body)` to `.article-body`/`.page-fragment` WITHOUT `!important`. While an explicit `.article-body` rule beats the inherited body font-family (the app's `.article-body` rule at app.css L216 sets only max-width/margin), the non-vacuity guarantee depends on cascade ordering that a future CSS change could break — risking a silent vacuous pass (Pitfall 1).
- **Fix:** Added `!important` to the injected rule: `.article-body, .page-fragment { font-family: "TestInjectedFont", var(--font-body) !important; }`. This GUARANTEES the browser requests the injected font regardless of the app's CSS cascade, hardening the Pitfall 1 defense. The `page.on('request')` non-vacuity guard confirms the request fires.
- **Files modified:** tests/e2e/font-failure.spec.ts (FONT_FACE_CSS constant)
- **Verification:** All 9 font-failure tests pass across chromium/firefox/webkit; the `fontRequested` assertion (Pitfall 1 guard) passes in every mode, proving the font is genuinely requested.
- **Committed in:** 0754489 (Task 3 commit)

**2. [Rule 1 - Bug] Removed unused `BASE` import in high-zoom.spec.ts**
- **Found during:** Task 2 (high-zoom.spec.ts) — first tsc run
- **Issue:** `BASE` was imported but unused (tsc `noUnusedLocals` flagged TS6133); `openArticle` from `_fixtures.ts` carries `BASE` internally.
- **Fix:** Dropped `BASE` from the import list.
- **Files modified:** tests/e2e/high-zoom.spec.ts (import statement)
- **Verification:** `npx tsc --noEmit` exits 0.
- **Committed in:** 7ac0b12 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 missing-critical correctness hardening, 1 unused-import cleanup)
**Impact on plan:** Both auto-fixes necessary for correctness/clean-build. No scope creep — `!important` is test-tier CSS that hardens the non-vacuity contract the plan itself mandates (Pitfall 1).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. No new packages installed (reuses the locked `@playwright/test` 1.61.1).

## Next Phase Readiness
- The ACPT-03 foundation slice is complete: the shared invariant helper + the two NEW gap specs are green across all 3 engines (30/30: 21 high-zoom + 9 font-failure).
- **Plan 06-05 (Wave 2)** audits the four existing edge specs (`forced-colors`, `reduced-motion`, `reflow`, `touch-targets`) against `assertEdgeInvariant` and closes ACPT-03 fully.
- The full `npm run test` suite green-at-wave-merge is verified by Plan 06-06; this plan's new specs are isolated (no production code changed, no existing spec modified) so no regression surface was introduced.
- No blockers.

## Self-Check: PASSED

- [x] `tests/e2e/_edge-invariant.ts` exists (FOUND)
- [x] `tests/e2e/high-zoom.spec.ts` exists (FOUND)
- [x] `tests/e2e/font-failure.spec.ts` exists (FOUND)
- [x] Task 1 commit `e00d2e2` exists in git log (FOUND)
- [x] Task 2 commit `7ac0b12` exists in git log (FOUND)
- [x] Task 3 commit `0754489` exists in git log (FOUND)
- [x] `npx tsc --noEmit` exits 0 (PASS)
- [x] `npm run test:e2e -- --grep "high-zoom"` exits 0 chromium/firefox/webkit (PASS — 21/21)
- [x] `npm run test:e2e -- --grep "font-failure"` exits 0 chromium/firefox/webkit (PASS — 9/9)
- [x] `_edge-invariant.ts` NOT enumerated as a spec by `npx playwright test --list` (PASS — 0 matches)

---
*Phase: 06-prototype-acceptance*
*Completed: 2026-08-08*
