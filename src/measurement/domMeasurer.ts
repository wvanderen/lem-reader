// src/measurement/domMeasurer.ts
// DOM-measurement strategy shared by every block kind in Plan 01 (Plan 02
// adds the calibrated Pretext fast path for paragraph + heading kinds).
// Reuses the EXACT block selector from src/reader/useScrollSave.ts L98–100
// so domMeasurer reads what BlockRenderer emitted — no forked selector.
//
// RESEARCH §State of the Art + §Common Pitfalls 2 (layout thrash):
//   - Read FRACTIONAL pixels via getBoundingClientRect().height — integer
//     offsetHeight/scrollHeight hides sub-pixel drift that breaks
//     calibration (RESEARCH §Common Pitfalls 4 — stale-result-wins is
//     downstream of a measurement the engine couldn't tell was wrong).
//   - Per-line count via Element.getClientRects().length (MDN: one DOMRect
//     per CSS line box). New usage in the codebase (grep-verified in
//     03-PATTERNS.md — no existing getClientRects call).
//   - BATCH every read before ANY state write (Pitfall 2 — read-phase
//     isolation). This function never mutates the DOM.
//   - Check signal.aborted between blocks and throw AbortError if a newer
//     trigger cancelled this pass (composes with the epoch guard).
//
// Tag-name → kind map mirrors src/content/render/BlockRenderer.tsx output:
//   h1..h6 → "heading", p → "paragraph", blockquote → "blockquote",
//   li (parent ul) → "bulleted-list", li (parent ol) → "numbered-list",
//   figure → "figure", pre → "code-block", sup → "footnote-reference",
//   details → "unsupported".

import type { BlockMeasurement } from "./types";
import { AbortError } from "./fontGate";

/**
 * The exact block selector reused verbatim from useScrollSave L99 +
 * ArticleView L53. If this list ever drifts from those sites, save/restore/
 * measurement would read different elements — keep it byte-identical.
 */
const BLOCK_SELECTOR = "h2, h3, h4, p, blockquote, li, pre, figure, sup, details";

/**
 * Map a rendered element's tag name to its measurement kind string. Mirrors
 * BlockRenderer's emitted elements (h1..h6/p/blockquote/li/figure/pre/sup/
 * details). `li` disambiguates bulleted vs numbered via its parent list.
 */
function kindForElement(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return "heading";
    case "p":
      return "paragraph";
    case "blockquote":
      return "blockquote";
    case "li": {
      const parent = el.parentElement;
      if (parent?.tagName.toLowerCase() === "ol") return "numbered-list";
      return "bulleted-list";
    }
    case "figure":
      return "figure";
    case "pre":
      return "code-block";
    case "sup":
      return "footnote-reference";
    case "details":
      return "unsupported";
    default:
      return tag;
  }
}

/**
 * Measure every rendered block in a single read-phase. Returns fractional
 * heights + per-line counts. Aborts mid-pass (via AbortError) if `signal`
 * fires — the engine treats AbortError as a silent cancel.
 *
 * @param articleEl The rendered <article> element (from ArticleView's
 *   callback-ref seam).
 * @param signal The current epoch's AbortSignal; checked between blocks so
 *   a newer trigger cancels a long measurement.
 */
export function measureAllBlocks(
  articleEl: HTMLElement,
  signal: AbortSignal,
): BlockMeasurement[] {
  // queryBlocks — single DOM read at pass start (Pitfall 2: batch reads).
  const elements = Array.from(
    articleEl.querySelectorAll<HTMLElement>(BLOCK_SELECTOR),
  );
  const out: BlockMeasurement[] = [];
  for (const el of elements) {
    if (signal.aborted) throw new AbortError();
    // Per-block: read rect (fractional height) + line boxes (DOMRect count)
    // in tight succession, no interleaved writes (Pitfall 2 read-phase).
    const rect = el.getBoundingClientRect();
    const lineCount = el.getClientRects().length;
    out.push({
      kind: kindForElement(el),
      heightPx: rect.height,
      lineCount,
    });
  }
  return out;
}
