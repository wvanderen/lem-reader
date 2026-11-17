# Whole-article cold-open longtask fix — 2026-11-16

Implements the fix direction from the root-cause comment on
[issue #303](https://github.com/wvanderen/lem-reader/issues/303#issuecomment-6931687753):
keep #301's reader-facing wins (whole-work numbering, responsive turns), restore
the 260820 slicing invariant for oversized whole-article windows. The 250 ms
giant-article budget and the assertions in `longtask-smoke.spec.ts` are
unchanged; nothing was recalibrated.

## Root cause (from the #303 comment, confirmed locally)

PR #301 commit `25d1fc5` admits works up to 256k graphemes as ONE whole-work
scope (`MAX_WHOLE_ARTICLE_GRAPHEMES`, replacing the derived 72k bound). The
giant-article fixture (~170k graphemes) flipped from tiled windows to a single
window, and the hidden measurement projection for that scope mounted its
entire DOM in one synchronous React pass. A CDP profile of the cold open on
the Linux dev host attributed the longtask (414–436 ms there) to:

- `exports.jsxDEV` + React commit — the whole 570-block projection render
  (~220 ms locally), the post-#301 regression component;
- `graphemeClusters` (~99 ms) — the per-article D-05 index build inside
  `canUseBlockWindows`, pre-existing and cached (part of the pre-#301 healthy
  baseline);
- app boot (~120 ms, dev-server transforms included) — pre-existing.

The measured pass itself is already time-sliced (`measureAllBlocks`, ~10 ms
slices: 160 ms total, no longtask) and `paginateDocument` is ~3 ms — neither
is the bottleneck. The regression is exclusively the synchronous mount.

## Fix

- `src/pagination/blockWindow.ts` — `coldMountChunks(article, window)` plus
  `WHOLE_ARTICLE_MOUNT_BOUND_GRAPHEMES` (the pre-#301 derived bound, 72,000).
  Above the bound the window's projection mounts in block-aligned body chunks
  followed by row-aligned footnote chunks (tiled-window capacities per chunk,
  never cutting a block or note row — the engine's scope alignment counts
  rows). At or under the bound it returns null: the projection mounts whole,
  byte-identical to the pre-fix path. Unit contract:
  `tests/unit/pagination/coldMountChunks.test.ts`.
- `src/reader/WindowedPaginatedSurface.tsx` — an oversized scope mounts one
  chunk per cooperative yield (`yieldToMain`, now exported as the ONE yield
  primitive), and `useMeasurement` receives the window only once the
  projection is fully mounted, so `measureScopeNow()` never fires against a
  partial projection. The scope itself — and therefore whole-work numbering —
  is exactly what `readingWindows` admitted.
- Fully mounted, the chunked tree is identical to the whole-scope projection:
  `ArticleBody` renders a fragment (no wrapper element), so sibling chunks
  concatenate to the same DOM inside `.article-body-measurement`.

## Local verification (Linux dev host)

- Giant-article tripwire (`longtask-smoke.spec.ts`, chromium, `--workers=1
--retries=0`): max longtask 414 ms pre-fix → **217–231 ms across 6 runs
  post-fix**, all green under the unchanged 250 ms budget. The chunk walk
  shows as 23 sub-budget tasks in the profile.
- Full unit suite: 4499 passed, 0 failed.
- `tests/e2e/measurement` + `tests/e2e/pagination`: 176 passed on chromium
  (including #301's `scope-scheduling` responsiveness spec); 173 passed + 1
  flake (re-passed standalone) + 4 engine-skips on firefox.
- `tests/e2e/collections` + `tests/e2e/annotations` +
  `open-every-fixture.spec.ts`: 17 failures, **all reproduced on pristine
  `origin/main`** (16 in `held-number-selection.spec.ts`, 1 in
  `note-placement.spec.ts`) — pre-existing local Linux divergence, not this
  change; the reference Mac's CI passed them in the #302 run cited by #303.

## Calibration and performance harnesses (CONTRIBUTING.md rule)

CONTRIBUTING.md requires `npm run calibrate` + `npm run perf` for pagination/
measurement changes before merging. Run on this host (Linux dev box, Node 22
via mise, low load):

- `calibrate` harness: **passed on chromium + firefox** (host lanes). WebKit
  is launch-blocked here (container lane needs Docker; the daemon came up
  `inactive`/`disabled` after the machine rebooted mid-session, and the
  docker group needs a re-login — host changes requiring the user's
  approval, deliberately not forced). `fingerprint.compare.ts` was
  therefore not run: it requires every engine present in the committed
  fingerprint (a missing engine false-fails and would rewrite the committed
  artifact). This change does not touch Pretext dispatch or eligibility
  (domMeasurer edit is an export), so the calibration outcome is expected
  unchanged; nightly reference CI owns the authoritative three-engine gate.
- `perf` harness: **passed on chromium + firefox + chromium-throttled-mobile**.
  `budget.compare.ts` flags five cold cells (e.g. essay-long-form desktop
  638ms vs 600ms; throttled-mobile cold 6.4s vs 800ms) — **reproduced
  identically on pristine `origin/main`** (detached-checkout run: 642ms /
  6.9s / 66ms / 70ms), i.e. pre-existing environment divergence (the
  locked budgets are Mac-calibrated), not this change. No budget was
  modified (budgets are user-approved per AGENTS.md).

## Limits

- **Not macOS validation.** The Linux dev host reads ~1.6–1.8× the Mac's
  longtask numbers (414 ms local vs 237–291 ms Mac for the same regression);
  the post-fix Mac expectation is the healthy ~130–150 ms band, but the
  e2e-reference gate on the Mac remains authoritative and has not yet run on
  this branch — that PR check is the spec's outstanding acceptance step.
- **Residual unsliced class: single-row oversized works.** A one-block work
  of 72k–256k graphemes is admissible whole (#301's unchanged bounds) and
  `coldMountChunks` deliberately returns null for it: chunking would require
  cutting the row mid-block, which changes the row count the engine's scope
  alignment counts (the tiled path's intra-block continuations are exactly
  the pre-#301 mechanism that sacrifices whole-work numbering here). The
  behavior is pinned by a unit test ("a single giant block keeps row
  integrity"). Slicing that class without losing numbering needs
  engine-level partial-row measurement — follow-up work, not silently
  widened scope. Today's giant tripwire fixture (570 ordinary blocks) does
  not exercise this shape.
- **Per-turn immediate measures** (the comment's "deserve a look"): locally,
  the maximum longtask entry in every post-fix run was the cold-open task
  itself (217–231 ms); the turn/mode-switch/scroll entries stayed below it
  and the whole flow produced zero over-budget entries across 6 runs. The
  comment's own assessment (65–130 ms, within budget) held; no change made.
- The pre-existing cold-task costs (boot, per-article grapheme index build)
  are untouched; they predate #301 and sit inside the accepted baseline.
