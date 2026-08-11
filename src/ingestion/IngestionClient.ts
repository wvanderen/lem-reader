// src/ingestion/IngestionClient.ts
// Plan 07-06 — the reader-facing half of the ingestion pipeline. This module
// is the client glue between the IngestControl UI (07-06 Task 2) and the
// /api/ingest endpoint (served by the Vite Node dev middleware for Phase 7;
// the future-production Cloudflare Pages Function shape is preserved in
// functions/api/ingest.ts per D7-05 + the 07-01 HYBRID CONTINGENCY spike).
//
// Three contracts (07-06-PLAN.md §must_haves truths):
//   1. STATE-04 defense-in-depth: every server response is RE-VALIDATED
//      through `ArticleSchema.parse` on the client read path. The network
//      is a trust boundary (STATE-04); the server's Zod-at-boundary parse
//      is necessary but not sufficient.
//   2. Typed failure surface: a refused ingest throws `IngestionError` with
//      `.reason` drawn from `IngestionFailureReasonEnum` (the 11-reason
//      catalog from 07-02). The UI maps each reason to a calm DOC-06 phrase
//      in the `.status` live region (D7-04 — zero new chrome).
//   3. Same-origin POST: `fetch("/api/ingest", ...)` — the SPA's CSP
//      `connect-src 'self'` is the load-bearing boundary. No cross-origin
//      hops, no proxy.
//
// Threat register (07-06-PLAN.md `<threat_model>`):
//   - T-7-25 (Tampering, malformed IngestionResponse) → ArticleSchema.parse
//     refuses a malformed server response on the read path.
//   - T-7-26 (Tampering, refusal copy leaks jargon) → this module throws the
//     typed `reason`; mapReasonToCopy (lives in IngestControl) is the only
//     place reason → reader-facing phrase.
import { ArticleSchema, type CanonicalArticle } from "../content/schema";
import type { IngestionFailureReason, IngestionResponse } from "./types";

/**
 * IngestionError — the client-side mirror of server/errors.ts. Carries the
 * typed `.reason` from IngestionFailureReasonEnum so the UI can map it to a
 * calm DOC-06 phrase without parsing Error.message. Lives in src/ (not
 * /server) so it's in the client bundle.
 */
export class IngestionError extends Error {
  readonly reason: IngestionFailureReason;

  constructor(reason: IngestionFailureReason, message?: string) {
    super(message ?? reason);
    this.name = "IngestionError";
    this.reason = reason;
  }
}

/**
 * The success shape returned by ingestUrl/ingestHtml. The article is
 * ArticleSchema-validated; confidence carries the reader-facing two-state
 * signal (the "unsupported" three-state outcome is refused upstream).
 */
export interface IngestionSuccess {
  article: CanonicalArticle;
  confidence: { state: "confident" | "low" };
}

/**
 * ingestUrl — POST {url} to /api/ingest and re-validate the response.
 *
 * Throws `IngestionError` with the typed `.reason` on any ok:false response
 * OR on a non-2xx HTTP status. Throws ZodError (untyped) if the server
 * returns a malformed article — the caller's catch-all surfaces
 * "Something went wrong. Try again." (the IngestionFailureReason
 * "server-error" copy).
 */
export async function ingestUrl(url: string): Promise<IngestionSuccess> {
  return ingest({ url });
}

/**
 * ingestHtml — POST {html} to /api/ingest and re-validate the response.
 * The paste path (D7-08): the article has no canonical sourceUrl, so the
 * returned article's `provenance.sourceUrl` is undefined and the
 * ArticleView's "open original" link hides (07-02 fixed the conditional).
 */
export async function ingestHtml(html: string): Promise<IngestionSuccess> {
  return ingest({ html });
}

/**
 * Private ingest — the shared POST + parse + throw pipeline. Both
 * ingestUrl and ingestHtml delegate here. The body is always exactly one
 * of {url} | {html} (IngestionRequestSchema on the server enforces this,
 * but the client constructs the body so the contract is by construction).
 *
 * STATE-04 defense-in-depth: the network response is RE-VALIDATED through
 * `ArticleSchema.parse`. A server that returns a malformed article (whether
 * by bug or by tampering) is refused on the client read path. This is the
 * second Zod parse — the server already parsed at ingest time (07-05).
 */
async function ingest(body: { url: string } | { html: string }): Promise<IngestionSuccess> {
  const res = await fetch("/api/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // Parse the response body as IngestionResponse. A non-JSON body (e.g. an
  // HTML 502 page from a misconfigured proxy) throws here; surface it as
  // the catch-all server-error.
  let json: IngestionResponse;
  try {
    json = (await res.json()) as IngestionResponse;
  } catch {
    throw new IngestionError("server-error");
  }

  // Typed refusal: ok:false carries the cataloged reason.
  if (!json.ok) {
    throw new IngestionError(json.reason);
  }

  // HTTP non-2xx with an ok:true body is a contract violation — refuse
  // rather than trust a partial payload.
  if (!res.ok) {
    throw new IngestionError("server-error");
  }

  // STATE-04 re-validation. ArticleSchema.parse throws ZodError on a
  // malformed article; the caller's catch-all surfaces "Something went
  // wrong. Try again." (server-error copy). This is the load-bearing
  // defense against a tampered or buggy server response.
  const article = ArticleSchema.parse(json.article);

  return { article, confidence: json.confidence };
}
