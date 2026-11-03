# Collections and long works

Status: product design confirmed by the reader after five interview rounds. This document records the agreed scope and acceptance criteria; implementation has not started.

## Goal and delivery order

Read book-length web content in paginated mode without manual splitting, then organize separate readings into playlist-like collections for self-paced reading plans.

1. **Long-work reading first:** import the reference work, read all reliably extracted text in paginated mode, close it, and resume at the saved location without manually splitting it.
2. **Collections second:** assemble and follow ordered readings, including particular chapters, with shared progress and local-first backup.

Reference work: https://marxist.com/the-stalin-school-of-falsification/all-pages.htm

Language: [GLOSSARY.md](../../GLOSSARY.md). Identity and ownership rationale: [ADR 0011](../adr/0011-reading-identity-and-collection-ownership.md). Engineering sequence: [long-work implementation plan](long-work-implementation-plan.md).

## 1. Works, chapters, and reading parts

- A collection organizes separate readings; chapters divide a single work. The reference work remains one library item with chapters, not a flood of independent article rows.
- Automatic division prefers reliable publisher-provided chapter divisions, then meaningful headings. If a chapter is still too long, or useful headings are absent, subdivide at safe text boundaries.
- Generated subdivisions are **reading parts**, not purported author-written chapters. Do not invent authorial chapter titles when structure is uncertain.
- Preserve all reliably extracted text: no summaries, rewritten passages, omissions, or duplicate text introduced by division.
- Initial division operates on content already extracted from the imported document. A source index may guide boundaries, but importing one URL does not automatically crawl its linked chapter pages.
- No manual conversion step is required. Handle overlong supported text automatically when paged mode needs it, including unusually large EPUB chapters.
- No manual chapter-boundary, merge, or custom table-of-contents editor initially.

## 2. Identity and compatibility

- Dividing an already saved work preserves that work, its highlights, notes, and saved reading position. Reimport must not be required to benefit from long-work pagination.
- Font changes, viewport changes, and switching reading modes must not create new library items or invalidate annotations.
- Chapter and reading-part divisions remain stable across typography and viewport changes. Responsive page counts may change; a larger font must not defeat pagination merely because an existing part becomes too long.
- Preserve the existing canonical text-coordinate and annotation contracts. The product decision does not prescribe a wholesale migration of existing EPUB chapter storage.
- Listening and visual reading continue to move the same canonical saved location, consistent with [ADR 0001](../adr/0001-single-canonical-reading-location.md).

## 3. Navigation and orientation within a work

- Next/Previous page crosses chapter and reading-part boundaries without confirmation dialogs or a library detour.
- Read-aloud continues across those boundaries when reading the whole work.
- Make boundary transitions clear and keep chapter/part orientation stable.
- Scrolling mode remains available without mandatory part-by-part navigation.
- Local orientation such as “Chapter 4 · Part 2 · Page 6 of 18,” together with overall reading progress, is sufficient. A whole-work page total is not required.
- Opening or jumping into a long work must not require laying out every page of the entire work first.

## 4. Honest limits and failures

- Length alone must stop being a reason to abandon paged mode; handle long text through manageable pagination segments.
- Chaptering is not a promise to solve unsupported content, genuinely unpageable elements, extraction limitations, or processing failures.
- Explain those limits specifically and calmly. Do not silently switch reading modes or claim full success when content could not be processed.
- Preserve reliably extracted text and disclose limits, consistent with [ADR 0003](../adr/0003-reading-first-ingestion.md).
- Keep scrolling and the original source available as escape routes where applicable.
- These features do not relax existing ingest safety or content-size protections.

## 5. Collection membership and editing

- A collection is reader-named and ordered. It references readings rather than owning them.
- Entries may target whole articles, whole books/works, or particular chapters. Arbitrary passage ranges and generated reading parts are not entry targets initially.
- A reading can appear in multiple collections and remains independently available in the library.
- Support create, rename, add readings/chapters, reorder, remove entries, and delete collection.
- Reordering must have keyboard-accessible controls; drag cannot be the only interaction.
- Do not allow repeated copies of the exact same target within one collection initially.
- Removing an entry or deleting a collection preserves underlying readings, positions, highlights, and notes. Reordering does not change shared progress or positions.
- Deleting an underlying library work explicitly confirms affected collections, then removes references to that work and its chapters. Do not leave broken entries or silently retain deleted content.

## 6. Collection reading, resume, and completion

### Assignment boundaries

- Collection entries end with an explicit **Next reading** action rather than automatic advancement.
- A chapter-only assignment stops at that chapter boundary, including read-aloud, with a separate option to continue the underlying work.
- Keep the collection's identity and position in its order available for orientation, without media-player-style chrome.

### Resume

