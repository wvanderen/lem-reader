---
status: resolved
trigger: "Arrowing down with VoiceOver past the bottom in paginated mode still pushes content off the page, including on the last page."
created: 2026-08-09
updated: 2026-08-09
---

# Debug Session: VoiceOver internally scrolls paginated surface

## Symptoms

- **Expected behavior:** The visible page surface cannot scroll internally; VoiceOver navigation beyond the final block leaves page geometry fixed.
- **Actual behavior:** VoiceOver Down past the page bottom pushes visible content upward even on the last page.
- **Errors:** No runtime error reported.
- **Timeline:** Persists after root/document overflow and overscroll were locked.
- **Reproduction:** In paginated mode, navigate to the bottom of a page with VoiceOver and continue pressing Down.

## Current Focus

- hypothesis: Confirmed — `.paginated-surface { overflow:hidden }` remained programmatically scrollable because of its full-article measurement child.
- test: Directly assign a large `scrollTop` to `.paginated-surface` and assert it remains zero; verify its computed overflow is `clip`.
- expecting: Before the fix, the article accepts a nonzero internal scrollTop despite the root window remaining at zero.
- next_action: Manual Safari + VoiceOver confirmation.
- reasoning_checkpoint: CSS overflow hidden clips user-visible overflow but still creates a scroll container accessible to programmatic and assistive-technology scrolling.
- tdd_checkpoint: Before the fix, WebKit accepted a programmatic article `scrollTop` of 740px; after switching to `overflow:clip`, the value remains zero across all three engines.

## Evidence

- Root `window.scrollY` and page-surface bounding geometry are already stable under ordinary wheel input.
- `.paginated-surface` still declares `overflow: hidden`.
- `.article-body-measurement` is an absolutely positioned full-document renderer inside `.paginated-surface`, producing large internal overflow dimensions.
- VoiceOver can request accessibility scrolling without emitting the ordinary wheel behavior covered by the existing regression.

## Eliminated

- Root document scroll/rubber-band as the only cause: the user still reproduces after root locking.
- Missing next-page content: the issue reproduces on the final page, consistent with internal container displacement rather than navigation to real content.

## Resolution

- root_cause: The outer document was fixed, but `.paginated-surface` used `overflow:hidden`, which is still a scroll container. Its absolutely positioned measurement copy contains the entire article and enlarges the internal scrollable overflow. VoiceOver could therefore scroll the article element itself while navigating beyond the visible page, displacing content even on the last page.
- fix: Replace `.paginated-surface`'s `overflow:hidden` with `overflow:clip`. This preserves visual clipping and pagination geometry but removes the element's internal scroll offset entirely.
- verification: The focused regression demonstrated `scrollTop = 740` before the fix and `scrollTop = 0` afterward in Chromium, Firefox, and WebKit. The full 72-test pagination matrix, 514 unit tests, lint, production build, and `git diff --check` pass.
- files_changed: `src/app.css`, `tests/e2e/pagination/page-turn-controls.spec.ts`
