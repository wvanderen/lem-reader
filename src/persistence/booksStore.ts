// src/persistence/booksStore.ts
// Plan 12-03 Task 1 — Persistence seam for Book records + their chapter
// articles (Phase 12 ING-05, D12-01..D12-04). Mirrors the locationStore /
// settingsStore seam conventions: header citing the locked decisions,
// `import type` for types (verbatimModuleSyntax), discriminated load result
// on list reads, Zod-at-boundary on every read, classifyStorageError routing.
//
// Contracts (12-03-PLAN.md §must_haves truths):
//   1. saveBook writes the book row + ALL chapter article rows in ONE Dexie
//      transaction — a half-saved book is impossible (atomicity discipline;
//      the 12-PATTERNS Pitfall 11 #3 anti-pattern is per-row writes outside
//      a transaction). Puts only — no Zod, no crypto, no network inside the
//      transaction (the 09-04 applyImport closure rule).
//   2. removeBook cascades in ONE transaction: the book row + every
//      chapter's articles, highlights, notes, and location rows are ALL
//      deleted — zero rows remain across the stores (12-RESEARCH Pitfall 7:
//      stranded annotations). The collect-before-delete discipline comes
//      from DexieLibrarySource.remove (LibrarySource.ts L116-125): highlight
//      ids are collected BEFORE the highlights delete because in-transaction
//      reads see pre-delete state — querying after would return zero rows
//      and the notes cascade would orphan.
//   3. Zod-at-boundary on read (STATE-04): every books row passes
//      BookSchema.safeParse; corrupt rows are dropped calmly (the
//      locationStore loadAllLocations precedent — a single corrupt row never
//      blocks the rest of the library). Dexie-level throws route through
//      classifyStorageError (the shared errors.ts classifier).
//   4. hasBook is the dedupe-refuse primitive the add dialog calls BEFORE any
//      save (the D7-07 precedent, applied at book level: re-uploading
//      identical bytes produces the same content-hash book id and surfaces
//      the calm already-in-library copy instead of a second save).
//
// Threat register (12-03-PLAN.md `<threat_model>`):
//   - T-12-11 (Tampering, corrupt persisted book rows) → BookSchema
//     .safeParse per row on every booksStore read; corrupt rows dropped
//     calmly (listBooks) or surfaced as null (getBook).
//   - T-12-12 (Tampering, stranded annotations on book removal) →
//     removeBook's single-transaction cascade is proven by the zero-rows
//     test (tests/unit/persistence/books-store.test.ts).
import { db } from "./db";
import type { AssetRecordRow } from "./db";
import { BookSchema } from "../content/schema";
import type { Book } from "../content/schema";
import type { CanonicalArticle } from "../content/schema";
import type { ValidatedAsset } from "../ingestion/IngestionClient";
import { classifyStorageError } from "./errors";

/**
 * Discriminated result of listing books from Dexie.
 * - `ok: true`  → the load succeeded; corrupt rows were dropped (STATE-04).
 * - `ok: false` → recovery routing required; `reason` selects the surface:
 *   - `"unavailable"`   → StorageBanner (storage full / blocked / denied)
 *   - `"unupgradeable"` → WipeConfirm (Dexie UpgradeError/VersionError)
 *   - `"corrupt"`       → reserved vocabulary parity with locationStore;
 *                          list reads drop corrupt rows, so this member is
 *                          never produced here (classifyStorageError never
 *                          returns it) — kept so callers switch one union.
 */
export type BooksLoadResult =
  | { ok: true; books: Book[] }
  | { ok: false; reason: "unavailable" | "corrupt" | "unupgradeable" };

/**
 * A Book with `addedAt` optional — the saveBook parameter shape. Callers
 * that parsed a full Book (the add dialog via ingestEpub) pass it through
 * unchanged; callers that hand-build a record may omit `addedAt` and
 * saveBook stamps it (see saveBook).
 */
export type BookInput = Omit<Book, "addedAt"> & { addedAt?: string };

/**
 * BookAsset — one chapter-owned asset for the saveBook path: a
 * ValidatedAsset with the owning chapter's articleId attached (the flat
 * list keyed by articleId, consistent with the 20-06 book envelope shape —
 * assets span multiple chapter articles, so each entry carries its owner).
 */
export type BookAsset = ValidatedAsset & { articleId: string };

/**
 * listBooks — load every Book row, Zod-validated (STATE-04). Corrupt rows
 * are dropped silently (T-12-11); a single malformed row must not block the
 * library. Never throws — a Dexie-level failure routes through
 * classifyStorageError into the discriminated `{ok: false, reason}` arm so
 * the library surface can route recovery (the locationStore precedent).
 */
