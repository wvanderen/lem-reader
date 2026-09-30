// server/ingest.ts
// Plan 07-05 — the pipeline orchestrator + inline round-trip anchor probe
// (SC#1, reshaped by ADR-0003 into a detector, not a gate). Composes the
// /server primitives (safeFetch + extractAndNormalize + markdownToBlocks +
// pdfToBlocks + epubToBooks + slugifyUrl + deriveConfidence) into the locked
// staged pipeline, validates the result through ArticleSchema.parse
// (Zod-at-boundary), and probes the 5-offset TextQuoteSelector round-trip
// (Pitfall 2 — the integration truth): "orphan" refuses (a normalization-bug
// canary), "ambiguous" admits the article flagged (annotationsDegraded).
//
// The orchestrator owns four contracts:
//   1. Pipeline ordering (must_haves locked sequence):
//        safeFetch → extractAndNormalize → slugifyUrl(finalUrl) →
//        ArticleSchema.parse → probeRoundTripAnchor → deriveConfidence
//   2. Immutability (D7-07): id = slugifyUrl(finalUrl after redirects) →
//        re-ingest produces the same id → dedupe-refuse in 07-06.
//   3. Honesty (ING-06 + ADR-0003): two-state confidence → low enters the
//      library flagged / confident normal; readable text is never refused —
//      only zero-block extractions and unsafe/unreachable endpoints refuse.
//   4. Plain-text admission (260821-ov7): a tag-less {html} paste is valid
//      strict CommonMark — Stage 0.5 reroutes it onto the markdown intake
//      before Stage-1 dispatch (one place; every client fixed).
//
// Pitfall 2 honored (no fork): probeRoundTripAnchor imports normalizeText +
// graphemeClusters + deriveQuoteSelector + resolveQuoteSelector from
// src/content/normalizeText.ts EXACTLY — the same shipped selectors the
// annotation machinery (Phase 5) uses. Forking here would silently orphan
// every anchor on every ingested article.
//
// Threat register (07-05-PLAN.md `<threat_model>`, ADR-0003 amendments):
//   - T-7-21 (Tampering, normalization drift) → probeRoundTripAnchor reports
//     any sample that doesn't resolve to confident; orphan refuses entry,
//     ambiguous admits flagged (annotationsDegraded).
//   - T-7-22 (Info Disclosure, nothing-to-show enters library) → the
//     zero-block guard returns { ok: false, reason: "extraction-unsupported" }.
//   - T-7-23 (Repudiation, generic Error escapes) → catch wraps every throw
//     to a typed IngestionResponse.
//   - T-7-24 (Tampering, id drift across re-extraction) → id = slugifyUrl(finalUrl).
import { createHash } from "node:crypto";
import { safeFetch, safeFeedFetch, type FetchedContent } from "./safeFetch";
import { parseFeedXml } from "./parseFeed";
import { normalizeFeedUrl } from "../src/discover/feedUrl";
import { extractAndNormalize, type ExtractAndNormalizeResult } from "./htmlToBlocks";
import { markdownToBlocks, stripMarkdownExtension } from "./markdownToBlocks";
import { pdfToBlocks } from "./pdfToBlocks";
import { epubToBooks } from "./epubToBooks";
import { transcriptToBlocks } from "./transcriptToBlocks";
import { pastedTranscriptToBlocks } from "./transcriptTextToBlocks";
import { fetchYouTubeTranscript } from "./youtubeTranscript";
import { extractYouTubeVideoId, type TranscriptRefusalReason } from "../src/ingestion/youtube";
import { deriveConfidence, type ConfidenceResult } from "./confidence";
import { slugifyUrl } from "./slugify";
import { runAssetStage } from "./assetStage";
import type { ImageAsset } from "./fetchImageAsset";
import { IngestionError } from "./errors";
import { EPUB_MAX_BYTES, PDF_MAX_BYTES } from "./limits";
import {
  ArticleSchema,
  BookSchema,
  type ArticleSource,
  type Block,
  type Book,
  type CanonicalArticle,
  type TranscriptMeta,
} from "../src/content/schema";
import {
  normalizeText,
  graphemeClusters,
  deriveQuoteSelector,
  resolveQuoteSelector,
} from "../src/content/normalizeText";
import type {
  IngestionFailureReason,
  IngestionRequest,
  IngestionResponse,
  FeedPreview,
} from "../src/ingestion/types";
import { FeedPreviewSchema } from "../src/ingestion/types";
import { normalizeForTitleMatch } from "./titleMatch";

/**
 * probeRoundTripAnchor — the SC#1 anchor probe (ADR-0003: a detector, not a
 * gate). Samples 5 grapheme offsets (0, 25%, 50%, 75%, near-end) on the
 * article's normalized text, derives a TextQuoteSelector at each, and resolves
 * it via the SHIPPED resolveQuoteSelector (Pitfall 2 — no fork). Runs AFTER
 * ArticleSchema.parse so the probe receives a validated article.
 *
 * Outcomes:
 *   - "pass"      every sample resolved confidently.
 *   - "ambiguous" some sample's quote text occurs more than once (e.g. a
 *                 repeated epigraph or opening) — the TEXT is fully readable;
 *                 the article is admitted with annotationsDegraded so the
 *                 reader sees "Highlights may be unreliable on this article."
 *   - "orphan"    a selector derived from the article itself resolved to
 *                 nothing — a derive/resolve asymmetry bug, not a content
 *                 property. Still refused (round-trip-anchor-failed) as a bug
 *                 canary; this should never fire for real input.
 */
export type AnchorProbeResult = "pass" | "ambiguous" | "orphan";

