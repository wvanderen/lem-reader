// tests/unit/server/ingest-pdf.spec.ts
// Plan 11-03 — the fourth-branch integration suite (created fresh by this
// plan; no 11-01 sentinel predecessor — checker scope revision). Proves the
// pdf Stage-1 branch end-to-end through the REAL orchestrator `ingest()`:
// happy path (pdf-<hash> id, D11-07 title chain, upload origin), content-hash
// id stability (D7-07 save-once substrate), typed refusal serialization
// through the existing IngestionError catch, and the D11-09 doubled-title
// consume helper. Task 2 adds the middleware body-cap tests, the explicit
// round-trip anchor re-proof (SC#4a), and the stripPdfExtension units.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import type { ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import type { Connect, ViteDevServer } from "vite";
import { viteIngestMiddleware } from "../../../dev-server/ingest-middleware";
import {
  assertRoundTripAnchor,
  consumeDuplicatedTitle,
  ingest,
  stripPdfExtension,
} from "../../../server/ingest";
import { MAX_INGEST_BODY_BYTES, PDF_MAX_BYTES } from "../../../server/limits";
import type { Block } from "../../../src/content/schema";

// ── Synthetic fixture loading (tests/fixtures/pdf — committed corpus) ────────
const FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
  "pdf",
);

function fixtureB64(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name)).toString("base64");
}

// ── Hand-built block helpers (consumeDuplicatedTitle unit table) ─────────────
function heading(text: string): Block {
  return { kind: "heading", level: 2, content: [{ text, marks: [] }] };
}

function para(text: string): Block {
  return { kind: "paragraph", content: [{ text, marks: [] }] };
}

// ── Task 1 — happy path through the real orchestrator ────────────────────────
describe("ingest — pdf fourth branch happy path", () => {
  it("admits synthetic-single-column.pdf with a pdf-<hash> id, upload origin, and the filename title chain", async () => {
    // The synthetic fixtures carry NO Info-dictionary title (the generator
    // writes no /Info object), so provenancePartial.title is undefined and
    // the D11-07 chain resolves through the filename: "calm-report.pdf" →
    // "calm-report".
    const response = await ingest({
      pdf: fixtureB64("synthetic-single-column.pdf"),
      filename: "calm-report.pdf",
    });

    expect(response.ok).toBe(true);
    if (!response.ok) {
      throw new Error(`expected ok:true, got refusal: ${response.reason}`);
    }

    const article = response.article;
    // D7-07/D8-18/D11 id discipline — content-hash slug, never the filename.
    expect(article.id).toMatch(/^pdf-[0-9a-f]{12}$/);
    // Stage-1 metadata — the fourth branch's own channel values.
    expect(article.ingestionMeta?.source).toBe("pdf");
    expect(article.ingestionMeta?.origin).toBe("upload");
    expect(article.ingestionMeta?.sourceUrl).toBeUndefined();
    // D11-07 chain — filename minus .pdf (no sane Info title on the fixture).
    expect(article.provenance.title).toBe("calm-report");
    // ING-06 — admitted articles are confidently or low-flagged, never
    // "unsupported" (that state is refused upstream).
    expect(["high", "low"]).toContain(article.ingestionMeta?.extractionConfidence);
    expect(["confident", "low"]).toContain(response.confidence.state);
    // The fixture assembles heading + paragraph blocks (≥ 3 by isReaderable).
    expect(article.blocks.length).toBeGreaterThanOrEqual(3);
    expect(article.blocks.some((b) => b.kind === "heading")).toBe(true);
    expect(article.blocks.some((b) => b.kind === "paragraph")).toBe(true);
  });

  it("falls back to the neutral 'PDF document' title when no filename is given", async () => {
    const response = await ingest({ pdf: fixtureB64("synthetic-single-column.pdf") });
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.article.provenance.title).toBe("PDF document");
    }
  });
});

// ── Task 1 — id stability (D7-07 save-once dedupe substrate) ─────────────────
describe("ingest — pdf id stability", () => {
  it("identical pdf bytes produce identical ids regardless of filename", async () => {
    const first = await ingest({
      pdf: fixtureB64("synthetic-single-column.pdf"),
      filename: "calm-report.pdf",
    });
    const second = await ingest({
      pdf: fixtureB64("synthetic-single-column.pdf"),
      filename: "a-completely-different-name.pdf",
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.article.id).toBe(second.article.id);
    }
  });
});

