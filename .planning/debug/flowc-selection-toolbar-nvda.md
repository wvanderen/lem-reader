---
status: diagnosed
trigger: "ACPT-05 Flow C: tester could not Tab to selection toolbar under NVDA+Firefox after making a text selection; unsure if user error or product defect"
created: 2026-08-21T22:00:00Z
updated: 2026-08-21T23:05:00Z
---

## Current Focus

hypothesis: CONFIRMED — see Resolution. Engine selection-collapse vs selection-driven toolbar lifecycle.
test: complete (3-engine tabwalk + firefox isolation experiment)
expecting: — (diagnosis complete)
next_action: none — verdict returned; fix planning belongs to the fix-then-re-run (D13-06) flow

## Symptoms

expected: Per docs/ACCEPTANCE-PROTOCOL.md Flow C (C1–C3): after a text selection exists in the reader (C1), a selection toolbar (.selection-toolbar, role="toolbar", accessible name "Highlight actions") appears and is reachable via Tab (C2); Enter on "Highlight" creates mark.highlight[data-highlight-id] with role="status" confirmation. Toolbar path is the PRIMARY screen-reader path (bare H/N shortcuts intentionally excluded because SRs consume single-letter keys).
actual: "All pass besides C, I can't get to that selection toolbar but I'm not sure if it's user error" — under NVDA + Firefox on Windows, tester could not Tab to the selection toolbar after selecting text. Flows A, B, D, E, F and all five charters passed.
errors: None reported
reproduction: UAT Test 1 (.planning/phases/13-polish-and-acceptance/13-UAT.md) — ACPT-05 acceptance run, Flow C steps C2/C3, NVDA+Firefox pairing
started: Discovered during UAT 2026-08-21

## Eliminated

## Evidence

- timestamp: 2026-08-21T22:05Z
  checked: src/reader/annotations/SelectionToolbar.tsx (full read)
  found: Toolbar renders conditionally on selectionRect + captureResult (both set by ArticleView selectionchange listener). Native <button> elements (focusable). role=toolbar + aria-label "Highlight actions". Renders buttons when capture ok, hint text when invalid. Component comment (L22-24) says "the toolbar is a pointer/touch affordance; the keyboard path is the H/N shortcuts... Tab still reaches the toolbar buttons as a fallback" — predates the Phase 6 decision that made the toolbar the PRIMARY SR path.
  implication: Toolbar itself is focusable-in-principle; visibility is purely selection-driven.

- timestamp: 2026-08-21T22:05Z
  checked: src/routes/ArticleView.tsx L699-762 (selectionchange listener)
  found: document-level selectionchange listener (fires for ANY selection method incl. keyboard), rAF-throttled. Toolbar state cleared ONLY when: selection collapsed/absent, selection outside article, or selection inside hidden measurement body. No focus/blur/scroll-based dismissal. No mouseup-only gating.
  implication: Hypothesis #2 (toolbar only appears on mouse-up paths) ELIMINATED — detection is selectionchange-based, keyboard selections fire it.

- timestamp: 2026-08-21T22:06Z
  checked: src/routes/ArticleView.tsx L1976-1990 (mount point)
  found: SelectionToolbar mounts as a sibling AFTER the <article> element, near the END of <main> — after chapter-nav links, before NotePopover/tag-popover/AnnotationsDrawer (popovers/dialogs are display:none when closed, so not tab stops).
  implication: In sequential Tab order, the toolbar is the LAST focusable cluster of the article view — reached only after tabbing through every focusable in the header + entire article body (links etc.).

- timestamp: 2026-08-21T22:10Z
  checked: tests/e2e/annotations/capture-highlight.spec.ts (full read)
  found: All 7 tests create selections PROGRAMMATICALLY (page.evaluate → sel.removeAllRanges/addRange via selectRangeInBlock or inline Range code) and activate the toolbar via Playwright .click() (mouse). ZERO tests create a selection via keyboard (Shift+arrows) or reach the toolbar via Tab/keyboard focus.
  implication: The C2 "Tab to it" path has NO automated coverage — keyboard-selection → Tab → toolbar is untested; a keyboard-path regression or design gap would not be caught by CI.

