---
phase: 07-ingestion-substrate
plan: 02
subsystem: content
tags: [zod, schema, dexie, migration, ingestion, backward-compat, pitfall-9]

# Dependency graph
requires:
  - phase: 01-canonical-article-foundation
    provides: ArticleSchema + Provenance + httpUrl (the trust boundary this plan extends additively)
  - phase: 02-accessible-scrolling-reader
    provides: Dexie v1/v2 declaration blocks (the v3 append target, Pitfall 9 byte-unchanged)
provides:
  - ArticleSourceSchema (z.enum fixture|url|paste — D7-08 origin discriminator)
  - IngestionMetaSchema (derived per-article metadata; extractionConfidence high|low — "unsupported" refused upstream)
  - ArticleSchema.ingestionMeta.optional() (Pitfall 9 backward-compat — v1.0 fixtures hydrate to undefined)
  - Provenance.sourceUrl.optional() (D7-08 — paste-HTML articles omit the canonical URL)
  - Exported httpUrl from schema.ts (single source of truth for the URL-safety refinement)
  - src/ingestion/types.ts envelope schemas (IngestionRequestSchema {url}|{html}, IngestionResponseSchema, IngestionFailureReasonEnum — 11 cataloged reasons)
  - Dexie version(3) append on articles (source + addedAt indexes; NO .upgrade() callback; v1/v2 byte-unchanged)
affects: [07-03, 07-04, 07-05, 07-06, 07-07]

# Tech tracking
tech-stack:
  added:
    - "fake-indexeddb@6.2.5 (devDep, exact-pinned — Node-side IndexedDB for the v3 migration smoke test)"
  patterns:
    - "Pitfall 9 .optional()/.default() additive migration (mirrors ReaderSettings.readingMode precedent at schema.ts L233-237)"
    - "Dexie version(N) APPEND pattern — v1/v2 byte-unchanged, no .upgrade() callback, additive indexes only"
    - "Dexie + fake-indexeddb test pattern: install onto Dexie.dependencies.indexedDB + IDBKeyRange AND globalThis at module-body top level"
    - "Zod 4 API change: .options (not .enum) returns the value array"

key-files:
  created:
    - src/ingestion/types.ts
  modified:
    - src/content/schema.ts
    - src/persistence/db.ts
    - src/routes/ArticleView.tsx
    - tests/unit/ingestion-schema.test.ts
    - package.json
    - package-lock.json

key-decisions:
  - "ArticleSourceSchema enum is CLOSED to fixture|url|paste; future phases widen by adding variants (markdown/pdf/epub-chapter) — forward-compatible"
  - "IngestionMetaSchema.extractionConfidence accepts only high|low — the 'unsupported' three-state outcome (ING-06) is refused at ingest and never reaches persistence; the client sees it as IngestionFailureReason 'extraction-unsupported'"
  - "IngestionFailureReasonEnum catalogs exactly 11 reasons: the 9 pipeline reasons from RESEARCH.md Example 1 + already-in-library (D7-07 dedupe-refuse) + extraction-unsupported (ING-06 three-state)"
  - "Dexie v3 declares NO .upgrade() callback — additive indexes only; Dexie re-indexes on next open without row migration. The articles store wrote ZERO records in v1/v2 (fixtures are bundled JSON); v3 is the first version that writes user rows."
  - "httpUrl exported from schema.ts so src/ingestion/types.ts reuses the SAME refinement (single source of truth — no inline re-declaration)"
  - "fake-indexeddb exact-pinned to 6.2.5 (plan said ^5; v6 is current major; repo convention is exact pin)"

patterns-established:
  - "Pitfall 9 additive optional: new optional schema fields hydrate to undefined for v1.0 rows on read (no migration script, no data wipe) — the ArticleSchema.ingestionMeta + Provenance.sourceUrl changes both use this mechanism"
  - "Dexie v3 APPEND: insert this.version(3).stores({...}) after v2; re-declare unchanged stores (Dexie requires the full stores object); never edit v1/v2 blocks"
  - "Dexie + Node test pattern: set BOTH Dexie.dependencies.indexedDB + IDBKeyRange AND globalThis.indexedDB + IDBKeyRange at module-body top level (Dexie's query path needs IDBKeyRange, not just indexedDB)"

