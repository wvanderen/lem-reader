---
phase: quick-260820-beo
plan: 01
subsystem: reading-performance
tags: [performance, pagination, measurement, line-boxes, time-slicing, longtask]
status: complete
requires: []
provides:
  - "Binary-search line walk in readLineBoxes — O(lines × log L) probes per text node, byte-identical LineBox[] (oracle-proven)"
  - "Async time-sliced measureAllBlocks(articleEl, signal, sliceBudgetMs = 10) — yields between ~10ms slices (scheduler.yield structural / setTimeout(0) fallback)"
  - "DEFAULT_SLICE_BUDGET_MS export (10ms ceiling, not a floor)"
  - "Chromium-only longtask e2e tripwire (tests/e2e/measurement/longtask-smoke.spec.ts)"
affects: []
tech-stack:
  added: []
  patterns:
    - "Monotone-predicate binary search over rounded-top line boundaries (all engines lay out lines top-to-bottom)"
    - "Cooperative time slicing with yields BETWEEN slices only (Pitfall 2 read-batching preserved within slices)"
    - "Structural globalThis.scheduler typing (no lib.dom Scheduler dependency, no any) with dynamic per-call reads so test stubs are effective"
key-files:
  created:
    - tests/unit/pagination/lineBoxesBinarySearch.test.ts
    - tests/unit/measurement/domMeasurerSlicing.test.ts
    - tests/e2e/measurement/longtask-smoke.spec.ts
  modified:
    - src/pagination/lineBoxes.ts
    - src/measurement/domMeasurer.ts
    - src/measurement/engine.ts
decisions:
  - "Binary search replaces the per-character prefix scan on a MONOTONE predicate: rounded last-rect tops are non-decreasing in top-to-bottom LTR flow, so the minimal boundary offset the linear scan found is exactly what binary search finds — byte-identical output proven by a test-local replica of the OLD walk as oracle (round-1 discipline)"
  - "Yields are placed AFTER each block whose slice budget elapsed (per plan's literal spec), including a possible trailing yield after the last block — one wasted macrotask, simplest correct shape"
  - "Aborts: signal re-checked before EVERY binary-search probe (readLineBoxes) and after every yield (measureAllBlocks) — mid-walk AbortError contract preserved with lower cancellation latency"
  - "Layout drift between slices is ACCEPTED (never re-read earlier blocks) — the engine epoch/commit guard is the invalidation mechanism; re-reading would reintroduce the re-measure storm"
  - "longtask tripwire observes via entryTypes:[\"longtask\"] (TS-typed classic form) — chromium-only with clean firefox/webkit skips per Pitfall 5 honesty"
metrics:
  duration: "10 min"
  completed: "2026-08-20T13:37:43Z"
  tasks: "3 of 4 (Task 4 = blocking human smoke check, PENDING)"
---

# Quick Task 260820-beo: Fix residual long-article lag round 2 (binary-search line walk + time-sliced measurement) Summary

Eliminated the two remaining ~100k-grapheme-article lag causes: readLineBoxes now binary-searches each line boundary (O(lines × log L) probes, down from O(L) — 201 → ≤47 on the 200-char fixture, oracle-proven byte-identical), and measureAllBlocks is an async ~10ms time-sliced pass that yields to the main thread between slices so a full measurement pass never blocks paint; the overflow guard inherits the probe reduction through the unchanged readLineBoxes signature (symptom B), and page turns/scroll stay paint-free during re-measure storms (symptom A).

## What Was Built

