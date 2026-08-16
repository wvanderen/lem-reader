// server/pdfToBlocks.ts
// Plan 11-02 Task 1 — the unpdf → 9-kind Block tree adapter. This is the
// fourth intake format of the Phase 7 ingestion pipeline (sibling of
// `server/htmlToBlocks.ts` and `server/markdownToBlocks.ts`). The orchestrator
// (`server/ingest.ts`, wired in 11-03) treats `pdfToBlocks` identically to its
// siblings downstream — it returns the EXACT same `{ blocks, footnotes, lang,
// provenancePartial, isReaderable }` shape, and the same `ArticleSchema.parse`
// + `assertRoundTripAnchor` + `deriveConfidence` stages run on the path.
//
// ──────────────────────────────────────────────────────────────────────────
// SECURITY BOUNDARY (D8-16 precedent — the doc model IS the boundary):
// PDFs carry no HTML, so the DOMPurify path does not apply here (the same
// reasoning that let strict CommonMark escape raw HTML on the markdown path).
// Extracted text becomes plain Block JSON — inert data by the time it reaches
// the renderer. pdfjs does not execute scripts embedded in PDFs (unpdf
// README), and every refusal below is a typed IngestionError, never a crash.
//
// Resource invariants (T-11-01 DoS mitigation — Pattern 2):
//   - ONE getDocumentProxy per call, reused across getMeta +
//     extractTextItems + getOutline, destroyed in `finally`.
//   - `maxImageSize: MAX_IMAGE_PIXELS` (total PIXELS, w×h) caps image-bomb
//     decompression inside pdfjs.
//   - `assertPageCap(pdf.numPages)` runs BEFORE any extract call (Pitfall 9 —
//     extractTextItems processes ALL pages in one call).
//   - The whole extraction races `PDF_EXTRACTION_TIMEOUT_MS`; a timeout
//     rejects with IngestionError("server-error") carrying a descriptive
//     timeout message (the planner fold of the pdf-timeout reason).
//
// Reading-order invariants (Pitfalls 1/2):
//   - PDF user-space y increases UP — lines sort y-DESCENDING.
//   - Content-stream order is NOT reading order — multi-column documents are
//     DETECTED and refused (pdf-multi-column) BEFORE any assembly runs.
//     Nothing is ever silently reordered (D11-01).
//
// ⚠️ Future maintainer: do NOT sort items by content-stream array order and
// call it reading order; do NOT treat `hasEOL` as authoritative paragraph
// structure (hint only — this adapter ignores it entirely); do NOT fork
// `normalizeText` for the joins below (they are adapter-internal assembly,
// exactly like htmlToBlocks' DOM walk — a shared-normalizer change requires a
// DOC-04 bump).
//
// Server-only (Pitfall 8-6 / 12): `unpdf` (and its bundled pdfjs) is a
// server-side dependency and is never imported by `/src/*` modules at runtime.
// Only the `Block` / `InlineRun` types cross from src (erased by tsc), so the
// client bundle does not grow.
import {
  extractTextItems,
  getDocumentProxy,
  getMeta,
  type StructuredTextItem,
} from "unpdf";
import type { Block, InlineRun } from "../src/content/schema";
import { IngestionError } from "./errors";
import {
  MAX_IMAGE_PIXELS,
  PDF_EXTRACTION_TIMEOUT_MS,
  PDF_MAX_PAGES,
} from "./limits";

/** The pdfjs document proxy type without importing pdfjs internals — derived
 * from unpdf's own public surface (the classes are NOT re-exported from the
 * unpdf index; `Awaited<ReturnType<…>>` keeps us on the public API). */
type PDFDocumentProxy = Awaited<ReturnType<typeof getDocumentProxy>>;

/** ProvenancePartial — same shape as `server/markdownToBlocks.ts` L48-53. The
 * orchestrator merges this into a full Provenance + computes the hash of the
 * raw PDF bytes. The adapter is filename-agnostic (D8-17 / D11-07 mirror):
 * `filename` never enters this module; the orchestrator owns the title
 * fallback chain. */
type ProvenancePartial = {
  sourceUrl?: string;
  title?: string;
  author?: string;
  publishedAt?: string;
};

