---
status: testing
phase: 11-pdf-intake
source: [11-VERIFICATION.md]
started: 2026-08-17T19:10:00Z
updated: 2026-08-17T19:10:00Z
---

## Current Test

number: 1
name: PDF extraction timeout firing (30s)
expected: |
  Typed server-error envelope with the timeout message reaches the .status live region as calm copy; no worker/proxy leak (subsequent ingests still succeed). In code terms: the Promise.race timer rejects with IngestionError('server-error', 'PDF extraction timed out — …'), the timer is cleared, and pdf.loadingTask.destroy() still runs in the finally block.
awaiting: user response

## Tests

### 1. Exercise the 30s PDF-extraction timeout (hang an extraction or upload a pathologically complex PDF) and observe the refusal
expected: Typed server-error envelope with the timeout message reaches the .status live region as calm copy; no worker/proxy leak (subsequent ingests still succeed)
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
