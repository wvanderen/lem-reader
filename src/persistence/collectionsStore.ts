// src/persistence/collectionsStore.ts
// Issue #242 — the persistence seam for Collection records (issue #242:
// non-owning arrangements of whole readings; ADR 0011 — a collection
// references rather than owns, so NOTHING here touches article, book,
// location, highlight, or note rows: membership writes put ONE collection
// row and nothing else). Mirrors the booksStore seam conventions: header
// citing the locked decisions, discriminated load result on list reads,
// Zod-at-boundary on every read, classifyStorageError routing.
//
// Contracts (issue #242 acceptance criteria):
//   1. Zod-at-boundary on read (STATE-04): every collections row passes
//      CollectionSchema.safeParse; corrupt rows are dropped calmly on the
//      list (the booksStore listBooks precedent — one tampered row never
//      blocks the surface or masquerades as a collection) and surfaced as
//      null on the single get. Dexie-level throws route through
//      classifyStorageError.
//   2. Membership writes are transactional and reference-validating
//      (issue #242 AC — "reject invalid records and fail visibly /
//      transactionally without reporting a save that did not happen or
//      creating dangling references"): addCollectionEntry runs ONE rw
//      transaction over [collections, articles, books, settings] —
//      re-reads the row, refuses the exact same target twice within the
//      one collection, validates the target against the ONE composite
//      library read (listArticles — fixtures ∪ ingested rows, starter
//      removal honored; getBook for book targets — its Dexie reads JOIN
//      the transaction because those tables are listed), and only then
//      puts the updated row. A failure anywhere aborts the whole
//      transaction: the entry lands nowhere, the rejection propagates to
//      the caller's honest save-error state, and no partial/dangling
//      write can survive.
//   3. Non-repetition is PER COLLECTION (issue #242 AC): the exact same
//      target may not appear twice inside one collection, while the same
//      target in ANOTHER collection stays allowed — the many-to-many
//      membership rule. The comparison lives in the ONE exported
//      sameCollectionTarget helper so every surface (store refusal, view
//      "already added" marks, future slices) cannot disagree.
//   4. Name discipline: the seam trims and refuses empty/whitespace-only
//      names (an unnamed collection is unrepresentable — the readerTitle
//      min(1) discipline). A blank name rejects before ANY write.
//
// Issue #243 contracts (order editing, membership removal, collection
// deletion — the edit slices on the SAME non-owning foundation):
//   5. The edit writes stay one-row writes: moveCollectionEntry and
//      removeCollectionEntry each open a transaction over db.collections
//      ALONE. That scope IS the ownership guarantee (ADR 0011): no article,
//      book, location, highlight, note, or asset table is even REACHABLE
//      from inside — editing the arrangement can never cascade into the
//      library. Entry identity is untouched by both edit paths: moves
//      splice the SAME entry objects (id, target, addedAt byte-identical —
//      only array position changes), removal splices one out and never
//      rebuilds neighbors. Reorder therefore cannot reset reading progress,
//      saved positions, shared completion, or the remembered active entry
//      (it writes no table they live in), and membership edits cannot clone
//      library content.
//   6. Edit refusals are calm OUTCOMES (contract on addCollectionEntry):
//      an unknown collection and an unknown entry are distinct honest nos
//      ("collection-missing" / "entry-missing"), and a move clamped onto
//      its own place (the boundary-control no-op) is "no-move" — never a
//      fake success that bumps updatedAt for a write that changed nothing.
//      Out-of-range requests CLAMP to the nearest legal boundary: a drag
//      past the ends or a double-armed boundary press can never throw an
//      entry off-list. deleteCollection keeps the renameCollection
//      typed-error contract instead (a delete of nothing is a failure,
//      not a success — CollectionMissingError); it deletes whatever row
//      EXISTS without safeParse, the one write path allowed onto garbage,
//      because deleting unreadable data is cleanup, not a write onto it
//      (nothing is ever read from the row — unlike rename/move/remove,
//      which read-validate before modifying and throw CollectionCorruptError
//      per T-242a).
//
// Issue #247 — deleteCollection sweeps ONE more table: the collection's
// remembered ACTIVE-ENTRY row (collectionActiveEntriesStore) is part of the
// collection's own state (navigation context, ADR 0011 — not library
// content), so its deletion transaction now lists db.collectionActiveEntries
// alongside db.collections and deletes the context row in the same commit
// (the #245 removeCompletionsForDeletedWork discipline — cleanup commits or
// rolls back WITH the owning deletion; no orphan row outlives its
// collection). The LIBRARY tables stay unreachable — the ownership
// guarantee is unchanged.
//
// Threat register:
//   - T-242a (Tampering, corrupt persisted collection rows) →
//     CollectionSchema.safeParse per row on every read; corrupt rows
//     dropped calmly (listCollections) or surfaced as null (getCollection);
//     addCollectionEntry refuses to append onto a corrupt row (throws —
//     a visible failure, never a write onto garbage).
//   - T-242b (Tampering/Eccess, dangling entry references) → the
//     transactional existence validation in addCollectionEntry (contract 2);
//     no write path here can persist an entry whose target is absent from
//     the library.
import { db } from "./db";
import {
  COLLECTION_SCHEMA_VERSION,
  CollectionSchema,
  CollectionEntryTargetSchema,
} from "../content/schema";
import type { Collection, CollectionEntry, CollectionEntryTarget } from "../content/schema";
// The ONE composite library read (fixtures ∪ ingested rows — the same read
// model every library surface mounts). Called INSIDE the add transaction so
// its Dexie reads (articles + settings) join the transaction scope.
import { listArticles } from "../content/repository";
import { resolveWorkChapterTarget } from "../content/chapterTargets";
import { getBook } from "./booksStore";
import { classifyStorageError } from "./errors";

