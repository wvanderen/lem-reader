// server/ingest.ts
// Plan 07-05 — the pipeline orchestrator + inline round-trip anchor gate
// (SC#1, the integration truth of Phase 7). Composes the /server primitives
// (safeFetch + extractAndNormalize + markdownToBlocks + pdfToBlocks +
// slugifyUrl + deriveConfidence) into the locked staged pipeline, validates
// the result through ArticleSchema.parse (Zod-at-boundary), and refuses
// entry to any article whose 5-offset TextQuoteSelector round-trip does not
// resolve to "confident" (Pitfall 2 — the integration truth).
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
import { extractAndNormalize, type ExtractAndNormalizeResult } from "./htmlToBlocks";
import { markdownToBlocks, stripMarkdownExtension } from "./markdownToBlocks";
import { pdfToBlocks } from "./pdfToBlocks";
import { deriveConfidence, type ConfidenceResult } from "./confidence";
import { slugifyUrl } from "./slugify";
import { IngestionError } from "./errors";
import { PDF_MAX_BYTES } from "./limits";
import { ArticleSchema, type Block, type CanonicalArticle } from "../src/content/schema";
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
 * stripPdfExtension — pure string-only helper that strips a trailing `.pdf`
 * extension (case-insensitive). Implements the D11-07 filename channel of the
 * PDF title chain (mirrors stripMarkdownExtension's shape; the chain is
 * orchestrator-owned per 11-PATTERNS L129, so the helper lives here). Like
 * its markdown sibling it does NO path-basename logic — the File API returns
 * just the filename.
 *
 * Examples (mirrored in the unit suite):
 *   stripPdfExtension("Report.pdf")        === "Report"
 *   stripPdfExtension("report.PDF")        === "report"
 *   stripPdfExtension("no-extension")      === "no-extension"
 */
export function stripPdfExtension(filename: string): string {
  return filename.replace(/\.pdf$/i, "");
}

/**
 * normalizeForTitleMatch — lowercase + separator-collapse (the D11-09 fuzzy
 * matching basis: case/whitespace-insensitive containment). Hyphens and
 * underscores count as whitespace because the filename channel slugifies
 * spaces ("calm-report.pdf" ↔ page-1 heading "Calm Report") — the canonical
 * filename-fallback doubled-title case only matches when word separators are
 * normalized uniformly on both sides.
 */
function normalizeForTitleMatch(s: string): string {
  return s.toLowerCase().replace(/[-_\s]+/g, " ").trim();
}

/**
 * consumeDuplicatedTitle (D11-09) — if the FIRST block is a heading whose
 * normalized text fuzzy-matches the final title (case/whitespace-insensitive
 * containment, either direction), drop it: the provenance header renders the
 * title and bodies start at h2 (the one-h1-per-page v1.0 discipline — the
 * body never repeats the title). Any other first block, or a non-matching
 * leading heading, is kept unchanged. Pure; returns a new array only when a
 * block is dropped.
 */
export function consumeDuplicatedTitle(blocks: Block[], title: string): Block[] {
  const first = blocks[0];
  if (!first || first.kind !== "heading") return blocks;
  const normBlock = normalizeForTitleMatch(
    first.content.map((run) => run.text).join(""),
  );
  const normTitle = normalizeForTitleMatch(title);
  // An empty normalized heading must not fuzzy-match every title ("" is
  // contained in everything) — require real text on both sides.
  if (normBlock.length === 0 || normTitle.length === 0) return blocks;
  if (normTitle.includes(normBlock) || normBlock.includes(normTitle)) {
    return blocks.slice(1);
  }
  return blocks;
}

/**
 * ingest — the 7-stage stateless pipeline orchestrator (RESEARCH.md §Pattern 1
 * L249-279). Runs safeFetch → extractAndNormalize → slugifyUrl →
 * ArticleSchema.parse → assertRoundTripAnchor → deriveConfidence, and returns
 * a typed IngestionResponse. Every refusal path produces a typed reason
 * (IngestionError is caught and serialized) so the edge function (07-06) can
 * map it to HTTP 400 cleanly.
 *
 * Input is input-source-agnostic (D7-03): exactly one of {url} | {html} |
 * {markdown} | {pdf}. The url path runs safeFetch (SSRF guard); the html path
 * synthesizes the pipeline input directly with finalUrl=undefined (no fetch,
 * no SSRF surface); the markdown + pdf paths mirror that shape through their
 * sibling adapters (Stage-1 extraction only — stages 2+ are shared).
 *
 * Input validation (exactly one of url/html/markdown/pdf) throws
 * IngestionError — the caller is expected to pass a Zod-validated
 * IngestionRequest, so reaching this throw is a programming error.
 */
