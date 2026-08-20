# Deferred Items — quick-260819-tld

## Pre-existing (out of scope — not fixed per scope-boundary rule)

- **eslint failures in `src/portability/zipSlip.ts`** (landed Phase 09-01, commit 9793d1f —
  before any 260819-tld commit):
  - `34:7` + `76:14` — `no-control-regex`: `\x1f` control chars in the ZIP local-file-header
    signature regexes (intentional byte matching, needs an inline eslint-disable or
    string-based check, not a behavior change).
  - `77:16` — `no-useless-escape`: `\/` escape.
  - Evidence: `git show HEAD~3:src/portability/zipSlip.ts | npx eslint --stdin` reproduces all
    3 errors on pre-change content; the file is untouched by 260819-tld commits.
  - Impact on this task: `npm run lint` exits 1, so the Task 3 gate's lint step cannot pass
    repo-wide. All 5 files touched by 260819-tld are individually lint-clean
    (`npx eslint <the 5 files>` → 0 problems). Full unit suite (1230 passed / 0 failed /
    13 documented skips) and `npx tsc --noEmit` are green.
