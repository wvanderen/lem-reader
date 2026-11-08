// src/persistence/collectionReferenceCleanup.ts
// Issue #245 — delete-time collection-reference cleanup (ADR 0011: "deleting
// the work explicitly confirms affected collections and removes their
// references"). The ONE algebra answering, for any library-work deletion,
// WHICH collection entries reference it and HOW they leave:
//
//   - entryReferencesDeletedWork — the pure reference-of-deletion rule. The
//     confirm dialog's "affected collections" query and the transactional
//     cleanup both ask this ONE function, so they can never disagree about
//     what counts as a reference (the sameCollectionTarget discipline —
//     one rule, every consumer).
//   - findCollectionsReferencingWork — the read-side query behind the
//     destructive confirm dialogs (identify affected collections BEFORE the
//     deletion — issue #245 AC). A read, never a write.
//   - deletedBookWork — the complete deletion shape for a book: the
//     declared TOC ∪ every live chapter row (the removeBook live-truth
//     discipline), so the dialog describes the SAME deletion the
//     transaction will perform.
//   - removeReferencesToDeletedWork — the transaction-scoped write. MUST be
//     called inside the content deletion's own rw transaction (the caller
//     lists db.collections alongside the content tables) so the reference
//     strip commits or rolls back WITH the content deletion — cancellation
//     or a write failure can never leave half-deleted content/membership
//     (issue #245 AC).
//
// What is NOT here (the ownership boundaries this module keeps):
//   - No content-table write. This module never touches articles, books,
//     locations, highlights, notes, or assets — it is called BY the owning
//     deletion cascades (DexieLibrarySource.remove, booksStore.removeBook),
//     whose transactions remain the only content-deletion boundary.
//   - No invocation of the owning cascade in reverse: nothing here deletes
//     a book because a collection row changed (ADR 0011 — collections
//     reference rather than own; membership edits stay collections-table-
//     alone writes, contract 5 of collectionsStore).
//
// Deliberately NOT a part of collectionsStore: that seam imports
// content/repository and booksStore (its target validation), and both
// content-deletion seams would then import collectionsStore back — cycles
// for a helper that needs only db + schema. This module imports ONLY db +
// schema, keeping the graph acyclic: LibrarySource → here, booksStore →
// here, and the dialogs import the query directly.
//
// Threat register:
//   - T-245a (Tampering, corrupt persisted collection row during cleanup)
//     → rows that fail CollectionSchema.safeParse are SKIPPED, never
//     written onto (the T-242a write discipline — we cannot rebuild a row
//     we cannot read; a corrupt row is invisible to every validated read,
//     so it cannot surface a broken entry). The row stays byte-untouched.
//   - T-245b (Repudiation, false success) → the cleanup returns the count
//     of collections it rewrote and throws through the owning transaction
//     on failure; the dialogs' honest-failure machinery (issue #98) owns
//     what the reader sees.
import { db } from "./db";
import { CollectionSchema } from "../content/schema";
import type { Collection, CollectionEntryTarget } from "../content/schema";

/**
 * The library work a content deletion removes, expressed in the ids its
 * collection entries may carry. An ARTICLE deletion covers the whole work
 * AND its chapter targets (a work-chapter entry references the article);
 * a BOOK deletion covers the book row AND every chapter article its
 * cascade removes (declared TOC ∪ live bookId carriers — the removeBook
 * live-truth set, surfaced through deletedBookWork).
 */
export type DeletedWork =
  | { kind: "article"; articleId: string }
  | { kind: "book"; bookId: string; chapterArticleIds: readonly string[] };

/** The id sets ONE DeletedWork expands to (derived once per query, shared
 * by every entry check — never rebuilt per entry). */
interface DeletedWorkIds {
  articleIds: ReadonlySet<string>;
  bookIds: ReadonlySet<string>;
}

function deletedWorkIds(deleted: DeletedWork): DeletedWorkIds {
  if (deleted.kind === "article") {
    return { articleIds: new Set([deleted.articleId]), bookIds: new Set<string>() };
  }
  return { articleIds: new Set(deleted.chapterArticleIds), bookIds: new Set([deleted.bookId]) };
}

/** The rule against ALREADY-DERIVED id sets — the ONE implementation both
 * the public entryReferencesDeletedWork and the transactional cleanup
 * call, so the confirm query and the write can never disagree. */
function referencesDeletedIds(target: CollectionEntryTarget, ids: DeletedWorkIds): boolean {
  if (target.kind === "article") return ids.articleIds.has(target.articleId);
  if (target.kind === "book") return ids.bookIds.has(target.bookId);
  if (target.kind === "book-chapter") {
    return ids.bookIds.has(target.bookId) || ids.articleIds.has(target.articleId);
  }
  return ids.articleIds.has(target.articleId); // work-chapter
}