/**
 * Discriminated result of listing collections from Dexie (the booksStore
 * BooksLoadResult shape — callers switch one union for recovery routing).
 */
export type CollectionsLoadResult =
  | { ok: true; collections: Collection[] }
  | { ok: false; reason: "unavailable" | "corrupt" | "unupgradeable" };

/** An invalid collection name (empty after trim). Callers that pre-validate
 * (the create form disables an empty submit) never meet it; the seam still
 * refuses — a blank name never persists. */
export class CollectionInvalidNameError extends Error {
  constructor() {
    super("Collection name cannot be empty.");
    this.name = "CollectionInvalidNameError";
  }
}

/** The addressed collection row does not exist. Distinct from
 * CollectionCorruptError — a rename of nothing is a different failure than
 * a rename onto garbage, and the typed errors keep both honest. */
export class CollectionMissingError extends Error {
  constructor(id: string) {
    super(`Collection ${id} does not exist.`);
    this.name = "CollectionMissingError";
  }
}

/** The persisted collection row failed CollectionSchema (T-242a). Thrown by
 * the write paths only — a corrupt row aborts the transaction instead of
 * being written onto. */
export class CollectionCorruptError extends Error {
  constructor(id: string) {
    super(`Collection ${id} failed schema validation.`);
    this.name = "CollectionCorruptError";
  }
}

/**
 * The ONE target-equality rule (contract 3): the exact same KIND + ids is
 * the same target — a book entry and an article entry never collide, the
 * same article in two collections is two different memberships, and two
 * chapter targets collide only when BOTH identifying ids match (the book
 * AND the chapter article; the work AND the destination id). All arms
 * narrow together, so no cast is needed.
 */
export function sameCollectionTarget(a: CollectionEntryTarget, b: CollectionEntryTarget): boolean {
  if (a.kind === "article" && b.kind === "article") return a.articleId === b.articleId;
  if (a.kind === "book" && b.kind === "book") return a.bookId === b.bookId;
  // Issue #244 — chapter targets (both new arms): the exact same chapter
  // of the same work/book. A whole-book entry and one of its chapter
  // entries are DIFFERENT targets (a plan may hold the book and one of its
  // chapters); a work and one of its chapters likewise.
  if (a.kind === "book-chapter" && b.kind === "book-chapter") {
    return a.bookId === b.bookId && a.articleId === b.articleId;
  }
  if (a.kind === "work-chapter" && b.kind === "work-chapter") {
    return a.articleId === b.articleId && a.destinationId === b.destinationId;
  }
  return false;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return crypto.randomUUID();
}

/**
 * listCollections — load every Collection row, Zod-validated (STATE-04),
 * most-recently-updated first. Corrupt rows are dropped silently (T-242a).
 * Never throws — a Dexie-level failure routes through classifyStorageError
 * into the discriminated `{ok: false, reason}` arm (the listBooks
 * precedent).
 */
