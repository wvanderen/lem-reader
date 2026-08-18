// tests/unit/ingestion-client.test.ts
// Phase 7 Plan 06 Task 1 — RED gate. Behavior tests for the reader-facing
// half of the ingestion pipeline:
//
//   - IngestionClient.ingestUrl / ingestHtml (ArticleSchema re-validation,
//     IngestionError with .reason on failure — STATE-04 defense-in-depth)
//   - DexieLibrarySource (save / has / list / remove with cascade)
//   - compositeLibraryRepository (UNION of fixtures + ingested; dedupe by id)
//
// Fetch is mocked per-test so the client's network path is exercised in
// isolation from the real /api/ingest endpoint. The Dexie paths run against
// fake-indexeddb so save/has/list/remove assert real IndexedDB semantics
// without a browser.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArticleSchema, BookSchema } from "../../src/content/schema";
import type { Book } from "../../src/content/schema";
import type { CanonicalArticle } from "../../src/content/types";
import { EPUB_MAX_BYTES } from "../../src/ingestion/types";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";

// Dexie 4 captures `indexedDB` + `IDBKeyRange` on `Dexie.dependencies` at
// dexie-module-load time. Install BOTH onto `Dexie.dependencies` (the
// Dexie-internal read path) AND `globalThis` (the direct-read path Dexie
// uses for deleteDatabase) at this module's top-level — the documented
// Dexie + Node test pattern (mirrors tests/unit/ingestion-schema.test.ts).
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

// Lazy imports — the modules under test are imported AFTER the fake-indexeddb
// install so their module-body top-level sees a populated Dexie.dependencies.
async function loadClient() {
  return await import("../../src/ingestion/IngestionClient");
}
async function loadLibrarySource() {
  return await import("../../src/ingestion/LibrarySource");
}
async function loadBooksStore() {
  return await import("../../src/persistence/booksStore");
}
async function loadDb() {
  return await import("../../src/persistence/db");
}

// A schema-valid article used as the IngestionClient success payload + as
// the DexieLibrarySource.save argument. Built to pass ArticleSchema.parse.
function sampleArticle(overrides: Partial<CanonicalArticle> = {}): CanonicalArticle {
  return ArticleSchema.parse({
    id: "test-article-slug",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/article",
      title: "Sample Article",
      author: "An Author",
      retrievedAt: "2026-08-11T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "0".repeat(64),
    },
    blocks: [
      {
        kind: "heading",
        level: 2,
        content: [{ text: "A Heading", marks: [] }],
      },
      {
        kind: "paragraph",
        content: [{ text: "Body text here.", marks: [] }],
      },
      {
        kind: "paragraph",
        content: [{ text: "More body text.", marks: [] }],
      },
    ],
    footnotes: [],
    ingestionMeta: {
      source: "url",
      origin: "url",
      sourceUrl: "https://example.com/article",
      originalHtmlHash: "sha256:" + "0".repeat(64),
      fetchedAt: "2026-08-11T00:00:00.000Z",
      extractionConfidence: "high",
      extractionWarnings: [],
    },
    ...overrides,
  });
}

// Phase 12 Plan 03 — a schema-valid chapter article (epub-chapter meta) +
// a schema-valid Book, the ingestEpub book ok-variant payload.
function sampleChapter(
  overrides: Partial<CanonicalArticle> = {},
): CanonicalArticle {
  return ArticleSchema.parse({
    id: "epub-abc123def456-c00",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: undefined,
      title: "Chapter One",
      retrievedAt: "2026-08-18T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "c".repeat(64),
    },
    blocks: [
      { kind: "paragraph", content: [{ text: "Chapter body.", marks: [] }] },
    ],
    footnotes: [],
    ingestionMeta: {
      source: "epub-chapter",
      origin: "upload",
      originalHtmlHash: "sha256:" + "c".repeat(64),
      extractionConfidence: "high",
      extractionWarnings: [],
      bookId: "epub-abc123def456",
      chapterIndex: 0,
    },
    ...overrides,
  });
}

function sampleBook(overrides: Partial<Book> = {}): Book {
  return BookSchema.parse({
    id: "epub-abc123def456",
    title: "A Sample Book",
    authors: ["An Author"],
    language: "en",
    chapterArticleIds: ["epub-abc123def456-c00", "epub-abc123def456-c01"],
    skippedChapterCount: 2,
    source: "epub-upload",
    originalFileHash: "sha256:" + "b".repeat(64),
    addedAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  });
}