requirements-completed: []  # 07-02 ships the schema + Dexie v3 FOUNDATION only. ING-01/02 (URL + paste ingestion) close at 07-06 (full pipeline + minimal UI); ING-07 (sanitize-then-render through the doc model) closes at 07-04 (mXSS suite + sanitize path). Mirrors the 07-01 split precedent (foundation ships; requirements close at the plan that proves behavior end-to-end).

# Metrics
duration: 15min
completed: 2026-08-11
status: complete
---

# Phase 7 Plan 2: Additive Schema Extensions + Dexie v3 Summary

**Landed the additive schema + envelope + Dexie v3 foundation every Wave-2 ingestion task depends on: `ArticleSourceSchema`, `IngestionMetaSchema`, optional `ingestionMeta` + `sourceUrl` (Pitfall 9 backward-compat), `src/ingestion/types.ts` (request/response envelope + 11-reason failure enum), and the `version(3)` append with `source`+`addedAt` indexes — all green against the full v1.0 suite (547 unit + 1 server passing, tsc 0 errors).**

## Performance

- **Duration:** 15 min wall-clock (951s)
- **Started:** 2026-08-11T02:45:43Z
- **Completed:** 2026-08-11T03:01:34Z
- **Tasks:** 2 (both TDD: RED → GREEN)
- **Files modified:** 7 (1 created, 6 modified)

## Accomplishments
- Extended `src/content/schema.ts` additively with `ArticleSourceSchema`, `IngestionMetaSchema`, exported `httpUrl`, optional `ArticleSchema.ingestionMeta`, and optional `Provenance.sourceUrl` (D7-08). v1.0 fixtures continue to parse identically (Pitfall 9 — `.optional()` hydrates to `undefined` on read).
- Created `src/ingestion/types.ts` exporting the client-side request/response envelope schemas: `IngestionRequestSchema` (`{url}|{html}` union per D7-03), `IngestionResponseSchema` (ok/fail discriminated envelope), `IngestionFailureReasonEnum` (exactly 11 cataloged reasons), plus the inferred types.
- Appended `this.version(3).stores({...})` to `src/persistence/db.ts` adding `source` + `addedAt` indexes to the `articles` store; v1 and v2 declaration blocks byte-unchanged (verified via `git diff`); NO `.upgrade()` callback — additive indexes only (Pitfall 9).
- Widened the `articles!: Table<...>` type annotation to carry the full ingested-row shape (type-only, runtime-unaffected — mirrors the Phase 5 highlights/notes widening precedent).
- Added a 33-case test file (`tests/unit/ingestion-schema.test.ts`) covering all 8 plan behavior cases + 4 v3 Dexie smoke cases (open, re-open, source-index query, no-upgrade-callback structural assertion).
- Fixed a downstream type regression in `ArticleView.tsx` — the "open original" link now renders conditionally when `provenance.sourceUrl` is present (threat T-7-06 mitigation for the D7-08 paste-HTML case).

## Task Commits

Each task followed TDD RED → GREEN discipline (4 commits total):

1. **Task 1 RED: failing tests for schema + ingestion types envelope** — `581bdc0` (test)
2. **Task 1 GREEN: implement additive schema + ingestion envelope types** — `1c996ab` (feat)
3. **Task 2 RED: failing v3 Dexie append smoke test + fake-indexeddb** — `a24b9c3` (test)
4. **Task 2 GREEN: append Dexie version(3) block (source + addedAt indexes)** — `2d30a63` (feat)

**Plan metadata:** this commit (docs: complete schema + Dexie v3 plan)

