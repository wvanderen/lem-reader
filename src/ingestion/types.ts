// src/ingestion/types.ts
// Phase 7 — client-side ingestion request/response envelope schemas. The
// server-side `/server/ingest.ts` orchestrator returns the response envelope;
// the client (`src/ingestion/IngestionClient.ts`, lands in 07-06) re-validates
// it through these schemas (Zod-at-boundary on the network read — STATE-04
// defense-in-depth). `IngestionFailureReasonEnum` is the canonical catalog of
// reasons surfaced via the `.status` live region (D7-04 — calm DOC-06 voice).
//
// Single source of truth: `ArticleSchema` + `IngestionMetaSchema` +
// `httpUrl` live in `src/content/schema.ts` and are re-used here, NOT
// re-declared (mirrors the v1.0 convention — schemas are authoritative).
import { z } from "zod";
import { ArticleSchema, httpUrl } from "../content/schema";

/** IngestionRequest — D7-03 input-source-agnostic envelope. Exactly one of
 * {url} | {html} | {markdown}. The url variant is httpUrl-refined (single
 * source of truth with Provenance.sourceUrl / IngestionMeta.sourceUrl); the
 * html variant requires `.min(1)` so an empty paste is rejected at the
 * boundary (D7-03). The Phase 8 markdown variant (D8-16 + D8-17) carries the
 * raw `.md` source plus an optional `filename` hint — the server uses the
 * filename ONLY for the title fallback chain (D8-17); it does NOT affect the
 * article id (D8-18 — id is content-hash, not filename-hash). */
export const IngestionRequestSchema = z.union([
  z.object({ url: httpUrl }),
  z.object({ html: z.string().min(1) }),
  // Phase 8 ING-03 + D8-17 — markdown upload with optional filename channel.
  z.object({
    markdown: z.string().min(1),
    filename: z.string().optional(),
  }),
]);
export type IngestionRequest = z.infer<typeof IngestionRequestSchema>;

/** IngestionFailureReasonEnum — the 11 honest-failure reasons surfaced to the
 * reader. Cataloged at 07-RESEARCH.md §Code Examples Example 1 L793-795 (the 9
 * pipeline reasons) plus `already-in-library` (D7-07 dedupe-refuse) plus
 * `extraction-unsupported` (ING-06 three-state — the "couldn't reliably read
 * this page" refusal). The "server-error" catch-all is the 11th. The client
 * maps each to a calm DOC-06 phrase in the `.status` live region (D7-04). */
export const IngestionFailureReasonEnum = z.enum([
  "ssrf-blocked-scheme", // Pitfall 3 measure 1 — non-http(s) scheme
  "ssrf-blocked-private-ip", // Pitfall 3 — private/loopback/link-local/CGNAT
  "ssrf-blocked-metadata", // Pitfall 3 measure 5 — 169.254.169.254 et al
  "fetch-failed", // network error, DNS unresolved, timeout, abort
  "response-too-large", // content-length cap (RESEARCH.md §Timeout/Cap)
  "unsupported-content-type", // not (text|application)/(xhtml+)?html
  "extraction-unsupported", // ING-06 — isProbablyReaderable=false → "couldn't read"
  "extraction-too-low-confidence", // ING-06 — extraction ran but below threshold
  "round-trip-anchor-failed", // SC#1 — TextQuoteSelector resolution returned ambiguous|orphan
  "already-in-library", // D7-07 — save-once-read-forever dedupe-refuse
  "server-error", // catch-all for unexpected exceptions (5xx)
]);
export type IngestionFailureReason = z.infer<typeof IngestionFailureReasonEnum>;

/** IngestionResponse — discriminated envelope. Success carries the validated
 * `CanonicalArticle` plus the two-state `confidence` derived signal (confident |
 * low). Failure carries the cataloged reason. `extractionConfidence: "unsupported"`
 * never reaches this envelope — it is refused upstream as
 * `extraction-unsupported`. The article is RE-VALIDATED through ArticleSchema
 * here (Zod-at-boundary — defense-in-depth; the server also runs parse() but
 * the network is a trust boundary per STATE-04). */
export const IngestionResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    article: ArticleSchema,
    confidence: z.object({
      state: z.enum(["confident", "low"]),
    }),
  }),
  z.object({
    ok: z.literal(false),
    reason: IngestionFailureReasonEnum,
  }),
]);
export type IngestionResponse = z.infer<typeof IngestionResponseSchema>;
