---
phase: 15-application-shell-and-destinations
plan: "02"
subsystem: ui
tags: [react, application-shell, hash-router, a11y, aria-current, playwright, e2e, responsive-collapse]

# Dependency graph
requires:
  - phase: 15-application-shell-and-destinations (Plan 01)
    provides: canonical #/highlights route + legacy #/review alias (D15-06/D15-07), Highlights h1/title surface
  - phase: 14-destination-titles-and-arrival-focus
    provides: view-switcher aria-current link pattern (D14-22), push-vs-replaceState discipline (D14-13/D14-14)
provides:
  - Persistent application shell (D15-01/D15-02): nav.shell-nav[aria-label="Primary"] with exactly two text links on every destination
  - Brand link home (D15-05/D15-10): wordmark is an <a href="#/"> named exactly "Lem Reader"
  - HeaderProps.destination prop ("library" | "highlights" | "reader") derived in App, driving aria-current (D15-09)
  - ModeToggle joins the articleMounted gate (D15-15) — Reader header [tags][annotations][mode][gear], elsewhere gear only
  - ≤639px wordmark clip-collapse + narrow tuning (D15-17) inside the byte-stable 48px row
  - In-page D10-02 Highlights button removed (OQ1) — shell link is the sole library→highlights entry
  - shell-nav.spec.ts six-group e2e proving NAV-01/NAV-02/NAV-05 + 320×640 geometry + collapse reachability
