// src/pagination/splitBlock.ts
// Per-kind fragmentation policy (D4-02) + inline-run splitting primitive
// (D4-01 booklike splitting, Pitfall 4 — marks preserved across splits).
//
// Pure domain logic — operates on the Block model (src/content/types) and
// the D-05 grapheme substrate (src/content/normalizeText). NO React, NO
// DOM reads. The orchestrator (src/pagination/fragment.ts) consumes these
// helpers; the fragment renderer (Plan 03) consumes splitParagraphRuns to
// slice blocks at render time.
//
// D4-02 atomic/splitting classification:
//   atomic    = figure + heading + code-block + footnote-reference
//               + unsupported  (move whole to the next page if it doesn't fit)
//   splitting = paragraph + blockquote + bulleted-list + numbered-list
//               (may be split at a line boundary when the page boundary
//               falls inside the block)
//
// BlockKind (src/measurement/engine.ts:63-72) is the canonical union of
// the 9 block-kind string literals. We import it as the canonical
// reference — NEVER maintain a parallel declaration (Pitfall: parallel
// union drifts; TS would let a missing case pass at compile time).
// Block["kind"] from src/content/schema.ts has STRUCTURALLY IDENTICAL
// literals; the type assertion below enforces this at compile time so a
// future schema change cannot drift silently.
//
// Pattern F: every switch is exhaustive with NO default branch. TS flags
// a missing case at compile time. ESLint/TSC verify no `default:` appears
// inside any switch under src/pagination/.

import type { BlockKind } from "../measurement/engine";
import type { Block, InlineRun } from "../content/types";
import type { SplitDecision } from "./types";
import {
  BLOCK_SEPARATOR,
  buildRawToNormMap,
  graphemeClusters,
  normalizeRunText,
} from "../content/normalizeText";

// Compile-time guarantee: Block.kind literals match BlockKind exactly. If
// either union drifts (a kind added to one but not the other), this line
// fails to compile — surfacing the divergence at the type-check step
// rather than letting a missing switch case pass silently.
type _AssertBlockKindMatchesCanonical = Block["kind"] extends BlockKind
  ? BlockKind extends Block["kind"]
    ? true
    : never
  : never;
const _blockKindAssertion: _AssertBlockKindMatchesCanonical = true;
void _blockKindAssertion;

/**
 * The block's raw concatenated text — the DOM textContent projection.
 *
 * Spike 0007 F2 reconciliation: there is ONE text coordinate (the D-05
 * normalized text, blockNormalizedText). This helper exists ONLY as the raw
 * counterpart the pagination engine needs to convert DOM line-box char
 * offsets (UTF-16 ordinals over the rendered text nodes, which concatenate
 * run texts verbatim with no separators and no whitespace collapsing) into
 * D-05 grapheme ordinals via the shared buildRawToNormMap bridge.
 *
 * Mirrors the DOM structure the renderer emits: leaf runs contribute their
 * text verbatim; container children/items concatenate with NOTHING between
 * them (adjacent elements contribute no text nodes). Code-block source is
 * verbatim (raw == norm there by contract). Figures project alt + caption —
 * unused in practice (figures are D4-02 atomic and never split).
 */
export function blockRawText(block: Block): string {
  switch (block.kind) {
    case "heading":
    case "paragraph":
      return block.content.map((r) => r.text).join("");
    case "blockquote":
      return block.children.map(blockRawText).join("");
    case "bulleted-list":
    case "numbered-list":
      return block.items.map((item) => item.content.map(blockRawText).join("")).join("");
    case "figure": {
      const captionText = block.caption.map((r) => r.text).join("");
      return [block.alt, captionText].filter(Boolean).join(BLOCK_SEPARATOR);
    }
    case "code-block":
      return block.source;
    case "footnote-reference":
      return block.marker;
    case "unsupported":
      return block.plainDescription;
  }
}

