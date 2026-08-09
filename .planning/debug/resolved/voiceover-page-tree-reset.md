---
status: resolved
trigger: "After advancing a page, VoiceOver gets stuck on the next paragraph; on the last page its visual selection stays on the title while it reads the paragraph."
created: 2026-08-09
updated: 2026-08-09
---

# Debug Session: VoiceOver page accessibility tree reset

## Symptoms

- **Expected behavior:** VoiceOver's cursor remains attached to article text across page turns and continues through subsequent blocks.
- **Actual behavior:** Speech moves into the new page but the visual cursor can remain on the persistent title/header; navigation then sticks on an early paragraph.
- **Errors:** No runtime error reported.
- **Timeline:** Observed after page fragments were keyed by page index to prevent stale imperative paragraph attributes.
- **Reproduction:** Navigate article text with VoiceOver, turn to the next/last page, then continue block navigation.

## Current Focus

- hypothesis: Confirmed — keying `PageFragmentView` by page index destroyed and recreated the visible accessibility subtree on every turn.
- test: Preserve the first semantic DOM node across same-kind page turns, retain declarative page-entry attributes, and avoid re-focusing when DOM focus already survived in the updated fragment.
- expecting: The current keyed implementation replaces the first paragraph node on every turn despite both pages starting with paragraphs.
- next_action: Manual Safari + VoiceOver confirmation.
- reasoning_checkpoint: Live Safari AX inspection shows only the visible page and no hidden measurement content, while the screenshot shows speech on page text but visual cursor on the persistent header.
- tdd_checkpoint: Before the fix, WebKit showed that the first semantic paragraph node was replaced across the turn; after the fix, node identity and focus survive in all three engines.

## Evidence

- Safari's live accessibility tree contains the article header, current page 3's two paragraphs, and controls only; hidden measurement content is absent.
- `PageFragmentView` is keyed by `currentPageIdx`, forcing a new DOM and AX subtree each turn.
- The original reason for the key was an imperatively retained paragraph `tabindex`; page-entry `tabindex` is now declarative and only applied to index zero.
- The title/header persists outside the keyed fragment and matches the stale VoiceOver visual cursor shown in the screenshot.

## Eliminated

- Hidden measurement content leaking into the AX tree: it is absent from live Safari accessibility state.
- Internal or root scrolling: both are now non-scrollable and the user confirms that bug is fixed.

## Resolution

- root_cause: `PageFragmentView` was keyed by page index as a defense against an older imperative `tabindex` mutation. Every turn therefore destroyed VoiceOver's current AX subtree. The persistent article header survived, so VoiceOver's visual cursor could fall back to the title while speech/programmatic focus moved into the recreated page, causing cursor divergence and stuck navigation.
- fix: Remove the page-index remount now that page-entry attributes are declarative. React preserves a same-kind first semantic node across turns. Focus restoration detects when that node already retained focus and avoids issuing a redundant `.focus()` command; it still focuses a new first block when the semantic kind actually changes.
- verification: The focused node-continuity regression passes across Chromium, Firefox, and WebKit; the full 72-test pagination matrix, 514 unit tests, lint, production build, and `git diff --check` pass. Live Safari AX inspection confirmed only visible page content is exposed.
- files_changed: `src/reader/PaginatedSurface.tsx`, `src/reader/PageTurnControls.tsx`, `tests/e2e/pagination/page-turn-controls.spec.ts`
