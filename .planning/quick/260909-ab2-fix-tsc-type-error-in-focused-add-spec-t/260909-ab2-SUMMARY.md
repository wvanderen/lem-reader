---
id: 260909-ab2
title: Fix tsc type error in focused-add.spec.ts breaking the Vercel prod build
completed: 2026-09-09
status: complete
commit: 27d229c
---

# Summary

## What was done

The production deploy (Vercel, Node 22.22.3) failed on `npm run build`: the `tsc` step
errored with TS2339 at `tests/e2e/library/focused-add.spec.ts:377` — the close-then-navigate
case asserted the reader's h1 via `fixtureArticle.title`, but `CanonicalArticle` carries the
title under `provenance.title`. Commit 109fb3d introduced the case and shipped without a
typecheck pass.

One spec-side line fixed it: `fixtureArticle.title` → `fixtureArticle.provenance.title`
(matching the accessor used by 40+ references across the e2e and unit suites). No production
code changed; runtime behavior is identical — Playwright never runs `tsc`, so the case had
passed in e2e runs and only surfaced in the build.

## Verification

- `npm run build` exits 0 locally on Node 22.22.3 (same runtime as Vercel) — vite build
  produces dist cleanly; the >500 kB chunk warning is pre-existing and non-fatal
- `npx tsc --noEmit` exits 0
- `npx eslint tests/e2e/library/focused-add.spec.ts` exits 0

## Notes

- Deploy unblock: push `27d229c` and re-run the Vercel deployment
  (https://vercel.com/william-van-der-ens-projects/lem-reader/7uz6TDSmcK9pLJoWKcb78opcjWE4)
- Process gap worth noting: commits touching tests/src should get a `tsc --noEmit` pass
  before landing — the build script's `tsc` gate only runs at deploy time