// ── PDF_THRESHOLDS — the D11-02 starting values (the 11-06 calibration face) ─
// Every detection/assembly number lives HERE so the calibration harness
// (11-06) can import the exact values that produced a recorded verdict and
// re-tune them in one place. Values are corpus-calibrated starting points per
// 11-RESEARCH.md Patterns 3/4 + the assumptions log (A2).
export const PDF_THRESHOLDS = {
  // Pattern 3 — band-coverage gutter analysis (multi-column detection)
  /** y-tolerance for binning items into line bands, × modal line height. */
  bandYToleranceRatio: 0.3,
  /** top/bottom text-extent fraction excluded as page furniture (Pitfall 4). */
  marginBandRatio: 0.05,
  /** x-run span above this fraction of the page text extent = spanning
   * element (headers / pull quotes) — never votes, never splits regions. */
  wideBandRatio: 0.55,
  /** x-bin granularity for the coverage vote histogram, × modal fontSize. */
  xBinEm: 0.5,
  /** a bin is gutter when votes < this fraction of narrow x-run count. */
  gutterVoteRatio: 0.2,
  /** minimum gutter width, × modal fontSize (≈ 1 body em). */
  minGutterEm: 1,
  /** a separated region counts as a text column at ≥ this share of the
   * narrow-run (column-candidate) text mass. */
  colTextShare: 0.15,
  /** page-weighted majority: columnar pages > this × text-bearing pages ⇒
   * document refuses pdf-multi-column (D11-03). */
  columnarMajorityRatio: 0.5,
  // Pattern 4 — scanned detection (per-page text floors)
  /** text-bearing needs ≥ this many non-whitespace items. */
  scannedItemFloor: 8,
  /** text-bearing needs ≥ this many non-whitespace chars. */
  scannedCharFloor: 40,
  /** fewer non-whitespace items than this ⇒ near-empty page. */
  nearEmptyItemFloor: 3,
  /** fewer non-whitespace chars than this ⇒ near-empty page. */
  nearEmptyCharFloor: 15,
  /** page-weighted majority: near-empty pages > this × ALL pages ⇒ document
   * refuses pdf-scanned (D11-03). */
  scannedMajorityRatio: 0.5,
} as const;

// ── Small numeric helpers ────────────────────────────────────────────────────
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function nonWsChars(s: string): number {
  return s.replace(/\s+/g, "").length;
}

/** Items with non-whitespace content (pdfjs emits zero-width empty-string
 * items at BT/ET block boundaries — the synthetic fixtures produce one per
 * page; they must never vote, band, or assemble). */
function realItems(items: StructuredTextItem[]): StructuredTextItem[] {
  return items.filter((i) => i.str.trim().length > 0);
}

/** Modal (most frequent) baseline delta between distinct y levels — the
 * page's line height. Falls back to the modal fontSize for single-line pages. */
function modalLineDelta(items: StructuredTextItem[]): number {
  const ys = [...new Set(items.map((i) => round2(i.y)))].sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (let i = 1; i < ys.length; i++) {
    const prev = ys[i - 1];
    const curr = ys[i];
    if (prev === undefined || curr === undefined) continue;
    const delta = round2(prev - curr);
    if (delta <= 0) continue;
    counts.set(delta, (counts.get(delta) ?? 0) + 1);
  }
  let best = 0;
  let bestCount = 0;
  for (const [delta, count] of counts) {
    if (count > bestCount || (count === bestCount && delta > best)) {
      best = delta;
      bestCount = count;
    }
  }
  return best > 0 ? best : modalFontSize(items);
}

/** Modal fontSize; char-weighted when `charWeighted` (the body-size estimate
 * the heading rule compares against — Pattern 5 fallback). */
function modalFontSize(items: StructuredTextItem[], charWeighted = false): number {
  const counts = new Map<number, number>();
  for (const it of items) {
    const weight = charWeighted ? Math.max(1, nonWsChars(it.str)) : 1;
    const key = round2(it.fontSize);
    counts.set(key, (counts.get(key) ?? 0) + weight);
  }
  let best = 0;
  let bestWeight = -1;
  for (const [size, weight] of counts) {
    if (weight > bestWeight) {
      best = size;
      bestWeight = weight;
    }
  }
  return best > 0 ? best : 12;
}

