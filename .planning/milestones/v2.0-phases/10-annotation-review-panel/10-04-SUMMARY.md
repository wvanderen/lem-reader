---
phase: 10-annotation-review-panel
plan: 04
subsystem: annotations
tags: [playwright, e2e, review-panel, tri-state, annotations, filters, sorting, empty-states, live-region]

# Dependency graph
requires:
  - phase: 10-annotation-review-panel (Plan 10-01)
    provides: deriveReviewSections contracts + the Wave-0 e2e sentinels strengthened here + the unit-proven derivation core these specs smoke end-to-end
  - phase: 10-annotation-review-panel (Plan 10-02)
    provides: the shipped ReviewView surface (section/row anatomy, badges, legend, filter/sort controls, .status empty copies) asserted by these specs
  - phase: 10-annotation-review-panel (Plan 10-03)
    provides: the two e2e-harness fixes reused verbatim — schema-declaring reload after wipeDatabase; seed-then-hash-navigate
provides:
  - Strengthened listing.spec.ts — RECV-01.b complete (completeness/metadata/note-preview/date) + RECV-01.d e2e smoke (filter AND-composition live, all three sorts observably reorder the DOM)
  - Strengthened tri-state.spec.ts — RECV-01.e honest surfacing (badges, legend, exact orphan-tail heading, never-silently-hidden, non-jumpable ambiguous rows)
  - Strengthened empty-states.spec.ts — RECV-01.g both distinct .status branches + role=status live-region parity
  - Seed-time corpus invariant guards (position order, excerpt distinctness, ambiguity re-verified through the shipped resolveQuoteSelector at module load)
