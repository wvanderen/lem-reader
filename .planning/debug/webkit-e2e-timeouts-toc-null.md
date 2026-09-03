---
status: diagnosed
trigger: "UAT Phase 21 Test 7: full e2e edge matrix 1715 passed / 16 skipped but 7 webkit-only failures. Six 30s timeouts in beforeEach on page.goto http://localhost:5173 waitUntil:load (focused-add:179, metadata-edit:341, reading-views:905, portability/round-trip:312, reduced-motion:37, reduced-motion:193). One assertion: toc-navigation:320 expect toContain('Nested under beta') received null after 5000ms predicate timeout."
created: 2026-09-02T00:00:00Z
updated: 2026-09-02T00:45:00Z
---

## Current Focus

hypothesis: CONFIRMED (both parts). See Resolution.
test: Isolation re-runs (done — all green) + probe reproduction of the focus race (done — exact signature reproduced).
expecting: n/a — diagnosis complete (goal: find_root_cause_only; no fix applied per VERIFY-ONLY).
next_action: Return ROOT CAUSE FOUND to caller for gap-closure planning.

## Symptoms

expected: Six-spec edge matrix across the four destinations is green (213/0 exit 0 as recorded or equivalent) with no weakened assertions.
actual: "7 failed (webkit), 16 skipped, 1715 passed (16.5m). Six beforeEach/test timeouts on page.goto 'http://localhost:5173/' waiting until 'load' exceeded 30000ms — focused-add.spec.ts:179 (D16-08), metadata-edit.spec.ts:341 (Dexie round-trip), reading-views.spec.ts:905 (NAV-04), portability/round-trip.spec.ts:312 (SC#4 books — test timeout, browserContext.close: Test ended), reduced-motion.spec.ts:37, reduced-motion.spec.ts:193 (D6-09). One assertion failure: toc-navigation.spec.ts:320 (d) Enter activation — expect(...).toContain('Nested under beta') received null after 5000ms predicate timeout."
errors: Playwright failure output as pasted in UAT Test 7; error-context files under test-results/ (e.g. test-results/toc-toc-navigation-TOC-nav-d40e7-ed-article-did-not-remount--webkit/error-context.md).
reproduction: npx playwright test tests/e2e/library/focused-add.spec.ts tests/e2e/toc/toc-navigation.spec.ts tests/e2e/reduced-motion.spec.ts --project=webkit (full matrix repro: the six-spec edge matrix, 16.5m).
started: Discovered during UAT of Phase 21 (2026-09-01/02). Suite was green at the recorded 213/0 gate previously.

## Eliminated

## Evidence

- timestamp: 2026-09-02T00:05Z
  checked: playwright.config.ts
  found: workers already capped at 3 with a comment documenting the SAME signature: "late-suite webkit contexts starved on the single Vite dev server's module fetches — page.goto exceeded the 30s test budget on a DIFFERENT moving set of tail specs each full-suite run (two runs, 5 webkit goto-timeouts each, zero code-level failures)" — fixed once by the worker cap (13-10), class first seen 09-07. webServer = single Vite dev server :5173 with reuseExistingServer: !process.env.CI (a long-lived/stale dev server IS reused on dev machines).
  implication: The six timeouts match a documented environment-starvation class, not a code regression. Worker cap is already in place, so this occurrence needs a different residual trigger (stale reused server age per STATE.md D18 lesson, and/or machine load, and/or a heavier 1718-test matrix).

- timestamp: 2026-09-02T00:05Z
  checked: .planning/STATE.md (D18 lessons)
  found: "WebKit starvation lesson: identical-cell failure across engines = regression; webkit-only + isolation-green = harness/environment — check the reused dev server's age before touching specs (fresh server turned exit-1 into the green exit-0 gate)."
  implication: Project has an established diagnosis procedure for exactly this signature: verify isolation-green + fresh server.

## Resolution

