// src/readaloud/chunks.ts
// Issue #40 — sentence-chunked utterances over the D-05 substrate (spike 0009
// F2 + F5). ONE pure function turns a canonical article into the ordered
// utterance queue: each chunk carries the utterance text AND the canonical
// article-global grapheme range it covers, plus the UTF-16 → grapheme map the
// engine uses to translate boundary charIndexes (spike 0009 F5 — charIndex is
// ephemeral UTF-16 into the utterance's own text; canonical grapheme offsets
// are the only durable currency).
//
// Issue #43 — the spoken channel follows the document honestly (acceptance
// flow O7): a link's TEXT is spoken (hrefs never enter the D-05 substrate),
// code-block and unsupported blocks are skipped SILENTLY (the marker visibly
// hops the gap), a figure is skipped but its caption reads, and footnote
// bodies read at document end. The rules live HERE, not in normalizeText —
// the D-05 substrate is the persistence contract (locations, highlights,
// pagination all address it) and must never shift; the spoken channel is a
// lens over it. Chunks also carry sentenceIndex + paragraphIndex — the skip
// units the #43 transport controls ride.
//
// Pure domain logic — no DOM, no speech APIs, no React. jsdom-safe.

import type { Block, CanonicalArticle } from "../content/types";
import {
  articleGraphemeIndex,
  graphemeClusters,
  inlineText,
} from "../content/normalizeText";

/** One sentence-sized utterance. startGrapheme is inclusive, endGrapheme
 * exclusive, both canonical article-global grapheme offsets (D-05). */
export interface SpeechChunk {
  text: string;
  startGrapheme: number;
  endGrapheme: number;
  /**
   * Map from UTF-16 code-unit index within `text` → grapheme ordinal within
   * the chunk (canonical = startGrapheme + ordinal). Length text.length + 1;
   * the trailing entry is the past-the-end ordinal so an end-exclusive
   * charIndex maps cleanly. Built with the article's own locale so the
   * segmentation matches the D-05 substrate.
   */
  utf16ToGrapheme: readonly number[];
  /**
   * Issue #43 — the skip units. sentenceIndex: the ordinal of this chunk's
   * sentence across the whole speakable stream (all pieces of one
   * over-budget sentence share it). paragraphIndex: the ordinal of the
   * speakable paragraph unit (top-level body block or footnote body) the
   * chunk starts in. Both count ONLY speakable units — skipped blocks
   * (code/unsupported/figure media) produce no unit, so a skip lands on the
   * next speakable text and the marker visibly hops the gap.
   */
  sentenceIndex: number;
  paragraphIndex: number;
}

/**
 * Safety budget per utterance (graphemes). Sentence segmentation alone can
 * produce pathological "sentences" (un-punctuated run-on transcripts); the
 * spec's own ceiling is 32,767 characters and Chrome's Google voices cut long
 * utterances at ~14 s (spike 0009 §2.3). 250 graphemes is several normal
 * sentences' worth of headroom under both.
 */
export const MAX_CHUNK_GRAPHEMES = 250;

/**
 * Chunk the article's SPOKEN channel into sentence-sized utterances.
 *
 * - The spoken channel is the D-05 normalized text minus what read-aloud
 *   skips silently (O7): code-block sources, unsupported-block disclosures,
 *   and figure media (alt) — figures contribute their caption only. Footnote
 *   bodies stay at document end (the substrate's own ordering).
 * - Sentence boundaries come from Intl.Segmenter (sentence granularity, the
 *   article's own lang) over each speakable range separately, so sentences
 *   align with document blocks.
 * - Whitespace-only segments are skipped — nothing to speak, nothing to
 *   track.
 * - Segments over MAX_CHUNK_GRAPHEMES are split at whitespace-cluster
 *   boundaries (hard cut only if a window has no whitespace — a run-on
 *   unbroken span).
 *
 * Offsets stay canonical end-to-end: a chunk's [startGrapheme, endGrapheme)
 * range is exact against the article's cluster array regardless of splitting
 * or skipping (the skipped ranges simply belong to no chunk — progress and
 * the marker hop across them without losing ground).
 */
