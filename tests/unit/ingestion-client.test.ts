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
import { ArticleSchema } from "../../src/content/schema";
import type { CanonicalArticle } from "../../src/content/types";
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