export function probeRoundTripAnchor(article: CanonicalArticle): AnchorProbeResult {
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
    // Any non-confident resolution is reported; the CALLER decides policy
    // (ambiguous → admitted flagged, orphan → refused — ADR-0003).
    if (resolved === "ambiguous" || resolved === "orphan") {
      return resolved;
    }
  }
  return "pass";
}

/**
 * unsupportedPartsWarning — the count-first extractionWarnings line for
 * unsupported blocks (ADR-0003), ONE copy source shared verbatim by the EPUB
 * per-chapter stage and the single-article tail (T-20-10 — never silent, and
 * never drifting between the two disclosure surfaces).
 */
function unsupportedPartsWarning(count: number): string[] {
  return count > 0
    ? [
        `${count} part${count === 1 ? "" : "s"} of the original could not be displayed`,
      ]
    : [];
}

/**
 * probeAnchorOrThrow — the Stage-7 probe POLICY (ADR-0003) shared by the EPUB
 * per-chapter stage and the single-article tail: "orphan" throws (the
 * derive/resolve bug canary stays a hard failure); "pass"/"ambiguous" return
 * so the caller can stamp annotationsDegraded on "ambiguous".
 */
function probeAnchorOrThrow(article: CanonicalArticle): "pass" | "ambiguous" {
  const anchorProbe = probeRoundTripAnchor(article);
  if (anchorProbe === "orphan") {
    throw new IngestionError("round-trip-anchor-failed");
  }
  return anchorProbe;
}

/**
 * stampIngestionFlags — the post-probe stamp shared by both tails (mutation
 * safe: the article is local to the request, not yet persisted; Zod parse
 * does not freeze). Narrow guard: ingestionMeta is `.optional()` on the
 * schema but always present at both call sites (each `assembled` supplies it).
 */
function stampIngestionFlags(
  article: CanonicalArticle,
  confidence: ConfidenceResult,
  anchorProbe: "pass" | "ambiguous",
): void {
  if (article.ingestionMeta) {
    article.ingestionMeta.extractionConfidence =
      confidence.state === "confident" ? "high" : "low";
    if (anchorProbe === "ambiguous") {
      article.ingestionMeta.annotationsDegraded = true;
    }
  }
}

// 260821-ov7 — the plain-text paste reroute predicate + Stage 0.5 reroute.
// Prod-confirmed root cause (.planning/todos/pending/2026-08-21-fix-prod-ui-paste-ingest-flow.md):
// the paste textarea receives RENDERED text (a <textarea> holds text, and
// copying an article from a browser page yields rendered text, not HTML
// source), so the html branch's isProbablyReaderable pre-check refused every
// tag-less paste with extraction-unsupported.
//
// An HTML tag opener: a "<" immediately followed by an ASCII letter (opening
// tag), a slash (closing tag), or "!" (comments/DOCTYPE). Any HTML markup
// necessarily contains at least one of these three.
const HTML_TAG_OPENER = /<[A-Za-z!/]/;

/**
 * looksLikePlainText — the 260821-ov7 reroute predicate. True when the
 * TRIMMED content contains no HTML tag opener, i.e. it cannot be HTML
 * markup. The direction is deliberately CONSERVATIVE: when in doubt (e.g.
 * prose MENTIONING a tag, like "you can use <br> in HTML"), the content
 * KEEPS the byte-stable html path — the reroute only admits content that
 * provably carries no markup at all.
 *
 * Security (T-OV7-01): why untrusted text through the markdown intake is
 * safe — the D8-16 boundary in server/markdownToBlocks.ts (§SECURITY
 * BOUNDARY, Pitfall 8-2) already holds for arbitrary untrusted .md uploads:
 * strict CommonMark escapes raw HTML to inert paragraph text by default (the
 * parser's raw-HTML pass-through is never enabled), the Block tree is pure
 * inert JSON, React escapes text children on render, and the repo-wide
 * eslint react/no-danger rule is the belt-and-suspenders structural
 * defense. The predicate itself only reroutes content with NO tag opener,
 * so real HTML never enters the markdown path via this route — and even if
 * it did, D8-16 holds regardless.
 */
export function looksLikePlainText(content: string): boolean {
  return !HTML_TAG_OPENER.test(content.trim());
}

/**
 * shortHash — 12-char SHA-256 prefix for the paste-path id (D7-07: no URL →
 * derive id from a content-prefixed hash so paste articles still get a stable,
 * ArticleSchema.id-regex-conforming slug).
 */
function shortHash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 12);
}

// ── Issue #39 — the YouTube transcript branch ────────────────────────────────

/** TRANSCRIPT_REFUSAL_REASONS — the #35 client's four structured YouTube-state
 * refusals map 1:1 onto cataloged IngestionFailureReason values (each has its
 * calm DOC-06 phrase in src/ingestion/ingestCopy.ts). Refusals are terminal —
 * thrown once through the shared catch envelope, never retried. */
const TRANSCRIPT_REFUSAL_REASONS: Record<TranscriptRefusalReason, IngestionFailureReason> = {
  "no-captions": "youtube-no-captions",
  "unavailable-private": "youtube-unavailable-private",
  "age-gated": "youtube-age-gated",
  "bot-check": "youtube-bot-check",
};

/**
 * baseLanguage — the BCP-47 base language of a caption track's languageCode
 * (decision #26: article.lang carries the base — "pt-BR" → "pt" — so the
 * Intl.Segmenter locale stays the broad one; the FULL code rides
 * ingestionMeta.transcript.captionLanguage). Falls back to the full code when
 * the base subtag is empty; the client schema guarantees min(1) overall.
 */
