---
status: investigating
trigger: "ACPT-02 acceptance run (Phase 6 Plan 06-06): H doesn't work for highlighting text under VoiceOver. VoiceOver+Safari, 2026-08-09."
created: 2026-08-09
updated: 2026-08-09
---

# Debug Session: H highlight shortcut is dead under VoiceOver

## Symptoms

- **Expected behavior:** A VoiceOver user selects text using VO's text-selection model (VO+Enter to start selection, arrow keys to extend, VO+Enter to end) and presses H to create a highlight — the highlight is created and announced (ANNO-01, UI-SPEC §Interaction 33). Equivalently, the mouse-driven selection-toolbar "Highlight" button should work for any user who can produce a browser text selection.
- **Actual behavior:** H does nothing under VoiceOver. The shortcut silently bails because `window.getSelection()` is collapsed — VO's text selection does not surface to the browser Selection API as a recognized Range. The reported observation: "H doesn't work for highlighting text."
- **Errors:** None. Silent failure — the handler returns early (no preventDefault, no action) per its selection-dependent design.
- **Timeline:** Found in the Phase 6 ACPT-02 acceptance run (2026-08-09). The H/N shortcuts were built in Phase 5 Plan 05-02 (ANNO-01) and are SELECTION-DEPENDENT BY DESIGN — they intentionally bail when `window.getSelection()` is collapsed so H/N are not hijacked while just reading (UI-SPEC §33 guard).
- **Reproduction:** Safari + VoiceOver, open any article, use VO commands to select a text range, press H. Nothing happens. (Mouse-drag-select then H works, because that produces a real Selection API range.)

## Current Focus

- hypothesis: The H/N handlers at `src/routes/ArticleView.tsx:420-448` (handler) and `:487-491` (keydown wiring) bail at `:425-429` when `window.getSelection().isCollapsed` is true. VoiceOver's text selection (VO+Enter / arrow extend) maintains its OWN virtual selection model and frequently does NOT produce a Range that `window.getSelection()` recognizes — so the selection-dependent H/N shortcuts are effectively dead under VO. The mouse-driven selection-toolbar path (`HighlightOverlay`) depends on the SAME Selection API range, so it may be equally unreachable for VO users who cannot easily produce a mouse selection.
- test: (1) Determine empirically whether VO text selection fires `selectionchange` and/or surfaces to `window.getSelection()` in WebKit — this is the load-bearing unknown. (NEEDS HUMAN EVIDENCE — see Verification constraint below.) (2) If VO selection does NOT surface: the fix is a different interaction model, not a tweak. Candidates: (a) block-level highlight affordance (focus a block/paragraph, press H to highlight the focused block — decoupled from text selection); (b) `selectionchange`-based detection if it fires; (c) accept text-selection path is mouse/keyboard-only and add a documented SR-equivalent. (3) Confirm whether the selection-toolbar is itself VO-reachable (if it is, it may already satisfy ANNO-01 for SR users and H is a secondary path).
- expecting: Most likely outcome is that VO selection does NOT surface to the Selection API reliably, requiring a design change (block-level highlight path) rather than a bug fix. This is a deeper platform-interop issue than finding #2.
- next_action: CHECKPOINT — code inspection is exhausted; the load-bearing unknown is empirical and only the human tester can resolve it (investigator cannot run VoiceOver). Returned `## CHECKPOINT REACHED` requesting three specific VO probes: (a) does `document.selectionchange` fire during VO+Enter/arrows selection? (b) what does `window.getSelection().toString()` return after a VO selection? (c) does `.selection-toolbar` render + can VO reach its "Highlight" button? Fix path branches on the answer: if VO selection DOES surface → small fix (debug why H/N still bail — likely focus/event-timing, not substrate). If VO selection does NOT surface → DESIGN CHANGE (block-level highlight affordance: focus a block, press H to highlight the whole block, decoupled from text selection), which is a larger decision to be checkpointed with options rather than unilaterally applied.
- reasoning_checkpoint: 2026-08-09 — Reached CHECKPOINT. Code inspection conclusively established the dependency chain (both paths share one Selection-API gap) and that the e2e suite + protocol assume-but-don't-prove VO surfaces to Selection API. Cannot proceed to a fix without empirical VO evidence; per orchestration constraint, will NOT guess VO behavior. Awaiting human evidence (3 probes). No speculative fix applied.
- tdd_checkpoint:

## Evidence

- `src/routes/ArticleView.tsx:420-448` — `handleHighlightShortcut(withNote)`: reads `window.getSelection()`; if `!selection || selection.isCollapsed || selection.rangeCount === 0` → return (silent bail).
- `src/routes/ArticleView.tsx:487-491` — keydown wiring: `if (key === "h" || key === "H") void handleHighlightShortcutRef.current(false)` (and N → true). Comment at :482-486: "preventDefault is NOT called — H/N have no native default action worth suppressing."
- `src/routes/ArticleView.tsx:409-416` — design rationale comment: "H/N are SELECTION-DEPENDENT — they bail (no preventDefault, no action) when window.getSelection() is collapsed or captureSelection returns ok:false, so H/N are never hijacked while just reading."
- The selection toolbar (`HighlightOverlay`) also reads from the Selection API (`captureSelection`), so it shares the same VO-selection substrate gap.
- 2026-08-09 investigator — DEPENDENCY-CHAIN CONFIRMED (both highlight paths share ONE VO gap):
  - H/N shortcut path: `ArticleView.tsx:426-429` bails on collapsed `window.getSelection()`.
  - SelectionToolbar Tab-fallback path: `SelectionToolbar.tsx:122` returns null (does not render) unless `selectionRect` is non-null. `selectionRect` is populated ONLY by the `selectionchange` listener at `ArticleView.tsx:535-592`, which itself re-reads `window.getSelection()` (:542-547) and bails on collapsed. The toolbar's buttons are real `<button>`s in a `role="toolbar"` (VO-reachable IN PRINCIPLE) — but they DO NOT EXIST in the DOM when no Selection-API range exists. So the toolbar is NOT an independent SR fallback; it shares the exact VO-selection substrate gap as H/N.
  - `captureSelection` (`src/annotations/capture.ts:315-318`) reads `window.getSelection()` directly and returns `{ok:false, reason:"empty"}` on collapsed — same gap.
- 2026-08-09 investigator — E2E SUITE DOES NOT COVER VO: `capture-highlight.spec.ts:17-19` comment "we drive the DOM Range directly (NEVER Selection.toString())". `selectRangeInBlock` programmatically builds a Range + `sel.addRange(range)` — it bypasses the VO text-selection model entirely. The green e2e suite proves the Selection-API path works for mouse/programmatic selection; it says NOTHING about VO+Enter/arrows. There is NO automated test of the VO selection gesture (and none is possible without a real VO runtime — per the verification constraint).
- 2026-08-09 investigator — ACCEPTANCE PROTOCOL Flow C (docs/ACCEPTANCE-PROTOCOL.md:170-186) codifies the assumed chain: C1 "SR selection gesture across several words" → C2 ".selection-toolbar appears; Tab to it" → C3 "Enter (or H)". EVERY link depends on VO selection surfacing to the Selection API. C1 lists "Shift+Right arrow (or SR selection gesture)" — i.e., the protocol author ALSO assumed VO gesture produces a real selection. The protocol's own pass criterion (line 183: "highlight is created from keyboard-only") is what's at risk if VO selection does not surface.
- 2026-08-09 investigator — NO alternate SR highlight affordance exists: there is no block-level / focus-based highlight path. `useAnnotationState.ts` + the drawer (AnnotationsDrawer.tsx) handle view/edit/delete/navigate but NOT create. The ONLY creation paths are H/N (selection) and the selection-toolbar (selection). The drawer's jump control (Flow E) requires an existing highlight.

## Eliminated

- (to be populated by the investigation)

## Resolution

- root_cause:
- fix:
- verification:
- files_changed:
