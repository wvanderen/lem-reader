---
phase: 18-reader-orientation
plan: "01"
subsystem: ui
tags: [toc, grapheme-offsets, scroll-spy, intersection-observer, react-hooks, accessibility]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: D-05 grapheme substrate — articleGraphemeIndex.blockStartOffsets prefix sums (normalizeText.ts)
  - phase: 02-reading-experience
    provides: SectionAnnouncer detection effect (L48-113) — the extraction source for sectionSpy
provides:
  - deriveToc(article) → TocEntry[] — the ONE TOC derivation point every Phase 18 surface consumes (Top-first, blockStartOffsets destinations, D18-09/10/11 invariants unit-proven)
  - TocEntry type — { text, offset, blockIndex, level: 2|3|4|5|6, depth }
  - useSectionSpy({ articleEl, selector, onCurrent }) — selector-parameterized scroll-spy shared by SectionAnnouncer ("h2, h3, h4") and TocPanel 18-02 ("h2, h3, h4, h5, h6")
affects: [18-reader-orientation (Plans 18-02, 18-03, 18-04), reader-orientation]

# Tech tracking
tech-stack:
  added: [] # zero package installs (T-18-SC accept — browser platform + existing modules only)
  patterns:
    - pure derivation over the D-05 substrate via O(1) blockStartOffsets lookup (anchor.ts pageStartGlobalOffset shape, reused not forked)
    - selector-parameterized shared detection — one scroll-spy implementation, consumer-pinned selectors
    - latest-callback ref so observer lifecycle depends only on [articleEl, selector] (byte-stable effect-dep shape)

key-files:
  created:
    - src/content/toc.ts
    - src/reader/sectionSpy.ts
    - tests/unit/toc.test.ts
  modified:
    - src/reader/SectionAnnouncer.tsx

key-decisions:
  - "TOC depth rule: direct child = parent+1; skipped level = parent+2 (the jump is one structural signal — gap SIZE is not spelled per level; entry.level carries the true source level verbatim per ORNT-04)"
  - "sectionSpy tracks change by TEXT (byte-identical announcer semantics) and passes the heading ELEMENT + detect-time text to the callback — element-first per the D18-12 contract, detect-time text keeps `Section: {text}.` construction byte-stable"
  - "ORNT-04 stays unchecked until 18-02 ships the TocPanel — this plan proves the derivation invariants (data-layer half); semantic list/link keyboard + SR navigation lands with the panel (04-02 PAGE-01 / 10-01 RECV-01 split precedent)"

patterns-established:
  - "Derived TOC data is computed, never persisted — deriveToc reads articleGraphemeIndex at render time; zero Dexie/schema changes (Pitfall 9)"
  - "Shared scroll-spy: consumers pin their own selector; the module never hardcodes one (Pitfall 5 — a spec diff in section-announce.spec.ts is the warning sign)"

requirements-completed: [] # ORNT-04 closes at 18-02 (TocPanel ships the user-facing surface; split precedent above)

# Metrics
duration: 8min
completed: 2026-08-30
status: complete
---

# Phase 18 Plan 01: TOC Foundation Modules Summary

**Pure deriveToc over the D-05 substrate (Top-first, skip-tolerant, duplicates AS-IS) + selector-parameterized sectionSpy extraction with the announcer contract byte-stable**

## Performance

- **Duration:** 8 min (started 2026-08-30T15:49:21Z, completed 2026-08-30T15:57:15Z)
- **Tasks:** 2 (Task 1 TDD: RED → GREEN)
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- `deriveToc`/`TocEntry` ship pure (no DOM/React/persistence) with the synthetic Top entry (offset 0, blockIndex -1) first and one entry per h2-h6 heading carrying its article-global `blockStartOffsets` destination — the identical O(1) prefix-sum read `pageStartGlobalOffset` performs
- 14-test invariant suite proves every D18-09/10/11 truth: skipped levels (h2→h5) nest depth 2 with zero invented intermediates, duplicate texts pass through AS-IS with distinct destinations, h1 excluded, headingless → exactly [Top], levels preserved verbatim h2-h6 (well-formed chain reaches depth 4)
- SectionAnnouncer's detection extracted verbatim into `useSectionSpy` with a heading-selector parameter and an element-first callback; the announcer consumes it with `"h2, h3, h4"` and its announce region + `Section: {text}.` string are byte-identical — **section-announce.spec.ts 12/12 green across chromium/firefox/webkit with ZERO spec diff** (Pitfall 5 gate)
- No Dexie, schema, or persistence changes anywhere (Pitfall 9); zero package installs (T-18-SC accept)

## Task Commits

Each task was committed atomically:

1. **Task 1: deriveToc pure module + invariant unit suite (TDD)** — `dbb7897` (test — RED: suite fails on missing module) → `ceddba5` (feat — GREEN: 14/14 pass)
2. **Task 2: sectionSpy extraction, announcer consumes shared detection** — `104222f` (feat)

