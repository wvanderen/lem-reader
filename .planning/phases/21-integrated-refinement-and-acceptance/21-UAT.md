---
status: complete
phase: 21-integrated-refinement-and-acceptance
source: [21-VERIFICATION.md]
started: 2026-09-01T17:15:00Z
updated: 2026-09-02T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. NVDA + Firefox protocol v1.3 (Windows)
expected: Run protocol v1.3 on NVDA + Firefox (Windows hardware, off-machine): flows A–L + the 5 exploratory charters; record in the §6 NVDA+Firefox results sheet. Zero blocker / zero major findings.
result: pass

### 2. VoiceOver + Safari protocol v1.3 + D21-12 sighted image pass (macOS)
expected: Run protocol v1.3 on VoiceOver + Safari (macOS), then the D21-12 sighted image pass in the same session: save an article with images (EPUB upload), reopen offline, export, import, verify figures render + decode locally. Zero blocker / zero major; D21-12 evidence recorded in the VO+Safari results sheet's D21-12 row.
result: issue
reported: "Images are loading in now for epubs but screen reader behavior is having issues when there's an image at the top of the page or it's the only thing on a page. It will either select the image and the first line but skip the first line when advancing if there is text. If no text the focus will be stuck below the image instead of properly resetting to the top of the new page"
severity: major

### 3. Behavior spot-check: tag-menu geometry across engines
expected: Adjacency, resize-follow, 240px viewport-keep, and focus-restore hold as specified.
result: pass

### 4. Behavior spot-check: truthful-64 at the far-right endpoint in both reading modes
expected: Visual ruler equality within 1px; aria and readout agreement at 64 (and 40 at far-left).
result: pass

### 5. Behavior spot-check: Highlights glyph/conformance/jump
expected: Computed 22px h2 / 24px row padding; glyph on exactly the confident rows; jump and BackToLibrary behave.
result: pass

### 6. Behavior spot-check: v2.1 core-flow spine on chromium/firefox (webkit documented skip)
expected: 2 passed + 1 documented webkit skip, exit 0; byte-equal restoration incl. asset rows.
result: pass

### 7. Behavior spot-check: six-spec edge matrix across the four destinations
expected: 213/0 exit 0 as recorded (or equivalent green); no weakened assertions.
result: issue
reported: "7 failed (webkit), 16 skipped, 1715 passed (16.5m). Six are beforeEach/test timeouts: page.goto 'http://localhost:5173/' waiting until 'load' exceeded 30000ms — focused-add.spec.ts:179 (D16-08 cancel/reopen fresh session), metadata-edit.spec.ts:341 (Dexie round-trip persistence), reading-views.spec.ts:905 (NAV-04 D14-13/D14-15/D14-25 view-switch matrix), portability/round-trip.spec.ts:312 (SC#4 books travels machines — test timeout, browserContext.close: Test ended), reduced-motion.spec.ts:37 (settings panel no entrance transition), reduced-motion.spec.ts:193 (D6-09 shared invariant nested-list-paths). One assertion failure: toc-navigation.spec.ts:320 (d) Enter activation jumps without re-routing — expect(...).toContain('Nested under beta') received null after 5000ms predicate timeout."
severity: major

## Summary

total: 7
passed: 5
issues: 2
pending: 0
skipped: 0

## Gaps

- truth: "VoiceOver + Safari advances through a page-leading image without skipping the following first line of text, and focus resets to the top of the new page when an image is the only block on the prior page"
  status: failed
  reason: "User reported: Images are loading in now for epubs but screen reader behavior is having issues when there's an image at the top of the page or it's the only thing on a page. It will either select the image and the first line but skip the first line when advancing if there is text. If no text the focus will be stuck below the image instead of properly resetting to the top of the new page"
  severity: major
  test: 2
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Six-spec edge matrix across the four destinations is green (213/0 exit 0 as recorded or equivalent) with no weakened assertions"
  status: failed
  reason: "User reported: 7 failed (webkit), 16 skipped, 1715 passed. Six beforeEach/test timeouts on page.goto http://localhost:5173/ waiting until 'load' (focused-add D16-08, metadata-edit Dexie round-trip, reading-views NAV-04, portability SC#4 books, reduced-motion x2) plus one assertion failure in toc-navigation (d) Enter activation — toContain('Nested under beta') received null after 5000ms predicate timeout"
  severity: major
  test: 7
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