affects: [15-03 restore, 15-04 phase gate (3-engine matrix), NAV-01/NAV-02/NAV-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shell destination nav = plain <a href> links with NO onClick interception — activation pushes a history entry (desired Back semantics); modified clicks fall through natively"
    - "aria-current via ternary-to-undefined on shell links; absence proven with getAttribute() === null (attribute-absence, not value-inequality)"
    - "Count-zero gating assertions h1-gated first + contrast leg on the reader (route-entry (e) discipline extended to the mode toggle)"
    - "Engine-honest Tab-walk: DOM-order walk on chromium/firefox, programmatic focus + Enter activation on webkit (back-nav (d) 09-06 precedent)"

key-files:
  created:
    - tests/e2e/chrome/shell-nav.spec.ts
  modified:
    - src/reader/Header.tsx
    - src/App.tsx
    - src/app.css
    - src/ingestion/library/LibraryView.tsx
    - tests/e2e/review-panel/route-entry.spec.ts
    - tests/e2e/chrome/back-nav.spec.ts
    - tests/e2e/library/reading-views.spec.ts
    - tests/e2e/chrome/library-tidy.spec.ts

key-decisions:
  - "Destination links are plain href pushes with no interception — destination navigation MUST push history (D14-14 Back semantics), the inverse of the view-switcher's replaceState interception"
  - "webkit collapse-reachability degrades to focusability + Enter activation (back-nav (d) 09-06 engine-divergence precedent); chromium/firefox carry the DOM-order Tab walk"
  - "Tab-walk target matched by href #/ + rendered text 'Lem Reader' (the accessible name IS the text, D15-10) — role/name discipline preserved without class hooks"
  - "Library-tidy header predicate flipped to h1-ONLY (asserts the button's absence) — strengthen-only rewrite of the POLISH-06 anatomy pin"
  - "route-entry (d) rewritten alongside (a) — it also drove the removed button; same atomic commit as the removal (Pitfall 6)"
  - "NAV-01/NAV-02/NAV-05 marked complete here: Task 3's done-criteria prove them in a real browser; 15-04 re-runs the 3-engine matrix as the phase gate"

patterns-established:
  - "Shell-nav link anatomy: mirrors .view-switcher a verbatim (44px touch, global focus ring, global link color) with aria-current styled by weight + decoration-thickness only — never color alone (forced-colors safe)"
  - "Persistent-shell e2e discipline: loop the three destination URLs inside one test for presence/count assertions; h1-gate before count-zero gating assertions"

requirements-completed: [NAV-01, NAV-02, NAV-05]

# Metrics
duration: 50min (two executor sessions — interrupted at a clean boundary after Task 2; Task 3 resumed ~22min)
completed: 2026-08-26
status: complete
---

# Phase 15 Plan 02: Application Shell — Destination Nav, Brand Link, Gating Summary

**Persistent two-destination shell nav + brand-home link + reader-gated controls in the unchanged 48px header, with ≤639px clip-collapse, the D10-02 in-page Highlights button removed, and NAV-01/02/05 proven by a six-group e2e spec including 320×640 geometry and collapsed-wordmark keyboard reachability.**

## Performance

- **Duration:** ~50 min wall clock across two executor sessions (Tasks 1–2 committed 09:11–09:20; interrupted at a clean task boundary; Task 3 + close-out resumed 10:35–10:57) 
- **Started:** 2026-08-26T14:11:25Z (Task 1 commit f0a3eb6)
- **Completed:** 2026-08-26T15:57:12Z (Task 3 commit 4b858c1)
- **Tasks:** 3 (Task 1 sentinel scaffold; Tasks 2–3 TDD-style behavior blocks, single atomic commits each per plan)
- **Files modified:** 10 (1 created spec + 9 modified)

## Accomplishments

- **Shell chrome (Task 2, D15-01/02/05/08/09/10/15/16/17/18):** `.header-start` group (brand `<a href="#/">Lem Reader</a>` + `nav.shell-nav[aria-label="Primary"]` with exactly two text links Library `#/` and Highlights `#/highlights`) rendered identically on Library, Highlights, and Reader; `aria-current="page"` follows the App-derived `destination` prop and NEVER appears on the brand; ModeToggle wrapped in the `articleMounted` gate so the Reader header reads [tags][annotations][mode][gear] while Library/Highlights read shell nav + gear only; ≤639px media query clip-hides the wordmark via the shipped `.visually-hidden` helper with narrow padding/gap tuning (touch targets stay 44px, the 48px min-height byte-unchanged, zero new transition/animation properties).
- **Sole Highlights entry (Task 3, OQ1/UI-SPEC auto-resolution #5):** the in-page D10-02 button removed from LibraryView — the library header returns to the calm h1 row POLISH-06 established; the shell link is the only library→highlights entry, and every spec that drove/pinned the button was rewritten in the same commit.
- **Six real e2e groups (Task 3):** (1) persistent nav + exactly-2-links on all three destinations; (2) aria-current discipline across `#/`, `#/unread`, `#/highlights`, reader (neither), and never-brand; (3) brand home from the reader with exact accessible name "Lem Reader"; (4) mode-toggle count-zero on Library/Highlights + contrast leg in Reader + gear everywhere; (5) 320×640 no-wrap/no-overflow header geometry; (6) collapsed-wordmark Tab-walk reachability.

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave 0 — shell-nav.spec.ts sentinel scaffold** — `f0a3eb6` (test)
2. **Task 2: Shell chrome — brand link, destination nav, gating, collapse + narrow tuning** — `ea0f0c1` (feat)
3. **Task 3: D10-02 button removal + shell-nav e2e** — `4b858c1` (feat)

**Plan metadata:** committed after this SUMMARY (docs)

## Files Created/Modified

- `tests/e2e/chrome/shell-nav.spec.ts` — created (sentinel, Task 1) then extended (six real groups, Task 3); harness: BASE/wipeDatabase/FIXTURES from annotations/_fixtures
- `src/reader/Header.tsx` — destination prop, .header-start group, brand link, shell-nav with aria-current ternaries, ModeToggle behind articleMounted; stale file-header comment rewritten with D15-05 citation
- `src/App.tsx` — destination derivation from view (list→library, review→highlights, article→reader) passed to Header
- `src/app.css` — .shell-nav/.header-start rules mirroring .view-switcher anatomy, aria-current weight+thickness-only styling, .app-wordmark color removal (global link rule), ≤639px visually-hidden wordmark + narrow tuning
- `src/ingestion/library/LibraryView.tsx` — D10-02 button + its comment block removed; h1-only header
- `tests/e2e/review-panel/route-entry.spec.ts` — (a) and (d) drive the shell link; header comments updated
- `tests/e2e/chrome/back-nav.spec.ts` — (c) in-app flow drives the shell link; comment updated
- `tests/e2e/library/reading-views.spec.ts` — review-destination warm-arrival test drives the shell link (Rule 3)
- `tests/e2e/chrome/library-tidy.spec.ts` — header predicate flipped to h1-only absence check (Rule 3)

## Decisions Made

- **No onClick interception on shell links** (planned, D14-14): destination activation pushes a history entry — the desired Back semantics — and modified clicks fall through natively; this is deliberately the inverse of the view-switcher's preventDefault+replaceState interception, and back-nav (c) re-proves the push semantics through the new link.
- **webkit degradation for collapse reachability:** webkit's sequential navigation skips links (09-06 stacked-modal + back-nav (d) precedent), so test (6) walks Tab order on chromium/firefox and asserts programmatic focusability + Enter activation on webkit — the Pitfall 9 claim (clip, never display:none) is carried by both legs.
- **Attribute-absence assertions:** `toHaveAttribute("aria-current", "page")` for presence but `getAttribute("aria-current") === null` for absence — value-inequality would silently pass on `aria-current="true"`.
- **h1-gated count-zero:** mode-toggle zero-counts assert only after the destination h1 renders, so a pre-mount DOM can never produce a false pass (extends the route-entry (e) discipline).
- **NAV-01/NAV-02/NAV-05 closed here** per the plan's Task 3 done-criteria ("proven in a real browser"); 15-04's matrix task re-runs the 3-engine proof as the phase gate. 15-01's "NAV-01 stays unchecked until the shell lands" condition is now satisfied.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] reading-views.spec.ts pinned the removed button**
- **Found during:** Task 3 (button removal)
- **Issue:** `tests/e2e/library/reading-views.spec.ts:1050` (NAV-04 review-destination warm-arrival test) clicks `getByRole("button", { name: "Highlights" })` — it would fail after the removal; the plan's files_modified list did not include it
- **Fix:** Rewritten to drive the shell link scoped inside the Primary nav (identical warm-mount push semantics); test name + comment updated
- **Files modified:** tests/e2e/library/reading-views.spec.ts
- **Verification:** chromium run green (test 35 of the 41-cell chain)
- **Committed in:** 4b858c1 (Task 3 commit)

**2. [Rule 3 - Blocking] library-tidy.spec.ts asserted the button's presence**
- **Found during:** Task 3 (button removal)
- **Issue:** the POLISH-06 tidy predicate `headerHoldsH1AndReviewButton` requires `.library-header .article-export-highlights` in the DOM — the removal breaks it
- **Fix:** Predicate renamed `headerHoldsH1Only` and strengthened to assert the button's ABSENCE (`.library-header .article-export-highlights === null`) — the new anatomy pin for the calm h1 row
- **Files modified:** tests/e2e/chrome/library-tidy.spec.ts
- **Verification:** chromium run green (library-tidy 3/3)
- **Committed in:** 4b858c1 (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both were direct consequences of the planned button removal landing atomically with its spec updates (Pitfall 6 discipline). No scope creep — no production behavior changed beyond the plan.

## Verification Results

- `npx playwright test tests/e2e/chrome/shell-nav.spec.ts tests/e2e/review-panel/route-entry.spec.ts tests/e2e/chrome/back-nav.spec.ts tests/e2e/library/reading-views.spec.ts tests/e2e/chrome/library-tidy.spec.ts --project=chromium` → **41/41 passed** (10.8s; includes the plan's three-spec verify chain plus the two Rule 3 specs)
- `! rg -q "article-export-highlights" src/ingestion/library/LibraryView.tsx` → PASS (0 hits; the class legitimately remains in AnnotationsDrawer/IngestControl/ReviewView-adjacent export surfaces — hence the file scope)
- `npx eslint` on all six Task-3-changed files → clean
- Task 2's verify (prior session, commit ea0f0c1): `npm run lint` + mobile-first-page-chrome + reflow on chromium → green (existing 320px nets held)
- shell-nav.spec.ts contains all six test groups as plain test() blocks inheriting the 3-engine matrix; the 3-engine run lands at Plan 15-04's matrix task per the plan's `<verification>`

## Issues Encountered

None beyond the two Rule 3 deviations above. (Process note: the plan was interrupted after Task 2 at a clean task boundary; the resume verified f0a3eb6/ea0f0c1 in git log with a clean tree before starting Task 3.)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Shell chrome + shell-nav e2e complete; Plan 15-03 (librarySession restore, NAV-03) can proceed — its restore work composes with the shell's destination derivation already in App.tsx.
- Plan 15-04 (phase gate) re-runs shell-nav + route-entry + back-nav across chromium/firefox/webkit; the webkit leg of test (6) exercises the documented focus+Enter degradation.
- 3-engine exposure risk (low, pre-mitigated): Tab-walk engine divergence handled via the 09-06 precedent; geometry evaluate is engine-neutral.

## Self-Check: PASSED

- Commit `f0a3eb6` (Task 1, test) found in git log ✓
- Commit `ea0f0c1` (Task 2, feat, 3 files) found in git log ✓
- Commit `4b858c1` (Task 3, feat, 6 files) found in git log ✓
- tests/e2e/chrome/shell-nav.spec.ts exists with the sentinel + six numbered groups ✓
- No file deletions in any task commit; no untracked files left ✓
- STATE/ROADMAP/REQUIREMENTS updates follow this file's commit

---
*Phase: 15-application-shell-and-destinations*
*Completed: 2026-08-26*
