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
import { ArticleSchema, BookSchema, httpUrl } from "../content/schema";

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
  // Phase 11 ING-04 + D11 — PDF upload, base64-in-JSON (keeps middleware body
  // path byte-identical). The server decodes and runs pdfToBlocks; the client
  // encodes with FileReader.readAsArrayBuffer → base64. `filename` mirrors the
  // markdown variant: a title-fallback hint only, never part of the article id.
  z.object({
    pdf: z.string().base64().min(1),
    filename: z.string().optional(),
  }),
  // Phase 12 ING-05 + D12 — EPUB upload, base64-in-JSON (keeps the middleware
  // body path byte-identical, mirroring the pdf variant). The server decodes
  // and runs epubToBooks (lands in 12-02); the client encodes with
  // FileReader.readAsArrayBuffer → base64. `filename` mirrors the
  // markdown/pdf variants: a title-fallback hint only, never part of the
  // book or chapter ids (content-hash ids — the D7-07 discipline).
  z.object({
    epub: z.string().base64().min(1),
    filename: z.string().optional(),
  }),
]);
export type IngestionRequest = z.infer<typeof IngestionRequestSchema>;

/**
 * PDF_MAX_BYTES — the decoded-byte cap for the Phase 11 PDF upload path
 * (ING-04), shared by THREE enforcement points: the client file picker
 * (IngestControl refuses file.size > PDF_MAX_BYTES before reading), the
 * middleware content-length guard (MAX_INGEST_BODY_BYTES derives from it), and
 * the orchestrator re-check after base64 decode (defense-in-depth). Lives HERE
 * (not in /server) because the /src→/server import direction is forbidden —
 * `server/limits.ts` re-exports it so server modules share one constant.
 * ~10MB mirrors the 07-RESEARCH fetch-body philosophy: generous for real
 * long-form documents, tight enough to prevent DoS amplification.
 */
export const PDF_MAX_BYTES = 10 * 1024 * 1024;

/**
 * EPUB_MAX_BYTES — the decoded-byte cap for the Phase 12 EPUB upload path
 * (ING-05), shared by the SAME three enforcement points as PDF_MAX_BYTES:
 * the client file picker (IngestControl refuses file.size > EPUB_MAX_BYTES
 * before reading — the 11-04 earliest-enforcement pattern), the middleware
 * content-length guard (MAX_INGEST_BODY_BYTES derives from
 * max(PDF_MAX_BYTES, EPUB_MAX_BYTES)), and the orchestrator re-check after
 * base64 decode (defense-in-depth — 12-RESEARCH assumption A2 mirrors the
 * 07-RESEARCH fetch-body philosophy: XHTML text is tiny and images are
 * deferred per D12-16, so 10MB is generous while bounding DoS amplification).
 */
export const EPUB_MAX_BYTES = 10 * 1024 * 1024;

/** IngestionFailureReasonEnum — the 20 honest-failure reasons surfaced to the
 * reader. Cataloged at 07-RESEARCH.md §Code Examples Example 1 L793-795 (the 9
 * pipeline reasons) plus `already-in-library` (D7-07 dedupe-refuse) plus
 * `extraction-unsupported` (ING-06 three-state — the "couldn't reliably read
 * this page" refusal). The "server-error" catch-all closes the catalog. The
 * Phase 11 PDF members (Pattern 7 of 11-RESEARCH.md) slot in after
 * `round-trip-anchor-failed`: pdf-unreadable (parser refuses — includes the
 * corrupt-fixture class), pdf-encrypted (password-protected), pdf-scanned (no
 * text layer — zero extractable items), pdf-multi-column (refuse rather than
 * silently reorder reading order), pdf-too-large (over PDF_MAX_BYTES decoded /
 * PDF_MAX_PAGES). The Phase 12 EPUB members slot in after `pdf-too-large`:
 * epub-protected (DRM — ADEPT/LCP/FairPlay/unknown-vendor detection-only
 * refusal, never decrypt), epub-unreadable (corrupt/unparseable
 * container/OPF/zip, Zip Slip, entity/proto hostility), epub-empty (zero
 * chapters admit — whole-document refusal per D12-11), epub-too-large (over
 * EPUB_MAX_BYTES / EPUB_MAX_CHAPTERS). `already-in-library` and
 * `server-error` stay LAST. The client maps each to a calm DOC-06 phrase in
 * the `.status` live region (D7-04). */
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
  "pdf-unreadable", // Phase 11 — parser refusal (corrupt/malformed bytes)
  "pdf-encrypted", // Phase 11 — password-protected document
  "pdf-scanned", // Phase 11 — no text layer (zero extractable text items)
  "pdf-multi-column", // Phase 11 — refuse multi-column rather than reorder
  "pdf-too-large", // Phase 11 — decoded size/pages over cap
  "epub-protected", // Phase 12 — DRM (ADEPT/LCP/FairPlay/unknown) — detection-only refusal
  "epub-unreadable", // Phase 12 — corrupt/unparseable container/OPF/zip, Zip Slip, entity/proto hostility
  "epub-empty", // Phase 12 — zero chapters admit — whole-document refusal (D12-11)
  "epub-too-large", // Phase 12 — decoded size/chapters over cap (EPUB_MAX_BYTES / EPUB_MAX_CHAPTERS)
  "already-in-library", // D7-07 — save-once-read-forever dedupe-refuse
  "server-error", // catch-all for unexpected exceptions (5xx)
]);
export type IngestionFailureReason = z.infer<typeof IngestionFailureReasonEnum>;

/** IngestionResponse — discriminated envelope. Single-article success carries
 * the validated `CanonicalArticle` plus the two-state `confidence` derived
 * signal (confident | low); book success (Phase 12) carries the validated
 * `Book` plus its chapter articles (min 1) and the D12-11 skip disclosure
 * count. Failure carries the cataloged reason. `extractionConfidence:
 * "unsupported"` never reaches this envelope — it is refused upstream as
 * `extraction-unsupported`. The article(s) are RE-VALIDATED through
 * ArticleSchema here (Zod-at-boundary — defense-in-depth; the server also
 * runs parse() but the network is a trust boundary per STATE-04). */
export const IngestionResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    article: ArticleSchema,
    confidence: z.object({
      state: z.enum(["confident", "low"]),
    }),
  }),
  // Phase 12 ING-05 — the multi-article book ok-variant. Planner resolution
  // of 12-RESEARCH Pitfall 3: NO top-level confidence field — each article
  // carries its own ingestionMeta.extractionConfidence (the byte-stable
  // per-article contract; a duplicated envelope signal would fork the truth).
  // articles min(1): an admitted book always has at least one chapter —
  // epub-empty refuses upstream when zero chapters admit (D12-11). The
  // existing single-article ok-variant above stays byte-stable for
  // url/paste/markdown/pdf.
  z.object({
    ok: z.literal(true),
    book: BookSchema,
    articles: z.array(ArticleSchema).min(1),
    skippedCount: z.number().int().min(0),
  }),
  z.object({
    ok: z.literal(false),
    reason: IngestionFailureReasonEnum,
  }),
]);
export type IngestionResponse = z.infer<typeof IngestionResponseSchema>;