**Task 1 — Binary-search line walk (`d3267e5`)**
- `src/pagination/lineBoxes.ts`: per text node, the walk now finds the minimal prefix offset in (cur, localLen] whose probe has non-empty rects AND a rounded last-rect top differing from the current line's — the predicate is monotone because rounded tops are non-decreasing in top-to-bottom LTR flow (documented in-code). Byte-identical LineBox[] (charOffset/topPx/bottomPx from the boundary probe's own last rect); first-line charOffset-0 and globalBase + i - 1 rules unchanged; abort checked before every probe. Everything else in the file byte-identical (charOffsetToGrapheme, blockNormalizedText, selector-comment block untouched).
- `tests/unit/pagination/lineBoxesBinarySearch.test.ts` (418 lines): richer node-aware schedule mock (per-line fractional tops/heights → plateau expressible, probe counting, onProbe hook), the pre-260820-beo linear walk replicated verbatim as `linearOracleReadLineBoxes`, deep-equality across single/multi-line/plateau/container/empty-rect/surrogate schedules, call-count bound, contract lock, mid-walk + pre-abort.

**Task 2 — Time-sliced async measureAllBlocks + engine await (`8bef7cd`)**
- `src/measurement/domMeasurer.ts`: `export const DEFAULT_SLICE_BUDGET_MS = 10`; module-local `yieldToMain()` reading `globalThis.scheduler` dynamically via structural typing (scheduler.yield when present, setTimeout(0) fallback — no new deps, no `any`); `measureAllBlocks` is async, queries elements once up front, batches reads within a slice, and after each elapsed-budget block yields → re-checks signal → resets sliceStart. Pitfall 2 note + accepted-drift rationale in comments.
- `src/measurement/engine.ts`: sole call site now `const blocks = await measureAllBlocks(...)` — blocks-length defense, epoch commit guard, trusted handler, AbortError classification all run after the await, unchanged. `triggers.ts`, `overflowGuard.ts`, fontGate, Epoch untouched.
- `tests/unit/measurement/domMeasurerSlicing.test.ts` (175 lines): yield spy between blocks (≥ blocks−1 at budget 0), output deep-equals the unsliced expectation, AbortError rejection when aborted inside the yield spy, scheduler-absent fallback resolves, default-budget ceiling; `engine.test.ts` passes UNCHANGED (its sync mock composes with `await`).