/**
 * The ONE reference-of-deletion rule: an entry must go when its target
 * names ANY id the deletion removes. The four target kinds against the two
 * deletion shapes:
 *
 *   - `article` entries go when the deleted ARTICLE is the target (a book
 *     deletion never matches an article entry).
 *   - `book` entries go when the deleted BOOK is the target.
 *   - `book-chapter` entries go when EITHER id is in the deletion — the
 *     chapter article row is going (by articleId) or its whole book is
 *     (by bookId). A chapter entry survives only if both its book and its
 *     chapter article survive.
 *   - `work-chapter` entries go when their work article is the deleted
 *     article (the destinationId lives inside that article's structure —
 *     the structure dies with the article).
 */
export function entryReferencesDeletedWork(
  target: CollectionEntryTarget,
  deleted: DeletedWork,
): boolean {
  return referencesDeletedIds(target, deletedWorkIds(deleted));
}

/**
 * findCollectionsReferencingWork — the confirm dialogs' input: every
 * VALIDATED collection (most-recently-updated first, the listCollections
 * order) holding at least one entry that references the deleted work.
 * Calm read discipline: corrupt rows are dropped, never surfaced as
 * collections (STATE-04 — they cannot masquerade, so they cannot inflate
 * the affected list), and a collections-read failure routes to [] — the
 * dialog then makes NO claim about collections (it never claims "no
 * collections are affected" on data it could not read; the transactional
 * cleanup below stays authoritative either way).
 */
export async function findCollectionsReferencingWork(deleted: DeletedWork): Promise<Collection[]> {
  let rows: Collection[];
  try {
    const raw = await db.collections.toArray();
    const valid: Collection[] = [];
    for (const row of raw) {
      const parsed = CollectionSchema.safeParse(row);
      if (parsed.success) valid.push(parsed.data);
      // else: drop the corrupt row silently — the listCollections discipline.
    }
    valid.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    rows = valid;
  } catch {
    return []; // A read failure is not an "unaffected" answer — see doc above.
  }
  return rows.filter((collection) =>
    collection.entries.some((entry) => entryReferencesDeletedWork(entry.target, deleted)),
  );
}

/**
 * deletedBookWork — the COMPLETE deletion shape for one book: the declared
 * TOC ∪ every live article row carrying bookId (the removeBook live-truth
 * discipline — live truth wins over the declared list so a partial import
 * still describes the full deletion). The confirm dialog asks through this
 * helper so the collections it names cover exactly what the transaction
 * will remove.
 */
export async function deletedBookWork(
  bookId: string,
  declaredChapterIds: readonly string[],
): Promise<DeletedWork> {
  const ids = new Set<string>(declaredChapterIds);
  const live = await db.articles.where("bookId").equals(bookId).primaryKeys();
  for (const key of live) ids.add(String(key));
  return { kind: "book", bookId, chapterArticleIds: [...ids] };
}

/**
 * removeReferencesToDeletedWork — strip every entry referencing the
 * deleted work from every collection row. TRANSACTION-SCOPED: the caller
 * (DexieLibrarySource.remove / booksStore.removeBook) invokes this INSIDE
 * its own rw transaction whose table list includes db.collections, so the
 * reference strip commits or rolls back WITH the content deletion — the
 * transactional boundary the issue demands. Never opens its own
 * transaction (a nested open would sub-transact, hiding the shared-
 * boundary contract from the caller's table list).
 *
 * Per row: rows that fail CollectionSchema are SKIPPED (T-245a — never a
 * write onto garbage; a corrupt row is already invisible to every
 * validated read); rows without referencing entries are never rewritten
 * (no spurious updatedAt bump — an unaffected collection keeps its exact
 * stamp, and a zero-reference deletion writes NOTHING); a changed row is
 * re-put with its surviving entries IN ORDER (array order IS the
 * collection order — relative order of survivors is byte-preserved) and a
 * bumped updatedAt (membership changed — the removeCollectionEntry
 * precedent). Collections that lose their last entry stay PUT (an emptied
 * collection survives as an empty collection — never deleted here).
 *
 * Returns the number of collection rows rewritten (0 = nothing referenced
 * the work).
 */
export async function removeReferencesToDeletedWork(deleted: DeletedWork): Promise<number> {
  const ids = deletedWorkIds(deleted);
  const rows = await db.collections.toArray();
  let rewritten = 0;
  for (const row of rows) {
    const parsed = CollectionSchema.safeParse(row);
    if (!parsed.success) continue; // T-245a: skip — never write onto garbage.
    const collection = parsed.data;
    if (!collection.entries.some((entry) => referencesDeletedIds(entry.target, ids))) continue;
    const entries = collection.entries.filter((entry) => !referencesDeletedIds(entry.target, ids));
    const updated: Collection = {
      ...collection,
      entries,
      updatedAt: new Date().toISOString(),
    };
    await db.collections.put(updated);
    rewritten += 1;
  }
  return rewritten;
}