root_cause: TWO failure modes, one shared environmental trigger (contended full-matrix run: reused long-lived Vite dev server + machine load → starved webkit renderer).
  (1) SIX TIMEOUTS — harness/environment starvation, the documented 09-07/13-10/20-07 class, NOT an app regression. The matrix reused a pathologically hot dev server (started 14:19:16, accumulated 7h11m CPU in 3h49m elapsed ≈190% average — PID 1899, still running at diagnosis time) under multi-user load; webkit (slowest engine, single Vite server) never reached the "load" event within 30s on initial beforeEach navigations across a moving, unrelated set of specs. Proven: all six fail at the identical page.goto(BASE/) call site with zero app assertions reached; ALL pass in isolation on webkit (toc 15/15; focused-add+metadata-edit+reduced-motion 31/31; reading-views+round-trip 27 passed/1 documented skip); chromium+firefox passed the same cells in the same matrix run; identical signature documented three times previously with the same isolation-green classification.
  (2) TOC (d) — TEST-LEVEL FOCUS RACE in the openToc helper (test brittleness amplified by the same slowness, not an app bug): openToc awaits panel VISIBILITY but never synchronizes with the panel's open-focus rAF (TocPanel.tsx:168-184 focuses the aria-current entry — "Top of article" — one frame after open). When the renderer is starved, that rAF fires AFTER the test's entry.focus(), yanking focus to "Top of article"; Enter then activates the Top entry, whose handler (ArticleView.tsx:2010-2020) turns to page 1 and focuses the article h1; the poll predicate (activeElement must carry data-block-index) sees the h1 → null for 5000ms → the exact observed failure. OBSERVED REPRODUCTION via probe (real app, real webkit, no mocks): control interleaving passes (yank fires before test focus → Enter jumps to h3[data-block-index=8], page 3/5); starved interleaving (350ms frame stall before focus) reproduces the UAT signature byte-for-byte (activeElement=h1, predicate=null, "1 of 5", panel closed, hash unchanged). The app behaved per spec in both branches; the test asserted while losing a race it never synchronized on.
fix: (direction only — find_root_cause_only mode) (a) Re-run the gate with a FRESH dev server (kill the reused one) per the D18/19-VALIDATION protocol; use the documented --workers=2 contention control for gates under load (20-07 precedent); investigate the reused server's ~190% CPU accumulation (runaway watcher/transform loop?) as it worsens the stale-server class. (b) Strengthen openToc to await the open-focus settle before entry.focus() (poll until activeElement is an anchor inside .toc-panel, or double-rAF) — applies to Enter-activation cells (d)/(m); click cells are immune. Optional defensive app tweak: open-focus skips if focus is already inside the panel.
verification: Isolation re-runs green on webkit (15/15, 31/31, 27+1skip); probe demonstrates both interleavings deterministically. Full-matrix re-run with fresh server + hardened openToc remains the gap-closure gate (not run here — VERIFY-ONLY).
files_changed: [] (diagnosis only; no source/test modifications)

## Evidence (cont)

