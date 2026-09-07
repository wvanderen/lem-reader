---
status: resolved
phase: 21-integrated-refinement-and-acceptance
source: [21-VERIFICATION.md]
started: 2026-09-01T17:15:00Z
updated: 2026-09-07T10:15:00Z
resolved_by: [21-07-PLAN.md, 21-08-PLAN.md]
---

## Current Test

[testing complete — both issues closed by gap-closure plans 21-07/21-08; re-verified 2026-09-07]

## Tests

### 1. NVDA + Firefox protocol v1.3 (Windows)
expected: Run protocol v1.3 on NVDA + Firefox (Windows hardware, off-machine): flows A–L + the 5 exploratory charters; record in the §6 NVDA+Firefox results sheet. Zero blocker / zero major findings.
result: pass

### 2. VoiceOver + Safari protocol v1.3 + D21-12 sighted image pass (macOS)
expected: Run protocol v1.3 on VoiceOver + Safari (macOS), then the D21-12 sighted image pass in the same session: save an article with images (EPUB upload), reopen offline, export, import, verify figures render + decode locally. Zero blocker / zero major; D21-12 evidence recorded in the VO+Safari results sheet's D21-12 row.
result: pass
resolution: Originally reported a MAJOR (image-page focus handoff — see report below). Closed by 21-07 (fix 67d8a81 + regression lock e4a77c1): the documented D13-06/D13-07 fix-then-re-run loop — live VoiceOver+Safari re-confirmation checkpoint APPROVED by the user 2026-09-03 (image-only page resets to top; image-leading page reads the first text line; post-button keyboard turn still resets — all three expectations held; recorded in 21-07-SUMMARY.md, STATE.md, commit 9f24d50).
reported: "Images are loading in now for epubs but screen reader behavior is having issues when there's an image at the top of the page or it's the only thing on a page. It will either select the image and the first line but skip the first line when advancing if there is text. If no text the focus will be stuck below the image instead of properly resetting to the top of the new page"
severity: major (resolved)

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
result: pass
resolution: Originally reported a MAJOR (7 webkit failures — see report below). Closed by 21-08: openToc hardened against the open-focus race (focusin witness, pure-addition diff; commits 8b9f145/7040050/a1e569d) and the full honest gate re-run GREEN on a fresh dev server (lint exit 0; unit 1605/0/13; e2e 1733/0/20 across the 3 engine projects + chromium-throttled) — a superset of the six-spec matrix with all seven previously-failing cells green and zero weakened assertions; ledger in 21-08-SUMMARY.md §Gate Ledger.
reported: "7 failed (webkit), 16 skipped, 1715 passed (16.5m). Six are beforeEach/test timeouts: page.goto 'http://localhost:5173/' waiting until 'load' exceeded 30000ms — focused-add.spec.ts:179 (D16-08 cancel/reopen fresh session), metadata-edit.spec.ts:341 (Dexie round-trip persistence), reading-views.spec.ts:905 (NAV-04 D14-13/D14-15/D14-25 view-switch matrix), portability/round-trip.spec.ts:312 (SC#4 books travels machines — test timeout, browserContext.close: Test ended), reduced-motion.spec.ts:37 (settings panel no entrance transition), reduced-motion.spec.ts:193 (D6-09 shared invariant nested-list-paths). One assertion failure: toc-navigation.spec.ts:320 (d) Enter activation jumps without re-routing — expect(...).toContain('Nested under beta') received null after 5000ms predicate timeout."
severity: major (resolved)

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

All gaps closed 2026-09-07 (both majors fixed and re-proven; see resolutions on Tests 2 and 7).
