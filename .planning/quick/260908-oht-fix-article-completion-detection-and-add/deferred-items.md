# Deferred items — 260908-oht

Out-of-scope discoveries logged per the scope-boundary rule (fixing them is
NOT part of this quick task; they are pre-existing on the task's base commit
9ce8287 and trace to the two non-GSD direct commits `b13eba5` "feat: add
Getting Started library guide" and `e7c5886` "fix: visual issues").

## 1. The e2e suite has been DEAD (zero tests executed) since b13eba5 (2026-09-07)

`tests/e2e/library/progress-recent.spec.ts` indexed `fixtures[1]`/`fixtures[2]`
at module load; b13eba5 reduced `fixtures` (libraryFixtures) to the single
`gettingStarted` article → module-load TypeError → Playwright aborted the
ENTIRE run before executing any test (`npm run test:e2e` printed only the
stack; every `npm test` since 2026-09-07 ran zero e2e tests). Both non-GSD
commits landed without a full-suite gate.

**Fixed in this task** (Rule 3 — it blocked the plan's own verify gate):
commit e1949d4 repairs the harness (Node-built strip standalones + the
seedArticleRows discipline; assertions unchanged). The RUNNER is healthy
again; the remaining failures below are what the dead runner was hiding.

## 2. ~191 pre-existing e2e failures from the single-article starter library (NOT fixed)

All present at base 9ce8287 + the harness repair; none caused by this task's
changes. Root-cause clusters (fixing them is a product/spec decision — which
corpus should the specs assume? — not mechanical):

- **Readiness sentinel drift**: `tests/e2e/_edge-invariant.ts:263-265` gates
  library readiness on the text "The looting of science fiction" (the OLD
  first bundled fixture title, now only in regressionFixtures). Breaks the
  destination-invariant matrix cells of reflow / forced-colors / high-zoom /
  reduced-motion / touch-targets (9 each), review-panel family
  (jump-bidirectional, curate, listing, tri-state, empty-states), a11y:214,
  panel-keyboard, reduced-motion:126/150.
- **Library row-count arithmetic**: specs assume 6-7 bundled corpus articles:
  epub-intake (All/row counts Expected 7-8, Received 1-2), pdf-intake
  BASELINE_ROWS=7 vs 1, library-restore (e)/(f) `All (18)`/`All (7)`,
  reading-views:640 corpus sanity.
- **fixtures-referencing crashes**: imagery/geometry:44
  (`fixtures.find(id) === undefined` → `.blocks` TypeError), ingestion/
  happy-path:187 (`fixtures.find` clone → setting 'id' of undefined),
  focused-add:339 (asserts the OLD fixtures[0] title).
- **Review join drops corpus highlights**: #/highlights joins highlights
  against the LIBRARY list; corpus articles (essay-long-form, figure-heavy)
  are openable by deep link but no longer listed → their highlights vanish
  from the review → span-capture:225, eligibility-matrix:766, tri-state,
  curate, listing rows = 0.

## 3. `npm test` cannot exit 0 until (2) is resolved

The plan's ideal exit-0 gate is unachievable at this base without the
out-of-scope repairs above (the plan itself forbids fixing unrelated specs).
This task's honest gate: tsc clean, lint clean, unit suite 1672/0 green,
e2e runner repaired, and every failure NOT pre-existing is green — the two
spec/feature interaction points (repagination-anchor, core-flow-spine) were
updated strengthen-only and pass 12/12 across chromium/firefox/webkit.

## 4. Dev-server note for whoever repairs (2)

A long-lived user dev server (started 2026-09-07 18:12) was serving :5173
during this task's runs; Playwright's `reuseExistingServer` reused it. It
serves current disk state, so results are valid, but per-project PORT
isolation (or stopping the server) is advisable for future baseline A/Bs —
the STATE.md "WebKit starvation lesson" applies.
