---
phase: quick-260820-beo
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/pagination/lineBoxes.ts
  - src/measurement/domMeasurer.ts
  - src/measurement/engine.ts
  - tests/unit/pagination/lineBoxesBinarySearch.test.ts
  - tests/unit/measurement/domMeasurerSlicing.test.ts
  - tests/e2e/measurement/longtask-smoke.spec.ts
autonomous: false
requirements: [QUICK-260820-BEO]
must_haves:
  truths:
    - "readLineBoxes performs O(lines × log L) Range.getClientRects probes per text node instead of O(L) — a ~100k-grapheme article's full measurement pass drops from 100k+ rect queries to ~12–15k, and the overflow guard's per-correction re-read drops with it (symptom B: page turns no longer stall 5–10s)"
    - "A full measurement pass never blocks paint for seconds — measureAllBlocks processes blocks in ~10ms time-sliced chunks, yielding to the main thread between slices (symptom A: no blank unpainted screens while scrolling during re-measure storms)"
    - "Every LineBox charOffset is byte-identical to the current linear algorithm — a test-local replica of the OLD linear walk serves as the oracle and deep-equals the new binary-search output across diverse schedules; the full existing unit suite passes with ZERO edits to existing test files"
    - "Abort semantics are preserved exactly — AbortError before the walk, per-probe during the walk (readLineBoxes), and between slices (measureAllBlocks); the engine's silent-cancel classification is untouched"
    - "The read-phase batching discipline (Pitfall 2) holds per slice — DOM reads stay batched within a slice, yields happen only BETWEEN block slices, and the pass performs zero DOM writes"
    - "package.json is byte-unchanged (no new dependencies); zero changes to the D-05 offset contract, persisted data, schemas, fragment.ts pagination math, widowRules, splitBlock, or the renderer"
  artifacts:
    - path: "src/pagination/lineBoxes.ts"
      provides: "Binary-search line walk in readLineBoxes — per text node, finds each next line boundary as the minimal prefix offset i whose rounded last-rect top differs from the current line's, replacing the per-character prefix scan. Exported signature readLineBoxes(el, fullText, signal): LineBox[] UNCHANGED"
      contains: "readLineBoxes"
    - path: "src/measurement/domMeasurer.ts"
      provides: "Async, time-sliced measureAllBlocks(articleEl, signal, sliceBudgetMs = 10): Promise<BlockMeasurement[]> — yields to the main thread (scheduler.yield when available, setTimeout(0) fallback) between block slices, re-checks signal.aborted after each yield"
      contains: "yieldToMain"
    - path: "src/measurement/engine.ts"
      provides: "engine.run awaits the now-async measureAllBlocks; the 1:1 blocks-length defense and epoch commit guard run after the await, unchanged"
      contains: "await measureAllBlocks"
    - path: "tests/unit/pagination/lineBoxesBinarySearch.test.ts"
      provides: "Byte-identical equivalence proofs (old linear walk replicated as test-local oracle vs the new binary search, over single/multi-line, rounded-top plateau, multi-text-node container, empty-rect, and surrogate-pair schedules) + getClientRects call-count bound proving the O(lines × log L) reduction + mid-walk abort coverage"
      min_lines: 120
    - path: "tests/unit/measurement/domMeasurerSlicing.test.ts"
      provides: "Slicing behavior proof: yields occur between blocks (scheduler.yield spy via globalThis stub), output deep-equals the unsliced expectation, AbortError rejects the promise when aborted at a yield point, scheduler-absent fallback resolves"
      min_lines: 60
    - path: "tests/e2e/measurement/longtask-smoke.spec.ts"
      provides: "Chromium-only long-task tripwire: PerformanceObserver longtask entries collected across cold open + one typography warm re-trigger of essay-long-form; asserts no longtask over 150ms and zero pageerrors (V7 mirror)"
      min_lines: 50
  key_links:
    - from: "src/measurement/domMeasurer.ts"
      to: "src/pagination/lineBoxes.ts"
      via: "measureAllBlocks calls readLineBoxes(el, fullText, signal) per block — signature unchanged, so the slicer composes with the binary-search walk without either knowing about the other"
      pattern: "readLineBoxes"
    - from: "src/measurement/engine.ts"
      to: "src/measurement/domMeasurer.ts"
      via: "const blocks = await measureAllBlocks(...) — the only call site; the fire-and-forget void engine.run() hook invocation needs no change"
      pattern: "await measureAllBlocks"
    - from: "tests/unit/pagination/lineBoxesBinarySearch.test.ts"
      to: "src/pagination/lineBoxes.ts"
      via: "replicates the OLD per-character linear walk as the oracle and asserts the shipped binary search produces deep-identical LineBox[] against the same mocked Range schedules (round-1 replica-oracle discipline)"
      pattern: "linearOracle"
    - from: "src/pagination/overflowGuard.ts"
      to: "src/pagination/lineBoxes.ts"
      via: "refragmentOverflowingPage calls readLineBoxes on the live fragment per guard iteration — UNTOUCHED file that inherits the binary-search speedup through the unchanged signature (this is how symptom B is fixed)"
      pattern: "readLineBoxes"
