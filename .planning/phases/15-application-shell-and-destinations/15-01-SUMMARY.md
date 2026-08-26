---
phase: 15-application-shell-and-destinations
plan: "01"
subsystem: ui
tags: [hash-router, react, playwright, vitest, rename, alias-redirect]

# Dependency graph
requires:
  - phase: 14-destination-titles-and-arrival-focus
    provides: setDocumentTitle helper (D14-02), replaceState view-switch discipline (D14-13/D14-14), All fallback (D14-16)
provides:
  - Canonical #/highlights route for the Highlights destination (D15-06)
  - Legacy #/review → #/highlights replaceState alias normalization (D15-07)
  - View review variant with legacyAlias?: true marker (internal name stays "review" — OQ3)
  - Renamed destination surface (h1/title "Highlights")
affects: [15-02 shell nav, 15-03 restore, 15-04 phase gate, NAV-01]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Legacy-route alias via parseHash marker + history.replaceState in the SAME handler shape as switchLibraryView (replaceState fires no hashchange — the direct setView is load-bearing)"
    - "Atomic rename discipline (Pitfall 6): grammar + copy + every pinned assertion in ONE commit, gated by rg over the retired vocabulary"

key-files:
  created: []
  modified:
    - src/App.tsx
    - src/routes/review/ReviewView.tsx
    - src/ingestion/library/LibraryView.tsx
    - src/app.css
    - tests/component/App.test.tsx
    - tests/e2e/a11y.spec.ts
    - tests/e2e/chrome/back-nav.spec.ts
    - tests/e2e/forced-colors.spec.ts
    - tests/e2e/library/reading-views.spec.ts
    - tests/e2e/panel-keyboard.spec.ts
    - tests/e2e/reduced-motion.spec.ts
    - tests/e2e/review-panel/curate.spec.ts
    - tests/e2e/review-panel/empty-states.spec.ts
    - tests/e2e/review-panel/jump-bidirectional.spec.ts
    - tests/e2e/review-panel/listing.spec.ts
    - tests/e2e/review-panel/route-entry.spec.ts
    - tests/e2e/review-panel/tri-state.spec.ts

key-decisions:
  - "Internal View name stays \"review\" while user-facing vocabulary renames to Highlights (OQ3 resolution — avoids touching every view.name site)"
  - "Alias normalization mirrors switchLibraryView exactly: history.replaceState(null, \"\", \"/highlights\" constant) + direct setView(parseHash()); never pushState (D14-14 Back-count), never location.hash assignment (double hashchange)"
  - "Cold-load normalization runs once in the mount effect that registers onHash (useState initializer view state already correct; only the URL needs rewriting)"
  - "Superseded plain #/review unit case folded into the strengthened legacyAlias case (strictly-more assertion — strengthen-only holds)"
  - "NAV-01 stays unchecked until the shell lands (15-02) — mirrors the 04-02/06-01/10-01 split precedent"

patterns-established:
  - "Route-rename alias pattern: canonical literal arm first, legacy literal arm returns a discriminating marker, handler normalizes URL via replaceState and re-parses for state"
  - "Retired-vocabulary rg gate as a commit-boundary invariant for atomic renames"

requirements-completed: []  # NAV-01 deferred to the shell + phase-gate plans (split precedent)

# Metrics
duration: 11 min
completed: 2026-08-26
status: complete
---

# Phase 15 Plan 01: Highlights Destination Rename Summary

**Canonical `#/highlights` route with h1/title "Highlights" and a legacy `#/review` replaceState alias, landed as one atomic 17-file grammar+copy+spec rename commit with zero retired-vocabulary pins.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-08-26T02:12:37Z
- **Completed:** 2026-08-26T02:23:51Z
- **Tasks:** 2 (TDD: RED then atomic GREEN)
- **Files modified:** 17

## Accomplishments