// ── Line banding + x-runs (shared by detection and, in Task 2, assembly) ─────
/** One y-band ≈ one visual row. `y` is the band's topmost baseline; items are
 * kept in content order for downstream x-sorting. */
interface LineBand {
  y: number;
  items: StructuredTextItem[];
}

/** Bin items into y-bands (rows). PDF y increases UP, so a band's reference y
 * is its FIRST (topmost) item after sorting y-descending; an item joins the
 * current band when the drop from the reference stays within `tolerance`
 * (bandYToleranceRatio × modal line height). */
function binIntoBands(items: StructuredTextItem[], tolerance: number): LineBand[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const bands: LineBand[] = [];
  for (const it of sorted) {
    const band = bands[bands.length - 1];
    if (band && band.y - it.y <= tolerance) {
      band.items.push(it);
    } else if (band) {
      bands.push({ y: it.y, items: [it] });
    } else {
      bands.push({ y: it.y, items: [it] });
    }
  }
  return bands;
}

/** One contiguous x-cluster inside a y-band. Two-column rows share baselines,
 * so the COLUMN signal is the intra-band horizontal gap: a run breaks wherever
 * the x-gap exceeds `splitGap` (minGutterEm × modal fontSize). Whole-band
 * spans would merge column pairs into pseudo-headers and never detect shared-
 * baseline gutters — the x-run is the unit that votes in Pattern 3. */
interface XRun {
  minX: number;
  maxX: number;
  items: StructuredTextItem[];
}

function bandRuns(band: LineBand, splitGap: number): XRun[] {
  const sorted = [...band.items].sort((a, b) => a.x - b.x);
  const runs: XRun[] = [];
  for (const it of sorted) {
    const run = runs[runs.length - 1];
    if (!run) {
      runs.push({ minX: it.x, maxX: it.x + it.width, items: [it] });
    } else if (it.x - run.maxX > splitGap) {
      runs.push({ minX: it.x, maxX: it.x + it.width, items: [it] });
    } else {
      run.items.push(it);
      run.maxX = Math.max(run.maxX, it.x + it.width);
    }
  }
  return runs;
}

// ── Per-page columnarity — band-coverage gutters (Pattern 3) ─────────────────
/** Is this text-bearing page columnar? Band coverage with gutter analysis:
 * narrow x-runs vote per covered x-bin; a gutter is a contiguous low-vote
 * x-run at least minGutterEm wide; the page is columnar when the gutters
 * separate ≥ 2 regions each holding ≥ colTextShare of the narrow-run text
 * mass. Spanning runs (> wideBandRatio of the text extent) and margin bands
 * (top/bottom marginBandRatio of the vertical text extent — Pitfall 4 page
 * furniture) never vote. */
