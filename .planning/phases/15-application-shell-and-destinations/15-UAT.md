---
status: testing
phase: 15-application-shell-and-destinations
source: [15-VERIFICATION.md]
started: 2026-08-27T03:40:00Z
updated: 2026-08-27T03:40:00Z
---

## Current Test

number: 1
name: POLISH-07 visual token-coherence audit (Library/Highlights/Add/Reader at 320/768/1280 + focus rings)
expected: |
  Gutters, headers, spacing, and control hierarchy read as one coherent system; the global
  :focus-visible ring is visible on every interactive control; the three documented
  intentional differences (paginated block inset, 64ch Reader measure, 16px review-select)
  read as deliberate, not drift.
awaiting: user response

## Tests

### 1. POLISH-07 visual token-coherence audit
expected: Visually compare Library, Highlights, Add (as-is), and Reader at 320px / 768px / 1280px; check focus-ring visibility on all interactive elements. Gutters, headers, spacing, and control hierarchy read as one coherent system; focus ring visible on every interactive control; the three intentional differences read as deliberate, not drift. (Programmatic probe evidence recorded in 15-04-SUMMARY.md; the visual judgment is the phase's own 15-VALIDATION Manual-Only row.)
result: [pending]

### 2. Keyboard / screen-reader pass over the new shell surfaces
expected: Navigate the Primary nav, brand link, and a Library→Reader→Highlights round-trip by keyboard and with a screen reader. Nav landmark "Primary" is announced and distinguishable from "Library views" and "Book chapters"; aria-current="page" is conveyed; the collapsed wordmark at ≤639px stays reachable; restore focus (row link vs h1) lands where the e2e asserts it does. (Axe/e2e cover the automatable subset only.)
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