## Files Created/Modified
- `src/content/schema.ts` — additive: ArticleSourceSchema, IngestionMetaSchema, exported httpUrl, optional ArticleSchema.ingestionMeta, optional Provenance.sourceUrl (D7-08)
- `src/ingestion/types.ts` (created) — IngestionRequestSchema, IngestionResponseSchema, IngestionFailureReasonEnum, inferred types
- `src/persistence/db.ts` — additive: this.version(3) append with source + addedAt indexes on articles; widened articles Table type annotation
- `src/routes/ArticleView.tsx` — conditional render of "open original" link when sourceUrl present (threat T-7-06 mitigation; v1.0 fixtures still render identically)
- `tests/unit/ingestion-schema.test.ts` (created) — 33 cases (8 plan behavior + edge cases + 4 v3 Dexie smoke)
- `package.json` / `package-lock.json` — fake-indexeddb@6.2.5 devDep (exact-pinned)

## Decisions Made
- **ArticleSourceSchema closed enum** — fixture|url|paste now; future phases widen by adding variants (markdown Phase 8, pdf Phase 11, epub-chapter Phase 12) — forward-compatible via later enum widening.
- **extractionConfidence is high|low only at persistence** — the ING-06 "unsupported" three-state outcome is refused upstream (never reaches persistence); the client sees it as the failure envelope reason `extraction-unsupported`. This keeps the persisted schema honest: nothing in the library has confidence "unsupported."
- **Dexie v3 has NO .upgrade() callback** — additive indexes only; Dexie re-indexes on next open without row migration. The articles store wrote ZERO records in v1/v2 (fixtures are bundled JSON); v3 is the first version that writes user rows.
- **httpUrl exported from schema.ts** — single source of truth; `src/ingestion/types.ts` reuses the SAME refinement rather than re-declaring it inline.
- **fake-indexeddb exact-pinned to 6.2.5** — the plan said `^5` but the current major is v6 (the plan's `^5` reflects the research date, not the current registry); pinned to the verified-current exact version per repo convention.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Zod 4 `.enum` returns object map, not value array**
- **Found during:** Task 1 GREEN
- **Issue:** The test used `ArticleSourceSchema.enum` expecting `["fixture","url","paste"]`. In Zod 4, `.enum` is now the object map `{fixture:"fixture",url:"url",paste:"paste"}`; `.options` is the value array. The v1.0 schema.test.ts uses `.enum` but only checks individual key lookups, not array equality.
- **Fix:** Use `ArticleSourceSchema.options` for the array assertion. The `IngestionFailureReasonEnum.options` accessor was already correct in the same file.
- **Files modified:** tests/unit/ingestion-schema.test.ts
- **Verification:** All 29 ingestion-schema tests pass; tsc exit 0.
- **Committed in:** 1c996ab (Task 1 GREEN commit)

**2. [Rule 1 - Bug] ArticleView.tsx type regression after Provenance.sourceUrl.optional()**
- **Found during:** Task 1 GREEN (tsc gate)
- **Issue:** Making `Provenance.sourceUrl` optional broke the downstream consumer at ArticleView.tsx L1051 (`new URL(article.provenance.sourceUrl)`) and L1161 (the `<a href={sourceUrl}>` "open original" link). v1.0 fixtures always supply sourceUrl, but paste-HTML articles (D7-08) omit it.
- **Fix:** Render the "open original" link conditionally when `sourceUrl !== undefined` (the threat T-7-06 mitigation the plan documents). v1.0 fixtures still render identically because they always supply sourceUrl. This is the minimal defensive conditional — the full "hide open-original for paste articles" UI work formally lands in 07-06.
- **Files modified:** src/routes/ArticleView.tsx
- **Verification:** tsc exit 0; all 41 unit test files (547 cases) pass; no visual regression for v1.0 (the conditional is true for every existing fixture).
- **Committed in:** 1c996ab (Task 1 GREEN commit)

**3. [Rule 3 - Blocking] fake-indexeddb needed for v3 Dexie smoke test (test infra)**
- **Found during:** Task 2 RED setup
- **Issue:** The plan called for a v3 migration smoke test using fake-indexeddb "already in node_modules via Dexie's transitive deps OR add as devDep." `npm ls fake-indexeddb` returned empty — not present transitively. The plan said `^5` but the current major is v6.
- **Fix:** Added `fake-indexeddb@6.2.5` as a devDep, exact-pinned per repo convention. npm added `^6.2.5` by default; manually stripped the caret and re-ran `npm install` to sync the lockfile (mirrors the 07-01 Rule 1 exact-pin precedent).
- **Files modified:** package.json, package-lock.json
- **Verification:** `npm ls fake-indexeddb` returns 6.2.5; `grep fake-indexeddb package.json` shows no caret.
- **Committed in:** a24b9c3 (Task 2 RED commit)

**4. [Rule 3 - Blocking] Dexie + fake-indexeddb test pattern needed IDBKeyRange**
- **Found during:** Task 2 RED setup
- **Issue:** Installing `Dexie.dependencies.indexedDB = fakeIndexedDB` alone was insufficient — Dexie's `where()` range-query path also needs `IDBKeyRange`, and `db.deleteDatabase()` reads `globalThis.indexedDB`. Three of the four v3 cases failed with `MissingAPIError: IndexedDB API missing`.
- **Fix:** Install BOTH `indexedDB` and `IDBKeyRange` onto BOTH `Dexie.dependencies` AND `globalThis` at the test module's top level (after imports, before describe). This is the documented Dexie + Node test pattern (Dexie README "Testing with fake-indexeddb").
- **Files modified:** tests/unit/ingestion-schema.test.ts
- **Verification:** All MissingAPIError failures resolved; v3 cases fail for the right RED reason (`expected 2 >= 3`, `KeyPath source not indexed`).
- **Committed in:** a24b9c3 (Task 2 RED commit)

**5. [Rule 1 - Bug] Missing `beforeEach` import after refactoring the helper**
- **Found during:** Task 2 GREEN tsc gate
- **Issue:** After refactoring the fake-indexeddb install helper, `beforeEach(wipeDatabase)` was used in the v3 describe block but `beforeEach` was no longer imported from vitest.
- **Fix:** Added `beforeEach` to the `vitest` import.
- **Files modified:** tests/unit/ingestion-schema.test.ts
- **Verification:** tsc exit 0.
- **Committed in:** 2d30a63 (Task 2 GREEN commit)

---

**Total deviations:** 5 auto-fixed (3 Rule 1 bugs, 2 Rule 3 blockers)
**Impact on plan:** All auto-fixes necessary for type-safety (downstream consumer of optional sourceUrl), correct test infrastructure (Dexie + fake-indexeddb integration), and Zod 4 API correctness. No scope creep — every change is in service of the additive schema + v3 append landing green.

## Issues Encountered
- Dexie 4 captures `indexedDB` on `Dexie.dependencies` at dexie-module-load time. The first RED attempt used only `globalThis.indexedDB = fakeIndexedDB` in `beforeEach` which was too late (Dexie had already captured undefined). Resolved by installing onto `Dexie.dependencies` directly at module-body top level.
- Zod 4 changed `.enum` semantics on `z.enum([...])` schemas (was array, now object map). The fix is `.options` for the array; `.enum` still works for individual key lookups (so v1.0 schema.test.ts is unaffected).

## TDD Gate Compliance

Both tasks executed as `type="auto" tdd="true"` per the plan. Git log shows the mandatory RED → GREEN sequence:

| Plan | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| 07-02 Task 1 | ✓ 581bdc0 | ✓ 1c996ab | — | Pass |
| 07-02 Task 2 | ✓ a24b9c3 | ✓ 2d30a63 | — | Pass |

RED tests failed for the right reasons (imports unresolvable for Task 1; `expected 2 >= 3` + `KeyPath source not indexed` for Task 2). GREEN tests pass minimally — no premature optimization. No REFACTOR needed.

## Next Phase Readiness
- **Wave 1 complete for 07-02.** Schema + envelope + v3 indexes are in place; every Wave-2 task (07-03 SSRF guard, 07-04 extraction, 07-05 orchestrator) can reference `ArticleSchema` with the new ingestionMeta, `IngestionMeta`, `ArticleSource`, and `IngestionRequest`/`Response` directly.
- **07-03 (safeFetch + confidence + slugify):** Uses `IngestionFailureReasonEnum` (referenced in `IngestionResponseSchema`) and the v3 schema (no further schema work needed).
- **07-04 (extraction + sanitize + htmlToBlocks + mXSS suite):** Per the 07-01 HYBRID CONTINGENCY verdict, the runtime target shifts from a Workers Pages Function to a Node-runtime function. The `/server` adapter boundary (D7-05) keeps the logic portable. This plan's schema additions are unaffected.
- **07-06 (edge function adapter + IngestionClient + DexieLibrarySource + minimal UI):** Will use the v3 `source` + `addedAt` indexes (this plan's Task 2) for filter-by-origin and sort-by-recency, and `IngestionResponseSchema` to re-validate server responses. The "hide open-original for paste articles" UI work is already half-landed here (the conditional in ArticleView.tsx).
- **07-07 (phase-exit gates):** The full v1→v3 migration snapshot (SC#5) runs against real Playwright/chromium; this plan's v3 smoke is the unit-level proof that the upgrade chain doesn't break.

## Threat Surface Scan

No new security-relevant surface beyond what the plan's `<threat_model>` documents. The schema additions are additively backward-compatible (Pitfall 9 — v1.0 rows hydrate to `undefined` for new optional fields). The `httpUrl` refinement on `IngestionMeta.sourceUrl` mirrors `Provenance.sourceUrl` (Pitfall 5 — stored XSS defense at the boundary). The `IngestionFailureReasonEnum` is a closed enum (V5 boundary discipline). Threat T-7-06 (sourceUrl optional weakens v1.0 invariant) is mitigated in this plan by the conditional render in ArticleView.tsx.

---
*Phase: 07-ingestion-substrate*
*Completed: 2026-08-11*

## Self-Check: PASSED

**Files verified on disk:**
- FOUND: src/content/schema.ts
- FOUND: src/ingestion/types.ts
- FOUND: src/persistence/db.ts
- FOUND: tests/unit/ingestion-schema.test.ts
- FOUND: .planning/phases/07-ingestion-substrate/07-02-SUMMARY.md

**Commits verified in git log:**
- FOUND: 581bdc0 (Task 1 RED — failing tests for schema + ingestion types envelope)
- FOUND: 1c996ab (Task 1 GREEN — implement additive schema + ingestion envelope types)
- FOUND: a24b9c3 (Task 2 RED — failing v3 Dexie append smoke test + fake-indexeddb)
- FOUND: 2d30a63 (Task 2 GREEN — append Dexie version(3) block)

**Verification gates:**
- `npx tsc --noEmit` → exit 0
- `npx vitest run --project unit` → 41 files / 547 tests passed (incl. 33 ingestion-schema cases)
- `npx vitest run` (unit + server) → 548 passed / 7 skipped (spike) / 19 todo / 0 failed
- All 9 Task 1 acceptance criteria pass (ArticleSourceSchema + IngestionMetaSchema + ingestionMeta + sourceUrl.optional + IngestionRequestSchema + IngestionFailureReasonEnum grep counts ≥ 1; tsc 0; v1.0 schema tests unaffected)
- All 9 Task 2 acceptance criteria pass (version(3) count = 1; version(1) and version(2) count = 1 each; "source, addedAt" present; no real `.upgrade()` chain in v3 block; v1/v2 byte-identical to pre-task state per `git diff`; tsc 0; v3 smoke tests pass; full unit suite green)
