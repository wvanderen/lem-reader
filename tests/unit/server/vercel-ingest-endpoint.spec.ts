// tests/unit/server/vercel-ingest-endpoint.spec.ts
// Quick task 260821-k6z Task 1 — RED gate. Contract tests for the Vercel
// Node function wrapper (api/ingest.ts): the D7-05 adapter-boundary port
// that serves POST /api/ingest on Vercel's DEFAULT Node.js runtime (jsdom +
// isomorphic-dompurify + Readability run natively there — the exact reason
// the 07-01 spike verdict moved the host off workerd, HYBRID CONTINGENCY,
// human-approved 2026-08-11).
//
// These tests cover ONLY the wrapper's I/O glue — request.json() →
// handleIngestBody → Response.json — mirroring the established
// ingest-adapter.spec.ts convention: `vi.mock("../../../server/ingest")` so
// the wrapper test runs in isolation from the real pipeline (extraction +
// sanitize behavior is already covered by extraction.spec.ts / mxss.spec.ts;
// the body→status mapping by ingest-adapter.spec.ts). The wrapper is driven
// through the same web-standard surface Vercel invokes: default-export the
// handler object and call `.fetch(new Request(...))` — Node 22 provides the
// global Request/Response the platform handler form is written against (the
// vitest `server` project's jsdom env does not shadow them; jsdom implements
// no fetch API).
//
// Contract under test (identical to functions/api/ingest.ts + the dev
// middleware, byte-for-byte via the SHARED server/ingestAdapter.ts helper):
//   - malformed JSON body  → 400 { ok:false, reason:"server-error" }, no ingest
//   - ingest ok:true       → 200 + the full IngestionResponse envelope
//   - ingest ok:false      → 400 + the typed refusal body
//   - Response.json sets the application/json content-type header
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the orchestrator so the wrapper test runs in isolation from the real
// /api/ingest pipeline. The mock returns whatever we drive — the wrapper must
// pass it through untouched (zero logic fork, D7-05).
vi.mock("../../../server/ingest", () => ({
  ingest: vi.fn(),
}));

import { ingest } from "../../../server/ingest";
import handler from "../../../api/ingest";
import type { IngestionResponse } from "../../../src/ingestion/types";

const ingestMock = vi.mocked(ingest);

function okArticle(): IngestionResponse {
  return {
    ok: true,
    article: {
      id: "ingested-article",
      revision: 1,
      lang: "en",
      provenance: {
        sourceUrl: "https://example.com/article",
        title: "Article",
        retrievedAt: "2026-08-11T00:00:00.000Z",
        originalHtmlHash: "sha256:" + "0".repeat(64),
      },
      blocks: [
        { kind: "paragraph", content: [{ text: "Hello.", marks: [] }] },
      ],
      footnotes: [],
      ingestionMeta: {
        source: "url",
        originalHtmlHash: "sha256:" + "0".repeat(64),
        extractionConfidence: "high",
        extractionWarnings: [],
      },
    },
    confidence: { state: "confident" },
  } as IngestionResponse;
}

/**
 * Build the POST /api/ingest Request exactly as the platform would deliver
 * it — JSON content-type, string body. A malformed-JSON body is passed
 * through as-is so the wrapper's request.json() try/catch is the code path
 * under test.
 */
function postRequest(body: string): Request {
  return new Request("https://lem-reader.example.com/api/ingest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("api/ingest.ts Vercel Node function wrapper (260821-k6z Task 1)", () => {
  beforeEach(() => {
    ingestMock.mockReset();
  });

  it("malformed JSON body → 400 { ok:false, reason:'server-error' }; ingest NOT called", async () => {
    const res = await handler.fetch(postRequest("{not json"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: "server-error" });
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("ingest ok:true → 200 + the exact mocked envelope; ingest called once with the parsed body object", async () => {
    const envelope = okArticle();
    ingestMock.mockResolvedValue(envelope);

    const res = await handler.fetch(
      postRequest(JSON.stringify({ url: "https://example.com/article" })),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(envelope);
    expect(ingestMock).toHaveBeenCalledTimes(1);
    const firstCall = ingestMock.mock.calls[0]!;
    expect(firstCall[0]).toEqual({ url: "https://example.com/article" });
  });

  it("ingest ok:false → 400 + the exact typed refusal body", async () => {
    ingestMock.mockResolvedValue({
      ok: false,
      reason: "ssrf-blocked-metadata",
    });

    const res = await handler.fetch(
      postRequest(JSON.stringify({ url: "http://169.254.169.254/" })),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      reason: "ssrf-blocked-metadata",
    });
  });

  it("response content-type is application/json (Response.json sets it)", async () => {
    ingestMock.mockResolvedValue(okArticle());

    const res = await handler.fetch(
      postRequest(JSON.stringify({ url: "https://example.com/article" })),
    );

    expect(res.headers.get("content-type")).toContain("application/json");
  });
});