- timestamp: 2026-08-21T22:15Z
  checked: docs/ACCEPTANCE-PROTOCOL.md Flow C (L170-201) + .planning/debug/resolved/vo-highlight-selection.md (Phase 6 prior session)
  found: (a) Flow C documents the SR selection gesture for VOICEOVER ONLY ("VO+Enter ... VO+Enter") — no NVDA selection gesture anywhere in C1; C3 documents VO+Space but no NVDA note. (b) The toolbar-as-primary-SR-path rewrite came from the Phase 6 VO+Safari run where the path was tester-confirmed — VO performs accessibility-layer focus navigation, NOT raw Tab. (c) Prior session evidence line 35: toolbar does not exist in DOM when no Selection-API range exists — same dependency chain.
  implication: The protocol is underspecified for the NVDA pairing it was executed on; and the VO pass does NOT prove raw-Tab reachability (different focus mechanism).

- timestamp: 2026-08-21T22:20Z
  checked: tests/e2e/annotations/keyboard-shortcuts.spec.ts L140-167 ("Toolbar buttons are keyboard-focusable" test)
  found: The test asserts ONLY programmatic el.focus() on the Highlight button (which passes all engines). Its comment explicitly records: "Activating via keyboard after Tab is NOT asserted: focusing the button clears the text selection" and "(the toolbar can re-render on selectionchange between roundtrips, dropping activeElement back to body)" — the test AUTHORS observed focus-induced selection collapse and designed around it rather than investigating.
  implication: Direct prior evidence that focus/Tab clears the selection in at least one engine; the Tab path was never actually verified by automation.

- timestamp: 2026-08-21T22:35Z
  checked: Live 3-engine experiment (chromium/firefox/webkit, real page.keyboard Tab presses after programmatic selection, dev server, essay-long-form, paginated default) — script /tmp/opencode/tabwalk.mjs
  found: chromium — selection + toolbar SURVIVE repeated Tab presses (walked skip-link → tags → annotations; selCollapsed=false throughout; toolbar dom=true). firefox — the FIRST Tab press collapsed the selection (selCollapsed=true) and the toolbar UNMOUNTED from the DOM instantly (focus had moved to the page-turn Previous chevron, i.e. caret-relative next focusable). webkit — FIRST Tab also collapsed the selection (activeElement stayed body) and unmounted the toolbar.
  implication: Product defect reproduced without any screen reader: in Firefox (and raw WebKit), keyboard Tab destroys the selection, which unmounts the toolbar via the selectionchange listener before the user can reach it. Chromium is unaffected. This is engine-specific behavior, matching the NVDA+Firefox failure while the VO+Safari run passed.

- timestamp: 2026-08-21T22:50Z
  checked: Experiment v2 (/tmp/opencode/tabwalk2.mjs) — chromium full Tab walk with exact-button matcher; firefox/webkit programmatic-focus vs keyboard-Tab variants
  found: chromium — focus reached the exact "Highlight" toolbar button at Tab #10 with the selection still intact (selCollapsed=false, toolbar up); Enter created mark.highlight and the toolbar dismissed — C2+C3 COMPLETE in chromium. firefox — programmatic focus on ANY focusable (skip link) also collapses the selection + unmounts toolbar; keyboard Tab #1 same. webkit — same as firefox.
  implication: The documented toolbar path works end-to-end in chromium and is structurally impossible in firefox/webkit: ANY focus movement (not just Tab) collapses the selection there.

- timestamp: 2026-08-21T22:55Z
  checked: Firefox isolation experiment (/tmp/opencode/firefox-iso.mjs) — fresh selection → direct btn.focus() on the toolbar's own "Highlight" button with SYNCHRONOUS sampling inside the same JS turn
  found: Immediately after btn.focus(): focusedNow=true, collapsedNow=TRUE (the selection is collapsed synchronously INSIDE the focus() call, before any app code can run), toolbar still in DOM (React has not re-rendered). 300ms later: toolbar UNMOUNTED and focus reverted to body (the focused button was removed from the DOM by the re-render).
  implication: The collapse is performed by Gecko itself as part of the focus change (zero app involvement — corroborated by grep: the only removeAllRanges in src/ is the post-creation clear at ArticleView.tsx:605, unreachable here; no focusin/focusout/blur listeners exist anywhere in src/). The toolbar self-destructs the moment focus arrives on it in Firefox: the button exists for one frame, then is removed with focus dumped to body. Keyboard activation (Enter) is therefore impossible.