export async function listCollections(): Promise<CollectionsLoadResult> {
  try {
    const rows = await db.collections.toArray();
    const valid: Collection[] = [];
    for (const row of rows) {
      const parsed = CollectionSchema.safeParse(row);
      if (parsed.success) {
        valid.push(parsed.data);
      }
      // else: drop the corrupt row silently — STATE-04 says never coerce.
    }
    valid.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { ok: true, collections: valid };
  } catch (e) {
    return { ok: false, reason: classifyStorageError(e) };
  }
}

/**
 * getCollection — load one Collection by id, or null when absent OR corrupt
 * (the safeParse-on-read discipline; a corrupt row must never masquerade as
 * a readable collection — the getBook precedent).
 */
export async function getCollection(id: string): Promise<Collection | null> {
  const row = await db.collections.get(id);
  if (!row) return null;
  const parsed = CollectionSchema.safeParse(row);
  return parsed.success ? parsed.data : null;
}

/**
 * createCollection — persist a new, EMPTY collection (membership is added
 * explicitly; a collection is born with zero entries). Trims the name and
 * refuses blank input BEFORE any write (contract 4). Storage failures
 * propagate to the caller's honest save-error state.
 */
export async function createCollection(rawName: string): Promise<Collection> {
  const name = rawName.trim();
  if (name.length === 0) throw new CollectionInvalidNameError();
  const stamp = nowIso();
  const collection: Collection = {
    schemaVersion: COLLECTION_SCHEMA_VERSION,
    id: newId(),
    name,
    entries: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
  await db.collections.put(collection);
  return collection;
}

/**
 * renameCollection — retitle one collection inside a rw transaction (the
 * read-modify-write can never clobber a concurrent membership write the
 * way a blind put would). Trims + refuses blank names (contract 4); an
 * unknown id or a corrupt row throws (the caller's save-error state —
 * a rename of nothing is a failure, not a success).
 */
export async function renameCollection(id: string, rawName: string): Promise<Collection> {
  const name = rawName.trim();
  if (name.length === 0) throw new CollectionInvalidNameError();
  return db.transaction("rw", db.collections, async (): Promise<Collection> => {
    const row = await db.collections.get(id);
    // Absent and corrupt are DIFFERENT failures with different typed
    // errors — a rename of nothing is not a rename onto garbage.
    if (!row) throw new CollectionMissingError(id);
    const parsed = CollectionSchema.safeParse(row);
    if (!parsed.success) throw new CollectionCorruptError(id); // T-242a: abort, never write onto garbage
    const updated: Collection = { ...parsed.data, name, updatedAt: nowIso() };
    await db.collections.put(updated);
    return updated;
  });
}

/**
 * The outcome of one membership add. Refusals are calm OUTCOMES (the
 * subscribeToFeed precedent — a no, not a failure); storage failures throw
 * (the caller's honest save-error state). Each refusal names its own
 * reason — an absent target ("missing-target") and a target that fails
 * the target schema itself ("invalid-target") are different nos with
 * different honest copy, never one blurred answer.
 */
export type AddCollectionEntryOutcome =
  | { outcome: "added"; collection: Collection }
  | { outcome: "duplicate" }
  | { outcome: "missing-target" }
  | { outcome: "invalid-target" }
  | { outcome: "collection-missing" };

/**
 * Is this target a real reading in the ONE composite library? Runs INSIDE
 * the add transaction — its Dexie reads (articles, settings for the
 * starter-removal flag, books) join the transaction scope, so the
 * existence check and the append are one atomic step (contract 2).
 */
async function validateLibraryTarget(
  target: CollectionEntryTarget,
): Promise<"valid" | "missing-target" | "invalid-target"> {
  if (target.kind === "book") {
    return (await getBook(target.bookId)) !== null ? "valid" : "missing-target";
  }
  // Issue #244 — book-chapter: the book row must exist AND the chapter
  // article must exist AND belong to that book (ingestionMeta.bookId ===
  // bookId — the cross-record membership the shape cannot verify).
  if (target.kind === "book-chapter") {
    const book = await getBook(target.bookId);
    if (book === null) return "missing-target";
    const articles = await listArticles();
    const chapter = articles.find((a) => a.id === target.articleId);
    if (!chapter) return "missing-target";
    return chapter.ingestionMeta?.bookId === target.bookId ? "valid" : "invalid-target";
  }
  // Issue #244 — work-chapter: the article must be a standalone work and
  // the destinationId must resolve to a chapter destination of its live
  // structure (the ONE resolution the picker and the reader share — a
  // generated part id already failed the target SHAPE above, and a stale
  // destination id after a re-ingest fails here as missing).
  if (target.kind === "work-chapter") {
    const articles = await listArticles();
    const article = articles.find((a) => a.id === target.articleId);
    if (!article) return "missing-target";
    return resolveWorkChapterTarget(article, target.destinationId) !== null
      ? "valid"
      : "invalid-target";
  }
  const articles = await listArticles();
  const article = articles.find((a) => a.id === target.articleId);
  if (!article) return "missing-target";
  // The same whole-reading partition as LibrarySnapshot: a book member is
  // a chapter, not an independent reading. Enforce it at the write seam,
  // even when a caller bypasses the picker's standalone-article list.
  return article.ingestionMeta?.bookId ? "invalid-target" : "valid";
}

/**
 * addCollectionEntry — append one whole-reading target to the END of a
 * collection's order (array order IS the collection order; the entry id is
 * the stable identity later slices address). Runs ONE rw transaction over
 * every table the validation touches (contract 2):
 *
 *   - absent or corrupt collection row → refuses (`collection-missing`) or
 *     throws (corrupt — T-242a), never writes;
 *   - the exact same target already an entry → refuses (`duplicate`,
 *     contract 3 — per collection, not global);
 *   - target absent from the composite library → refuses
 *     (`missing-target`) — no dangling reference can persist;
 *   - otherwise appends, bumps `updatedAt`, puts the row, and returns the
 *     updated collection.
 *
 * Storage failures reject the whole transaction: the caller reports a save
 * that did not happen, and no partial state survives.
 */
export async function addCollectionEntry(
  collectionId: string,
  target: CollectionEntryTarget,
): Promise<AddCollectionEntryOutcome> {
  const parsedTarget = CollectionEntryTargetSchema.safeParse(target);
  // An invalid-SHAPED target is not an absent one: it fails schema
  // validation (AC — "schema validation reject[s] invalid records") and
  // gets its own refusal, never the absent-target copy.
  if (!parsedTarget.success) return { outcome: "invalid-target" };
  const validTarget = parsedTarget.data;
  return db.transaction(
    "rw",
    [db.collections, db.articles, db.books, db.settings],
    async (): Promise<AddCollectionEntryOutcome> => {
      const row = await db.collections.get(collectionId);
      if (!row) return { outcome: "collection-missing" };
      const parsed = CollectionSchema.safeParse(row);
      if (!parsed.success) throw new CollectionCorruptError(collectionId); // T-242a: abort, never write onto garbage
      const collection = parsed.data;
      if (collection.entries.some((entry) => sameCollectionTarget(entry.target, validTarget))) {
        return { outcome: "duplicate" };
      }
      const validation = await validateLibraryTarget(validTarget);
      if (validation !== "valid") return { outcome: validation };
      const entry: CollectionEntry = { id: newId(), target: validTarget, addedAt: nowIso() };
      const updated: Collection = {
        ...collection,
        entries: [...collection.entries, entry],
        updatedAt: nowIso(),
      };
      await db.collections.put(updated);
      return { outcome: "added", collection: updated };
    },
  );
}

/**
 * The outcome of one membership EDIT (move / remove — issue #243). The
 * same outcome discipline as AddCollectionEntryOutcome: refusals are
 * calm OUTCOMES, storage failures throw. "collection-missing" and
 * "entry-missing" are distinct nos (a stale view must know WHICH read it
 * needs to re-sync), and a move clamped onto its own place is an honest
 * "no-move" — never a fake success that bumps updatedAt for nothing.
 */
export type MoveCollectionEntryOutcome =
  | { outcome: "moved"; collection: Collection }
  | { outcome: "no-move" }
  | { outcome: "collection-missing" }
  | { outcome: "entry-missing" };

export type RemoveCollectionEntryOutcome =
  | { outcome: "removed"; collection: Collection }
  | { outcome: "collection-missing" }
  | { outcome: "entry-missing" };

/**
 * moveCollectionEntry — reorder ONE entry to `toIndex` (issue #243). Runs
 * ONE rw transaction over db.collections ALONE (contract 5 — the scope is
 * the ownership guarantee): reads the row, safeParses it (T-242a — a
 * corrupt row aborts, never a write onto garbage), finds the entry by its
 * STABLE id (never by array position alone — the CollectionEntrySchema id
 * contract), clamps out-of-range requests to the nearest legal boundary,
 * and splices. The spliced entries are the SAME objects — id, target, and
 * addedAt are byte-identical after a move, so entry/target identity stays
 * stable across reorders (AC) and reorder can never touch reading
 * progress, saved positions, shared completion, or duplicate-target
 * constraints (membership is unchanged; only position is).
 */
export async function moveCollectionEntry(
  collectionId: string,
  entryId: string,
  toIndex: number,
): Promise<MoveCollectionEntryOutcome> {
  return db.transaction("rw", db.collections, async (): Promise<MoveCollectionEntryOutcome> => {
    const row = await db.collections.get(collectionId);
    if (!row) return { outcome: "collection-missing" };
    const parsed = CollectionSchema.safeParse(row);
    if (!parsed.success) throw new CollectionCorruptError(collectionId); // T-242a
    const collection = parsed.data;
    const from = collection.entries.findIndex((entry) => entry.id === entryId);
    if (from === -1) return { outcome: "entry-missing" };
    // Clamp onto the nearest legal place: a boundary press or a drag past
    // the ends lands FIRST/LAST, never off-list. Clamped onto the entry's
    // own index (or asked onto it) is an honest no-move — nothing writes.
    const target = Math.max(0, Math.min(Math.trunc(toIndex), collection.entries.length - 1));
    if (target === from) return { outcome: "no-move" };
    const entries = [...collection.entries];
    const [moved] = entries.splice(from, 1);
    entries.splice(target, 0, moved!);
    const updated: Collection = { ...collection, entries, updatedAt: nowIso() };
    await db.collections.put(updated);
    return { outcome: "moved", collection: updated };
  });
}

/**
 * removeCollectionEntry — remove ONE entry from the collection's order
 * (issue #243). ONE rw transaction over db.collections ALONE (contract 5):
 * the membership splice is the ONLY write this function can express — no
 * cascade into articles, books, chapters, locations, highlights, notes,
 * or completion exists or is reachable, so removing an entry preserves
 * every underlying reading, position, and annotation by construction
 * (ADR 0011). The removed entry is addressed by its STABLE id; unknown
 * collection/entry are distinct calm refusals; a corrupt row aborts the
 * transaction (T-242a) instead of being written onto.
 */
export async function removeCollectionEntry(
  collectionId: string,
  entryId: string,
): Promise<RemoveCollectionEntryOutcome> {
  return db.transaction("rw", db.collections, async (): Promise<RemoveCollectionEntryOutcome> => {
    const row = await db.collections.get(collectionId);
    if (!row) return { outcome: "collection-missing" };
    const parsed = CollectionSchema.safeParse(row);
    if (!parsed.success) throw new CollectionCorruptError(collectionId); // T-242a
    const collection = parsed.data;
    const index = collection.entries.findIndex((entry) => entry.id === entryId);
    if (index === -1) return { outcome: "entry-missing" };
    const entries = [...collection.entries];
    entries.splice(index, 1);
    const updated: Collection = { ...collection, entries, updatedAt: nowIso() };
    await db.collections.put(updated);
    return { outcome: "removed", collection: updated };
  });
}

/**
 * deleteCollection — delete ONE collection row (issue #243). ONE rw
 * transaction over db.collections PLUS the collection's own
 * collectionActiveEntries row (issue #247 — the remembered active entry is
 * the collection's own navigation context, swept in the same commit so no
 * orphan outlives the collection; the #245 cleanup discipline): the
 * deletion is the ONLY write this function can express, so deleting a
 * collection can never remove an article, book, chapter, location,
 * highlight, note, or completion row — the ADR 0011 non-ownership
 * guarantee, structurally (the transaction scope lists no library table).
 * An absent id throws CollectionMissingError (the renameCollection contract
 * — a delete of nothing is a failure, not a silent success). The existing
 * row is deleted WITHOUT safeParse: the one write path allowed onto
 * garbage, because deleting unreadable data is cleanup — nothing is read
 * from the row, so nothing can be validated or written onto it.
 */
export async function deleteCollection(id: string): Promise<void> {
  return db.transaction(
    "rw",
    [db.collections, db.collectionActiveEntries],
    async (): Promise<void> => {
      const row = await db.collections.get(id);
      if (!row) throw new CollectionMissingError(id);
      await db.collections.delete(id);
      // Issue #247 — the collection's own memory goes with it (contract 4
      // in collectionActiveEntriesStore). No validation: the row is a
      // navigation pointer whose owner is gone.
      await db.collectionActiveEntries.delete(id);
    },
  );
}
