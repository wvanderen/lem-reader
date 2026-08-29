---
phase: 16-organized-library-and-focused-add-flow
plan: 02
subsystem: ui
tags: [react, native-dialog, ingestion, radio-picker, accessibility, tdd]

# Dependency graph
requires:
  - phase: 14-navigation-and-library-contracts
    provides: LibraryView mounting surface + the controlled-input/lifted-state disciplines the dialog's picker reuses
  - phase: 15-application-shell-and-destinations
    provides: The native <dialog>/showModal precedent stack (SettingsPanel/RemoveConfirm/BookRemoveConfirm lineage, 02-01 WebKit focus lesson) + POLISH-07 token discipline
provides:
  - src/ingestion/ingestCopy.ts — the single home of mapReasonToCopy (20-reason calm DOC-06 catalog, byte-pinned) + exported chunked bytesToBase64
  - src/ingestion/AddDialog.tsx — the focused Add dialog component (not yet mounted; Plan 16-03 mounts it from the Library header row): 3-way source picker, IngestControl's submission spine verbatim, D16-10 in-flight blocking
  - tests/component/AddDialog.test.tsx — the migrated + new component suite (18 cases) covering picker semantics, switch preservation, session reset, in-flight gating, dedupe, calm copy, success-arm ordering
  - Copy byte-pins re-homed to the new import path (pdf-copy/epub-copy), tables byte-unchanged
affects: [16-03, 16-04, ingestion, library-organization, reader-choice]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Byte-identical module extraction proven by brace-matched text comparison against the pre-extraction git blob (T-16-03) — stronger than test-only equivalence"
    - "Always-mounted hidden-attribute'd file input (Pattern 3a): FileList survives source switches because input.files is read-only and cleared by unmount — hidden attribute on BOTH form and input"
    - "Live-ref state mirror (submittingRef.current rewritten every render) gating the long-lived dialog cancel listener — Pitfall 3 / LibraryView L236 discipline"
    - "Session-state reset inside the open-prop sync effect's false→true transition — D16-08 no-memory dialogs"
    - "jsdom dialog component testing: prototype-level showModal/close stubs (SettingsPanel.test precedent) + navEvents ordering recorder for close-then-navigate callback ordering"

key-files:
  created:
    - src/ingestion/ingestCopy.ts
    - src/ingestion/AddDialog.tsx
    - tests/component/AddDialog.test.tsx
  modified:
    - src/ingestion/IngestControl.tsx
    - tests/unit/pdf-copy.test.ts
    - tests/unit/epub-copy.test.ts

key-decisions:
  - "File group hidden via the hidden attribute on BOTH the form and the input (never unmounting) — unmounting clears input.files (read-only), so only the hidden attribute preserves a picked File across source switches (D16-07)"
  - "URL/paste groups unmount freely — their values live in lifted dialog state; document.getElementById('ingest-paste') is null when unselected (absent from tree, not CSS-hidden)"
  - "data-initial-focus on the Web address radio — the first decision the reader makes; nothing destructive (Pitfall 8 spirit)"
  - "Book success keeps the D12-11 skip-disclosure computation for spine parity but the dialog closes onto the Library where the durable BookRow disclosure lives (D16-12 — no in-dialog copy needed)"
  - "Comment prose says 'dialog-method form wrapper' instead of the literal JSX attribute string so the acceptance grep returns 0 (the 08-04 auto-focus precedent)"
  - "requirements-completed is [] — ADD-02/ADD-03 are also declared by 16-03/16-04; they close at the end-to-end proof (04-02 PAGE-01 / 06-01 ACPT-03 / 09-01 PORT-01 split precedent)"

patterns-established:
  - "AddDialog clone-lineage shell: BookRemoveConfirm open-prop sync + close/cancel listeners + submittingRef-gated cancel (D16-10) — the canonical shape for any future busy-state modal"
  - "navEvents ordering recorder in component tests: one array collecting onCancel/onBookAdded markers + stubbed hash writes proves close-BEFORE-navigate sequencing"

requirements-completed: []  # ADD-02/ADD-03 close at 16-04 (end-to-end proof); this plan ships the component layer

# Metrics
duration: 8 min
completed: 2026-08-29
status: complete
---

# Phase 16 Plan 02: ingestCopy extraction + AddDialog component Summary