// ── Task 1 — typed refusals serialize through the IngestionError catch ───────
describe("ingest — pdf typed refusals", () => {
  it("corrupt bytes refuse with pdf-unreadable", async () => {
    const response = await ingest({ pdf: fixtureB64("synthetic-corrupt.pdf") });
    expect(response).toEqual({ ok: false, reason: "pdf-unreadable" });
  });

  it("scanned fixture refuses with pdf-scanned", async () => {
    const response = await ingest({ pdf: fixtureB64("synthetic-scanned.pdf") });
    expect(response).toEqual({ ok: false, reason: "pdf-scanned" });
  });

  it("two-column fixture refuses with pdf-multi-column (never silently reordered)", async () => {
    const response = await ingest({ pdf: fixtureB64("synthetic-two-column.pdf") });
    expect(response).toEqual({ ok: false, reason: "pdf-multi-column" });
  });

  it("decoded length over PDF_MAX_BYTES refuses with pdf-too-large BEFORE parsing", async () => {
    // PDF_MAX_BYTES + 1 zero bytes: not a PDF at all — if the decoded
    // re-check did NOT fire first, the parser would refuse with
    // pdf-unreadable instead. The typed reason proves guard ordering.
    const oversizedB64 = Buffer.alloc(PDF_MAX_BYTES + 1).toString("base64");
    const response = await ingest({ pdf: oversizedB64 });
    expect(response).toEqual({ ok: false, reason: "pdf-too-large" });
  });
});

// ── Task 1 — consumeDuplicatedTitle (D11-09 doubled-title consume) ───────────
describe("consumeDuplicatedTitle", () => {
  it("drops a leading heading whose normalized text equals the title (case/whitespace-insensitive)", () => {
    const blocks = [heading("Calm   Report"), para("Body text follows.")];
    const consumed = consumeDuplicatedTitle(blocks, "calm-report");
    expect(consumed).toHaveLength(1);
    expect(consumed[0]?.kind).toBe("paragraph");
  });

  it("drops a leading heading contained in the title (either direction)", () => {
    // Block text contained in the longer title.
    const contained = consumeDuplicatedTitle(
      [heading("A Study of Calm Reading"), para("Body.")],
      "A Study of Calm Reading — Final Report",
    );
    expect(contained).toHaveLength(1);
    expect(contained[0]?.kind).toBe("paragraph");

    // Title contained in the longer block text.
    const containing = consumeDuplicatedTitle(
      [heading("A Study of Calm Reading Well"), para("Body.")],
      "calm reading",
    );
    expect(containing).toHaveLength(1);
    expect(containing[0]?.kind).toBe("paragraph");
  });

  it("keeps a non-matching leading heading", () => {
    const blocks = [heading("Method"), para("Body text follows.")];
    expect(consumeDuplicatedTitle(blocks, "calm-report")).toEqual(blocks);
  });

  it("keeps a non-heading first block untouched", () => {
    const blocks = [para("Long-form reading asks for steady attention."), para("More body.")];
    expect(consumeDuplicatedTitle(blocks, "calm-report")).toEqual(blocks);
  });

  it("returns an empty block list unchanged", () => {
    expect(consumeDuplicatedTitle([], "calm-report")).toEqual([]);
  });
});

// ── Task 2 — stripPdfExtension (D11-07 filename channel) ────────────────────
describe("stripPdfExtension", () => {
  it("strips a trailing .pdf (case-insensitive)", () => {
    expect(stripPdfExtension("Report.pdf")).toBe("Report");
    expect(stripPdfExtension("report.PDF")).toBe("report");
    expect(stripPdfExtension("archive.v2.Pdf")).toBe("archive.v2");
  });

  it("passes a filename without a .pdf extension through unchanged", () => {
    expect(stripPdfExtension("no-extension")).toBe("no-extension");
    expect(stripPdfExtension("pdf-like-name")).toBe("pdf-like-name");
  });

  it("does not strip an embedded .pdf that is not the extension", () => {
    expect(stripPdfExtension("report.pdfdraft")).toBe("report.pdfdraft");
  });
});

