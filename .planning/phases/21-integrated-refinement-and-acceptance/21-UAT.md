---
status: testing
phase: 21-integrated-refinement-and-acceptance
source: [21-VERIFICATION.md]
started: 2026-09-01T17:15:00Z
updated: 2026-09-01T17:15:00Z
---

## Current Test

number: 1
name: "Run protocol v1.3 on NVDA + Firefox (Windows hardware, off-machine): flows A–L + the 5 exploratory charters; record in the §6 NVDA+Firefox results sheet"
expected: |
  Zero blocker / zero major findings (D13-06/D13-07 fix-then-re-run policy otherwise); results land in this verification ledger via /gsd-verify-work 21
awaiting: user response

## Tests

### 1. NVDA + Firefox protocol v1.3 (Windows)
expected: Run protocol v1.3 on NVDA + Firefox (Windows hardware, off-machine): flows A–L + the 5 exploratory charters; record in the §6 NVDA+Firefox results sheet. Zero blocker / zero major findings.
result: [pending]

### 2. VoiceOver + Safari protocol v1.3 + D21-12 sighted image pass (macOS)
expected: Run protocol v1.3 on VoiceOver + Safari (macOS), then the D21-12 sighted image pass in the same session: save an article with images (EPUB upload), reopen offline, export, import, verify figures render + decode locally. Zero blocker / zero major; D21-12 evidence recorded in the VO+Safari results sheet's D21-12 row.
result: [pending]

### 3. Behavior spot-check: tag-menu geometry across engines
expected: Adjacency, resize-follow, 240px viewport-keep, and focus-restore hold as specified.
result: [pending]

### 4. Behavior spot-check: truthful-64 at the far-right endpoint in both reading modes
expected: Visual ruler equality within 1px; aria and readout agreement at 64 (and 40 at far-left).
result: [pending]

### 5. Behavior spot-check: Highlights glyph/conformance/jump
expected: Computed 22px h2 / 24px row padding; glyph on exactly the confident rows; jump and BackToLibrary behave.
result: [pending]

### 6. Behavior spot-check: v2.1 core-flow spine on chromium/firefox (webkit documented skip)
expected: 2 passed + 1 documented webkit skip, exit 0; byte-equal restoration incl. asset rows.
result: [pending]

### 7. Behavior spot-check: six-spec edge matrix across the four destinations
expected: 213/0 exit 0 as recorded (or equivalent green); no weakened assertions.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