**Task 3 — Chromium longtask tripwire + full gate (`d12d54a`)**
- `tests/e2e/measurement/longtask-smoke.spec.ts` (174 lines): PerformanceObserver longtask accumulator via addInitScript across cold open + one adaptive typography warm re-trigger of essay-long-form (trusted-constraints DEV seam); asserts every entry ≤ 150ms and zero pageerrors (V7); `test.skip` on non-chromium with Pitfall 5 honesty comments; honestly scoped as a sync-pass regression tripwire (3k-char fixtures cannot reproduce the 100k article — that is Task 4's job). `tests/e2e/perf/` untouched.

## Task 4 — PENDING (blocking human checkpoint)

Task 4 (`checkpoint:human-verify`, gate=blocking) was **not** attempted per instructions: human smoke on the SAME ~100k-grapheme article that failed the round-1 smoke — continuous scrolling shows no seconds-long blank screens (symptom A), ~10 consecutive page turns each well under 1 second (symptom B), and mode-switch/highlight/reload regressions none (steps in `260820-beo-PLAN.md` Task 4). No dev server was started by the executor (the Playwright run managed its own config-declared webServer lifecycle and shut it down).

## Verification Results

| Gate | Result |
|------|--------|
| Task 1 RED: `vitest run lineBoxesBinarySearch.test.ts` (pre-impl) | ✅ honest RED — call-count test failed (201 probes > 47 bound); 9/10 passed (oracle ≡ old impl pre-change, as designed) |
| Task 1: `vitest run lineBoxesBinarySearch.test.ts lineBoxMapping.test.ts` | ✅ 27/27 passed |
| Task 1: `vitest run tests/unit/pagination/ tests/unit/measurement/engine.test.ts` | ✅ 91/91 passed — existing suite zero edits |
| Task 2 RED: `vitest run domMeasurerSlicing.test.ts` (pre-impl) | ✅ honest RED — 4/4 failed (missing DEFAULT_SLICE_BUDGET_MS export; sync return not a Promise; spy never fired) |
| Task 2: `vitest run domMeasurerSlicing.test.ts engine.test.ts` | ✅ 9/9 passed |
| Task 2: `vitest run` (full unit) | ✅ 1244 passed / 0 failed / 13 documented skips (was 1230 pre-task; +14 new tests; zero edits to existing test files) |
| Task 3: `playwright test longtask-smoke --project=chromium` | ✅ 1 passed — **0 longtask entries, max 0.0ms** (budget 150ms; nothing even crossed the browser's own 50ms longtask threshold), zero pageerrors |
| Task 3: `playwright test longtask-smoke --project=firefox --project=webkit` | ✅ 2 skipped cleanly (chromium-only tripwire) |
| Task 3: `vitest run` (full unit, re-run) | ✅ 1244 passed / 0 failed / 13 skipped |
| `npx tsc --noEmit` | ✅ clean |
| `npm run lint` | ⚠️ exits 1 — **pre-existing** `src/portability/zipSlip.ts` errors only (exactly the 3 documented in 260819-tld deferred-items.md; verified no NEW errors) |
| `npx eslint` on all 6 touched files | ✅ individually lint-clean (0 problems) |
| `git status --porcelain package.json` | ✅ empty (byte-unchanged, no new dependencies) |
| Diff scope vs plan-start (8aca20f) | ✅ exactly the 6 planned files; no deletions in any commit |
| Full e2e matrix | ⏸ deferred to CI/next full run per quick-task scope (only the longtask spec was run; perf.harness + budget.json are locked ACPT-04 artifacts and were NOT run) |

## Deviations from Plan

1. **[Rule 1 - Test-harness fix, Task 2]** The slicing tests initially failed with `range.getClientRects is not a function` — jsdom does not implement `Range.getClientRects`. Fixed in the TEST FILE by installing an empty-rect `document.createRange` stub (the established lineBoxMapping.test.ts convention; with no rects, readLineBoxes deterministically returns [], matching the expectation). Zero production changes.
2. **[Rule 1 - Typing fix, Task 3]** The init script's observer used `observe({ entryType: "longtask" })`; the project's TS lib only types the classic `entryTypes` array form (TS2561). Switched to `observe({ entryTypes: ["longtask"] })` — equally supported in chromium, type-clean.
3. **[Scope boundary, Task 3]** `npm run lint` cannot pass repo-wide due to pre-existing `zipSlip.ts` errors (see Verification table) — documented in 260819-tld `deferred-items.md`, not fixed here.
4. **Minor interpretation**: the plan's mock description said "returns one DOMRect per line the range [0, end) covers" — implemented node-aware keyed on `textNode.data` (required for the container/globalBase case), mirroring the existing node-aware precedent in lineBoxMapping.test.ts.

## TDD Gate Compliance

Both implementation tasks followed RED → GREEN: Task 1's call-count test failed first (201 > 47 on the shipped per-character walk) before the binary-search rewrite; Task 2's suite failed first (4/4: missing export, non-Promise return, spy never fired) before the async slicer landed. Oracle-equivalence tests were green-by-design against the old code (they encode pre-change semantics — the plan's stated purpose) and stayed green through the rewrite. Per the orchestrator's constraint, commits were made atomic per task (`perf`/`test` prefixes) rather than RED/GREEN split commits.

## Threat Flags

None — no new trust-boundary surface. T-beo-01 mitigated exactly as planned (oracle deep-equality + zero existing-test edits + full suite green); T-beo-02 mitigated (slicing + abort-at-yield + longtask tripwire green); T-beo-SC held (package.json byte-unchanged, zero installs); T-beo-03 accepted-drift semantics documented in-code.

## Self-Check: PASSED

All 6 key files exist on disk; all 3 commits (`d3267e5`, `8bef7cd`, `d12d54a`) present in git log; test files meet min_lines (418 ≥ 120, 175 ≥ 60, 174 ≥ 50); no deletions in any commit; `git status` shows no stray untracked/modified code files (only this SUMMARY remains for the orchestrator's docs commit).
