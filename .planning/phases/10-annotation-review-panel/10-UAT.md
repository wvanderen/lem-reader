---
status: testing
phase: 10-annotation-review-panel
source: [10-VERIFICATION.md]
started: 2026-08-15T21:10:00Z
updated: 2026-08-15T21:10:00Z
---

## Current Test

number: 1
name: SR badge announcement quality
expected: |
  Navigate to #/review with VoiceOver running; confirm "Uncertain anchor" and
  "Article missing" are announced per row (tri-state badges convey state to
  screen-reader users, matching the visual badge text).
awaiting: user response

## Tests

### 1. SR badge announcement quality
expected: Navigate #/review with VoiceOver; confirm "Uncertain anchor"/"Article missing" announced per row.
result: [pending]

### 2. Focus-restore feel
expected: Row → jump → Back across chromium/firefox/webkit; confirm calm, stable return to the panel without focus churn or disorientation.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