export async function listBooks(): Promise<BooksLoadResult> {
  try {
    const rows = await db.books.toArray();
    const valid: Book[] = [];
    for (const row of rows) {
      const parsed = BookSchema.safeParse(row);
      if (parsed.success) {
        valid.push(parsed.data);
      }
      // else: drop the corrupt row silently — STATE-04 says never coerce.
    }
    return { ok: true, books: valid };
  } catch (e) {
    return { ok: false, reason: classifyStorageError(e) };
  }
}

/**
 * getBook — load one Book by id, or null when absent OR corrupt (the
 * safeParse-on-read discipline; a corrupt row must never masquerade as a
 * readable book). Dexie-level throws propagate to the caller, mirroring
 * DexieLibrarySource.open.
 */
export async function getBook(id: string): Promise<Book | null> {
  const row = await db.books.get(id);
  if (!row) return null;
  const parsed = BookSchema.safeParse(row);
  return parsed.success ? parsed.data : null;
}

/**
 * hasBook — the book-level dedupe-refuse check (D7-07 precedent). The
 * the add dialog calls this BEFORE saveBook; if it returns true, the control
 * surfaces "Already in your library." and never calls saveBook (no
 * overwrite, no orphaned chapter annotations).
 */
export async function hasBook(id: string): Promise<boolean> {
  return (await db.books.get(id)) !== undefined;
}

/**
 * saveBook — write a book + ALL its chapter articles (+ chapter-owned asset
 * rows) in ONE Dexie transaction (atomicity discipline — a half-saved book
 * is impossible; Phase 20 extends it to assets — a chapter's blobs land
 * with the chapter or not at all, D20-04/D20-15).
 *
 * The closure is puts-only: no Zod, no crypto, no network inside the
 * transaction (the 09-04 applyImport closure rule). `book`, `articles`, and
 * `assets` are validated by construction (the add dialog's only producer is
 * ingestEpub, which runs the IngestionResponseSchema + per-article
 * ArticleSchema.parse loop + the asset re-validation chain on the network
 * read — STATE-04 defense-in-depth).
 *
 * `addedAt` and every asset `createdAt` are stamped BEFORE the transaction
 * opens (the stamp-before-transaction discipline) so the closure stays a
 * pure put/delete sequence.
 *
 * Per-chapter asset upsert (D20-07, mirroring the article upsert): each
 * chapter's OLD asset rows are range-deleted inside the SAME transaction
 * before the new puts — a re-upload leaves no orphan blob. The default
 * `assets = []` keeps every existing call site compiling and behaving
 * unchanged (real book-asset wiring is 20-06 scope).
 *
 * The transaction uses Dexie's readonly-ARRAY overload (not the tuple
 * form): the 20-05 import path will grow to SEVEN tables — beyond the tuple
 * overloads, which stop at five — so the array form is the standardized
 * shape here (the applyImport 12-07 precedent).
 *
 * A throw (e.g. QuotaExceeded) propagates to the caller (the add dialog),
 * which surfaces the calm catch-all copy; the transaction guarantees NO
 * partial write ever landed.
 */
export async function saveBook(
  book: BookInput,
  articles: CanonicalArticle[],
  assets: BookAsset[] = [],
): Promise<void> {
  const stamped: Book = book.addedAt
    ? (book as Book)
    : { ...book, addedAt: new Date().toISOString() };
  // Stamp + row-build BEFORE the transaction (puts-only closure rule);
  // group the flat asset list per owning chapter article.
  const createdAt = new Date().toISOString();
  const rowsByArticle = new Map<string, AssetRecordRow[]>();
  for (const asset of assets) {
    const list = rowsByArticle.get(asset.articleId) ?? [];
    list.push({
      articleId: asset.articleId,
      assetId: asset.assetId,
      contentType: asset.contentType,
      byteLength: asset.byteLength,
      // TS 7 BlobPart strictness (the 09-01 BufferSource lesson): copy
      // into a fresh ArrayBuffer-backed Uint8Array (the Blob constructor
      // copies the bytes anyway).
      data: new Blob([new Uint8Array(asset.bytes)], {
        type: asset.contentType,
      }),
      createdAt,
    });
    rowsByArticle.set(asset.articleId, list);
  }
  await db.transaction("rw", [db.books, db.articles, db.assets], async () => {
    await db.books.put(stamped);
    for (const article of articles) {
      // Denormalize the top-level `bookId` onto the stored row so the v5
      // Dexie index ("...,*tags, bookId") can serve grouping reads
      // (D12-01) + removeBook's live-truth cascade. The CANONICAL contract
      // stays `ingestionMeta.bookId` — ArticleSchema's z.object strips the
      // unknown top-level key on every read, so the stored row parses
      // byte-identically through the Zod-at-boundary discipline.
      await db.articles.put({ ...article, bookId: stamped.id });
      // Per-chapter asset upsert replacement (D20-07) — same transaction.
      await db.assets.where("articleId").equals(article.id).delete();
      for (const row of rowsByArticle.get(article.id) ?? []) {
        await db.assets.put(row);
      }
    }
  });
}