export function chunkArticleForSpeech(article: CanonicalArticle): SpeechChunk[] {
  const index = articleGraphemeIndex(article);
  const clusters = index.clusters;
  if (clusters.length === 0) return [];

  const chunks: SpeechChunk[] = [];
  const segmenter = new Intl.Segmenter(article.lang, {
    granularity: "sentence",
  });
  let sentenceIndex = 0;
  for (const [paragraphIndex, range] of speakableRanges(article, index).entries()) {
    // Segment the range's OWN text and map segment spans back to canonical
    // ordinals through the shared per-range UTF-16 → grapheme map — the same
    // discipline the per-block index builds (never segment a joined string
    // and split on separators).
    const rangeMap = buildUtf16ToGraphemeMap(clusters, range.start, range.end);
    for (const segment of segmenter.segment(
      clusters.slice(range.start, range.end).join(""),
    )) {
      const localStart = rangeMap[segment.index];
      const localEnd = rangeMap[segment.index + segment.segment.length];
      if (localStart === undefined || localEnd === undefined) continue; // defensive
      let start = range.start + localStart;
      let end = range.start + localEnd;
      // Trim the segment's canonical range to its non-whitespace clusters:
      // sentence segments carry trailing (and leading) whitespace no
      // utterance needs to speak.
      while (start < end && isWhitespaceCluster(clusters[start]!)) start++;
      while (end > start && isWhitespaceCluster(clusters[end - 1]!)) end--;
      if (end <= start) continue; // whitespace-only segment
      pushChunksForRange(clusters, start, end, chunks, sentenceIndex, paragraphIndex);
      sentenceIndex += 1;
    }
  }
  return chunks;
}

/**
 * The spoken channel's paragraph units, in document order: the canonical
 * [start, end) grapheme ranges a read-aloud session may speak (O7).
 *
 * Speakable whole: headings, paragraphs, blockquotes, lists, and the visible
 * footnote-reference markers. Caption-only: figures (the media is skipped —
 * the caption is the figure's honest spoken text). Silent: code-block
 * sources, unsupported-block disclosures (they are visible disclosures on the
 * page, but speech skips them), and the block separators. Footnote bodies
 * follow at document end — the substrate's own ordering.
 */
function speakableRanges(
  article: CanonicalArticle,
  index: ReturnType<typeof articleGraphemeIndex>,
): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  article.blocks.forEach((block: Block, i: number) => {
    const start = index.blockStartOffsets[i]!;
    const len = index.perBlockLengths[i]!;
    if (len === 0) return;
    switch (block.kind) {
      case "heading":
      case "paragraph":
      case "blockquote":
      case "bulleted-list":
      case "numbered-list":
      case "footnote-reference":
        ranges.push({ start, end: start + len });
        break;
      case "figure": {
        // O7 — the figure is skipped but its caption reads. The figure's
        // normalized contribution is `[alt, captionText].filter(Boolean)
        // .join("\n")`, so a non-empty caption always occupies the TAIL of
        // the contribution: its range is the last captionLen clusters.
        const captionLen = graphemeClusters(inlineText(block.caption), article.lang).length;
        if (captionLen > 0) ranges.push({ start: start + len - captionLen, end: start + len });
        break;
      }
      case "code-block":
      case "unsupported":
        break; // skipped silently — the marker hops the gap
    }
  });
  // Footnote bodies — document end, one speakable unit per non-empty body.
  const bodyEmpty =
    article.blocks.length === 1 && index.perBlockLengths[0] === 0;
  let cursor = bodyEmpty ? 0 : index.blockStartOffsets[article.blocks.length]!;
  for (const fn of article.footnotes) {
    const len = graphemeClusters(inlineText(fn.content), article.lang).length;
    if (len > 0) {
      ranges.push({ start: cursor, end: cursor + len });
      // The BLOCK_SEPARATOR before the next NON-EMPTY body — normalizeText
      // filters empty bodies out of the join, so they spend no separator.
      cursor += len + 1;
    }
  }
  return ranges;
}

