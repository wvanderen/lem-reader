// src/readaloud/chunks.ts
// Issue #40 — sentence-chunked utterances over the D-05 substrate (spike 0009
// F2 + F5). ONE pure function turns a canonical article into the ordered
// utterance queue: each chunk carries the utterance text AND the canonical
// article-global grapheme range it covers, plus the UTF-16 → grapheme map the
// engine uses to translate boundary charIndexes (spike 0009 F5 — charIndex is
// ephemeral UTF-16 into the utterance's own text; canonical grapheme offsets
// are the only durable currency).
//
// Pure domain logic — no DOM, no speech APIs, no React. jsdom-safe.

import type { CanonicalArticle } from "../content/types";
import { articleGraphemeIndex } from "../content/normalizeText";

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
}

/**
 * Safety budget per utterance (graphemes). Sentence segmentation alone can
 * produce pathological "sentences" (un-punctuated code blocks, run-on
 * transcripts); the spec's own ceiling is 32,767 characters and Chrome's
 * Google voices cut long utterances at ~14 s (spike 0009 §2.3). 250 graphemes
 * is several normal sentences' worth of headroom under both.
 */
export const MAX_CHUNK_GRAPHEMES = 250;

/**
 * Chunk the article's normalized text into sentence-sized utterances.
 *
 * - Sentence boundaries come from Intl.Segmenter (sentence granularity, the
 *   article's own lang) over normalizeText — the SAME canonical string every
 *   other consumer addresses.
 * - Whitespace-only segments (the BLOCK_SEPARATOR runs) are skipped — nothing
 *   to speak, nothing to track.
 * - Segments over MAX_CHUNK_GRAPHEMES are split at whitespace-cluster
 *   boundaries (hard cut only if a window has no whitespace — code blocks).
 *
 * Offsets stay canonical end-to-end: a chunk's [startGrapheme, endGrapheme)
 * range is exact against the article's cluster array regardless of splitting.
 */
export function chunkArticleForSpeech(article: CanonicalArticle): SpeechChunk[] {
  const index = articleGraphemeIndex(article);
  const clusters = index.clusters;
  if (clusters.length === 0) return [];

  // UTF-16 code-unit index → canonical grapheme ordinal, over the WHOLE
  // normalized text (one walk; chunk ranges then read straight off it).
  const utf16ToCanonical = new Array<number>(index.normalizedText.length + 1);
  let u16 = 0;
  for (let g = 0; g < clusters.length; g++) {
    const len = clusters[g]!.length;
    for (let k = 0; k < len; k++) {
      utf16ToCanonical[u16 + k] = g;
    }
    u16 += len;
  }
  utf16ToCanonical[index.normalizedText.length] = clusters.length;

  const chunks: SpeechChunk[] = [];
  const sentenceSegmenter = new Intl.Segmenter(article.lang, {
    granularity: "sentence",
  });
  for (const segment of sentenceSegmenter.segment(index.normalizedText)) {
    const rawStart = utf16ToCanonical[segment.index];
    const rawEnd = utf16ToCanonical[segment.index + segment.segment.length];
    if (rawStart === undefined || rawEnd === undefined) continue; // defensive
    if (rawEnd <= rawStart) continue;
    // Trim the segment's canonical range to its non-whitespace clusters:
    // sentence segments carry the trailing space (and the block separator
    // when one follows), which no utterance needs to speak.
    let start = rawStart;
    let end = rawEnd;
    while (start < end && isWhitespaceCluster(clusters[start]!)) start++;
    while (end > start && isWhitespaceCluster(clusters[end - 1]!)) end--;
    if (end <= start) continue; // whitespace-only segment (separators)
    pushChunksForRange(clusters, start, end, chunks);
  }
  return chunks;
}

/**
 * Push chunk(s) covering the canonical cluster range [from, to), splitting at
 * whitespace clusters when the range exceeds MAX_CHUNK_GRAPHEMES. Split
 * points prefer the whitespace cluster nearest the budget edge — the
 * separator whitespace belongs to neither piece (words stay whole, spoken
 * text never ends/starts with a dangling space); a whitespace-free window
 * hard-cuts at the budget (code-block sources are verbatim and may have
 * none).
 */
function pushChunksForRange(
  clusters: readonly string[],
  from: number,
  to: number,
  out: SpeechChunk[],
): void {
  let cursor = from;
  while (cursor < to) {
    const remaining = to - cursor;
    if (remaining <= MAX_CHUNK_GRAPHEMES) {
      out.push(buildChunk(clusters, cursor, to));
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
      out.push(buildChunk(clusters, cursor, budgetEdge));
      cursor = budgetEdge;
    } else {
      out.push(buildChunk(clusters, cursor, cut));
      cursor = cut + 1; // skip the separator whitespace
    }
  }
}

function isWhitespaceCluster(cluster: string): boolean {
  return /^[\t\n\f\r ]+$/.test(cluster);
}

/** Build one chunk covering [start, end): the spoken text and its per-chunk
 * UTF-16 → chunk-grapheme map. The text is exactly clusters[start..end)
 * joined, so segmenting it reproduces those clusters one-for-one. */
function buildChunk(
  clusters: readonly string[],
  start: number,
  end: number,
): SpeechChunk {
  const text = clusters.slice(start, end).join("");
  const utf16ToGrapheme = new Array<number>(text.length + 1);
  let u16 = 0;
  for (let g = 0; g < end - start; g++) {
    const len = clusters[start + g]!.length;
    for (let k = 0; k < len; k++) {
      utf16ToGrapheme[u16 + k] = g;
    }
    u16 += len;
  }
  utf16ToGrapheme[text.length] = end - start;
  return { text, startGrapheme: start, endGrapheme: end, utf16ToGrapheme };
}
