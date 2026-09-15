# A single canonical reading location, moved by read-aloud

The reader answers "where am I?" with one canonical grapheme offset into the article's normalized text (the `location` record), which drives resume and completion. We decided that read-aloud drives that same offset — listening _is_ reading — rather than maintaining a separate listen position, because two divergent answers to "where am I?" would betray the single-offset architecture and make resume ambiguous.

## Considered options

- **Separate listen position** (rejected): dual sources of truth; resume would have to guess which position the reader means, and completion/history would under-count listened articles.

## Consequences

- Listening marks reading progress: finishing an article by ear alone sets it finished, and position persistence fires while speech runs.
- The spoken word itself is never persisted (canonical offsets only), so this changes nothing about the annotation-selector contract.

---
Decided in [TTS read-aloud v1: what does "following words" mean in Lem Reader?](https://github.com/wvanderen/lem-reader/issues/23), 2026-09-15.