// ── IngestionClient ──────────────────────────────────────────────────────────

describe("IngestionClient (07-06 Task 1)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("ingestUrl returns the article on a 200 + ok:true response", async () => {
    const article = sampleArticle();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ ok: true, article, confidence: { state: "confident" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const { ingestUrl } = await loadClient();
    const result = await ingestUrl("https://example.com/article");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [calledUrl, init] = call as [unknown, RequestInit | undefined];
    expect(calledUrl).toBe("/api/ingest");
    expect(init?.method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      url: "https://example.com/article",
    });
    expect(result.article.id).toBe(article.id);
    expect(result.confidence.state).toBe("confident");
  });

  it("ingestHtml posts {html} and returns the article on success", async () => {
    const article = sampleArticle({
      id: "paste-abc123def456",
      provenance: {
        sourceUrl: undefined,
        title: "Pasted article",
        retrievedAt: "2026-08-11T00:00:00.000Z",
        originalHtmlHash: "sha256:" + "1".repeat(64),
      },
      ingestionMeta: {
        source: "paste",
        origin: "paste",
        originalHtmlHash: "sha256:" + "1".repeat(64),
        extractionConfidence: "high",
        extractionWarnings: [],
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, article, confidence: { state: "low" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { ingestHtml } = await loadClient();
    const result = await ingestHtml("<article>paste</article>");

    expect(result.article.id).toBe(article.id);
    expect(result.confidence.state).toBe("low");
  });

  it("throws IngestionError with .reason on a 400 + ok:false response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ ok: false, reason: "ssrf-blocked-metadata" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { ingestUrl, IngestionError } = await loadClient();
    await expect(
      ingestUrl("http://169.254.169.254/"),
    ).rejects.toMatchObject({
      name: "IngestionError",
      reason: "ssrf-blocked-metadata",
    });
    expect(IngestionError).toBeDefined();
  });

  // Phase 11 Plan 04 Task 1 — the PDF upload arm (ING-04). ingestPdf posts
  // the widened {pdf, filename} envelope through the SAME shared ingest
  // pipeline: typed refusal throw + ArticleSchema re-validation below the
  // ingest() call site are reused unchanged (plan: "do not fork it").
  describe("ingestPdf (11-04 Task 1)", () => {
    it("posts exactly {pdf, filename} and returns the article on a 200 + ok:true response", async () => {
      const article = sampleArticle({
        id: "pdf-abc123def456",
        provenance: {
          sourceUrl: undefined,
          title: "Sample PDF",
          retrievedAt: "2026-08-16T00:00:00.000Z",
          originalHtmlHash: "sha256:" + "2".repeat(64),
        },
        ingestionMeta: {
          source: "pdf",
          origin: "upload",
          originalHtmlHash: "sha256:" + "2".repeat(64),
          extractionConfidence: "high",
          extractionWarnings: [],
        },
      });
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(
          new Response(
            JSON.stringify({ ok: true, article, confidence: { state: "confident" } }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );

      const { ingestPdf } = await loadClient();
      const b64 = "JVBERi0xLjQKJcOkw7zDtsOf"; // "%PDF-1.4" base64-encoded
      const result = await ingestPdf(b64, "sample.pdf");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const call = fetchMock.mock.calls[0];
      expect(call).toBeDefined();
      const [calledUrl, init] = call as [unknown, RequestInit | undefined];
      expect(calledUrl).toBe("/api/ingest");
      expect(init?.method).toBe("POST");
      // The body is EXACTLY {pdf, filename} — no extra fields, no markdown
      // variant, no double-encoding (IngestionRequestSchema enforces this on
      // the server; the client constructs it by construction).
      expect(JSON.parse((init as RequestInit).body as string)).toEqual({
        pdf: b64,
        filename: "sample.pdf",
      });
      expect(result.article.id).toBe(article.id);
      expect(result.confidence.state).toBe("confident");
    });

    it("throws IngestionError carrying the typed pdf-scanned reason verbatim on a 400 + ok:false response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({ ok: false, reason: "pdf-scanned" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
      );

      const { ingestPdf } = await loadClient();
      await expect(ingestPdf("JVBERi0=", "scanned.pdf")).rejects.toMatchObject({
        name: "IngestionError",
        reason: "pdf-scanned",
      });
    });
  });

  it("re-validates the server response through ArticleSchema.parse (STATE-04)", async () => {
    // Server returns 200 + ok:true but the article is malformed (missing
    // required Provenance.title). The client MUST throw — defense-in-depth.
    const malformed = {
      id: "bad-slug",
      revision: 1,
      lang: "en",
      provenance: { retrievedAt: "2026-08-11T00:00:00.000Z", originalHtmlHash: "x" },
      blocks: [],
      footnotes: [],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, article: malformed, confidence: { state: "confident" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { ingestUrl } = await loadClient();
    await expect(
      ingestUrl("https://example.com/article"),
    ).rejects.toThrow();
  });
});

// ── DexieLibrarySource + compositeLibraryRepository ─────────────────────────

describe("DexieLibrarySource (07-06 Task 1)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("save writes a row that has() finds", async () => {
    const { DexieLibrarySource } = await loadLibrarySource();
    const source = new DexieLibrarySource();
    const article = sampleArticle();

    expect(await source.has(article.id)).toBe(false);
    await source.save(article);
    expect(await source.has(article.id)).toBe(true);
  });

  it("list returns only Dexie rows (NOT fixtures)", async () => {
    const { DexieLibrarySource } = await loadLibrarySource();
    const source = new DexieLibrarySource();
    await source.save(sampleArticle({ id: "dexie-row-a" }));
    await source.save(sampleArticle({ id: "dexie-row-b" }));

    const rows = await source.list();
    expect(rows.map((a) => a.id).sort()).toEqual(["dexie-row-a", "dexie-row-b"]);
  });

  it("open returns the article by id, or null when absent", async () => {
    const { DexieLibrarySource } = await loadLibrarySource();
    const source = new DexieLibrarySource();
    const article = sampleArticle({ id: "open-target" });
    await source.save(article);

    const opened = await source.open("open-target");
    expect(opened?.id).toBe("open-target");
    expect(await source.open("nonexistent")).toBeNull();
  });

  it("remove deletes the article row AND cascades to highlights/notes/location", async () => {
    const { DexieLibrarySource } = await loadLibrarySource();
    const { db } = await import("../../src/persistence/db");
    const source = new DexieLibrarySource();
    const article = sampleArticle({ id: "remove-target" });
    await source.save(article);

    // Seed related rows that the cascade must delete.
    await db.highlights.put({
      schemaVersion: 1,
      id: "h-1",
      articleId: "remove-target",
      revision: 1,
      position: { start: 0, end: 5 },
      quote: { prefix: "", exact: "Hello", suffix: "" },
      createdAt: "2026-08-11T00:00:00.000Z",
    });
    await db.notes.put({
      schemaVersion: 1,
      id: "n-1",
      highlightId: "h-1",
      text: "a note",
      updatedAt: "2026-08-11T00:00:00.000Z",
    });
    await db.location.put({
      schemaVersion: 1,
      articleId: "remove-target",
      revision: 1,
      graphemeOffset: 0,
      savedAt: "2026-08-11T00:00:00.000Z",
    });

    await source.remove("remove-target");

    // Article gone; cascades took the related rows.
    expect(await source.has("remove-target")).toBe(false);
    expect(await db.highlights.get("h-1")).toBeUndefined();
    expect(await db.notes.get("n-1")).toBeUndefined();
    expect(
      await db.location.where("[articleId+revision]")
        .between(["remove-target", 0], ["remove-target", Number.MAX_SAFE_INTEGER])
        .count(),
    ).toBe(0);
  });
});