- timestamp: 2026-08-21T23:00Z
  checked: Cross-reference with prior VO session + NVDA behavior model
  found: (a) The Phase 6 VO+Safari pass used VoiceOver's accessibility-layer navigation + VO+Space activation, which dispatches a click on the AX node without the selection-destroying DOM-focus walk — coherent with webkit's raw-Tab collapse being invisible in that run. (b) NVDA browse mode passes a REAL Tab key through to Firefox (documented NVDA browse-mode key: Tab = next focusable) — so under NVDA+Firefox the first Tab triggers the exact collapse reproduced above. (c) Chromium is the only engine where the raw-Tab path works, and no automated test ever exercised the raw-Tab path (all e2e = programmatic selection + mouse click).
  implication: The tester's report is fully explained by the product defect; the NVDA layer only determined WHICH engine's Tab semantics were exercised. Not user error.


## Resolution

root_cause: PRODUCT DEFECT (engine interaction). Gecko (Firefox) — and WebKit — collapse the document text selection synchronously whenever DOM focus moves to another element (verified: `btn.focus()` collapses the selection inside the focus() call itself, before any app code runs). The SelectionToolbar's lifecycle is driven EXCLUSIVELY by the `selectionchange` listener in src/routes/ArticleView.tsx (L705-762): a collapsed selection → `setSelectionRect(null)`/`setCaptureResult(null)` (L713-716) → the toolbar unmounts on the next render. Consequently, in Firefox the FIRST Tab press after making a selection (protocol Flow C step C2) collapses the selection and removes the toolbar — focus lands on a button that is deleted one frame later, with focus reverting to body. The toolbar is therefore keyboard-unreachable in Firefox REGARDLESS of user technique. Under NVDA+Firefox, browse mode passes a real Tab through to Firefox, triggering exactly this; the tester's "I can't get to that selection toolbar" is the defect's exact observable behavior, NOT user error. Chromium preserves inactive selections across focus changes (full C2+C3 verified working there at Tab #10 → Enter → mark created), which is why automation (programmatic selection + mouse click, all engines) and the VoiceOver+Safari run (VO accessibility-layer navigation + VO+Space click, no DOM-focus walk) never exposed it.
fix: NOT APPLIED (goal: find_root_cause_only). Fix direction for D13-06: decouple toolbar dismissal from raw selection-collapse when focus is moving INTO the toolbar — e.g. (a) keep the toolbar mounted while it contains document.activeElement (standard floating-toolbar focuscontainment pattern), and/or (b) when the toolbar appears, move focus to its first button + announce it via a polite live region (WAI-ARIA toolbar-on-selection pattern), and/or (c) debounce dismissal one frame and cancel if focus is within the toolbar. Secondary items for the fix plan: (1) keyboard-path e2e coverage — a Tab-walk spec asserting the toolbar is reachable + activatable by keyboard in firefox/webkit (current specs only use programmatic selection + mouse click; keyboard-shortcuts.spec.ts:140-167 explicitly skipped the Tab-activation assertion); (2) docs/ACCEPTANCE-PROTOCOL.md Flow C gap — C1 documents the VoiceOver selection gesture only (VO+Enter…VO+Enter) with NO NVDA gesture (browse-mode Shift+arrows is the Firefox-native one), and C3 documents VO+Space but no NVDA activation note — fill these before the D13-06 re-run so the re-run is unambiguous.
verification: Diagnosis verified by direct 3-engine browser experimentation (no fix to verify): tabwalk.mjs + tabwalk2.mjs + firefox-iso.mjs against the running dev server, essay-long-form, paginated default mode. chromium: C2+C3 complete via pure keyboard. firefox: collapse+unmount reproduced on first Tab AND on programmatic focus; synchronous collapse proven inside focus(). webkit: collapse+unmount on first Tab. App exonerated of self-interference via repo grep (single removeAllRanges at ArticleView.tsx:605 is the post-creation clear; no focusin/focusout/blur listeners in src/).
files_changed: []

