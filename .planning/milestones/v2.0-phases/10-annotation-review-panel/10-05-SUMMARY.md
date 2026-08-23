---
phase: 10-annotation-review-panel
plan: 05
subsystem: annotations
tags: [react, typescript, native-dialog, annotations, curation, dexie-transaction, playwright, e2e, accessibility]

# Dependency graph
requires:
  - phase: 10-annotation-review-panel (Plan 10-01)
    provides: deriveReviewSections + ReviewEntry contracts + the curate.spec.ts Wave-0 sentinel replaced here
  - phase: 10-annotation-review-panel (Plan 10-02)
    provides: the ReviewView surface being wired (row anatomy, refreshKey-keyed load effect, .status region) + the .review-* additive CSS block extended here
  - phase: 10-annotation-review-panel (Plans 10-03/10-04)
    provides: the two e2e-harness fixes (schema-declaring reload after wipe; seed-then-hash-navigate) + the seeded-corpus spec shape reused verbatim
  - phase: 08-library / 09-portability
    provides: the RemoveConfirm structural-clone lineage (Pitfall 8) + the ImportPreviewDialog 09-06 Esc-close fix + the _portability.ts seeding helpers
provides:
  - ReviewNoteDialog (src/routes/review/ReviewNoteDialog.tsx) — props-driven NotePopover clone; ONE guarded commit path for Done/Esc; D5-10 empty-text policy; orphan-editable notes (D10-11)
  - DeleteHighlightConfirm (src/routes/review/DeleteHighlightConfirm.tsx) — RemoveConfirm clone calling deleteHighlight (ONE Dexie transaction cascade-deletes highlight+note); cascade-honest copy; [data-initial-focus] on Keep highlight; Esc routes through onCancel
  - ReviewView curation wiring — per-row Edit note + Remove highlight affordances (orphans included), noteTarget/removeTarget state, setRefreshKey bump (Pitfall 6), .status announcements ("Highlight removed." / "Note saved.")
  - curate.spec.ts — 6 tests × 3 engines proving RECV-01.f end-to-end (18 cells)