/**
 * Classify a block as atomic or splitting per D4-02.
 *
 * Exhaustive switch over `block.kind` — NO default (Pattern F). The case
 * set covers all 9 BlockKind literals; TS narrows the return type so the
 * caller can branch on `decision.kind` without a fallback path.
 *
 * The atomic set (figure, heading, code-block, footnote-reference,
 * unsupported) NEVER splits: if the block does not fit on the current
 * page, the orchestrator moves it whole to the next page (subject to the
 * 75% oversize fallback per PAGE-04).
 *
 * The splitting set (paragraph, blockquote, bulleted-list,
 * numbered-list) carries a split decision; the orchestrator chooses the
 * actual split offset using line boxes + widow rules. (Container kinds —
 * blockquote, bulleted-list, numbered-list — split recursively in Plan
 * 03's fragment renderer; the engine produces the source ranges, the
 * renderer slices the model.)
 */
export function classifyBlock(block: Block): SplitDecision {
  switch (block.kind) {
    case "heading":
    case "figure":
    case "code-block":
    case "footnote-reference":
    case "unsupported":
      return { kind: "atomic" };
    case "paragraph":
    case "blockquote":
    case "bulleted-list":
    case "numbered-list":
      return { kind: "split" };
  }
}

/**
 * The D-05 stream length of an inline-run array: the grapheme count of the
 * block's normalized text contribution (normalizeRunText per run, empties
 * dropped, non-empty runs joined with " " — the inlineText join rule).
 *
 * Grapheme clusters never span the inserted single-space separator, so the
 * count is the sum of per-contribution cluster counts plus one separator per
 * adjacent contribution pair — identical to segmenting the joined string.
 *
 * Spike 0007 F2 reconciliation: this — NOT the raw per-run sum — is the
 * length sliceRunsForHighlights clamps intersections against and the
 * pagination engine emits endGrapheme against. One coordinate everywhere:
 * highlight positions (stored D-05 offsets), split points, and run slicing
 * now address the same stream, so marks stay aligned across wrap and reflow.
 */
export function inlineStreamGraphemeLength(runs: readonly InlineRun[], lang: string): number {
  let len = 0;
  let contributing = 0;
  for (const run of runs) {
    const normLen = runClusters(run, lang).norm.length;
    if (normLen === 0) continue;
    len += normLen + (contributing > 0 ? 1 : 0);
    contributing++;
  }
  return len;
}

// ── Per-run cluster cache (issue #233) ──────────────────────────────────
// A giant-prose block's run text can be hundreds of thousands of graphemes;
// pagination + projection slice it PER PAGE. Canonical article runs are
// immutable once parsed, so each run object's raw/norm cluster arrays (and
// the shared raw↔norm bridge map) are computed once and reused — the same
// WeakMap-with-article-object discipline as articleGraphemeIndex. Without
// this, every page render re-segmented the whole run (O(block) per turn).
interface RunClusters {
  lang: string;
  /** graphemeClusters(run.text) — the DOM raw stream. */
  raw: string[];
  /** graphemeClusters(normalizeRunText(run.text)) — the D-05 contribution. */
  norm: string[];
  /** Raw grapheme boundary → UTF-16 boundary, including the exclusive end. */
  rawUtf16: number[];
  /** The shared buildRawToNormMap bridge over (raw, norm). */
  map: number[];
}

const runClusterCache = new WeakMap<InlineRun, RunClusters>();

function runClusters(run: InlineRun, lang: string): RunClusters {
  const hit = runClusterCache.get(run);
  if (hit && hit.lang === lang) return hit;
  const norm = normalizeRunText(run.text);
  const rawClusters = graphemeClusters(run.text, lang);
  const normClusters = graphemeClusters(norm, lang);
  const rawUtf16 = [0];
  for (const cluster of rawClusters) {
    rawUtf16.push(rawUtf16.at(-1)! + cluster.length);
  }
  const value: RunClusters = {
    lang,
    raw: rawClusters,
    norm: normClusters,
    rawUtf16,
    map: buildRawToNormMap(rawClusters, normClusters),
  };
  runClusterCache.set(run, value);
  return value;
}

