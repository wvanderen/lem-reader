// server/ingest.ts
// Plan 07-05 — the pipeline orchestrator + inline round-trip anchor gate
// (SC#1, the integration truth of Phase 7). Composes the four /server
// primitives (safeFetch + extractAndNormalize + slugifyUrl + deriveConfidence)
// into the locked 7-stage pipeline, validates the result through
// ArticleSchema.parse (Zod-at-boundary), and refuses entry to any article
// whose 5-offset TextQuoteSelector round-trip does not resolve to "confident"
// (Pitfall 2 — the integration truth).
//
// The orchestrator owns three contracts:
//   1. Pipeline ordering (must_haves locked sequence):
//        safeFetch → extractAndNormalize → slugifyUrl(finalUrl) →
//        ArticleSchema.parse → assertRoundTripAnchor → deriveConfidence
//   2. Immutability (D7-07): id = slugifyUrl(finalUrl after redirects) →
//        re-ingest produces the same id → dedupe-refuse in 07-06.
//   3. Honesty (ING-06): three-state confidence → unsupported refused /
//      low enters library flagged / confident normal.
//
// Pitfall 2 honored (no fork): assertRoundTripAnchor imports normalizeText +
// graphemeClusters + deriveQuoteSelector + resolveQuoteSelector from
// src/content/normalizeText.ts EXACTLY — the same shipped selectors the
// annotation machinery (Phase 5) uses. Forking here would silently orphan
// every anchor on every ingested article.
//
// Threat register (07-05-PLAN.md `<threat_model>`):
//   - T-7-21 (Tampering, normalization drift) → assertRoundTripAnchor refuses
//     entry on any sample that doesn't resolve to confident.
//   - T-7-22 (Info Disclosure, unsupported enters library) → deriveConfidence
//     "unsupported" → { ok: false, reason: "extraction-unsupported" }.
//   - T-7-23 (Repudiation, generic Error escapes) → catch wraps every throw
//     to a typed IngestionResponse.
//   - T-7-24 (Tampering, id drift across re-extraction) → id = slugifyUrl(finalUrl).
import { createHash } from "node:crypto";
import { safeFetch, type FetchedContent } from "./safeFetch";
import { extractAndNormalize } from "./htmlToBlocks";
import { deriveConfidence, type ConfidenceResult } from "./confidence";
import { slugifyUrl } from "./slugify";
import { IngestionError } from "./errors";
import { ArticleSchema, type CanonicalArticle } from "../src/content/schema";
import {
  normalizeText,
  graphemeClusters,
  deriveQuoteSelector,
  resolveQuoteSelector,
} from "../src/content/normalizeText";
import type { IngestionRequest, IngestionResponse } from "../src/ingestion/types";

/**
 * assertRoundTripAnchor — the SC#1 integration-truth gate. Samples 5 grapheme
 * offsets (0, 25%, 50%, 75%, near-end) on the article's normalized text,
 * derives a TextQuoteSelector at each, and refuses entry if any sample resolves
 * to "ambiguous" or "orphan" via the SHIPPED resolveQuoteSelector (Pitfall 2 —
 * no fork). Runs AFTER ArticleSchema.parse so the gate receives a validated
 * article; runs BEFORE the article is returned so an unround-trippable article
 * never enters the library.
 *
 * RESEARCH.md §Pattern 4 L326-344 + §Gate 3 L972-973.
 */
export function assertRoundTripAnchor(article: CanonicalArticle): void {
  const total = graphemeClusters(normalizeText(article), article.lang).length;

  // 5 deterministic sample offsets (start, 25%, 50%, 75%, near-end).
  const samples = [
    0,
    Math.floor(total * 0.25),
    Math.floor(total * 0.5),
    Math.floor(total * 0.75),
    Math.max(0, total - 32),
  ];

  for (const start of samples) {
    const end = Math.min(total, start + 20);
    if (end <= start) continue; // skip degenerate ranges (e.g. total < 20)
    const selector = deriveQuoteSelector(article, { start, end });
    const resolved = resolveQuoteSelector(article, selector, { start, end });
    // resolveQuoteSelector returns TextPositionSelector | "ambiguous" | "orphan".
    // The gate considers ANY non-confident resolution a failure (Pitfall 2 —
    // the integration truth: an ingested article must be treatable identically
    // to a fixture for the annotation machinery).
    if (resolved === "ambiguous" || resolved === "orphan") {
      throw new IngestionError("round-trip-anchor-failed");
    }
  }
}

