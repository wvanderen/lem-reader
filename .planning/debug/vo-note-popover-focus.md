---
status: candidate-applied
trigger: "ACPT-02 acceptance run (Phase 6 Plan 06-06): VO selection passes text entry for notes so that field cannot be accessed. VoiceOver+Safari, 2026-08-09."
created: 2026-08-09
updated: 2026-08-09
---

# Debug Session: VoiceOver cannot reach the note textarea in NotePopover

## Symptoms

- **Expected behavior:** When the note popover opens (Enter/Space on a focused `<mark>`, the N shortcut, or click on a highlight), a VoiceOver user navigating with VO+arrows (browse mode) should hear a dialog announcement (e.g. "Highlight note, dialog") and be able to VO-navigate into the note `<textarea>` to type or edit a note. The textarea should be reachable and editable via SR browse + keyboard.
- **Actual behavior:** VoiceOver's browse cursor passes the note textarea — the field cannot be accessed via VO. The user cannot enter or edit a note using VoiceOver. Programmatic `textarea.focus()` (NotePopover.tsx:100) runs on open but VO does not follow it into the popover.
- **Errors:** No runtime error. Silent accessibility failure — the function is unreachable via SR browse.
- **Timeline:** Found in the Phase 6 ACPT-02 acceptance run (2026-08-09). The NotePopover was built in Phase 5 Plan 05-03 using `popover="manual"` on a `<div role="dialog">` deliberately — the UI-SPEC rationale at `src/reader/annotations/NotePopover.tsx:5-8` rejected `<dialog>`/showModal as "too heavy" (centered + backdrop overlay). That tradeoff appears to have produced the SR focus-scope gap.
- **Reproduction:** Safari + VoiceOver, open any article, create a highlight (or activate an existing `<mark>` via Enter/Space) to open the note popover, then try to VO-navigate into the textarea. VO browse passes it.

## Current Focus

- hypothesis: The `<div popover="manual" role="dialog">` container does not establish the SR focus scope / dialog semantics that VoiceOver requires to enter the popover and honor programmatic focus. The Popover API on a non-`<dialog>` element renders in the top layer but does NOT create the AT-expected dialog focus context that `showModal()` does, so VO's browse cursor never enters the popover; `textarea.focus()` only moves DOM focus, which VO's virtual cursor ignores.
- test: (1) Confirm in WebKit/Safari specifically whether Tab (keyboard) reaches the textarea — distinguishes "VO browse can't, keyboard can" from "fully unreachable". (2) Inspect computed accessibility tree / AXRole for the popover container under VO. (3) Evaluate each fix candidate against the constraints that motivated `popover="manual"`: no light-dismiss while typing, no backdrop, reduced-motion instant show/hide, focus restore to the triggering `<mark>` on close (NotePopover.tsx:116-123).
- expecting: Tab likely reaches the textarea (DOM focus works), but VO browse does not — confirming an SR-scope/dialog-semantics gap rather than a Tab-order gap.
- next_action: Gather initial evidence — verify the focus-scope hypothesis in WebKit; confirm Tab-vs-VO-browse reachability; evaluate fix candidates (a) promote container to `<dialog>` + `showModal()`, (b) keep `popover="manual"` + add `aria-modal="true"` + a programmatic focus trap, (c) hybrid. Pick the minimum-change option that preserves no-light-dismiss + reduced-motion + focus-restore, then verify VO announces the dialog and enters the textarea.
- reasoning_checkpoint: CONFIRMED. `popover="manual"` on a `<div role="dialog">` renders in the top layer but does NOT establish the modal-dialog accessibility context VoiceOver relies on: no background inerting (VO browse continues through the article), no platform "modal shown" AT event (VO does not auto-enter on `showPopover()`), and `role="dialog"` on a div is insufficient in WebKit/Safari to reproduce native `<dialog>` entry behavior. `textarea.focus()` moves only DOM focus; VO's virtual cursor is decoupled from DOM focus. The popover's DOM position (sibling after `<article>`) compounds it. The robust, codebase-consistent fix is native `<dialog>` + `showModal()` (the proven SettingsPanel/AnnotationsDrawer pattern that Flow F passes). showModal makes the article inert behind the popover — this is the ONE constraint that cannot be preserved ("interactive behind"), and it is the necessary tradeoff for reliable VO entry; the article remains VISIBLE (::backdrop styled transparent) and the popover stays a centered box, visually identical to the prior backdrop-less manual popover. A human VO checkpoint is required before closing the session.
- tdd_checkpoint: No TDD gate (tdd_mode=false). Automated verification is the evidence layer beneath the mandatory human VoiceOver checkpoint — see Resolution.verification (514 unit + 12 new focus e2e + 3 new axe e2e + 0 regressions vs. clean tree).

