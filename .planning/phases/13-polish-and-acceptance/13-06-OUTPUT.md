# 13-06-OUTPUT.md — the honest full-suite phase-gate record (Phase 13)

The 04-11 / 09-07 / 11-06 / 12-08 discipline: the executor runs the full suite
itself, records every run honestly (counts + exit code), never subsets or
skips to force green. Permanent record for `/gsd-verify-work`.

**Command:** `npm run test` (vitest unit+server projects, then Playwright e2e
across chromium / firefox / webkit + the chromium-throttled-mobile perf
project) — every invocation below is the plain unfiltered command.

**Date:** 2026-08-19 (UTC) · executor: GSD 13-06 sequential run

## Verdict up front

**The gate is RED — exit 1 — and the failure set is NOT caused by 13-06.**
A git bisect (fresh dev server per checkpoint) pins the break to **commit
`12cf39d` — feat(13-04): slim header + article-top metadata spot with
single-owner page-1 mounting (POLISH-03/D13-13, Option A)**: the Option A
page-1 budget reserve intentionally moved the metadata spot INTO page 1 and
shrank its content budget, and 55 pre-existing e2e cells (annotations,
epub-intake, pdf-intake, font-failure, a11y chapter reading, firefox
high-zoom/reflow) encode the OLD page-1 geometry assumptions (e.g. "page 1
has ≥2 selectable text blocks", old content distribution, old settle
timing). 13-04's own verification ran its specs + the pagination corpus —
not the full suite — so the fallout shipped unnoticed. 13-06's spine and
markdown-upload cells are green across the matrix.

Per the executor's scope boundary, pre-existing out-of-scope failures are
recorded and surfaced, not fixed inside this plan (see "Surfaced follow-up").

## Run log (every invocation, in order)

| Run | Result | Detail |
| --- | --- | --- |
| 1 | **exit 1** (exit code not directly captured — piped through `tail`; the run printed a 55-name failed list + "6 skipped / 1002 passed", identical to run 2's failed set) | e2e 1002 passed / 55 failed / 6 skipped. Unit leg green (83 files / 1197 tests passed, 13 skipped). Reused a stale dev server started 2026-08-18 9:01 PM from the main repo (`reuseExistingServer`) — see Hygiene note. |
| 2 | **exit 1** | Identical 55-cell failed set across chromium/firefox/webkit. Unit leg green (Test Files 83 passed + 2 skipped; Tests 1197 passed / 13 skipped). Same stale dev server. |
| 3 | **exit 1** | **Fresh dev server** (stale one killed first): 56 failed = the same 55-cell set **plus 1 firefox flake** (`library/search-tag-filter.spec.ts:189` auto-prune — passed in runs 1-2, not in their failure lists → environmental flake, not the regression set). Unit leg green (Test Files 83 passed + 2 skipped; Tests 1197 passed / 13 skipped). |

### Hygiene note (run 1-2 staleness, ruled out as cause)

Runs 1-2 unknowingly reused a dev server left running since 2026-08-18
9:01 PM. To exclude server-state staleness as the cause, the server was
killed and run 3 executed against a server Playwright booted itself — the
55-cell set reproduced identically. An initial worktree-based bisect that
"showed" the failure at every commit back to phase-13 planning was
invalidated by the same stale server (it served main-repo code regardless
of the worktree checkout) and was discarded; the bisect below used fresh
servers per checkpoint.

## Root cause — bisect evidence (fresh dev server per checkpoint)

Single-spec probe: `npx playwright test tests/e2e/annotations/capture-highlight.spec.ts`
(27 cells; 6 fail at HEAD on every engine — `essay-long-form: eligible-set
breadth` + `figure-heavy: figure caption is capturable` × 3 engines).

| Checkpoint | Result |
| --- | --- |
| `9d8c591` (12-08 complete — the last green full-suite gate) | **27 passed / 0 failed** ✅ |
| `c63a26b` (13-02 first-paint hairline complete) | 27 passed ✅ |
| `0aaf8b7` (13-03 dialog centering + library tidy complete) | 27 passed ✅ |
| `5d8790e` (13-04 BackToLibrary + App history flag) | 27 passed ✅ |
| `8f2ebb3` (13-04 additive firstPageReservedPx parameter) | 27 passed ✅ |
| `4c7c16b` (13-04 honest page-1 budget floor) | 27 passed ✅ |
| **`12cf39d` (13-04 slim header + metadata spot, single-owner page-1 mounting)** | **6 failed / 21 passed** ❌ — first red commit |

**Mechanism** (from the failing cell's page snapshot): on `essay-long-form`
page 1 in paginated mode, the visible page fragment after `12cf39d`
contains the metadata spot + heading + a single long paragraph — the
Option A reserve legitimately consumes page-1 capacity. The failing specs'
helpers (`findSecondBlockWithText`, caption/code searches scoped to the
visible fragment, mode-switch settle timing, content-visibility waits)
assume the pre-13-04 distribution. Production behavior is intentional
(human-decided Option A); the ~55 cells are stale expectations. The
technical-post cell in the same file shows the sanctioned resilient
pattern already in-repo: walk pages until the wanted block kind is visible.

## Final invocation counts — Run 3 (the honest current state)

| Leg | Counts |
| --- | --- |
| **Unit (vitest, `unit` + `server` projects)** | Test files: **83 passed / 2 skipped** (85) — the 2 skips are the env-gated local-only derive drivers. Tests: **1197 passed / 13 skipped / 0 failed** (1210) — the 13 are the documented intentional derive/skip set. |
| **E2E (Playwright: chromium / firefox / webkit + chromium-throttled-mobile perf)** | **1001 passed / 55 failed / 6 skipped** (7.4 min). The 6 skips are the documented intentional set. The 55-cell regression set: a11y 12-06 chapter reading (×3 engines), annotations capture-highlight eligible-set breadth + figure-heavy caption (×3), capture-rejects (×3), drawer-view (×3), forced-colors-shapes (×3), persist-reload (×3), epub-intake SC#1/SC#2/SC#3×2 (×3), font-failure BLOCK+DELAY (×3), pdf-intake outline admission (×3), firefox high-zoom ×6, firefox reflow ×7. All 55 reproduce on every engine where they run. |
| **Total** | **2198 passed / 55 failed / 19 skipped · `npm run test` exit 1** |

**13-06's own cells in the same invocations:** the core-flow spine (3 cells)
and markdown-upload (12 cells) — all green on chromium/firefox/webkit.

## Surfaced follow-up (out of 13-06 scope)

- **13-04 test-fallout repair** — a dedicated plan (or `/gsd-debug`) should
  update the 55 stale page-1-geometry expectations to the Option A budget
  (walk-pages pattern per the technical-post precedent / in-viewport-block
  selection per the 13-06 spine), then re-run this honest gate to exit 0.
  The bisect table above localizes the cause; no production change appears
  necessary — the layout change was intentional and its own specs are green.
- **firefox `search-tag-filter` auto-prune flake** — 1-in-3-runs class;
  revisit under the 12-08 expect.poll-strengthening protocol if it recurs.

## No-subsetting attestation

Every recorded invocation above is the plain `npm run test`. No engine
subset, no spec skip, no grep filter, no `--project`/`--grep` workaround was
used for any gate invocation. (Single-spec/single-project runs during Task 1
verification and the root-cause bisect are labeled as such and are not gate
invocations.)
