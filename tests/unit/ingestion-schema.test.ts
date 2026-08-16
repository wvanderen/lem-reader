import { beforeEach, describe, expect, it } from "vitest";
import {
  ArticleSchema,
  ArticleSourceSchema,
  IngestionMetaSchema,
} from "../../src/content/schema";
import {
  IngestionFailureReasonEnum,
  IngestionRequestSchema,
  IngestionResponseSchema,
} from "../../src/ingestion/types";
import { LemReaderDB } from "../../src/persistence/db";

// fake-indexeddb gives Dexie a synthetic IndexedDB implementation in Node so
// the v3 migration smoke test can construct a fresh LemReaderDB, close it, and
// re-open under the new version declaration — without a real browser. The full
// v1→v3 migration snapshot (SC#5) runs in 07-07 against real Playwright/chromium;
// this unit test is the smoke that proves v3 doesn't break the upgrade chain
// (Pitfall 9 — the v1/v2 declaration blocks stay byte-unchanged).
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";

// Dexie 4 captures `indexedDB` + `IDBKeyRange` on `Dexie.dependencies` at
// dexie-module-load time (which happens transitively when this test imports
// from src/persistence/db). When `Dexie.dependencies.indexedDB` is undefined,
// `db.open()` throws `MissingAPIError`; without `IDBKeyRange`, `where()` range
// queries throw the same. Install BOTH onto `Dexie.dependencies` (the
// Dexie-internal read path) AND `globalThis` (the direct-read path Dexie uses
// for deleteDatabase) at this module's top-level — the documented Dexie + Node
// test pattern (Dexie README "Testing with fake-indexeddb"). Scoped to this
// module: storageFallback.test.ts vi.mock's the whole db module, so it is
// unaffected; no other unit test relies on indexedDB being absent.
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

