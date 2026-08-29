---
phase: 17-reader-owned-metadata
plan: 01
subsystem: content-model
tags: [zod, schema, dexie, metadata, overrides, article-schema]

requires:
  - phase: 14-navigation-and-library-contracts
    provides: D14-20 one-derivation-point pure-module precedent (readingState.ts)
  - phase: 07-url-ingestion-pipeline
    provides: ArticleSchema optional-field hydration mechanism (ingestionMeta) + Pitfall 9 Dexie additive discipline
provides:
  - ArticleSchema readerTitle/readerAuthor optional min(1) override fields (and the same keys on inferred CanonicalArticle)
  - The ONE effectiveTitle/effectiveAuthor derivation module every Phase 17 surface consumes (META-02 structural guarantee)
  - Dexie articles stored-row type widening readerTitle?/readerAuthor? with the documented no-bump rationale (OQ3 Option A)
  - Unit truth-table proof of the META-01/META-03 substrate (round-trip, strip-mode guard, empty-string rejection, v5-row hydration)
affects: [17-02 edit dialog + row affordance, 17-03 surface consumption, 17-04 bundle v3 + conflicts, 17-05 migration + cross-surface e2e]

tech-stack:
  added: []
  patterns:
    - "Reader-owned overrides are schema-declared optional fields ON ArticleSchema (D17-12) — the bookId strip-mode trap is structurally avoided (undeclared keys are stripped on every safeParse read)"
    - "One derivation point per display truth: effectiveMetadata.ts is the only place readerTitle ?? provenance.title is ever computed"
    - "Non-indexed Dexie row fields land bumpless (only indexed properties need version-block declaration; ingestionMeta precedent) — v1..v5 blocks byte-unchanged"

key-files:
  created:
    - src/ingestion/library/effectiveMetadata.ts
    - tests/unit/library/effective-metadata.test.ts
  modified:
    - src/content/schema.ts
    - src/persistence/db.ts
    - tests/unit/ingestion-schema.test.ts

key-decisions:
  - "Overrides declared in ArticleSchema (not bookId strip-mode, not a separate table) so they survive the Zod strip-mode read boundary and ride the export bundle automatically (D17-12; RESEARCH Pattern 1)"
  - "No Dexie version bump for override fields — non-indexed row fields need no version-block declaration; the ingestionMeta bumpless precedent + db.ts rationale comment document why (RESEARCH OQ3 Option A)"
  - "min(1) on both override fields makes the blank-override state unrepresentable at the schema boundary (D17-04) — clearing an override must DELETE the key, never write an empty string (Pitfall 2 row-poison guard)"
  - "requirements-completed is [] — this plan ships the substrate only; META-01/META-03 close at the end-to-end plans (17-02 edit UI, 17-03 surfaces, 17-05 migration e2e), mirroring the 04-02 PAGE-01 / 09-01 PORT-01 / 10-01 RECV-01 split precedent"

patterns-established:
  - "Override-field landing discipline: additive-optional schema fields + phase-tagged comment citing the Pitfall 9 hydration mechanism + row-type widening with no-bump rationale"
  - "Pure derivation module shape: readingState.ts banner discipline (decision citation, consumer list, type-only imports, zero I/O/React)"

requirements-completed: []

duration: 5 min
completed: 2026-08-29
status: complete
---

# Phase 17 Plan 01: Reader-Owned Metadata Substrate Summary

**ArticleSchema readerTitle/readerAuthor optional min(1) override fields + the one pure effectiveTitle/effectiveAuthor derivation module + bumpless Dexie row-type widening, with the META-01/META-03 substrate proven at the unit boundary**

## Performance

- **Duration:** 5 min
- **Started:** 2026-08-29T23:33:24Z
- **Completed:** 2026-08-29T23:38:08Z
- **Tasks:** 2
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- ArticleSchema carries the two reader-owned override fields (`z.string().min(1).optional()`) placed after `tags`, with the phase-tagged comment discipline — Provenance and every existing field byte-unchanged (META-01)
- `src/ingestion/library/effectiveMetadata.ts` ships the ONE derivation (effectiveTitle/effectiveAuthor) on the D14-20 readingState.ts precedent — pure, zero I/O, zero React, provenance read exactly twice (the two fallback reads)
- `db.ts` articles Table row type widened with `readerTitle?: string` / `readerAuthor?: string` and the no-bump rationale comment (non-indexed fields; ingestionMeta precedent; v1..v5 blocks byte-unchanged, no upgrade callback — OQ3 Option A)
- Unit truth table (8 cases) + ingestion-schema strengthen-only extension (4 cases): strip-mode round-trip guard, provenance deep-equality, empty-string rejection for BOTH fields, v5-row hydration to undefined

## Task Commits

Each task was committed atomically (Task 1 via full TDD cycle):

1. **Task 1: ArticleSchema override fields + db.ts type widening + effectiveMetadata module** - `2d52fb2` (test: RED — failing contract tests) + `5b67891` (feat: GREEN — the three production edits)
2. **Task 2: Derivation truth-table + strip-mode + hydration unit coverage** - `f1cb25d` (test: strengthen-only extension, no production changes)