export async function ingest(input: IngestionRequest): Promise<IngestionResponse> {
  // Stage 0 — input validation: exactly one of {url} | {html} | {markdown} |
  // {pdf} required. (Thrown, not serialized — the caller contract is
  // IngestionRequestSchema-validated; reaching this throw indicates a
  // programming error.)
  const hasUrl = "url" in input && input.url !== undefined;
  const hasHtml = "html" in input && input.html !== undefined;
  const hasMarkdown = "markdown" in input && input.markdown !== undefined;
  const hasPdf = "pdf" in input && input.pdf !== undefined;
  if (
    (hasUrl ? 1 : 0) + (hasHtml ? 1 : 0) + (hasMarkdown ? 1 : 0) + (hasPdf ? 1 : 0) !== 1
  ) {
    throw new IngestionError("server-error");
  }

  try {
    // Stage 1: SOURCE → EXTRACT → NORMALIZE. Three branches share the same
    // output shape so the downstream stages (ArticleSchema.parse +
    // assertRoundTripAnchor + deriveConfidence) run identically on all paths
    // — the load-bearing invariant (D7-03 input-source-agnostic pipeline).
    // `MarkdownToBlocksResult` is byte-identical to `ExtractAndNormalizeResult`
    // (both ship `{ blocks, footnotes, lang, provenancePartial, isReaderable }`),
    // so a single union type covers all three branches.
    let blocks: ExtractAndNormalizeResult["blocks"];
    let footnotes: ExtractAndNormalizeResult["footnotes"];
    let lang: ExtractAndNormalizeResult["lang"];
    let provenancePartial: ExtractAndNormalizeResult["provenancePartial"];
    let isReaderable: ExtractAndNormalizeResult["isReaderable"];

    // id + ingestion metadata vary per source (D7-07 url id, paste content-
    // hash id, D8-18 markdown content-hash id, D11 pdf content-hash id).
    let id: string;
    let source: "url" | "paste" | "markdown" | "html-upload" | "pdf";
    let origin: "url" | "paste" | "upload";
    let fetchedAt: string | undefined;
    let finalUrl: string | undefined;
    // sourceBytes — the raw bytes the article was derived from; used for the
    // originalHtmlHash traceability field (D8-17 preserves this for markdown).
    let sourceBytes: string;
    // markdownFilenameHint — the optional `filename` from the markdown branch,
    // stashed on the closure so the D8-17 title-fallback chain below can read
    // it without re-extracting from `input`. Undefined for url + paste paths.
    let markdownFilenameHint: string | undefined;
    // pdfFilenameHint — the sibling channel for the pdf branch's D11-07
    // filename fallback. Undefined for the other three paths.
    let pdfFilenameHint: string | undefined;

    if (hasUrl) {
      const fetched: FetchedContent = await safeFetch(input.url as string);
      finalUrl = fetched.finalUrl;
      const extracted = await extractAndNormalize(fetched.html, fetched.finalUrl);
      ({
        blocks,
        footnotes,
        lang,
        provenancePartial,
        isReaderable,
      } = extracted);
      // D7-07 immutability — url id derived from finalUrl after redirects.
      id = slugifyUrl(fetched.finalUrl);
      source = "url";
      origin = "url";
      fetchedAt = new Date().toISOString();
      sourceBytes = fetched.html;
    } else if (hasHtml) {
      const htmlInput = (input as { html: string }).html;
      finalUrl = undefined;
      const extracted = await extractAndNormalize(htmlInput, undefined);
      ({
        blocks,
        footnotes,
        lang,
        provenancePartial,
        isReaderable,
      } = extracted);
      // D7-07 paste id = content-hash slug (slugifyUrl requires a real URL;
      // paste has none — see Rule 3 auto-fix note at the old L172-176).
      id = `paste-${shortHash(htmlInput)}`;
      source = "paste";
      origin = "paste";
      fetchedAt = undefined;
      sourceBytes = htmlInput;
    } else if (hasPdf) {
      // PDF path — Phase 11 Plan 11-03 (ING-04 + D11-07 + D11-09 + D8-18
      // mirror). The request carries base64-in-JSON (locked transport
      // decision); the id content-hashes the base64 channel exactly like
      // md-<hash> (D8-18) so identical PDF bytes always dedupe to one id.
      const { pdf: b64, filename } = input as { pdf: string; filename?: string };
      const bytes = Buffer.from(b64, "base64");
      // Decoded re-check — the third enforcement layer (after the client
      // picker cap and the middleware content-length guard). Base64 hides
      // size from the transport layers' view of decoded bytes; this is the
      // authoritative check before any parsing work begins.
      if (bytes.byteLength > PDF_MAX_BYTES) {
        throw new IngestionError("pdf-too-large");
      }
      finalUrl = undefined;
      const extracted = await pdfToBlocks(new Uint8Array(bytes));
      ({
        blocks,
        footnotes,
        lang,
        provenancePartial,
        isReaderable,
      } = extracted);
      // D7-07 immutability mirror — id = pdf-<shortHash(base64 channel)>.
      id = `pdf-${shortHash(b64)}`;
      source = "pdf";
      origin = "upload";
      fetchedAt = undefined;
      sourceBytes = b64;
      // Stash filename on a closure variable the D11-07 title chain reads
      // below (checked Info-title → filename → neutral).
      pdfFilenameHint = filename;
    } else {
      // MARKDOWN path — Phase 8 Plan 08-01 (D8-16 + D8-17 + D8-18).
      const mdInput = (input as { markdown: string; filename?: string }).markdown;
      const filename = (input as { markdown: string; filename?: string }).filename;
      finalUrl = undefined;
      const extracted = await markdownToBlocks(mdInput);
      ({
        blocks,
        footnotes,
        lang,
        provenancePartial,
        isReaderable,
      } = extracted);
      // D8-18: id = "md-<shortHash(canonical content)>" — content-hash, NOT
      // filename. Two uploads of identical .md content produce the same id
      // → dedupe-refuse on re-upload mirrors D7-07. Filename is metadata-only.
      id = `md-${shortHash(mdInput)}`;
      source = "markdown";
      origin = "upload";
      fetchedAt = undefined;
      sourceBytes = mdInput;
      // Stash filename on a closure variable the title-fallback chain reads
      // below (D8-17 — front-matter → filename → neutral).
      markdownFilenameHint = filename;
    }

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

    // Stage 6a: BUILD the article object.
    // - id: per-source (url slug / paste hash / md hash) — set above.
    // - originalHtmlHash: SHA-256 of the source bytes (url HTML / paste HTML /
    //   markdown source). Preserves traceability per D8-17.
    const originalHtmlHash =
      "sha256:" + createHash("sha256").update(sourceBytes).digest("hex");
    const retrievedAt = new Date().toISOString();
    // Title fallback chain (per-source):
    //   url:     provenancePartial.title (from <meta og:title>/<title>/<h1>)
    //            → finalUrl hostname → "Untitled article"
    //   paste:   provenancePartial.title → "Pasted article"
    //   markdown (D8-17): front-matter title → stripMarkdownExtension(filename)
    //            → "Markdown document" (the neutral last-resort fallback)
    //   pdf (D11-07): sane Info-title (the adapter sets provenancePartial.title
    //            ONLY when isSanePdfTitle passed — checked-Info is PRIMARY)
    //            → stripPdfExtension(filename) → "PDF document"
    const title =
      provenancePartial.title ??
      (hasMarkdown
        ? (markdownFilenameHint
            ? stripMarkdownExtension(markdownFilenameHint)
            : "Markdown document")
        : hasPdf
          ? (pdfFilenameHint
              ? stripPdfExtension(pdfFilenameHint)
              : "PDF document")
          : finalUrl
            ? safeHostname(finalUrl)
            : "Pasted article");

    // D11-09 doubled-title consume — pdf path ONLY, after the final title
    // resolves and before assembling the article (the provenance header
    // renders the title; the body never repeats it — the one-h1-per-page
    // v1.0 discipline). The url/paste/markdown chains are untouched.
    const effectiveBlocks = hasPdf ? consumeDuplicatedTitle(blocks, title) : blocks;

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
      blocks: effectiveBlocks,
      footnotes,
      ingestionMeta: {
        source,
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
