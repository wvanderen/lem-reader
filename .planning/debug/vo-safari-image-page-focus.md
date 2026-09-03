---
status: diagnosed
trigger: "UAT Phase 21 Test 2: VO+Safari — image at top of page causes first-line skip after image; image-only page leaves focus stuck below image instead of resetting to top of new page"
created: 2026-09-02T00:00:00Z
updated: 2026-09-02T00:00:00Z
symptoms_prefilled: true
goal: find_root_cause_only
---

## Current Focus

hypothesis: CONFIRMED — the page-turn focus handoff is unreachable in the VO+Safari flow once a turn is control-originated, leaving VoiceOver with a stale cursor across turns. Verified chain: (1) chevron buttons call commitTurn directly (PaginatedSurface.tsx L673-690) — never focusNewPageTop; (2) WebKit does NOT focus the activated button (probe: activeElement === body after .page-turn-next click), so D4-07's "focus stays on the control" premise is false in Safari/WebKit — focus is LOST to body; (3) once focus is body, isFocusInContent(body)=false (articleEl.contains(body)=false), so every subsequent KEYBOARD turn also skips the reset (probe: keyboard-turned arrival on figure-only page shows activeElement=body); (4) on an image-only page the next AX stop after the figure is literally the "Next page" button (region contains only the figure), making VO+Space-on-button the natural turn path that triggers the cascade.
test: Complete (Playwright WebKit probes: /var/folders/.../opencode/vo-probe/probe.cjs + ax-figure-shape.cjs against localhost:5173, figure-heavy fixture, 420x470 viewport).
expecting: (b) fully reproduced in DOM-focus terms: turn from image-only page → focus never resets, stays where VO left it (below the image / on controls). (a) explained: without the boundary-handoff, VO resumes reading on the new page from its stale mid-page cursor position — on a figure-leading page the first text line sits ABOVE the stale position and is skipped; the figure group stop (img+caption in one box) reads image+first text together.
next_action: Write Resolution + return ROOT CAUSE FOUND (goal: find_root_cause_only).

## Symptoms

expected: VoiceOver + Safari advances through a page-leading image without skipping the following first line of text, and focus resets to the top of the new page when an image is the only block on the prior page.
actual: "Images are loading in now for epubs but screen reader behavior is having issues when there's an image at the top of the page or it's the only thing on a page. It will either select the image and the first line but skip the first line when advancing if there is text. If no text the focus will be stuck below the image instead of properly resetting to the top of the new page"
errors: None reported (behavioral screen-reader navigation issue, no console errors)
reproduction: VoiceOver + Safari on macOS, EPUB article with images in paginated mode; navigate page-by-page with VO where a page begins with a figure/image.
started: Discovered during UAT of Phase 21 after EPUB image rendering was confirmed working.

## Eliminated

- hypothesis: Hidden 1px boundary heading overlaps the page-leading figure's box, confusing VO geometry
  evidence: WebKit probe — h2 rect (16,101)-(17,102) vs figure top 125; zero overlap; 24px gap figure→next block
  timestamp: 2026-09-02

- hypothesis: Lazy `<img>` load after a turn fires the measurement re-trigger → repagination remounts content / keyed `.page-start-heading`, dropping focus
  evidence: Figure-only page probe — pagesLength/currentPageIdx/activeElement byte-stable across 2s post-turn; img already complete+decoded; imagery geometry.spec.ts locks page-count identity across image loads
  timestamp: 2026-09-02

- hypothesis: DOM/AX ordering or box overlap merges the figure with the first text block (structural cause for symptom a)
  evidence: ariaSnapshot shows figure group (img+caption) and following paragraph as distinct sibling AX nodes with disjoint geometry; caption-less figures expose img directly
  timestamp: 2026-09-02

- hypothesis: Figure blocks missing from the focus-target candidate list
  evidence: Current architecture focuses the dedicated `.page-start-heading` h2 (not a block selector); figure vs text first-block makes no difference to the handoff target
  timestamp: 2026-09-02

## Evidence

- timestamp: 2026-09-02 Phase 0
  checked: resolved debug sessions (voiceover-page-tree-reset, voiceover-page-handoff-region, safari-vo-scroll-focus-drift, sr-boundary-does-not-turn-page, voiceover-hidden-heading-trap, voiceover-stale-node-position, macos-down-arrow-turns-page, voiceover-up-down-no-navigation)
  found: Page-turn focus evolved to: fresh keyed visually-hidden `h2.page-start-heading` ("Page N begins") focused after content-originated turns; text blocks carry NO tabindex; the boundary h2 is pinned to .page-viewport top-left (hidden-heading-trap fix); chevron buttons are control-originated (focus stays). Prior sessions predate EPUB images — none tested figure blocks.
  implication: The handoff design was tuned for text-only pages; figures are new participants.
