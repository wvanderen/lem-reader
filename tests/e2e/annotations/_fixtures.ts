// tests/e2e/annotations/_fixtures.ts
// Phase 5 Plan 05-05 — shared e2e helpers for the annotation corpus matrix.
//
// Reuses (IMPORTS) the 6-fixture corpus + TypographyVariant type from the
// existing pagination matrix — does NOT fork the FIXTURES list (Plan 04-02
// precedent confirmed the corpus is the single source of truth for cross-
// phase e2e). The selection path goes through the 1:1 [data-block-index]
// ↔ article.blocks mapping (Plan 04-06) so capture works in BOTH reading
// modes against the same D-05 grapheme substrate.
//
// Coverage: every helper is mode-agnostic — it queries the VISIBLE reading
// surface (the live `.page-fragment` in paginated mode, the live
// `.article-body` in scrolling mode) and NEVER the always-mounted hidden
// `.article-body-measurement` (Plan 04-08 — user-select:none so a reader
// never accidentally selects invisible text; D5-08).
//
// Harness copied from tests/e2e/pagination/mode-switch-anchor.spec.ts:
//   - PIXEL_SVG image-stub (figure load does not race selection capture)
//   - IndexedDB deleteDatabase wipe (deterministic first-run state)
//   - hash-route navigation + h1-visible sentinel
import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";

// REUSE — the corpus is the single source of truth (Plan 04-02 precedent).
// TypographyVariant is shared across the calibration + pagination + annotation
// harnesses via this import.
import { FIXTURES } from "../pagination/fixtures-matrix";
import type { TypographyVariant } from "../calibration/fixtures-matrix";

export { FIXTURES };
export type { TypographyVariant };

export const BASE = "http://localhost:5173";

/** 1×1 SVG image stub so figure loads don't race selection/pagination. */
export const PIXEL_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';

/**
 * Wipe the IndexedDB stores so each test starts from a deterministic
 * first-run state (mirrors the pagination harness discipline). Call from
 * test.beforeEach.
 */
export async function wipeDatabase(page: Page): Promise<void> {
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: PIXEL_SVG }),
  );
  await page.goto(`${BASE}/`);
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("lem-reader");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
}

/** The two reading modes the corpus matrix iterates. */
export type ReadingMode = "paginated" | "scrolling";

/**
 * Open a fixture article and wait for the reading surface to be mounted +
 * the visible blocks to be selectable.
 *
 * In paginated mode we additionally wait for the pagination engine's DEV
 * hook (`window.__lemPagination`) so subsequent page turns + highlight
 * rendering are stable (mirrors the pagination specs' waitForPagination).
 */
