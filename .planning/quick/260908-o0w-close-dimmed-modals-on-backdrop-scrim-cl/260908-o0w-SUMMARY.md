---
phase: quick-260908-o0w-scrim-dismiss
plan: 01
subsystem: dialogs
tags: [dialog, scrim, backdrop, dismissal, a11y]
requires:
  - "nine dimmed modal dialogs with open-prop mirror close paths (v2.0 library)"
provides:
  - "backdrop-scrim click dismissal on all nine dimmed modals, routed through each dialog's own close prop"
  - "D16-10 in-flight gate extended to the scrim path (AddDialog + EditMetadataDialog)"
affects: []
tech-stack:
  added: []
  patterns:
    - "target===dialog click detection (padding: 0 + *-inner wrapper ⇒ dialog border box == visible card) routed through onClose/onCancel — never dlg.close() from the handler"
key-files:
  created:
    - tests/e2e/scrim-dismiss.spec.ts
  modified:
    - src/reader/SettingsPanel.tsx
    - src/ingestion/AddDialog.tsx
    - src/reader/ImportPreviewDialog.tsx
    - src/reader/WipeConfirm.tsx
    - src/ingestion/library/RemoveConfirm.tsx
    - src/ingestion/library/BookRemoveConfirm.tsx
    - src/ingestion/library/EditMetadataDialog.tsx
    - src/reader/annotations/AnnotationsDrawer.tsx
    - src/routes/review/DeleteHighlightConfirm.tsx
    - tests/component/SettingsPanel.test.tsx
    - tests/component/AddDialog.test.tsx
decisions:
  - "Scrim detection = click target IS the dialog element; every close routes through the existing open-prop mirror (never dlg.close() in the click handler)"
  - "WipeConfirm + RemoveConfirm listener effects moved from [] to [onCancel] deps (exhaustive-deps error + stale-closure discipline)"
  - "openRef-pattern dialogs (ImportPreview, DeleteHighlightConfirm) route scrim directly to onCancel — the close listener's openRef check prevents the double-cancel"
metrics:
  duration: 9 min
  completed: 2026-09-08
  tasks: 3
  files: 12
status: complete
---

# Quick Task 260908-o0w: Close dimmed modals on backdrop scrim clicks Summary

**One-liner:** Per-file `handleScrimClick` listeners in all nine dimmed modals — a click whose target IS the dialog element (the ::backdrop, given padding: 0 + `*-inner` wrappers) routes through the same `onClose`/`onCancel` prop its Cancel/Esc path uses, with the D16-10 in-flight gate on AddDialog and EditMetadataDialog.

## What Was Built

- **Task 1 (d4cabf4):** Added `handleScrimClick` inside each dialog's EXISTING listener-registration useEffect (structural-clone discipline preserved — no shared hook/helper). Ungated dialogs (SettingsPanel, AnnotationsDrawer → `onClose`; ImportPreviewDialog, WipeConfirm, RemoveConfirm, BookRemoveConfirm, DeleteHighlightConfirm → `onCancel`) dismiss on `e.target === dlg`; AddDialog + EditMetadataDialog additionally read the live `submittingRef.current` mirror and stay open while a submission is in flight (no `preventDefault` on the click — that guard is Esc/cancel-event-specific). No handler ever calls `dlg.close()`; the parent's open-prop flip owns every close (the 09-06 wedge lesson). Comments added per each file's voice explaining the detection semantics and the close-path discipline.
- **Task 2 (38b0985):** Five component tests. SettingsPanel: scrim click (native bubbling MouseEvent on the dialog element) fires `onClose`; a bubbling click on `.settings-panel-inner` does not. AddDialog: idle scrim fires `onCancel`; `.add-dialog-inner` click inert; with `ingestUrl` held on a deferred promise the scrim is ignored (no `onCancel`, dialog still open), and after the mock resolves (to a dedupe-refuse error, so the dialog stays open and the D16-12 success arm can't muddy the assertion) the scrim dismisses again. AddDialog header coverage list extended with the scrim line.
- **Task 3 (e8b1d84):** `tests/e2e/scrim-dismiss.spec.ts` — two real-browser tests (chromium/firefox/webkit via the shared config projects): real `page.mouse.click` at a viewport corner computed-then-ASSERTED outside each dialog's bounding box closes the settings panel (onClose semantics) and the Add dialog (onCancel semantics). Reused the `Add to Library` trigger locator verbatim from panel-keyboard.spec.ts.

## Verification Results

| Check | Result |
| --- | --- |
| `npx tsc` | clean (exit 0) |
| `npm run lint` | clean (exit 0) |
| `npm run test:unit -- --run` (full suite) | 1642 passed / 0 failed / 13 skipped (documented intentional skips) |
| `npx playwright test tests/e2e/scrim-dismiss.spec.ts` | 6/6 green (2 tests × chromium/firefox/webkit) |
| `git diff --stat` scope check | exactly the 12 `files_modified`; ReviewNoteDialog, NotePopover, TocPanel, SelectionToolbar, and all CSS byte-unchanged |
| `rg -l 'handleScrimClick' <9 files> \| wc -l` | 9 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] WipeConfirm.tsx + RemoveConfirm.tsx listener-effect deps `[]` → `[onCancel]`**
- **Found during:** Task 1
- **Issue:** The plan says to register the scrim listener in the EXISTING close-listener effect and "keep the effect's deps array exactly as-is ([onClose] or [onCancel])" — but these two files' close-listener effects had deps `[]` (their `handleClose` never captured props). The new scrim handler closes over `onCancel`, so `react-hooks/exhaustive-deps` (configured `error` in eslint.config.js) fails lint with deps `[]`, and a `[]`-deps effect would capture a stale `onCancel` — violating the live-mirror discipline these files' own comments preach.
- **Fix:** Bumped both effects to `[onCancel]` (exactly the parenthetical deps the plan names), with a comment explaining why. Behavior-neutral: listeners re-register on parent callback identity change, matching the other seven dialogs.
- **Files modified:** src/reader/WipeConfirm.tsx, src/ingestion/library/RemoveConfirm.tsx
- **Commit:** d4cabf4

Otherwise the plan executed exactly as written.

## TDD Note

Tasks 1 and 2 carry `tdd="true"`, but the plan itself sequences implementation (Task 1, source files only) before its tests (Task 2, test files only) as a three-task vertical split (impl → component tests → e2e). The plan's explicit task order was honored; the behavior contracts in Task 1's `<behavior>` block are all covered by Task 2/Task 3 tests (both positive scrim paths, both inner-click negatives, and the in-flight gate).

## Auth Gates

None.

## Known Stubs

None — no placeholder values, no unwired data paths.

## Self-Check: PASSED

All 12 key-files exist on disk; commits d4cabf4, 38b0985, e8b1d84 present in git log.
