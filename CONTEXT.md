# Lem Reader

A calm, booklike reader for web articles and documents: long-form content is normalized once at ingest, then presented as responsive pages or a clean scrolling view — local-first, no accounts.

## Language

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
A label attached to an individual highlight, independent of the article's tags.
_Avoid_: article tag (when the label belongs to the highlight)
