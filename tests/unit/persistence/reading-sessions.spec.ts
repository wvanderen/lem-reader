// tests/unit/persistence/reading-sessions.spec.ts
// Issue #34 — the readingSessions seam + lifecycle truths:
//   - putReadingSession → loadAllReadingSessions round-trip; corrupt rows
//     are DROPPED from reads calmly (STATE-04 — never coerced)
//   - ONE row per visit: re-flushing the same visit id UPSERTS in place
//     (totals refine, count stays 1); a second visit appends a second row
//     (append-only, decision #24)
//   - DexieLibrarySource.remove cascade-deletes the article's sessions in
//     the SAME single transaction as highlights/notes/location/assets —
//     no ghosts (issue #34 AC 3, the D20-15 lifecycle precedent)
//   - booksStore.removeBook cascade-deletes every chapter's sessions
//
// Harness mirrors tests/unit/persistence/assets-cascade.spec.ts:
// fake-indexeddb via Dexie.dependencies at module top-level, wipeDatabase
// beforeEach, lazy module imports.
import { beforeEach, describe, expect, it } from "vitest";
import { ArticleSchema, BookSchema } from "../../../src/content/schema";
import type { Book, CanonicalArticle } from "../../../src/content/schema";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";
import type { ReadingSessionRecord } from "../../../src/content/schema";