/**
 * shortHash — 12-char SHA-256 prefix for the paste-path id (D7-07: no URL →
 * derive id from a content-prefixed hash so paste articles still get a stable,
 * ArticleSchema.id-regex-conforming slug).
 */
function shortHash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 12);
}

/**
 * safeHostname — extract a hostname for the title fallback. Never throws
 * (defensive — a malformed finalUrl should not crash the pipeline).
 */
function safeHostname(urlStr: string): string {
  try {
    return new URL(urlStr).hostname || "Untitled article";
  } catch {
    return "Untitled article";
  }
}

/**
 * ingest — the 7-stage stateless pipeline orchestrator (RESEARCH.md §Pattern 1
 * L249-279). Runs safeFetch → extractAndNormalize → slugifyUrl →
 * ArticleSchema.parse → assertRoundTripAnchor → deriveConfidence, and returns
 * a typed IngestionResponse. Every refusal path produces a typed reason
 * (IngestionError is caught and serialized) so the edge function (07-06) can
 * map it to HTTP 400 cleanly.
 *
 * Input is input-source-agnostic (D7-03): exactly one of {url} | {html}.
 * The url path runs safeFetch (SSRF guard); the html path synthesizes the
 * pipeline input directly with finalUrl=undefined (no fetch, no SSRF surface).
 *
 * Input validation (exactly one of url/html) throws IngestionError — the
 * caller (07-06 edge function) is expected to pass a Zod-validated
 * IngestionRequest, so reaching this throw is a programming error.
 */
