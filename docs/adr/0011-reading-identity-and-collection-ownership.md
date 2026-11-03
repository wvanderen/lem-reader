# Preserve reading identity; collections reference rather than own readings

Long web works need manageable pagination without losing the saved work or its annotations, while collections arrange existing readings into ordered plans. We decided that automatic division preserves the saved work and its canonical text/annotation identity, and that collections reference whole readings or chapters without owning their content or creating separate passage positions and reading attempts. A reading may belong to multiple collections; removing membership or deleting a collection preserves the work and its annotations, whereas deleting the work explicitly confirms affected collections and removes their references.

## Considered options

- **Reuse EPUB book ownership unchanged:** rejected for collections because current books own their chapter articles and deleting a book deletes those articles and associated records. That is appropriate precedent for a source-owned grouping, not for multiple non-owning playlists.
- **Replace an existing long article with newly identified chapter articles:** rejected as the default division behavior because it would change the anchors for saved positions, highlights, and notes. Division must not require reimport or silent annotation reattachment. This decision does not require wholesale migration of existing EPUB chapter storage.
- **Separate reading progress per collection:** deferred because it creates distinct reading attempts and competing resume positions. Collections initially share reading completion and the existing canonical passage position; their remembered active entry is navigation context only.

Chapter assignments may scope where reading starts and stops, but they do not introduce a second saved passage position. This extends [ADR 0001](0001-single-canonical-reading-location.md), rather than replacing its single-location rule. Stable chapter targets, shared chapter completion, and persistence compatibility still require explicit implementation design.

Confirmed through the [collections and long-works design interview](../specs/collections-and-long-works.md).
