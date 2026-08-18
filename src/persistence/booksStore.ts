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
//   4. hasBook is the dedupe-refuse primitive IngestControl calls BEFORE any
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
import { BookSchema } from "../content/schema";
import type { Book } from "../content/schema";
import type { CanonicalArticle } from "../content/schema";
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
 * that parsed a full Book (IngestControl via ingestEpub) pass it through
 * unchanged; callers that hand-build a record may omit `addedAt` and
 * saveBook stamps it (see saveBook).
 */
export type BookInput = Omit<Book, "addedAt"> & { addedAt?: string };

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
 * IngestControl calls this BEFORE saveBook; if it returns true, the control
 * surfaces "Already in your library." and never calls saveBook (no
 * overwrite, no orphaned chapter annotations).
 */
export async function hasBook(id: string): Promise<boolean> {
  return (await db.books.get(id)) !== undefined;
}

/**
 * saveBook — write a book + ALL its chapter articles in ONE Dexie
 * transaction (atomicity discipline — a half-saved book is impossible).
 *
 * The closure is puts-only: no Zod, no crypto, no network inside the
 * transaction (the 09-04 applyImport closure rule). `book` and `articles`
 * are validated by construction (IngestControl's only producer is
 * ingestEpub, which runs IngestionResponseSchema.parse + the per-article
 * ArticleSchema.parse loop on the network read — STATE-04
 * defense-in-depth).
 *
 * `addedAt` is stamped `new Date().toISOString()` ONLY when the caller
 * passed none — the stamp happens BEFORE the transaction opens so the
 * closure stays a pure put sequence (library default-sort + continue-strip
 * ordering, D12-02).
 *
 * Each chapter row is written with a denormalized top-level `bookId`
 * (index fodder for the v5 Dexie index; the canonical field remains
 * `ingestionMeta.bookId` — see the inline comment in the closure).
 *
 * A throw (e.g. QuotaExceeded) propagates to the caller (IngestControl),
 * which surfaces the calm catch-all copy; the transaction guarantees NO
 * partial write ever landed.
 */
export async function saveBook(
  book: BookInput,
  articles: CanonicalArticle[],
): Promise<void> {
  const stamped: Book = book.addedAt
    ? (book as Book)
    : { ...book, addedAt: new Date().toISOString() };
  await db.transaction("rw", db.books, db.articles, async () => {
    await db.books.put(stamped);
    for (const article of articles) {
      // Denormalize the top-level `bookId` onto the stored row so the v5
      // Dexie index ("...,*tags, bookId") can serve grouping reads
      // (D12-01) + removeBook's live-truth cascade. The CANONICAL contract
      // stays `ingestionMeta.bookId` — ArticleSchema's z.object strips the
      // unknown top-level key on every read, so the stored row parses
      // byte-identically through the Zod-at-boundary discipline.
      await db.articles.put({ ...article, bookId: stamped.id });
    }
  });
}

/**
 * removeBook — full cascade in ONE Dexie transaction over books + articles
 * + highlights + notes + location (12-RESEARCH Pitfall 7 — no stranded
 * annotations). Deletes, in order:
 *
 *   1. reads the book row (its chapterArticleIds are the declared TOC) and
 *      UNIONS it with every live article row carrying bookId === id — live
 *      truth wins over the declared list so a partial import (book row
 *      saved, TOC stale) still cascades completely;
 *   2. collects the to-be-deleted highlight ids PER CHAPTER before any
 *      delete (in-transaction reads see pre-delete state — the
 *      collect-before-delete discipline from DexieLibrarySource.remove);
 *   3. deletes highlights, notes (by collected highlightId), locations
 *      (compound [articleId+revision] range), the chapter article rows,
 *      and finally the book row.
 *
 * Removing a book id that does not exist is a calm no-op (the transaction
 * simply deletes nothing).
 */
export async function removeBook(id: string): Promise<void> {
  await db.transaction(
    "rw",
    db.books,
    db.articles,
    db.highlights,
    db.notes,
    db.location,
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

      // Highlights + locations: every row for each chapter across ALL
      // revisions (compound-index array range).
      for (const chapterId of chapterIds) {
        await db.highlights
          .where("[articleId+revision]")
          .between([chapterId, 0], [chapterId, Number.MAX_SAFE_INTEGER])
          .delete();
        await db.location
          .where("[articleId+revision]")
          .between([chapterId, 0], [chapterId, Number.MAX_SAFE_INTEGER])
          .delete();
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