---

<objective>
Fix the two remaining long-article lag bottlenecks (~100k-grapheme article, round 2 after
260819-tld's segmentation caching):

- **Root cause 1** — `readLineBoxes` (src/pagination/lineBoxes.ts:151-176) probes EVERY prefix
  length i in 0..localLen per text node: a 500-char paragraph = 501 Range.getClientRects
  queries. ~100k+ rect queries per measurement pass; multi-second long tasks. This also
  multiplies every overflow-guard correction iteration (symptom B: page turns stall 5-10s).
- **Root cause 2** — the measurement pass runs synchronously on the main thread
  (measureAllBlocks), and re-fires on every image-load/resize trigger after a 400ms debounce.
  While it runs, paint is blocked for seconds → the user scrolls into blank unpainted screens
  (symptom A).

Fixes: (1) binary-search line walk producing byte-identical LineBox[] at O(lines × log L)
cost; (2) cooperative time-sliced measurement pass that never blocks paint. The overflow
guard and page turns inherit fix (1) automatically through the unchanged signature.

**Explicit decision — fix direction item 3 (image-load re-measure reuse cache) is REJECTED
as unnecessary complexity**, per the delegated discretion: a width-keyed WeakMap cache of
line boxes is (a) incorrectly keyed if keyed on width alone — font/size/spacing changes
alter line breaks at CONSTANT width (Constraints carries all four; the only true hit case
is the height-only image-settle re-trigger); (b) shipping stale viewport-relative
topPx/bottomPx into MeasurementResult is a latent hazard — fragment.ts/widowRules.ts
consume translation-invariant deltas today, but overflowGuard.ts:301 compares LIVE absolute
bottoms (it reads its own live boxes, unaffected either way), and any future absolute-
coordinate consumer would silently break; (c) made redundant by fixes 1+2: a post-fix full
pass over 100k graphemes is ~1.2k lines × ~10 probes ≈ ~12k rect reads ≈ tens of ms —
comfortably inside the ~150-200ms budget even before slicing, and slicing removes the paint
blockage entirely. Simplest combination that meets the budget = binary search + time
slicing; triggers.ts is NOT touched.

Purpose: restore the calm-reading product promise on long articles — measurement work must
never block paint, and page turns must stay instant for exactly the accessibility-first
audience this prototype serves.

Output: two hot-path modules rewritten in place (signatures stable), one one-word engine
change, three new test files (equivalence + call-count + slicing + longtask tripwire),
and a blocking human smoke check on the real ~100k article.
</objective>

<execution_context>
@/Users/eggfam/.config/opencode/gsd-core/workflows/execute-plan.md
@/Users/eggfam/.config/opencode/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md

# Round 1 (what is already cached — do not re-touch those files)
@.planning/quick/260819-tld-fix-long-article-lag-cache-intl-segmente/260819-tld-SUMMARY.md

# Hot-path sources (read-first — every change is in-place in these files)
@src/pagination/lineBoxes.ts
@src/measurement/domMeasurer.ts
@src/measurement/engine.ts

# Callers/consumers that must NOT be modified (they inherit the speedup via unchanged signatures)
@src/measurement/triggers.ts
@src/pagination/overflowGuard.ts
@src/pagination/fragment.ts

# Type contracts (LineBox, BlockMeasurement — unchanged by this task)
@src/measurement/types.ts

# Test conventions to mirror (range-schedule mock discipline + replica oracles)
@tests/unit/pagination/lineBoxMapping.test.ts
@tests/unit/grapheme-index-cache.test.ts

# e2e harness conventions to mirror (image stub + IDB wipe + trusted-hook seam + Pitfall 5 project honesty)
@tests/e2e/perf/perf.harness.spec.ts
@tests/e2e/measurement/stale-drop.spec.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Binary-search line walk in readLineBoxes (byte-identical, O(lines × log L))</name>
  <files>src/pagination/lineBoxes.ts, tests/unit/pagination/lineBoxesBinarySearch.test.ts</files>
  <behavior>
    - Test (RED driver): with a mocked Range whose getClientRects is instrumented to COUNT calls, a 200-char single-text-node schedule with 4 line breaks must complete with call count ≤ (lines × ceil(log2(len)) + lines + 2) — the current per-character implementation does len+1 = 201 calls and FAILS this bound; the binary-search implementation must pass it while producing the same LineBox[].
    - Test (equivalence): a test-local ORACLE replicating the CURRENT linear algorithm verbatim (per-prefix scan, same rounding rule, same charOffset rule) and the new implementation run against IDENTICAL mocked schedules must deep-equal: single line; multi-line ASCII (e.g. breaks at 0/7/14); a rounded-top PLATEAU schedule where two adjacent line tops round to the same integer (e.g. tops 20.2 and 20.4) — the merged-line detection must match the oracle exactly; multi-text-node container (blockquote with two child <p>) exercising the globalBase accumulator; schedule yielding no rects at all (both return []); text with surrogate pairs (emoji) so line boundaries land inside multi-code-unit clusters.
    - Test (existing-contract lock): the new implementation satisfies the exact assertions of the current suite's semantics — line 1 charOffset always 0, subsequent charOffsets equal the schedule's break offsets, topPx/bottomPx fractional from the boundary probe's last rect, strictly useful abort behavior: aborting the controller from inside the Nth getClientRects call makes readLineBoxes throw AbortError.
    - Test (abort-before-walk unchanged): pre-aborted signal throws AbortError immediately.
  </behavior>
  <action>
    Create tests/unit/pagination/lineBoxesBinarySearch.test.ts FIRST (RED on the call-count
    bound), then rewrite the walk in src/pagination/lineBoxes.ts.

    **Test file** (new, self-contained — do NOT edit the existing lineBoxMapping.test.ts):
    - Build a RICHER range-schedule mock than lineBoxMapping's: accepts per-line start
      offsets AND per-line tops/heights (so plateau rounding schedules are expressible),
      returns one DOMRect per line the range [0, end) covers, counts getClientRects
      invocations, and supports an onProbe hook the abort test uses to abort mid-walk.
      Follow the installRangeMock/restore discipline of tests/unit/pagination/lineBoxMapping.test.ts
      (document.createRange swap + try/finally restore).
    - Copy the CURRENT linear algorithm into the test file as `linearOracleReadLineBoxes`
      (clearly labeled: replica of the pre-260820-beo implementation, round-1 replica-oracle
      discipline) and run both against every schedule; assert deep equality of the full
      LineBox[] (charOffset, topPx, bottomPx).

    **Implementation** (src/pagination/lineBoxes.ts — walk body only; everything else in the
    file stays byte-identical):
    - Keep: exported signature `readLineBoxes(el, fullText, signal): LineBox[]`; the
      `fullText.length === 0` early return; the TreeWalker SHOW_TEXT collection; the
      no-text-node return []; the globalBase multi-text-node accumulator semantics; the
      AbortError import/throw discipline; the first-line rule (`boxes.length === 0` →
      charOffset 0) and the later-line rule (charOffset = globalBase + i - 1).
    - Replace the inner `for (let i = 0; i <= localLen; i++)` per-prefix scan with, per text
      node, a line-boundary loop that binary-searches: given the current line established at
      local offset `cur` (initially 0) with recorded `lastTop` (NaN before the first box),
      find the MINIMAL i in (cur, localLen] whose probe returns non-empty rects AND
      `Math.round(lastRect.top) !== Math.round(lastTop)` (NaN lastTop matches any non-empty
      probe). The predicate is monotone in i because rounded last-rect tops are non-decreasing
      in top-to-bottom LTR flow (same value within a line, larger on later lines) — so
      binary search over the predicate finds the same minimal i the linear scan found.
      Document this monotonicity assumption in the code comment (all three engines lay out
      lines top-to-bottom; the replica-oracle tests pin the schedules).
    - Emit the box from the BOUNDARY probe's own last rect (topPx = rects[last].top,
      bottomPx = rects[last].bottom — exactly the values the linear scan observed at that i),
      set lastTop = that top, set cur = i, and continue until no boundary is found in the
      node; then advance globalBase as today.
    - Check `signal.aborted` (throwing AbortError) before EVERY probe — the probe count is
      now ~lines × log L per node, so cancellation latency drops, but the contract
      (mid-walk AbortError) is preserved. Keep the current skip of the abort check on the
      very first iteration of the very first node when globalBase + i === 0 (or simply
      check before each probe — the function-entry check already covers pre-abort; match
      whatever keeps the existing pre-abort test passing).
    - Update the file-header and function doc comments: probe complexity is now
      O(lines × log L) per text node, not O(L); the described per-character walk no longer
      exists — keep the D-05/Pitfall-3 contract prose intact.
    - Do NOT touch: charOffsetToGrapheme, blockNormalizedText, the block-selector comment
      block, or any other export.

    Rationale to carry into code comments: the overflow guard (overflowGuard.ts:186) calls
    readLineBoxes on the live fragment per correction iteration — this task fixes symptom B
    (page-turn stalls) through that unchanged call site with zero edits to overflowGuard.ts.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/pagination/lineBoxesBinarySearch.test.ts tests/unit/pagination/lineBoxMapping.test.ts && npx vitest run tests/unit/pagination/ tests/unit/measurement/engine.test.ts</automated>
  </verify>
  <done>
    New equivalence suite green (oracle deep-equality on every schedule incl. plateau +
    container + surrogate cases); call-count bound green (fails on the old algorithm, passes
    on the new); abort tests green; the EXISTING lineBoxMapping.test.ts and the full
    pagination + engine suites pass with zero edits; readLineBoxes signature unchanged.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Time-sliced async measureAllBlocks + engine await</name>
  <files>src/measurement/domMeasurer.ts, src/measurement/engine.ts, tests/unit/measurement/domMeasurerSlicing.test.ts</files>
  <behavior>
    - Test (RED driver): measureAllBlocks(articleEl, signal, 0) — sliceBudgetMs 0 forces a yield after every block — with a globalThis.scheduler stub whose yield() is a vi.fn spy: the returned promise resolves to a BlockMeasurement[] that deep-equals the per-block expectation (kind/height/margins/lineCount/lineBoxes), and the spy was called (≥ blocks-1 times: first block runs synchronously, every subsequent block follows a yield).
    - Test (abort between slices): aborting the controller from inside the scheduler.yield spy makes the promise reject with AbortError — signal is re-checked after every yield; engine.run's existing catch classifies it as silent cancel.
    - Test (fallback path): with NO scheduler stub defined (jsdom has none), budget 0 still resolves with the same full result via the setTimeout(0) fallback.
    - Test (default budget smoke): with the default ~10ms budget and a small stub article, the promise resolves without any yield necessarily occurring (budget not exceeded) — output still correct; the budget is a ceiling, not a floor.
    - Test (engine composition, existing suite): tests/unit/measurement/engine.test.ts passes UNCHANGED (its sync mock returning an array still composes with `await`).
  </behavior>
  <action>
    Create tests/unit/measurement/domMeasurerSlicing.test.ts FIRST (RED: the current
    measureAllBlocks is synchronous — calling it without awaiting returns a plain array and
    the spy never fires), then implement.

    **Implementation (src/measurement/domMeasurer.ts):**
    - Change the signature to `measureAllBlocks(articleEl: HTMLElement, signal: AbortSignal, sliceBudgetMs: number = DEFAULT_SLICE_BUDGET_MS): Promise<BlockMeasurement[]>` with `export const DEFAULT_SLICE_BUDGET_MS = 10` (inside the 8-12ms direction; a slice must stay well under a frame-pair budget so paint and input interleave).
    - Add a module-local `yieldToMain(): Promise<void>`: read `scheduler` DYNAMICALLY off
      globalThis via STRUCTURAL typing — declare a local minimal type (a scheduler object
      with an optional yield(): Promise<void> member) and feature-detect
      `typeof s?.yield === "function"` per call; use `scheduler.yield()` when present, else
      `new Promise<void>((resolve) => setTimeout(resolve, 0))`. NO new dependencies, NO
      `any`, and NO reliance on lib.dom's Scheduler typings (the project's TypeScript
      native-preview lib coverage for scheduler.yield is unverified — structural typing is
      build-safe either way). Dynamic per-call reads also make the jsdom spy (stubbing
      globalThis.scheduler in the test) trivially effective.
    - Loop body: keep the elements query ONCE up front (single DOM read), then per block the
      existing read batch (getBoundingClientRect + getComputedStyle + margins +
      getClientRects count + blockNormalizedText + readLineBoxes) UNCHANGED. After each
      block, if `performance.now() - sliceStart >= sliceBudgetMs`: `await yieldToMain()`,
      then `if (signal.aborted) throw new AbortError();`, then reset sliceStart. Also keep
      the existing per-block top-of-loop abort check.
    - Pitfall 2 discipline note in a comment: reads stay batched WITHIN a slice; yields are
      BETWEEN slices only; this function never writes the DOM. Layout drift between slices
      (scroll, image load shifting earlier blocks) is ACCEPTED and must NOT be "fixed" by
      re-reading earlier blocks — heights were already measured against shifting geometry,
      and the epoch/abort-on-new-trigger contract (engine commit guard) is the invalidation
      mechanism. Re-reading would reintroduce the storm this task removes.
    - Update the file-header and function doc comments for the async contract.

    **Implementation (src/measurement/engine.ts):** change line 149 to
    `const blocks = await measureAllBlocks(this.opts.articleEl, signal);` — the sole call
    site. Everything after (the blocks.length 1:1 defense, drift sampling, epoch commit
    guard, trusted handler, AbortError classification) runs AFTER the await and is
    unchanged. useMeasurement's `void engine.run(constraints)` fire-and-forget invocation
    needs no change.

    Do NOT touch: triggers.ts (the 400ms debounce and the four subscriptions stay exactly as
    they are), overflowGuard.ts, the fontGate, or the Epoch.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/measurement/domMeasurerSlicing.test.ts tests/unit/measurement/engine.test.ts && npx vitest run</automated>
  </verify>
  <done>
    Slicing suite green (yield spy observed, output deep-equals expectation, AbortError
    rejection at yield point, fallback path resolves, default-budget smoke green); FULL unit
    suite passes (1230+ prior tests, zero edits to existing test files); engine composition
    unchanged; npx tsc --noEmit clean for both modified files.
  </done>
