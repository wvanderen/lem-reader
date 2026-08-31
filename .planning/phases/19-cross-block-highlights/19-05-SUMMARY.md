---
phase: 19-cross-block-highlights
plan: 05
subsystem: testing
tags: [playwright, e2e, eligibility-matrix, annotations, cross-block-highlights, vitest]

# Dependency graph
requires:
  - phase: 19-cross-block-highlights (Plans 01-04)
    provides: endpoint-composed span capture, firstFragmentExcerpt + multi-line export, scrolling render coverage (list threading/caption/code marks), paginated twin (per-page first-occurrence id pass)
provides:
  - The tested eligibility matrix (ANNO-12) — kind × crossing × gap-placement + refusal cells across chromium/firefox/webkit
  - Span durability/atomicity/jump cells across survive-relayout / persist-reload / delete-confirm / span-capture / note-create-edit / round-trip
  - Long-span re-anchor drift unit cells (D19-04 honesty, no cap)
  - The honest green phase gate (npm run test exit 0, verbatim counts)
affects: [20-local-image-fidelity, 21-polish-acceptance, any future annotation work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "scrollIntoView both endpoint scopes BEFORE selecting — the position:fixed toolbar computes off the selection's viewport rect, so mid-article spans otherwise mount an unclickable toolbar"
    - "expectMarkInBlock uses .first() — a span crossing a container block renders one mark per readable child sharing the id (strict-mode-safe assertion)"
    - "shared selectRangeBetweenBlocks + markTextsForHighlight homed in the _fixtures harness (REUSE-DO-NOT-FORK across five strengthened specs)"

key-files:
  created:
    - tests/e2e/annotations/eligibility-matrix.spec.ts
  modified:
    - tests/e2e/annotations/_fixtures.ts
    - tests/e2e/annotations/survive-relayout.spec.ts
    - tests/e2e/annotations/persist-reload.spec.ts
    - tests/e2e/annotations/delete-confirm.spec.ts
    - tests/e2e/annotations/span-capture.spec.ts
    - tests/e2e/annotations/note-create-edit.spec.ts
    - tests/e2e/portability/round-trip.spec.ts
    - tests/unit/annotations/resolve-quote-selector.test.ts
    - tests/e2e/library/library-restore.spec.ts
    - tests/e2e/library/reading-views.spec.ts

key-decisions:
  - "Textless-figure gap cell adapted honestly: both corpus figures carry captions (verified census), so the zero-marks-inside-gap proof rides the footnote-reference-marker + unsupported interiors; the figure cell asserts one-identity continuation + caption marks + zero marks on the img surface"
  - "Footnote-reference endpoint cell asserts capture-eligibility + render-unmarked (19-03's shipped coverage boundary) instead of the plan's impossible marks-in-both-blocks shape"
  - "Library corpus-count pins realigned to the 7-fixture corpus the gate surfaced (the 13-06 stale-expectation precedent)"
  - "Cross-block selection helpers homed in _fixtures.ts rather than forked per-spec"

patterns-established:
  - "Eligibility-matrix cell inventory greppable by test titles (kinds/gaps/refusals/D19-14/backwards/D19-11)"
  - "Gate-surfaced corpus-drift realignment: identical-cell failure across engines = regression class → fix the stale pin, cite the corpus change"

requirements-completed: [ANNO-08, ANNO-10, ANNO-11, ANNO-12]

# Metrics
duration: 55 min
completed: 2026-08-31
status: complete
---

# Phase 19 Plan 5: Validation — Eligibility Matrix + Honest Phase Gate Summary

**The tested ANNO-12 eligibility matrix (21 cells × 3 engines: every readable kind, crossing, interior-gap, and refusal class) plus span durability/atomicity/jump cells and long-span drift cells — closing with the honest full-suite gate green: 2997 passed / 0 failed / 23 documented skips, exit 0 in one invocation.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-08-31T00:11:49Z
- **Completed:** 2026-08-31T01:06:33Z
- **Tasks:** 3
- **Files modified:** 11 (1 spec created, 8 specs + harness strengthened, 2 library specs realigned)

## Honest Full-Suite Gate (verbatim, one invocation)

`npm run test` = `vitest --run` then `playwright test`, fresh dev server (port 5173 cleaned before the run — the webkit-starvation lesson), no grep/engine/subset filtering:

- **Unit (vitest):** `Test Files  97 passed | 2 skipped (99)` · `Tests  1416 passed | 13 skipped (1429)` — **0 failed**
- **E2e (Playwright, chromium + firefox + webkit):** `10 skipped` · `1581 passed (16.1m)` — **0 failed**
- **Exit code:** 0 (`GATE_EXIT=0`)

The 13 unit + 10 e2e skips are the documented intentional set carried since Phase 15/18 (same skip counts as the 18-04 gate record; pass counts grew with the phase-19 cells). First gate run recorded honestly: exit ≠ 0 with 9 failing cells (see Deviations #2) — fixed in-plan with an atomic commit, then the green run above is the permanent record.

## Accomplishments

- **ANNO-12 closed as a TESTED matrix** (`eligibility-matrix.spec.ts`, 63 cells green across engines): all 8 endpoint kinds (paragraph, heading, quotation-child, list-item, nested-list-item, caption, code, footnote-reference marker), crossings (cross-two, cross-many with every intermediate marked, item→sibling, item→paragraph), all 3 interior-gap classes (textless markers + unsupported render unmarked; code IS marked), all 3 refusal classes (boundary-ineligible verbatim string + footnote-body ineligible + overlap), the D19-14 marker-exclusion textContent proof, the backwards-drag (setBaseAndExtent) equivalence cell, and the D19-11 no-badge + single-U+2026-ellipsis review row.
- **ANNO-10 durability proven for spans**: typography-change + M-mode-switch with byte-stable extents and one `#hl-` id per document/mounted page (survive-relayout); reload at the same text in the persisted mode with the drawer reflecting one record (persist-reload); export→import as ONE record with multi-line `quote.exact` separators preserved byte-equal and re-anchoring confident (round-trip); review-jump focusing the span's first slice on the mounted page (span-capture).
- **ANNO-11 atomicity proven for spans**: review-confirm delete removes EVERY mark in both modes + cascades the note (delete-confirm); note-edit-on-span reaches exactly ONE highlight + ONE note row with extents unchanged (note-create-edit).
- **D19-04 long-span honesty pinned in unit cells** (resolve-quote-selector.test.ts): whole-article span round-trips confident same-revision; mid-span edit degrades to orphan — never silent re-attach; multi-line exact resolves confident.
- **Regression-target audit clean** (every 19-UI-SPEC §Regression Targets row — see below).

## Task Commits

Each task was committed atomically:

1. **Task 1: eligibility-matrix.spec.ts — the tested matrix (ANNO-12)** - `5ba7712` (test)
2. **Task 2: durability + atomicity span cells (ANNO-10/11)** - `a41fde8` (test)
3. **Task 3: honest full-suite phase gate** - `0b4b620` (fix — the gate-surfaced corpus-pin realignment; the green gate itself is this SUMMARY's verbatim record)

## Regression-Target Audit (19-UI-SPEC §Regression Targets)

| Surface | Result |
|---------|--------|
| Toolbar anatomy (`role="toolbar"` + `Highlight actions` + both labels + positioning/flip + announce) | PASS — byte-stable; toolbar specs green in gate |
| Carried hint strings (`This overlaps an existing highlight.` · `Select text to highlight it.` · `Select readable text to highlight it.`) | PASS — verbatim at SelectionToolbar.tsx L252-258 (plus the one sanctioned new D19-06 string) |
| Mark discipline (`tabIndex={0}` + `aria-haspopup="dialog"` + per-slice aria + tri-state modifiers) | PASS — InlineRenderer + BlockRenderer (code/caption marks carry the same discipline); forced-colors/activation specs green |
| `mark.highlight` CSS bytes | PASS — `src/app.css` absent from the phase-19 src diff (fill/radius/focus untouched) |
| D5-08 measurement-body refusal (cross-page) | PASS — capture-rejects.spec.ts green in gate (ANNO-13 stays Future) |
| Review row anatomy (quote + note preview + badge only on ambiguous/orphan; `Go to highlight:` aria family; disabled-when-unresolvable) | PASS — review/curation specs green; D19-11 no-badge cell adds the explicit span-row absence proof |
| Delete confirm (structure, copy, `data-initial-focus` on cancel, single `deleteHighlight` call site per destructive surface) | PASS — popover + review each retain their one call site (the shipped two-surface Pitfall 8 shape; zero phase-19 drift) |
| Review empty states (both D10-10 strings) | PASS — L405/L408 verbatim |
| NotePopover modal discipline (`<dialog>`/`showModal` + H/N + excerpt block) | PASS — unchanged; popover specs green |
| Hash grammar `#/article/<id>/h/<hl>` | PASS — ReviewView L254 unchanged; jump cell proves the target semantics |

Prohibition checks: zero `test.skip(`/`test.fixme(` calls in `tests/e2e/annotations/` (grep verified); the matrix carries the 3-engine header discipline and runs unfiltered via the default projects; spec edits across the phase are additive cells + the D19-cited sanctioned 19-01 flips (the phase-wide tests/ diff: 3414 insertions / 115 deletions, the deletions being the sanctioned capture-rejects test-1 move and this plan's count realignments).

## Files Created/Modified

- `tests/e2e/annotations/eligibility-matrix.spec.ts` — NEW: the tested matrix (21 cells; endpoint kinds, crossings, interior gaps, refusals, D19-14, backwards drag, D19-11)
- `tests/e2e/annotations/_fixtures.ts` — shared `selectRangeBetweenBlocks` + `markTextsForHighlight` harness helpers (scrollIntoView discipline)
- `tests/e2e/annotations/survive-relayout.spec.ts` — span cell: typography + mode switches, byte-stable extents, one id per document/mounted page
- `tests/e2e/annotations/persist-reload.spec.ts` — span cell: reload at the same text, persisted mode, drawer = one record
- `tests/e2e/annotations/delete-confirm.spec.ts` — span cell: review-confirm delete, zero marks both modes, note cascade
- `tests/e2e/annotations/span-capture.spec.ts` — review-jump cell: focus on the `hl-` first slice in the mounted page fragment
- `tests/e2e/annotations/note-create-edit.spec.ts` — span note-edit cell: ONE record, extents unchanged, both modes
- `tests/e2e/portability/round-trip.spec.ts` — span round-trip cell: multi-line `quote.exact` byte-equal across machines, confident re-anchor (no `.unresolved`)
- `tests/unit/annotations/resolve-quote-selector.test.ts` — D19-04 drift cells: whole-article confident / mid-span-edit orphan / multi-line confident
- `tests/e2e/library/library-restore.spec.ts` + `tests/e2e/library/reading-views.spec.ts` — corpus-count pins realigned to the 7-fixture corpus

## Decisions Made

- Textless-figure gap adaptation (corpus census: both figures captioned; adding a fixture would multiply every corpus consumer's cells — out of sanctioned scope). The zero-marks-inside-gap mechanism is proven by the footnote-reference-marker + unsupported interiors; the figure cell asserts one-identity continuation, caption marks, and zero marks on the img surface.
- Footnote-reference marker endpoint cell asserts eligibility + one record + render-unmarked (19-03's shipped coverage boundary: markers are 3-grapheme chrome; the readable footnote destination is the body, an ineligible boundary).
- D19-14 cell direction reversed from the plan sketch (an end endpoint at the item's char 0 composes to the list block's start boundary and renders nothing — the span must START at char 0 and extend INTO the item for the first-marked-character proof).
- Library corpus-pin realignment (Rule 1, in-plan fix) rather than deferral: the stale pins trace to this phase's own 19-03 fixture addition.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Toolbar unclickable for mid/late-article selections**
- **Found during:** Task 1 (first matrix run — 27 cells failed identically on all 3 engines)
- **Issue:** The selection toolbar is `position:fixed`, computed from the selection's viewport rect; selections in blocks below the fold mounted the toolbar outside the viewport (`locator.click` → "element is outside of the viewport")
- **Fix:** `scrollIntoView({ block: "center" })` both endpoint scopes before setting the selection (in the matrix's `selectSpan` and the shared harness helper)
- **Files modified:** tests/e2e/annotations/eligibility-matrix.spec.ts, tests/e2e/annotations/_fixtures.ts
- **Verification:** 63/63 matrix cells green on 3 engines
- **Committed in:** 5ba7712

**2. [Rule 1 - Bug] Library corpus-count pins stale after 19-03's 7th fixture**
- **Found during:** Task 3 (first honest gate run — 9 cells failed identically on all 3 engines)
- **Issue:** `reading-views.spec.ts` corpus sanity pin (unread 8 / All 13) and `library-restore.spec.ts` (e)/(f) (`All (17)` / `All (6)`) hardcoded the 6-fixture corpus; 19-03's `nested-list-paths` addition (unread by definition) shifted every fixture-derived count by one. Latent since 19-03 — annotations-scoped sampling never ran the library specs; the last full gate predates the fixture.
- **Fix:** Realigned pins to the computed 7-fixture truth (unread 9 / All 14 / All (18) / All (7)) with citing comments — the 13-06 stale-expectation precedent; computed constants and all other cells were already correct (they derive from `fixtures.length`)
- **Files modified:** tests/e2e/library/library-restore.spec.ts, tests/e2e/library/reading-views.spec.ts
- **Verification:** 87/87 cells green on 3 engines; the full gate then exited 0
- **Committed in:** 0b4b620

**3. [Rule 2 - Missing critical] Strict-mode violations on container-block mark assertions**
- **Found during:** Task 1 (matrix second run — 3 cells)
- **Issue:** `expect(locator).toBeVisible()` on locators resolving to multiple marks (a span crossing a list/blockquote renders one mark per readable child) threw strict-mode violations — the marks were all present
- **Fix:** `expectMarkInBlock` asserts `.first()` (the D5-16 multi-mark-per-id discipline)
- **Files modified:** tests/e2e/annotations/eligibility-matrix.spec.ts
- **Verification:** cells green on 3 engines
- **Committed in:** 5ba7712

**4. [Rule 3 - Blocking] __lemPagination not awaited in scrolling mode after reload**
- **Found during:** Task 2 (persist-reload span cell first run)
- **Issue:** The pagination DEV hook is committed by the paginated pipeline; the cell's post-reload wait for it timed out in the persisted scrolling mode
- **Fix:** Dropped the hook wait (the mark assertions auto-retry until the scrolling surface mounts); comment documents why
- **Files modified:** tests/e2e/annotations/persist-reload.spec.ts
- **Verification:** cell green on 3 engines
- **Committed in:** a41fde8

---

**Total deviations:** 4 auto-fixed (1 bug, 2 blocking, 1 missing-assertion-shape) + 2 honest cell adaptations documented in-spec (textless-figure corpus gap; footnote-reference render-coverage boundary).
**Impact on plan:** All fixes were required to make the plan's own cells runnable/honest; no production source changed in this plan. No scope creep.

## Issues Encountered

- The plan's literal "textless figure" and "marks in BOTH blocks for the footnote-reference endpoint" cells are unreachable against the shipped corpus/render coverage — adapted honestly (documented above and in the spec's cell-inventory header), keeping the intent (gap mechanism proven; eligibility proven) without inventing fixtures or weakening assertions.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 19 closes: ANNO-08..ANNO-12 all proven in real browsers; the honest gate is green with verbatim counts recorded above.
- Ready for Phase 20 (local image fidelity — figures stay highlight-gap semantics exactly as the matrix now pins them) and Phase 21 polish/acceptance.
- No blockers. `deferred-items.md`: no entries — the gate-surfaced failures were phase-19 surface and fixed in-plan.

---
*Phase: 19-cross-block-highlights*
*Completed: 2026-08-31*
