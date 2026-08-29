# Phase 17 Deferred Items

## Pre-existing lint failures (out of scope — 17-01)

- **`src/portability/zipSlip.ts` — 3 eslint errors** (shipped in Phase 09-01,
  commit 9793d1f; verified failing at 17-01 plan-start HEAD 98adadd, so NOT
  caused by Phase 17):
  - `34:7` + `76:14` `no-control-regex` — `\x1f` control chars in regexes
  - `77:16` `no-useless-escape` — unnecessary `\/` escape
  - Whole-file `npm run lint` therefore exits 1 despite all Phase 17 files
    linting clean (`npx eslint <phase-17 changed files>` exits 0).
  - Discovered during 17-01 Task 1 GREEN gate. Left unfixed per the
    scope-boundary rule (pre-existing, unrelated file). Recommend a Rule-1
    cleanup in a later plan (inline-disable comments or regex rewrite).
