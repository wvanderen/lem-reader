// tests/unit/server/ingest-epub.spec.ts
// Plan 12-04 Task 2 — the fifth-branch server-side integration round-trip
// gate (the 11-03 ingest-pdf.spec pattern, EPUB edition). Every happy-path
// and refusal case drives the REAL orchestrator `ingest()` over the 12-01
// synthetic corpus (no adapter-only shortcuts); the spec proves the whole
// server chain — decode, decoded cap re-check, epubToBooks, TOC-merge,
// per-chapter ArticleSchema.parse + round-trip anchor gate + confidence,
// book assembly, BookSchema boundary parse, and the D12-11 skip-and-disclose
// accounting — before any UI lands (12-05+). The middleware describe pins
// the Pitfall 2 format-aware 413 reasons at both guards.
import { Readable } from "node:stream";
import type { ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import type { Connect, ViteDevServer } from "vite";
import { viteIngestMiddleware } from "../../../dev-server/ingest-middleware";
import { ingest } from "../../../server/ingest";
import { epubToBooks } from "../../../server/epubToBooks";
import { EPUB_MAX_BYTES, MAX_INGEST_BODY_BYTES } from "../../../server/limits";
import { ArticleSchema, type Book, type CanonicalArticle } from "../../../src/content/schema";
import type { IngestionResponse } from "../../../src/ingestion/types";
import {
  anchorGateFailBook,
  bombEntryBook,
  corruptNotEpub,
  degenerateTocBook,
  drmAdeptBook,
  drmLcpBook,
  drmUnknownAlgBook,
  emptyBook,
  entityBombOpf,
  frontMatterBook,
  missingContainerBook,
  mixedAdmissionBook,
  ncxOnlyBook,
  oebpsNestedBook,
  protoPollutionOpf,
  publisherSplitBook,
  validBookEpub3,
  zipSlipBook,
} from "./epub-fixtures";

// ── Helpers ──────────────────────────────────────────────────────────────────

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** Narrow an ok response to the BOOK ok-variant (fail loudly otherwise —
 * the two ok-variants share `ok: true` since 12-01). */
function expectBookEnvelope(response: IngestionResponse): {
  book: Book;
  articles: CanonicalArticle[];
  skippedCount: number;
} {
  if (!response.ok || !("book" in response)) {
    throw new Error(`expected ok:true book envelope, got ${JSON.stringify(response)}`);
  }
  return { book: response.book, articles: response.articles, skippedCount: response.skippedCount };
}

/** Plain text of every paragraph/heading block (in-chapter text assertions). */
function blockTextOf(article: CanonicalArticle): string {
  return article.blocks
    .map((b) =>
      b.kind === "paragraph" || b.kind === "heading"
        ? b.content.map((r) => r.text).join("")
        : "",
    )
    .join("\n");
}

async function ingestEpub(bytes: Uint8Array): Promise<IngestionResponse> {
  return ingest({ epub: b64(bytes) });
}

// ── Happy path — validBookEpub3 through the real orchestrator ────────────────

describe("ingest — epub fifth branch happy path", () => {
  it("admits all 4 chapters with the book envelope, deterministic -cNN ids, and per-chapter metadata", async () => {
    const { book, articles, skippedCount } = expectBookEnvelope(
      await ingestEpub(validBookEpub3()),
    );

    // Book identity — the D7-07/D12 content-hash discipline.
    expect(book.id).toMatch(/^epub-[0-9a-f]{12}$/);
    // The pinned admission count + ordered id sequence.
    expect(articles).toHaveLength(4);
    expect(book.chapterArticleIds).toEqual([
      `${book.id}-c00`,
      `${book.id}-c01`,
      `${book.id}-c02`,
      `${book.id}-c03`,
    ]);
    // chapterArticleIds mirrors the admitted articles, in order.
    expect(book.chapterArticleIds).toEqual(articles.map((a) => a.id));

    // Every article re-parses through ArticleSchema (the boundary contract
    // holds on every chapter, not just the first).
    for (const article of articles) {
      expect(() => ArticleSchema.parse(article)).not.toThrow();
    }

    // Per-chapter ingestionMeta — the epub-chapter contract.
    articles.forEach((article, i) => {
      expect(article.ingestionMeta?.source).toBe("epub-chapter");
      expect(article.ingestionMeta?.origin).toBe("upload");
      expect(article.ingestionMeta?.bookId).toBe(book.id);
      expect(article.ingestionMeta?.chapterIndex).toBe(i);
      // ING-06 — admitted chapters are high|low, never "unsupported".
      expect(["high", "low"]).toContain(article.ingestionMeta?.extractionConfidence);
      expect(article.ingestionMeta?.originalHtmlHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    // Book record — OPF-derived metadata, D12-11 disclosure, D12-04 untagged.
    expect(book.title).toBe("The Synthetic Book");
    expect(book.authors).toEqual(["Ada Author", "Bob Builder"]);
    expect(book.language).toBe("en");
    expect(book.publisher).toBe("Synthetic Press");
    expect(book.publishedDate).toBe("2026-01-01");
    expect(book.identifier).toBe("urn:uuid:synthetic-book-0001");
    expect(book.source).toBe("epub-upload");
    expect(book.skippedChapterCount).toBe(0);
    expect(book.tags).toEqual([]);
    expect(skippedCount).toBe(0);
    expect(book.originalFileHash).toMatch(/^sha256:[0-9a-f]{64}$/);

    // Provenance carries the BOOK's byline (joined) + normalized publishedAt
    // (raw OPF "2026-01-01" → midnight-UTC ISO; Provenance is
    // .datetime()-refined) + the chapter's own TOC-derived title.
    expect(articles[0]?.provenance.author).toBe("Ada Author, Bob Builder");
    expect(articles[0]?.provenance.publishedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(articles.map((a) => a.provenance.title)).toEqual([
      "Chapter 1. Loomings",
      "Chapter 2. The Carpet-Bag",
      "Chapter 3. The Sermon",
      "Chapter 4. The Cataract",
    ]);

    // D11-09 EPUB analog — the leading h2 doubling the chapter title is
    // consumed; bodies start at paragraph level (the provenance header
    // renders the title; the one-h1-per-page discipline).
    expect(articles[0]?.blocks[0]?.kind).toBe("paragraph");
  });
});

// ── Determinism — the dedupe-refuse foundation ───────────────────────────────

describe("ingest — epub determinism", () => {
  it("identical EPUB bytes produce identical book + chapter ids across ingests", async () => {
    const bytes = validBookEpub3();
    const first = expectBookEnvelope(await ingest({ epub: b64(bytes) }));
    const second = expectBookEnvelope(await ingest({ epub: b64(bytes) }));

    expect(first.book.id).toBe(second.book.id);
    expect(first.book.chapterArticleIds).toEqual(second.book.chapterArticleIds);
    expect(first.articles.map((a) => a.id)).toEqual(second.articles.map((a) => a.id));
  });
});

// ── TOC shapes — the D12-09 partition drives the article set ─────────────────

describe("ingest — epub TOC shapes", () => {
  it("publisherSplitBook → 3 articles; chapter 1 carries BOTH split documents' text (D12-09 merge)", async () => {
    const { articles } = expectBookEnvelope(await ingestEpub(publisherSplitBook()));
    expect(articles).toHaveLength(3);
    // The first chapter merged ch1a + ch1b: both documents' prose (the
    // fixture embeds its document number in every sentence — the anchor-
    // uniqueness contract) is present in the assembled article.
    const ch1Text = blockTextOf(articles[0] as CanonicalArticle);
    expect(ch1Text).toContain("The second paragraph of document 1 carries");
    expect(ch1Text).toContain("The third paragraph of document 2 closes");
    expect(articles[0]?.provenance.title).toBe("Chapter 1. Loomings");
  });

  it("frontMatterBook → 3 units with the leading front-matter unit first", async () => {
    const { articles } = expectBookEnvelope(await ingestEpub(frontMatterBook()));
    expect(articles.map((a) => a.provenance.title)).toEqual([
      "The Synthetic Book", // leading unit — titled from its first document
      "Chapter 1. Loomings",
      "Chapter 2. The Carpet-Bag",
    ]);
    // The leading unit keeps real front-matter text after the title consume.
    expect(blockTextOf(articles[0] as CanonicalArticle)).toContain("synthetic volume");
  });

  it("degenerateTocBook → 4 articles (single-entry TOC descends to its depth-2 children)", async () => {
    const { articles } = expectBookEnvelope(await ingestEpub(degenerateTocBook()));
    expect(articles.map((a) => a.provenance.title)).toEqual([
      "Chapter 1. Loomings",
      "Chapter 2. The Carpet-Bag",
      "Chapter 3. The Sermon",
      "Chapter 4. The Cataract",
    ]);
  });

  it("ncxOnlyBook → 3 articles (EPUB 2 NCX navigation drives the partition)", async () => {
    const { articles } = expectBookEnvelope(await ingestEpub(ncxOnlyBook()));
    expect(articles).toHaveLength(3);
    expect(articles.map((a) => a.provenance.title)).toEqual([
      "Chapter 1. Loomings",
      "Chapter 2. The Carpet-Bag",
      "Chapter 3. The Sermon",
    ]);
  });

  it("oebpsNestedBook → 3 articles matching the TOC (href normalization held; no fallback)", async () => {
    const bytes = oebpsNestedBook();
    const { articles } = expectBookEnvelope(await ingestEpub(bytes));
    expect(articles).toHaveLength(3);
    expect(articles.map((a) => a.provenance.title)).toEqual([
      "Chapter 1. Loomings",
      "Chapter 2. The Carpet-Bag",
      "Chapter 3. The Sermon",
    ]);
    // Corroboration (clearly NOT an adapter shortcut for the ingest path
    // above): the adapter itself reports fallbackUsed false — the 3
    // articles came from the OEBPS-relative TOC, not the spine fallback.
    const adapter = await epubToBooks(bytes);
    expect(adapter.fallbackUsed).toBe(false);
  });
});

// ── Skip disclosure (D12-11) — honest counting, stable numbering ─────────────

describe("ingest — epub skip disclosure (D12-11)", () => {
  it("mixedAdmissionBook → ok envelope with skippedCount 1; admitted chapters keep unrenumbered stable ids", async () => {
    const { book, articles, skippedCount } = expectBookEnvelope(
      await ingestEpub(mixedAdmissionBook()),
    );
    // 2 readerable chapters admitted; the pure-image plate disclosed.
    expect(articles).toHaveLength(2);
    expect(skippedCount).toBe(1);
    expect(book.skippedChapterCount).toBe(1);
    // Pitfall 10 — numbering runs over the ADMITTED list: the two survivors
    // hold the stable -c00/-c01 sequence (never renumbered by the skip).
    expect(book.chapterArticleIds).toEqual([`${book.id}-c00`, `${book.id}-c01`]);
    expect(articles.map((a) => a.provenance.title)).toEqual([
      "Chapter 1. Loomings",
      "Chapter 2. The Carpet-Bag",
    ]);
  });

  it("anchorGateFailBook → the anchor-gate-failing chapter is skipped and disclosed; the rest of the book enters", async () => {
    // The adapter ADMITS both chapters (D12-10 judges block mass); the
    // hostile chapter's periodic text cannot round-trip a TextQuoteSelector
    // → the PER-CHAPTER stage-level gate skips it (never a whole-book
    // failure) — the exact D12-11 path this plan wires in.
    const { book, articles, skippedCount } = expectBookEnvelope(
      await ingestEpub(anchorGateFailBook()),
    );
    expect(articles).toHaveLength(1);
    expect(skippedCount).toBe(1);
    expect(book.skippedChapterCount).toBe(1);
    expect(book.chapterArticleIds).toEqual([`${book.id}-c00`]);
    expect(articles[0]?.provenance.title).toBe("Chapter 1. Loomings");
  });
});

// ── Typed refusals — the whole hostile corpus, through the real orchestrator ──

describe("ingest — epub typed refusals", () => {
  it.each([
    ["drmAdeptBook (META-INF/rights.xml)", drmAdeptBook, "epub-protected"],
    ["drmLcpBook (META-INF/license.lcpl)", drmLcpBook, "epub-protected"],
    ["drmUnknownAlgBook (vendor algorithm)", drmUnknownAlgBook, "epub-protected"],
  ] as const)("refuses %s with %s", async (_label, build, reason) => {
    expect(await ingestEpub(build())).toEqual({ ok: false, reason });
  });

  it.each([
    ["corruptNotEpub (not a zip)", corruptNotEpub],
    ["missingContainerBook (no container.xml)", missingContainerBook],
    ["entityBombOpf (billion-laughs DOCTYPE)", entityBombOpf],
    ["protoPollutionOpf (__proto__ element)", protoPollutionOpf],
    ["zipSlipBook (../../evil.xhtml)", zipSlipBook],
    ["bombEntryBook (over-cap declared entry)", bombEntryBook],
  ] as const)("refuses %s with epub-unreadable", async (_label, build) => {
    expect(await ingestEpub(build())).toEqual({ ok: false, reason: "epub-unreadable" });
  });

  it("emptyBook (every spine document a plate) refuses with epub-empty (D12-11 zero-admit)", async () => {
    expect(await ingestEpub(emptyBook())).toEqual({ ok: false, reason: "epub-empty" });
  });
});

// ── Caps — the orchestrator decoded re-check (third enforcement layer) ────────

describe("ingest — epub caps", () => {
  it("decoded length over EPUB_MAX_BYTES refuses epub-too-large BEFORE parsing (guard ordering)", async () => {
    // EPUB_MAX_BYTES + 1 zero bytes: not an EPUB at all — if the decoded
    // re-check did NOT fire first, the adapter would refuse with
    // epub-unreadable instead. The typed reason proves guard ordering
    // (the 11-03 pdf-too-large proof, EPUB edition).
    const oversizedB64 = Buffer.alloc(EPUB_MAX_BYTES + 1).toString("base64");
    expect(await ingest({ epub: oversizedB64 })).toEqual({
      ok: false,
      reason: "epub-too-large",
    });
  });
});

// ── Middleware — format-aware 413 reasons (Pitfall 2) ────────────────────────

/** Captured connect handler shape the Vite middleware installs. */
type InstalledHandler = (
  req: Connect.IncomingMessage,
  res: ServerResponse,
  next: Connect.NextFunction,
) => void | Promise<void>;

/** Drive viteIngestMiddleware against a fake ViteDevServer whose
 * middlewares.use captures the installed handler. */
function captureHandler(): InstalledHandler {
  let captured: InstalledHandler | undefined;
  const fakeServer = {
    middlewares: {
      use: (handler: InstalledHandler) => {
        captured = handler;
      },
    },
  } as unknown as ViteDevServer;
  viteIngestMiddleware()(fakeServer);
  if (!captured) throw new Error("middleware did not install a handler");
  return captured;
}

/** Response stub capturing statusCode / headers / body. */
interface ResStub {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  ended: boolean;
  setHeader(name: string, value: string): void;
  end(chunk?: string): void;
}

function resStub(): ResStub {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    ended: false,
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },
    end(chunk?: string) {
      this.ended = true;
      this.body = chunk ?? "";
    },
  };
}

/** Build a POST request stub over a paused node Readable; `pulled` flips
 * true the moment a data listener switches the stream to flowing mode. */
function reqStub(
  headers: Record<string, string>,
  url: string,
  chunks: string[] = [],
): { req: Connect.IncomingMessage; pulled: () => boolean } {
  let pulled = false;
  const stream = new Readable({
    read() {
      pulled = true;
      this.push(null);
    },
  });
  for (const chunk of chunks) stream.push(chunk);
  const req = stream as unknown as Connect.IncomingMessage;
  req.method = "POST";
  req.url = url;
  req.headers = headers;
  return { req, pulled: () => pulled };
}

describe("viteIngestMiddleware — format-aware 413 reasons (Pitfall 2)", () => {
  it("pre-read: an over-cap content-length with ?format=epub refuses 413 epub-too-large WITHOUT reading the body", async () => {
    const handler = captureHandler();
    const { req, pulled } = reqStub(
      { "content-length": String(MAX_INGEST_BODY_BYTES + 1) },
      "/api/ingest?format=epub",
    );
    const res = resStub();
    await handler(req, res as unknown as ServerResponse, () => {});
    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body)).toEqual({ ok: false, reason: "epub-too-large" });
    expect(res.headers["content-type"]).toBe("application/json");
    // The guard still fires BEFORE readBody attaches a listener.
    expect(pulled()).toBe(false);
  });

  it("pre-read: without the hint the historical pdf-too-large copy is preserved", async () => {
    const handler = captureHandler();
    const { req, pulled } = reqStub(
      { "content-length": String(MAX_INGEST_BODY_BYTES + 1) },
      "/api/ingest",
    );
    const res = resStub();
    await handler(req, res as unknown as ServerResponse, () => {});
    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body)).toEqual({ ok: false, reason: "pdf-too-large" });
    expect(pulled()).toBe(false);
  });

  it("post-read: an over-cap chunked {epub} body refuses 413 epub-too-large (parsed-body-key branch)", async () => {
    const handler = captureHandler();
    const { req } = reqStub(
      {},
      "/api/ingest",
      [JSON.stringify({ epub: "A".repeat(MAX_INGEST_BODY_BYTES), filename: "book.epub" })],
    );
    const res = resStub();
    await handler(req, res as unknown as ServerResponse, () => {});
    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body)).toEqual({ ok: false, reason: "epub-too-large" });
  });

  it("post-read: an over-cap chunked {pdf} body still refuses pdf-too-large (both branches pinned)", async () => {
    const handler = captureHandler();
    const { req } = reqStub(
      {},
      "/api/ingest",
      [JSON.stringify({ pdf: "A".repeat(MAX_INGEST_BODY_BYTES), filename: "report.pdf" })],
    );
    const res = resStub();
    await handler(req, res as unknown as ServerResponse, () => {});
    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body)).toEqual({ ok: false, reason: "pdf-too-large" });
  });

  it("post-read: a non-JSON over-cap chunked body falls back to the hint default (historical copy)", async () => {
    const handler = captureHandler();
    const { req } = reqStub({}, "/api/ingest", ["A".repeat(MAX_INGEST_BODY_BYTES + 1)]);
    const res = resStub();
    await handler(req, res as unknown as ServerResponse, () => {});
    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body)).toEqual({ ok: false, reason: "pdf-too-large" });
  });
});
