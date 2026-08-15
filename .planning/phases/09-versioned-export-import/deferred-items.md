# Phase 9 Deferred Items

## [09-06] Stacked-modal sequential focus navigation diverges by engine (found during Task 3 a11y/keyboard gate)

**Status:** Open — needs a product decision (Rule 4-adjacent); not auto-fixed.

With two sibling `showModal()` dialogs stacked (the Settings panel stays open
underneath `ImportPreviewDialog` — the 09-05 locked mount), sequential focus
navigation inside the top dialog differs per engine:

| Engine | Behavior inside dialog.import-preview |
|---|---|
| chromium | Full Tab cycle works (checkbox → Import → Cancel → wrap, with a transient inert `<body>` touch during wrap-around) |
| firefox | Forward cycle works (checkbox → Import → Cancel); the wrap from the last control retains focus on Cancel (safe, no escape) |
| webkit | Tab moves focus to inert `<body>` / the dialog element itself; the inner controls are never reached via sequential nav |

**What is NOT broken (proven on all three engines by
`tests/e2e/portability/a11y.spec.ts` + `import-preview.spec.ts`):**
- Initial focus lands on the non-destructive Cancel import (explicit
  `[data-initial-focus]` focus call after `showModal`).
- Focus NEVER reaches an interactive control outside the dialog (the trap's
  safety property).
- Escape closes the dialog and restores focus into the settings panel.
- Every control remains operable (real clicks: selectOption + Import +
  Cancel all pass on webkit/firefox/chromium in the PORT-02 flow specs).

**Candidate resolutions (need human choice — structural UI change):**
1. Accept engine reality; the e2e asserts universal safety + the chromium
   wrap-cycle (what 09-06 shipped; mirrors the high-zoom spec's
   engine-variable assertion precedent).
2. Render `ImportPreviewDialog` INSIDE the settings `<dialog>` (nested
   dialogs keep the outer dialog focusable per spec and behave better in
   sequential nav) — reverses the deliberate 09-05 "mounted OUTSIDE" DOM
   reading-order decision.
3. Close the settings panel while the preview is open and reopen it after —
   moves/re-parents the `.status` live region (the import result announce)
   and complicates the Pitfall 1 trigger capture/restore.

**Owner:** Plan 09-07 or a dedicated plan; surfaced in 09-06-SUMMARY.md.