/**
 * removeBook — full cascade in ONE Dexie transaction over books + articles
 * + highlights + notes + location + assets (12-RESEARCH Pitfall 7 — no
 * stranded annotations; Phase 20 adds the chapter-owned asset blobs to the
 * same single transaction — D20-15/D17-13). Deletes, in order:
 *
 *   1. reads the book row (its chapterArticleIds are the declared TOC) and
 *      UNIONS it with every live article row carrying bookId === id — live
 *      truth wins over the declared list so a partial import (book row
 *      saved, TOC stale) still cascades completely;
 *   2. collects the to-be-deleted highlight ids PER CHAPTER before any
 *      delete (in-transaction reads see pre-delete state — the
 *      collect-before-delete discipline from DexieLibrarySource.remove);
 *   3. deletes highlights, notes (by collected highlightId), locations
 *      (compound [articleId+revision] range), assets (the v6 articleId
 *      index range delete — one line per chapter in the same loop), the
 *      chapter article rows, and finally the book row.
 *
 * The transaction uses Dexie's readonly-ARRAY overload: SIX tables exceed
 * the tuple overloads, which stop at five (the applyImport 12-07 precedent
 * — the standardized form saveBook also adopted in Phase 20).
 *
 * Removing a book id that does not exist is a calm no-op (the transaction
 * simply deletes nothing).
 */
export async function removeBook(id: string): Promise<void> {
  await db.transaction(
    "rw",
    [db.books, db.articles, db.highlights, db.notes, db.location, db.assets],
    async () => {
      const book = await db.books.get(id);

      // Chapter set = declared TOC ∪ live bookId carriers (live truth —
      // tolerant of partial imports).
      const chapterIds = new Set<string>(book?.chapterArticleIds ?? []);
      const liveChapterIds = await db.articles
        .where("bookId")
        .equals(id)
        .primaryKeys();
      for (const key of liveChapterIds) {
        chapterIds.add(String(key));
      }

      // Collect highlight ids BEFORE deleting (in-transaction reads see
      // pre-delete state — LibrarySource.ts L116-125 discipline). The
      // highlights primary key is the plain string `id`; the defensive
      // Array.isArray map guards compound PKs (same as LibrarySource).
      const highlightIds: string[] = [];
      for (const chapterId of chapterIds) {
        const ids = await db.highlights
          .where("[articleId+revision]")
          .between([chapterId, 0], [chapterId, Number.MAX_SAFE_INTEGER])
          .primaryKeys();
        for (const k of ids) {
          highlightIds.push(Array.isArray(k) ? String(k[0]) : String(k));
        }
      }

      // Highlights + locations + assets: every row for each chapter across
      // ALL revisions (compound-index array ranges; the assets articleId
      // index range delete rides the same loop — D20-15).
      for (const chapterId of chapterIds) {
        await db.highlights
          .where("[articleId+revision]")
          .between([chapterId, 0], [chapterId, Number.MAX_SAFE_INTEGER])
          .delete();
        await db.location
          .where("[articleId+revision]")
          .between([chapterId, 0], [chapterId, Number.MAX_SAFE_INTEGER])
          .delete();
        await db.assets.where("articleId").equals(chapterId).delete();
      }

      // Notes: cascade through the collected highlight ids.
      if (highlightIds.length > 0) {
        await db.notes.where("highlightId").anyOf(highlightIds).delete();
      }

      // Chapter articles, then the book row itself.
      await db.articles.bulkDelete([...chapterIds]);
      await db.books.delete(id);
    },
  );
}

/**
 * setBookTags — write the tag array for one Book by id (D12-04 — tags live
 * on the Book record, NOT per-chapter). Idempotent primary-key update; a
 * non-existent id is a no-op. Defensively drops empty-string tags before
 * writing to mirror the `z.string().min(1)` schema constraint (the
 * setArticleTags precedent — a stray empty string would corrupt the row
 * against the next BookSchema.safeParse read).
 */
export async function setBookTags(id: string, tags: string[]): Promise<void> {
  const cleaned = tags.filter((t) => t.length > 0);
  await db.books.update(id, { tags: cleaned });
}
