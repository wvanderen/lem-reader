---
status: resolved
trigger: "Safari still moves paginated text beyond the bottom; Lem Reader's paragraph focus outline remains behind while VoiceOver moves to another paragraph, with intermittent stuckness."
created: 2026-08-09
updated: 2026-08-09
---

# Debug Session: Safari VoiceOver scroll and focus drift

## Symptoms

- **Expected behavior:** The paginated surface remains spatially fixed; VoiceOver has one current visual cursor; block navigation continues without a stale app highlight.
- **Actual behavior:** The text can still be displaced beyond the page bottom, and a brown paragraph outline remains on the page-entry block while VoiceOver's black cursor advances elsewhere.
- **Errors:** No runtime error reported.
- **Timeline:** Remaining after removing the measurable document scroll range and focusing the first semantic block.
- **Reproduction:** Turn a page in Safari with VoiceOver, navigate down through blocks, and continue beyond the visible page bottom.

## Current Focus

- hypothesis: Confirmed — the brown highlight was the browser focus-visible outline on the programmatic page-entry anchor, and Safari required a viewport-fixed root beyond zero layout scroll range.
- test: Assert the page-entry anchor has no competing visible outline, the root body is fixed in paginated mode, and wheel attempts preserve both scroll position and page-surface geometry.
- expecting: The app outline remains because the anchor keeps DOM focus while VoiceOver moves its independent cursor.
- next_action: Manual Safari + VoiceOver confirmation.
- reasoning_checkpoint: Screenshot shows the brown outline around the first paragraph while VoiceOver's black cursor and spoken text are on the second paragraph.
- tdd_checkpoint: Focused WebKit tests failed on a static body and missing page-entry marker before the fix; all six cross-browser focused cases pass afterward.

## Evidence

- The first page block carries `tabindex=-1` and retains DOM focus after handoff.
- Global `:focus-visible` draws a brown two-pixel outline on that block.
- VoiceOver virtual-cursor movement is not exposed as a DOM focus change, so the two visual indicators cannot be synchronized by page script.
- Zero `scrollHeight - innerHeight` does not cover Safari's root visual rubber-band behavior.

## Eliminated

- A saved article highlight: the outlined paragraph is not a `<mark>` and matches the global focus-ring style.
- Ordinary layout scroll range: current automated coverage already reports zero after the prior geometry fix.

## Resolution

- root_cause: The page-entry paragraph retained DOM focus after VoiceOver moved its independent virtual cursor, leaving Lem Reader's global focus ring behind as a misleading second highlight. Separately, overflow locking removed layout scroll but did not make Safari's root rendering surface immune to visual/rubber-band displacement.
- fix: Mark the first semantic block as a dedicated AT page-entry anchor and make only that programmatic, non-Tab-stop focus outline transparent; keep VoiceOver's cursor as the sole visible reading indicator. Fix the paginated body to the viewport while preserving the exact-height main and overflow/overscroll locks.
- verification: Six focused cases pass across Chromium, Firefox, and WebKit, including fixed-root computed style, zero scroll range, wheel-stable surface geometry, semantic first-block focus, transparent handoff outline, and uncancelled Up/Down. The full 72-test pagination matrix, 514 unit tests, lint, production build, and `git diff --check` pass.
- files_changed: `src/app.css`, `src/pagination/fragmentRenderer.tsx`, `tests/e2e/pagination/page-turn-controls.spec.ts`
