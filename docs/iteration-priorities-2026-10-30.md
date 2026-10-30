# Iteration priorities — 2026-10-30

Shared understanding confirmed on 2026-10-30. This document records the agreed next-release scope and deferred backlog. Implementation has not started.

## Settled

- Design one bounded next release focused on article notes and an always-visible tag input in the annotation panel.
- Allow multiple independent article notes per article, each editable and deletable, distinct from notes attached to highlighted passages. Show article notes first within the article's annotation view.
- Keep diagnostics parked until there is a concrete failure or development decision to investigate.
- Include article notes in the cross-library review; rename Highlights to Annotations and provide Highlights and Article notes filters. Within an article, show article notes before passage annotations.
- Article notes have their own annotation tags, using the same vocabulary/filtering as tags on highlights. Article tags remain separate.
- Add article note is available in the article's annotation view without text selection. Opening/editing an article note preserves reading position; it has no passage destination.
- Order article notes newest-created first; editing does not reorder them. Manual pinning/reordering is deferred.
- Always show the tag field for both article notes and highlight annotations, without an expansion button. Use the bottom area on wide screens and wrap/stack on narrow screens to preserve editor/control usability.
- Reuse existing automatic saving and draft recovery. An untouched empty or whitespace-only draft creates no article note; unsaved work remains recoverable after save failure.
- Confirm deletion of a saved article note. Article deletion also removes its annotations, with that consequence disclosed in the article-deletion confirmation; leave no detached notes.
- Search article-note text and annotation tags alongside existing searchable fields. Retain article-tag filtering separately. Cross-library ordering follows the existing review sort; article-note-first grouping applies within an article's view only.
- Include article notes in versioned export/import, preserving identity, timestamps, tags, and article association and using existing conflict-resolution conventions. Older bundles remain importable; never invent a passage attachment.
- Reuse plain-text system-sans editor typography, saving, keyboard, and recovery behavior. Edit article notes directly from review. A separate Open article action opens at saved reading position. Rich-text editing is out of scope.
- Commit tag entry with Enter or an explicit add action, reusing normalization and suggestions. Escape clears an uncommitted entry before closing the editor. Blur does not silently create a tag.
- Require non-whitespace text for an article note. Tags alone remain in the recoverable draft; explain that text is required before saving a note.
- Emptying a saved article note does not implicitly delete it. Preserve the last saved version, retain the empty edit for recovery, and offer restoring text or explicit deletion.
- Cross-library Annotations defaults to All, with Highlights and Article notes filters. The reader header highlight count remains highlight-only; combined review counts are labeled annotations.
- Closing an editor returns focus to its opening control or note entry without moving reading position. Escape handles one layer per press: suggestion list, uncommitted tag text, then editor closure.

## Completion evidence

- Targeted Chromium, Firefox, and WebKit coverage verifies creation, editing, focus, filtering, tags, narrow screens, and zoom.
- Use existing persistence/portability seams to verify recovery, deletion, migration, and export/import.
- Include regression evidence that passage notes and their tags continue to work.
- Follow the shared-machine test discipline and existing CI gates; DOM emulators do not establish layout truth.

## Deferred

Personal bold/italic/underline annotations, unlimited named custom themes, progress-bar height/placement/gradients, curated fonts, article/global-header style customization, dedicated note typography controls, and diagnostic exports or usage measurement.

## Confirmation

The reader confirmed the next-release scope on 2026-10-30. Deferred backlog design choices remain intentionally open.

Published specification: [Article notes and always-visible annotation tags — #206](https://github.com/wvanderen/lem-reader/issues/206), labeled `ready-for-agent`.
