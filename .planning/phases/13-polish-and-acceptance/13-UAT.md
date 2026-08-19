---
status: testing
phase: 13-polish-and-acceptance
source: [13-VERIFICATION.md]
started: 2026-08-19T00:00:00.000Z
updated: 2026-08-19T00:00:00.000Z
---

## Current Test

number: 1
name: ACPT-05 — NVDA+Firefox acceptance run (execute docs/ACCEPTANCE-PROTOCOL.md v1.0 as-documented on Windows hardware)
expected: |
  Six scripted flows (A–F) + five exploratory charters run per protocol v1.0 with
  results recorded in 13-VERIFICATION.md Appendix §1.3/§1.4. ACPT-05 flips to
  complete only at zero blocker/major findings (decision D13-07). This is the
  phase's designed remaining gate — the v2.0 milestone must not close until it lands.
awaiting: user response

## Tests

### 1. ACPT-05 — NVDA+Firefox acceptance run
expected: Execute docs/ACCEPTANCE-PROTOCOL.md v1.0 as-documented on Windows hardware (NVDA + Firefox): six scripted flows (A–F) + five exploratory charters. Record findings in 13-VERIFICATION.md Appendix §1.3 (findings sheet) and §1.4 (charters). Zero blocker/major findings → ACPT-05 complete (D13-07).
result: [pending]

### 2. VoiceOver+Safari supplementary checklist (v2.0 surfaces)
expected: Walk the Appendix §3 checklist for the five v2.0 surface groups (library, markdown/epub/pdf intake, export/import, review, header/nav polish). NOT an ACPT-05 gate — supplementary coverage on the user's own schedule; record notes in the appendix.
result: [pending]

## Summary

total: 2
passed: 0
issues: 5
pending: 2
skipped: 0
blocked: 0

## Gaps

User manual review 2026-08-19 (post-execution, before UAT run) — five findings against phase-13 scope. Gap closure required before phase completion.

### G1 — Add-a-Page section breaks library width measure
status: failed
source: user review; POLISH-06 (library tidy, 13-03)
detail: The "Add a Page" section on the library/home spans edge-to-edge full width instead of conforming to the shared content measure/inset tokens used by the surrounding sections. Looks out of place.
expected: Add-a-Page conforms to the same width/inset tokens as sibling library sections.

### G2 — No way to remove a queued upload file
status: failed
source: user review
detail: In "Upload a File", once a file is queued/picked there is no affordance to remove it — even after the upload completes the queued file persists until page refresh.
expected: A remove/clear affordance for the queued pick, and the file-input state resets after a completed upload. Precedent: 09-05 import file-input value reset on refusals AND Proceed/Cancel.

### G3 — Emoji trash icon in library rows
status: failed
source: user review
detail: LibraryRow.tsx:125 renders the 🗑 emoji as the remove icon. Policy: real icons (SVG), no emoji icons. (Repo grep confirms this is the only emoji icon in src/.)
expected: Replace with a proper SVG/icon glyph; sweep confirms zero emoji-as-icon usage in the UI.

### G4 — First-load jump in paginated mode (scroll surface + progress flashes first)
status: failed
source: user review; POLISH-01/02 territory (13-01/13-02 killed the settings-token flash but not the mode-surface flash)
detail: Opening an article in paginated mode first shows the scrolling surface and its progress, then swaps to the paginated surface — visible jump on every first load. Scrolling mode has no jump.
expected: Zero jumping on first load in paginated mode — the first stable paint is the paginated surface (or a stable placeholder until pagination settles), never scroll-then-swap.

### G5 — Article-top metadata spot design + tag entry placement
status: failed
source: user review; POLISH-03 (D13-13 metadata spot, 13-04 Option A)
detail: User rejects the tag-adding section below the article title: proposes the tag affordance as a small icon in the top bar NEAR the highlights-drawer and mode-toggle controls instead of inline with the title. The metadata section's visual design is also called unacceptable as-is. Partially supersedes the 13-04 Option A placement decision (user-direction change; byline/source/export disposition to be decided in planning).
expected: Tag entry reachable via top-bar icon alongside highlights/mode controls; metadata spot visually redesigned or restructured per plan; no regression to the 09-07 geometry lesson or the firstPageReservedPx contracts.