/**
 * Split an inline-run array at an intra-block D-05 grapheme offset,
 * preserving every inline mark (link/code/strong/em) on BOTH slices per
 * Pitfall 4.
 *
 * Spike 0007 F2 reconciliation — the walk consumes the D-05 STREAM, the same
 * coordinate every other consumer addresses: each run contributes its
 * normalized text (normalizeRunText), empty contributions drop out, and
 * adjacent contributions are joined by a single " " separator (the
 * inlineText rule — the whitespace-neutral join that makes slicing stable
 * across wrap and reflow). The `before` slice covers stream graphemes
 * [0, splitAtGrapheme); `after` covers [splitAtGrapheme, total).
 *
 * Faithfulness rules:
 *   - Every emitted piece carries RAW run text, and before+after
 *     concatenate to EXACTLY the input run texts (no character is dropped
 *     or normalized away) — the rendered text union of any slice set is
 *     the input's rendered text, so selection/capture/screen-reader output
 *     never loses whitespace at a split.
 *   - A run cut inside (or at the end of) its contribution is sliced at
 *     the RAW cluster position the shared raw↔norm map
 *     (buildRawToNormMap) indicates for the intra-stream offset — boundary whitespace rides with the piece
 *     it lexically belongs to — and both pieces carry the run's marks
 *     verbatim (Pitfall 4).
 *   - Whitespace-only runs have no stream presence; they ride with BEFORE
 *     when the cut is at/past the next contribution's start, AFTER
 *     otherwise — so rendered text is never dropped.
 *
 * Either slice may be empty (splitAtGrapheme <= 0 → before = [];
 * splitAtGrapheme >= total → after = []). Empty-text pieces are omitted to
 * keep the runs schema-valid (InlineRun.text must be non-empty).
 *
 * The D-05 round-trip integrity depends on this: the slices' normalized
 * streams concatenate to the input's normalized stream, and marks survive
 * so a sliced link still renders as an anchor on each side.
 *
 * @param runs             InlineRun[] (typically ParagraphBlock.content).
 * @param splitAtGrapheme  Intra-block D-05 grapheme offset where the split lands.
 * @param lang             BCP-47 locale for Intl.Segmenter grapheme walking.
 */
/** The raw-cluster cut position for the intra-run norm offset `k` — the
 * ONE boundary rule (first raw cluster whose bridge maps to/past `k`),
 * shared by the partition primitive and the engine's slice-prefix rebase
 * (issue #233) so the two can never drift. */
