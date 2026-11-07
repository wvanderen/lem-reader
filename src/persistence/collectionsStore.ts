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
 * The ONE target-equality rule (contract 3): the exact same KIND + id is
 * the same target — a book entry and an article entry never collide, and
 * the same article in two collections is two different memberships. Both
 * arms narrow together, so no cast is needed.
 */
export function sameCollectionTarget(a: CollectionEntryTarget, b: CollectionEntryTarget): boolean {
  if (a.kind === "article" && b.kind === "article") return a.articleId === b.articleId;
  if (a.kind === "book" && b.kind === "book") return a.bookId === b.bookId;
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
