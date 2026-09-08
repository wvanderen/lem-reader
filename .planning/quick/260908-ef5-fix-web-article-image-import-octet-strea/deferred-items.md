# Deferred Items — quick task 260908-ef5

## tests/unit/server/normalization.spec.ts — network-dependent flake (out of scope)

Observed one 5s-timeout failure of "extracted sample round-trips to confident
(real publisher HTML through the pipeline)" during an intermediate full
`tests/unit/server/` run while executing Task 2. Investigation:

- The fixture `scripts/source-html/essay-long-form.html` contains 7 real
  remote images (images.aeonmedia.co CDN); `ingest({html})` runs the Phase 20
  asset stage, which performs REAL network fetches in this unit test.
- `ASSET_FETCH_TIMEOUT_MS` is 15s vs the 5s vitest test timeout — the test
  passes with only ~2s of headroom when the CDN is responsive.
- Baseline verified in an isolated temp worktree at the pre-task commit
  50ea94c: passes (3/3 re-runs). Working tree with 260908-ef5 changes:
  passes (3/3 re-runs + full-suite run). The failure is transient network
  variance, not caused by this task's changes.

Deferred: harden this spec by mocking the asset-stage fetch seam (or raising
its timeout), or move the real-network dependency behind a opt-in env flag.
Filed per the executor scope-boundary rule — pre-existing condition, not
touched by 260908-ef5.