function baseLanguage(languageCode: string): string {
  return languageCode.split("-")[0] || languageCode;
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
 * stripEpubExtension — pure string-only helper that strips a trailing `.epub`
 * extension (case-insensitive). The second arm of the book title chain
 * (Phase 12 Plan 12-04): OPF dc:title is spec-REQUIRED and the adapter
 * already falls back to "Untitled book" (never an empty string), so this arm
 * is reached only when a caller wants the filename channel to override the
 * tolerant fallback — the chain is deliberately short (mirrors
 * stripPdfExtension's shape; orchestrator-owned per the 11-PATTERNS L129
 * precedent).
 *
 * Examples (mirrored in the unit suite):
 *   stripEpubExtension("my-book.epub")   === "my-book"
 *   stripEpubExtension("MY-BOOK.EPUB")   === "MY-BOOK"
 *   stripEpubExtension("no-extension")   === "no-extension"
 */
export function stripEpubExtension(filename: string): string {
  return filename.replace(/\.epub$/i, "");
}

/**
 * toIsoDatetimeOrNull — normalize a raw OPF dc:date string for
 * Provenance.publishedAt. Provenance.publishedAt is `.datetime()`-refined
 * (Zod-at-boundary), while BookSchema.publishedDate intentionally keeps the
 * RAW publisher string (formats vary). A bare "2026-01-01" would fail the
 * article parse, so the chapter provenance carries the date ONLY when
 * Date can parse it, normalized to a full ISO datetime (midnight UTC for
 * date-only values); an unparseable string (or absence) yields undefined —
 * tolerant, never a refusal (Rule 1: the literal pass-through would fail
 * the plan's own pinned happy path on every dated fixture).
 */
function toIsoDatetimeOrNull(raw: string | undefined): string | undefined {
  if (raw === undefined || raw.length === 0) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
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

// ── Phase 12 (Plan 12-04): the EPUB book flow ────────────────────────────────

/**
 * ingestEpubBook — the fifth Stage-1 branch's dedicated flow. The EPUB path
 * diverges after Stage 1: a book is MANY articles, so the shared single-
 * article tail (title chain → assemble → parse → gate → confidence → stamp)
 * cannot host it. Instead this flow runs the UNCHANGED stages 2+ PER CHAPTER
 * (ArticleSchema.parse → probeRoundTripAnchor → deriveConfidence → stamp —
 * SC#4 per chapter, the same imported gate, no fork) and returns the book
 * ok-variant envelope.
 *
 * Honesty algebra (D12-11):
 *   - the adapter's own skippedCount (admission-level skips) seeds the count;
 *   - a chapter failing ANY per-chapter stage (parse, the round-trip anchor
 *     gate, confidence) increments the count and is OMITTED — never a
 *     whole-book failure (each chapter is wrapped in its own try/catch);
 *   - only ZERO admitted chapters refuses, with `epub-empty`.
 *
 * Identity (content-hash determinism — the dedupe-refuse foundation):
 *   bookBase = `epub-<shortHash(base64 channel)>` (the D11 pdf-<hash>
 *   precedent, D12 edition); admitted chapter i (position within the
 *   ADMITTED list — Pitfall 10: skipped chapters never renumber) gets
 *   `${bookBase}-c<NN>` zero-padded.
 *
 * Threat register (12-04-PLAN.md `<threat_model>`):
 *   - T-12-09 (DoS, oversized upload): the decoded re-check below is the
 *     third enforcement layer (client picker + middleware preceded it).
 *   - T-12-13 (Tampering, book envelope forgery): BookSchema.parse before
 *     the record crosses the response boundary.
 *   - T-12-14 (DoS, per-chapter work amplification): the adapter's timeout
 *     race + chapter cap already bound the draft list; the skip accounting
 *     bounds wasted stage work here.
 *   - T-12-07 (DRM posture): refusal reasons pass through the shared catch
 *     envelope verbatim — no orchestrator DRM-specific code.
 */
async function ingestEpubBook(input: {
  epub: string;
  filename?: string;
}): Promise<IngestionResponse> {
  const { epub: b64, filename } = input;

  // Stage 1, layer 3 — decoded re-check (base64 hides size from the
  // transport layers' view of decoded bytes; this is the authoritative
  // check before any parsing work begins — the pdf branch's exact pattern).
  const bytes = Buffer.from(b64, "base64");
  if (bytes.byteLength > EPUB_MAX_BYTES) {
    throw new IngestionError("epub-too-large");
  }

  // Stage 1 — the adapter owns its timeout race (withEpubTimeout) and has
  // already run the D12-10 admission + D12-09 TOC-merge; both hashes were
  // computed in-adapter so this orchestrator never re-reads bytes.
  const { bookMeta, chapters, skippedCount: adapterSkipped, originalFileHash } =
    await epubToBooks(new Uint8Array(bytes));

  const bookBase = `epub-${shortHash(b64)}`;
  const admitted: CanonicalArticle[] = [];
  const chapterArticleIds: string[] = [];
  // 20-06: the envelope carries ONLY admitted chapters' container-extracted
  // assets, deduped by assetId (identical bytes self-identify — a figure
  // shared by two chapters ships once; the AddDialog attribution walk
  // re-fans rows out per chapter). A chapter that fails a stage below takes
  // its assets with it — no orphan bytes ride the response.
  const admittedAssets: ImageAsset[] = [];
  const seenAssetIds = new Set<string>();
  let skipped = adapterSkipped;

  for (const draft of chapters) {
    // i = position within the ADMITTED list (Pitfall 10) — a chapter that
    // fails a stage below never consumes a number.
    const i = admitted.length;
    const id = `${bookBase}-c${String(i).padStart(2, "0")}`;
    try {
      // D11-09 EPUB analog — bodies start at h2; the provenance header
      // renders the chapter's TOC-derived title.
      const title = draft.title;
      const effectiveBlocks = consumeDuplicatedTitle(draft.blocks, title);
      const originalHtmlHash = `sha256:${draft.sourceHtmlHash}`;
      const retrievedAt = new Date().toISOString();

      // Stage 6a: BUILD the chapter article (the five per-article fields
      // ride the same contract as every other Stage-1 adapter; provenance
      // carries the BOOK's authors/publishedDate and the chapter's own
      // TOC-derived title). extractionWarnings discloses the 20-06
      // per-figure refusals + the ADR-0003 unsupported-part count (count
      // form matching the single-article stage's tone — T-20-10, never
      // silent).
      const unsupportedBlockCount = effectiveBlocks.filter(
        (b) => b.kind === "unsupported",
      ).length;
      const assembled = {
        id,
        revision: 1,
        lang: draft.lang,
        provenance: {
          title,
          author: bookMeta.authors.length > 0 ? bookMeta.authors.join(", ") : undefined,
          publishedAt: toIsoDatetimeOrNull(bookMeta.publishedDate),
          retrievedAt,
          originalHtmlHash,
        },
        blocks: effectiveBlocks,
        footnotes: draft.footnotes,
        ingestionMeta: {
          source: "epub-chapter" as const,
          origin: "upload" as const,
          originalHtmlHash,
          extractionConfidence: "high" as const, // placeholder — stamped post-gate
          extractionWarnings: [
            ...unsupportedPartsWarning(unsupportedBlockCount),
            ...(draft.figureRefusedCount > 0
              ? [
                  `${draft.figureRefusedCount} image${
                    draft.figureRefusedCount === 1 ? "" : "s"
                  } could not be included`,
                ]
              : []),
          ],
          bookId: bookBase,
          chapterIndex: i,
        },
      };

      // Stage 6b: VALIDATE — ArticleSchema.parse (unchanged stage).
      const article: CanonicalArticle = ArticleSchema.parse(assembled);

      // Stage 7: ROUND-TRIP ANCHOR PROBE (SC#4, ADR-0003) — the SAME imported
      // probe + policy per chapter (probeAnchorOrThrow): "orphan" throws into
      // the chapter skip (the bug canary stays a hard failure); "ambiguous"
      // ADMITS the chapter flagged (annotationsDegraded) instead of skipping
      // it — the text is readable, so the reader gets it.
      const anchorProbe = probeAnchorOrThrow(article);

      // ING-06 two-state confidence (ADR-0003 — no "unsupported" state to
      // skip on). The adapter's D12-10 admission already established
      // readerability — the chapter would not exist as a draft otherwise —
      // so isReaderable:true.
      const confidence: ConfidenceResult = deriveConfidence(article, {
        isReaderable: true,
      });

      stampIngestionFlags(article, confidence, anchorProbe);

      chapterArticleIds.push(id);
      admitted.push(article);
      // 20-06: the admitted chapter's container assets join the envelope
      // (deduped — a twin admitted by an earlier chapter ships once).
      for (const asset of draft.assets) {
        if (!seenAssetIds.has(asset.assetId)) {
          seenAssetIds.add(asset.assetId);
          admittedAssets.push(asset);
        }
      }
    } catch {
      // A chapter failing parse / the anchor gate / any stage is SKIPPED
      // and disclosed — never a whole-book failure (D12-11).
      skipped += 1;
    }
  }

  // Zero admitted chapters → whole-book refusal.
  if (admitted.length === 0) {
    throw new IngestionError("epub-empty");
  }

  // Book assembly — the thin record (BookSchema, T-12-13: parsed before it
  // crosses the boundary). Title chain: OPF dc:title (spec-REQUIRED; the
  // adapter's tolerant "Untitled book" fallback) → stripEpubExtension(
  // filename) → "Book" (the chain is short by construction).
  const book: Book = BookSchema.parse({
    id: bookBase,
    title: bookMeta.title || (filename !== undefined ? stripEpubExtension(filename) : "") || "Book",
    authors: bookMeta.authors,
    language: bookMeta.language,
    chapterArticleIds,
    ...(bookMeta.publisher !== undefined ? { publisher: bookMeta.publisher } : {}),
    ...(bookMeta.publishedDate !== undefined ? { publishedDate: bookMeta.publishedDate } : {}),
    ...(bookMeta.identifier !== undefined ? { identifier: bookMeta.identifier } : {}),
    skippedChapterCount: skipped,
    source: "epub-upload",
    originalFileHash: `sha256:${originalFileHash}`,
    tags: [], // books start untagged — D12-04 tagging is a reader act
    addedAt: new Date().toISOString(),
  });

  // The book ok-variant envelope (12-03's IngestionClient.ingestEpub
  // consumes exactly this shape). 20-06: assets carries the admitted
  // chapters' container-extracted figures (base64 envelope; the client
  // re-validates + re-hashes before exposure — the same transport chain as
  // the single-article path).
  return {
    ok: true,
    book,
    articles: admitted,
    skippedCount: book.skippedChapterCount,
    assets: admittedAssets.map(toAssetEnvelope),
  };
}

// ── Phase 20 (Plan 20-02 Task 2) — the inline asset stage wiring ─────────────

/** AssetEnvelope — the wire shape of one accepted image asset on the ingest
 * response (base64-in-JSON, mirroring the pdf/epub upload transport
 * decision). Task 3's AssetEnvelopeSchema in src/ingestion/types.ts is the
 * client-side Zod mirror of this shape; the MAX_ASSET_RESPONSE_BYTES budget
 * is already enforced inside the stage, so the envelope can never exceed the
 * base64 transport ceiling (20-RESEARCH Pitfall 1). */
export interface AssetEnvelope {
  assetId: string;
  contentType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "image/avif";
  byteLength: number;
  dataBase64: string;
}

/** Envelope-encode one accepted asset. Buffer.toString("base64") runs
 * C++-side in Node — no String.fromCharCode call-stack limit (the 11-04
 * lesson that produced the chunked client-side bytesToBase64; the plan
 * explicitly allows Buffer base64 server-side). */
function toAssetEnvelope(asset: ImageAsset): AssetEnvelope {
  return {
    assetId: asset.assetId,
    contentType: asset.contentType,
    byteLength: asset.bytes.byteLength,
    dataBase64: Buffer.from(
      asset.bytes.buffer,
      asset.bytes.byteOffset,
      asset.bytes.byteLength,
    ).toString("base64"),
  };
}

/**
 * ingestFeed — the feed-candidate flow (issue #121; the sixth Stage-1
 * branch's dedicated flow, the ingestEpubBook shape). ONE SSRF-guarded
 * fetch (safeFeedFetch — the third SafeFetchProfile over the ONE pipeline),
 * ONE hardened parse (parseFeedXml — bounded XML/item limits, `feed-unreadable`
 * on anything that is not readable RSS/Atom), then the normalized feed URL
 * (the import merge key — normalizeFeedUrl over the post-redirect finalUrl)
 * and the Zod-at-boundary FeedPreviewSchema.parse self-check (the exporter's
 * ArticleSchema.parse discipline applied to the preview envelope — a parse
 * failure here is a pipeline bug surfaced as the calm server-error catch-all
 * below, never a malformed preview). NO article stages run: a feed candidate
 * is a preview payload, not saved content — the subscription save happens
 * client-side after this response validates.
 */
async function ingestFeed(feedUrl: string): Promise<IngestionResponse> {
  const fetched = await safeFeedFetch(feedUrl);
  // Feed profile invariant: the core returns a string body for "text"
  // (the safeFetch document-profile narrowing discipline).
  const xml = fetched.body as string;
  // The fallback title for an untitled channel: the final URL's hostname
  // (the article title chain's hostname fallback).
  let host = fetched.finalUrl;
  try {
    host = new URL(fetched.finalUrl).hostname;
  } catch {
    // unreachable for an http(s) URL — the fetch validated it; calm guard
  }
  const parsed = parseFeedXml(xml, host);
  const normalizedUrl = normalizeFeedUrl(fetched.finalUrl) ?? fetched.finalUrl;
  const feed: FeedPreview = FeedPreviewSchema.parse({
    url: normalizedUrl,
    title: parsed.title,
    ...(parsed.description !== undefined ? { description: parsed.description } : {}),
    items: parsed.items,
  });
  return { ok: true, feed };
}

/**
 * ingest — the 7-stage stateless pipeline orchestrator (RESEARCH.md §Pattern 1
 * L249-279). Runs safeFetch → extractAndNormalize → slugifyUrl →
 * ArticleSchema.parse → probeRoundTripAnchor → deriveConfidence, and returns
 * a typed IngestionResponse. Every refusal path produces a typed reason
 * (IngestionError is caught and serialized) so the edge function (07-06) can
 * map it to HTTP 400 cleanly.
 *
 * Input is input-source-agnostic (D7-03): exactly one of {url} | {html} |
 * {markdown} | {pdf} | {epub} | {transcript} | {feedUrl}. The url path runs
 * safeFetch (SSRF guard); the
 * html path synthesizes the pipeline input directly with finalUrl=undefined
 * (no fetch, no SSRF surface); the markdown + pdf paths mirror that shape
 * through their sibling adapters (Stage-1 extraction only — stages 2+ are
 * shared). The epub path (Phase 12 Plan 12-04, the fifth Stage-1 branch)
 * diverges after Stage 1: it runs stages 2+ PER CHAPTER inside
 * ingestEpubBook and returns the book ok-variant envelope — the single-
 * article stages below stay byte-stable for the four prior formats.
 *
 * Input validation (exactly one of url/html/markdown/pdf/epub) throws
 * IngestionError — the caller is expected to pass a Zod-validated
 * IngestionRequest, so reaching this throw is a programming error.
 */
export async function ingest(input: IngestionRequest): Promise<IngestionResponse> {
  // Stage 0 — input validation: exactly one of {url} | {html} | {markdown} |
  // {pdf} | {epub} required. (Thrown, not serialized — the caller contract
  // is IngestionRequestSchema-validated; reaching this throw indicates a
  // programming error.) Counts the variants of `input` — the request the
  // caller SENT — BEFORE the Stage 0.5 reroute; the reroute preserves this
  // count by construction ({html:x} → {markdown:x} maps one variant onto
  // another 1:1), so re-deriving the dispatch flags from the rerouted
  // `request` below is equivalent.
  const inputHasUrl = "url" in input && input.url !== undefined;
  const inputHasHtml = "html" in input && input.html !== undefined;
  const inputHasMarkdown = "markdown" in input && input.markdown !== undefined;
  const inputHasPdf = "pdf" in input && input.pdf !== undefined;
  const inputHasEpub = "epub" in input && input.epub !== undefined;
  const inputHasTranscript = "transcript" in input && input.transcript !== undefined;
  const inputHasFeedUrl = "feedUrl" in input && input.feedUrl !== undefined;
  if (
    (inputHasUrl ? 1 : 0) +
      (inputHasHtml ? 1 : 0) +
      (inputHasMarkdown ? 1 : 0) +
      (inputHasPdf ? 1 : 0) +
      (inputHasEpub ? 1 : 0) +
      (inputHasTranscript ? 1 : 0) +
      (inputHasFeedUrl ? 1 : 0) !==
    1
  ) {
    throw new IngestionError("server-error");
  }

  // Stage 0.5 — 260821-ov7 plain-text paste reroute. The paste textarea
  // yields RENDERED text (a <textarea> holds text; copying an article from a
  // browser page copies rendered text, not HTML source), and Readability
  // cannot extract tag-less content — so the html branch's
  // isProbablyReaderable pre-check refused every plain-text paste with
  // extraction-unsupported (prod-confirmed: the pending todo above). Plain
  // text IS valid strict CommonMark, and the markdown branch returns the
  // byte-identical downstream shape ({blocks, footnotes, lang,
  // provenancePartial, isReaderable}), so rewriting {html: tagless} onto
  // {markdown: tagless} here — BEFORE Stage-1 dispatch — fixes every client
  // (dev middleware, Vercel prod api function, future Cloudflare shape all
  // funnel through ingest() per D7-05) in this single orchestrator-owned
  // place. The reroute preserves the exactly-one-of invariant by
  // construction; downstream (ArticleSchema.parse, probeRoundTripAnchor,
  // deriveConfidence, persistence, dedupe) is shared and unchanged. The
  // `"html" in input` narrowing makes input.html type-safe with no cast.
  const request: IngestionRequest =
    "html" in input && looksLikePlainText(input.html)
      ? { markdown: input.html }
      : input;

  // Dispatch flags read the REROUTED request (260821-ov7): a tag-less {html}
  // input has already been rewritten onto {markdown}, so the hasHtml branch
  // below can only fire for TAGGED content.
  const hasUrl = "url" in request && request.url !== undefined;
  // Issue #39 — the URL variant dispatches on YouTube-ness (watch / shorts /
  // youtu.be forms per the #35 extraction): a YouTube URL takes the transcript
  // branch instead of the HTML pipeline (Readability would find no article).
  // The id is extracted ONCE here and consumed by the branch below.
  const youTubeVideoId = hasUrl ? extractYouTubeVideoId(request.url) : null;
  const hasHtml = "html" in request && request.html !== undefined;
  const hasMarkdown = "markdown" in request && request.markdown !== undefined;
  const hasPdf = "pdf" in request && request.pdf !== undefined;
  const hasEpub = "epub" in request && request.epub !== undefined;
  // The youtube-bot-check fallback — the reader pasted the transcript text.
  // The source URL (when the dialog supplies one) is NESTED inside the
  // variant, so it never collides with the top-level {url} dispatch above.
  const hasTranscript = "transcript" in request && request.transcript !== undefined;
  // Issue #121 — the Discover subscription candidate: the sixth Stage-1
  // branch (a URL that never enters the article pipeline — like the YouTube
  // branch, it dispatches on shape, and like the EPUB branch it returns its
  // own ok-variant envelope).
  const hasFeedUrl = "feedUrl" in request && request.feedUrl !== undefined;

  try {
    // Stage 1, sixth branch — FEED (issue #121). Returns the feed ok-variant
    // envelope from its own dedicated flow; its refusals (feed-unreadable +
    // the shared SSRF/size/content-type catalog) throw IngestionError and
    // serialize through the SAME catch envelope below (T-7-23). Placed with
    // the EPUB branch so the four single-article branches and the shared
    // stages 2+ tail stay byte-stable for existing formats.
    if (hasFeedUrl) {
      return await ingestFeed((request as { feedUrl: string }).feedUrl);
    }

    // Stage 1, fifth branch — EPUB (Phase 12 Plan 12-04). Returns the book
    // ok-variant envelope from its own dedicated flow; its refusals
    // (epub-too-large / epub-protected / epub-unreadable / epub-empty)
    // throw IngestionError and serialize through the SAME catch envelope
    // below (T-7-23). Placed first so the four single-article branches and
    // the shared stages 2+ tail stay byte-stable for existing formats.
    if (hasEpub) {
      return await ingestEpubBook(request as { epub: string; filename?: string });
    }

    // Stage 1: SOURCE → EXTRACT → NORMALIZE. Three branches share the same
    // output shape so the downstream stages (ArticleSchema.parse +
    // probeRoundTripAnchor + deriveConfidence) run identically on all paths
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
    // hash id, D8-18 markdown content-hash id, D11 pdf content-hash id, #39
    // youtube videoId-hash id).
    let id: string;
    let source: ArticleSource;
    let origin: "url" | "paste" | "upload";
    let fetchedAt: string | undefined;
    let finalUrl: string | undefined;
    // sourceBytes — the raw bytes the article was derived from; used for the
    // originalHtmlHash traceability field (D8-17 preserves this for markdown).
    let sourceBytes: string;
    // markdownFilenameHint — the optional `filename` from the markdown branch,
    // stashed on the closure so the D8-17 title-fallback chain below can read
    // it without re-extracting from the request. Undefined for url + paste paths.
    let markdownFilenameHint: string | undefined;
    // pdfFilenameHint — the sibling channel for the pdf branch's D11-07
    // filename fallback. Undefined for the other three paths.
    let pdfFilenameHint: string | undefined;
    // transcriptMeta + transcriptWarnings — the #39 youtube branch's block-
    // keyed timing metadata (ingestionMeta.transcript) and its chapter
    // edge-rule disclosures (merged into extractionWarnings). Undefined/[]
    // for every other path.
    let transcriptMeta: TranscriptMeta | undefined;
    let transcriptWarnings: string[] = [];

    if (youTubeVideoId !== null) {
      // ── Issue #39 — the YOUTUBE branch (transcript-as-article) ──────────
      // A YouTube URL never enters the HTML pipeline: the #35 InnerTube
      // client fetches the caption track server-side, transcriptToBlocks
      // normalizes it, and the shared stages 2+ run unchanged below. The
      // FOUR YouTube-state refusals throw IngestionError with their
      // cataloged reasons through the shared catch envelope (terminal — no
      // retry, no cache; the library is the cache per issue #27).
      const videoId = youTubeVideoId;
      finalUrl = `https://www.youtube.com/watch?v=${videoId}`;
      // Issue #59 — the url variant's optional `preferredLanguages` (the
      // reader's ordered browser languages, decision #56) drives the caption
      // track selection (decision #57); absent/empty/garbage → the unchanged
      // rule (the schema's field-level catch guarantees the shape).
      const result = await fetchYouTubeTranscript(
        videoId,
        (request as { preferredLanguages?: string[] }).preferredLanguages,
      );
      if (!result.ok) {
        throw new IngestionError(TRANSCRIPT_REFUSAL_REASONS[result.refusal]);
      }
      const normalized = transcriptToBlocks(result);
      blocks = normalized.blocks;
      footnotes = [];
      lang = baseLanguage(result.languageCode);
      provenancePartial = {
        sourceUrl: finalUrl,
        title: result.title,
        author: result.channel,
      };
      isReaderable = true;
      // D7-07 immutability mirror — id = yt-<shortHash(videoId)>: the
      // videoId IS the stable identity, so the watch / shorts / youtu.be
      // URL forms all dedupe-refuse to the one library article (the
      // pdf-/md- content-hash precedent; the id regex forbids the videoId's
      // uppercase letters and stays locked per D-06).
      id = `yt-${shortHash(videoId)}`;
      source = "youtube";
      origin = "url";
      fetchedAt = new Date().toISOString();
      // Traceability: the parsed InnerTube result is the payload the article
      // was derived from (the #35 client returns parsed shapes, not raw XML).
      sourceBytes = JSON.stringify(result);
      transcriptMeta = {
        videoId: result.videoId,
        durationSeconds: result.durationSeconds,
        captionSource: result.isAutoGenerated ? "asr" : "manual",
        captionLanguage: result.languageCode,
        // The persisted field name is the decision-#26 `segments`; the values
        // are the normalizer's block-keyed anchors.
        segments: normalized.anchors,
      };
      transcriptWarnings = normalized.warnings;
    } else if (hasTranscript) {
      // ── The paste-transcript fallback (the youtube-bot-check companion) ──
      // YouTube refuses server-side transcript fetches from datacenter
      // egress (the bot-check regime), so the reader can paste the
      // transcript text from YouTube's own transcript panel. The server
      // parses the pasted text ONCE here (canonical-model boundary) and
      // rejoins the shared stages 2+ below — the same input-source-
      // agnostic contract as every other format (D7-03).
      const { text, url: pastedSourceUrl, title: transcriptTitle } = (
        request as { transcript: { text: string; url?: string; title: string } }
      ).transcript;
      const videoId = pastedSourceUrl !== undefined ? extractYouTubeVideoId(pastedSourceUrl) : null;
      const parsed = pastedTranscriptToBlocks(text, transcriptTitle);
      blocks = parsed.blocks;
      footnotes = [];
      lang = "und";
      // The reader names the paste at ingest time (the request schema
      // requires a non-blank title) — the pipeline never fabricates a
      // neutral title (no silent "Transcript").
      provenancePartial = { title: transcriptTitle };
      isReaderable = true;
      if (videoId !== null) {
        // A YouTube source URL — the SAME yt-<videoId-hash> identity the
        // fetched path derives (watch / shorts / youtu.be dedupe to one
        // article; a later successful fetch would dedupe-refuse against
        // this paste, which is the correct D7-07 behavior).
        finalUrl = `https://www.youtube.com/watch?v=${videoId}`;
        provenancePartial.sourceUrl = finalUrl;
        id = `yt-${shortHash(videoId)}`;
        source = "youtube";
        origin = "url";
        fetchedAt = new Date().toISOString();
        // Timing metadata ONLY when the paste carried real timestamps (the
        // anchors are block-keyed real clock values); a plain-text paste
        // never fabricates timings — no transcript meta at all.
        if (parsed.durationSeconds !== undefined) {
          transcriptMeta = {
            videoId,
            durationSeconds: parsed.durationSeconds,
            captionSource: "pasted",
            captionLanguage: "und",
            segments: parsed.anchors,
          };
        }
      } else {
        // No (or non-YouTube) URL — a plain pasted transcript article. A
        // provided non-YouTube URL still rides provenance as the source.
        finalUrl = pastedSourceUrl;
        id = `paste-${shortHash(text)}`;
        source = "paste";
        origin = "paste";
      }
      sourceBytes = text;
      transcriptWarnings = parsed.warnings;
    } else if (hasUrl) {
      const fetched: FetchedContent = await safeFetch(request.url as string);
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
      // 260821-ov7: after the Stage 0.5 reroute this branch only receives
      // TAGGED content — a tag-less {html} paste was rewritten onto the
      // markdown branch above.
      const htmlInput = (request as { html: string }).html;
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
      const { pdf: b64, filename } = request as { pdf: string; filename?: string };
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
      // MARKDOWN path — Phase 8 Plan 08-01 (D8-16 + D8-17 + D8-18). Since
      // 260821-ov7 this branch also receives the Stage 0.5 reroute: a
      // tag-less {html} paste (rendered article text), which is valid strict
      // CommonMark and yields the identical md-<content-hash> id (D8-18) the
      // same text uploaded as .md would produce.
      const mdInput = (request as { markdown: string; filename?: string }).markdown;
      const filename = (request as { markdown: string; filename?: string }).filename;
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

    // ADR-0003 (reading-first): the ONLY content-based refusal left on the
    // web path — extraction yielded zero blocks, so there is literally
    // nothing reliable to show. `isProbablyReaderable` is NO LONGER a veto:
    // a page Readability dislikes is still extracted and, when blocks
    // result, admitted flagged (confidence low — "page-not-readerable").
    // (Historical note: the pre-check veto also guarded thin content with no
    // <title> from surfacing as the misleading "server-error"; the zero-block
    // guard keeps that property for the truly empty case.)
    if (blocks.length === 0) {
      return { ok: false, reason: "extraction-unsupported" };
    }

    // Phase 20 (Plan 20-02 Task 2) — the INLINE ASSET STAGE (IMG-01/IMG-02):
    // post-extract, pre-BUILD/parse/stamp, every accepted figure rewrites to
    // a self-contained asset:img-<12hex> ref with provenance + stored dims
    // (D20-04 — a saved article is always complete). Runs on the three
    // network-path sources (url / paste+html-upload / markdown); the PDF
    // path stays text-only (D20-01 — no pdfToBlocks change, nothing new
    // called), the youtube transcript branch is text-only by construction
    // (paragraph/heading blocks only — #39), and the EPUB path diverges in
    // its own flow (20-06 wires the container extraction). Per-figure
    // refusals never block the article
    // (D20-05); refusedCount is disclosed via extractionWarnings below
    // (T-20-10 — never silent).
    //
    // 260908-ef5 — assetRefererOrigin: ONLY the url path has an article URL,
    // and finalUrl there is the post-redirect URL safeFetch already validated
    // hop-by-hop (the 9 measures). Deriving the Referer from new URL(finalUrl)
    // .origin gives hotlink-protected CDNs the browser-equivalent disclosure;
    // the paste/html-upload/markdown/pdf paths have no source URL (markdown
    // intake carries none today), so Referer is omitted and Accept alone is
    // sent. The origin is a request header, never a fetch target — it cannot
    // influence which host the asset stage fetches (D20-12 one pipeline).
    let imageRefusalWarnings: string[] = [];
    let assetEnvelopes: AssetEnvelope[] = [];
    // The pasted-transcript branch is text-only by construction (paragraph
    // blocks only — no figures), so the stage is a guarded no-op there too.
    if (!hasPdf && !hasTranscript && source !== "youtube") {
      const assetRefererOrigin =
        finalUrl !== undefined && /^https?:/i.test(finalUrl)
          ? (() => {
              try {
                return new URL(finalUrl).origin;
              } catch {
                return undefined; // unreachable for an http(s) URL — calm guard
              }
            })()
          : undefined;
      const stage = await runAssetStage(blocks, { refererOrigin: assetRefererOrigin });
      blocks = stage.blocks;
      if (stage.refusedCount > 0) {
        // Count-first disclosure, matching the extractionWarnings tone
        // ("3 unsupported blocks omitted" — schema.ts L260 example).
        const n = stage.refusedCount;
        imageRefusalWarnings = [
          `${n} image${n === 1 ? "" : "s"} could not be included`,
        ];
      }
      assetEnvelopes = stage.assets.map(toAssetEnvelope);
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

    // ADR-0003 — count-first disclosure whenever unsupported blocks are
    // present: the article-level note ("Some content could not be processed.
    // See the original.") appears because parts fell, and the inline
    // <details> disclosures mark WHERE they fell. Never silent.
    const unsupportedBlockCount = effectiveBlocks.filter(
      (b) => b.kind === "unsupported",
    ).length;
    const unsupportedBlockWarnings = unsupportedPartsWarning(unsupportedBlockCount);

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
        extractionConfidence: "high" as const, // placeholder — stamped post-probe
        extractionWarnings: [
          ...unsupportedBlockWarnings,
          ...imageRefusalWarnings,
          ...transcriptWarnings,
        ],
        // Issue #39 — the youtube branch's block-keyed timing metadata.
        // Absent for every other source (Pitfall 9 additive-optional).
        ...(transcriptMeta !== undefined ? { transcript: transcriptMeta } : {}),
      },
    };

    // Stage 6b: VALIDATE — ArticleSchema.parse() (Zod-at-boundary; V5 input
    // validation + Pitfall 5 URL scheme guards fire here).
    const article: CanonicalArticle = ArticleSchema.parse(assembled);

    // Stage 7: ROUND-TRIP ANCHOR PROBE (SC#1, ADR-0003) — a detector, not a
    // gate. MUST run AFTER ArticleSchema.parse so the probe receives a
    // validated article. Shared policy (probeAnchorOrThrow): "orphan" still
    // refuses (a derive/resolve asymmetry bug canary); "ambiguous" means the
    // text is readable but highlight anchoring may be unreliable — admitted
    // flagged (annotationsDegraded).
    const anchorProbe = probeAnchorOrThrow(article);

    // ING-06 two-state confidence (ADR-0003 — no "unsupported" state):
    // confident enters clean; low enters the library flagged for the
    // reader-visible fidelity note. Readable text is never refused here.
    const confidence: ConfidenceResult = deriveConfidence(article, { isReaderable });

    // Issue #39 (decision #26) — an ASR-only transcript NEVER upgrades to
    // trusted: an auto-generated caption track enters the library flagged
    // "low" even when its length/block count would otherwise read confident.
    // Manual tracks keep the unchanged ING-06 formula above. A PASTED
    // transcript (the youtube-bot-check fallback) is likewise NEVER trusted:
    // its wording is the reader's manual copy, unverified against the video
    // — flagged "low" whether or not it carried timings (transcriptMeta).
    if (
      confidence.state === "confident" &&
      (hasTranscript || transcriptMeta?.captionSource === "asr")
    ) {
      confidence.state = "low";
      confidence.reason = hasTranscript ? "pasted-transcript" : "asr-caption-track";
    }

    // Stamp the flags onto the article (the shared stampIngestionFlags —
    // same narrow-guard discipline as the EPUB chapter stage).
    stampIngestionFlags(article, confidence, anchorProbe);

    return {
      ok: true,
      article,
      confidence: {
        state: confidence.state === "confident" ? "confident" : "low",
      },
      assets: assetEnvelopes,
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