// Install BOTH onto `Dexie.dependencies` (the Dexie-internal read path) AND
// `globalThis` (the direct-read path Dexie uses for deleteDatabase) — the
// documented Dexie + Node test pattern (mirrors books-store.test.ts).
Dexie.dependencies.indexedDB = fakeIndexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
(globalThis as { indexedDB?: typeof fakeIndexedDB }).indexedDB = fakeIndexedDB;
(globalThis as { IDBKeyRange?: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;

async function wipeDatabase(): Promise<void> {
  await new Promise<void>((resolve) => {
    const idb = (globalThis as { indexedDB?: typeof fakeIndexedDB }).indexedDB;
    if (!idb) return resolve();
    const req = idb.deleteDatabase("lem-reader");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

// Lazy imports — the modules under test are imported AFTER the
// fake-indexeddb install.
async function loadSessionsStore() {
  return await import("../../../src/persistence/readingSessionsStore");
}
async function loadLibrarySource() {
  return await import("../../../src/ingestion/LibrarySource");
}
async function loadBooksStore() {
  return await import("../../../src/persistence/booksStore");
}
async function loadDb() {
  return await import("../../../src/persistence/db");
}

// ── Sample builders (schema-validated at construction) ──────────────────────

function sampleArticle(overrides: Partial<CanonicalArticle> = {}): CanonicalArticle {
  return ArticleSchema.parse({
    id: "session-article-slug",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/article",
      title: "Sample Article",
      author: "An Author",
      retrievedAt: "2026-09-01T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "0".repeat(64),
    },
    blocks: [
      { kind: "paragraph", content: [{ text: "Body text here.", marks: [] }] },
    ],
    footnotes: [],
    ingestionMeta: {
      source: "url",
      origin: "url",
      sourceUrl: "https://example.com/article",
      originalHtmlHash: "sha256:" + "0".repeat(64),
      fetchedAt: "2026-09-01T00:00:00.000Z",
      extractionConfidence: "high",
      extractionWarnings: [],
    },
    ...overrides,
  });
}

function sampleBookFixture(): { book: Book; chapters: CanonicalArticle[] } {
  const book = BookSchema.parse({
    id: "epub-abc123def456",
    title: "A Sample Book",
    authors: ["An Author"],
    language: "en",
    chapterArticleIds: ["epub-abc123def456-c00", "epub-abc123def456-c01"],
    skippedChapterCount: 0,
    source: "epub-upload",
    originalFileHash: "sha256:" + "b".repeat(64),
    addedAt: "2026-09-01T00:00:00.000Z",
  });
  const chapter = (index: number, hashChar: string): CanonicalArticle =>
    ArticleSchema.parse({
      id: `epub-abc123def456-c0${index}`,
      revision: 1,
      lang: "en",
      provenance: {
        sourceUrl: undefined,
        title: `Chapter ${index}`,
        retrievedAt: "2026-09-01T00:00:00.000Z",
        originalHtmlHash: "sha256:" + hashChar.repeat(64),
      },
      blocks: [
        { kind: "paragraph", content: [{ text: "Chapter body.", marks: [] }] },
      ],
      footnotes: [],
      ingestionMeta: {
        source: "epub-chapter",
        origin: "upload",
        originalHtmlHash: "sha256:" + hashChar.repeat(64),
        extractionConfidence: "high",
        extractionWarnings: [],
        bookId: "epub-abc123def456",
        chapterIndex: index,
      },
    });
  return { book, chapters: [chapter(0, "c"), chapter(1, "d")] };
}

/** A valid ReadingSessionRecord for `articleId` (typed by construction —
 * the only producer is the recorder; tests build the same shape). */
function sampleSession(
  id: string,
  articleId: string,
  overrides: Partial<ReadingSessionRecord> = {},
): ReadingSessionRecord {
  return {
    schemaVersion: 1,
    id,
    articleId,
    startedAt: "2026-09-15T10:00:00.000Z",
    endedAt: "2026-09-15T10:05:00.000Z",
    startOffset: 0,
    endOffset: 4_200,
    activeSeconds: 240,
    ...overrides,
  };
}

// ── Store seam: round-trip + corrupt-row drops ───────────────────────────────

describe("readingSessionsStore — round-trip + corrupt-row drops (issue #34)", () => {
  beforeEach(wipeDatabase);

  it("putReadingSession → loadAllReadingSessions round-trips every field", async () => {
    const { putReadingSession, loadAllReadingSessions } = await loadSessionsStore();
    const session = sampleSession("visit-a", "session-article-slug", {
      startOffset: 120,
      endOffset: 5_555,
      activeSeconds: 305,
    });

    await putReadingSession(session);
    const rows = await loadAllReadingSessions();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(session);
  });

  it("loadAllReadingSessions DROPS a corrupt row calmly — never coerces", async () => {
    const { db } = await loadDb();
    const { putReadingSession, loadAllReadingSessions } = await loadSessionsStore();
    await putReadingSession(sampleSession("visit-good", "session-article-slug"));

    // A corrupt row seeded DIRECTLY through Dexie (no seam validation):
    // activeSeconds is negative (schema min 0) and articleId breaks the
    // D-06 regex. Cast through unknown — the row is INTENTIONALLY corrupt.
    await db.readingSessions.put({
      schemaVersion: 1,
      id: "visit-corrupt",
      articleId: "NOT-A-VALID-ID",
      startedAt: "not-a-date",
      endedAt: "not-a-date",
      startOffset: -5,
      endOffset: 0,
      activeSeconds: -99,
    } as unknown as Parameters<typeof db.readingSessions.put>[0]);

    const rows = await loadAllReadingSessions();
    expect(rows.map((r) => r.id)).toEqual(["visit-good"]);
  });
});

// ── Append-only: one row per visit ───────────────────────────────────────────

describe("readingSessions — one append-only row per visit (issue #34 AC 1)", () => {
  beforeEach(wipeDatabase);

  it("re-flushing the same visit id UPSERTS in place — the count stays 1", async () => {
    const { db } = await loadDb();
    const { putReadingSession } = await loadSessionsStore();

    // The flush discipline: each flush snapshots the SAME visit with
    // refined totals — the upsert must replace, never duplicate.
    await putReadingSession(sampleSession("visit-a", "session-article-slug", {
      activeSeconds: 15,
      endOffset: 900,
    }));
    await putReadingSession(sampleSession("visit-a", "session-article-slug", {
      activeSeconds: 30,
      endOffset: 1_800,
      endedAt: "2026-09-15T10:05:30.000Z",
    }));

    expect(await db.readingSessions.count()).toBe(1);
    const row = await db.readingSessions.get("visit-a");
    expect(row?.activeSeconds).toBe(30);
    expect(row?.endOffset).toBe(1_800);
  });

  it("a second visit appends a second row (append-only)", async () => {
    const { db } = await loadDb();
    const { putReadingSession, loadAllReadingSessions } = await loadSessionsStore();

    await putReadingSession(sampleSession("visit-1", "session-article-slug", {
      startedAt: "2026-09-15T10:00:00.000Z",
    }));
    await putReadingSession(sampleSession("visit-2", "session-article-slug", {
      startedAt: "2026-09-15T18:00:00.000Z",
      endedAt: "2026-09-15T18:03:00.000Z",
      activeSeconds: 120,
      endOffset: 2_000,
    }));

    expect(await db.readingSessions.count()).toBe(2);
    const rows = await loadAllReadingSessions();
    expect(rows.map((r) => r.id).sort()).toEqual(["visit-1", "visit-2"]);
  });
});

// ── Cascade: article removal removes its sessions ────────────────────────────

describe("readingSessions cascade — DexieLibrarySource.remove (issue #34 AC 3)", () => {
  beforeEach(wipeDatabase);

  it("remove(id) deletes the article's sessions — other articles' sessions survive", async () => {
    const { db } = await loadDb();
    const { DexieLibrarySource } = await loadLibrarySource();
    const { putReadingSession } = await loadSessionsStore();
    const source = new DexieLibrarySource();
    const article = sampleArticle();
    const other = sampleArticle({ id: "other-article-slug" });

    await source.save(article);
    await source.save(other);
    await putReadingSession(sampleSession("visit-gone", article.id));
    await putReadingSession(sampleSession("visit-kept", other.id));
    // The existing cascade surface seeds too — the sessions delete joins
    // the SAME transaction (no partial-cascade window).
    await db.highlights.put({
      schemaVersion: 1,
      id: "h-1",
      articleId: article.id,
      revision: 1,
      position: { start: 0, end: 5 },
      quote: { prefix: "", exact: "Hello", suffix: "" },
      createdAt: "2026-09-01T00:00:00.000Z",
    });

    await source.remove(article.id);

    expect(await db.articles.get(article.id)).toBeUndefined();
    expect(await db.highlights.count()).toBe(0);
    expect(await db.readingSessions.get("visit-gone")).toBeUndefined();
    expect(await db.readingSessions.get("visit-kept")).toBeDefined();
    expect(await db.readingSessions.count()).toBe(1);
  });
});

describe("readingSessions cascade — booksStore.removeBook (issue #34 AC 3)", () => {
  beforeEach(wipeDatabase);

  it("removeBook deletes every chapter's sessions — standalone sessions survive", async () => {
    const { db } = await loadDb();
    const { saveBook, removeBook } = await loadBooksStore();
    const { putReadingSession } = await loadSessionsStore();
    const { book, chapters } = sampleBookFixture();
    const [c00, c01] = chapters as [CanonicalArticle, CanonicalArticle];

    await saveBook(book, chapters);
    await putReadingSession(sampleSession("visit-c00", c00.id));
    await putReadingSession(sampleSession("visit-c01", c01.id));
    await putReadingSession(sampleSession("visit-standalone", "standalone-slug"));

    await removeBook(book.id);

    expect(await db.books.count()).toBe(0);
    expect(await db.articles.count()).toBe(0);
    expect(await db.readingSessions.get("visit-c00")).toBeUndefined();
    expect(await db.readingSessions.get("visit-c01")).toBeUndefined();
    expect(await db.readingSessions.get("visit-standalone")).toBeDefined();
    expect(await db.readingSessions.count()).toBe(1);
  });
});