describe("compositeLibraryRepository (07-06 Task 1)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("list UNIONs fixtures (inMemoryRepository) with Dexie rows", async () => {
    const { compositeLibraryRepository } = await loadLibrarySource();
    const { fixtures } = await import("../../src/fixtures");
    const { DexieLibrarySource } = await loadLibrarySource();
    const source = new DexieLibrarySource();
    await source.save(sampleArticle({ id: "ingested-only" }));

    const merged = await compositeLibraryRepository.list();
    const ids = new Set(merged.map((a) => a.id));

    // Every fixture id is present.
    for (const f of fixtures) {
      expect(ids.has(f.id)).toBe(true);
    }
    // The ingested-only id is present.
    expect(ids.has("ingested-only")).toBe(true);
  });

  it("list dedupes by id — re-ingesting a fixture id does not double it", async () => {
    const { compositeLibraryRepository, DexieLibrarySource } = await loadLibrarySource();
    const { fixtures } = await import("../../src/fixtures");
    const source = new DexieLibrarySource();
    // Save a row with the SAME id as the first fixture.
    const firstFixture = fixtures[0]!;
    const firstFixtureId = firstFixture.id;
    await source.save(sampleArticle({ id: firstFixtureId }));

    const merged = await compositeLibraryRepository.list();
    const count = merged.filter((a) => a.id === firstFixtureId).length;
    expect(count).toBe(1);
  });

  it("open finds an article in either source (Dexie preferred)", async () => {
    const { compositeLibraryRepository, DexieLibrarySource } = await loadLibrarySource();
    const { fixtures } = await import("../../src/fixtures");
    const source = new DexieLibrarySource();
    await source.save(sampleArticle({ id: "ingested-only" }));

    // From Dexie.
    expect((await compositeLibraryRepository.open("ingested-only"))?.id).toBe("ingested-only");
    // From fixtures.
    const first = fixtures[0]!;
    expect((await compositeLibraryRepository.open(first.id))?.id).toBe(first.id);
    // Absent.
    expect(await compositeLibraryRepository.open("does-not-exist")).toBeNull();
  });
});

