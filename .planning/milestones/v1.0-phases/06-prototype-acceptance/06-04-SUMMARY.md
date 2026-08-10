---
phase: 06-prototype-acceptance
plan: 04
subsystem: testing
tags: [accessibility, screen-reader, acceptance-protocol, nvda, voiceover, keyboard, manual-testing]

# Dependency graph
requires:
  - phase: 02-reader-shell-controls-persistence
    provides: automated keyboard substrate (panel-keyboard.spec.ts focus trap/restore, section-announce.spec.ts A11Y-08 live region) the protocol layers manual SR verification onto
  - phase: 04-responsive-pagination-and-dual-mode-navigation
    provides: M mode-toggle + H highlight shortcuts + D4-10/D4-11 mode-switch anchor the scripted checklist exercises
  - phase: 05-durable-highlights-and-notes
    provides: D5-11 navigate-back + drawer + notesStore/highlightsStore the scripted checklist exercises
provides:
  - "Versioned manual SR + keyboard acceptance protocol (docs/ACCEPTANCE-PROTOCOL.md) — the durable, re-runnable ACPT-02 instrument"
  - "6 scripted core-flow checklist (open→read, switch mode, create highlight, view/edit/delete+note, navigate-back, settings) authored as role+accessible-name outcomes"
  - "Exploratory charter (5 goal-based edge scenarios) for real-world SR usability"
  - "Severity rubric (blocker/major/minor) with zero-blocker/major pass policy"
affects: [06-06, v1.x-jaws-followup, post-release-rerun]

# Tech tracking
tech-stack:
  added: []
  patterns: ["role+accessible-name expected-outcome authoring (NOT verbatim SR phrasing — Pitfall 7)", "versioned re-runnable manual protocol doc"]

key-files:
  created:
    - docs/ACCEPTANCE-PROTOCOL.md
  modified: []

key-decisions:
  - "ACPT-02 does NOT close here — this plan authors the instrument; it closes when Plan 06-06 EXECUTES the protocol with zero-blocker findings (mirrors the 04-02 PAGE-01 split precedent)"
  - "Expected outcomes authored as role + accessible name + state (programmatically verifiable), with informational phrasing recorded as a non-gating guide — Pitfall 7 verbatim-output anti-pattern avoided"
  - "5 exploratory charters chosen (full-loop SR-only, every-fixture-both-modes, fallback-orientation, edge-conditions-under-SR, discoverability) to catch subjective cases the scripted checklist cannot pre-classify"

patterns-established:
  - "Manual SR protocol layers onto automated substrate: the scripted checklist cross-references panel-keyboard.spec.ts + section-announce.spec.ts rather than re-proving them"
  - "Boundary-case rule for severity: confusing-but-completable announcement = minor unless the reader cannot complete the step or loses content/function (then major/blocker)"

requirements-completed: []  # ACPT-02 closes at Plan 06-06 execution, not here (instrument-only plan)

# Metrics
duration: 2 min
completed: 2026-08-08
status: complete
---

# Phase 6 Plan 4: Manual SR + Keyboard Acceptance Protocol Summary

**Versioned docs/ACCEPTANCE-PROTOCOL.md — the durable, re-runnable ACPT-02 instrument: NVDA+Firefox + VoiceOver+Safari matrix, 6 scripted core flows (role+name outcomes, not verbatim SR phrasing), 5 exploratory charters, and a zero-blocker/major severity rubric**

## Performance

- **Duration:** 2 min
- **Started:** 2026-08-08T16:22:25Z
- **Completed:** 2026-08-08T16:25:06Z
- **Tasks:** 1
- **Files modified:** 1 (docs/ACCEPTANCE-PROTOCOL.md — 391 lines; new docs/ directory created)