affects: [10-annotation-review-panel (plans 10-05, 10-06)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Seed-time corpus self-verification: module-load throws if the corpus ever loses its discriminating power (position order crossed with date order, excerpt uniqueness, shipped-resolver ambiguity verdict) — the confidentHighlightOn philosophy extended to hand-built anchors"
    - "Discriminating-corsort sort proof: seeds chosen so section date-order ≠ alpha-order ≠ library order, and within-section date-order ≠ position-order — each sort's assertion would fail under any other sort's comparator"

key-files:
  created: []
  modified:
    - tests/e2e/review-panel/listing.spec.ts
    - tests/e2e/review-panel/tri-state.spec.ts
    - tests/e2e/review-panel/empty-states.spec.ts

key-decisions:
  - "RECV-01 stays unchecked — this plan proves RECV-01.b/.d/.e/.g in real browsers, but .c's click-from-row half, .f (curation), and .i close in 10-05/10-06 (the 10-01/10-02/10-03 split precedent; requirements-completed: [])"
  - "Schema-valid row augmentation over forked helpers: createdAt overrides via spread on highlightRow output, tags: [\"essay\"] via spread on makeArticle output, and the ambiguous anchor assembled as a plain { position, quote } object — the shared helpers still build every row (acceptance criterion: only seedRows/makeArticle/confidentHighlightOn/highlightRow imports)"
  - "Ambiguity is seeded by construction + verified by the SHIPPED resolver: a sentence duplicated verbatim in two paragraphs with empty (wildcard) prefix/suffix can never disambiguate; resolveQuoteSelector is re-run at module load and must return 'ambiguous' before any browser work"
  - "Position-sort library-order determinism documented: Dexie toArray() returns ingested rows in primary-key order, so ids review-alpha-corpus < review-zeta-corpus pin the seeded library order (A first, B second) that the Position sort must reproduce"

patterns-established:
  - "Corpus invariant guards at module load (throw before any browser work if prose drift breaks the sort/filter proofs)"
  - "Sort-flip assertion trio: default Date pinned via toHaveValue('date') → DOM order asserted → each selectOption flip re-asserted, with the within-section row order mirrored between Date and Position sorts"

requirements-completed: []

# Metrics
duration: 6 min
completed: 2026-08-16
status: complete
---

# Phase 10 Plan 04: Review Panel Listing + Tri-State + Empty-States E2E Summary

**Three strengthened e2e specs (36 new cells, green × chromium/firefox/webkit) proving the user-visible review-panel contract: complete grouped listing with note/date metadata, live filter AND-composition, all three sorts observably reordering the DOM on a discriminating corpus, honest tri-state badges with the exact orphan-tail heading and never-silently-hidden confidence=All, and both distinct .status empty copies with role=status live-region parity**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-16T01:09:45Z
- **Completed:** 2026-08-16T01:15:51Z
- **Tasks:** 2
- **Files modified:** 3 (all e2e specs; zero source changes)

## Accomplishments

- `tests/e2e/review-panel/listing.spec.ts` — sentinel replaced with 5 tests × 3 engines: completeness (every seeded highlight visible under its own article h2, note preview on the noted row, non-empty date per row, newest-first rows under the default Date sort), tag-chip narrowing, article-select narrowing (select populated with both titles), confidence filter AND-composition (Confident keeps all; tag essay ∧ Ambiguous narrows to zero rows), and the three-sort flip matrix on a corpus whose section date-order ≠ alpha-order ≠ library order and whose within-section date-order ≠ position-order (the position assertion lives only under Position, the newest-first assertion only under Date).
- `tests/e2e/review-panel/tri-state.spec.ts` — sentinel replaced with 4 tests × 3 engines: ambiguous badge ("Uncertain anchor") present + confident row badge-less + legend visible; the orphan tail under the EXACT "Highlights without an article" heading with the ghost row's quote visible, its "Article missing" badge, and zero button affordances inside the orphan section; confidence=All (default pinned) shows both unresolved rows while Orphan/Ambiguous narrow to exactly them; the ambiguous row's jump control is disabled with aria-disabled="true".
- `tests/e2e/review-panel/empty-states.spec.ts` — sentinel replaced with 3 tests × 3 engines: the full "No highlights yet." copy on an articles-only (zero-highlight) library; the "No highlights match these filters." copy proven against a library whose non-emptiness was asserted BEFORE filtering (and explicitly distinct from the other branch); live-region parity — exactly one polite/atomic role=status region carries both copies, with the transition into the no-match copy asserted inside the region itself.
- Seeding reuses the `_portability.ts` helpers wholesale (seedRows/makeArticle/confidentHighlightOn/highlightRow) plus the two documented 10-03 harness fixes; corpus invariants self-verify at module load (position/date crossing, excerpt uniqueness, shipped-resolver ambiguity verdict).

## Task Commits

Each task was committed atomically:

1. **Task 1: listing.spec.ts — cross-article listing + filter AND + sort** — `e2b08b8` (test)
2. **Task 2: tri-state.spec.ts + empty-states.spec.ts — honest surfacing + empty branches** — `c2da9fc` (test)

**Plan metadata:** (recorded below after state updates)

## Files Created/Modified

- `tests/e2e/review-panel/listing.spec.ts` — RECV-01.b listing/metadata + RECV-01.d filter/sort e2e (346 lines ≥ 80 min)
- `tests/e2e/review-panel/tri-state.spec.ts` — RECV-01.e tri-state honest surfacing (230 lines ≥ 60 min)
- `tests/e2e/review-panel/empty-states.spec.ts` — RECV-01.g both empty branches + live-region parity (154 lines ≥ 40 min)

## Decisions Made

- **RECV-01 not marked complete** — sub-behaviors .c (click-from-row half), .f (curation), and .i close in Plans 10-05/10-06; this plan's frontmatter lists RECV-01 but marking it complete now would be a false claim (mirrors the 10-01/10-02/10-03 precedent).
- **Row augmentation, not helper forks** — createdAt/tags overrides are schema-valid spreads on the shared helpers' outputs; the ambiguous anchor is a plain `{ position, quote }` object. The acceptance criterion "only seedRows/makeArticle/confidentHighlightOn/highlightRow imports, no forked seeding code" holds (grep-verified: the only `indexedDB` mentions in the specs are explanatory comments).
- **Ambiguity verified through the shipped resolver at seed time** — `resolveQuoteSelector(ARTICLE, AMBIG_QUOTE, AMBIG_POSITION) !== "ambiguous"` throws at module load, guarding against prose drift the same way confidentHighlightOn guards confidence.
- **Position-sort determinism via id ordering** — the articles table returns rows in primary-key order, so the corpus ids (`review-alpha-corpus` < `review-zeta-corpus`) pin the seeded library order the Position sort must reproduce; documented in the spec header.
- **10-VALIDATION.md not backfilled** — unlike 10-01/10-03, this plan has no VALIDATION-task; execution flags stay with the phase verifier (the rows' File Exists flags were already ✅ from 10-01).

## Deviations from Plan

None - plan executed exactly as written. (No 10-02 surface defects surfaced — zero source changes were needed.)

## Issues Encountered

None — both spec files passed all engines on the first run (15/15 listing, 21/21 tri-state + empty-states).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- RECV-01.b/.d/.e/.g now have green executor evidence in real browsers (36 new cells); the phase verifier can flip those rows' execution flags.
- Plan 10-05 (curation) strengthens `curate.spec.ts` and adds the `setRefreshKey` bump — the seeded-corpus harness shape in these three specs is directly reusable.
- Plan 10-06 closes the click-from-row loop (panel row pushes the deep link, Back returns to the origin row) and runs the full-suite gate.
- No blockers.

## Verification Evidence

| Check | Result |
|-------|--------|
| `npx playwright test tests/e2e/review-panel/listing.spec.ts` | 15/15 passed (chromium + firefox + webkit) |
| `npx playwright test tests/e2e/review-panel/tri-state.spec.ts tests/e2e/review-panel/empty-states.spec.ts` | 21/21 passed (chromium + firefox + webkit) |
| `npx playwright test tests/e2e/review-panel/` (whole dir, regression sweep) | 69/69 passed (all 6 specs × 3 engines) |
| `npm run test:unit -- --run` (full unit, untouched) | 871 passed / 0 failed / 7 intentional skips (65 files) — identical to the 10-02/10-03 baseline |
| `npx eslint` over the three spec files | exit 0 |
| `npm run build` | exit 0 |
| Acceptance greps | only seedRows/makeArticle/confidentHighlightOn/highlightRow + type imports from `_portability.ts`; zero raw IndexedDB seeding in specs (comment mentions only); line minimums 346/230/154 ≥ 80/60/40 |

## Self-Check: PASSED

- All key-files.modified exist on disk (verified via `[ -f ]`)
- Both task commits present in git log (`e2b08b8`, `c2da9fc`)
- All acceptance criteria re-run and passing (see Verification Evidence)

---
*Phase: 10-annotation-review-panel*
*Completed: 2026-08-16*
