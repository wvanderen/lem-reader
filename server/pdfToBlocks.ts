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
  // Pattern 6 — paragraph assembly
  /** new paragraph when the baseline delta exceeds this × modal line delta. */
  paragraphGapRatio: 1.35,
  /** insert a space between same-line items when the x-gap exceeds this × fontSize. */
  itemGapRatio: 0.2,
  /** an intra-page vertical gap beyond this × modal line height is a
   * non-text region (figure/chart stand-in) — emit ONE unsupported block. */
  figureGapLines: 5,
  // Pattern 5 — heading detection (outline-first; this is the fallback)
  /** heading when dominant fontSize ≥ body × this (char-weighted modal body).
   * 1.15 → 1.1 at 11-06 calibration: TRACE's section headings are 12pt over
   * a 10.9pt body (ratio 1.101) — 1.1 lands exactly AT the boundary (10.9091 × 1.1 =
   * 12.00001 > the 12pt headings), so 1.095; nothing in the corpus sits between body
   * and 11.49pt display operators, so 1.1 admits true headings safely. */
  headingFontRatio: 1.095,
  /** …AND the group is under this many words. */
  headingMaxWords: 10,
  /** outline dest y matches a block top within this × the page's line delta. */
  outlineYToleranceLines: 1.5,
  // ── 11-06 corpus calibration additions (D11-02/D11-06 tuned values) ──────
  // Pattern 6a — page-furniture suppression (repeated running heads / feet +
  // bare page numbers). Calibrated against: wage-labour (35 bare page-number
  // blocks + section-end gaps manufacturing unsupported regions), TRACE (13
  // running-head blocks interleaving the body), YouAreTheOne (per-page
  // running heads whose repetition broke quote resolution at the anchor gate).
  /** digit-normalized first/last-band text repeating on ≥ this many pages is
   * furniture (running head/foot). */
  furnitureRepeatPages: 3,
  /** a furniture candidate band must be at most this many characters. */
  furnitureMaxChars: 60,
  // Pattern 6b — super/subscript band merge. Calibrated against TRACE's
  // display equations: math script bands (8pt) sit 4.5–9.6pt from their base
  // band (10.9pt) and were splitting equations into 2–4 blocks. Merging a
  // smaller-dominant-size band into its larger-size neighbor within this ×
  // the page's line delta reconstructs one equation block (the labeled
  // structure) without touching uniform-size documents.
  /** a band whose dominant font is smaller than an adjacent band's merges
   * into it when the y-distance is under this × the page's line delta. */
  scriptBandRatio: 0.75,
  /** a band that is BOTH a tiny fragment (≤ scriptFragmentChars) AND
   * smaller-dominant-size than an adjacent band — a pure script decoration
   * such as a stacked ∑/∏ under-limit — merges within this × line delta.
   * TRACE's under-limits "𝑘=0" (7.97pt over a 10.91pt body) sit 11.88pt
   * below their equation band, outside the 0.75 window (10.16pt), and
   * orphaned as standalone paragraph blocks. The AND-qualification is the
   * safety: a body-SIZED short line (a paragraph's last line, "given by:")
   * is never size-qualified, and a math-heavy body LINE exceeds the char
   * cap, so both keep the 0.75 window and near-line-delta paragraph
   * spacing never fuses (11-06 continuation calibration). */
  scriptFragmentGapRatio: 1,
  // Pattern 5b — standalone-line + bold-section heuristics. A SHORT line
  // (≤ headingMaxWords) whose gap ABOVE exceeds paragraph spacing is its own
  // group (resume section titles at Δ14–16 vs body Δ12; display equations
  // with display skips both sides — both labeled as their own blocks). The
  // bold-section fallback arm then promotes standalone ASCII titles of ≤ this
  // many words (no sentence punctuation) to headings: unpdf exposes only
  // generic fontFamily ("serif"), so boldness is invisible — the corpus
  // showed same-size bold sections ("Summary", "Core Strengths",
  // "Experience") need this arm, while 4+ word standalone lines ("Orphic
  // Hymn to Artemis") and sentence-shaped lines stay paragraphs.
  /** bold-section fallback: standalone ASCII title at body size becomes a
   * heading when at most this many words. */
  sectionTitleMaxWords: 3,
  /** a band this many non-whitespace characters or fewer, sitting within
   * scriptBandRatio × line delta of a neighbor, is an equation fragment
   * (superscript sums/indices like "Õ∞", "𝑘𝑘", "𝑘=0") — merged into the
   * neighbor regardless of relative font size (some producers set display
   * operators LARGER than the base). 8 → 12 at calibration: merged fragment
   * chains ("\"#\"#∞∞ÕÕ𝑘𝑘" = 10 chars) must keep cascading into the base
   * band — an 8-char cap stalled the chain one band short. */
  scriptFragmentChars: 12,
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

