---
phase: 05-durable-highlights-and-notes
plan: 03
subsystem: annotations
tags: [popover-api, native-dialog, debounced-save, wipe-confirm-pattern, navigate-back, css-custom-properties, intl-numberformat, forced-colors]

# Dependency graph
requires:
  - phase: 05-durable-highlights-and-notes
    provides: Plan 05-02 capture toolbar + <mark> overlay rendering + HighlightOverlayProvider/useAnnotationState/useHighlightOverlay seam + H/N shortcuts + SelectionToolbar
  - phase: 02-accessible-scrolling-reader
    provides: SettingsContext D2-03 debounced-save pattern (scheduleSave/flushSave + dual-event-flush), SettingsPanel native <dialog>/showModal/focus-restore lifecycle (Pitfall 1), WipeConfirm two-step delete confirm + [data-initial-focus] (Pitfall 8), .status live region (D2-13)
  - phase: 04-responsive-pagination-and-dual-mode-navigation
    provides: PaginatedSurfaceHandle imperative handle (turn + commitTurn), fragmentContainingOffset (anchor.ts D4-10/D4-11), findScrollTarget (restoreLocation.ts), data-block-index 1:1 mapping, queryBlocks helper
provides:
  - NotePopover — Popover API (popover=manual) note editor + debounced save (mirrors SettingsContext D2-03) + two-step delete confirm (mirrors WipeConfirm Pitfall 8) + focus management (textarea focus on open, trigger restore on close)
  - AnnotationsDrawer — native <dialog> slide-over reading-order list + empty-state + ambiguous/orphan flag slots (reuses .settings-panel geometry + showModal/focus-restore VERBATIM)
  - useAnnotationState.updateNote completed — scheduleNoteSave/flushNoteSave + dual-event flush (visibilitychange-hidden + pagehide); empty text = no NoteRecord (deleteNote added to notesStore)
  - Header annotations-trigger — highlighter glyph button inline-start of ModeToggle + count badge (Intl.NumberFormat); mirrors gear-button geometry
  - ArticleView handleNavigateBack (D5-11) — fragmentContainingOffset/turnToPage paginated OR findScrollTarget/scrollIntoView scrolling → focus the <mark>
  - PaginatedSurfaceHandle — added turnToPage(pageIndex) + getPages() for D5-11 navigate-back (turn(direction) can't jump to a target page)
  - .status announces — "Highlight saved." / "Note saved." / "Highlight deleted." via onStatusAnnounce callback (debounced for note save)
affects: [05-04-PLAN, 05-05-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Popover API (popover=manual) for the note editor — top-layer rendering without backdrop, manual mode so typing doesn't light-dismiss. Sibling to <dialog>/showModal (too heavy) and position:fixed (too transient). All three mechanisms coexist per UI-SPEC §Design System."
    - "Debounced note save mirrors SettingsContext D2-03 verbatim: scheduleNoteSave (debounced ~800ms, stashes pendingRef) + flushNoteSave (Done/Escape/dual-event) + visibilitychange-hidden + pagehide flush. Empty text = deleteNote (D5-10 empty-text policy)."
    - "Two-step delete confirm mirrors WipeConfirm Pitfall 8 EXACTLY: step 1 Delete → confirm prompt; step 2 destructive Delete + Keep cancel with [data-initial-focus] on Keep (non-destructive default — accidental Enter cannot destroy)."
    - "Navigate-back (D5-11) runs D4-10/D4-11 anchor machinery in reverse: fragmentContainingOffset(pages, offset, article) → turnToPage(pageIdx) paginated; findScrollTarget(article, blocks, offset) + scrollIntoView scrolling. No fork — reuses Phase 4 + Phase 2 helpers directly."
    - "Drawer-open + annotation-count state lifted to App (same pattern as settingsOpen). Header (trigger) + ArticleView (drawer mount + navigate-back) share one source of truth via props."

key-files:
  created:
    - src/reader/annotations/NotePopover.tsx
    - src/reader/annotations/AnnotationsDrawer.tsx
    - tests/unit/annotations/note-popover-confirm.test.tsx
  modified:
    - src/reader/annotations/useAnnotationState.ts
    - src/reader/annotations/HighlightOverlay.tsx
    - src/persistence/notesStore.ts
    - src/reader/Header.tsx
    - src/App.tsx
    - src/routes/ArticleView.tsx
    - src/reader/PaginatedSurface.tsx
    - src/app.css
    - tests/component/ArticleView.test.tsx
    - tests/component/PageTurnControls.test.tsx

key-decisions:
  - "NotePopover reads entirely from useHighlightOverlay() context (openPopoverFor, highlights, updateNote, flushNoteSave, deleteHighlight, setOpenPopoverFor) — no explicit data props. Follows the SelectionToolbar pattern: the component is a context consumer, not a prop-driven leaf."
  - "Drawer-open + annotation-count state lifted to App.tsx (same pattern as settingsOpen) because Header (the trigger) is rendered by App, not ArticleView. ArticleView pushes the resolved-highlight count up via onAnnotationCountChange callback (runs on every provider render)."
  - "PaginatedSurfaceHandle extended with turnToPage(pageIndex) + getPages() (Rule 3 deviation — the existing turn(direction) API can't jump to a specific target page; calling turn in a loop would fire multiple intermediate state updates + onAnchorChange callbacks). turnToPage shares the same ref-update + re-anchor discipline as commitTurn."
  - "deleteNote added to notesStore for the empty-text policy (D5-10): when the reader clears the textarea, the debounced save deletes the persisted NoteRecord row rather than persisting an empty-text record."
  - "isOpenRef tracks popover visibility internally instead of relying on the :popover-open pseudo-class (jsdom doesn't implement it). The effect guards showPopover/hidePopover via isOpenRef so the lifecycle is test-safe and real-browser-correct."
  - "NotePopover tracks whether the popover was opened via isOpenRef instead of querying :popover-open — jsdom does not implement the Popover API pseudo-class, and the unit tests polyfill showPopover/hidePopover as no-ops."

patterns-established:
  - "Annotation UI surfaces (NotePopover, AnnotationsDrawer) consume useHighlightOverlay() context directly — the provider is the single distribution seam for resolved highlights + CRUD + coordination state."
  - "Drawer state follows the settingsOpen precedent: App owns the open/close state; Header (trigger) and ArticleView (mount + navigate-back) receive it via props."
  - "D5-11 navigate-back = D4-10/D4-11 anchor machinery in reverse: grapheme offset → fragmentContainingOffset → turnToPage (paginated) OR findScrollTarget + scrollIntoView (scrolling) → focus the <mark>."

requirements-completed: [ANNO-02, ANNO-03, ANNO-04]

# Metrics
duration: 20min
completed: 2026-08-07
status: complete
---

# Phase 5 Plan 03: Notes + Management Surface Summary

**NotePopover (Popover API manual + debounced save + WipeConfirm-style two-step delete) + AnnotationsDrawer (native `<dialog>` reading-order list + empty-state) + Header annotations-trigger + D5-11 navigate-back reusing Phase 4/2 anchor machinery in reverse — proven by 500 unit tests + 5 new component tests.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-07T16:52:12Z
- **Completed:** 2026-08-07T17:12:34Z
- **Tasks:** 2
- **Files modified:** 12 (2 created source, 1 created test, 8 modified existing, 1 modified test)

## Accomplishments
- Built `NotePopover` (Popover API `popover="manual"`): note textarea with debounced save (D2-03 pattern — `scheduleNoteSave`/`flushNoteSave` + dual-event flush `visibilitychange-hidden` + `pagehide`), two-step delete confirm mirroring WipeConfirm (step 1 Delete → confirm prompt "Delete this highlight?" + Delete/Keep; `[data-initial-focus]` on Keep for non-destructive default focus — Pitfall 8), and focus management (textarea focus + select on open, trigger restore on close).
- Completed `useAnnotationState.updateNote`: replaced the Plan 05-02 stub with the full debounced-save lifecycle (`scheduleNoteSave` ~800ms + `flushNoteSave` + dual-event-flush listeners). Empty text = `deleteNote` (D5-10 empty-text policy — `deleteNote` added to notesStore). "Note saved." announces once after the debounce commits (D5-12/A11Y-08).
- Built `AnnotationsDrawer` (native `<dialog>` slide-over): reading-order `<ol>` sorted by grapheme start offset ascending (D5-09), empty-state card reusing `.status` pattern, ambiguous/orphan entries with disabled jump button + flag text (D5-04/ANNO-07). Reuses SettingsPanel's `showModal`/focus-restore lifecycle VERBATIM (Pitfall 1 — capture `activeElement` on open, `triggerRef.current?.focus()` on close, explicit first-control focus for WebKit).
- Implemented D5-11 navigate-back in ArticleView: resolves the highlight's grapheme offset to its block, then branches on mode — PAGINATED: `fragmentContainingOffset(pages, offset, article)` → `surfaceRef.current.turnToPage(pageIdx)` (D4-10/D4-11 machinery in reverse); SCROLLING: `findScrollTarget(article, blocks, offset)` + `scrollIntoView({ block: "center" })` (reusing Phase 2 EXACTLY — no fork). Then focuses the `<mark>` via `getElementById("hl-" + id)?.focus()` (D4-07 pattern).
- Added `turnToPage(pageIndex)` + `getPages()` to `PaginatedSurfaceHandle` (Rule 3 deviation — `turn(direction)` can't jump to a specific page; navigate-back needs a target-page jump, not relative turns).
- Modified `Header.tsx`: added annotations-trigger button inline-start of ModeToggle (group reads `[annotations] [mode] [gear]`), with highlighter glyph + count badge via `Intl.NumberFormat`, hidden when no article is mounted, `--accent` only when `aria-expanded="true"` (mirrors gear-button discipline).
- Lifted drawer-open + annotation-count state to `App.tsx` (same pattern as `settingsOpen`) so Header (trigger) + ArticleView (drawer mount + navigate-back) share one source of truth.
- Added CSS for `.highlight-popover`, `.highlight-popover-*` (excerpt, textarea, actions, confirm prompt, destructive/cancel buttons mirroring WipeConfirm geometry), `.annotations-trigger`, `.annotations-trigger-badge`, `.annotations-drawer` (reuses `.settings-panel` sheet geometry), `.drawer-list`, `.drawer-entry`, `.drawer-entry-*`, `.drawer-empty`. NO transition/animation on any new selector (A11Y-06).
- 5 component tests prove: popover uses `popover="manual"` (not `<dialog>`), note text + excerpt render as React text children (Pitfall 8 — no raw HTML), two-step delete confirm shows `[data-initial-focus]` on Keep (Pitfall 8), clicking Keep returns to edit view, debounced save calls `updateNote` on textarea change. Full unit suite 500/500 green; `npm run build` succeeds; ESLint clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: NotePopover + Header annotations-trigger + useAnnotationState.updateNote completion** — `3aa7b2a` (feat)
2. **Task 2: AnnotationsDrawer + ArticleView navigate-back landing (D5-11) + drawer CSS** — `24cda7d` (feat)

## Files Created/Modified

- `src/reader/annotations/NotePopover.tsx` — Popover API (`popover="manual"`) note editor + two-step delete confirm (WipeConfirm pattern) + debounced save via context. React text children only (Pitfall 8).
- `src/reader/annotations/AnnotationsDrawer.tsx` — native `<dialog>` slide-over reading-order list + empty-state + ambiguous/orphan flag slots. Reuses SettingsPanel showModal/focus-restore VERBATIM.
- `src/reader/annotations/useAnnotationState.ts` — `updateNote` completed: `scheduleNoteSave`/`flushNoteSave` (D2-03 pattern) + dual-event flush + "Note saved." announce. `deleteNote` on empty text (D5-10).
- `src/reader/annotations/HighlightOverlay.tsx` — exposes `flushNoteSave` in the context value so NotePopover can call it on Done/Escape.
- `src/persistence/notesStore.ts` — added `deleteNote(highlightId)` for D5-10 empty-text policy.
- `src/reader/Header.tsx` — annotations-trigger button inline-start of ModeToggle + count badge; highlighter glyph; hidden when no article mounted.
- `src/App.tsx` — drawer-open + annotation-count state lifted; reset on view swap; passed to Header + ArticleView.
- `src/routes/ArticleView.tsx` — mounts NotePopover + AnnotationsDrawer inside the provider; `handleNavigateBack` (D5-11); annotation count pushed up to App.
- `src/reader/PaginatedSurface.tsx` — `PaginatedSurfaceHandle` extended with `turnToPage(pageIndex)` + `getPages()` for D5-11 navigate-back.
- `src/app.css` — `.highlight-popover`, `.highlight-popover-*`, `.annotations-trigger`, `.annotations-trigger-badge`, `.annotations-drawer`, `.drawer-*` styles (no transition/animation — A11Y-06).
- `tests/unit/annotations/note-popover-confirm.test.tsx` — 5 RTL component tests: popover=manual, Pitfall 8 text children, two-step confirm with data-initial-focus, Keep returns to edit, debounced save wiring.
- `tests/component/ArticleView.test.tsx` — updated `withProps` helper for new ArticleView props (drawerOpen, onCloseDrawer, onAnnotationCountChange).
- `tests/component/PageTurnControls.test.tsx` — updated mock handle to include `turnToPage` + `getPages`.

## Decisions Made
- **NotePopover reads from context (not props):** The plan specified explicit props (`openFor`, `noteText`, `onSaveNote`, etc.), but the component is rendered inside the HighlightOverlayProvider. Reading from `useHighlightOverlay()` directly is simpler and follows the SelectionToolbar pattern — no need to thread data through props when the context already holds it.
- **Drawer state lifted to App:** Header (the trigger) is rendered by App, not ArticleView. Lifting `drawerOpen` + `annotationCount` to App follows the `settingsOpen` precedent. ArticleView pushes the highlight count up via `onAnnotationCountChange`.
- **`turnToPage` + `getPages` added to PaginatedSurfaceHandle:** The existing `turn(direction)` API can't jump to a specific page — navigate-back needs a target-page jump. Calling `turn` in a loop would fire multiple intermediate state updates + `onAnchorChange` callbacks (incorrect behavior). `turnToPage` shares the same ref-update + re-anchor discipline as `commitTurn`. `getPages` exposes the internal pages array so ArticleView can call `fragmentContainingOffset` (keeping the Phase 4 anchor machinery reuse explicit in ArticleView per the acceptance criteria).
- **`deleteNote` added to notesStore:** The empty-text policy (D5-10 — "empty textarea = no NoteRecord") requires deleting the persisted row when the reader clears the note. Without `deleteNote`, the old note record would persist in IndexedDB with stale text.
- **`isOpenRef` instead of `:popover-open`:** jsdom doesn't implement the `:popover-open` pseudo-class selector. The `isOpenRef` ref tracks visibility internally so the lifecycle effect is test-safe and real-browser-correct.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `turnToPage(pageIndex)` + `getPages()` to PaginatedSurfaceHandle**
- **Found during:** Task 2 (D5-11 navigate-back implementation)
- **Issue:** The plan says `commitTurn(pageIdx)` but the existing `PaginatedSurfaceHandle` only exposes `turn(direction: "next" | "previous")` — a relative turn API that can't jump to a specific target page. Calling `turn` in a loop would fire multiple intermediate state updates + `onAnchorChange` callbacks.
- **Fix:** Added `turnToPage(pageIndex: number)` (shares the same ref-update + re-anchor discipline as `commitTurn`) and `getPages()` (exposes the internal pages array so ArticleView can call `fragmentContainingOffset`) to the imperative handle. Both are additive — existing callers are unaffected.
- **Files modified:** src/reader/PaginatedSurface.tsx, src/routes/ArticleView.tsx, tests/component/PageTurnControls.test.tsx
- **Verification:** `npm run build` succeeds; 500/500 tests pass.
- **Committed in:** 24cda7d (Task 2 commit)

**2. [Rule 2 - Missing Critical] Added `deleteNote(highlightId)` to notesStore**
- **Found during:** Task 1 (useAnnotationState.updateNote completion)
- **Issue:** The plan specifies "Empty textarea = no NoteRecord (the flush deletes the note if text emptied)" but notesStore only had `loadNote` + `saveNote` — no way to delete a persisted note row when the reader clears the textarea.
- **Fix:** Added `deleteNote(highlightId: string)` to notesStore.ts — a simple `db.notes.where("highlightId").equals(highlightId).delete()` mirroring the cascade-delete pattern from highlightsStore.
- **Files modified:** src/persistence/notesStore.ts
- **Verification:** `npm run build` succeeds; the debounced save's empty-text path calls `deleteNote`.
- **Committed in:** 3aa7b2a (Task 1 commit)

**3. [Rule 3 - Blocking] Reworded NotePopover comment to satisfy strict acceptance grep**
- **Found during:** Task 1 (acceptance criteria verification)
- **Issue:** The acceptance criterion `grep -c "dangerouslySetInnerHTML" src/reader/annotations/NotePopover.tsx returns 0` tripped on a comment mentioning the word (same pattern as Plan 05-01 Deviation 2).
- **Fix:** Reworded the Pitfall 8 comment from "forbids dangerouslySetInnerHTML" to "forbids the raw-HTML prop".
- **Files modified:** src/reader/annotations/NotePopover.tsx
- **Verification:** `grep -c "dangerouslySetInnerHTML" src/reader/annotations/NotePopover.tsx` returns 0.
- **Committed in:** 3aa7b2a (Task 1 commit)

**4. [Rule 1 - Bug] Updated ArticleView component test props + PageTurnControls mock handle**
- **Found during:** Task 1 + Task 2 (test suite regression after adding new ArticleView props + PaginatedSurfaceHandle methods)
- **Issue:** Adding `drawerOpen`, `onCloseDrawer`, `onAnnotationCountChange` to ArticleViewProps broke `tests/component/ArticleView.test.tsx` (missing required props). Adding `turnToPage` + `getPages` to PaginatedSurfaceHandle broke `tests/component/PageTurnControls.test.tsx` (mock handle missing new methods).
- **Fix:** Updated the `withProps` helper in ArticleView.test.tsx to pass the new props. Updated the mock handle in PageTurnControls.test.tsx to include `turnToPage` + `getPages`.
- **Files modified:** tests/component/ArticleView.test.tsx, tests/component/PageTurnControls.test.tsx
- **Verification:** 500/500 tests pass.
- **Committed in:** 3aa7b2a (ArticleView.test.tsx), 24cda7d (PageTurnControls.test.tsx)

---

**Total deviations:** 4 auto-fixed (2 blocking, 1 missing critical, 1 bug)
**Impact on plan:** All auto-fixes necessary for correct navigate-back, empty-text policy, acceptance-gate compliance, and test regression. No scope creep.

## Issues Encountered
- jsdom does not implement the Popover API (`:popover-open` pseudo-class, `showPopover`/`hidePopover` methods). The NotePopover uses `isOpenRef` to track visibility internally instead of querying the pseudo-class, and the test polyfills `showPopover`/`hidePopover` as no-ops. Real-browser lifecycle is Plan 05-05's Playwright suite.
- The `vi.mock` factory hoisting required using `vi.hoisted()` for the mock data (Vitest hoists `vi.mock` above all declarations; referencing top-level consts inside the factory causes a ReferenceError).

## User Setup Required
None — no external service configuration required. The plan adds zero new packages and zero environment variables.

## Next Phase Readiness
- **Plan 05-04 (ambiguous/orphan surfacing)** can consume the drawer's ambiguous/orphan flag slots directly (the `drawer-entry-flag` class + "Couldn't find a unique match" / "Couldn't relocate this highlight" copy are ready). The `ResolvedHighlight.status` field drives the rendering; Plan 05-04 wires the data path (status field population is already in place from Plan 05-01's `resolveQuoteSelector` tri-state).
- **Plan 05-05 (e2e corpus matrix)** validates the full note/drawer/navigate/delete flow in real browsers: Popover API lifecycle (showPopover/hidePopover), focus management, cross-fragment navigate-back, forced-colors shape distinction, and the full ANNO-02/03/04 round-trip across chromium/firefox/webkit × 6-fixture corpus × theme × mode.

---
*Phase: 05-durable-highlights-and-notes*
*Completed: 2026-08-07*

## Self-Check: PASSED

- All 3 created files exist on disk (NotePopover.tsx, AnnotationsDrawer.tsx, note-popover-confirm.test.tsx).
- Both task commits exist in git history: `3aa7b2a` (Task 1), `24cda7d` (Task 2).
- 500/500 full unit suite pass; `npm run build` succeeds; ESLint clean.