function rawCutForNormOffset(clusters: RunClusters, k: number): number {
  let lo = 0;
  let hi = clusters.raw.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (clusters.map[mid]! < k) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** One raw UTF-16 cut rule for partitioning, projection, and line-box rebase.
 * A whitespace-only run belongs before a cut at its cursor (including equality).
 * No discarded prefix or suffix is materialized to resolve a boundary. */
function runRawCut(clusters: RunClusters, cursor: number, offset: number): number {
  const rawLength = clusters.rawUtf16.at(-1)!;
  if (clusters.norm.length === 0) return offset >= cursor ? rawLength : 0;
  if (offset <= cursor) return 0;
  if (offset > cursor + clusters.norm.length) return rawLength;
  return clusters.rawUtf16[rawCutForNormOffset(clusters, offset - cursor)]!;
}

export function splitParagraphRuns(
  runs: readonly InlineRun[],
  splitAtGrapheme: number,
  lang: string,
): { before: InlineRun[]; after: InlineRun[] } {
  const before: InlineRun[] = [];
  const after: InlineRun[] = [];
  let cursor = 0;
  for (const run of runs) {
    const clusters = runClusters(run, lang);
    const cut = runRawCut(clusters, cursor, splitAtGrapheme);
    if (cut > 0) before.push({ text: run.text.slice(0, cut), marks: run.marks });
    if (cut < run.text.length) after.push({ text: run.text.slice(cut), marks: run.marks });
    if (clusters.norm.length > 0) cursor += clusters.norm.length + 1;
  }
  return { before, after };
}

/**
 * The paragraph's InlineRun[] slice for the intra-block [startGrapheme,
 * endGrapheme) D-05 range — the ONE block-projection primitive shared by
 * the paginated fragment renderer (page entries) and the windowed
 * measurement projection (issue #233's bounded window heads/tails).
 *
 * Resolve BOTH boundaries against the original runs' cached raw↔norm
 * bridge, then materialize only the requested raw interval. In particular,
 * never build a [0, end) intermediate run: late pages would re-segment that
 * discarded prefix on every render. Marks stay attached to their source
 * run; edge separator graphemes render in no piece.
 *
 * Callers only invoke this for kinds with a split semantic (paragraphs for
 * issue #233); whole-range calls return the source runs unchanged.
 */
export function splitParagraphBlock(
  block: Block,
  startGrapheme: number,
  endGrapheme: number,
  lang: string,
): Block {
  const paragraphBlock = block as Extract<Block, { kind: "paragraph" }>;
  const originalLen = inlineStreamGraphemeLength(paragraphBlock.content, lang);
  if (startGrapheme <= 0 && endGrapheme >= originalLen) return block;
  const content: InlineRun[] = [];
  let cursor = 0;
  for (const run of paragraphBlock.content) {
    const clusters = runClusters(run, lang);
    // At source boundaries retain leading/trailing raw whitespace just as
    // a whole block does; internal cuts share the partition rule.
    const start = startGrapheme <= 0 ? 0 : runRawCut(clusters, cursor, startGrapheme);
    const end =
      endGrapheme >= originalLen ? run.text.length : runRawCut(clusters, cursor, endGrapheme);
    if (end > start) {
      content.push(
        start === 0 && end === run.text.length
          ? run
          : { text: run.text.slice(start, end), marks: run.marks },
      );
    }
    if (clusters.norm.length > 0) cursor += clusters.norm.length + 1;
  }
  return { kind: "paragraph", content };
}

/**
 * The UTF-16 raw prefix a projection rendered away for the intra-block
 * D-05 window starting at `startGrapheme`: the raw position where
 * {@link splitParagraphRuns}(runs, startGrapheme).after begins in the
 * concatenated raw run text. Walks the SAME per-run clusters and cut rule
 * the partition primitive uses (cached — issue #233), so the pagination
 * engine can rebase slice-local line-box charOffsets onto whole-block raw
 * coordinates with byte-identical cuts and no whole-block re-segmentation.
 *
 * Whitespace-only runs ride exactly per the partition rule (before when
 * the cut sits at/past the next contribution's start, after otherwise), so
 * the prefix always matches the rendered slice's first raw character.
 */
export function rawPrefixUtf16ForNormOffset(
  runs: readonly InlineRun[],
  startGrapheme: number,
  lang: string,
): number {
  let prefix = 0;
  let cursor = 0;
  for (const run of runs) {
    const clusters = runClusters(run, lang);
    const cut = runRawCut(clusters, cursor, startGrapheme);
    prefix += cut;
    if (cut < run.text.length) return prefix;
    if (clusters.norm.length > 0) cursor += clusters.norm.length + 1;
  }
  return prefix;
}

/**
 * Convert a whole-block RAW UTF-16 offset (the concatenated run text — the
 * coordinate the rebased line-box charOffsets address) into a D-05 norm
 * grapheme ordinal, walking per-run cached clusters (issue #233 — never a
 * whole-block re-segmentation). Mirrors charOffsetToGrapheme over the
 * concatenation followed by the shared raw↔norm bridge: cluster ordinals
 * at run boundaries and separator graphemes resolve identically, and
 * end-of-text returns the norm length (the exclusive-end convention).
 */
export function charOffsetToNormGrapheme(
  runs: readonly InlineRun[],
  charOffset: number,
  lang: string,
): number {
  let rawStart = 0;
  let normStart = 0;
  let normEnd = 0;
  for (const run of runs) {
    const clusters = runClusters(run, lang);
    const rawLen = run.text.length;
    if (charOffset < rawStart + rawLen || run === runs.at(-1)) {
      // A trailing whitespace-only run contributes neither text nor another
      // canonical separator. Its exclusive end is the last contribution's end.
      if (run === runs.at(-1) && clusters.norm.length === 0) return normEnd;
      const local = charOffset - rawStart;
      let lo = 0;
      let hi = clusters.raw.length;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (clusters.rawUtf16[mid + 1]! <= local) lo = mid + 1;
        else hi = mid;
      }
      return normStart + clusters.map[lo]!;
    }
    rawStart += rawLen;
    if (clusters.norm.length > 0) {
      normStart += clusters.norm.length + 1; // +1: the " " run join separator
      normEnd = normStart - 1;
    }
  }
  // Past the end of text — the exclusive-end convention.
  return normEnd;
}