**Byte-pinned refusal-copy module extracted (brace-matched proof) plus a BookRemoveConfirm-lineage AddDialog hosting IngestControl's submission spine behind a controlled 3-way source picker — 18 new component cases green, TDD RED→GREEN.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-08-29T19:02:00Z
- **Completed:** 2026-08-29T19:10:47Z
- **Tasks:** 2
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- `src/ingestion/ingestCopy.ts` is the single home of `mapReasonToCopy` (the 20-reason calm DOC-06 catalog) + exported `bytesToBase64`; both function bodies proven BYTE-IDENTICAL to the pre-extraction git blob by brace-matched text comparison, and the pdf-copy/epub-copy byte-pin tests pass from the new import path with import-line-only diffs (T-16-03)
- `src/ingestion/AddDialog.tsx` — the focused Add dialog: native `<dialog>`/showModal clone of the BookRemoveConfirm lineage (open-prop sync, trigger capture, explicit `[data-initial-focus]` on the Web address radio, close-focus-restore, cancel→onCancel mirror), IngestControl's four-state submission spine carried verbatim (extension dispatch, per-format caps, chunked base64, D7-07 dedupe BEFORE save, G2 resetFilePick, errors never clear URL/paste text), D16-10 in-flight blocking via the live `submittingRef` mirror + disabled Cancel/submit controls, D16-12 close-first success arms
- ADD-02 component layer: fieldset/legend "Add from" 3-way controlled radio picker; only the selected source's inputs visible (paste group unmounts; file group always-mounted + hidden-attribute'd — Pattern 3a)
- ADD-03 component layer: D16-07 switch preservation (URL/paste text + FileList), D16-08 always-Web-address fresh session on every open, D16-09 refusal-only dedupe, calm copy routed through `mapReasonToCopy`
- 18/18 AddDialog component cases + 8 copy-pin cases + 10 IngestControl cases green (36 total); tsc + eslint clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract mapReasonToCopy + bytesToBase64 into ingestCopy.ts** - `f93debf` (refactor)
2. **Task 2: AddDialog component (test-first)** - `55327f1` (test — RED) + `6dd03ba` (feat — GREEN)

**TDD note (Task 2, tdd="true"):** full RED→GREEN cycle observed — the suite failed with `Failed to resolve import "../../src/ingestion/AddDialog"` (exit 1) before any implementation existed, then passed 18/18 after. No refactor commit needed (clone-lineage implementation, no cleanup required).

## Files Created/Modified
- `src/ingestion/ingestCopy.ts` - NEW: mapReasonToCopy + bytesToBase64, byte-identical extraction from IngestControl.tsx (bytesToBase64 now exported)
- `src/ingestion/AddDialog.tsx` - NEW: the focused Add dialog component (AddDialog/AddDialogProps/AddDialogSource exports; .add-dialog* CSS hooks — styles land in 16-03)
- `tests/component/AddDialog.test.tsx` - NEW: 18-case component suite (migrated spine coverage + picker/switch/reset/in-flight/success-ordering cases)
- `src/ingestion/IngestControl.tsx` - two local definitions deleted; imports from ./ingestCopy; type import trimmed (component unchanged until 16-03)
- `tests/unit/pdf-copy.test.ts` / `tests/unit/epub-copy.test.ts` - import-path-only edits (EXPECTED_* tables byte-unchanged)

## Decisions Made
- File-arm hiding: `hidden` attribute on BOTH the file form and the input, never unmounting — `input.files` is read-only and cleared by unmount, so only hiding preserves a picked File across source switches; URL/paste arms unmount freely with lifted state
- Initial focus on the Web address radio (first reader decision, non-destructive) per the plan's explicit instruction
- `requirements-completed: []` — ADD-02/ADD-03 are shared with 16-03/16-04 and close at the end-to-end proof (the established split precedent)
- Component-level cancel-event gating tests added (idle → onCancel; submitting → blocked + dialog stays open) — the T-16-07 mitigation is "component-asserted" per the threat register, with 3-engine proof deferred to 16-04 as planned

## Deviations from Plan

None - plan executed exactly as written.

**Acceptance-criterion note:** the literal `rg -n 'method="dialog"'` check initially matched a COMMENT describing the forbidden pattern; reworded the comment to "dialog-method form wrapper" so the grep returns 0 (the 08-04 'auto-focus' prose precedent). No behavior change.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- AddDialog is component-complete and awaits Plan 16-03: mount from the LibraryView header row (props contract: `open`/`onCancel`/`onBookAdded`), dissolve the IngestControl add section, add `.add-dialog*` CSS rules
- IngestControl remains alive and green on imports from ingestCopy — retires in 16-03 as planned
- Focus-trap/Esc/geometry deliberately NOT claimed here (jsdom-blind — Pitfall 5); Plan 16-04 proves them in real browsers
- No blockers

## Self-Check: PASSED

- All 3 created files exist on disk (ingestCopy.ts, AddDialog.tsx, AddDialog.test.tsx)
- All 3 task commits present in git log (f93debf refactor, 55327f1 test, 6dd03ba feat)
- Plan-level verification: 36/36 vitest cells green (AddDialog + pdf-copy + epub-copy + IngestControl); extraction byte-identity proven against git blob; EXPECTED_* tables byte-unchanged

---
*Phase: 16-organized-library-and-focused-add-flow*
*Completed: 2026-08-29*
