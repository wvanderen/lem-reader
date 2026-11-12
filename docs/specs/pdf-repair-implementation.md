# PDF structure repair implementation (#294, #298, #299)

## Reader flow

Library → Edit metadata for a saved PDF → **Repair PDF structure**.
Choose the original PDF and request **Preview repair**. The existing guarded
PDF ingestion pipeline processes those bytes without saving its new intake
record. The public repair store requires the original source fingerprint and
identical block/run text, language, footnotes, and block ordering. Changed text
or paragraph boundaries are refused; consent never authorizes guessed
annotation attachment.

The preview lists classification changes and discloses the before/after
chapter lists. Saved position, highlights, notes, tags, reading history and
whole-work completion are not rewritten. Chapter completion and collection
references survive only when the chapter destination's exact range, title and
meaning agree. Otherwise each specific completion removal and collection-entry
removal requires its own unchecked-by-default checkbox. Cancel, Escape, or
leaving the boxes unchecked makes no changes. No reference is silently
redirected to a different chapter.

**Apply repair** commits the work's new classification and structure, any
accepted reader-data removals, and a recovery snapshot in one IndexedDB
transaction. The work keeps its ID and text revision: no text coordinate has
changed. The lazy structure save now respects an established valid snapshot,
so an older background write cannot undo an explicit repair.

## Recovery and retention

Reopen the same repair disclosure to **Recover pre-repair version**, without
providing the PDF again. Recovery is transactional and restores the prior
classification/structure, removed chapter completion, affected collection
entries, and the corresponding remembered collection entry. It does not
replace the saved reading with a newly identified article.

Later passage movement, annotations and reader metadata are not overwritten.
Conflicting later structural or affected-collection edits cause a calm refusal;
the recovery version remains available rather than overwriting those decisions.
Storage failure rolls back both apply and recovery, including the checkpoint.

Dexie v14 appends `pdfRepairs`; prior schema versions are unchanged. One
unconsumed checkpoint per work is retained until recovery or explicit deletion
of the owning work. A second repair cannot silently evict it. Like local note
recovery drafts, these checkpoints are device-local and outside the versioned
library export. The repair preview discloses that limitation before application.

## Acceptance seams and evidence

- Real PDF adapter: numeric/unmatched/duplicate bookmarks preserve prose;
  meaningful matching titles, numbered headings and long display headings
  survive, with and without bookmarks. No paragraph reconstruction.
- Public repair/repository flow: preview → apply → recover, no preview mutation,
  original identity/location/highlights/notes, stable chapter references and
  completion, uncertain default refusal, scoped acceptance, stale consent,
  apply/recovery failure rollback, stale lazy snapshot, and owning-work deletion.
- Browser: the original synthetic PDF goes through the real API, is seeded in
  a legacy malformed representation, and is repaired from the original file.
  Both safe and consent-required cases exercise the actual metadata entry point,
  decline/reopen, application, and recovery. Desktop and narrow-width layouts
  use the existing dialog grammar, not a new UI framework.
- Pagination and exact-work gaps: see [navigation verification](pdf-navigation-verification.md).

The supplied private Engels PDF and its legacy export remain unavailable here.
The portable implementation and synthetic evidence do not establish the
reporter's exact jumping mechanism or substitute for the named-passage check.
Reference-platform calibration/performance and the authoritative PR gate remain
required before merge; budgets and runner routing have not changed.

## Review

Separate Standards and Spec passes compared the integration against
`fe3f730e85be88d274c43fd61af9cb1f5c5e3f45`; both passes shared this thread's
context, rather than claiming independent review. Findings addressed: the
font-only long-heading word-count veto, explicit positive stable-chapter
preservation and recovery-rollback evidence, shared inline-projector naming and
atomic-heading comments, and calm typed refusal/storage-error copy. The private
artifact and reference-platform evidence gaps remain explicit.
