---
phase: 10-annotation-review-panel
plan: 01
subsystem: annotations
tags: [react, typescript, zod, annotations, tri-state, pure-derivation, playwright, vitest]

# Dependency graph
requires:
  - phase: 09-portability
    provides: MemoizedArticleText + resolveQuoteSelectorInText (the D9-13 memoized tri-state substrate this plan reuses, never forks)
  - phase: 08-library
    provides: the filterLibrary pure-derivation pattern + CanonicalArticle.tags
provides:
  - deriveReviewSections + ReviewFilters/ReviewSort/ConfidenceValue/ConfidenceFilter/ReviewEntry/ReviewSection/ReviewDerivation exports (src/routes/review/reviewFilter.ts)
  - MemoizedArticleText exported from src/portability/conflicts.ts (lifted in place, zero behavior change)
  - Six Wave-0 e2e sentinel specs under tests/e2e/review-panel/ (harness proof for Plans 10-02..10-06)
affects: [10-annotation-review-panel (plans 02-06)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure review-list derivation (join → classify → filter → group → sort) mirroring filterLibrary — no Dexie/React/IO"
    - "Per-article memoized tri-state via the LIFTED MemoizedArticleText + resolveQuoteSelectorInText (D10-13, no forked twin)"

key-files:
  created:
    - src/routes/review/reviewFilter.ts
    - tests/unit/review-filter.test.ts
    - tests/e2e/review-panel/route-entry.spec.ts
    - tests/e2e/review-panel/listing.spec.ts
    - tests/e2e/review-panel/jump-bidirectional.spec.ts
    - tests/e2e/review-panel/tri-state.spec.ts
    - tests/e2e/review-panel/curate.spec.ts
    - tests/e2e/review-panel/empty-states.spec.ts
  modified:
    - src/portability/conflicts.ts
    - .planning/phases/10-annotation-review-panel/10-VALIDATION.md

key-decisions:
  - "RECV-01 stays unchecked — this plan ships the derivation module + Wave-0 scaffolds only; the requirement closes at the plan proving end-to-end panel behavior (04-02 PAGE-01 / 06-01 ACPT-03 / 09-01 PORT-01 split precedent)"
  - "MemoizedArticleText lift-and-export chosen over a mirrored twin (research OQ1 preferred option) — one-line export keyword, Phase 9 usage byte-identical, 125/125 portability tests unchanged"
  - "orphanEntries preserved in input highlight order — the plan specifies no orphan-tail sort; display order is owned by the rendering plans (10-02/10-03)"
  - "Sections exist only for articles with surviving entries (no empty sections); section.key = article.id"
  - "Added a fourth tri-state unit case beyond the plan's minimum: article-present-but-unresolvable quote → status orphan, row kept in its section (strengthens D10-13/D10-05 coverage; confidence='orphan' assertions still match the plan's exact wording)"

patterns-established:
  - "Pure derivation twin pattern: reviewFilter.ts is the annotations-side sibling of libraryFilter.ts (named filter interface + plain function + no IO)"
  - "Wave-0 h1-visible sentinel: one sentinel per future-behavior spec file, header comment naming its verification-map rows, strengthen-only rewrite in later plans (04-02 precedent, now applied to a new route family)"

requirements-completed: []

# Metrics
duration: 7 min
completed: 2026-08-16
status: complete
---

# Phase 10 Plan 01: Review Panel Foundation Summary

**Pure deriveReviewSections derivation (join/classify/filter/group/sort with memoized tri-state + never-drop orphan tail) plus six Wave-0 e2e sentinels green across all three engines**

## Performance

- **Duration:** 7 min
- **Started:** 2026-08-16T00:22:42Z
- **Completed:** 2026-08-16T00:29:23Z
- **Tasks:** 2 (Task 1 executed as TDD: RED → GREEN)
- **Files modified:** 10 (2 source + 7 test + 1 planning artifact)

## Accomplishments

- `src/routes/review/reviewFilter.ts` — the panel's entire data logic as one pure function: Map.get joins (T-10-01a), per-article memoized tri-state via the lifted `MemoizedArticleText` + `resolveQuoteSelectorInText` (D10-13), AND-composed filters with honest confidence=all (D10-08), never-drop orphan tail (D10-05), and the three sorts (ISO-date, title localeCompare, input-order/position.start).
- `src/portability/conflicts.ts` — `MemoizedArticleText` lifted-and-exported in place (export keyword only); 125/125 existing portability unit tests prove zero behavior change.
- `tests/unit/review-filter.test.ts` — 16-test plain-Node matrix (schema-constructed fixtures, anchors derived through the shipped deriveQuoteSelector/findAllOccurrences machinery) covering every behavior in the plan plus the article-present-orphan case.
- Six Wave-0 sentinel specs under `tests/e2e/review-panel/` — 18/18 cells green across chromium/firefox/webkit, each file naming its RECV-01 verification-map rows and the plan that will strengthen it.
- `10-VALIDATION.md` backfilled: Task ID/Plan/Wave set and File Exists flipped to ✅ for rows RECV-01.a–.g (phase-gate frontmatter flags intentionally left for the phase verifier).

## Task Commits

Each task was committed atomically:

1. **Task 1: deriveReviewSections pure module + MemoizedArticleText lift-and-export + unit matrix (TDD)** — RED `74c6c62` (test) → GREEN `f8f70c8` (feat); no refactor needed
2. **Task 2: Wave-0 e2e sentinel scaffolds + validation-map backfill** — `afc87d0` (test)

**TDD gate compliance:** `test(10-01)` commit exists and precedes `feat(10-01)` — RED failed for the right reason (unresolved import), GREEN passes 16/16.

## Files Created/Modified

- `src/routes/review/reviewFilter.ts` — pure review-list derivation (new)
- `src/portability/conflicts.ts` — `export class MemoizedArticleText` (lifted in place; doc comment updated)
- `tests/unit/review-filter.test.ts` — 16-test derivation matrix (new)
- `tests/e2e/review-panel/{route-entry,listing,jump-bidirectional,tri-state,curate,empty-states}.spec.ts` — six Wave-0 sentinels (new)
- `.planning/phases/10-annotation-review-panel/10-VALIDATION.md` — verification-map backfill
- `.planning/phases/10-annotation-review-panel/deferred-items.md` — out-of-scope lint discovery ledger (new)

## Decisions Made

- **RECV-01 not marked complete** — frontmatter lists it, but the panel surface (route, view, dialogs) ships in Plans 10-02..10-06; marking it complete now would be a false claim. Mirrors the documented 04-02/06-01/09-01 split precedent (`requirements-completed: []`).
- **orphanEntries input order** — no orphan-tail sort is specified anywhere in the plan; display order belongs to the rendering plans.
- **No empty sections** — a section exists only when at least one of its entries survives filtering.
- **Sentinels assert the library h1** — under today's two-view router both `#/review` and `#/article/<id>/h/<id>` are unknown routes falling back to the list; the h1-visible assertion proves real browser reachability (04-02 precedent), not compilation.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `npm run lint` reports 3 pre-existing errors in `src/portability/zipSlip.ts` (Phase 9, commit 9793d1f): 2× no-control-regex, 1× no-useless-escape. This plan introduces zero new lint violations (none of its files appear in lint output). Logged to `deferred-items.md` per the scope-boundary rule — not auto-fixed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `deriveReviewSections` is ready for Plan 10-02 (route entry + ReviewView shell) to consume directly; all exports are stable contracts named in the plan frontmatter.
- The six sentinel files are ready to be strengthened in place by Plans 10-02/10-03/10-04/10-05/10-06 (strengthen-only; content may be rewritten in full).
- Wave-0 remaining (later plans): `tests/component/App.test.tsx` parseHash extension (RECV-01.h, Plan 10-02) and the a11y/route-enum extension rows.
- No blockers.

## Verification Evidence

| Check | Result |
|-------|--------|
| `npm run test:unit -- --run tests/unit/review-filter.test.ts` | 16/16 passed |
| `npm run test:unit -- --run tests/unit/portability/` | 125/125 passed (lift-and-export behavior-neutral) |
| `npm run test:unit -- --run` (full unit, no subsets) | 867 passed / 0 failed / 7 intentional skips (65 files) |
| `npx playwright test tests/e2e/review-panel/` | 18/18 passed (chromium + firefox + webkit) |
| `npm run lint` | 0 new violations; 3 pre-existing zipSlip.ts errors logged to deferred-items.md |

## Self-Check: PASSED

- All key-files.created exist on disk (verified via `[ -f ]` below)
- All three task commits present in git log (`74c6c62`, `f8f70c8`, `afc87d0`)
- All acceptance criteria re-run and passing (see Verification Evidence)

---
*Phase: 10-annotation-review-panel*
*Completed: 2026-08-16*
