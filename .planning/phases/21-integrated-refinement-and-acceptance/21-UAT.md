---
status: diagnosed
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
  root_cause: "Page-turn focus handoff ('Page N begins' boundary heading) is unreachable for button-originated turns in WebKit/Safari: (1) chevron buttons in PaginatedSurface call commitTurn directly — only the keyboard/swipe path (PageTurnControls.handleTurn) calls focusNewPageTop, and only when isFocusInContent(document.activeElement) is true; (2) WebKit/Safari does not focus an activated button (activeElement becomes body after click); (3) the loss is sticky — isFocusInContent(body) is false, so every subsequent keyboard turn also skips the reset. Image-only pages trigger it because the atomic figure is the sole content stop, making the Next-page button below the image the natural VO turn path; on image-leading pages the lost handoff leaves VO resuming mid-page, consuming the first text line when advancing"
  artifacts:
    - path: "src/reader/PaginatedSurface.tsx"
      issue: "chevron buttons (L673-690) call commitTurn directly — no focus handoff on the button turn path"
    - path: "src/reader/PageTurnControls.tsx"
      issue: "isFocusInContent (L273-281) returns false for body, turning focus loss into a permanent skip of focusNewPageTop for all later turns"
  missing:
    - "Route chevron button turns through the same boundary-heading focus handoff as keyboard turns (or focus the button itself post-turn so the fromContent gate classifies subsequent turns correctly)"
    - "Treat activeElement === body as content-origin in isFocusInContent so the focus-loss cascade self-heals"
    - "Add a WebKit regression test: click .page-turn-next → assert page-start-heading (or the button) is focused, never body, including a figure-only-page scenario"
    - "Live VoiceOver+Safari confirmation needed for final sign-off"
  debug_session: ".planning/debug/vo-safari-image-page-focus.md"

- truth: "Six-spec edge matrix across the four destinations is green (213/0 exit 0 as recorded or equivalent) with no weakened assertions"
  status: failed
  reason: "User reported: 7 failed (webkit), 16 skipped, 1715 passed. Six beforeEach/test timeouts on page.goto http://localhost:5173/ waiting until 'load' (focused-add D16-08, metadata-edit Dexie round-trip, reading-views NAV-04, portability SC#4 books, reduced-motion x2) plus one assertion failure in toc-navigation (d) Enter activation — toContain('Nested under beta') received null after 5000ms predicate timeout"
  severity: major
  test: 7
  root_cause: "Two failure modes, one environmental trigger — the contended 16.5m full-matrix run reused a starved long-lived Vite dev server (~190% average CPU over 3h49m, PID 1899), starving the webkit renderer: (1) the six page.goto 'load' timeouts are harness/environment starvation, not an app regression — all six pass in isolation on webkit (15/15, 31/31, 27+1 documented skip) and chromium/firefox passed the same cells in the same run; (2) the TOC (d) failure is a test-level focus race in the openToc helper amplified by the same slowness — openToc awaits panel visibility but never the panel's open-focus rAF (TocPanel L168-184 focuses the aria-current entry, deterministically 'Top of article' in paginated mode since sectionSpy lags via MutationObserver + 250ms debounce); under a starved renderer that rAF fires after the test's entry.focus(), yanking focus to Top; Enter activates Top whose handler turns to page 1 and focuses h1 — the poll predicate (requires data-block-index) sees h1 → null for 5000ms"
  artifacts:
    - path: "tests/e2e/toc/toc-navigation.spec.ts"
      issue: "openToc helper (L132-138) doesn't await the panel's open-focus settle before entry.focus() — the race"
    - path: "src/reader/TocPanel.tsx"
      issue: "open-focus rAF (L168-184) is the yank source; behavior itself correct per UI-SPEC rules 9-10/D18-15"
    - path: "playwright.config.ts"
      issue: "webServer.reuseExistingServer + workers:3 under load — the contention knobs (comment already documents this failure class)"
  missing:
    - "Re-run the acceptance gate with a fresh dev server (kill PID 1899) per the D18/19-VALIDATION protocol, optionally --workers=2 (20-07 precedent)"
    - "Harden openToc (strengthen-only): await the open-focus settle (poll until activeElement is an anchor inside .toc-panel, or double-rAF) before entry.focus() — applies to Enter-activation cells (d)/(m); click cells immune"
    - "Investigate the reused dev server's ~190% CPU accumulation"
  debug_session: ".planning/debug/webkit-e2e-timeouts-toc-null.md"
