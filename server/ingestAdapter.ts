// server/ingestAdapter.ts
// Plan 07-06 — the shared body→ingest→response helper used by BOTH
//   - `functions/api/ingest.ts` (the future-shape Cloudflare Pages Function
//     adapter, preserved per D7-05 — but per the 07-01 HYBRID CONTINGENCY
//     spike verdict extraction does NOT run on workerd; this Pages Function
//     is the production-future shape, NOT the Phase 7 dev/e2e path)
//   - `dev-server/ingest-middleware.ts` (the Vite Node dev middleware that
//     actually serves /api/ingest for Phase 7 dev + e2e — jsdom + DOMPurify
//     + Readability all run natively in Node)
//
// Both wrappers call this single helper so the body-parse → delegate →
// status-map contract is byte-identical across the two runtimes. The helper
// is platform-agnostic: it takes an already-parsed body (object | null),
// delegates to `ingest()` (the platform-agnostic orchestrator from 07-05),
// and returns `{ status, body }` for the wrapper to serialize.
//
// Status mapping (mirrors 07-06-PLAN.md §must_haves truths):
//   - ok:true  → HTTP 200 + the full IngestionResponse (article + confidence)
//   - ok:false → HTTP 400 + the typed IngestionResponse (reason)
//   - non-object / null body → HTTP 400 + { ok: false, reason: "server-error" }
//
// Threat register: T-7-23 (Repudiation) is owned by server/ingest.ts (every
// throw is wrapped to a typed IngestionResponse). T-7-25 (Tampering, malformed
// IngestionResponse) is mitigated downstream by IngestionClient's
// ArticleSchema.parse re-validation (STATE-04 defense-in-depth on the read).
import { ingest } from "./ingest";
import type { IngestionRequest, IngestionResponse } from "../src/ingestion/types";

export interface IngestAdapterResult {
  status: number;
  body: IngestionResponse;
}

/**
 * handleIngestBody — turn an inbound request body into `{ status, body }`.
 *
 * Pre-conditions: the wrapper has already pulled the raw bytes off the wire
 * (Pages Function: `await context.request.json()`; Vite middleware:
 * `JSON.parse(await readBody(req))`). Both wrappers hand the parsed value
 * (or null) here.
 *
 * Post-conditions: returns a 200/400 status + an IngestionResponse suitable
 * for `Response.json(body, { status })` (Pages Function) or
 * `res.statusCode = status; res.json(body)` (Vite middleware).
 */
export async function handleIngestBody(
  body: unknown,
): Promise<IngestAdapterResult> {
  // Body-shape guard: a non-object body cannot be an IngestionRequest; the
  // orchestrator would throw, which the catch in `ingest()` wraps to the
  // generic "server-error". Short-circuit here so we don't pay the cost and
  // the response is deterministic.
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return {
      status: 400,
      body: { ok: false, reason: "server-error" },
    };
  }

  const result = await ingest(body as IngestionRequest);
  return result.ok
    ? { status: 200, body: result }
    : { status: 400, body: result };
}
