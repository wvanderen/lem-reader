# Lem Reader

A calm, booklike reader for web articles and documents. This glossary names the concepts the code is organized around.

## Language

**Reading location**:
The persisted normalized-text offset where a reader stopped in an article.
_Avoid_: bookmark, scroll position

**Reading position**:
Where the reader is right now, together with the policy that decides whether they have finished: the finished threshold, end-pins, and landing behavior.
_Avoid_: progress, read state

**Read state**:
The derived display state of a library item: unread, reading, or finished.
_Avoid_: status

**Library snapshot**:
One consistent read of the whole library: standalone articles, books with chapters, latest reading location per article, text totals, and tags.
_Avoid_: cache, library state

**Add outcome**:
The result of adding something to the library: saved, refused as a duplicate, or refused with a reader-visible reason.
_Avoid_: result, response

**Passage jump**:
Mode-aware navigation to a normalized-text offset, resolved to a page turn or a scroll.
_Avoid_: scroll-to, page-turn

**Selection lifecycle**:
The tracked life of a live text selection from appearance to dismissal, including toolbar state and saved-range restore.
_Avoid_: selection state