function pageIsColumnar(items: StructuredTextItem[]): boolean {
  if (items.length === 0) return false; // zero-item pages are never columnar

  const lineDelta = modalLineDelta(items);
  const fontSize = modalFontSize(items);
  const bands = binIntoBands(items, PDF_THRESHOLDS.bandYToleranceRatio * lineDelta);

  // Page text extent from item bboxes (single pass).
  let extentMinX = Infinity;
  let extentMaxX = -Infinity;
  let textTop = -Infinity;
  let textBottom = Infinity;
  for (const it of items) {
    extentMinX = Math.min(extentMinX, it.x);
    extentMaxX = Math.max(extentMaxX, it.x + it.width);
    textTop = Math.max(textTop, it.y);
    textBottom = Math.min(textBottom, it.y);
  }
  const hExtent = Math.max(1, extentMaxX - extentMinX);
  const vExtent = Math.max(1, textTop - textBottom);
  const marginV = PDF_THRESHOLDS.marginBandRatio * vExtent;

  // Narrow x-runs: drop margin bands (page furniture) and spanning runs.
  const splitGap = PDF_THRESHOLDS.minGutterEm * fontSize;
  const narrow: XRun[] = [];
  for (const band of bands) {
    if (band.y > textTop - marginV || band.y < textBottom + marginV) continue;
    for (const run of bandRuns(band, splitGap)) {
      if (run.maxX - run.minX > PDF_THRESHOLDS.wideBandRatio * hExtent) continue;
      narrow.push(run);
    }
  }
  if (narrow.length === 0) return false; // only spanning rows ⇒ no gutter to find

  // Votes: each narrow run casts one binary vote per covered x-bin.
  const binWidth = Math.max(1, PDF_THRESHOLDS.xBinEm * fontSize);
  const binCount = Math.max(1, Math.ceil(hExtent / binWidth));
  const votes: number[] = new Array<number>(binCount).fill(0);
  for (const run of narrow) {
    const first = Math.max(0, Math.floor((run.minX - extentMinX) / binWidth));
    const last = Math.min(
      binCount - 1,
      Math.max(first, Math.ceil((run.maxX - extentMinX) / binWidth) - 1),
    );
    for (let b = first; b <= last; b++) {
      votes[b] = (votes[b] ?? 0) + 1;
    }
  }

  // Gutters: contiguous runs of low-vote bins, wide enough in ems.
  const gutterThreshold = PDF_THRESHOLDS.gutterVoteRatio * narrow.length;
  const minGutterWidth = PDF_THRESHOLDS.minGutterEm * fontSize;
  const gutterRanges: Array<{ x0: number; x1: number }> = [];
  let runStart: number | null = null;
  for (let b = 0; b <= binCount; b++) {
    const isGutterBin = b < binCount && (votes[b] ?? 0) < gutterThreshold;
    if (isGutterBin && runStart === null) runStart = b;
    if (runStart !== null && (!isGutterBin || b === binCount)) {
      const width = (b - runStart) * binWidth;
      if (width >= minGutterWidth) {
        gutterRanges.push({
          x0: extentMinX + runStart * binWidth,
          x1: extentMinX + b * binWidth,
        });
      }
      runStart = null;
    }
  }
  if (gutterRanges.length === 0) return false;

  // Regions = x-intervals between gutters. Column mass is attributed by
  // x-CENTER over the narrow-run items (column text lives in narrow runs;
  // spanning elements are not column text by construction).
  let totalChars = 0;
  for (const run of narrow) {
    for (const it of run.items) totalChars += nonWsChars(it.str);
  }
  if (totalChars === 0) return false;

  const regions: Array<{ x0: number; x1: number }> = [];
  let cursor = extentMinX;
  for (const g of gutterRanges) {
    if (g.x0 > cursor) regions.push({ x0: cursor, x1: g.x0 });
    cursor = g.x1;
  }
  if (extentMaxX > cursor) regions.push({ x0: cursor, x1: extentMaxX });
  if (regions.length < 2) return false;

  const regionChars: number[] = new Array<number>(regions.length).fill(0);
  for (const run of narrow) {
    for (const it of run.items) {
      const center = it.x + it.width / 2;
      for (let r = 0; r < regions.length; r++) {
        const region = regions[r];
        if (!region) continue;
        if (center >= region.x0 && center < region.x1) {
          regionChars[r] = (regionChars[r] ?? 0) + nonWsChars(it.str);
          break;
        }
      }
    }
  }
  const qualifying = regionChars.filter(
    (chars) => chars >= PDF_THRESHOLDS.colTextShare * totalChars,
  ).length;
  return qualifying >= 2;
}

// ── classifyDocument — page-weighted document verdicts (Pattern 4 + D11-03) ──
/** The document-level detection verdict. `multiColumn` weighs columnar pages
 * against TEXT-BEARING pages (a stray figure page must not refuse a prose
 * document); `scanned` weighs near-empty pages against ALL pages. */
export interface DocumentVerdict {
  totalPages: number;
  textBearingPages: number;
  nearEmptyPages: number;
  columnarPages: number;
  multiColumn: boolean;
  scanned: boolean;
}

/** Classify per-page text-item arrays into page-weighted verdicts. Pure —
 * hand-buildable in tests; `pdfToBlocks` feeds it the real extraction. */