- `parseHash` grammar extended (D15-06/D15-07): `#/highlights` → `{ name: "review" }` (canonical, ordered BEFORE the alias arm); `#/review` → `{ name: "review", legacyAlias: true }`; unknown `#/` segments (including `#/review/x` and `#/highlights/x`) still fall back to the All list (D14-16 intact).
- Alias normalization in `onHash` + at cold-load: `history.replaceState(null, "", "#/highlights")` (constant href, same-origin by construction — T-14-04) paired with the load-bearing direct `setView(parseHash())` — exactly the `switchLibraryView` shape. No pushState anywhere in the diff; no `location.hash` assignment for normalization.
- Destination surface renamed: ReviewView h1 `Highlights` (tabIndex={-1} + ref byte-stable), `setDocumentTitle("Highlights")` → title "Highlights — Lem Reader" (suffix/separator/truncation stay ONLY in pageMeta — D14-02); LibraryView D10-02 button renamed `Highlights` targeting `#/highlights` (interim until 15-02's shell link replaces it); app.css prose comments updated (no rule changes; `.article-export-highlights` class stays — shared token set).
- All 13 pinned spec files updated in the SAME commit as the grammar/copy change (Pitfall 6) + NEW alias-compat e2e `route-entry.spec.ts (f)`: legacy `#/review` deep link lands on the Highlights h1 with URL normalized to `#/highlights`, and a single browser Back crosses to the library (proves replaceState added no history entry — D14-14 semantics hold end-to-end).

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — parseHash unit cases for Highlights grammar + legacy alias** — `72adcfa` (test)
2. **Task 2: GREEN — the atomic rename commit (grammar + alias + copy + all pinned specs)** — `06913e6` (feat)

**Plan metadata:** committed after this SUMMARY (docs)

## Files Created/Modified

- `src/App.tsx` — #/highlights grammar arm, legacyAlias marker + replaceState normalization (onHash + cold-load), comments
- `src/routes/review/ReviewView.tsx` — h1 "Highlights", setDocumentTitle("Highlights"), header comments
- `src/ingestion/library/LibraryView.tsx` — D10-02 button label "Highlights" + canonical href (interim)
- `src/app.css` — prose comments only (~L2706, ~L2717, ~L3165)
- `tests/component/App.test.tsx` — 3 new parseHash cases; superseded plain #/review case folded into the alias case
- `tests/e2e/review-panel/route-entry.spec.ts` — (a)–(e) renamed to canonical vocabulary + NEW (f) alias-compat case
- 11 further e2e specs (a11y, chrome/back-nav, forced-colors, library/reading-views, panel-keyboard, reduced-motion, review-panel/{curate,empty-states,jump-bidirectional,listing,tri-state}) — heading assertions → "Highlights", URL regexes/gotos → `#/highlights`, comments updated

## Decisions Made

- **OQ3 resolution implemented as planned:** internal `View` name stays `"review"`; only user-facing vocabulary (route, h1, title, button) renamed. Comment cites D15-06 at the union.
- **Alias implementation shape:** the `onHash` handler parses once, normalizes via `replaceState` when the marker is present, then always `setView(parseHash())` (re-parse after any rewrite) — byte-mirrors `switchLibraryView`'s two-line shape rather than branching setView calls.
- **Cold-load normalization** placed inside the existing hashchange mount effect (runs once at mount when `window.location.hash === "#/review"`); view state from the `useState` initializer is already correct.
- **back-nav.spec.ts (c) deep-link case switched canonical** (`#/highlights`): its intent is the fresh-context BackToLibrary fallback, not alias exercise — the dedicated alias case in route-entry.spec.ts (f) owns alias coverage (with the normalized-URL + single-entry-Back assertions the plan requires).
- **NAV-01 NOT marked complete** — this plan is the destination-grammar foundation; the requirement's "consistent application shell" lands in Plan 15-02 and the phase gate runs in 15-04. Mirrors the 04-02 PAGE-01 / 06-01 ACPT-03 / 10-01 RECV-01 split precedent.

## Task 2 Audit Trail (required by plan: the 17-file atomic commit)

### (a) Pre-pass hit list — `rg -l "Review highlights|#/review" src tests` (17 files, matching files_modified exactly)

| # | File | Pre-pass hits |
|---|------|---------------|
| 1 | src/App.tsx | header comment, grammar comment, `#/review` arm |
| 2 | src/routes/review/ReviewView.tsx | header comments, setDocumentTitle("Review highlights"), h1 text |
| 3 | src/ingestion/library/LibraryView.tsx | D10-02 button label + `#/review` href |
| 4 | src/app.css | comments ~L2706, ~L2717, ~L3165 |
| 5 | tests/component/App.test.tsx | `#/review` + `#/review/x` cases, comments |
| 6 | tests/e2e/a11y.spec.ts | axe-gate comment, test name, goto, h1 assertion |
| 7 | tests/e2e/chrome/back-nav.spec.ts | (c) in-app button + heading, (c) deep-link goto, comments |
| 8 | tests/e2e/forced-colors.spec.ts | comment, goto, h1 assertion, expect message |
| 9 | tests/e2e/library/reading-views.spec.ts | review-destination test (button, h1, title) |
| 10 | tests/e2e/panel-keyboard.spec.ts | comments, goto, 2× h1 assertions |
| 11 | tests/e2e/reduced-motion.spec.ts | comments, goto, h1 assertion, expect message |
| 12 | tests/e2e/review-panel/curate.spec.ts | seedAndOpenReview comment/goto/h1 + 3 reload h1 assertions |
| 13 | tests/e2e/review-panel/empty-states.spec.ts | seedAndOpenReview comment/goto/h1 |
| 14 | tests/e2e/review-panel/jump-bidirectional.spec.ts | comments, test names, gotos, 4× h1, 2× URL regexes |
| 15 | tests/e2e/review-panel/listing.spec.ts | comments, seedCorpusAndOpenReview goto/h1 |
| 16 | tests/e2e/review-panel/route-entry.spec.ts | header comments, (a)–(e) tests |
| 17 | tests/e2e/review-panel/tri-state.spec.ts | seedAndOpenReview comment/goto/h1 |

All 17 updated in commit `06913e6`.

### (b) Post-pass residual disposition — every surviving `#/review` occurrence

`rg -n "#/review" src tests` post-pass returns hits in exactly 3 files, all sanctioned:

| Zone | File(s) | Lines | Disposition |
|------|---------|-------|-------------|
| parseHash alias arm | src/App.tsx | L79 (`if (window.location.hash === "#/review")`), L261 (cold-load literal check) + surrounding comments (L6, L53, L60, L241, L259) | The D15-07 alias implementation itself — the literal MUST exist to recognize legacy URLs |
| Alias unit cases | tests/component/App.test.tsx | L120-121 (`#/review/x` fallback — byte-stable per plan Task 1 behavior bullet 4), L140-141 (`#/review` → legacyAlias) + comments (L76, L128, L132) | The alias grammar pins — including the D14-16 fallback discipline for the legacy literal |
| Alias-compat e2e | tests/e2e/review-panel/route-entry.spec.ts | L143 (the deliberate alias-exercise goto), L134 (test name) + comments (L11, L26, L126, L132) | The NEW (f) case proving D15-07 end-to-end |

Plus two prose pointers in src naming the legacy URL as historical context (ReviewView.tsx L5, L247) — they document where the alias is handled, part of the alias surface's documentation.

Retired-vocabulary gate: `rg -q "Review highlights" src tests` → **0 hits** (zero files pin the retired two-word vocabulary).

## Verification Results

- `npx vitest --run tests/component/App.test.tsx` → 17/17 passed (RED cases now green)
- `npx playwright test tests/e2e/review-panel/ tests/e2e/library/reading-views.spec.ts tests/e2e/a11y.spec.ts tests/e2e/reduced-motion.spec.ts tests/e2e/forced-colors.spec.ts tests/e2e/panel-keyboard.spec.ts tests/e2e/chrome/back-nav.spec.ts --project=chromium` → **93/93 passed** (33.0s)
- `! rg -q "Review highlights" src tests` → PASS (zero files)
- `rg -n "#/review" src tests` → only the sanctioned alias zones above
- `npx tsc --noEmit` → clean; `npx eslint` on changed files → clean
- `git diff | grep "history.pushState"` → nothing (prohibition honored)
- 3-engine matrix + full-suite gate: deferred to Plan 15-04 (phase gate) per plan `<verification>`

## Deviations from Plan

None - plan executed exactly as written.

(One judgment call, not a deviation: the plan's Task 2 verify command greps the diff for "pushState" expecting nothing; the diff contains three COMMENT lines documenting the pushState prohibition. An actual-call grep (`history.pushState` / `pushState(`) returns nothing — the prohibition is honored. Comments retained as living documentation of D14-14.)

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `#/highlights` canonical route + legacy alias live and proven; Plan 15-02's shell nav can link `#/highlights` and remove the interim LibraryView button.
- NAV-01 closes after the shell (15-02) + phase gate (15-04); `requirements-completed` is `[]` mirroring the repo's split precedent.

## Self-Check: PASSED

- Commit `72adcfa` (test/RED) found in git log ✓
- Commit `06913e6` (feat/GREEN, 17 files) found in git log ✓
- All 17 files_modified present in `git show --name-only 06913e6` ✓
- No file deletions in either commit ✓
- SUMMARY written from disk; STATE/ROADMAP updates follow this file's commit

---
*Phase: 15-application-shell-and-destinations*
*Completed: 2026-08-26*