- timestamp: 2026-09-02T00:15Z
  checked: test-results/*/error-context.md (all 7)
  found: Six failures are ALL the identical call site — the shared harness beforeEach's page.goto("http://localhost:5173/", waitUntil:"load") (annotations/_fixtures.ts wipeDatabase line 48 or per-spec equivalents); zero app-level assertions reached. The TOC (d) failure page snapshot shows the app FULLY LOADED and functional: panel closed, article on "1 of 5" (Alpha section visible), and heading "TOC Navigation Demo" marked [active] = document.activeElement is the h1.
  implication: Six = initial-navigation starvation (no app code reached). TOC (d) = behavioral: the Top-entry jump path ran (turnToPage(0) + focus h1 — ArticleView.tsx:2010-2020 is the ONLY reachable h1-focusing path in this test; restore effect deps are [article] only and stable mid-test).

- timestamp: 2026-09-02T00:20Z
  checked: TocPanel.tsx open-effect (lines 168-184) + toc-navigation.spec.ts openToc helper (lines 132-138) + (c)/(d) test bodies
  found: openToc awaits toBeVisible only. The panel's open useEffect schedules requestAnimationFrame(() => focus aria-current entry ?? first <a>). currentKey starts -1 ("Top of article" carries aria-current until the section spy reports). Test (d) then does entry.focus() + Enter. In the SAME run, webkit PASSED (c) click-jump tests (same jump machinery + poll predicate) — only Enter-activation (d) failed.
  implication: A focus race: if the open-focus rAF fires after the test's entry.focus() (delayed frame under starved webkit), Enter activates "Top of article" → h1 focus + page 1 → poll returns null (h1 has no data-block-index) → the exact observed failure + snapshot. The spec itself documents webkit popover-focus lifecycle races at lines 140-143 ("webkit's popover close lifecycle races the ref-captured focus restore").

- timestamp: 2026-09-02T00:25Z
  checked: Process/server state + git timestamps + prior incident records (20-07-SUMMARY, 19-VALIDATION, 13-10 config comment)
  found: Dev server PID 1899 started Wed Sep 2 14:19:16 (elapsed 3:49, CPU TIME 7:11.54 ≈ 190% average). UAT completion commit 0380802 at 2026-09-02 18:03:50 -0500 — the 16.5m matrix ran AFTER 14:19, i.e. REUSED this server (reuseExistingServer: !CI). Load avg now 2.17/2.84/4.62 (decaying). 20-07 gate (Aug 31) documented two red full-suite runs at load 6-14 with moving-tail isolation-green failures; green only via --workers=2 + fresh server. 19-VALIDATION encodes "check dev-server freshness before diagnosing webkit failures (Phase 18 webkit-starvation lesson)".
  implication: The run's environment matches the documented starvation preconditions exactly: reused long-lived server (now measurably pathological CPU), machine multi-user load, webkit-only, moving unrelated spec set, zero code-level failures.

- timestamp: 2026-09-02T00:30Z
  checked: Isolation re-runs on webkit (the documented classification procedure)
  found: toc-navigation.spec.ts --project=webkit → 15 passed (8.9s) INCLUDING test (d) at :320. focused-add + metadata-edit + reduced-motion → 31 passed (12.9s). reading-views + portability/round-trip → 27 passed + 1 documented skip (12.8s). All runs reused the currently-hot server and still passed — the failures require the full-matrix contention window (3 workers × 3 engines + load), matching the moving-target starvation signature.
  implication: All 7 failures are isolation-green → per the project's own triad (stale-pin / regression / pre-existing-documented) these classify as environment starvation, not regressions. NOTE: these passing re-runs cleared test-results/ (Playwright wipes outputDir on run start); the 7 error-context files were read and recorded above before the wipe.

- timestamp: 2026-09-02T00:40Z
  checked: Probe reproduction (scratch webkit script, temp dir, real app + real handlers; repo untouched)
  found: CONTROL (frames settle → test focuses "Nested under beta" → Enter): jump works — focusin sequence h1 → a "Top of article" (the open-focus yank firing BEFORE the test focus, harmless) → a "Nested under beta" → h3[data-block-index=8] "Nested under beta"; page "3 of 5"; predicate "Nested under beta" → (d) would PASS. STARVED (350ms main-thread stall so the open-focus rAF stays pending across the test's focus): TEST focuses "Nested under beta" → yank fires AFTER (focusin a "Top of article"; aria-current at that moment: "Top of article") → Enter activates Top → focusin h1 "TOC Navigation Demo"; activeElement h1; predicate null; page "1 of 5"; panel closed; hash unchanged → (d) FAILS with the EXACT UAT signature (Received: null; snapshot: h1 [active], 1 of 5).
  implication: Mechanism proven end-to-end. The aria-current entry at open time is deterministically "Top of article" in paginated mode (sectionSpy's paginated report is MutationObserver + 250ms-debounce + setState downstream of the first pagination commit), which is why the lost race always yields the null/h1 variant. The app's jump machinery is correct in both interleavings; the spec's openToc helper never synchronizes with the open-focus.