- timestamp: 2026-09-02 Phase 1 (code reading)
  checked: src/reader/PageTurnControls.tsx (handleTurn/isFocusInContent/focusNewPageTop), src/reader/PaginatedSurface.tsx (commitTurn, .page-start-heading render), src/pagination/fragmentRenderer.tsx, src/content/render/BlockRenderer.tsx (figure case + FigureMedia), src/content/assets/AssetProvider.tsx, src/app.css
  found: (1) Post-turn focus = fresh keyed `h2.page-start-heading` ("Page N begins"), 1px `.visually-hidden` box pinned to `.page-viewport` inset 0/0; chevron buttons call `commitTurn` DIRECTLY (no focusNewPageTop — control-originated turns keep focus on the control); keyboard/swipe turns reset focus ONLY when `isFocusInContent(document.activeElement)` (article-contained, not `.page-turn/.mode-toggle/.gear-button`). (2) figure is D4-02 ATOMIC — never split; an image-only page means the engine placed the figure alone. (3) `<img loading="lazy" decoding="async">` mounts per page turn; AssetProvider resolves object URLs async after article open (placeholder→img swap); measurement triggers include a capture-phase `load` listener on articleEl for bubbling img loads → img load can re-fire measurement→repagination AFTER a turn. (4) `.page-start-heading` is keyed `page-start-${currentPageIdx}` — a repagination that changes currentPageIdx unmounts the focused h2 → DOM focus falls to body. (5) img geometry: `max-height: calc((100dvh-48px-2*48px)*0.5)` + object-fit contain — figure never exceeds ~half page; on an image-only page the region below the figure is empty, so the next VO stop after the image is the fixed Next-page button (top: 50%+25px) — i.e., below the image.
  implication: Both reported symptoms have concrete candidate mechanisms in the handoff design; empirical WebKit probe needed to discriminate.

- timestamp: 2026-09-02 Phase 3 (empirical verification — Playwright WebKit, figure-heavy fixture, 420x470 viewport, dev server :5173)
  checked: Live AX structure + geometry on the figure-leading page (page idx 2, figure block 4 leading + paragraph 5)
  found: ARIA snapshot: article > [button "Back to library", heading "Hummingbird" lvl1, heading "Page 3 begins" lvl2, region "Page 3" > figure "Adult male bee hummingbird, Cuba." (img + caption text INSIDE the group) + paragraph, button "Previous page", button "Next page", status "Page 3 of 8."]. Geometry CLEAN: h2 1px at (16,101), figure 125→318.4, following paragraph 342.4→400 (24px gap, zero overlaps). img decoded (240x180 object URL). Caption-less figure (setContent probe): figure group unnamed containing img only — img is ALWAYS a distinct AX node from following text.
  implication: No DOM/AX-ordering or box-overlap defect; symptom (a) is not structural merging — it is cursor-resume behavior after the focus handoff fails.

- timestamp: 2026-09-02 Phase 3 (cont.)
  checked: Focus target per turn-origin (probe B) + figure-only page (probe C/D, page idx 6 = figure block 9 alone)
  found: B1 keyboard turn with DOM focus on boundary h2 → NEW h2 "Page 4 begins" focused (happy path works). B2 .page-turn-next click → activeElement === BODY (WebKit does not focus the activated button) and no reset — the button's onClick calls commitTurn directly, bypassing focusNewPageTop entirely. After B2, keyboard PageDown turns ALSO skip the reset (isFocusInContent(body)=false) — arrival on the figure-only page via keyboard turns showed activeElement=body. Figure-only page stability: pagesLength=8/currentPageIdx=6/activeElement unchanged across 2s — lazy-img load does NOT retrigger repagination churn. On the figure-only page the only content stop is the figure group; the next AX stop is the fixed "Next page" button (center y=282, below figure region in reading order).
  implication: Confirmed cascade — control-originated turn (VO+Space on the chevron, the natural stop after an image-only page's sole item) drops DOM focus to body in WebKit; the D4-07 premise "focus stays on the control" is false in Safari/WebKit; every later keyboard turn also fails the fromContent gate. VoiceOver never receives the "Page N begins" boundary handoff and resumes from its stale below-content position. Repagination/lazy-load hypothesis ELIMINATED.

## Resolution

root_cause: The paginated page-turn focus handoff is unreachable in the VoiceOver+Safari reading flow once a turn is control-originated. (1) The chevron buttons' onClick calls PaginatedSurface.commitTurn directly — PageTurnControls.focusNewPageTop (the "Page N begins" boundary-heading handoff) only runs on keyboard/swipe turns, and only when isFocusInContent(document.activeElement) is true. (2) In WebKit/Safari, activating a button does NOT move DOM focus to it — probe-verified: after clicking .page-turn-next, document.activeElement === body — so the D4-07 design premise "control-originated turns keep focus on the control" is false in Safari; focus is silently LOST to body. (3) Once focus is body, isFocusInContent returns false (articleEl.contains(body)=false), so all SUBSEQUENT keyboard turns also skip the reset — a persistent failure cascade. (4) On an image-only page the figure group is the sole content stop, so the next sequential VoiceOver stop is the fixed "Next page" button below the image; VO+Space activation of it is the natural turn path that triggers the cascade — leaving the VO cursor stuck below the image with no top-of-page reset (symptom b). On pages where an image leads followed by text, the same lost handoff leaves VoiceOver resuming from its stale mid-page cursor position instead of the page boundary; the first text line under the image sits above the resumed position and is consumed/skipped when advancing (symptom a). The handoff design was tuned entirely on text-only corpora (all prior VO debug sessions predate EPUB image support); figure blocks are atomic (never split), which makes image-only/image-leading pages — and thus button-terminated reading sequences — common for the first time.
fix: (not applied — find_root_cause_only) Direction: route chevron button turns through the same boundary-heading focus handoff as keyboard turns (or focus the button itself post-turn so the fromContent gate classifies later turns correctly); additionally consider treating activeElement===body as content-origin in isFocusInContent so the cascade self-heals. Guard with a WebKit regression: click .page-turn-next → expect .page-start-heading focused (or button focused), never body; plus a figure-only-page approximation of the VO cursor path.
verification: Empirical WebKit probes (AX structure, geometry, per-turn-origin focus targets, figure-only-page stability) — probe scripts at /var/folders/7b/nybvblc92tz3l9q2j0jd4wx40000gn/T/opencode/vo-probe/. Live VO+Safari confirmation still required for final sign-off.
files_changed: []
