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
import type { Book } from "../content/schema";
import { IngestionResponseSchema } from "./types";
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
 * ingestMarkdown — POST {markdown, filename?} to /api/ingest and re-validate
 * the response. The Phase 8 markdown upload path (D8-16 + D8-17). The
 * optional `filename` is forwarded to the server ONLY so the D8-17 title
 * fallback chain can use it when front-matter is absent; the filename does
 * NOT affect the article id (D8-18 — id is content-hash). Plan 04 passes
 * `file.name` from the file picker through this signature.
 */
export async function ingestMarkdown(
  markdown: string,
  filename?: string,
): Promise<IngestionSuccess> {
  return ingest({ markdown, filename });
}

/**
 * ingestPdf — POST {pdf, filename?} to /api/ingest and re-validate the
 * response. The Phase 11 PDF upload path (ING-04 + D11): the browser
 * base64-encodes the picked file's bytes (IngestControl's chunked
 * bytesToBase64 helper — multi-MB files must not hit the
 * String.fromCharCode call-stack limit) and posts base64-in-JSON so the
 * middleware body path stays byte-identical (locked decision). The optional
 * `filename` mirrors the markdown variant: a title-fallback hint only
 * (D11-07), NEVER part of the article id — the id is pdf-<content-hash>
 * (D11 id invariant), so identical bytes dedupe-refuse (D7-07).
 *
 * Everything below the ingest() call site (JSON parse, typed refusal throw,
 * res.ok guard, ArticleSchema.parse re-validation) is the shared pipeline —
 * this wrapper does NOT fork it.
 */
export async function ingestPdf(
  pdfBase64: string,
  filename?: string,
): Promise<IngestionSuccess> {
  return ingest({ pdf: pdfBase64, filename });
}

/**
 * EpubIngestionSuccess — the book-shaped success returned by ingestEpub
 * (Phase 12 ING-05). `book` is BookSchema-validated (through the envelope
 * parse below); `articles` are the admitted chapter articles (min 1 — the
 * envelope refuses zero-chapter books as epub-empty server-side, D12-11);
 * `skippedCount` is the D12-11 skip-disclosure count surfaced additively
 * by the success copy.
 */
export interface EpubIngestionSuccess {
  book: Book;
  articles: CanonicalArticle[];
  skippedCount: number;
}

/**
 * ingestEpub — POST {epub, filename?} to /api/ingest?format=epub and
 * re-validate the book envelope (Phase 12 ING-05). The base64 encoding
 * mirrors ingestPdf (IngestControl's chunked bytesToBase64); `filename`
 * is a title-fallback hint ONLY — the book + chapter ids are content-hash
 * (D7-07 discipline), so identical bytes dedupe-refuse at the book level.
 *
 * The `?format=epub` query param is a COPY-ONLY hint for the middleware's
 * pre-read 413 reason selection (12-RESEARCH Pitfall 2 resolution —
 * enforcement stays content-length-based and body-agnostic; the
 * authoritative reason comes from the post-read parsed shape on the
 * server). It does NOT fork the endpoint.
 *
 * T-12-10 (STATE-04 defense-in-depth, two layers):
 *   1. the response is parsed through the widened IngestionResponseSchema
 *      (validates the Book ok-variant — or the refusal — against the
 *      committed contract);
 *   2. EVERY article in the book variant is re-validated through
 *      ArticleSchema.parse in an explicit loop — the network is a trust
 *      boundary, and the per-article contract is the load-bearing one.
 *
 * Refusals throw `IngestionError` with the typed `.reason`; a malformed
 * envelope throws ZodError (the caller's catch-all surfaces the calm
 * server-error copy).
 */
export async function ingestEpub(
  epubBase64: string,
  filename?: string,
): Promise<EpubIngestionSuccess> {
  const res = await fetch("/api/ingest?format=epub", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ epub: epubBase64, filename }),
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

  // T-12-10 layer 1: the envelope parse. Unlike the single-article
  // pipeline (which narrows by key), the book call parses the FULL widened
  // schema so the Book ok-variant itself is validated at the boundary.
  const parsed = IngestionResponseSchema.parse(json);

  // Typed refusal: ok:false carries the cataloged reason.
  if (!parsed.ok) {
    throw new IngestionError(parsed.reason);
  }

  // HTTP non-2xx with an ok:true body is a contract violation — refuse
  // rather than trust a partial payload.
  if (!res.ok) {
    throw new IngestionError("server-error");
  }

  // A single-article envelope on an epub call is a contract violation for
  // THIS call (the 12-01 narrowing rule, mirrored from ingest()).
  if (!("book" in parsed)) {
    throw new IngestionError("server-error");
  }

  // T-12-10 layer 2: re-validate EVERY article through ArticleSchema.parse
  // in an explicit loop. ZodError propagates; the caller's catch-all
  // surfaces "Something went wrong. Try again."
  const articles: CanonicalArticle[] = [];
  for (const article of parsed.articles) {
    articles.push(ArticleSchema.parse(article));
  }

  return { book: parsed.book, articles, skippedCount: parsed.skippedCount };
}

/**
 * Private ingest — the shared POST + parse + throw pipeline. ingestUrl,
 * ingestHtml, ingestMarkdown, and ingestPdf all delegate here. The body is
 * always exactly one of {url} | {html} | {markdown, filename?} |
 * {pdf, filename?} (IngestionRequestSchema on the server enforces this, but
 * the client constructs the body so the contract is by construction).
 *
 * STATE-04 defense-in-depth: the network response is RE-VALIDATED through
 * `ArticleSchema.parse`. A server that returns a malformed article (whether
 * by bug or by tampering) is refused on the client read path. This is the
 * second Zod parse — the server already parsed at ingest time (07-05).
 */
async function ingest(
  body:
    | { url: string }
    | { html: string }
    | { markdown: string; filename?: string }
    | { pdf: string; filename?: string },
): Promise<IngestionSuccess> {
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

  // Phase 12 (Plan 12-01 Task 2): the envelope widened with a second
  // {ok:true, book, articles, skippedCount} variant (ING-05). The
  // single-article wrappers only accept the article variant — a book
  // envelope arriving here is a contract violation for THIS call, refused
  // as the catch-all server-error (the ingestEpub wrapper with its
  // book-shaped return lands in 12-04).
  if (!("article" in json)) {
    throw new IngestionError("server-error");
  }

  // STATE-04 re-validation. ArticleSchema.parse throws ZodError on a
  // malformed article; the caller's catch-all surfaces "Something went
  // wrong. Try again." (server-error copy). This is the load-bearing
  // defense against a tampered or buggy server response.
  const article = ArticleSchema.parse(json.article);

  return { article, confidence: json.confidence };
}
