# Unified annotation panel

Status: complete design confirmed by the user and implemented for the reader annotation panel.

## Purpose

Readers can change a highlight and write its note in one place, then return to reading with one dismissal. Preserve the reading location, passage visibility, and existing visual language.

## Confirmed decisions

- One annotation panel contains the highlight controls and note editor. Color and tags remain accessible while writing; changing color does not collapse the note or interrupt typing. The compact color row and bottom control row form the base; notes and tags expand above them. Add note appears only while the note editor is hidden; there is no redundant Edit note control when writing is already visible.
- Activating a highlight with an existing note shows its note immediately. A highlight without a note starts compact; Add note expands the editor above the controls.
- Close, Escape, and outside click end the whole annotation session after saving the note. Closing never means discard. Passage entry restores focus to the highlighted passage; list entry restores focus to the originating item and preserves list position.
- A failed note save keeps the panel and writing visible with Retry.
- Tags expand within the same panel without hiding the note. Opening the section focuses it; toggling Tags again closes it and restores focus to Tags. Escape dismisses an open suggestions menu first; otherwise it closes the whole panel.
- Delete considers current note text, including unsaved writing. With note content, confirmation replaces the editing view within the same panel; Keep highlight restores the intact editor. Without note content, deletion is immediate. Successful deletion closes the panel and focuses near the passage for passage entry. For list entry, focus moves to the next item, then the previous item or list heading if needed.
- Place the panel beside the passage where space permits, with a bottom sheet on narrow screens. Expansion never moves article content.
- On ordinary highlight activation, an existing note appears with keyboard focus starting at panel controls. An explicit Add note or Edit note action focuses the textarea. Merely opening highlight controls must not summon the mobile keyboard.
- Clearing all note text leaves the editor expanded for the current session. After closing and reopening, an empty highlight starts compact with Add note.

## Existing guarantees to preserve

- The native modal accessibility boundary made note editing reachable in VoiceOver. Controls available during note editing must live inside that same boundary.
- Existing persistence waits for outstanding and newer note writes before dismissal and retains recoverable drafts on failure.
- Placement preserves article layout and pagination; the passage stays visible where space permits. Typing does not reposition the editor.

## Scope and acceptance

Refine annotation interaction within the existing visual system; retain both reading modes, canonical annotation anchoring, and local-first persistence. Do not redesign reader chrome or change annotation data semantics.

The complete flow must allow changing color, editing tags, and writing a note in one panel; return to reading with one dismissal after a successful save; retain writing on save failure; and preserve predictable focus for passage and list entry. Verify keyboard, VoiceOver, narrow-screen keyboard placement, save failure/retry, draft recovery, and deletion with unsaved note content. Update tests that explicitly enforce the superseded split surfaces.

No unresolved product decisions remain in this brief. Implementation details must preserve these confirmed behaviors.

## Prior contract being revised

Issue #175 separated lightweight highlight controls from a writing-only note editor. The new design intentionally revisits that interaction. Issues #176–178 added passage-aware placement, safe save-before-dismiss, and draft recovery; those guarantees remain required.

## Implementation notes

The reader uses one native dialog for compact controls, expanded writing, inline tags, and deletion confirmation. The note is above the compact bar, with color choices immediately above the bottom action row. Normal expansion preserves the bar’s bottom edge when viewport space and passage visibility permit. Empty live regions remain mounted without reserving gaps; save feedback shares the bottom row. Existing selection, keyboard, and drawer entry points feed that session. Note writes drain before cascade deletion so delayed saves cannot recreate removed writing. Drawer actions explicitly take focus before opening, including Safari pointer activation, and deletion restores a surviving neighboring item.

The cross-library review panel retains its existing editor and list-return behavior; this change unifies the reader's previously split highlight controls and note editor.

## Verification

- Production build and repository lint passed.
- 612 targeted annotation and tag-picker unit tests passed.
- Unified-panel and modal focus checks passed across Chromium, Firefox, and WebKit, including drawer-origin focus and neighboring-item focus after deletion.
- Targeted Chromium checks covered save failure/retry, interrupted draft recovery, deletion rollback/cascade, note editing, color persistence, stable passage geometry, reduced motion, and 400% zoom.
- Desktop and mobile screenshots inspected; panel height fits its contents and article geometry remains stable. The design detector reported no findings on changed CSS lines; its existing palette advisories and unrelated border warning remain outside this change.
- Live VoiceOver was not exercised; native modal semantics, accessible naming, keyboard focus containment, and restoration were verified in browser tests.

### Compact-bar refinement

The follow-up layout replaces the stacked editor with the compact bar as its base: colors above a single bottom action row; note and tags above both. Add note appears only while writing is hidden. Tags toggles its own section, and Done shares the action row. Normal expansion keeps the bar in place and grows upward, with viewport and passage bounds taking precedence when space is constrained.

Verified with 598 annotation unit tests, 48 Chromium/Firefox/WebKit panel and focus checks, a production build, and repository lint. Desktop/mobile screenshots cover compact, writing, and tags-expanded states. Live VoiceOver remains a manual verification item.