- Whole-work entries resume the work's normal saved position.
- Chapter entries resume that position only if it falls inside the target chapter; otherwise they open at the chapter's beginning.
- Reading from a collection updates the same shared work position, not a separate plan-specific passage position.
- **Continue collection** returns to the last active unfinished entry, falling back to the first unfinished entry.
- A finished collection shows completion rather than silently restarting.
- Remembering the active collection entry is navigation context, not a second saved passage position.

### Completion

- Collection progress is **finished entries / total entries**, not a length-weighted percentage.
- Progress/completion is shared with ordinary reading and across entries targeting the same work or chapter. Previously finished targets count as finished in a new plan.
- A chapter entry's completion must reflect that chapter, not merely visiting a later chapter. Do not treat a later saved location alone as proof that skipped chapters were read.
- Readers can explicitly mark a reading finished or unfinished without erasing its saved position.
- No separate per-plan reading attempts or completion history initially.

## 7. Export, import, and conflicts

- Ordinary library export/import preserves collections, their names, order, and chapter targets, together with referenced readings, saved positions, and annotations.
- Older backups without collections remain importable.
- There is no separate collection-only sharing/export feature initially.
- Conflicting collections offer **keep local**, **use imported**, or **keep both as separate collections**. Do not automatically merge reading order.
- Keeping both duplicates the arrangement, not automatically every underlying reading; referenced content still follows its explicit conflict handling.
- Invalid or missing work/chapter references must be reported. An invalid collection must not overwrite a valid local collection or quietly lose entries.

## 8. Out of scope initially

- Calendars, deadlines, recurring sessions, reminders, and scheduled assignments.
- Automatically crawling separate chapter URLs to assemble a work.
- Manual chapter-boundary editing, chapter merging, and custom table-of-contents authoring.
- Arbitrary passage-range or generated-reading-part collection targets.
- Nested collections and repeated copies of the same target within one collection.
- Separate reading attempts, plan-specific completion histories, and reread-plan workflows.
- Reading-time estimates, public sharing, collaboration, and collection-only export.
- A required whole-work page total.

## 9. Release acceptance

### Long-work delivery

- [ ] Import the reference work and read all reliably extracted text in paged mode without manually splitting it.
- [ ] Verify large text and narrow screens; stable chapter/part divisions must not make the page ceiling reappear as a length-only fallback.
- [ ] Close and resume at the saved passage.
- [ ] An already-saved long work benefits without reimport, preserving positions, highlights, and notes.
- [ ] An oversized EPUB chapter receives the same length-handling guarantee.
- [ ] Next/Previous and read-aloud cross work-internal boundaries correctly; scrolling remains available.
- [ ] Boundary creation introduces no omissions or duplicate passages, and source limitations remain visible.
- [ ] Opening/jumping does not require whole-work pagination; displayed counts are honest about their scope.

### Collection delivery

- [ ] Create, rename, populate, reorder, and remove collections/entries with both pointer and keyboard access.
- [ ] A reading can appear in multiple collections without being duplicated or losing its standalone library presence.
- [ ] Whole-work and chapter assignments honor their resume and stopping boundaries, including read-aloud.
- [ ] Continue collection and completion behave as specified, including already-finished readings and explicit finished/unfinished correction.
- [ ] Removing collections/entries preserves readings and annotations; deleting a work confirms affected collections and removes its references.
- [ ] Backup round trips retain order, chapter targets, readings, positions, and annotations; legacy backups still import.
- [ ] Import conflicts and invalid references are explicit; no silent order merge, dropped entries, or invalid replacement of a valid local collection.

### Both deliveries

- [ ] Preserve semantic HTML, keyboard and screen-reader access, visible focus, reduced motion, and reader mode choice.
- [ ] Meet the repository's existing browser and user-approved performance gates. Do not invent new numeric budgets or relax existing ones to ship this feature.

## 10. Implementation planning boundary

The product decisions above are confirmed. The [implementation plan](long-work-implementation-plan.md) separates stable content divisions from temporary layout windows and sequences bounded measurement/pagination, navigation/completion, structural metadata, EPUB/read-aloud continuity, and verification before Collections. Exact schemas and algorithms remain subject to implementation tests. Engineering choices must preserve the agreed identity/annotation contracts and be validated against existing saved libraries; they are not permission to reidentify works or silently infer chapter reading history.

## Investigation baseline — not a reproduced diagnosis

- Pagination currently falls back above 300 pages per article; other fallback causes exist. See `src/pagination/fragment.ts` and `src/pagination/overflowGuard.ts`.
- The reference URL fetched successfully and has a publisher-provided index with 14 chapter/part links. Its heading hierarchy does not map cleanly to that index.
- A page-ceiling fallback is plausible for this work, but the reported app failure has not been reproduced.
- EPUB chapters are separate canonical articles grouped by an owning Book record. Each chapter paginates independently and can still exceed the ceiling.
- Existing books own their chapter articles; removing a book deletes its chapters and associated records. That is not a collection ownership model.

No implementation changes or runtime verification have been performed as part of this design interview.