**Plan metadata:** (final docs commit below)

## TDD Gate Compliance

Task 1 (`tdd="true"`) followed RED → GREEN with both gate commits present in order:
- RED: `2d52fb2` `test(17-01):` — 6 failing tests (module-missing import failure + schema-strips-unknown-key failures; run exited FAIL as required)
- GREEN: `5b67891` `feat(17-01):` — same tests + existing schema suite green

Task 2 (`tdd="true"`) is the test-strengthening task per the plan's explicit structure ("No production changes in this task") — its coverage builds on the already-green implementation, committed as `test(17-01):`.

## Files Created/Modified
- `src/content/schema.ts` — readerTitle/readerAuthor optional min(1) fields after tags (inferred CanonicalArticle widens automatically; Provenance untouched)
- `src/persistence/db.ts` — articles Table row-type widening + no-bump rationale comment (version blocks untouched)
- `src/ingestion/library/effectiveMetadata.ts` (NEW) — effectiveTitle/effectiveAuthor, the ONE derivation
- `tests/unit/library/effective-metadata.test.ts` (NEW) — 8-case truth table + boundary guards
- `tests/unit/ingestion-schema.test.ts` — +4 strengthen-only cases (both-overrides parse, v5 hydration, blank rejection ×2)

## Decisions Made
- **Schema-declared optional fields, NOT the bookId strip-mode precedent** — every Dexie read runs `ArticleSchema.safeParse` and Zod 4 strips unknown keys, so a denormalized-only column would be invisible; declaring in ArticleSchema also makes D17-12's ride-inside-the-bundle automatic (RESEARCH Pattern 1; Pitfall 1 structurally avoided)
- **No Dexie version bump (OQ3 Option A)** — only indexed properties require version-block declaration; no Phase 17 query keys on overrides; the ingestionMeta precedent landed bumpless; rationale documented in db.ts
- **`rg -c 'provenance'` == 2 on effectiveMetadata.ts** — module comments deliberately use "canonical" wording so the acceptance grep proves no derivation code besides the two fallback reads exists
- **requirements-completed: []** — substrate-only plan; META-01 ("reader can edit") and META-03 ("reader can clear") require the 17-02 dialog/Reset UX and close there + 17-03/17-05, per the established split precedent

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed
**Impact on plan:** N/A

## Issues Encountered
- **Pre-existing lint failures (out of scope, logged to `deferred-items.md`):** `npm run lint` exits 1 on 3 errors in `src/portability/zipSlip.ts` (`no-control-regex` ×2 at 34:7/76:14, `no-useless-escape` at 77:16) — verified failing at plan-start HEAD `98adadd` (shipped in Phase 09-01, commit 9793d1f), so NOT caused by Phase 17. All Phase 17 changed files lint clean (`npx eslint <changed files>` exits 0). Left unfixed per the scope-boundary rule.

## Verification Results

| Gate | Command | Result |
|------|---------|--------|
| Targeted tests | `npx vitest run tests/unit/library/effective-metadata.test.ts tests/unit/ingestion-schema.test.ts` | 71/71 passed, exit 0 |
| Full unit suite (honest gate) | `npm run test:unit -- --run` | 1315 passed / 0 failed / 13 intentional skips (92 files), exit 0 |
| Typecheck | `npx tsc` | exit 0 |
| Lint (changed files) | `npx eslint src/content/schema.ts src/persistence/db.ts src/ingestion/library/effectiveMetadata.ts tests/unit/library/effective-metadata.test.ts` | exit 0 |
| Lint (whole repo) | `npm run lint` | exit 1 — 3 PRE-EXISTING zipSlip.ts errors (see Issues; deferred) |
| Provenance byte-stability | `git diff 98adadd HEAD -- src/content/schema.ts` | only the two fields + comment after tags; Provenance block untouched; canonical `title: z.string().min(1)` count unchanged (2) |
| db.ts byte-stability | `git diff 98adadd HEAD -- src/persistence/db.ts` | only the Table-type widening; zero changes inside version(1)..version(5); no `upgrade(` added |
| Module purity | `rg -c 'provenance' src/ingestion/library/effectiveMetadata.ts` | 2 (only the two fallback reads) |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Substrate complete for 17-02 (edit dialog + row affordance consuming the derivation), 17-03 (surface swaps), 17-04 (bundle v3 — overrides ride ArticleSchema composition automatically), 17-05 (hydration-without-write-back migration proof)
- Blockers: none. The deferred zipSlip.ts lint debt is cosmetic and tracked in `deferred-items.md`.

---
*Phase: 17-reader-owned-metadata*
*Completed: 2026-08-29*

## Self-Check: PASSED

All key-files exist on disk; all four task/metadata commits verified in git log (2d52fb2, 5b67891, f1cb25d, 1945157); all acceptance criteria and plan-level verification gates recorded above with honest results.
