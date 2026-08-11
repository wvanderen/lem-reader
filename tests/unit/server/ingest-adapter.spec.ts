// tests/unit/server/ingest-adapter.spec.ts
// Phase 7 Plan 06 Task 1 — RED gate. Behavior tests for the shared adapter
// helper (server/ingestAdapter.ts) that turns an inbound request body into
// `{ status, body }` for both:
//   - `functions/api/ingest.ts` (future-shape Cloudflare Pages Function,
//     preserved per D7-05 + the 07-01 HYBRID CONTINGENCY verdict)
//   - `dev-server/ingest-middleware.ts` (the Vite Node middleware that
//     actually serves /api/ingest for Phase 7 dev + e2e — extraction runs
//     on Node where jsdom works natively)
//
// The adapter helper delegates to `server/ingest.ts` (the platform-agnostic
// 7-stage orchestrator from 07-05); here we mock `ingest` to control ok|fail
// outcomes and verify the helper's body-parse + status-mapping contract.
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the orchestrator so the adapter helper test runs in isolation from
// the real /api/ingest pipeline. The mock returns whatever we drive.
vi.mock("../../../server/ingest", () => ({
  ingest: vi.fn(),
}));

import { ingest } from "../../../server/ingest";
import { handleIngestBody } from "../../../server/ingestAdapter";
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

describe("handleIngestBody (07-06 Task 1 adapter)", () => {
  beforeEach(() => {
    ingestMock.mockReset();
  });

  it("returns 200 + body when ingest resolves ok:true", async () => {
    ingestMock.mockResolvedValue(okArticle());
    const result = await handleIngestBody({ url: "https://example.com/article" });

    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(ingestMock).toHaveBeenCalledTimes(1);
    expect(ingestMock.mock.calls[0][0]).toEqual({ url: "https://example.com/article" });
  });

  it("returns 400 + body when ingest resolves ok:false (typed refusal)", async () => {
    ingestMock.mockResolvedValue({
      ok: false,
      reason: "ssrf-blocked-metadata",
    });
    const result = await handleIngestBody({ url: "http://169.254.169.254/" });

    expect(result.status).toBe(400);
    expect(result.body).toEqual({ ok: false, reason: "ssrf-blocked-metadata" });
  });

  it("returns 400 + server-error when body is null", async () => {
    const result = await handleIngestBody(null);
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ ok: false, reason: "server-error" });
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("returns 400 + server-error when body is not an object", async () => {
    const result = await handleIngestBody("not-an-object");
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ ok: false, reason: "server-error" });
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("accepts the paste path — {html}", async () => {
    ingestMock.mockResolvedValue(okArticle());
    await handleIngestBody({ html: "<article>paste</article>" });
    expect(ingestMock.mock.calls[0][0]).toEqual({ html: "<article>paste</article>" });
  });
});
