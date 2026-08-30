---
status: testing
phase: 18-reader-orientation
source: [18-VERIFICATION.md]
started: 2026-08-30T19:15:00Z
updated: 2026-08-30T19:15:00Z
---

## Current Test

number: 1
name: SR navigation of the TOC panel (VoiceOver+Safari and/or NVDA+Firefox)
expected: |
  Open the panel from the header trigger, traverse the nested list, confirm the
  current entry's state is conveyed, and activate an entry. The nav is announced
  as a labeled list ('Table of contents'), heading levels/nesting are conveyed,
  aria-current emphasis is exposed, and activation moves focus to the destination
  heading with a clear announcement.
awaiting: user response

## Tests

### 1. SR navigation of the TOC panel
expected: Navigate the TOC panel with a real screen reader (VoiceOver+Safari and/or NVDA+Firefox): open the panel from the header trigger, traverse the nested list, confirm the current entry's state is conveyed, and activate an entry. The nav is announced as a labeled list, nesting is conveyed, aria-current emphasis is exposed, activation moves focus with a clear announcement.
result: [pending]

### 2. SR reception of the restoration announce
expected: Reopen an article with a saved location while a screen reader is active and listen through the ~4s marker window. 'Returned to where you left off.' is announced politely exactly once, without interrupting reading or blocking page turns; the bar fades without motion under reduced-motion settings.
result: [pending]

### 3. Real-keyboard Tab/Esc on Firefox + WebKit
expected: With a physical keyboard, Tab from inside the open TOC panel and press Escape. Esc always closes the panel and restores focus to the trigger (universal escape). Confirm the documented per-engine Tab shapes are acceptable in practice: Firefox keeps sequential focus on visible panel entries; WebKit's first Tab leaves the panel to body.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
