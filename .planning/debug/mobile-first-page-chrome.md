# Debug Session — Mobile first-page chrome collisions

---
status: awaiting_human_verify
created: 2026-08-22
updated: 2026-08-22T12:48:00-05:00
trigger: "Issue is resolved but now theres conflict with the resume banner, back button, etc. We should make these elements more mobile friendly"
---

## Symptoms

**Expected behavior:** On a phone, first-page metadata/resume guidance, Back to library, and page position controls form a compact, legible, non-overlapping header above article text.

**Actual behavior:** The supplied Android/Brave screenshot shows publication metadata clipped under the app bar while Back to library and 1 of 5 overlap the same vertical band; the article begins immediately below the collision.

**Errors:** No runtime error is visible or reported.

**Timeline:** Appeared after the mobile dynamic-viewport correction; reported 2026-08-22.

**Reproduction:** Open or resume an article in paginated mode at a narrow phone viewport with first-page article chrome mounted.

## Evidence

- timestamp: 2026-08-22T12:08:00-05:00
  checked: first-page DOM ownership and paginated CSS
  found: BackToLibrary is inside the article header but paginated CSS changes it to position:fixed at top:56px; PageIndicator is independently fixed at the same top:56px; article-top metadata remains the first normal-flow child of page-viewport.
  implication: The controls and metadata have separate layout owners, so no shared mobile row can prevent collisions.

- timestamp: 2026-08-22T12:09:00-05:00
  checked: resume banner placement and paginated main geometry
  found: ResumeBanner is a normal-flow child of main before the fixed-height paginated article; main itself is height-locked with overflow:hidden.
  implication: A resumed state adds height outside the page-budget model and can displace/clip the fixed-height reader rather than adapting within the mobile viewport.

- timestamp: 2026-08-22T12:18:00-05:00
  checked: Chromium geometry at 320x640 and 360x640, fresh and deterministically resumed
  found: Fresh article occupies y=97..591 while BackToLibrary is independently fixed at y=56..100 and PageIndicator at y=56..76. Resumed banner is 277px tall at 320 and 248px at 360, pushing the fixed 494px article to bottom=915 and bottom=886 respectively while main ends at y=640.
  implication: The screenshot is the expected consequence of independent fixed/in-flow layers; resumed content is hundreds of pixels outside the clipped main, and the mobile subheader is only incidental overlap between a fixed button and a separately inset article.

- timestamp: 2026-08-22T12:20:00-05:00
  checked: scroll-container state during resumed reproduction
  found: mainScrollTop and articleScrollTop remain zero in both widths.
  implication: Retained internal scroll is eliminated; flow displacement by the banner, not stale scroll state, causes the resumed geometry failure.

## Eliminated

## Current Focus

reasoning_checkpoint:
  hypothesis: "Mobile paginated chrome has no single structural owner: the 44px BackToLibrary/PageIndicator subheader is fixed while main still adds a 48px top inset, and ResumeBanner participates in flow ahead of an independently fixed-height article. This causes fragile first-page stacking and guarantees resumed article overflow."
  confirming_evidence:
    - "At both widths the fixed controls occupy y=56 while the article starts at y=97, proving the apparent subheader is synthesized by unrelated offsets rather than a reserved row."
    - "At 320px the resumed banner pushes article bottom to 915px against main bottom 640px; at 360px it pushes article bottom to 886px."
    - "All relevant scrollTop values are zero, ruling out retained internal scrolling."
  falsification_test: "The hypothesis would be false if a resumed banner did not change article coordinates or if the fixed controls already occupied an explicitly reserved mobile row shared by the article header."
  fix_rationale: "On mobile, make the article header itself the 44px subheader row, remove BackToLibrary from fixed positioning, align PageIndicator in that row, reduce the redundant top inset while expanding the synchronized dynamic-height budget, and render the transient resume card as a compact bottom sheet outside flow."
  blind_spots: "Headless Chromium cannot reproduce Brave's physical dynamic-toolbar transitions; final device verification remains necessary. Firefox/WebKit and 320/360 fresh/resumed states will be regression tested."
next_action: "Ask the user to verify the fresh and resumed article states on physical Android/Brave with the browser toolbar expanded and collapsed."

## Resolution

**root_cause:** Mobile paginated chrome was composed from unrelated positioning systems: fixed back/page controls, a separately inset fixed-height article, and an in-flow resume card. The resume card necessarily pushed the article outside main's clipped viewport, while the fixed first-page controls had no reserved shared row and could collide under mobile viewport changes.

**fix:** At mobile widths, converted the article header into an explicit 44px subheader, returned BackToLibrary to in-flow positioning, aligned the page indicator inside that row, truncated the quiet article title, reduced the redundant top inset, and expanded the synchronized 100dvh page budget. Converted ResumeBanner into a compact safe-area-aware fixed bottom sheet with two 44px actions so it no longer displaces the reader. Added fresh/resumed 320px and 360px geometry coverage and updated the prior quiet-header contract.

**verification:** 21/21 focused E2E checks passed across Chromium, Firefox, and WebKit (mobile-first chrome at 320/360 fresh+resumed, header geometry, quiet header/scrolling preservation). Focused dynamic-viewport unit test passed. TypeScript/API/Vite production build passed. Physical Android/Brave dynamic-toolbar verification remains the human checkpoint.

**files_changed:**
- src/app.css
- tests/e2e/chrome/mobile-first-page-chrome.spec.ts
- tests/e2e/chrome/paginated-quiet-header.spec.ts