**Plan metadata:** (recorded below after docs commit)

## Files Created/Modified
- `src/content/toc.ts` (NEW) — `deriveToc(article): TocEntry[]` + `TocEntry`; pure derivation, contract-citing header, `articleGraphemeIndex` import (no forked offset math)
- `src/reader/sectionSpy.ts` (NEW) — `useSectionSpy({ articleEl, selector, onCurrent })`; IO + rAF scroll fallback + 250ms debounce + full cleanup, carried verbatim from SectionAnnouncer L48-113
- `src/reader/SectionAnnouncer.tsx` (MODIFIED) — detection wiring replaced by the shared call (selector `"h2, h3, h4"`); status region JSX and announce string byte-identical; no inline IntersectionObserver remains
- `tests/unit/toc.test.ts` (NEW) — 14-case derivation invariant suite (normalizeText.test.ts shape: ArticleSchema.parse helper + baseArticle literal, table-driven)

## Verification Results
- `npx vitest run tests/unit/toc.test.ts` — 14/14 pass (RED→GREEN committed atomically)
- `npx playwright test tests/e2e/section-announce.spec.ts` — **12/12 pass** (chromium/firefox/webkit), `git diff` on the spec empty (zero diff — Pitfall 5)
- `npx vitest run --project unit` — 73 files, **1032/1032 green, 0 failed** (includes the 14 new toc tests; no regressions from the SectionAnnouncer refactor)
- `npx eslint` on all touched source files — clean; `npx tsc --noEmit` — only the pre-existing unrelated error (see Deviations)

## Decisions Made
- **Depth semantics** (plan pinned h5-after-h2 = 2): implemented as parent.depth + 1 for a direct child, parent.depth + 2 when ≥1 level is skipped. A skip is ONE structural signal; the per-level gap is not spelled into nesting (the entry's `level` field carries the true level — ORNT-04 honesty lives there). Well-formed chains still reach depth 4 for h6 (UI-SPEC's depth-4 indent case).
- **Change tracking by text, callback by element**: `useSectionSpy` keeps the original's text-based change guard (two same-text headings never re-notify — byte-identical announcer behavior) while invoking `onCurrent(headingElement, detectTimeText)` so the TOC (18-02) can map `data-block-index` → aria-current.
- **Latest-callback ref**: `onCurrent` is stored in a ref inside the hook so the effect deps stay `[articleEl, selector]` — the original's dependency shape — letting consumers pass inline arrows without observer re-registration.
- **requirements-completed: []** — ORNT-04's user-facing half (semantic list/link keyboard + SR navigation) ships in 18-02; this plan proves the data-layer invariants (04-02 PAGE-01 / 10-01 RECV-01 split precedent).

## Deviations from Plan

None — plan executed exactly as written. Two boundary notes:

- **Pre-existing TS error logged, not fixed** (scope boundary): `tests/e2e/ingestion/dexie-migration.spec.ts:715` TS2339 (`provenance` on a narrowed row type) — introduced by Phase 17 commit 83d8f99, unrelated to this plan (nothing there imports toc.ts). Recorded in `deferred-items.md` for the phase ledger; suites unaffected (Vite transform does not type-check).
- **Import path correction**: the plan action said "imports from `../content/normalizeText`" but `src/content/toc.ts` lives in the same directory as the substrate — imports are `./normalizeText` / `./types` (the acceptance criteria's own `./normalizeText` form; the `../content` spelling was the anchor.ts perspective).

## Issues Encountered
None.

## Threat Model Compliance
- **T-18-01 (XSS via heading text): mitigated** — toc.ts is pure data, no DOM/HTML construction; `TocEntry.text` is the same run text the body renders (React text children at the 18-02 render site).
- **T-18-02 (DOM clobbering via invented ids): mitigated** — no string ids invented anywhere; destinations are numeric `blockIndex` + `offset` only (schema carries no heading ids).
- **T-18-SC (package installs): accepted** — zero installs performed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 18-02 (TocPanel) consumes `deriveToc` directly and passes `"h2, h3, h4, h5, h6"` to `useSectionSpy`, mapping the current heading element's `data-block-index` to its aria-current entry (D18-12)
- The `popover="manual"` + hand-rolled Esc + focus-restore seam work is all 18-02 scope (PATTERNS §TocPanel analogs A/B/C)
- No blockers; the pre-existing dexie-migration TS error is cosmetic for e2e and parked in deferred-items.md

## Self-Check: PASSED
- Files: src/content/toc.ts, src/reader/sectionSpy.ts, tests/unit/toc.test.ts, deferred-items.md — all FOUND
- Commits: dbb7897, ceddba5, 104222f — all FOUND in git log

---
*Phase: 18-reader-orientation*
*Completed: 2026-08-30*