// ── Task 2 — SC#4a round-trip re-proof at integration level ──────────────────
describe("ingest — pdf round-trip anchor re-proof (SC#4a)", () => {
  it("re-running assertRoundTripAnchor on the returned article does not throw", async () => {
    const response = await ingest({
      pdf: fixtureB64("synthetic-single-column.pdf"),
      filename: "calm-report.pdf",
    });
    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error(`expected ok:true, got ${response.reason}`);
    // The orchestrator already ran the gate internally (Stage 7); re-running
    // it here proves the PERSISTED article shape round-trips — an admitted
    // PDF is a fixture to the reading engine (SC#4a integration proof).
    expect(() => assertRoundTripAnchor(response.article)).not.toThrow();
  });
});

// ── Task 2 — middleware body caps (Pitfall 7: refuse BEFORE accumulation) ───
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
      // Node's ServerResponse.setHeader stores names lowercase — mirror that
      // so assertions can read headers["content-type"] like real code does.
      this.headers[name.toLowerCase()] = value;
    },
    end(chunk?: string) {
      this.ended = true;
      this.body = chunk ?? "";
    },
  };
}

/** Build a POST /api/ingest request stub over a node Readable. When `read`
 * fires (`pulled === true` afterwards) a data listener switched the stream
 * to flowing mode — i.e. the body WAS read. */
function reqStub(
  headers: Record<string, string>,
  chunks: string[] = [],
): { req: Connect.IncomingMessage; pulled: () => boolean } {
  let pulled = false;
  const stream = new Readable({
    read() {
      pulled = true;
      this.push(null);
    },
  });
  // Pre-load the chunks without starting flow (paused mode until a listener
  // attaches) so the not-read assertion below is meaningful.
  for (const chunk of chunks) stream.push(chunk);
  const req = stream as unknown as Connect.IncomingMessage;
  req.method = "POST";
  req.url = "/api/ingest";
  req.headers = headers;
  return { req, pulled: () => pulled };
}

describe("viteIngestMiddleware — body caps (T-11-02)", () => {
  it("refuses an over-cap content-length with 413 pdf-too-large WITHOUT reading the body", async () => {
    const handler = captureHandler();
    const { req, pulled } = reqStub({
      "content-length": String(MAX_INGEST_BODY_BYTES + 1),
    });
    const res = resStub();
    let nextCalled = false;
    await handler(req, res as unknown as ServerResponse, () => {
      nextCalled = true;
    });

    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body)).toEqual({ ok: false, reason: "pdf-too-large" });
    expect(res.headers["content-type"]).toBe("application/json");
    // Pitfall 7 — the guard fires BEFORE readBody accumulates anything.
    expect(pulled()).toBe(false);
    expect(nextCalled).toBe(false);
  });

  it("refuses an over-cap chunked body (no content-length) with the same 413 envelope after readBody", async () => {
    const handler = captureHandler();
    // One giant non-JSON chunk: readBody accumulates it, the raw-length
    // re-check fires, and the typed envelope must still come back 413.
    const { req } = reqStub({}, ["A".repeat(MAX_INGEST_BODY_BYTES + 1)]);
    const res = resStub();
    await handler(req, res as unknown as ServerResponse, () => {});

    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body)).toEqual({ ok: false, reason: "pdf-too-large" });
    expect(res.headers["content-type"]).toBe("application/json");
  });

  it("still delegates an under-cap pdf body through the full pipeline (guard does not over-fire)", async () => {
    const handler = captureHandler();
    const body = JSON.stringify({
      pdf: fixtureB64("synthetic-single-column.pdf"),
      filename: "calm-report.pdf",
    });
    const { req } = reqStub({ "content-length": String(Buffer.byteLength(body, "utf-8")) }, [body]);
    const res = resStub();
    await handler(req, res as unknown as ServerResponse, () => {});

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body) as { ok: boolean; article?: { id: string } };
    expect(parsed.ok).toBe(true);
    expect(parsed.article?.id).toMatch(/^pdf-[0-9a-f]{12}$/);
  });

  it("falls through to next() for non-matching routes", async () => {
    const handler = captureHandler();
    const stream = new Readable({
      read() {
        this.push(null);
      },
    });
    const req = stream as unknown as Connect.IncomingMessage;
    req.method = "GET";
    req.url = "/";
    req.headers = {};
    const res = resStub();
    let nextCalled = false;
    await handler(req, res as unknown as ServerResponse, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
    expect(res.ended).toBe(false);
  });
});
