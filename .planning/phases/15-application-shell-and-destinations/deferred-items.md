# Phase 15 Deferred Items

Out-of-scope discoveries logged per the executor scope-boundary rule (pre-existing issues in files this phase's plans do not touch — do NOT auto-fix).

## 15-03 (2026-08-26)

- **`npm run lint` fails on `src/portability/zipSlip.ts`** — 3 pre-existing errors (`no-control-regex` ×2 at L34/L76, `no-useless-escape` at L77), introduced in Phase 9 (commit 9793d1f, Plan 09-01), untouched by Phase 15. All Phase 15-03 files lint clean (`npx eslint src/ingestion/library/librarySession.ts src/App.tsx tests/unit/library/library-session.test.ts tests/e2e/library/library-restore.spec.ts` → 0 problems). Note: the plan's Task 2 `<verify>` says `npm run lint`; the failures above are unrelated to this plan's diff. If a phase gate (15-04) requires a green full lint, this needs a scoped fix or an inline eslint-disable with justification in a dedicated commit.
