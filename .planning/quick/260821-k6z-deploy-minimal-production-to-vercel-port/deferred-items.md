# Deferred Items — quick-260821-k6z

## 1. Pre-existing `npm run lint` failure in src/portability/zipSlip.ts (out of scope)

- **Discovered:** Task 3 full gate sweep (2026-08-21).
- **Finding:** `npm run lint` exits 1 with 3 errors, ALL in `src/portability/zipSlip.ts`
  (untouched by this task — last changed in commit 9793d1f, Phase 09-01):
  - `34:7` + `76:14` — `no-control-regex`: `\x1f` control chars in regexes (they are
    INTENTIONAL — the zip-slip guard matches crafted filenames containing control chars)
  - `77:16` — `no-useless-escape`: escaped `/` in a regex character class
- **Proof pre-existing:** `git diff HEAD~2 -- src/portability/zipSlip.ts` is empty (file
  byte-identical since before this task); this task's diff touches only api/ingest.ts,
  tests/unit/server/vercel-ingest-endpoint.spec.ts, vercel.json, .gitignore, package.json.
- **Why not fixed here:** the task's hard constraint forbids modifying `src/**`, and the
  executor scope boundary excludes pre-existing failures in unrelated files.
- **This task's files are clean:** `npx eslint api/ingest.ts tests/unit/server/vercel-ingest-endpoint.spec.ts` exits 0.
- **Suggested fix for a follow-up quick task:** add targeted `eslint-disable-next-line
  no-control-regex` (with rationale comment) at the two intentional control-char regexes
  + remove the useless `\/` escape — 3 lines in src/portability/zipSlip.ts, zero behavior
  change.