// ── Page-furniture suppression (11-06 calibration — Pattern 6a) ──────────────
/** Normalize a band text into a furniture-comparison key: lowercase,
 * whitespace-collapsed, digit-runs → "#" (running heads carry varying page
 * numbers; "A Science of Reality: … 3" and "… 4" must compare equal). */
function furnitureKey(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(/[0-9]+/g, "#").toLowerCase();
}

/** A bare page number band ("1".."2026", optionally decorated) — the classic
 * page folio. Only ever considered at a page's first/last band. */
function isBarePageNumber(text: string): boolean {
  return /^[#|\-–—\s]*[0-9]{1,4}[#|\-–—\s]*$/.test(text.replace(/\s+/g, " ").trim());
}

/**
 * stripPageFurniture — remove repeated running heads/feet and bare page
 * numbers from each page's items, BEFORE classification and assembly
 * (11-06 corpus calibration). Furniture is a FIRST-or-LAST band phenomenon:
 * a candidate must sit at a page edge, be short (≤ furnitureMaxChars), and
 * either be a bare page number or repeat (digit-normalized) on ≥
 * furnitureRepeatPages pages. Everything stripped here was breaking the
 * corpus three ways: furniture blocks polluted block agreement, section-end
 * gaps down to a lone page number manufactured unsupported "figure" regions,
 * and repeated head text made the SC#4a quote-resolution gate ambiguous.
 * Pages whose only content was furniture become empty — honestly blank
 * (not a "non-text region"), and still counted as near-empty for the
 * scanned verdict, which runs on the stripped pages.
 */
export function stripPageFurniture(
  pages: StructuredTextItem[][],
): StructuredTextItem[][] {
  // Pass 1 — band each page once, collect first/last band candidate keys.
  interface PageBands {
    bands: LineBand[];
    firstKey: string | null;
    lastKey: string | null;
  }
  const banded: PageBands[] = pages.map((page) => {
    const real = realItems(page);
    if (real.length === 0) {
      return { bands: [], firstKey: null, lastKey: null };
    }
    const lineDelta = modalLineDelta(real);
    const bands = binIntoBands(real, PDF_THRESHOLDS.bandYToleranceRatio * lineDelta);
    if (bands.length < 2) {
      // Single-band pages have no interior to protect furniture FROM —
      // never strip (a lone heading or lone paragraph is not furniture).
      return { bands, firstKey: null, lastKey: null };
    }
    const textOf = (band: LineBand): string =>
      band.items.map((i) => i.str).join("").replace(/\s+/g, " ").trim();
    const short = (t: string) => t.length > 0 && t.length <= PDF_THRESHOLDS.furnitureMaxChars;
    // ISOLATION (calibration lesson): furniture floats apart from the body.
    // A first/last band must be separated from the page's remaining content
    // by more than paragraph spacing — TRACE's bibliography opens pages with
    // reference entries that BEGIN with the running-head text ("A Science
    // Reality: … 3" as a citation title); those sit at normal line spacing
    // and are CONTENT, never furniture. Distance is absolute (y descends:
    // the first band is ABOVE its inner neighbor, the last band BELOW).
    const isolatedFromBody = (edge: LineBand, inner: LineBand): boolean =>
      Math.abs(edge.y - inner.y) > PDF_THRESHOLDS.paragraphGapRatio * lineDelta;
    const first = textOf(bands[0]!);
    const last = textOf(bands[bands.length - 1]!);
    return {
      bands,
      firstKey:
        short(first) && isolatedFromBody(bands[0]!, bands[1]!)
          ? furnitureKey(first)
          : null,
      lastKey:
        short(last) && isolatedFromBody(bands[bands.length - 1]!, bands[bands.length - 2]!)
          ? furnitureKey(last)
          : null,
    };
  });

  const repeatCounts = new Map<string, number>();
  for (const { firstKey, lastKey } of banded) {
    for (const key of [firstKey, lastKey]) {
      if (key) repeatCounts.set(key, (repeatCounts.get(key) ?? 0) + 1);
    }
  }
  const isFurniture = (key: string | null): boolean => {
    if (key === null) return false;
    return (
      isBarePageNumber(key) ||
      (repeatCounts.get(key) ?? 0) >= PDF_THRESHOLDS.furnitureRepeatPages
    );
  };

  // Pass 2 — drop furniture band items.
  return pages.map((page, pageIndex) => {
    const { bands, firstKey, lastKey } = banded[pageIndex]!;
    if (firstKey === null && lastKey === null) return page;
    const real = realItems(page);
    const drop = new Set<StructuredTextItem>();
    if (isFurniture(firstKey)) for (const it of bands[0]!.items) drop.add(it);
    const lastBand = bands[bands.length - 1];
    if (lastBand && bands.length > 1 && isFurniture(lastKey)) {
      for (const it of lastBand.items) drop.add(it);
    }
    if (drop.size === 0) return page;
    // Empty-string pdfjs artifacts were already excluded by realItems; strip
    // only REAL items so the page's remaining content is untouched.
    return real.filter((it) => !drop.has(it));
  });
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

// ── Outline machinery — author-declared structure (Pattern 5, Pitfall 10) ────
/** Minimal outline-entry shape the flattener reads (pdfjs's OutlineNode minus
 * display-only fields — keeps the stub-injectable surface small for tests). */
export interface OutlineEntryLike {
  title: string;
  dest: string | Array<any> | null;
  url: string | null;
  items: OutlineEntryLike[];
}

/** The pdfjs surface outline resolution needs (the real proxy satisfies this
 * structurally; the unit suite injects a stub — Pitfall 10's two dest shapes
 * are provable without an extra fixture). */
export interface OutlineCapablePdf {
  getOutline(): Promise<OutlineEntryLike[] | null>;
  getDestination(id: string): Promise<Array<any> | null>;
  getPageIndex(ref: unknown): Promise<number>;
}

/** One resolved outline heading target. `level` is clamp(depth + 2, 2, 6) —
 * top-level bookmarks coerce to h2 because article bodies start at h2 (the
 * one-h1 rule; ArticleView renders the title from provenance). */
export interface OutlineTarget {
  title: string;
  pageIndex: number;
  /** XYZ top y in PDF user space (y-UP), or null for Fit/no-y dests —
   * treated as "top of page". */
  destY: number | null;
  level: 2 | 3 | 4 | 5 | 6;
}

/** Flatten the outline tree, carrying depth (top level = 0). */
function flattenOutline(
  entries: OutlineEntryLike[],
): Array<{ entry: OutlineEntryLike; depth: number }> {
  const out: Array<{ entry: OutlineEntryLike; depth: number }> = [];
  const walk = (list: OutlineEntryLike[], depth: number): void => {
    for (const entry of list) {
      out.push({ entry, depth });
      if (entry.items && entry.items.length > 0) walk(entry.items, depth + 1);
    }
  };
  walk(entries, 0);
  return out;
}

/** Extract the XYZ top y from a resolved destination array. VERIFIED against
 * the real pdfjs shape (synthetic-outline.pdf): explicit dests come back as
 * `[RefProxy, {name:"XYZ"}, left, top, zoom]` — the coordinates are FLAT
 * array elements, NOT `.args` (the RESEARCH sketch's `.args` form is kept as
 * a defensive fallback only). Non-XYZ modes (Fit etc.) return null ⇒ the
 * coercion treats the dest as "top of page". */
function destTopY(dest: Array<any>): number | null {
  const mode = dest[1];
  if (mode && typeof mode === "object" && "name" in mode) {
    const name = (mode as { name?: unknown }).name;
    if (name !== "XYZ") return null;
    const flatTop = dest[3];
    if (typeof flatTop === "number") return flatTop;
    const args = (mode as { args?: unknown }).args;
    if (Array.isArray(args) && typeof args[1] === "number") {
      return args[1] as number;
    }
  }
  return null;
}

/** Resolve the outline into flat heading targets. url-bearing entries are
 * external links, not headings; null dests have no target; string dests
 * resolve through getDestination (named destinations — many LaTeX/Word
 * exporters use them); explicit arrays pass through as-is (Pitfall 10). */
export async function outlineHeadingTargets(
  pdf: OutlineCapablePdf,
): Promise<OutlineTarget[]> {
  const outline = await pdf.getOutline();
  if (!outline || outline.length === 0) return [];
  const targets: OutlineTarget[] = [];
  for (const { entry, depth } of flattenOutline(outline)) {
    if (entry.url || !entry.dest) continue;
    const dest =
      typeof entry.dest === "string"
        ? await pdf.getDestination(entry.dest)
        : entry.dest;
    if (!dest || dest.length === 0) continue;
    try {
      const pageIndex = await pdf.getPageIndex(dest[0]);
      const level = Math.max(2, Math.min(6, depth + 2)) as 2 | 3 | 4 | 5 | 6;
      targets.push({ title: entry.title, pageIndex, destY: destTopY(dest), level });
    } catch {
      // Unresolvable page ref — skip this entry honestly rather than fail
      // the whole document over one broken bookmark.
    }
  }
  return targets;
}

// ── Assembly (Pattern 6) ──────────────────────────────────────────────────────
/** One block under construction. Paragraph drafts carry the geometry the
 * outline coercion needs (page index, approximate line-box top, dominant
 * fontSize, the page's modal line delta). */
interface DraftBlock {
  kind: "paragraph" | "heading" | "unsupported";
  level?: 2 | 3 | 4 | 5 | 6;
  /** paragraph/heading body text (inline runs are built at emit time). */
  text?: string;
  /** unsupported diagnostics. */
  originalKind?: string;
  plainDescription?: string;
  /** true when this paragraph group is a standalone short line (Pattern 5b —
   * gap-above beyond paragraph spacing, ≤ headingMaxWords) OR the first
   * group on its page (a section opener at a page top has no in-page
   * gap-above to measure). The bold-section + numbered-section fallback
   * arms key off these flags. */
  standalone?: boolean;
  pageTop?: boolean;
  pageIndex: number;
  /** first-line baseline + dominant fontSize ≈ the line-box top. */
  topY: number;
  fontSize: number;
  /** the page's modal line delta (outline y-tolerance scale). */
  lineDelta: number;
}

const NON_TEXT_REGION_DESCRIPTION =
  "A page or region with no extractable text — likely a figure, chart, or table.";

/** Bold-section title shape (11-06 calibration — Pattern 5b): letter-first,
 * ASCII letters/digits/spaces plus the light connective punctuation real
 * section titles use. Excludes sentence terminators, quotes, brackets, and
 * every math glyph class (display equations must never match). */
const SECTION_TITLE_TEXT = /^[A-Za-z][A-Za-z0-9\s&'/,-]*$/;

/** Numbered-section shape (11-06 calibration — Pattern 5b): a dotted
 * section number followed by the title ("5.3 Metaphysics: …"). The dot
 * separates real section headings from table rows and footnote markers. */
const NUMBERED_SECTION_TEXT = /^\d+(\.\d+)+\s+\S/;

/** Assemble ONE page's real items into ordered draft blocks: y-descending
 * line bands → intra-line x-gap joins → paragraph grouping on vertical-gap /
 * font-regime change → hyphenation joins. A vertical gap beyond
 * figureGapLines line-heights emits ONE honest unsupported block between the
 * surrounding paragraphs (DOC-06 disclosure — figure-heavy PDFs may then
 * honestly derive low confidence downstream; ING-06 working, not a bug). */
function assemblePage(pageIndex: number, items: StructuredTextItem[]): DraftBlock[] {
  if (items.length === 0) return [];
  const lineDelta = modalLineDelta(items);
  let bands = binIntoBands(items, PDF_THRESHOLDS.bandYToleranceRatio * lineDelta);

  // Script-band merge (11-06 calibration — Pattern 6b): a band whose dominant
  // font is smaller than an adjacent band's, or whose entire text is a tiny
  // fragment (≤ scriptFragmentChars — super/subscript sums and indices like
  // "Õ∞", "𝑘𝑘", "𝑘=0"), is equation script sitting close to its base line
  // (TRACE's display equations: script bands 4.5–9.6pt from their base, some
  // set LARGER than the body by the producer). Converge-loop each such band
  // into the CLOSER adjacent band within scriptBandRatio × line delta so one
  // equation is one block — the labeled structure (a superscript band sits
  // closest to its own base line; chains of fragments coalesce stepwise
  // toward it). Uniform-size, full-line documents never have bands inside
  // the tolerance (body spacing is a full line delta) and are untouched.
  {
    const dominant = (band: LineBand): number => {
      const weights = new Map<number, number>();
      for (const it of band.items) {
        const size = round2(it.fontSize);
        weights.set(size, (weights.get(size) ?? 0) + Math.max(1, nonWsChars(it.str)));
      }
      let size = 0;
      let best = -1;
      for (const [s, w] of weights) {
        if (w > best) {
          size = s;
          best = w;
        }
      }
      return size;
    };
    const chars = (band: LineBand): number =>
      band.items.reduce((n, it) => n + nonWsChars(it.str), 0);
    /** A band's bottom edge (min item y) — merged fragment chains grow
     * downward, so proximity to the NEXT band must be measured from the
     * bottom, not from the stale top reference y. */
    const bottom = (band: LineBand): number =>
      Math.min(...band.items.map((it) => it.y));
    const tol = PDF_THRESHOLDS.scriptBandRatio * lineDelta;
    const orphanTol = PDF_THRESHOLDS.scriptFragmentGapRatio * lineDelta;
    const sizes = bands.map(dominant);
    const charCounts = bands.map(chars);
    const sizeQualified = (i: number): boolean =>
      sizes[i]! < (sizes[i - 1] ?? -Infinity) ||
      sizes[i]! < (sizes[i + 1] ?? -Infinity);
    const charQualified = (i: number): boolean =>
      charCounts[i]! <= PDF_THRESHOLDS.scriptFragmentChars;
    const isScriptBand = (i: number): boolean => charQualified(i) || sizeQualified(i);
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < bands.length; i++) {
        if (!isScriptBand(i)) continue;
        const curr = bands[i]!;
        const prev = i > 0 ? bands[i - 1]! : null;
        const next = i + 1 < bands.length ? bands[i + 1]! : null;
        // A pure decoration fragment (tiny AND script-sized — a stacked
        // operator limit) may reach a full line delta: it sits further from
        // its base line than inline script. Everything else — body-sized
        // short lines, math-heavy body lines — keeps the tighter window so
        // paragraph line spacing never fuses.
        const window =
          charQualified(i) && sizeQualified(i) ? orphanTol : tol;
        const prevOk = prev !== null && bottom(prev) - curr.y <= window;
        const nextOk = next !== null && bottom(curr) - next.y <= window;
        let target: number | null = null;
        if (prevOk && nextOk) {
          target =
            bottom(prev) - curr.y <= bottom(curr) - next.y ? i - 1 : i + 1;
        } else if (prevOk) {
          target = i - 1;
        } else if (nextOk) {
          target = i + 1;
        }
        if (target === null) continue;
        const into = bands[target]!;
        into.items.push(...curr.items);
        into.y = Math.max(into.y, curr.y);
        bands.splice(i, 1);
        sizes.splice(i, 1);
        charCounts.splice(i, 1);
        // splice shifted indices ABOVE i down by one — retarget before update.
        if (target > i) target -= 1;
        sizes[target] = dominant(into);
        charCounts[target] = chars(into);
        changed = true;
        break;
      }
    }
  }

  // Lines: dominant font by char weight; text joined with the x-gap rule.
  interface Line {
    y: number;
    text: string;
    fontSize: number;
    fontFamily: string;
  }
  const lines: Line[] = [];
  for (const band of bands) {
    const sorted = [...band.items].sort((a, b) => a.x - b.x);
    let text = "";
    let prev: StructuredTextItem | null = null;
    const sizeWeights = new Map<number, number>();
    const familyWeights = new Map<string, number>();
    for (const it of sorted) {
      if (prev) {
        const gap = it.x - (prev.x + prev.width);
        const endsWithSpace = /\s$/.test(prev.str);
        const startsWithSpace = /^\s/.test(it.str);
        if (
          gap > PDF_THRESHOLDS.itemGapRatio * it.fontSize &&
          !endsWithSpace &&
          !startsWithSpace
        ) {
          text += " ";
        }
      }
      text += it.str;
      const weight = Math.max(1, nonWsChars(it.str));
      const size = round2(it.fontSize);
      sizeWeights.set(size, (sizeWeights.get(size) ?? 0) + weight);
      familyWeights.set(it.fontFamily, (familyWeights.get(it.fontFamily) ?? 0) + weight);
      prev = it;
    }
    text = text.replace(/\s+/g, " ").trim();
    if (text.length === 0) continue;
    let fontSize = 0;
    let bestSize = -1;
    for (const [size, weight] of sizeWeights) {
      if (weight > bestSize) {
        fontSize = size;
        bestSize = weight;
      }
    }
    let fontFamily = "";
    let bestFamily = -1;
    for (const [family, weight] of familyWeights) {
      if (weight > bestFamily) {
        fontFamily = family;
        bestFamily = weight;
      }
    }
    lines.push({ y: band.y, text, fontSize, fontFamily });
  }
  if (lines.length === 0) return [];

  const drafts: DraftBlock[] = [];
  let current:
    | { texts: string[]; y: number; fontSize: number; standalone: boolean }
    | null = null;
  let pageTopPending = true; // the next flushed paragraph opens this page
  const flush = (): void => {
    if (!current) return;
    // Hyphenation join: a trailing hyphen before a lowercase-starting line
    // dehyphenates (drop the hyphen, no space); anything else joins with a
    // single space.
    let text = "";
    for (const [i, line] of current.texts.entries()) {
      if (i === 0) {
        text = line;
        continue;
      }
      if (text.endsWith("-") && /^[a-z]/.test(line)) {
        text = text.slice(0, -1) + line;
      } else {
        text += " " + line;
      }
    }
    text = text.trim();
    if (text.length > 0) {
      drafts.push({
        kind: "paragraph",
        text,
        pageIndex,
        topY: current.y + current.fontSize,
        fontSize: current.fontSize,
        lineDelta,
        standalone: current.standalone,
        pageTop: pageTopPending,
      });
      pageTopPending = false;
    }
    current = null;
  };

  let prevLine: Line | null = null;
  for (const line of lines) {
    // Standalone short line (11-06 calibration — Pattern 5b): a line under
    // headingMaxWords whose gap ABOVE exceeds paragraph spacing is its OWN
    // group and never merges downward. Corpus-proven on both sides: the
    // resume's same-size section titles (Δ14–16 above body Δ12) and TRACE's
    // display equations (display skips both sides) — both labeled as their
    // own blocks — while mid-paragraph short wraps ("Markov process") have
    // normal gap-above and keep merging.
    const words = line.text.trim().split(/\s+/).filter(Boolean).length;
    const standalone =
      prevLine !== null &&
      words > 0 &&
      words <= PDF_THRESHOLDS.headingMaxWords &&
      // A trailing hyphen means the line continues into the next one — it
      // is never a complete group (the hyphenation join must run).
      !line.text.trim().endsWith("-") &&
      prevLine.y - line.y > PDF_THRESHOLDS.paragraphGapRatio * lineDelta;
    if (prevLine) {
      const delta = prevLine.y - line.y;
      if (delta > PDF_THRESHOLDS.figureGapLines * lineDelta) {
        // figure-sized gap → honest unsupported block between the groups
        flush();
        drafts.push({
          kind: "unsupported",
          originalKind: "non-text-region",
          plainDescription: NON_TEXT_REGION_DESCRIPTION,
          pageIndex,
          topY: (prevLine.y + line.y) / 2,
          fontSize: prevLine.fontSize,
          lineDelta,
        });
      } else if (standalone) {
        // Own complete group — flush what came before, emit this line alone.
        flush();
        current = { texts: [line.text], y: line.y, fontSize: line.fontSize, standalone: true };
        flush();
        prevLine = line;
        continue;
      } else if (
        delta > PDF_THRESHOLDS.paragraphGapRatio * lineDelta ||
        line.fontSize !== prevLine.fontSize ||
        line.fontFamily !== prevLine.fontFamily
      ) {
        flush();
      }
    }
    if (!current) {
      current = {
        texts: [],
        y: line.y,
        fontSize: line.fontSize,
        standalone: false,
      };
    }
    current.texts.push(line.text);
    prevLine = line;
  }
  flush();
  return drafts;
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
 * does assembly run: y-descending lines (Pitfall 1), paragraph grouping on
 * vertical gap / font regime, hyphenation joins, outline-first heading
 * coercion with the font-size fallback (D11-08), and honest unsupported
 * blocks for non-text regions (Task 2).
 */
export async function pdfToBlocks(pdfBytes: Uint8Array): Promise<PdfToBlocksResult> {
  return withPdfDocument(pdfBytes, async (pdf) => {
    let meta: Awaited<ReturnType<typeof getMeta>>;
    let text: Awaited<ReturnType<typeof extractTextItems>>;
    let outlineTargets: OutlineTarget[];
    try {
      meta = await getMeta(pdf);
      text = await extractTextItems(pdf);
      outlineTargets = await outlineHeadingTargets(pdf);
    } catch (err) {
      const mapped = mapPdfjsError(err);
      throw mapped ?? err;
    }

    // Detection BEFORE assembly — never silently reorder (D11-01). Furniture
    // (repeated running heads / bare page numbers — 11-06 calibration
    // Pattern 6a) is stripped FIRST so classification, voting, and assembly
    // all see the cleaned pages: furniture blocks polluted block agreement,
    // section-end gaps down to a lone folio manufactured unsupported
    // "figure" regions, and repeated head text made quote resolution
    // ambiguous at the SC#4a anchor gate.
    const strippedPages = stripPageFurniture(text.items);
    const verdict = classifyDocument(strippedPages);
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

    // Char-count-weighted modal body fontSize — the heading fallback's
    // baseline (Pattern 5). Computed over the STRIPPED pages so running-head
    // fonts (typically smaller) do not skew the body estimate.
    const allReal = strippedPages.flatMap((page) => realItems(page));
    const bodyFontSize = modalFontSize(allReal, true);

    // Per-page assembly + the near-empty-page disclosure. A near-empty page
    // inside an ADMITTED document (minority — majority already refused above)
    // emits ONE unsupported block instead of vanishing silently — EXCEPT a
    // page with ZERO real items after furniture stripping: that page is
    // honestly blank (its only content was a folio), not a "non-text region"
    // claiming a figure may live there.
    const drafts: DraftBlock[] = [];
    let textBearingPages = 0;
    strippedPages.forEach((pageItems, pageIndex) => {
      const real = realItems(pageItems);
      const chars = real.reduce((n, it) => n + nonWsChars(it.str), 0);
      if (
        real.length >= PDF_THRESHOLDS.scannedItemFloor &&
        chars >= PDF_THRESHOLDS.scannedCharFloor
      ) {
        textBearingPages += 1;
      }
      const isNearEmpty =
        real.length < PDF_THRESHOLDS.nearEmptyItemFloor ||
        chars < PDF_THRESHOLDS.nearEmptyCharFloor;
      if (real.length === 0) {
        // Blank page (often furniture-only after stripping) — no content
        // claim, no disclosure block. Still counted by classifyDocument's
        // near-empty majority on the stripped pages.
        return;
      }
      if (isNearEmpty) {
        drafts.push({
          kind: "unsupported",
          originalKind: "non-text-region",
          plainDescription: NON_TEXT_REGION_DESCRIPTION,
          pageIndex,
          topY: 0,
          fontSize: bodyFontSize,
          lineDelta: bodyFontSize,
        });
        return;
      }
      drafts.push(...assemblePage(pageIndex, real));
    });

    // Outline-FIRST heading coercion (D11-08): each target picks the block
    // on its page whose line-box top is within outlineYToleranceLines × the
    // page's line delta of the dest XYZ y. The classic `/XYZ 0 pageHeight 0`
    // "top of page" dest sits ABOVE every block top (producers point at the
    // page edge, not the first baseline) — when the dest y is at/above the
    // page's topmost block, THAT block is the target. First coercion wins.
    const coerced = new Set<DraftBlock>();
    for (const target of outlineTargets) {
      const candidates = drafts.filter(
        (d) =>
          d.kind === "paragraph" &&
          d.pageIndex === target.pageIndex &&
          !coerced.has(d),
      );
      if (candidates.length === 0) continue;
      let chosen: DraftBlock | null = null;
      if (target.destY === null) {
        chosen = candidates[0] ?? null; // Fit-style dest → top of page
      } else {
        let best: DraftBlock | null = null;
        let bestDist = Infinity;
        for (const candidate of candidates) {
          const dist = Math.abs(candidate.topY - target.destY);
          if (dist < bestDist) {
            best = candidate;
            bestDist = dist;
          }
        }
        const tolerance =
          PDF_THRESHOLDS.outlineYToleranceLines *
          (best?.lineDelta ?? bodyFontSize);
        const maxTopY = Math.max(...candidates.map((c) => c.topY));
        if (best && bestDist <= tolerance) {
          chosen = best;
        } else if (target.destY >= maxTopY) {
          chosen = candidates[0] ?? null; // dest at/above page content
        }
      }
      if (chosen) {
        chosen.kind = "heading";
        chosen.level = target.level;
        coerced.add(chosen);
      }
    }

    // Font-size fallback (D11-08): dominant fontSize ≥ body × headingFontRatio
    // AND under headingMaxWords ⇒ heading level 2 (bodies start at h2). This
    // is also the gap-filler for outline-less PDFs.
    for (const draft of drafts) {
      if (draft.kind !== "paragraph" || coerced.has(draft)) continue;
      const words = (draft.text ?? "").trim().split(/\s+/).filter(Boolean).length;
      if (
        draft.fontSize >= bodyFontSize * PDF_THRESHOLDS.headingFontRatio &&
        words > 0 &&
        words <= PDF_THRESHOLDS.headingMaxWords
      ) {
        draft.kind = "heading";
        draft.level = 2;
      }
    }

    // Bold-section fallback arm (11-06 calibration — Pattern 5b): unpdf
    // exposes only generic fontFamily ("serif"), so same-size BOLD section
    // titles are invisible to the size rule. Corpus-proven discriminator: a
    // STANDALONE short ASCII title (≤ sectionTitleMaxWords, letter-first, no
    // sentence punctuation, no math glyphs) at body size is a section
    // heading — "Summary" / "Core Strengths" / "Experience" — while 4+-word
    // standalone lines ("Orphic Hymn to Artemis"), sentence-shaped lines,
    // quoted dialogue, and display equations stay paragraphs.
    for (const draft of drafts) {
      if (
        draft.kind !== "paragraph" ||
        coerced.has(draft) ||
        !(draft.standalone || draft.pageTop)
      ) {
        continue;
      }
      const text = (draft.text ?? "").trim();
      const words = text.split(/\s+/).filter(Boolean).length;
      if (
        words > 0 &&
        words <= PDF_THRESHOLDS.sectionTitleMaxWords &&
        SECTION_TITLE_TEXT.test(text) &&
        draft.fontSize >= bodyFontSize * 0.95 &&
        draft.fontSize < bodyFontSize * PDF_THRESHOLDS.headingFontRatio
      ) {
        draft.kind = "heading";
        draft.level = 2;
        coerced.add(draft);
      }
    }

    // Numbered-section fallback arm (11-06 calibration — Pattern 5b): a
    // standalone "N.N Title" group (dotted section number, ≤ headingMaxWords)
    // is a heading even at body size — catches subsections whose outline
    // dest failed to coerce (TRACE's "5.3 Metaphysics: …"). The DOT is
    // load-bearing: table rows ("1 Special relativity…") and footnote
    // markers ("3Philosophically…") never match; body sentences referencing
    // a section never carry the paragraph-gap-above standalone flag.
    for (const draft of drafts) {
      if (
        draft.kind !== "paragraph" ||
        coerced.has(draft) ||
        !(draft.standalone || draft.pageTop)
      ) {
        continue;
      }
      const text = (draft.text ?? "").trim();
      const words = text.split(/\s+/).filter(Boolean).length;
      if (
        words > 0 &&
        words <= PDF_THRESHOLDS.headingMaxWords &&
        NUMBERED_SECTION_TEXT.test(text)
      ) {
        draft.kind = "heading";
        draft.level = 2;
        coerced.add(draft);
      }
    }

    const blocks: Block[] = drafts.map((draft): Block => {
      if (draft.kind === "heading") {
        return {
          kind: "heading",
          level: draft.level ?? 2,
          content: [{ text: draft.text ?? "", marks: [] }],
        };
      }
      if (draft.kind === "unsupported") {
        return {
          kind: "unsupported",
          originalKind: draft.originalKind ?? "non-text-region",
          plainDescription: draft.plainDescription ?? NON_TEXT_REGION_DESCRIPTION,
        };
      }
      return { kind: "paragraph", content: [{ text: draft.text ?? "", marks: [] }] };
    });

    return {
      blocks,
      footnotes: [], // PDF footnotes are body text in Phase 11 (Pattern 1)
      lang: "en", // English-only corpus per Pitfall 5 scope note
      provenancePartial: saneInfoTitle(meta.info) !== undefined
        ? { title: saneInfoTitle(meta.info) }
        : {},
      isReaderable: blocks.length >= 3 && textBearingPages >= 1,
    };
  });
}
