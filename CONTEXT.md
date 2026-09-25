# Lem Reader

A calm, booklike reader for web articles and documents: long-form content is normalized once at ingest, then presented as responsive pages or a clean scrolling view — local-first, no accounts.

## Language

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
Ingest declining content it was offered — before or during reading — with a calm reason and the reader's input preserved. A no, not a failure.
_Avoid_: error (for ingest declines), rejection

**Error**:
An operation that failed — loading, saving, importing. Named honestly as a failure of the reader, with a next step, never blamed on the content or the reader.
_Avoid_: refusal (for operation failures)

**Status region**:
The one polite, atomic live-region card that carries loading, error, and announcement copy on a surface. One per surface seam; it pre-exists so announcements are heard.
_Avoid_: toast, notification, alert (for non-urgent states)