## Accomplishments
- Authored the durable, versioned `docs/ACCEPTANCE-PROTOCOL.md` entirely from the locked decisions D6-05/D6-06/D6-07/D6-08 — the canonical re-runnable ACPT-02 instrument.
- Recorded the SR matrix (NVDA+Firefox Windows + VoiceOver+Safari macOS as Phase 6 gates; JAWS as a documented v1.x coverage boundary, NOT a gate) and its relationship to the automated 3-engine Playwright cross-engine surface (ACPT-01).
- Authored the 6 scripted core flows with expected outcomes as role + accessible name + state (programmatically verifiable) per Pitfall 7, with a dedicated "How to Author Expected Outcomes" section explaining why verbatim SR phrasing is an anti-pattern.
- Authored a 5-scenario exploratory charter (full SR-only loop, every-fixture-both-modes, fallback orientation, edge-conditions-under-SR, discoverability) to catch real-world usability the scripted checklist misses.
- Stated the zero-blocker/major pass policy with blocker/major/minor definitions and the confusing-but-completable boundary-case rule (default minor unless step fails or content/function is lost).

## Task Commits

Each task was committed atomically:

1. **Task 1: Author docs/ACCEPTANCE-PROTOCOL.md (versioned manual SR + keyboard protocol)** - `e5774b0` (feat)

## Files Created/Modified
- `docs/ACCEPTANCE-PROTOCOL.md` - The versioned, re-runnable manual SR + keyboard acceptance instrument for ACPT-02. Sections: (1) versioned header with re-run flag, (2) SR+keyboard matrix, (3) Pitfall 7 role+name authoring rule, (4) 6 scripted core-flow checklist (Flows A–F with keyboard sequences + expected outcomes), (5) 5-scenario exploratory charter, (6) severity rubric + zero-blocker pass policy + boundary case, (7) results-recording instructions, (8) re-run contract.

## Decisions Made
- **ACPT-02 closes at Plan 06-06, not here.** This plan authors the instrument (the protocol doc); the requirement is proven when 06-06 EXECUTES it on real hardware with zero-blocker findings. `requirements-completed: []` mirrors the 04-02 PAGE-01 split precedent (ships the instrument/scaffold; the requirement closes at the plan that proves behavior).
- **Five exploratory charters chosen.** The plan's D6-06 examples ("complete the full reading + annotation loop using only the SR", "navigate every fixture end-to-end in both modes", "trigger a pagination fallback and confirm orientation") were expanded to 5 goal-based charters adding edge-conditions-under-SR and discoverability — the latter catches the "operable-but-undiscoverable" gap the scripted checklist cannot surface.
- **Informational phrasing recorded as a guide, not a gate.** Each scripted step carries both a gate (role + name + state) and the protocol explicitly states informational SR phrasing is a minor-finding guide (Pitfall 7), so a tester never fails a step on cosmetic phrasing variance.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `docs/ACCEPTANCE-PROTOCOL.md` is ready for Plan 06-06 (Wave 3) to EXECUTE on real hardware (NVDA+Firefox + VoiceOver+Safari). The protocol is complete and unambiguous enough for a human tester to follow step-by-step.
- Plan 06-05 (Wave 2: ACPT-03 edge spec audit) is independent and can proceed in parallel.
- ACPT-02 remains Pending in REQUIREMENTS.md — it flips to Complete when 06-06 records a zero-blocker/zero-major run result in 06-VERIFICATION.md.

## Self-Check: PASSED

- `docs/ACCEPTANCE-PROTOCOL.md` — FOUND (391 lines, well above 120-line minimum)
- Commit `e5774b0` (feat) — FOUND in git log
- `06-04-SUMMARY.md` — FOUND
- All plan `<acceptance_criteria>` greps — PASS (NVDA, VoiceOver, JAWS, scripted checklist + exploratory charter, role+name authoring rule, panel-keyboard.spec.ts + section-announce.spec.ts cross-references, zero-blocker policy, blocker/major/minor definitions, re-run flag)

---
*Phase: 06-prototype-acceptance*
*Completed: 2026-08-08*
