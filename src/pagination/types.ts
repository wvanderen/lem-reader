// src/pagination/types.ts
// Zod-at-boundary source of truth for the Phase 4 pagination domain (mirrors
// src/measurement/types.ts discipline). These schemas flow from the pure
// pagination engine into the paginated renderer + the PAGE-09 fallback UI,
// so every contract is a Zod schema and inferred TS types are the single
// source of truth (never hand-write a parallel type for these shapes).
//
// Locked decisions honored here:
//   - D4-01: booklike flow — split at line boundaries with source offsets
//            preserved at every split (D-05 round-trip).
//   - D4-02: atomic set = figure + heading + code-block + footnote-reference
//            + unsupported; splitting set = paragraph + list-item contents +
//            blockquote children.
//   - D-05:  grapheme-offset substrate is the ONLY durable passage identity;
//            page numbers are informational, never persisted/bookmarked.
//
// V5 (Input Validation): the FragmentationResult contract is consumed by the
// renderer. An unvalidated shape is an injection surface; the engine emits a
// Zod-validated FragmentationResult and the renderer treats it as trusted.
// (Persisting derived page boundaries is FORBIDDEN per STACK.md — these
// schemas describe an ephemeral compute result, never a persisted row.)
//
// `import type` is mandatory for any cross-module type ref under tsconfig
// `verbatimModuleSyntax: true`. This module has no cross-module type refs —
// it is the leaf contract.
import { z } from "zod";

// ── PageFragment: one page's worth of source-range slices ───────────────────
// Each entry in `blocks` is a half-open [startGrapheme, endGrapheme) slice
// over a single block's intra-block normalized text. blockIndex is the index
// into article.blocks (canonical order). Concatenating every fragment's
// slices in page order MUST cover [0, graphemeLength(article)) exactly once
// with no gaps or overlaps (PAGE-03 exactly-once + canonical order).
//
// The offsets are INTRA-block grapheme ordinals (0 = block start), NOT
// article-global offsets. The caller derives article-global offsets by
// accumulating per-block grapheme lengths + BLOCK_SEPARATOR between blocks
// (the same accumulation normalizeText(article) performs). This keeps the
// contract stable when one block's text changes without shifting every
// fragment's offsets.
//
// schemaVersion: z.literal(1) — Phase 5+ can evolve the contract (e.g. add
// per-block line-box evidence) without retrofitting Phase 4 emit sites.

export const PageFragmentSchema = z.object({
  schemaVersion: z.literal(1),
  pageIndex: z.number().int().min(0),
  blocks: z.array(
    z.object({
      blockIndex: z.number().int().min(0),
      startGrapheme: z.number().int().min(0),
      endGrapheme: z.number().int().min(0),
    }),
  ),
});
export type PageFragment = z.infer<typeof PageFragmentSchema>;

// ── FragmentationResult: the engine's compute output ────────────────────────
// status "ok"     — pages[] is a valid exactly-once cover of the article.
// status "fallback" — the engine hit a termination guard (oversize block,
//                    300-page ceiling, or zero-progress stall); pages[] is
//                    empty and the caller MUST fall back to scrolling at the
//                    same D-05 passage (PAGE-04). `reason` carries the
//                    guard that tripped for diagnostics.
//
// schemaVersion: z.literal(1) — PAGE-09 surfacing can evolve without
// retrofitting emit sites.

export const FragmentationResultSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.enum(["ok", "fallback"]),
  pages: z.array(PageFragmentSchema),
  reason: z.string().optional(),
});
export type FragmentationResult = z.infer<typeof FragmentationResultSchema>;

// ── LineBox: one CSS line box inside a block's text node ────────────────────
// The DOM read-phase (lineBoxes.ts) walks character offsets over the block's
// first text node and records one LineBox per CSS line box that Range
// .getClientRects() reports. charOffset is a UTF-16 code-unit offset into
// the block's text node (the coordinate Range.setStart/setEnd natively
// accepts); map it to a D-05 grapheme ordinal via charOffsetToGrapheme.
//
// topPx/bottomPx are FRACTIONAL (DOMRect values — never rounded; RESEARCH
// §State of the Art). The widow rules compare rounded tops to detect a new
// line, but preserve fractional values for height arithmetic.

export interface LineBox {
  /** UTF-16 code-unit offset into the block's text node where this line begins. */
  charOffset: number;
  /** Fractional top (px) of this line box from Range.getClientRects(). */
  topPx: number;
  /** Fractional bottom (px) of this line box from Range.getClientRects(). */
  bottomPx: number;
}

// ── SplitDecision: per-kind fragmentation classification (D4-02) ────────────
// splitBlock.ts classifies each BlockKind via an exhaustive switch (Pattern F,
// no default — TS flags missing cases). Atomic kinds NEVER split (move whole
// to the next page if they do not fit); splitting kinds MAY split when the
// page boundary falls inside them.
//
// This is the CLASSIFICATION only — kind → atomic-vs-split. The resolved
// split offset (the actual grapheme boundary) is computed by the orchestrator
// (src/pagination/fragment.ts) using line boxes + widow rules, NOT by the
// classifier. Keeping the offset out of this type lets classifyBlock stay a
// pure function of block.kind (no page geometry or DOM dependency).

export type SplitDecision =
  | { kind: "atomic" }
  | { kind: "split" };