export function classifyDocument(pages: StructuredTextItem[][]): DocumentVerdict {
  let textBearingPages = 0;
  let nearEmptyPages = 0;
  let columnarPages = 0;
  for (const page of pages) {
    const real = realItems(page);
    const chars = real.reduce((n, it) => n + nonWsChars(it.str), 0);
    const isTextBearing =
      real.length >= PDF_THRESHOLDS.scannedItemFloor &&
      chars >= PDF_THRESHOLDS.scannedCharFloor;
    const isNearEmpty =
      real.length < PDF_THRESHOLDS.nearEmptyItemFloor ||
      chars < PDF_THRESHOLDS.nearEmptyCharFloor;
    if (isTextBearing) textBearingPages += 1;
    if (isNearEmpty) nearEmptyPages += 1;
    if (isTextBearing && pageIsColumnar(real)) columnarPages += 1;
  }
  const totalPages = pages.length;
  return {
    totalPages,
    textBearingPages,
    nearEmptyPages,
    columnarPages,
    multiColumn:
      textBearingPages > 0 &&
      columnarPages > PDF_THRESHOLDS.columnarMajorityRatio * textBearingPages,
    scanned:
      totalPages > 0 &&
      nearEmptyPages > PDF_THRESHOLDS.scannedMajorityRatio * totalPages,
  };
}

// ── Error mapping + page cap (Pattern 7 / Pitfalls 6 + 9) ────────────────────
/** Map a pdfjs failure to a typed refusal by error NAME — the stable pattern:
 * the PasswordException / InvalidPDFException classes exist in unpdf's
// bundled types but are NOT re-exported from the index, so name-string
 * matching is the contract (verified against unpdf 1.8.1; A6). Returns null
 * for unknown errors — the caller rethrows and the orchestrator's catch maps
 * non-IngestionError throws to `server-error`. */
export function mapPdfjsError(err: unknown): IngestionError | null {
  if (typeof err === "object" && err !== null) {
    const name = (err as { name?: unknown }).name;
    if (name === "PasswordException") {
      // Never decrypt (T-11-06) — refuse with the typed reason.
      return new IngestionError(
        "pdf-encrypted",
        "This PDF is password-protected, so its text cannot be read.",
      );
    }
    if (name === "InvalidPDFException") {
      return new IngestionError(
        "pdf-unreadable",
        "This PDF could not be opened — it may be corrupt or not a PDF.",
      );
    }
  }
  return null;
}

/** Refuse documents over the page cap BEFORE any extract call (Pitfall 9 —
 * `extractTextItems` processes ALL pages in one call; the cap must bound that
 * work). Exported so the orchestrator can pre-check the same invariant. */
export function assertPageCap(numPages: number): void {
  if (numPages > PDF_MAX_PAGES) {
    throw new IngestionError(
      "pdf-too-large",
      `This PDF has ${numPages} pages; the limit is ${PDF_MAX_PAGES}.`,
    );
  }
}

// ── withPdfDocument — one proxy, caps first, race the timeout (Pattern 2) ────
/** Run `op` against ONE document proxy: `maxImageSize` caps image-bomb
 * decompression inside pdfjs, the page cap bounds extraction work, the whole
 * operation races the extraction timeout, and the proxy is ALWAYS destroyed
 * (`loadingTask.destroy()` — the caller owns the lifecycle; unpdf's own
 * `withDocument` helper is not used because it destroys ITS proxies only). */