affects: [10-annotation-review-panel (plan 10-06 click-from-row + full-suite gate, phase verifier)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Guarded single-commit dialog: one commit() invoked from BOTH the Done onClick and the close listener, with a per-session committedRef keeping the write exactly-once — every close path (Done/Esc) commits, none double-writes (Pitfall 7 simple option)"
    - "Sibling-actions row anatomy: curation buttons render as siblings of the row body inside the row's <li> (interactive content never nests in the jump button); aria-labels prefix the visible text with the quote excerpt (WCAG 2.5.3 Label in Name)"
    - "Exact structural clones reuse their source's CSS classes verbatim (.highlight-popover* / .library-remove-confirm*) — identical chrome, zero duplicated dialog CSS; only new layout hooks (.review-item/.review-row-actions/.review-row-action/.review-note-title) are additive"

key-files:
  created:
    - src/routes/review/ReviewNoteDialog.tsx
    - src/routes/review/DeleteHighlightConfirm.tsx
  modified:
    - src/routes/review/ReviewView.tsx
    - src/app.css
    - tests/e2e/review-panel/curate.spec.ts
    - tests/e2e/review-panel/tri-state.spec.ts

key-decisions:
  - "RECV-01 stays unchecked — .f is proven here in real browsers, but .c's click-from-row half and .i close in Plan 10-06 (the 10-01/02/03/04 split precedent; requirements-completed: [])"
  - "The commit guard (committedRef) reconciles the plan's two invocation sites with exactly-once writes: Done commits, onDone flips open, the sync effect calls dlg.close(), and the close listener's guarded commit is a no-op — both call sites exist, the write happens once"
  - "Note announcement copy is 'Note saved.' (the plan's example, and the reader's own useAnnotationState status vocabulary) — one copy for both save and empty-text-delete commits since the onDone contract carries no payload"
  - "Empty-text check is text.length > 0 (verbatim useAnnotationState commitNoteSave parity — no trim) so panel edits behave identically to reader edits; NoteRecord id reuses existing?.id ?? crypto.randomUUID() (the L365 upsert precedent)"
  - "DeleteHighlightConfirm adds the 09-06 ImportPreviewDialog openRef fix: an Esc-originated close routes through onCancel — without it removeTarget stays set and the [open]-deps effect can never re-fire, wedging the dialog shut for every later row"
  - "tri-state.spec orphan-tail assertion updated to the curation DOM (Rule 1, the 10-02 sentinel-update precedent): 'no jump affordance' is now proven via button.review-row count 0, and the two curation affordances are asserted present"
  - "app.css additions (not in the plan's files_modified): a small additive tokens-only .review-* block for the row-action cluster + note-dialog heading — the 10-PATTERNS 'new selectors are ADDITIVE' guidance; dialogs reuse existing classes so no dialog CSS was duplicated"

patterns-established:
  - "Guarded single-commit dialog pattern (commit from Done + close listener + session guard) for any future modal editor outside the article provider"
  - "Sibling curation affordances under a row body — the shape Plan 10-06's click-from-row work extends"

requirements-completed: []

# Metrics
duration: 10 min
completed: 2026-08-16
status: complete
---

# Phase 10 Plan 05: In-Place Curation Summary

**ReviewNoteDialog (props-driven NotePopover clone, one guarded commit path for Done/Esc, D5-10 empty-text deletes, orphan-editable) + DeleteHighlightConfirm (RemoveConfirm clone, one-call cascade, honest note-consequence copy, focus-safe Cancel default) wired into every review row with refreshKey re-derivation and .status announcements — 18/18 e2e cells green across chromium/firefox/webkit**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-16T01:22:22Z
- **Completed:** 2026-08-16T01:32:29Z
- **Tasks:** 3
- **Files modified:** 6 (2 source created + 2 source modified + 2 e2e specs)

## Accomplishments

- `src/routes/review/ReviewNoteDialog.tsx` (228 lines) — the panel's note editor as a structural clone that takes its data as props and calls `saveNote`/`deleteNote` directly (no `useHighlightOverlay` import — the panel lives outside the article provider). ONE commit function invoked from BOTH the Done onClick AND the dialog close listener, with a per-session guard keeping the write exactly-once: empty text → `deleteNote` (D5-10), non-empty → `saveNote` upsert built to the NoteRecord schema shape. Trigger capture before showModal, textarea focus+select on open, close-listener focus restore, and a catch that never strands the dialog. Orphan rows edit identically (notes are keyed to highlightId — D10-11).
- `src/routes/review/DeleteHighlightConfirm.tsx` (198 lines) — RemoveConfirm clone whose destructive handler awaits `deleteHighlight` (the ONE Dexie transaction that cascade-deletes highlight+note; no second call), fires ONLY in the Proceed onClick (Pitfall 8 / T-10-05b), and proceeds to close even on failure. Cascade-honest body copy ("The note attached to it will also be removed."), informational excerpt context in aria-describedby, `[data-initial-focus]` on Keep highlight, and the 09-06 openRef fix routing Esc-originated closes through onCancel.
- `src/routes/review/ReviewView.tsx` — every row (orphans included) gains "Edit note" + "Remove highlight" affordances as siblings of the row body, with aria-labels prefixing the quote excerpt. `noteTarget`/`removeTarget` state wires the two always-mounted dialogs; both commit handlers clear the target, `setRefreshKey((k) => k + 1)` (Pitfall 6 — re-derive from Dexie, never stale), and announce calmly through `.status` ("Highlight removed." — D10-12 exact copy; "Note saved."). No bulk actions, no export, no quote-search (deferred list honored).
- `tests/e2e/review-panel/curate.spec.ts` (351 lines) — sentinel replaced with 6 tests × 3 engines: edit-in-place (seeded+focused textarea, no-reload re-derivation, reload persistence), orphan note add, empty-text note delete, Esc-commits-too, confirm copy + initial-focus-on-Cancel + cancel-keeps-row, and proceed (row+note gone without reload, "Highlight removed." in role=status, Dexie truth via reload).

## Task Commits

Each task was committed atomically:

1. **Task 1: ReviewNoteDialog — NotePopover structural clone** — `c6817a5` (feat)
2. **Task 2: DeleteHighlightConfirm clone + ReviewView curation wiring** — `a041c0e` (feat)
3. **Task 3: curate.spec.ts — edit/delete/announce/re-derive coverage** — `843816e` (test)

**Plan metadata:** (recorded after state updates)

## Files Created/Modified

- `src/routes/review/ReviewNoteDialog.tsx` — the note-edit dialog (new)
- `src/routes/review/DeleteHighlightConfirm.tsx` — the destructive-confirm dialog (new)
- `src/routes/review/ReviewView.tsx` — curation affordances, dialog wiring, refreshKey bump, announcements
- `src/app.css` — additive tokens-only `.review-item` / `.review-row-actions` / `.review-row-action`(+remove hover) / `h2.review-note-title` hooks (no motion properties; dialogs reuse existing chrome classes)
- `tests/e2e/review-panel/curate.spec.ts` — real curation coverage (sentinel replaced in place)
- `tests/e2e/review-panel/tri-state.spec.ts` — orphan-tail assertion updated to the curation DOM

## Decisions Made

- **RECV-01 not marked complete** — `.f` (curation) is proven here; `.c`'s click-from-row half and `.i` close in Plan 10-06 (`requirements-completed: []`, the 10-01/02/03/04 split precedent).
- **Guarded single-commit** — the plan requires the commit invoked from BOTH Done and the close listener; a session guard reconciles that with exactly-once persistence (documented in the component header).
- **"Note saved." announcement** — the plan's example copy and the reader's own `useAnnotationState` status vocabulary; one copy serves save and empty-text-delete since `onDone` carries no payload (copy choice was agent discretion).
- **Reader-parity empty-text check** — `text.length > 0` with no trim, verbatim from `commitNoteSave`, so panel and reader edits behave identically; note id reuses `existing?.id ?? crypto.randomUUID()`.
- **Esc-routing in DeleteHighlightConfirm** — the 09-06 ImportPreviewDialog `openRef` fix added to the clone so an Esc-originated close resets `removeTarget`; without it the `[open]`-deps effect could never re-fire and the dialog would wedge shut.
- **CSS-class reuse for the clones** — exact structural clones reuse `.highlight-popover*` / `.library-remove-confirm*` verbatim (the 10-02 `.article-export-highlights` reuse precedent); only new layout hooks are additive new selectors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] tri-state.spec orphan-tail assertion pinned the pre-curation DOM**
- **Found during:** Task 2 (post-wiring e2e sweep)
- **Issue:** `tri-state.spec.ts` asserted `orphanSection.locator("button")` count 0 — true when orphan rows were static divs, false the moment this plan intentionally added the two curation affordances to every row (3 engines failed).
- **Fix:** Assertion updated to preserve its intent — no jump affordance — via `button.review-row` count 0, plus a new assertion that the two curation affordances ARE present on the orphan row (D10-11 proven in the same test). Mirrors the 10-02 sentinel-update precedent.
- **Files modified:** tests/e2e/review-panel/tri-state.spec.ts
- **Verification:** `npx playwright test tests/e2e/review-panel/` — 84/84 cells green.
- **Committed in:** a041c0e (Task 2 commit)