## Evidence

- `src/reader/annotations/NotePopover.tsx:168-176` — the container is `<div ref={popoverRef} popover="manual" id="highlight-popover" className="highlight-popover" role="dialog" aria-label="Highlight note">`.
- `src/reader/annotations/NotePopover.tsx:96-103` — on open, `el.showPopover()` then `textarea.focus()` + `textarea.select()` run (explicit, because WebKit showPopover does not auto-focus).
- `src/reader/annotations/NotePopover.tsx:5-8` (rationale comment) — Popover API chosen over `<dialog>`/showModal because `<dialog>` is "too heavy with its centered + backdrop overlay"; the popover needs top-layer + no light-dismiss + no backdrop so typing doesn't close it and the article stays visible/interactive behind it.
- The annotation substrate (Phase 5) passes axe automation (axe catches only automatable issues per STACK.md) — this is a real-SR-only gap, exactly what ACPT-02 manual testing is meant to catch.
- **Known-good contrast in this codebase:** `src/reader/SettingsPanel.tsx:96` and `src/reader/annotations/AnnotationsDrawer.tsx:117` BOTH use a native `<dialog>` + `showModal()`. Flow F (settings) is the VO-passing reference (ACCEPTANCE-PROTOCOL.md §3 Flow F: "focus moves INTO the dialog"). The NotePopover `popover="manual"` div is the lone outlier.
- **DOM-order problem compounds it:** `ArticleView.tsx:1247` mounts `<NotePopover />` as a SIBLING AFTER `<article>`. With `popover="manual"` (no modal AT event, no inert background), VO browse continues through the article and only reaches the popover after the entire article body — which reads to the tester as "passes / unreachable."
- **Codebase philosophy (prior `bf6dd88` VO fixes):** SR-critical interactions move toward native browser primitives and AWAY from hand-rolled focus hacks (that commit removed imperative `tabindex` mutations in favor of a declarative keyed `<h2>` boundary). A native `<dialog>` + showModal is the same philosophy applied here.
- `tests/e2e/panel-keyboard.spec.ts` is the proven cross-engine (chromium/firefox/webkit) harness for the modal-dialog contract: focus moves in, Tab traps, Escape closes, focus restores to trigger. The popover currently has NO equivalent spec.

## Eliminated

- **`popover="manual"` + `aria-modal="true"` + hand-rolled focus trap (fix candidate b):** `aria-modal` on a div is poorly + inconsistently honored by VoiceOver/WebKit (it is being deprecated in favor of native `<dialog>` / `inert`); the symptom ("VO passes the textarea") is exactly the failure mode this produces. Too fragile to bet a blocker fix on.
- **Non-modal `<dialog>` + `show()` (candidate c, preserves "interactive behind"):** a non-modal dialog keeps the background interactive but does NOT fire the platform "modal shown" AT event, so VO does not auto-enter it; with the popover mounted after the article, VO browse would still strand the user. Reject — does not reliably fix the blocker.
- **Keep `popover="manual"` + inert the article wrapper manually:** would create the inert background but the popover is still a div — VO entry is still not guaranteed and there is no native focus trap. Strictly worse than native `<dialog>` + showModal.

## Resolution

