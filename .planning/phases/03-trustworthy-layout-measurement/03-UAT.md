---
status: testing
phase: 03-trustworthy-layout-measurement
source: [03-VERIFICATION.md]
started: 2026-08-05T17:30:00Z
updated: 2026-08-05T17:30:00Z
---

## Current Test

number: 1
name: Visual continuity across a forced late font swap (PAGE-06)
expected: |
  Load a fixture, force a late `@font-face` load (delayed network response or
  DevTools network throttling + a real web font). The scrolling article body
  stays painted continuously (no blank frame), typography reflows calmly, and
  the previously-rendered text remains visible until the post-swap re-measure
  commits. Trusted view is retained (PAGE-06); a late-epoch result is dropped,
  not painted over the old one (PAGE-07).
awaiting: user response

## Tests

### 1. Visual continuity across a forced late font swap (PAGE-06)

expected: Load a fixture (e.g. `essay-long-form`). Force a late `@font-face` load (e.g. inject a `@font-face` rule with a delayed network response, or use DevTools to slow the network and reload with a real web font). Observe the article body across the swap moment while the engine's font gate (D3-06) waits for the new font to settle and recomputes. The scrolling article body stays painted continuously (no blank frame); typography reflows calmly; the previously-rendered text remains visible until the post-swap re-measure commits. No jarring churn. In scrolling mode the visible payoff is subtle — the contract's full payoff lands in Phase 4's paginated mode where the trusted view IS the rendered surface. Phase 3 proves the contract mechanically; this manual check is the aesthetic judgment.

result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
