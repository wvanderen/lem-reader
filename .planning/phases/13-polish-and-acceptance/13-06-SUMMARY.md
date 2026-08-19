---
phase: 13-polish-and-acceptance
plan: 06
subsystem: portability-acceptance
tags: [e2e, acpt-06, portability, core-flow, honest-gate, d13-08, d13-09, d13-10]
requires:
  - "09-06 two-context machine A/B harness + _portability raw-row truth helpers"
  - "08-05 proven MARKDOWN_WITH_FRONTMATTER .md payload (ING-06 threshold-clearing)"
  - "05-05 real-UI selection → toolbar → highlight helpers (_fixtures)"
  - "13-04 slim header + metadata spot + firstPageReservedPx (the settled layout this spine exercises)"
provides:
  - "ACPT-06 core-flow spine e2e: UI-driven ingest → read → highlight → export → re-import with the D13-09 no-content-loss bar across chromium/firefox/webkit"
  - "tests/e2e/library/markdown-payload.ts — the shared non-spec payload helper (single source of truth)"
  - "13-06-OUTPUT.md — the honest full-suite gate record with the 13-04 fallout bisect"
affects:
  - "tests/e2e/library/markdown-upload.spec.ts (imports the payload helper; behavior byte-identical)"
tech-stack:
  added: []
  patterns:
    - "non-spec shared helper for cross-spec payloads (Option A) — Playwright module-registry discipline: never import a .spec from a .spec"
    - "in-viewport block selection for post-restore annotation (position:fixed toolbar must land in-viewport)"
    - "04-05 passage-preservation assertion pattern for mode-switch anchors on short articles"
key-files:
  created:
    - tests/e2e/portability/core-flow-spine.spec.ts
    - tests/e2e/library/markdown-payload.ts
    - .planning/phases/13-polish-and-acceptance/13-06-OUTPUT.md
  modified:
    - tests/e2e/library/markdown-upload.spec.ts
decisions:
  - "Option A (human, 2026-08-18): payload extracted to non-spec helper markdown-payload.ts; import-from-spec rejected empirically (static re-registers 12 cells → spine --list 15; dynamic hard-errors, registration is load-phase only)"
  - "Restore assertions mirror the shipped contracts: STATE-01 scrolling reload-restore + D4-10 toggle passage round-trip (04-05 pattern) — a fresh paginated mount intentionally anchors page 1, and short-article deepest passages can legitimately begin on page 1"
  - "Honest gate outcome: exit 1 recorded, 55-cell pre-existing 13-04 fallout surfaced with bisect evidence rather than fixed in-plan (scope boundary)"
metrics:
  duration: 62 min
  completed: 2026-08-19
  tasks: 2
status: complete
---

# Phase 13 Plan 06: ACPT-06 Core-Flow Spine + Honest Full-Suite Gate Summary

One-liner: UI-driven two-machine core-flow spine (.md ingest → read → real-selection highlight → mode toggle → scroll save → export → transfer → preview-import) proving the D13-09 no-content-loss bar — five-row-kind byte equality, confident re-resolution, annotate/paginate/restore identity — green on all 3 engines, plus the honest gate record pinning a pre-existing 55-cell 13-04 fallout to `12cf39d` via fresh-server bisect.

## What Was Built

### Task 1 — Core-flow spine e2e (ACPT-06, SC#4) — commit `27033a0`

`tests/e2e/portability/core-flow-spine.spec.ts` (3 cells, one per engine, ~6-8s each):