// ── ingestEpub (Phase 12 Plan 03 Task 2) ─────────────────────────────────────

describe("ingestEpub (12-03 Task 2)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts exactly {epub, filename} to /api/ingest?format=epub and returns {book, articles, skippedCount}", async () => {
    const book = sampleBook();
    const chapters = [
      sampleChapter(),
      sampleChapter({
        id: "epub-abc123def456-c01",
        provenance: {
          sourceUrl: undefined,
          title: "Chapter Two",
          retrievedAt: "2026-08-18T00:00:00.000Z",
          originalHtmlHash: "sha256:" + "d".repeat(64),
        },
        ingestionMeta: {
          source: "epub-chapter",
          origin: "upload",
          originalHtmlHash: "sha256:" + "d".repeat(64),
          extractionConfidence: "high",
          extractionWarnings: [],
          bookId: "epub-abc123def456",
          chapterIndex: 1,
        },
      }),
    ];
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ ok: true, book, articles: chapters, skippedCount: 2 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const { ingestEpub } = await loadClient();
    const b64 = "UEsDBA=="; // "PK\x03\x04" base64-encoded
    const result = await ingestEpub(b64, "sample.epub");

    // The URL carries the format query param + the body is EXACTLY
    // {epub, filename} (IngestionRequestSchema enforces this on the
    // server; the client constructs it by construction).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [calledUrl, init] = call as [unknown, RequestInit | undefined];
    expect(calledUrl).toBe("/api/ingest?format=epub");
    expect(init?.method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      epub: b64,
      filename: "sample.epub",
    });
    expect(result.book.id).toBe(book.id);
    expect(result.articles.map((a) => a.id)).toEqual([
      "epub-abc123def456-c00",
      "epub-abc123def456-c01",
    ]);
    expect(result.skippedCount).toBe(2);
  });

  it("rejects when ONE article in the envelope is malformed (per-article re-validation fires)", async () => {
    const malformed = {
      id: "epub-abc123def456-c99",
      revision: 1,
      lang: "en",
      // Missing required Provenance fields (no title) + empty blocks —
      // fails BOTH the envelope's embedded ArticleSchema and the explicit
      // per-article loop.
      provenance: {
        retrievedAt: "2026-08-18T00:00:00.000Z",
        originalHtmlHash: "x",
      },
      blocks: [],
      footnotes: [],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          book: sampleBook(),
          articles: [sampleChapter(), malformed],
          skippedCount: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { ingestEpub } = await loadClient();
    await expect(ingestEpub("UEsDBA==", "bad.epub")).rejects.toThrow();
  });

  it("throws IngestionError carrying the typed epub-protected reason on a refusal envelope", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ ok: false, reason: "epub-protected" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { ingestEpub } = await loadClient();
    await expect(ingestEpub("UEsDBA==", "drm.epub")).rejects.toMatchObject({
      name: "IngestionError",
      reason: "epub-protected",
    });
  });
});