export async function ingest(input: IngestionRequest): Promise<IngestionResponse> {
  // Stage 0 — input validation: exactly one of {url} | {html} required.
  // (Thrown, not serialized — the caller contract is IngestionRequestSchema-
  // validated; reaching this throw indicates a programming error.)
  const hasUrl = "url" in input && input.url !== undefined;
  const hasHtml = "html" in input && input.html !== undefined;
  if (hasUrl === hasHtml) {
    throw new IngestionError("server-error");
  }

  try {
    // Stages 1-2: FETCH (URL path only; paste path uses input.html directly).
    let html: string;
    let finalUrl: string | undefined;
    let origin: "url" | "paste";
    let fetchedAt: string | undefined;

    if (hasUrl) {
      // input is narrowed to { url: string } by IngestionRequestSchema; the
      // runtime guard above ensures we only read the URL branch here.
      const fetched: FetchedContent = await safeFetch(input.url as string);
      html = fetched.html;
      finalUrl = fetched.finalUrl;
      origin = "url";
      fetchedAt = new Date().toISOString();
    } else {
      html = (input as { html: string }).html;
      finalUrl = undefined;
      origin = "paste";
    }

    // Stages 3-5: EXTRACT → SANITIZE → htmlToBlocks (all in /server/htmlToBlocks).
    const { blocks, footnotes, lang, provenancePartial, isReaderable } =
      await extractAndNormalize(html, finalUrl);

    // ING-06 honest refusal (Rule 2 — auto-added critical guard): if even
    // Readability wouldn't attempt the page OR extraction yielded zero blocks,
    // refuse with "extraction-unsupported" BEFORE spending cycles on
    // ArticleSchema.parse. Without this guard, thin content with no <title>
    // would surface as the misleading "server-error" (parse fails on the
    // missing-but-required Provenance.title) instead of the honest
    // "extraction-unsupported".
    if (!isReaderable || blocks.length === 0) {
      return { ok: false, reason: "extraction-unsupported" };
    }

    // Stage 6a: BUILD the article object. id is URL-derived (D7-07
    // immutability); the paste path falls back to a content-prefixed hash so
    // distinct pastes get distinct ids. (Rule 3 auto-fix: the plan's pseudocode
    // `slugifyUrl(finalUrl ?? paste-<hash>)` doesn't account for slugifyUrl
    // requiring a real URL — `new URL("paste-<hash>")` throws. The paste path
    // has no URL to normalize, so it skips slugifyUrl entirely and uses the
    // content-hash slug directly; both forms satisfy ArticleSchema.id's
    // `/^[a-z0-9-]+$/` regex.)
    const id = finalUrl ? slugifyUrl(finalUrl) : `paste-${shortHash(html)}`;
    const originalHtmlHash =
      "sha256:" + createHash("sha256").update(html).digest("hex");
    const retrievedAt = new Date().toISOString();
    // Title fallback: a readerable extraction always has SOMETHING to show;
    // default the title so ArticleSchema.parse doesn't fail when the source
    // HTML lacked <title>/<h1>/<meta property=og:title>. Provenance.sourceUrl
    // prefers the canonical link if the source declared one; else finalUrl.
    const title = provenancePartial.title ?? (finalUrl ? safeHostname(finalUrl) : "Pasted article");

    const assembled = {
      id,
      revision: 1,
      lang,
      provenance: {
        sourceUrl: provenancePartial.sourceUrl ?? finalUrl,
        title,
        author: provenancePartial.author,
        publishedAt: provenancePartial.publishedAt,
        retrievedAt,
        originalHtmlHash,
      },
      blocks,
      footnotes,
      ingestionMeta: {
        source: origin === "url" ? ("url" as const) : ("paste" as const),
        origin,
        sourceUrl: finalUrl,
        originalHtmlHash,
        fetchedAt,
        extractionConfidence: "high" as const, // placeholder — stamped post-gate
        extractionWarnings: [],
      },
    };

    // Stage 6b: VALIDATE — ArticleSchema.parse() (Zod-at-boundary; V5 input
    // validation + Pitfall 5 URL scheme guards fire here).
    const article: CanonicalArticle = ArticleSchema.parse(assembled);

    // Stage 7: ROUND-TRIP ANCHOR GATE (SC#1) — refuse entry on ambiguous/orphan.
    // MUST run AFTER ArticleSchema.parse so the gate receives a validated
    // article; runs BEFORE the article is returned.
    assertRoundTripAnchor(article);

    // ING-06 honest three-state confidence. deriveConfidence returns
    // { state: "confident" | "low" | state: "unsupported" } — the "unsupported"
    // variant is refused here (runs after the gate so an unsupported extraction
    // that DID round-trip is still refused, never silently admitted to the
    // library). The "low" variant still succeeds — enters the library flagged
    // for the reader-visible "may be incomplete" banner (ING-06 three-state).
    const confidence: ConfidenceResult = deriveConfidence(article, { isReaderable });
    if (confidence.state === "unsupported") {
      return { ok: false, reason: "extraction-unsupported" };
    }

    // Stamp the confidence onto the article (mutation is safe — the article
    // is local to this request, not yet persisted; Zod parse does not freeze).
    // The persisted shape (IngestionMetaSchema) carries only "high" | "low";
    // the response envelope carries the reader-facing "confident" | "low" state.
    // The narrow guard satisfies TS: ingestionMeta is `.optional()` on the
    // schema but always present here (we always supply it in `assembled`).
    if (article.ingestionMeta) {
      article.ingestionMeta.extractionConfidence =
        confidence.state === "confident" ? "high" : "low";
    }

    return {
      ok: true,
      article,
      confidence: {
        state: confidence.state === "confident" ? "confident" : "low",
      },
    };
  } catch (e) {
    // T-7-23 (Repudiation): every refusal path produces a typed
    // IngestionResponse. IngestionError carries the typed reason verbatim;
    // any other throw (ZodError, etc.) is wrapped as "server-error" — the
    // reader sees the honest server-error surface; the specifics are logged
    // server-side (07-06 adapter owns logging).
    if (e instanceof IngestionError) {
      return { ok: false, reason: e.reason };
    }
    return { ok: false, reason: "server-error" };
  }
}