/**
 * Push chunk(s) covering the canonical cluster range [from, to), splitting at
 * whitespace clusters when the range exceeds MAX_CHUNK_GRAPHEMES. Split
 * points prefer the whitespace cluster nearest the budget edge — the
 * separator whitespace belongs to neither piece (words stay whole, spoken
 * text never ends/starts with a dangling space); a whitespace-free window
 * hard-cuts at the budget (a run-on unbroken span). Every chunk pushed
 * carries the caller's sentence/paragraph skip indices.
 */
function pushChunksForRange(
  clusters: readonly string[],
  from: number,
  to: number,
  out: SpeechChunk[],
  sentenceIndex: number,
  paragraphIndex: number,
): void {
  let cursor = from;
  while (cursor < to) {
    const remaining = to - cursor;
    if (remaining <= MAX_CHUNK_GRAPHEMES) {
      out.push(buildChunk(clusters, cursor, to, sentenceIndex, paragraphIndex));
      return;
    }
    // Prefer a cut just after a whitespace cluster at or before the budget
    // edge, so the spoken piece does not end mid-word.
    const budgetEdge = cursor + MAX_CHUNK_GRAPHEMES;
    let cut = -1;
    for (let i = budgetEdge - 1; i > cursor; i--) {
      if (isWhitespaceCluster(clusters[i]!)) {
        cut = i; // the whitespace itself belongs to neither piece
        break;
      }
    }
    if (cut <= cursor) {
      // No whitespace in the window — hard cut at the budget edge.
      out.push(buildChunk(clusters, cursor, budgetEdge, sentenceIndex, paragraphIndex));
      cursor = budgetEdge;
    } else {
      out.push(buildChunk(clusters, cursor, cut, sentenceIndex, paragraphIndex));
      cursor = cut + 1; // skip the separator whitespace
    }
  }
}

function isWhitespaceCluster(cluster: string): boolean {
  return /^[\t\n\f\r ]+$/.test(cluster);
}

/**
 * Build the UTF-16 code-unit index → grapheme-ordinal map for the cluster
 * range [start, end): entry u is the ordinal of the cluster owning UTF-16
 * index u, and the trailing entry is the past-the-end ordinal so an
 * end-exclusive charIndex maps cleanly. The joined clusters ARE the text,
 * so the map's length is exactly text.length + 1. Shared by the per-range
 * maps and each per-chunk map.
 */
function buildUtf16ToGraphemeMap(
  clusters: readonly string[],
  start: number,
  end: number,
): number[] {
  let totalUnits = 0;
  for (let i = start; i < end; i++) totalUnits += clusters[i]!.length;
  const map = new Array<number>(totalUnits + 1);
  let u16 = 0;
  for (let g = 0; g < end - start; g++) {
    const len = clusters[start + g]!.length;
    for (let k = 0; k < len; k++) {
      map[u16 + k] = g;
    }
    u16 += len;
  }
  map[totalUnits] = end - start;
  return map;
}

/** Build one chunk covering [start, end): the spoken text and its per-chunk
 * UTF-16 → chunk-grapheme map. The text is exactly clusters[start..end)
 * joined, so segmenting it reproduces those clusters one-for-one. */
function buildChunk(
  clusters: readonly string[],
  start: number,
  end: number,
  sentenceIndex: number,
  paragraphIndex: number,
): SpeechChunk {
  const text = clusters.slice(start, end).join("");
  const utf16ToGrapheme = buildUtf16ToGraphemeMap(clusters, start, end);
  return { text, startGrapheme: start, endGrapheme: end, utf16ToGrapheme, sentenceIndex, paragraphIndex };
}