</task>

<task type="auto">
  <name>Task 3: Chromium longtask tripwire e2e + full gate</name>
  <files>tests/e2e/measurement/longtask-smoke.spec.ts</files>
  <action>
    Create tests/e2e/measurement/longtask-smoke.spec.ts — a PROPORTIONATE tripwire for the
    slicing mechanism, honestly scoped (the 3k-char fixtures cannot reproduce the 100k
    article; the authoritative long-article check is Task 4's human smoke):

    - `test.skip(({ browserName }) => browserName !== "chromium", ...)` — longtask
      PerformanceObserver entries are chromium-observable only; firefox/webkit silently
      never fire them and a green run there would be misleading (mirror the perf harness's
      Pitfall 5 project-honesty rationale in a comment).
    - beforeEach: image-stub route + IndexedDB wipe, mirroring perf.harness.spec.ts L204-219
      exactly.
    - page.addInitScript BEFORE navigation: install a PerformanceObserver for entryType
      "longtask" (guarded typeof check) accumulating entries into
      window.__lemLongtasks (objects with startTime + duration).
    - Test body: goto `/#/article/essay-long-form`; await the h1; waitForFunction the
      existing DEV-only `__lemLastTrustedConstraints` seam (the same hook stale-drop.spec.ts
      and perf.harness observe, 15s timeout); settle ~500ms; then fire ONE deterministic
      warm re-measure: open Reading settings, focus the Text size slider, press ArrowUp or
      ArrowDown (adaptive like the harness's measureWarmSamples so the size always changes),
      waitForFunction the committed size constraint to differ; settle ~800ms so the 400ms
      debounce fires and a full post-fix sliced pass completes inside the measured window;
      Escape to close the panel.
    - Assert: every collected longtask entry has duration ≤ 150, and a pageerrors array
      collected via page.on("pageerror") is empty (V7 mirror — measurement must never throw
      to the reader). Comment the 150ms bound honestly: it is a low-flake tripwire for a
      regression back to a synchronous full pass, not the ~50ms aspirational per-task bound
      from the task direction; with ~10ms slices the pass itself contributes tasks well
      under 50ms.
    - Do NOT touch tests/e2e/perf/ (perf.harness.spec.ts + budget.json are LOCKED ACPT-04
      artifacts). Running the full `npm run perf` matrix is NOT required for this quick
      task; slicing adds at most a few yields of wall-clock to a commit (well inside the
      locked budgets' headroom).

    Then run the FULL gate and record results in the summary:
    - `npx vitest run` (full unit suite — zero failures beyond the 13 documented skips)
    - `npx tsc --noEmit`
    - `npm run lint` — KNOWN pre-existing failure confined to src/portability/zipSlip.ts is
      OUT OF SCOPE (round-1 precedent, logged in deferred-items.md); verify every file this
      task touches is individually clean: `npx eslint src/pagination/lineBoxes.ts src/measurement/domMeasurer.ts src/measurement/engine.ts tests/unit/pagination/lineBoxesBinarySearch.test.ts tests/unit/measurement/domMeasurerSlicing.test.ts tests/e2e/measurement/longtask-smoke.spec.ts`
    - `git status --porcelain package.json` — empty (byte-unchanged, no new dependencies)
    - `npx playwright test longtask-smoke --project=chromium`
    - Sanity: `git diff --stat` shows ONLY the six files in files_modified.
  </action>
  <verify>
    <automated>npx playwright test longtask-smoke --project=chromium && npx vitest run && npx tsc --noEmit && git status --porcelain package.json</automated>
  </verify>
  <done>
    longtask smoke green on chromium (zero entries over 150ms, zero pageerrors; firefox/webkit
    skip cleanly); full unit suite green; tsc clean; every touched file individually
    eslint-clean (repo-wide lint fails ONLY on the pre-existing zipSlip.ts); package.json
    byte-unchanged; working tree diff confined to the six planned files.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Human smoke — blank-screen stalls and page-turn lag gone</name>
  <files></files>
  <action>Human verifies the two remaining lag symptoms are fixed end-to-end in the dev server on the same ~100k-grapheme article that failed the round-1 smoke: continuous scrolling shows no blank screens that take seconds to fill, page turns complete in well under 1 second, and position/highlight/mode-switch behavior is unchanged (offsets byte-identical by construction — this checkpoint confirms feel and unchanged behavior).</action>
  <what-built>
    Binary-search line walk (byte-identical split points, ~8x fewer Range probes) and a
    cooperative time-sliced measurement pass that yields to the main thread every ~10ms —
    the two remaining causes of blank-screen scrolling stalls and multi-second page turns
    on the ~100k-grapheme article from the rejected round-1 smoke test.
  </what-built>
  <how-to-verify>
    On the SAME long saved article (~100k graphemes) that failed the round-1 smoke:
    1. `npm run dev`, open the article in scrolling mode.
    2. Scroll continuously from top to bottom (several full screens, through image-heavy
       regions): NO blank unpainted screens requiring seconds to fill in; scrolling stays
       responsive throughout (the old symptom A: "blank spaces every screen height taking
       ~5 seconds to load in").
    3. Switch to paginated mode; take ~10 consecutive page turns through the middle/end of
       the article, including turns onto text-dense pages: every turn completes in well
       under 1 second, most instant (the old symptom B: "up to 5-10 seconds").
    4. Regression spot-checks: switch modes back and forth (location preserved), add or
       view an existing highlight (still anchored), reload the page (position restores).
  </how-to-verify>
  <resume-signal>Type "approved" or describe the remaining symptom(s) with mode + article region</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none new | All changes are client-local performance rewrites of existing in-process code paths; no new input source, network surface, storage surface, or dependency |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-beo-01 | Tampering | readLineBoxes binary search vs D-05 offset contract | mitigate | Byte-identical proof: test-local replica of the OLD linear walk as oracle, deep-equal over diverse schedules (plateau/container/surrogate); full existing pagination suite passes with zero test edits — any offset drift trips the D-05 round-trip tests |
| T-beo-02 | DoS (reader-facing) | Synchronous full-article measurement blocking input/paint on assistive-tech timing | mitigate | Time-sliced pass with ~10ms budget + scheduler.yield/setTimeout fallback, abort re-check after every yield; longtask e2e tripwire asserts no task >150ms on the worst-case text fixture |
| T-beo-03 | Repudiation | Stale line boxes committed after layout shift mid-pass | accept | Pre-existing semantics: heights were always measured against shifting geometry; the epoch/commit guard drops passes invalidated by NEW triggers, and the plan explicitly forbids re-reading earlier blocks (would reintroduce the storm) |
| T-beo-SC | Tampering | npm/pip/cargo installs | mitigate | Zero new dependencies enforced: no install commands in any task; package.json asserted byte-unchanged via git status --porcelain |
</threat_model>

<verification>
- npx vitest run — full unit suite, zero failures beyond the 13 documented skips
- npx tsc --noEmit — clean
- npm run lint — fails ONLY on pre-existing src/portability/zipSlip.ts (out of scope, round-1 precedent); all six touched files individually clean
- npx playwright test longtask-smoke --project=chromium — zero longtasks over 150ms, zero pageerrors
- git status --porcelain package.json — empty
- Blocking human smoke on the ~100k-grapheme article: no blank-screen stalls scrolling, page turns instant-to-subsecond, highlights/restore/mode-switch regressions none
</verification>

<success_criteria>
- Symptom A gone: continuous scroll through the long article never reveals blank screens that take seconds to fill (measurement passes yield; paint is never blocked for seconds)
- Symptom B gone: page turns, including overflow-guard corrections, complete in well under 1 second
- LineBox charOffset values byte-identical (oracle equivalence suite + zero edits to existing tests + full suite green)
- readLineBoxes probe complexity reduced from O(L) to O(lines × log L) per text node with the call-count bound test proving it
- measureAllBlocks is async and time-sliced; abort semantics preserved at every yield; Pitfall 2 read-batching holds within slices
- No changes to D-05 offsets, persisted data, schemas, fragment.ts/widowRules/splitBlock/renderer/triggers.ts; package.json byte-unchanged; no new dependencies
</success_criteria>

<output>
Create `.planning/quick/260820-beo-fix-residual-long-article-lag-round-2-o-/260820-beo-SUMMARY.md` when done
</output>
