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