- root_cause: `<div popover="manual" role="dialog">` does not establish the modal-dialog accessibility context VoiceOver relies on. `popover="manual"` on a non-`<dialog>` element renders in the top layer but (1) does not inert the background, so VO browse continues through the article; (2) fires no platform "modal shown" AT event, so VO does not auto-enter on `showPopover()`; and (3) `role="dialog"` on a div is insufficient in WebKit/Safari to reproduce native `<dialog>` entry behavior. Programmatic `textarea.focus()` moves only DOM focus, which VO's virtual cursor ignores. The popover's DOM position (sibling after `<article>`) compounded the gap.
- fix: Promote `NotePopover` to a native `<dialog>` + `showModal()` (the proven codebase pattern — `SettingsPanel` + `AnnotationsDrawer`; Flow F is the VO-passing reference). `showModal()` gives VoiceOver the modal focus scope + inert background + "modal shown" event it needs to enter the editor and reach the textarea. The `close` event drives flushNoteSave + focus-restore to the triggering `<mark>` (Pitfall 1). `::backdrop` is styled transparent so there is no visible full-screen overlay (the article stays visible; the popover keeps its centered-box look — visually identical to the prior backdrop-less manual popover, which was already centered by the Popover API default). The confirm-view Keep-button focus moved from a click-handler `requestAnimationFrame` to a `useEffect` keyed on `confirmingDelete` (the rAF raced WebKit's modal focus relocation when the clicked Delete button unmounts; the effect runs after React commit + browser settle, mirroring the open-path textarea focus that already worked on WebKit).
- verification: Automated layer fully green — `tests/unit/annotations/note-popover-confirm.test.tsx` (flipped to native `<dialog>`) 5/5; 514/514 full unit suite; NEW `tests/e2e/annotations/note-popover-focus.spec.ts` 12/12 (4 tests × 3 engines: focus→dialog+textarea, role/name + `:modal`, Tab/Shift+Tab trap, Escape/Done close + focus restore to `<mark>`); NEW a11y.spec.ts open-popover test 3/3 (axe-clean, single-content-tree, `:modal`); `npm run build` + lint clean; full annotations e2e 150 pass with ZERO regressions (the only failures, `capture-highlight:121` + `forced-colors-shapes:82`, are PRE-EXISTING — verified by stashing the fix and re-running on the clean tree). NOT declared resolved — a real VoiceOver+Safari confirmation is the gating human checkpoint (the orchestrator cannot run VO; automated tests prove modal semantics + focus + axe, not VO announcement/entry).
- files_changed: `src/reader/annotations/NotePopover.tsx`, `src/app.css`, `tests/unit/annotations/note-popover-confirm.test.tsx`, `tests/e2e/annotations/keyboard-shortcuts.spec.ts`, `tests/e2e/annotations/note-popover-focus.spec.ts` (NEW), `tests/e2e/a11y.spec.ts`.

## Constraint tradeoff (requires human acknowledgement)

The fix preserves every Phase 5 constraint EXCEPT one, which is the necessary cost of reliable VoiceOver entry and matches the existing SettingsPanel/AnnotationsDrawer modal discipline:
- PRESERVED: no light-dismiss while typing (modal `<dialog>` does not close on outside click); reduced-motion instant show/hide; focus restore to the triggering `<mark>`; two-step delete confirm (D5-12) + Keep `[data-initial-focus]`; debounced save + flushNoteSave on close (no edit lost); no full-screen VISIBLE backdrop (`::backdrop` transparent).
- CHANGED: the article is now INERT behind the popover while a note is being edited (modal). It remains VISIBLE. The reader closes the editor (Done / Delete-confirm / Escape) to interact with the article again — the correct semantic for "editing a note about one highlight." This deviates from the original Phase 5 "interactive behind" aspiration, which was an untested design preference that produced the acceptance blocker.

## Human checkpoint (before marking resolved)

Re-run ACCEPTANCE-PROTOCOL.md Flow D on **VoiceOver + Safari** (the pairing that found the bug):
1. Create a highlight (N or selection toolbar) → note editor opens. Confirm VO announces a dialog (e.g. "Highlight note, dialog" / "web dialog") and VO-navigating reaches the textarea for typing/editing.
2. Activate an existing `<mark>` (Enter/Space/click) → editor reopens. Confirm VO enters the dialog + the textarea is editable.
3. Escape/Done closes; confirm VO focus returns to the `<mark>`.
4. Spot-check the NVDA+Firefox pairing (Flow D) if available — the modal dialog should be equally reachable there.
If VO confirms, move this file to `.planning/debug/resolved/` and flip `status: resolved`. If VO still cannot reach the textarea, reopen with the VO observation (the candidate fix may need a non-modal `<dialog>` + focus-trap fallback, which was rejected here as insufficient for reliable VO entry).