- **Machine A** (fresh context + `prepareFreshPage`): uploads the proven
  `MARKDOWN_WITH_FRONTMATTER` payload through the real IngestControl
  (`setInputFiles` → "Add file" → `#/article/md-<hash>` route), waits for
  pagination to settle (`ok:[2-9]` multi-page), creates one highlight via the
  real selection UI (synthetic DOM Range → toolbar → "Highlight saved."
  announcement + `mark.highlight` visible + raw-row poll), toggles to
  scrolling through the header ModeToggle (prefs row persists `readingMode:
  scrolling` — the settings row that must travel), scrolls deep (60% — a
  shallow 600px stayed inside page 1's Option A budget) so the debounced
  location save fires, then exports the whole-library bundle through the
  Settings UI with download capture (`lem-reader-bundle-v1.zip`).
- **Node side**: unzips the captured bundle via the shipped `readBundleJson`
  and sanity-checks the v2 envelope (schemaVersion 2, book list empty per
  D13-08, exactly the one md- article).
- **Machine B** (fresh context + `prepareFreshPage`): imports through the
  Settings UI including the ImportPreviewDialog ("This bundle contains 1
  article, 1 highlight, 0 notes, and 1 reading position.") → Import →
  status summary.
- **D13-09 bar asserted**: (1) raw IndexedDB rows byte-equal across the five
  row kinds (articles, highlights, notes, locations, settings — read BEFORE
  any machine-B reader action can schedule writes; books excluded per
  D13-08); (2) every reimported highlight re-resolves **confident** through
  the shipped `resolveQuoteSelector` (tri-state intact); (3) the reimported
  article opens from the library row link, the traveled mark renders
  visibly, a NEW disjoint highlight is created through the same real UI
  (raw count 2), pagination reproduces machine A's exact page count
  (`ok:${pagesOnA}`), the saved position restores after reload (scrolling
  STATE-01 contract, scrollY > 100), and the D4-10 mode-switch anchor
  carries the restored passage back into paginated mode (04-05
  passage-preservation pattern with adjacent-page tolerance).
- Zero `waitForTimeout`; every end condition polled. No production changes.

### Task 2 — Honest full-suite gate (D13-10) — commit `df88aeb`

`.planning/phases/13-polish-and-acceptance/13-06-OUTPUT.md` — three plain
`npm run test` invocations recorded with real counts and exit codes. Unit
leg green every run (1197 passed / 13 skipped). E2e: 1001-1002 passed /
55 failed / 6 skipped — **exit 1**. The 55-cell set is pre-existing: a
fresh-server-per-checkpoint bisect pins it to `12cf39d` (13-04 Option A slim
header + metadata-spot single-owner page-1 mounting); every earlier commit
back to the 12-08 green gate is green. Mechanism: the Option A page-1
budget legitimately shrinks page-1 content; the failing cells encode old
page-1 geometry assumptions. 13-06's own 15 cells are green in the same
invocations. Surfaced for a dedicated repair plan; per the honest-gate
discipline (D13-10 / T-13-09) the red outcome is recorded, never masked.

## Deviations from Plan

### Rule 4 — Human decision: Option A payload-helper extraction (sanctioned 2026-08-18)

- **Found during:** Task 1 (continuation resume — prior executor's blocking fence)
- **Issue:** The plan's sanctioned one-line export-keyword edit made the
  spine import a `.spec.ts` module — both import forms are broken by
  Playwright's loader semantics: STATIC import re-executes the spec inside
  the importer's registry and re-registers markdown-upload's 12 cells as
  spine cells (measured `--list`: 3 → 15, permanently duplicating cells in
  every `npm run test` and corrupting the honest D13-10 counts); DYNAMIC
  import hard-errors ("did not expect test.beforeEach() to be called here")
  because registration APIs are load-phase only.
- **User decision (Option A):** extract the payload into the non-spec helper
  `tests/e2e/library/markdown-payload.ts` (same convention as
  `_portability.ts` / `_fixtures.ts`); markdown-upload.spec.ts imports it
  (payload bytes verified byte-identical to HEAD, 1170/1170; its 12 cells
  unchanged and green); the spine imports it statically. Exceeds the plan's
  original one-line fence — user-sanctioned.
- **Files:** tests/e2e/library/markdown-payload.ts (new),
  tests/e2e/library/markdown-upload.spec.ts, core-flow-spine.spec.ts
- **Commit:** 27033a0

### Rule 1 — Auto-fixed bugs (all spec-side, first full runs of the WIP spine)

**1. Offscreen toolbar click deadlock**
- **Found during:** Task 1 verification (all 3 engines timed out at 90s in a
  click retry loop — "element is outside of the viewport")
- **Issue:** Machine B restores a mid-article scroll, but
  `findFirstBlockWithTextAsync` walks blocks in document order → selects a
  block scrolled offscreen → the `position:fixed` toolbar renders at the
  selection's viewport rect (negative y) → the Highlight-button click never
  lands.
- **Fix:** Pick the first block that is both disjoint AND currently
  intersecting the viewport (local evaluate; `scrollIntoView` deliberately
  avoided — a synthetic scroll would fire the debounced save and overwrite
  the imported location row the restore check depends on).
- **Commit:** 27033a0

**2. Impossible final assertion — paginated reload-restore**
- **Found during:** Task 1 verification (`ok:0` vs expected `ok:[1-9]`)
- **Issue:** A fresh paginated mount intentionally anchors `initialAnchorOffset`
  at the article start; the shipped STATE-01 reload-restore contract is
  scrolling-mode (`loadLocation` → `findScrollTarget` → `scrollIntoView`), and
  paginated passage preservation rides the D4-10 mode-switch anchor. The WIP
  asserted a contract the app does not (and should not) implement.
- **Fix:** Reload-restore asserted in scrolling mode (scrollY > 100,
  persistence.spec precedent), then the toggle-to-paginated asserts the exact
  page count AND the 04-05 passage-preservation pattern (current fragment
  shows the restored passage, adjacent-page tolerance). Also deepened
  machine A's scroll (600px → 60% — the fixed offset stayed inside page 1's
  Option A budget on the short payload).
- **Commit:** 27033a0

### Out-of-scope discovery (recorded, not fixed — scope boundary)

**55-cell pre-existing e2e regression set** — introduced by 13-04's
`12cf39d`, proven by fresh-server bisect (green at `9d8c591` 12-08 gate and
every commit through `4c7c16b`; first red at `12cf39d`). Stale page-1
geometry expectations in annotations/epub/pdf/font-failure/a11y/high-zoom/
reflow specs after the intentional Option A page-1 budget change. Recorded
in 13-06-OUTPUT.md with a surfaced repair recommendation; NOT fixed in this
plan. Also surfaced: a firefox `search-tag-filter` auto-prune 1-of-3 flake.

## Authentication Gates

None.

## Known Stubs

None — every assertion reads real UI state or raw IndexedDB rows; no
placeholder data paths.

## Threat Surface

No new trust-boundary surface: test-only files plus a planning record. The
T-13-08 mitigation held (payload reused unchanged through the shipped Zod-at-
boundary pipeline; zero production changes in this plan). T-13-09 (gate
honesty) satisfied by the literal command history + red-run record in
13-06-OUTPUT.md.

## TDD Gate Compliance

Plan type is `execute` (not `tdd`) — no RED/GATE gate commits required; both
tasks used atomic per-task commits.

## Self-Check: PASSED

Verified post-write: `tests/e2e/portability/core-flow-spine.spec.ts`,
`tests/e2e/library/markdown-payload.ts`,
`.planning/phases/13-polish-and-acceptance/13-06-OUTPUT.md` exist on disk;
commits `27033a0` and `df88aeb` present in `git log`; spine listed 3 cells
(not 15) and markdown-upload 12 cells via `--list`; both specs green on
chromium/firefox/webkit.