// ── IngestControl .epub picker arm (Phase 12 Plan 03 Task 2) ─────────────────
// No 11-04 picker test exists (tests/component/IngestControl.test.tsx has no
// file-upload case), so per the plan's fallback these assertions live HERE:
// the over-cap pick performs ZERO fetch calls and never materializes an
// ArrayBuffer; the book save path dedupe-refuses at book level and writes
// through saveBook in one transaction.

describe("IngestControl .epub picker arm (12-03 Task 2)", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await wipeDatabase();
  });

  it("refuses an over-cap .epub BEFORE any read — zero fetch calls, no ArrayBuffer materialized, calm epub-too-large copy (T-12-09)", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const { IngestControl } = await import("../../src/ingestion/IngestControl");

    // A .epub File stub whose size is patched over the cap — no 10MB
    // allocation needed; the component only reads .name/.size when the
    // cap fires.
    const file = new File(["PK"], "big-book.epub", {
      type: "application/epub+zip",
    });
    Object.defineProperty(file, "size", { value: EPUB_MAX_BYTES + 1 });
    const arrayBufferSpy = vi.spyOn(file, "arrayBuffer");

    const { render } = await import("@testing-library/react");
    const { createElement } = await import("react");
    render(createElement(IngestControl));
    const input = screen.getByLabelText("Upload a file") as HTMLInputElement;
    await user.upload(input, file);
    await user.click(screen.getByRole("button", { name: /add file/i }));

    // Earliest enforcement: no bytes read, no POST, calm copy surfaced.
    await screen.findByText("This book is too large to add.");
    expect(arrayBufferSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves a book through hasBook-then-saveBook and surfaces the D12-11 skip disclosure", async () => {
    const user = userEvent.setup();
    const book = sampleBook();
    const chapters = [
      sampleChapter(),
      sampleChapter({
        id: "epub-abc123def456-c01",
        provenance: {
          sourceUrl: undefined,
          title: "Chapter Two",
          retrievedAt: "2026-08-18T00:00:00.000Z",
          originalHtmlHash: "sha256:" + "d".repeat(64),
        },
        ingestionMeta: {
          source: "epub-chapter",
          origin: "upload",
          originalHtmlHash: "sha256:" + "d".repeat(64),
          extractionConfidence: "high",
          extractionWarnings: [],
          bookId: "epub-abc123def456",
          chapterIndex: 1,
        },
      }),
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, book, articles: chapters, skippedCount: 2 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { IngestControl } = await import("../../src/ingestion/IngestControl");
    const { render } = await import("@testing-library/react");
    const { createElement } = await import("react");
    render(createElement(IngestControl));
    const input = screen.getByLabelText("Upload a file") as HTMLInputElement;
    await user.upload(input, new File(["PK"], "sample.epub"));
    await user.click(screen.getByRole("button", { name: /add file/i }));

    // Success copy + the skip disclosure (D12-11 — same phrasing the
    // library disclosure will use).
    await screen.findByText(
      "Book added to your library. 2 chapters could not be read.",
    );

    // The book + both chapters landed (saveBook's one-transaction write).
    const { db } = await loadDb();
    expect(await db.books.count()).toBe(1);
    expect(await db.articles.count()).toBe(2);
  });

  it("book-level dedupe-refuse: a re-upload of an already-saved book surfaces 'Already in your library.' with no second write (D7-07)", async () => {
    const user = userEvent.setup();
    const book = sampleBook();
    const { saveBook } = await loadBooksStore();
    const { db } = await loadDb();
    // Pre-seed the library with the identical book (same content-hash id).
    await saveBook(book, [sampleChapter()]);
    expect(await db.books.count()).toBe(1);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          book,
          articles: [sampleChapter()],
          skippedCount: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const { IngestControl } = await import("../../src/ingestion/IngestControl");
    const { render } = await import("@testing-library/react");
    const { createElement } = await import("react");
    render(createElement(IngestControl));
    const input = screen.getByLabelText("Upload a file") as HTMLInputElement;
    await user.upload(input, new File(["PK"], "same-book.epub"));
    await user.click(screen.getByRole("button", { name: /add file/i }));

    await screen.findByText("Already in your library.");
    // No second write: still exactly one book row + one chapter row.
    expect(await db.books.count()).toBe(1);
    expect(await db.articles.count()).toBe(1);
  });
});
