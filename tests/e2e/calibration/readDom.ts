// tests/e2e/calibration/readDom.ts
// DOM-truth readers for the calibration harness. These read RENDERED browser
// geometry (Pretext prediction correctness is proven against this — jsdom
// cannot substitute; Pitfall 2).
//
// `getBoundingClientRect().height` returns fractional pixels (border-box).
// `Range.getClientRects()` on a Range over an element's text nodes returns
// ONE DOMRect PER CSS LINE BOX (MDN: "the rectangles returned for a Range
// that doesn't contain any block-level element are the bounding rectangles
// of the fragments of inline elements inside it"). We use Range + getClientRects
// rather than injecting a `<span class="measure-ref">` wrapper so the
// harness never mutates the rendered tree (Range is read-only — RESEARCH
// §Code Examples L491–517).
//
// Sources (MDN, verified 2026-08-04 per RESEARCH §Sources):
//   - developer.mozilla.org/Web/API/Element/getBoundingClientRect
//   - developer.mozilla.org/Web/API/Element/getClientRects
//   - developer.mozilla.org/Web/API/Range

import type { Page } from "@playwright/test";

/**
 * Read a rendered block's fractional border-box height via
 * `getBoundingClientRect().height` (RESEARCH §State of the Art — never
 * integer offsetHeight; sub-pixel drift breaks calibration).
 *
 * @param page the Playwright Page
 * @param selector a CSS selector that resolves to exactly one block element
 */
export async function readRenderedBlockHeight(
  page: Page,
  selector: string,
): Promise<number> {
  return await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) throw new Error(`readRenderedBlockHeight: no element for ${sel}`);
    return el.getBoundingClientRect().height;
  }, selector);
}

/**
 * Read a rendered block's line count by constructing a Range over its text
 * nodes and counting DOMRects (one per CSS line box — MDN Range).
 *
 * Falls back to `Math.round(height / computedLineHeight)` if the Range
 * yields zero rects (e.g. an element with no text content). The fallback
 * is integer-rounded and therefore less precise; the harness records the
 * fallback path so the fingerprint can note it.
 *
 * Returns `{ lineCount, usedFallback }` so callers can record the precision.
 */
export async function readRenderedLineCount(
  page: Page,
  selector: string,
): Promise<{ lineCount: number; usedFallback: boolean }> {
  return await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) throw new Error(`readRenderedLineCount: no element for ${sel}`);
    // Range over the element's subtree — one DOMRect per CSS line box.
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = range.getClientRects();
    if (rects.length > 0) {
      return { lineCount: rects.length, usedFallback: false };
    }
    // Fallback: derive from height / computed line-height. Integer-rounded;
    // less precise but still useful for blocks with no inline content.
    const cs = getComputedStyle(el);
    const lhRaw = cs.lineHeight;
    const lh = parseFloat(lhRaw);
    const height = el.getBoundingClientRect().height;
    if (lh > 0 && lhRaw !== "normal") {
      return { lineCount: Math.round(height / lh), usedFallback: true };
    }
    return { lineCount: 1, usedFallback: true };
  }, selector);
}
