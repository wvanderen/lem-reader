# Lem Reader

A calm, booklike reader for web articles and documents: long-form content is normalized once at ingest, then presented as responsive pages or a clean scrolling view — local-first, no accounts.

## Language

**Annotation panel**:
The controls for one highlight and its optional note and highlight tags, treated as one editing session. Closing saves the note and returns the reader to where they opened it.
_Avoid_: separate highlighter and note windows

**Annotations review**:
The cross-library destination listing highlights and article notes together, with All, Highlights, and Article notes type filters, search over quotes, notes, and annotation tags, combined counts labeled annotations, and per-row navigation — highlight rows jump to their passage; article-note rows carry an explicit Open article action at the saved reading position. Canonical route #/annotations; #/highlights and #/review remain legacy aliases.
_Avoid_: Highlights review (for the combined surface), highlights page

**Article note**:
An independent reflection attached to an article rather than a highlighted passage. An article can have multiple article notes, each editable and deletable.
_Avoid_: highlight note (when no passage is attached), article tag

**Annotation tag**:
A label attached to an individual highlight or article note, independent of the article's tags.
_Avoid_: article tag (when the label belongs to an annotation)

**Starter article**:
Getting Started with Lem Reader, the optional introductory article supplied with a new library.
_Avoid_: permanent fixture, mandatory tutorial

**Read-aloud**:
The reader feature that speaks an article's text while showing where speech is.
_Avoid_: TTS mode, text-to-speech, narrator

**Spoken word**:
The single moving indicator marking the word being spoken right now; it is position, not an annotation.
_Avoid_: TTS highlight, speech mark, cursor

**Follow level**:
How closely the reader can follow speech with a given voice — word, sentence, passage, or progress-only. Determined by the voice's timing capability, discovered per session; never promised by the platform.
_Avoid_: degradation ladder, fallback mode, capability tier

**Transport bar**:
The fixed reader control bar for read-aloud: play/pause, stop, skips, follow level, and rate.
_Avoid_: player, mini-player, audio controls

**No-content state**:
The surface's honest answer to "there is nothing here yet" — a title and one sentence, inviting the first action. Distinct from a filtered miss and from spare-chrome silence.
_Avoid_: blank state, placeholder

**Filtered miss**:
The surface's answer to "your filters matched nothing" — states the miss and offers the way back. A dead end with an escape hatch, never worded as if the library were empty.
_Avoid_: no results (when filters are the cause), empty state

**Spare-chrome silence**:
The deliberate choice to render nothing at zero for incidental chrome (rail, stats line, tag filter, nav destinations). Silence is the empty state; no backfill copy.
_Avoid_: hidden state, missing empty state

**Refusal**:
Ingest declining content it was offered — only when there is nothing reliable to show (no extractable text), the content cannot be reached, or safety forbids it — with a calm reason and the reader's input preserved. A no, not a failure. Readable text with rough edges is never refused; it is admitted flagged.
_Avoid_: error (for ingest declines), rejection

**Flagged**:
The third ingest outcome, between refusal and confident admission: an article whose text was read enters the library carrying a reader-visible limit — content that could not be processed, unreliable highlights — disclosed in place, never silently. "The article was admitted flagged."
_Avoid_: partial success, best-effort, degraded (as reader-facing words), warning-only admission

**Error**:
An operation that failed — loading, saving, importing. Named honestly as a failure of the reader, with a next step, never blamed on the content or the reader.
_Avoid_: refusal (for operation failures)

**Status region**:
The one polite, atomic live-region card that carries loading, error, and announcement copy on a surface. One per surface seam; it pre-exists so announcements are heard.
_Avoid_: toast, notification, alert (for non-urgent states)

**Article tag**:
A label attached to an article, used to organize the library and filter highlights by their article.
_Avoid_: highlight tag (when the label belongs to the article)

**Highlight tag**:
A label attached to an individual highlight; a kind of annotation tag, independent of the article's tags.
_Avoid_: article tag (when the label belongs to the highlight)

**Highlight slot**:
One of exactly five numbered presets (short name, one color choice, zero or more highlight tags) that quick highlight creation copies from. A slot is configuration, not a live relation: editing a slot never changes historical highlights, and the default slot is an explicit choice that applying another slot never rewrites. The color choice is either a named fill or a custom color snapshot — the reader-chosen hex stored verbatim on the slot and copied onto each highlight at creation — and the slot remembers its hex even while a named fill is active, dormant until Custom is chosen again; highlight records keep no dormant hex (a named pick on a highlight clears its snapshot — the slot is the memory home). The painted tint is always derived for the active theme (ADR 0008), so the snapshot stays independent of the mutable slot. The five slots are THE color vocabulary everywhere a highlight's color is chosen: the annotation panel's color row, the review color dialog, and the selection toolbar all render the same five pills — the default fill's label reads "Neutral" (the schema id stays "default"; slot 1's shipped name stays "Default"), so no pill and slot share a label.
_Avoid_: color preset, palette, quick color (the slot carries tags and a name, not only a color), color picker (the pills are the picker)

**Selection toolbar**:
The floating actions over a finished selection — the five slots and Highlight + note. It appears on pointer-up, never mid-sweep.
_Avoid_: popover, annotation panel (that is the dialog on an existing highlight), highlight toolbar

**Slot hold**:
Holding a digit 1–5 while sweeping a pointer selection; the slot arms and the release creates the highlight with it. Release order of digit and pointer does not matter; Escape during the sweep cancels.
_Avoid_: number shortcut, hotkey highlight (when meaning the pointer gesture)

**Undo grace**:
The short window after a creation during which Escape deletes the just-created, unedited highlight. Retired by an edit, an open dialog, or a newer creation; it survives scrolling and new selections.
_Avoid_: undo timer, auto-dismiss (that is the toolbar leaving)

**Escape ladder**:
Escape acts on the topmost layer only: the open dialog dismisses (saving), then the undo grace fires, then the fresh selection toolbar clears its selection, then an armed slot hold cancels. Escape is never a blanket delete.
_Avoid_: Escape deletes the highlight (as an unqualified description)