export async function openArticle(
  page: Page,
  fixtureId: string,
): Promise<void> {
  await page.goto(`${BASE}/#/article/${fixtureId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Wait for a visible (selectable) block to mount in EITHER mode.
  await page.waitForFunction(
    () => {
      // The visible reading surface — NOT the always-mounted hidden
      // measurement body (Plan 04-08). In paginated mode this is the live
      // .page-fragment; in scrolling mode the live .article-body.
      const visible =
        document.querySelector(".page-fragment [data-block-index]") ??
        document.querySelector(
          ".article-body:not(.article-body-measurement) [data-block-index]",
        );
      return !!visible;
    },
    undefined,
    { timeout: 10_000 },
  );
  // In paginated mode, also wait for the engine to commit so the toolbar +
  // capture path don't race an in-flight repagination (mirrors
  // mode-switch-anchor.spec.ts waitForPagination).
  await page.waitForFunction(
    () =>
      (window as unknown as Record<string, unknown>).__lemPagination !==
      undefined,
    undefined,
    { timeout: 10_000 },
  );
  // Settle fonts + the first commit (mirrors the pagination specs' 600ms
  // settle after waitForFunction).
  await page.waitForTimeout(600);
}

/**
 * Query the visible reading surface (the live .page-fragment in paginated
 * mode, the live .article-body in scrolling mode). Excludes the always-
 * mounted hidden measurement body (Plan 04-08).
 */
export function visibleReadingSurface(page: Page): Locator {
  // .page-fragment is only mounted in paginated mode; .article-body (NOT
  // .article-body-measurement) is the scrolling surface. Both can be
  // queried; first-match wins per mode.
  return page
    .locator(".page-fragment, .article-body:not(.article-body-measurement)")
    .first();
}

/**
 * Resolve the visible block element with a given data-block-index. Returns
 * a Playwright Locator for the visible (selectable) block — used by the
 * selection helpers + assert helpers so they all share the 1:1 mapping.
 *
 * Filters out the always-mounted hidden measurement body's matching block
 * (Plan 04-08 — it carries the same data-block-index for measurement but is
 * user-select:none + aria-hidden, never the selection target). Uses the
 * CSS Selectors Level 4 `:not(.ancestor *)` form so a block is matched
 * only when it is NOT a descendant of `.article-body-measurement`.
 */
export function visibleBlock(page: Page, blockIndex: number): Locator {
  return page
    .locator(
      `[data-block-index="${blockIndex}"]:not(.article-body-measurement [data-block-index="${blockIndex}"])`,
    )
    .first();
}

/**
 * Select a grapheme range inside a visible block via a synthetic DOM Range.
 *
 * Sets window.getSelection() to a Range spanning
 * [startOffset, endOffset) inside the block. The block's text may be split
 * across multiple text nodes by inline marks (link/code/strong/em per D-04),
 * so we walk the text nodes, resolve (startNode, startOffsetInNode) +
 * (endNode, endOffsetInNode) separately, then build a cross-node Range
 * (the DOM Range API supports this natively).
 *
 * The cross-engine selection path (Pitfall 2: never use Selection.toString()
 * — it varies by engine; we drive the Range directly).
 *
 * Returns true if the selection was set; false if the block/offsets were
 * out of range (the caller treats that as a test setup failure, not a
 * silent skip).
 */
export async function selectRangeInBlock(
  page: Page,
  blockIndex: number,
  startOffset: number,
  endOffset: number,
): Promise<boolean> {
  return page.evaluate(
    ({ blockIndex, startOffset, endOffset }) => {
      // Find the visible block. The hidden measurement body is excluded.
      const candidates = Array.from(
        document.querySelectorAll(`[data-block-index="${blockIndex}"]`),
      );
      const visibleBlock = candidates.find((el) => {
        const measurement = el.closest(".article-body-measurement");
        return measurement === null;
      });
      if (!visibleBlock) return false;
      // Walk text nodes, accumulating length to find the start + end anchors.
      const walker = document.createTreeWalker(
        visibleBlock,
        NodeFilter.SHOW_TEXT,
      );
      const texts: { node: Text; start: number; end: number }[] = [];
      let cursor = 0;
      let n = walker.nextNode() as Text | null;
      while (n) {
        const len = n.nodeValue?.length ?? 0;
        texts.push({ node: n, start: cursor, end: cursor + len });
        cursor += len;
        n = walker.nextNode() as Text | null;
      }
      if (texts.length === 0) return false;
      const totalLen = texts[texts.length - 1]!.end;
      if (endOffset > totalLen || startOffset >= endOffset) return false;
      // Resolve the start anchor.
      const startHit = texts.find((t) => startOffset >= t.start && startOffset < t.end);
      const startAnchor = (startHit ?? texts[0])!;
      const startLocal = startHit ? startOffset - startHit.start : 0;
      // Resolve the end anchor.
      const endHit = texts.find((t) => endOffset > t.start && endOffset <= t.end);
      const endAnchor = (endHit ?? texts[texts.length - 1])!;
      const endLocal = endHit ? endOffset - endHit.start : endAnchor.end - endAnchor.start;
      if (endLocal <= 0) return false;
      try {
        const range = document.createRange();
        range.setStart(startAnchor.node, startLocal);
        range.setEnd(endAnchor.node, endLocal);
        const sel = window.getSelection();
        if (!sel) return false;
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      } catch {
        return false;
      }
    },
    { blockIndex, startOffset, endOffset },
  );
}

/**
 * Find the first visible block index whose total text length is >= minChars.
 * Used by specs that need a known-good capture target without hard-coding a
 * block index that may vary across fixtures or paginated page fragments.
 */
export async function findFirstBlockWithText(
  page: Page,
  minChars = 24,
): Promise<number> {
  return page.evaluate(
    (min) => {
      const blocks = Array.from(
        document.querySelectorAll(
          '.page-fragment [data-block-index], .article-body:not(.article-body-measurement) [data-block-index]',
        ),
      ).filter((el) => !el.closest(".article-body-measurement"));
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i]!;
        const idx = Number(block.getAttribute("data-block-index"));
        if (!Number.isNaN(idx) && (block.textContent?.length ?? 0) >= min) {
          return idx;
        }
      }
      return -1;
    },
    minChars,
  );
}

/**
 * Drive a real Shift+arrow keyboard selection inside a block (the A11Y-01
 * keyboard-capture path). Focuses the block, then extends the selection via
 * Shift+Right arrow N times. Used by keyboard-shortcuts.spec.ts to prove
 * H/N work on a keyboard-driven selection (not only a mouse one).
 */
export async function selectViaKeyboard(
  page: Page,
  blockIndex: number,
  arrowPresses: number,
): Promise<void> {
  const block = visibleBlock(page, blockIndex);
  await block.focus();
  // Move the caret to the start of the block's first text node.
  await block.evaluate((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode() as Text | null;
    if (!first) return;
    const range = document.createRange();
    range.setStart(first, 0);
    range.setEnd(first, 0);
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  });
  for (let i = 0; i < arrowPresses; i++) {
    await page.keyboard.press("Shift+ArrowRight");
  }
  // The selectionchange listener in ArticleView is rAF-throttled; settle so
  // the toolbar mounts before the caller asserts on it.
  await page.waitForTimeout(150);
}

/**
 * The drawer-trigger button in the slim header (D5-09). aria-label is
 * "Highlights and notes" (or "Highlights and notes, N" when N>0).
 */
export function drawerTrigger(page: Page): Locator {
  return page.getByRole("button", { name: /^Highlights and notes/ });
}

/**
 * The mode-toggle button (M shortcut target). aria-label is
 * "Reading mode: paginated" or "Reading mode: scrolling".
 */
export function modeToggle(page: Page): Locator {
  return page.getByRole("button", { name: /^Reading mode:/ });
}

/** Switch reading mode via the M shortcut + wait for the swap to commit. */
export async function switchMode(page: Page): Promise<void> {
  const before = await modeToggle(page).getAttribute("aria-label");
  await page.keyboard.press("m");
  await expect(modeToggle(page)).not.toHaveAttribute("aria-label", before ?? "");
  // Settle the swap (mirrors mode-switch-anchor.spec.ts 400ms).
  await page.waitForTimeout(400);
}

/**
 * Assert the inline highlight `<mark>` rendered for a given highlight id.
 * Optionally checks the .has-note modifier, the .unresolved modifier, and
 * that the aria-label contains a substring (the excerpt).
 */
export async function assertHighlightMark(
  page: Page,
  opts: {
    highlightId?: string;
    excerptSubstring?: string;
    hasNote?: boolean;
    unresolved?: boolean;
  } = {},
): Promise<void> {
  const base = opts.highlightId
    ? page.locator(`mark.highlight[data-highlight-id="${opts.highlightId}"]`)
    : page.locator("mark.highlight");
  await expect(base.first()).toBeVisible();
  if (opts.hasNote) {
    await expect(base.first()).toHaveClass(/has-note/);
  }
  if (opts.unresolved) {
    await expect(base.first()).toHaveClass(/unresolved/);
  }
  if (opts.excerptSubstring) {
    await expect(base.first()).toContainText(opts.excerptSubstring, {
      ignoreCase: true,
    });
  }
}

/**
 * The annotation announce lives in a visually-hidden role=status region in
 * ArticleView (D5-12 / A11Y-08). Concise copy: "Highlight saved." /
 * "Note saved." / "Highlight deleted." / "{N} highlight(s) couldn't be
 * relocated."
 *
 * Returns the current text (may be empty before an announce fires). The
 * caller wraps in expect() with toContainText for the assertion.
 */
export function announcementRegion(page: Page): Locator {
  // The annotation announce region is visually-hidden + role=status + is a
  // sibling of the article-body inside <main>. The settings/progress status
  // regions live elsewhere; the annotation one is rendered by ArticleView
  // specifically. We scope to role=status inside main + the visually-hidden
  // class so we don't collide with the loading/error status card.
  return page.locator("main [role='status'].visually-hidden").first();
}

/**
 * Seed a HighlightRecord directly into Dexie BEFORE opening the article,
 * so the eager batch-resolve on open surfaces it as ambiguous / orphan /
 * confident per the record's quote selector. This is the cleanest path
 * to seed the ANNO-07 cases without any production-only DEV hook — the
 * records are written via the same Dexie table the app reads from.
 *
 * Pass a `quote.exact` that:
 *   - is NOT present in the article → resolveQuoteSelector returns "orphan"
 *   - is present MULTIPLE times → returns "ambiguous" (when prefix/suffix
 *     can't disambiguate)
 *   - is present exactly once → returns "confident" (the same-revision
 *     common case)
 *
 * The position is a nearness hint; for ambiguous/orphan the renderer uses
 * it as the best-effort vicinity (D5-04).
 */
export async function seedHighlightRecord(
  page: Page,
  record: {
    id: string;
    articleId: string;
    revision: number;
    position: { start: number; end: number };
    quote: { prefix: string; exact: string; suffix: string };
    createdAt?: string;
  },
): Promise<void> {
  await page.evaluate(async (rec) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction("highlights", "readwrite");
    const store = tx.objectStore("highlights");
    store.put({
      schemaVersion: 1,
      id: rec.id,
      articleId: rec.articleId,
      revision: rec.revision,
      position: rec.position,
      quote: rec.quote,
      createdAt: rec.createdAt ?? new Date().toISOString(),
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, record);
}

/**
 * Seed a NoteRecord directly into Dexie BEFORE opening the article.
 * Pair with seedHighlightRecord so the eager batch-resolve attaches the
 * note to the resolved highlight (1:1 via highlightId).
 */
export async function seedNoteRecord(
  page: Page,
  record: { id: string; highlightId: string; text: string; updatedAt?: string },
): Promise<void> {
  await page.evaluate(async (rec) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction("notes", "readwrite");
    const store = tx.objectStore("notes");
    store.put({
      schemaVersion: 1,
      id: rec.id,
      highlightId: rec.highlightId,
      text: rec.text,
      updatedAt: rec.updatedAt ?? new Date().toISOString(),
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, record);
}

/**
 * Count the highlights persisted in Dexie for an article (verifies the
 * STATE-03 reload path + cascade-delete). Reads all rows and filters by
 * articleId — the highlights store's indexes are `id` + the compound
 * `[articleId+revision]` (db.ts L89), so a standalone articleId index is
 * not available; a full scan is the simplest cross-engine-safe path.
 */
export async function countHighlightsInDexie(
  page: Page,
  articleId: string,
): Promise<number> {
  return page.evaluate(async (aid) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return new Promise<number>((resolve, reject) => {
      const tx = db.transaction("highlights", "readonly");
      const store = tx.objectStore("highlights");
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = req.result as Array<{ articleId: string }>;
        resolve(rows.filter((r) => r.articleId === aid).length);
      };
      req.onerror = () => reject(req.error);
    });
  }, articleId);
}