export async function withPdfDocument<T>(
  bytes: Uint8Array,
  op: (pdf: PDFDocumentProxy) => Promise<T>,
): Promise<T> {
  let pdf: PDFDocumentProxy;
  try {
    pdf = await getDocumentProxy(bytes, { maxImageSize: MAX_IMAGE_PIXELS });
  } catch (err) {
    const mapped = mapPdfjsError(err);
    throw mapped ?? err;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    assertPageCap(pdf.numPages);
    try {
      return await Promise.race([
        op(pdf),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new IngestionError(
                  "server-error",
                  "PDF extraction timed out — the document was too complex to read safely.",
                ),
              ),
            PDF_EXTRACTION_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  } finally {
    await pdf.loadingTask.destroy();
  }
}

// ── Title sanity (D11-07 helper half) ─────────────────────────────────────────
/** Producer-garbage Info-title patterns (RESEARCH Example 2; A1 — corpus-
 * verified during calibration). Matches run against the TRIMMED title. */
export const PDF_TITLE_GARBAGE: readonly RegExp[] = [
  /^\s*$/,
  /^(untitled|unknown|title|document|new document|presentation|slide 1|layout)\s*$/i,
  /^microsoft (word|powerpoint|excel|office)\b/i,
  /^adobe (acrobat|illustrator)\b/i,
  /\.(docx?|pptx?|pdf|indd|qxd|pub|pages)$/i,
  /^[0-9a-f]{16,}$/i,
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
];

/** A sane Info title: trimmed length 2–200 and no garbage pattern. The
 * adapter copies the Info title into `provenancePartial.title` ONLY when
 * sane; the filename → neutral fallbacks live in the orchestrator (11-03). */
export function isSanePdfTitle(t: string): boolean {
  const trimmed = t.trim();
  if (trimmed.length < 2 || trimmed.length > 200) return false;
  return !PDF_TITLE_GARBAGE.some((pattern) => pattern.test(trimmed));
}

/** Extract the sanity-checked Info title (PascalCase "Title" key — verified
 * against unpdf's getMeta info dict). Exported for unit testing the sane /
 * insane wiring without an Info-bearing fixture. */
export function saneInfoTitle(info: Record<string, unknown>): string | undefined {
  const t = info.Title;
  return typeof t === "string" && isSanePdfTitle(t) ? t : undefined;
}

// ── Public adapter shape (identical to MarkdownToBlocksResult — locked) ───────
/** PdfToBlocksResult — byte-identical shape to `MarkdownToBlocksResult`
 * (markdownToBlocks.ts L308-314). The orchestrator destructures every Stage-1
 * branch with the same code; a drift here breaks the fourth branch. */
export interface PdfToBlocksResult {
  blocks: Block[];
  footnotes: { id: string; content: InlineRun[] }[];
  lang: string;
  provenancePartial: ProvenancePartial;
  isReaderable: boolean;
}

/**
 * pdfToBlocks — the unpdf → Block tree adapter. One proxy runs getMeta +
 * extractTextItems + getOutline under the caps/timeout above; errors map via
 * mapPdfjsError BEFORE anything else; the scanned verdict refuses BEFORE the
 * multi-column verdict (a scanned doc has no columns to detect); only then
 * does assembly run. Task 1 ships lifecycle + detection + typed refusals —
 * assembly (outline-first headings, hyphenation joins, unsupported blocks)
 * lands in Task 2; until then admitted documents resolve the typed stub.
 */
export async function pdfToBlocks(pdfBytes: Uint8Array): Promise<PdfToBlocksResult> {
  return withPdfDocument(pdfBytes, async (pdf) => {
    let meta: Awaited<ReturnType<typeof getMeta>>;
    let text: Awaited<ReturnType<typeof extractTextItems>>;
    let outline: Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>;
    try {
      meta = await getMeta(pdf);
      text = await extractTextItems(pdf);
      outline = await pdf.getOutline();
    } catch (err) {
      const mapped = mapPdfjsError(err);
      throw mapped ?? err;
    }

    // Fetched on the same proxy now so the lifecycle contract (one proxy,
    // three reads) is locked by Task 1; Task 2's outline-first heading
    // coercion is the consumer.
    void outline;

    // Detection BEFORE assembly — never silently reorder (D11-01).
    const verdict = classifyDocument(text.items);
    if (verdict.scanned) {
      throw new IngestionError(
        "pdf-scanned",
        "This PDF looks like scanned images rather than text; an OCR tool could convert it first.",
      );
    }
    if (verdict.multiColumn) {
      throw new IngestionError(
        "pdf-multi-column",
        "This PDF has multiple text columns; its reading order cannot be reconstructed reliably yet.",
      );
    }

    // Task 2 completes assembly (outline-first headings, dehyphenated
    // paragraphs, honest unsupported blocks). The typed stub keeps the
    // five-field contract destructurable in the meantime.
    return {
      blocks: [] as Block[],
      footnotes: [],
      lang: "en", // English-only corpus per Pitfall 5 scope note
      provenancePartial: saneInfoTitle(meta.info) !== undefined
        ? { title: saneInfoTitle(meta.info) }
        : {},
      isReaderable: false,
    };
  });
}