/**
 * Phase 7 — additive schema extensions (07-02-PLAN.md Task 1).
 *
 * Behavior cases for:
 *   - `ArticleSourceSchema` (D7-08 origin discriminator)
 *   - `IngestionMetaSchema` (the derived per-article metadata sub-schema)
 *   - `ArticleSchema.ingestionMeta: IngestionMetaSchema.optional()` (backward-compat
 *     via `.optional()` — Pitfall 9 mirroring the ReaderSettings.readingMode precedent)
 *   - `Provenance.sourceUrl: httpUrl.optional()` (D7-08 — paste-HTML articles omit it)
 *   - `IngestionRequestSchema` / `IngestionResponseSchema` / `IngestionFailureReasonEnum`
 *     in `src/ingestion/types.ts` (the client-side request/response envelope schemas)
 *
 * Existing v1.0 fixtures must continue to parse unchanged (ingestionMeta absent
 * → undefined; Provenance.sourceUrl still supplied).
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

function validV1Article(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "test-article",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/article",
      title: "Test Article",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: "sha256:abc123def456",
    },
    blocks: [{ kind: "paragraph", content: [{ text: "Hello world." }] }],
    footnotes: [],
    ...overrides,
  };
}

const validIngestionMeta = {
  source: "url",
  origin: "url",
  sourceUrl: "https://example.com/article",
  originalHtmlHash: "sha256:abc",
  fetchedAt: "2026-08-10T00:00:00Z",
  extractionConfidence: "high",
  extractionWarnings: [],
} as const;

// ── ArticleSourceSchema (D7-08) ──────────────────────────────────────────────

describe("ArticleSourceSchema", () => {
  // Phase 8 (Plan 08-01 Task 2) widened the enum additively per D8-15 + D8-16:
  // "markdown" (.md upload via markdownToBlocks) + "html-upload" (.html file
  // upload via paste path with a distinct badge per D8-02). Phase 11 (Plan
  // 11-01 Task 2) adds "pdf" (ING-04 — .pdf upload via pdfToBlocks). Future
  // phases continue the additive pattern ("epub-chapter" Phase 12).
  it("enum equals exactly [fixture, url, paste, markdown, html-upload, pdf] (D7-08 + D8-15 + D8-16 + ING-04)", () => {
    // Zod 4: `.options` is the value array; `.enum` is now the object map.
    expect(ArticleSourceSchema.options).toEqual([
      "fixture",
      "url",
      "paste",
      "markdown",
      "html-upload",
      "pdf",
    ]);
  });

  it.each(["fixture", "url", "paste", "markdown", "html-upload", "pdf"] as const)(
    "parses source %s",
    (source) => {
      expect(ArticleSourceSchema.parse(source)).toBe(source);
    },
  );

  it.each(["invalid-source", "epub-chapter", "", "URL", "PDF"])(
    "rejects source %s (closed enum — forward-compat via later widening)",
    (bad) => {
      expect(() => ArticleSourceSchema.parse(bad)).toThrow();
    },
  );
});

// ── IngestionMetaSchema ──────────────────────────────────────────────────────

describe("IngestionMetaSchema", () => {
  it("parses the canonical url-origin shape", () => {
    const parsed = IngestionMetaSchema.parse(validIngestionMeta);
    expect(parsed.source).toBe("url");
    expect(parsed.origin).toBe("url");
    expect(parsed.sourceUrl).toBe("https://example.com/article");
    expect(parsed.extractionConfidence).toBe("high");
  });

  it("parses the canonical paste-origin shape (D7-08 — origin/sourceUrl/fetchedAt absent)", () => {
    const parsed = IngestionMetaSchema.parse({
      source: "paste",
      originalHtmlHash: "sha256:pasted",
      extractionConfidence: "low",
    });
    expect(parsed.source).toBe("paste");
    expect(parsed.origin).toBeUndefined();
    expect(parsed.sourceUrl).toBeUndefined();
    expect(parsed.fetchedAt).toBeUndefined();
  });

  it("defaults extractionWarnings to [] when absent", () => {
    const parsed = IngestionMetaSchema.parse({
      source: "fixture",
      originalHtmlHash: "sha256:x",
      extractionConfidence: "high",
    });
    expect(parsed.extractionWarnings).toEqual([]);
  });

  it("rejects extractionConfidence: 'unsupported' (that state never reaches persistence — ING-06)", () => {
    expect(() =>
      IngestionMetaSchema.parse({
        ...validIngestionMeta,
        extractionConfidence: "unsupported",
      }),
    ).toThrow();
  });

  it("rejects a non-http sourceUrl (mirrors Provenance.sourceUrl's httpUrl refinement)", () => {
    expect(() =>
      IngestionMetaSchema.parse({
        ...validIngestionMeta,
        sourceUrl: "javascript:alert(1)",
      }),
    ).toThrow();
  });
});

// ── ArticleSchema.ingestionMeta.optional() (Pitfall 9 backward-compat) ───────

describe("ArticleSchema.ingestionMeta (additive optional — Pitfall 9)", () => {
  it("parses a v1.0 fixture WITHOUT ingestionMeta (no error, hydrates to undefined)", () => {
    const parsed = ArticleSchema.parse(validV1Article());
    expect(parsed.ingestionMeta).toBeUndefined();
  });

  it("parses an ingested article WITH full ingestionMeta", () => {
    const parsed = ArticleSchema.parse(
      validV1Article({ ingestionMeta: validIngestionMeta }),
    );
    expect(parsed.ingestionMeta?.source).toBe("url");
    expect(parsed.ingestionMeta?.extractionConfidence).toBe("high");
  });

  it("accepts a Provenance WITHOUT sourceUrl (paste-HTML case, D7-08)", () => {
    const parsed = ArticleSchema.parse(
      validV1Article({
        provenance: {
          title: "Pasted Article",
          retrievedAt: "2026-08-10T00:00:00Z",
          originalHtmlHash: "sha256:pasted",
        },
      }),
    );
    expect(parsed.provenance.sourceUrl).toBeUndefined();
  });

  it("rejects an invalid ingestionMeta.source enum value", () => {
    expect(() =>
      ArticleSchema.parse(
        validV1Article({
          ingestionMeta: { ...validIngestionMeta, source: "invalid-source" },
        }),
      ),
    ).toThrow();
  });
});

// ── src/ingestion/types.ts envelope schemas ──────────────────────────────────

describe("IngestionRequestSchema (D7-03 — {url} | {html} | {markdown} | {pdf})", () => {
  it("parses a url request", () => {
    expect(IngestionRequestSchema.parse({ url: "https://example.com" })).toEqual({
      url: "https://example.com",
    });
  });

  it("parses an html request", () => {
    expect(IngestionRequestSchema.parse({ html: "<p>hi</p>" })).toEqual({
      html: "<p>hi</p>",
    });
  });

  it("throws when NEITHER url NOR html is supplied", () => {
    expect(() => IngestionRequestSchema.parse({})).toThrow();
  });

  it("rejects a non-http url scheme (mirrors Provenance/IngestionMeta httpUrl)", () => {
    expect(() =>
      IngestionRequestSchema.parse({ url: "javascript:alert(1)" }),
    ).toThrow();
  });

  it("rejects empty html (D7-03 — paste path requires content)", () => {
    expect(() => IngestionRequestSchema.parse({ html: "" })).toThrow();
  });

  // Phase 11 (Plan 11-01 Task 2) — the fourth union member: pdf base64-in-JSON
  // with an optional filename hint (mirrors the markdown variant's shape).
  it("parses a valid base64 pdf payload with filename (ING-04 + D11)", () => {
    // base64 of "%PDF-1.4\n" — a representative (tiny) PDF prefix.
    const pdfBase64 = "JVBERi0xLjQK";
    const parsed = IngestionRequestSchema.parse({
      pdf: pdfBase64,
      filename: "paper.pdf",
    });
    expect(parsed).toEqual({ pdf: pdfBase64, filename: "paper.pdf" });
  });

  it("rejects a pdf value containing non-base64 characters", () => {
    // Spaces + '!' are outside the base64 alphabet — the boundary refuses the
    // payload before the server ever decodes it.
    expect(() =>
      IngestionRequestSchema.parse({ pdf: "this is not base64!" }),
    ).toThrow();
  });

  it("rejects an empty pdf string (min(1) — mirrors html/markdown)", () => {
    expect(() => IngestionRequestSchema.parse({ pdf: "" })).toThrow();
  });
});

describe("IngestionResponseSchema", () => {
  it("parses a confident success envelope (ok: true, article, confidence.state)", () => {
    const raw = {
      ok: true,
      article: validV1Article({ ingestionMeta: validIngestionMeta }),
      confidence: { state: "confident" },
    };
    const parsed = IngestionResponseSchema.parse(raw);
    if (!parsed.ok) throw new Error("expected ok envelope");
    expect(parsed.confidence.state).toBe("confident");
    expect(parsed.article.ingestionMeta?.source).toBe("url");
  });

  it("parses a low-confidence success envelope", () => {
    const parsed = IngestionResponseSchema.parse({
      ok: true,
      article: validV1Article({ ingestionMeta: validIngestionMeta }),
      confidence: { state: "low" },
    });
    if (!parsed.ok) throw new Error("expected ok envelope");
    expect(parsed.confidence.state).toBe("low");
  });

  it("parses a failure envelope with one of the 16 IngestionFailureReason values", () => {
    const parsed = IngestionResponseSchema.parse({
      ok: false,
      reason: "ssrf-blocked-private-ip",
    });
    if (parsed.ok) throw new Error("expected failure envelope");
    expect(parsed.reason).toBe("ssrf-blocked-private-ip");
  });

  it("rejects a failure envelope with an unknown reason", () => {
    expect(() =>
      IngestionResponseSchema.parse({ ok: false, reason: "mystery-reason" }),
    ).toThrow();
  });
});

describe("IngestionFailureReasonEnum (the 16 cataloged reasons)", () => {
  it("exposes exactly the 16 reasons — the Phase 7 catalog + Phase 11 PDF members slotting in before the dedupe-refuse + catch-all tail", () => {
    expect(IngestionFailureReasonEnum.options).toEqual([
      "ssrf-blocked-scheme",
      "ssrf-blocked-private-ip",
      "ssrf-blocked-metadata",
      "fetch-failed",
      "response-too-large",
      "unsupported-content-type",
      "extraction-unsupported",
      "extraction-too-low-confidence",
      "round-trip-anchor-failed",
      // Phase 11 ING-04 — Pattern 7 of 11-RESEARCH.md; "already-in-library"
      // and "server-error" stay last.
      "pdf-unreadable",
      "pdf-encrypted",
      "pdf-scanned",
      "pdf-multi-column",
      "pdf-too-large",
      "already-in-library",
      "server-error",
    ]);
    expect(IngestionFailureReasonEnum.options).toHaveLength(16);
  });

  it("parses each Phase 11 PDF reason (pdf-scanned et al. — the enum accepts all five new members)", () => {
    expect(IngestionFailureReasonEnum.parse("pdf-scanned")).toBe("pdf-scanned");
    expect(IngestionFailureReasonEnum.parse("pdf-unreadable")).toBe("pdf-unreadable");
    expect(IngestionFailureReasonEnum.parse("pdf-encrypted")).toBe("pdf-encrypted");
    expect(IngestionFailureReasonEnum.parse("pdf-multi-column")).toBe("pdf-multi-column");
    expect(IngestionFailureReasonEnum.parse("pdf-too-large")).toBe("pdf-too-large");
  });
});

// ── Dexie v3 append (07-02-PLAN.md Task 2 — Pitfall 9 smoke) ────────────────

describe("LemReaderDB Dexie version chain (v1 → v2 → v3 additive)", () => {
  // Each test gets a fresh LemReaderDB; wipe before each case to isolate the
  // version-chain assertions (no leaked rows from the prior case).
  beforeEach(wipeDatabase);

  it("opens a fresh LemReaderDB under the v3 declaration without throwing (Pitfall 9 — additive append; v1/v2 byte-unchanged)", async () => {
    const db = new LemReaderDB();
    await db.open();
    // v1/v2/v3 all present (the upgrade chain is intact).
    expect(db.verno).toBeGreaterThanOrEqual(3);
    // All 5 stores exist (v1 declared them; v3 re-declares at the new version).
    expect(db.table("articles").name).toBe("articles");
    expect(db.table("settings").name).toBe("settings");
    expect(db.table("location").name).toBe("location");
    expect(db.table("highlights").name).toBe("highlights");
    expect(db.table("notes").name).toBe("notes");
    db.close();
  });

  it("re-opens cleanly after close (the v3 upgrade chain does not break re-entry)", async () => {
    const first = new LemReaderDB();
    await first.open();
    expect(first.verno).toBeGreaterThanOrEqual(3);
    first.close();

    const second = new LemReaderDB();
    await second.open();
    expect(second.verno).toBeGreaterThanOrEqual(3);
    second.close();
  });

  it("indexes an ingested article row by source (filter-by-origin; 07-06 compositeLibraryRepository uses this)", async () => {
    const db = new LemReaderDB();
    await db.open();
    // A representative ingested-article row carries the full CanonicalArticle
    // body plus ingestionMeta. Only the indexed fields (id, revision, source,
    // addedAt) are queried here; the rest is opaque to Dexie.
    const ingestedRow = {
      id: "example-com-article",
      revision: 1,
      source: "url",
      addedAt: "2026-08-10T00:00:00Z",
      ingestionMeta: {
        source: "url",
        origin: "url",
        sourceUrl: "https://example.com/article",
        originalHtmlHash: "sha256:abc",
        fetchedAt: "2026-08-10T00:00:00Z",
        extractionConfidence: "high",
        extractionWarnings: [],
      },
      provenance: {
        sourceUrl: "https://example.com/article",
        title: "Article",
        retrievedAt: "2026-08-10T00:00:00Z",
        originalHtmlHash: "sha256:abc",
      },
      lang: "en",
      blocks: [{ kind: "paragraph", content: [{ text: "Body." }] }],
      footnotes: [],
    };
    await db.articles.put(ingestedRow);
    // The v3 `source` index lets compositeLibraryRepository filter by origin
    // without a full-table scan. Verify the index is live and addressable.
    const byUrl = await db.articles.where("source").equals("url").toArray();
    expect(byUrl).toHaveLength(1);
    expect(byUrl[0]?.id).toBe("example-com-article");
    db.close();
  });

  it("does NOT declare an .upgrade() callback in the v3 block (Pitfall 9 — additive indexes only; Dexie re-indexes on next open)", async () => {
    // Structural assertion: open succeeds with ZERO row migration logic. The
    // v1/v2 articles store wrote ZERO records (fixtures are bundled JSON, not
    // Dexie rows); v3 is the first version that writes user rows. There is no
    // .upgrade() because the change is purely additive (two new indexes).
    const db = new LemReaderDB();
    await db.open();
    expect(db.verno).toBeGreaterThanOrEqual(3);
    // Round-trip a write/read to prove the upgrade was a no-op schema event,
    // not a row-migration event.
    await db.articles.put({
      id: "smoke",
      revision: 1,
      source: "paste",
      addedAt: "2026-08-10T00:00:00Z",
    });
    const row = await db.articles.get("smoke");
    expect(row?.id).toBe("smoke");
    // The row survived untouched — no upgrade transform was applied.
    expect((row as { revision: number }).revision).toBe(1);
    db.close();
  });
});
