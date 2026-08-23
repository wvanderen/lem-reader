# Phase 10 Deferred Items

Out-of-scope discoveries logged per the executor scope-boundary rule (not auto-fixed).

| Logged | Plan | Item | Root cause | Suggested owner |
|--------|------|------|-----------|-----------------|
| 2026-08-16 | 10-01 | `npm run lint` reports 3 pre-existing errors in `src/portability/zipSlip.ts` (2× `no-control-regex` at L34/L76, 1× `no-useless-escape` at L77). Plan 10-01 introduced ZERO new violations (none of its files appear in lint output); verified zipSlip.ts was last touched by Phase 9 commit 9793d1f. | Phase 9 zip central-directory guard intentionally matches `\x1f` control bytes; likely needs an eslint-disable-with-rationale or regex refactor | Next lint-touching plan or a `/gsd-quick` chore |
