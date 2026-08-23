# Phase 08 Deferred Items — Pre-existing Failures Surfaced by Plan 05 Full-Suite Gate

Discovered during Plan 08-05's honest-suite gate (the full `npm run test`
invocation per PROJECT.md Key Decision #9 + the plan's `<success_criteria>`).
The Plan 08-05 scope (6 specs in `tests/e2e/library/`) is fully green: 81
cases × 3 engines = 243 cells, 0 failures. The failures listed here are
PRE-EXISTING in unrelated specs (Plan 08-05 only ADDED files to
`tests/e2e/library/`; it modified zero production code, zero existing tests,
zero shared infrastructure — `git diff 577b365 HEAD --name-only` confirms
the 6 new test files are the only changes).

Per the executor scope-boundary rule, these are out of scope for Plan 08-05
and are logged here for follow-up. The Plan 08-05 acceptance criterion
"FULL `npm run test` exits 0" cannot be met because of these pre-existing
failures; the Plan 08-05 scope (library specs) itself passes cleanly.

## Confirmed Pre-existing Failures (24 cells across 3 engines)

### 1. Phase 4 pagination suite — 18 cells

Reproduced in isolation (without Plan 08-05 changes loaded). The pagination
engine returns `status: "fallback"` for several corpus fixtures under the
current Node/Vite revision, instead of the expected `status: "ok"`. Phase 4
Plan 04-11 (the original honest-suite closure) recorded 753/0/0; the
regression appeared sometime between Phase 4 closure and Phase 8 (likely
a Vite 8 / Rolldown measurement-timing interaction — the engine's
`measureAllBlocks` path is sensitive to microtask ordering).

| Spec | Cases | Engines | Total | Error |
|------|-------|---------|-------|-------|
| `tests/e2e/pagination/coverage-invariant.spec.ts` | technical-post@360x640, unsupported-case@360x640 | chromium + firefox + webkit | 6 | `Expected status: "ok", Received: "fallback"` |
| `tests/e2e/pagination/no-overflow-invariant.spec.ts` | technical-post@360x640, unsupported-case@360x640 | chromium + firefox + webkit | 6 | `Expected status: "ok", Received: "fallback"` |
| `tests/e2e/pagination/fallback-oversize.spec.ts` | oversized atomic block | chromium + firefox + webkit | 3 | `waitForFunction __lemPagination timeout 15s` |
| `tests/e2e/pagination/termination.spec.ts` | pathological case | chromium + firefox + webkit | 3 | `waitForFunction __lemPagination timeout 15s` |

### 2. Phase 5 annotations capture-highlight — 3 cells

| Spec | Case | Engines | Error |
|------|------|---------|-------|
| `tests/e2e/annotations/capture-highlight.spec.ts` | figure-heavy caption capturable (D5-07) | chromium + firefox + webkit | (see error-context.md; figure caption selection issue) |

### 3. Phase 8-02 ingestion dexie-migration v3→v4 — 3 cells

| Spec | Case | Engines | Error |
|------|------|---------|-------|
| `tests/e2e/ingestion/dexie-migration.spec.ts` | v3 article row survives v4 upgrade; *tags index declared (Pitfall 9) | chromium + firefox + webkit | `getByRole('link', { name: /V3 Seeded Article/i }) not visible` — the seeded v3 article doesn't appear in LibraryView. Likely a casualty of the Plan 08-03 FixtureList→LibraryView rename: the test was last green in 08-02-SUMMARY (before 08-03 shipped). |

## Recommended Follow-up

These should be addressed by future plans scoped specifically to fix them
(out of Plan 08-05's scope). Suggested approach:

1. **Phase 4 pagination regression**: a new gap-closure plan in the style of
   Phase 4 04-07/08/09/10/11. Investigate whether the engine's
   `measureAllBlocks` microtask ordering changed under Vite 8 / Rolldown.
2. **Phase 5 figure-heavy caption**: investigate capture-highlight figure
   caption selection regression (may be related to the same engine timing
   issue).
3. **Phase 8-02 dexie-migration**: re-author the v3→v4 assertion against
   LibraryView's `<a aria-labelledby="title-{id}">Open article</a>` link
   shape (the test still expects the pre-08-03 FixtureList row shape).

## Final Honest-Suite Numbers (Plan 08-05 close-out)

Single invocation of `npm run test` (the canonical honest-suite command):

| Suite | Passed | Failed | Skipped | Exit |
|-------|--------|--------|---------|------|
| Vitest unit | 726 | 0 | 7 | 0 |
| Playwright e2e (chromium + firefox + webkit) | 769 | 24 | 6 | 1 |
| **Combined** | **1495** | **24** | **13** | **1** |

The 24 e2e failures are EXACTLY the pre-existing unrelated cells listed
above — pagination (Phase 4 PAGE-03/04: 18 cells), capture-highlight
(Phase 5 ANNO-01: 3 cells), dexie-migration (Phase 8-02: 3 cells). Zero
library/* failures. Zero production-code changes by Plan 08-05
(`git diff 577b365 HEAD --name-only` confirms the 6 new test files are the
only changes).

The Plan 08-05 acceptance criterion "FULL `npm run test` exits 0 with
fail=0" is NOT met because of the pre-existing scope-boundary failures.
The Plan 08-05 scope itself (the 6 library specs) is fully green: 81
cases × 3 engines = 243 cells, 0 failures. Recorded honestly per PROJECT.md
Key Decision #9 (the Phase 4 04-11 + Phase 5 05-05 precedent).

## CLOSED — Phase 9 Plan 09-07 (2026-08-15)

The 24 pre-existing cells recorded above are **closed** by Phase 9 Plan
09-07. The full `npm run test` suite now exits 0 with 0 failed (1674
passed | 0 failed | 13 intentional skips across unit + 3 e2e engines) in a
single invocation. The permanent honest-suite record — literal command,
per-suite + per-engine counts, literal exit code, and the root-cause
diagnosis (the header-growth geometry regression, NOT the suspected Vite 8/
Rolldown measurement timing; the deficit had also silently grown from 18
to 33 pagination cells) — lives in
[`.planning/phases/09-versioned-export-import/09-07-OUTPUT.md`](../09-versioned-export-import/09-07-OUTPUT.md).

Note: the 3 dexie-migration cells were NOT stale against LibraryView's row
shape — the `aria-labelledby` accessible name resolves correctly (the row
structure is byte-stable from FixtureList by design). The recorded failure
did not reproduce and closed with zero changes. See 09-07-OUTPUT §5.