**2. [Rule 2 - Missing critical] Esc-originated close would wedge DeleteHighlightConfirm shut**
- **Found during:** Task 2 (clone authoring)
- **Issue:** A strict RemoveConfirm clone routes only the Cancel button through `onCancel`; an Esc close leaves `removeTarget` set, so the `[open]` effect never re-fires and the dialog can never reopen for another row (the exact bug the 09-06 gates caught on ImportPreviewDialog).
- **Fix:** Adopted the ImportPreviewDialog `openRef` mirror + close-listener Esc-routing (`if (openRef.current) onCancel()`), documented in the clone header as part of the current lineage discipline.
- **Files modified:** src/routes/review/DeleteHighlightConfirm.tsx
- **Verification:** Covered by the curate cancel-path cell + the 84/84 sweep; the Done/Esc discipline of ReviewNoteDialog is directly asserted (Esc-commit test).
- **Committed in:** a041c0e (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both keep the curation surface correct without scope creep; neither changes any locked decision. One additional minor scope note: `src/app.css` (not in the plan's files_modified) received a small additive tokens-only block for the new row-action/heading hooks per the 10-PATTERNS "new selectors are ADDITIVE" guidance — no dialog CSS was duplicated (clones reuse existing classes).

## Issues Encountered

None beyond the deviations above — curate.spec passed 18/18 on its first run across all three engines.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- RECV-01.f has green executor evidence in real browsers (18 cells); the phase verifier can flip that row's execution flag.
- Plan 10-06 closes RECV-01: the click-from-row loop (panel row pushes the deep link, Back returns to the origin row) reuses the sibling-affordance row anatomy shipped here, then runs the full-suite gate.
- The single-call-site discipline is grep-verified: `deleteHighlight` appears only in DeleteHighlightConfirm within the review feature; `saveNote`/`deleteNote` only in ReviewNoteDialog.
- No blockers.

## Verification Evidence

| Check | Result |
|-------|--------|
| `npm run build` | exit 0 |
| `npm run test:unit -- --run` (full unit, no subsets) | 871 passed / 0 failed / 7 intentional skips (65 files) — identical to the 10-02/03/04 baseline |
| `npx playwright test tests/e2e/review-panel/curate.spec.ts` | 18/18 passed (chromium + firefox + webkit) |
| `npx playwright test tests/e2e/review-panel/` (whole dir, regression sweep) | 84/84 passed (69 prior − 3 sentinel + 18 new) |
| `npm run lint` | 3 pre-existing zipSlip.ts errors only (the documented 10-01 baseline); `npx eslint` over all touched files: clean |
| `npm run lint:no-danger` | 0 dangerouslySetInnerHTML usages |
| Repo grep discipline | `deleteHighlight` in review → DeleteHighlightConfirm only; `saveNote`/`deleteNote` in review → ReviewNoteDialog only; no `dexieLibrarySource` import (comment mention only); no `useHighlightOverlay` import (comment mention only) |
| Line minimums | ReviewNoteDialog 228 ≥ 100; DeleteHighlightConfirm 198 ≥ 100 |

## Self-Check: PASSED

- All key-files exist on disk (verified via `[ -f ]` above)
- All three task commits present in git log (`c6817a5`, `a041c0e`, `843816e`)
- All acceptance criteria re-run and passing (see Verification Evidence)

---
*Phase: 10-annotation-review-panel*
*Completed: 2026-08-16*
