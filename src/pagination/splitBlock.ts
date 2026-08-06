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
  graphemeClusters,
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
 * Per-block grapheme length in the renderer's coordinate system.
 *
 * Equivalent to `graphemeClusters(splittingBlockText(block), lang).length`
 * but slightly cheaper (no intermediate string allocation). Mirrors the
 * private `splittingBlockGraphemeLength` in fragmentRenderer.tsx so the
 * engine, the renderer, and the DEV debug hook all agree on per-block
 * length for whole-vs-subrange detection.
 *
 * Plan 04-06: used by PaginatedSurface's publishDev hook so the e2e
 * coverage-invariant spec sees the SAME blockLen the engine emits
 * endGrapheme against.
 */
export function splittingGraphemeLength(block: Block, lang: string): number {
  return graphemeClusters(splittingBlockText(block), lang).length;
}

/**
 * Compute a splitting-kind block's intra-block text in the renderer's
 * coordinate system (Plan 04-06 Task 3).
 *
 * This is the source-of-truth text the pagination engine + the fragment
 * renderer share:
 *   - paragraphs/headings → concatenated run texts WITHOUT separators
 *     (matches DOM textContent for clean ASCII where adjacent runs are
 *     whitespace-separated in source HTML)
 *   - blockquote → recursive child texts joined by BLOCK_SEPARATOR
 *   - bulleted-list / numbered-list → per-item content texts joined by
 *     BLOCK_SEPARATOR, items joined by BLOCK_SEPARATOR
 *   - figure → alt + caption text joined by BLOCK_SEPARATOR (no separators
 *     inside an inline-run caption)
 *   - code-block → block.source (verbatim)
 *   - footnote-reference → block.marker
 *   - unsupported → block.plainDescription
 *
 * The grapheme length of this text equals what the renderer's (private)
 * `splittingBlockGraphemeLength` computes for whole-vs-subrange detection.
 * Keeping the engine + renderer on the SAME text coordinate prevents
 * Pitfall 3 normalization drift between split math (engine) and slicing
 * math (renderer).
 *
 * NOTE: this is NOT the D-05 substrate text (normalizeText uses
 * `inlineText` which joins runs with " "). The D-05 substrate is for
 * persisted locations/annotations; the pagination-engine coordinate is a
 * SEPARATE, internal-only coordinate that must round-trip through the
 * renderer's slicing helpers. Persisting engine offsets directly would
 * corrupt saved locations — PAGE-03 offsets are ephemeral.
 */
export function splittingBlockText(block: Block): string {
  switch (block.kind) {
    case "heading":
    case "paragraph":
      // Concatenated run texts WITHOUT separators — matches the renderer's
      // per-run grapheme summing (splitParagraphRuns walks runs without
      // inserting separators) AND aligns with DOM textContent for ASCII.
      return block.content.map((r) => r.text).join("");
    case "blockquote":
      return block.children.map(splittingBlockText).join(BLOCK_SEPARATOR);
    case "bulleted-list":
    case "numbered-list":
      return block.items
        .map((item) => item.content.map(splittingBlockText).join(BLOCK_SEPARATOR))
        .join(BLOCK_SEPARATOR);
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
 * Split a paragraph's inline-run array at a grapheme offset, preserving
 * every inline mark (link/code/strong/em) on BOTH slices per Pitfall 4.
 *
 * Walks the runs accumulating per-run grapheme count via
 * `graphemeClusters(run.text, lang)`. When the accumulated count crosses
 * `splitAtGrapheme`, the boundary run is sliced at the intra-run grapheme
 * offset; BOTH halves inherit the boundary run's `marks` array verbatim
 * — a link run split mid-text becomes two link runs with the same href.
 *
 * The `before` slice covers runs contributing graphemes [0, splitAtGrapheme);
 * the `after` slice covers [splitAtGrapheme, total). Either slice may be
 * empty (e.g. splitAtGrapheme === 0 yields before = []; splitAtGrapheme >=
 * total yields after = []). Empty-text runs are dropped (InlineRun.text
 * must be a non-empty string per the schema — slicing may produce zero-
 * length text on the boundary, which we omit to keep the runs schema-valid).
 *
 * The D-05 round-trip integrity depends on this: the concatenated text of
 * `before` + `after` equals the concatenated text of the input runs, and
 * marks survive so a sliced link still renders as an anchor on each side.
 *
 * @param runs             InlineRun[] (typically ParagraphBlock.content).
 * @param splitAtGrapheme  Intra-block grapheme offset where the split lands.
 * @param lang             BCP-47 locale for Intl.Segmenter grapheme walking.
 */
export function splitParagraphRuns(
  runs: readonly InlineRun[],
  splitAtGrapheme: number,
  lang: string,
): { before: InlineRun[]; after: InlineRun[] } {
  const before: InlineRun[] = [];
  const after: InlineRun[] = [];
  let consumed = 0;
  for (const run of runs) {
    const runGraphemeLen = graphemeClusters(run.text, lang).length;
    const runEnd = consumed + runGraphemeLen;
    if (runEnd <= splitAtGrapheme) {
      // Entirely before the split — clone the run (marks array copied by
      // reference; the renderer treats marks as read-only metadata).
      before.push({ text: run.text, marks: run.marks });
    } else if (consumed >= splitAtGrapheme) {
      // Entirely after the split.
      after.push({ text: run.text, marks: run.marks });
    } else {
      // Boundary run — slice its text at the intra-run grapheme offset.
      // Both halves inherit the run's marks verbatim (Pitfall 4).
      const intraOffset = splitAtGrapheme - consumed;
      const clusters = graphemeClusters(run.text, lang);
      const beforeText = clusters.slice(0, intraOffset).join("");
      const afterText = clusters.slice(intraOffset).join("");
      if (beforeText.length > 0) {
        before.push({ text: beforeText, marks: run.marks });
      }
      if (afterText.length > 0) {
        after.push({ text: afterText, marks: run.marks });
      }
    }
    consumed = runEnd;
  }
  return { before, after };
}
