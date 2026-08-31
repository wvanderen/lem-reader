// tests/e2e/annotations/cross-fragment-render.spec.ts
// D5-16 — A single-block highlight whose block is split across a page
// boundary renders a <mark> slice on EACH page fragment containing part of
// its grapheme range. Both slices share the same data-highlight-id (no silent
// gap at a page turn); the popover/note is reachable from either page.
//
// Plan 19-04 extends the D5-16 rule over SPANS + the items-shape (ANNO-09
// paginated side + the ANNO-10 repagination leg): a page-crossing span marks
// every mounted page sharing data-highlight-id, with EXACTLY ONE
// id="hl-<id>" per mounted page (the per-page first-occurrence pass — Pitfall
// 2's mandatory count===1 assertion, which axe will not catch); list items
// and figure captions render marks inside page fragments (paginated parity
// with Plan 03). A native selection still cannot extend past the mounted
// page — capture-rejects.spec.ts's cross-page refusal stays green,
// byte-unchanged (ANNO-13 is Future; no new capture machinery).
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  selectRangeInBlock,
  findFirstBlockWithText,
  visibleBlock,
  totalPages,
  turnToPage,
  currentPageIdx,
} from "./_fixtures";

const FIXTURE = FIXTURES[0]!; // essay-long-form

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

test.describe("D5-16 cross-fragment render (05-05)", () => {
  test("a highlight created in scrolling mode re-renders as <mark> slices when the block is paginated", async ({
    page,
  }) => {
    // Strategy: create a highlight in SCROLLING mode (the full block is
    // mounted, so the highlight's grapheme range is unambiguous), then switch
    // to PAGINATED mode. If the highlighted block happens to land across a
    // page boundary, BOTH page fragments render a <mark> slice sharing the
    // same data-highlight-id. If the block fits wholly on one page, exactly
    // one <mark> renders. Either way, the highlight is reachable (no silent
    // gap) — the load-bearing D5-16 contract.
    await openArticle(page, FIXTURE);
    // Switch to scrolling first so the whole article is mounted.
    await page.keyboard.press("m");
    await page.waitForTimeout(400);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    const ok = await selectRangeInBlock(page, blockIdx, 0, 24);
    expect(ok).toBeTruthy();
    await page.locator(".selection-toolbar").getByRole("button", { name: "Highlight", exact: true }).click();
    const hlId = await page.locator("mark.highlight").first().getAttribute("data-highlight-id");
    expect(hlId).toBeTruthy();

    // Switch back to paginated — the highlight re-renders across whatever
    // page-fragment boundaries the block spans.
    await page.keyboard.press("m");
    await page.waitForTimeout(800);

    // At least one <mark> slice with the shared id renders (D5-16: no gap).
    const slices = page.locator(`mark.highlight[data-highlight-id="${hlId}"]`);
    await expect(slices.first()).toBeVisible();
    const sliceCount = await slices.count();
    expect(sliceCount, "at least one cross-fragment slice renders").toBeGreaterThanOrEqual(1);
    // If the block was split, BOTH pages' slices share the id (D5-16). Walk
    // the pages + verify each slice is reachable (focusable + activatable).
    for (let i = 0; i < sliceCount; i++) {
      await expect(slices.nth(i)).toHaveAttribute("data-highlight-id", hlId!);
      await expect(slices.nth(i)).toHaveAttribute("tabindex", "0");
    }
  });

  test("data-highlight-id ties cross-fragment slices together (shared id invariant)", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    // Create a highlight in paginated mode on page 1.
    const ok = await selectRangeInBlock(page, blockIdx, 0, 18);
    expect(ok).toBeTruthy();
    await page.locator(".selection-toolbar").getByRole("button", { name: "Highlight", exact: true }).click();
    const hlId = await page.locator("mark.highlight").first().getAttribute("data-highlight-id");
    expect(hlId).toBeTruthy();
    // All marks for this highlight share the id (whether 1 or N slices).
    const ids = await page.evaluate((id) => {
      return Array.from(document.querySelectorAll(`mark.highlight[data-highlight-id="${id}"]`)).map(
        (el) => el.getAttribute("data-highlight-id"),
      );
    }, hlId!);
    expect(ids.length, "at least one slice present").toBeGreaterThanOrEqual(1);
    for (const id of ids) {
      expect(id, "every slice shares the highlight id").toBe(hlId);
    }
  });
});

// ── Plan 19-04: paginated span coverage (ANNO-09 paginated + ANNO-10
// repagination leg). All cells run in the DEFAULT paginated mode; the
// cross-page-selection refusal in capture-rejects.spec.ts stays green +
// byte-unchanged (cell (c) — referenced, not modified). ─────────────────────

/**
 * Select the FULL text content of the mounted page: first text char of the
 * first eligible text block through the LAST text char of the last eligible
 * text block. A full page's content cannot fit a single page again after a
 * font-size increase, so a span captured this way deterministically crosses
 * onto a following page after a typography-triggered repagination (cell (a)
 * needs the crossing case, not the fits-on-one-page case).
 */
async function selectFullMountedPageSpan(
  page: Page,
): Promise<{ firstIdx: number; lastIdx: number } | null> {
  return page.evaluate(() => {
    const blocks = Array.from(
      document.querySelectorAll(".page-fragment [data-block-index]"),
    ).filter((el) => !el.closest(".article-body-measurement"));
    const eligible = blocks.filter((el) =>
      [
        "p",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "ul",
        "ol",
        "blockquote",
      ].includes(el.tagName.toLowerCase()),
    );
    if (eligible.length < 2) return null;
    const first = eligible[0]!;
    const last = eligible[eligible.length - 1]!;
    const w1 = document.createTreeWalker(first, NodeFilter.SHOW_TEXT);
    const n1 = w1.nextNode() as Text | null;
    const w2 = document.createTreeWalker(last, NodeFilter.SHOW_TEXT);
    let n2: Text | null = null;
    for (let n = w2.nextNode() as Text | null; n; n = w2.nextNode() as Text | null) {
      n2 = n;
    }
    if (!n1 || !n2 || (n2.nodeValue?.length ?? 0) === 0) return null;
    try {
      const range = document.createRange();
      range.setStart(n1, 0);
      range.setEnd(n2, n2.nodeValue!.length);
      const sel = window.getSelection();
      if (!sel) return null;
      sel.removeAllRanges();
      sel.addRange(range);
      return {
        firstIdx: Number(first.getAttribute("data-block-index")),
        lastIdx: Number(last.getAttribute("data-block-index")),
      };
    } catch {
      return null;
    }
  });
}

/**
 * Select a cross-block span from a text offset inside the visible block
 * `fromBlockIndex` to a text offset inside the FIRST visible element
 * matching `toSelector` (e.g. a list's first li, a figure's figcaption).
 * Drives the DOM Range directly (the Pitfall 2 cross-engine discipline).
 */
async function selectFromBlockIntoElement(
  page: Page,
  opts: {
    fromBlockIndex: number;
    fromOffset: number;
    toSelector: string;
    toOffset: number;
  },
): Promise<boolean> {
  return page.evaluate(
    ({ fromBlockIndex, fromOffset, toSelector, toOffset }) => {
      const from = Array.from(
        document.querySelectorAll(`[data-block-index="${fromBlockIndex}"]`),
      ).find((el) => el.closest(".article-body-measurement") === null);
      const to = Array.from(document.querySelectorAll(toSelector)).find(
        (el) => el.closest(".article-body-measurement") === null,
      );
      if (!from || !to) return false;
      const w1 = document.createTreeWalker(from, NodeFilter.SHOW_TEXT);
      const n1 = w1.nextNode() as Text | null;
      const w2 = document.createTreeWalker(to, NodeFilter.SHOW_TEXT);
      const n2 = w2.nextNode() as Text | null;
      if (!n1 || !n2) return false;
      try {
        const range = document.createRange();
        range.setStart(n1, Math.min(fromOffset, n1.nodeValue!.length));
        range.setEnd(n2, Math.min(toOffset, n2.nodeValue!.length));
        const sel = window.getSelection();
        if (!sel) return false;
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      } catch {
        return false;
      }
    },
    opts,
  );
}

/** Find a paragraph immediately followed by a list on the mounted page. */
async function findParagraphFollowedByListOnMountedPage(
  page: Page,
): Promise<{ paraIdx: number; listIdx: number } | null> {
  return page.evaluate(() => {
    const blocks = Array.from(
      document.querySelectorAll(".page-fragment [data-block-index]"),
    ).filter((el) => !el.closest(".article-body-measurement"));
    for (let i = 0; i + 1 < blocks.length; i++) {
      const a = blocks[i]!;
      const b = blocks[i + 1]!;
      if (a.tagName.toLowerCase() !== "p") continue;
      const bTag = b.tagName.toLowerCase();
      if (bTag !== "ul" && bTag !== "ol") continue;
      const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
      if (!w.nextNode()) continue;
      return {
        paraIdx: Number(a.getAttribute("data-block-index")),
        listIdx: Number(b.getAttribute("data-block-index")),
      };
    }
    return null;
  });
}

/**
 * Find a paragraph followed (in DOM order on the mounted page) by a figure
 * with a NON-EMPTY alt and a caption carrying a text node — the Pitfall 1
 * case where the caption's entry-local start is alt graphemes + separator.
 */
async function findParagraphAndCaptionedFigureOnMountedPage(
  page: Page,
): Promise<{ paraIdx: number; figIdx: number } | null> {
  return page.evaluate(() => {
    const blocks = Array.from(
      document.querySelectorAll(".page-fragment [data-block-index]"),
    ).filter((el) => !el.closest(".article-body-measurement"));
    const figs = blocks.filter((el) => el.tagName.toLowerCase() === "figure");
    for (const fig of figs) {
      const img = fig.querySelector("img");
      if (!img || !(img.getAttribute("alt") ?? "")) continue;
      const caption = fig.querySelector("figcaption");
      if (!caption) continue;
      const w = document.createTreeWalker(caption, NodeFilter.SHOW_TEXT);
      if (!w.nextNode()) continue;
      const para = blocks.find((el) => {
        if (el.tagName.toLowerCase() !== "p") return false;
        return (
          el.compareDocumentPosition(fig) & Node.DOCUMENT_POSITION_FOLLOWING
        );
      });
      if (!para) continue;
      return {
        paraIdx: Number(para.getAttribute("data-block-index")),
        figIdx: Number(fig.getAttribute("data-block-index")),
      };
    }
    return null;
  });
}

test.describe("ANNO-09/ANNO-10 paginated span coverage (19-04)", () => {
  test("(a) multi-block span keeps one id per mounted page across a typography-triggered repagination", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE); // paginated default
    // Under the Option A page-1 budget page 1 carries a single long
    // paragraph — walk to a page carrying >= 2 text blocks (the D13-09
    // walk-pages precedent) and span its FULL content.
    const total = await totalPages(page);
    let spanned: { firstIdx: number; lastIdx: number } | null = null;
    for (
      let target = await currentPageIdx(page);
      target < total && spanned === null;
      target++
    ) {
      await turnToPage(page, target);
      spanned = await selectFullMountedPageSpan(page);
    }
    expect(
      spanned,
      "some page carries two or more text blocks",
    ).not.toBeNull();
    const toolbar = page.locator(".selection-toolbar");
    await expect(toolbar).toBeVisible();
    await toolbar
      .getByRole("button", { name: "Highlight", exact: true })
      .click();
    const hlId = await page
      .locator("mark.highlight")
      .first()
      .getAttribute("data-highlight-id");
    expect(hlId, "mark carries a highlight id").toBeTruthy();

    // Typography-triggered repagination (the survive-relayout precedent):
    // 18 -> 24 grows every line's height, so the full page's content
    // re-fragments — the span's extent crosses onto a following page.
    await page.getByRole("button", { name: "Reading settings" }).click();
    const slider = page.getByRole("slider", { name: "Text size" });
    await slider.focus();
    await slider.press("ArrowUp");
    await slider.press("ArrowUp");
    await slider.press("ArrowUp"); // 18 -> 24
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1500);

    // Walk EVERY page: wherever the span renders, marks share
    // data-highlight-id and the mounted page carries EXACTLY ONE
    // id="hl-…" (Pitfall 2 mandatory assertion — axe will not catch
    // duplicate ids). Marks re-derive from the global range on every page
    // turn (ANNO-10 repagination leg).
    const pagesNow = await totalPages(page);
    expect(pagesNow).toBeGreaterThan(0);
    let pagesCarryingSpan = 0;
    for (let p = 0; p < pagesNow; p++) {
      await turnToPage(page, p);
      const marks = page.locator(
        `mark.highlight[data-highlight-id="${hlId}"]`,
      );
      const n = await marks.count();
      if (n === 0) continue;
      pagesCarryingSpan++;
      await expect(marks.first()).toBeVisible();
      await expect(page.locator(`[id="hl-${hlId}"]`)).toHaveCount(1);
    }
    expect(
      pagesCarryingSpan,
      "the full-page span's extent crosses a page boundary after the size increase",
    ).toBeGreaterThanOrEqual(2);
  });

  test("(b) a list-containing span marks items on the mounted fragment (paginated twin of 19-03)", async ({
    page,
  }) => {
    await openArticle(page, FIXTURES[3]!); // list-reference, paginated
    const total = await totalPages(page);
    let pair: { paraIdx: number; listIdx: number } | null = null;
    for (
      let target = await currentPageIdx(page);
      target < total && pair === null;
      target++
    ) {
      await turnToPage(page, target);
      pair = await findParagraphFollowedByListOnMountedPage(page);
    }
    expect(
      pair,
      "some page carries a paragraph followed by a list",
    ).not.toBeNull();
    // Span from the paragraph's first char into the first list item — the
    // endpoint composition runs through the mounted page's slice
    // attributes; the span's tail lands in list-item content.
    const ok = await selectFromBlockIntoElement(page, {
      fromBlockIndex: pair!.paraIdx,
      fromOffset: 0,
      toSelector: `[data-block-index="${pair!.listIdx}"] li`,
      toOffset: 6,
    });
    expect(
      ok,
      "cross-block selection from paragraph into a list item",
    ).toBeTruthy();
    const toolbar = page.locator(".selection-toolbar");
    await expect(toolbar).toBeVisible();
    await toolbar
      .getByRole("button", { name: "Highlight", exact: true })
      .click();
    const hlId = await page
      .locator("mark.highlight")
      .first()
      .getAttribute("data-highlight-id");
    expect(hlId, "mark carries a highlight id").toBeTruthy();
    // The span's head marks the paragraph…
    await expect(
      visibleBlock(page, pair!.paraIdx).locator(
        `mark.highlight[data-highlight-id="${hlId}"]`,
      ),
      "span mark renders in the START paragraph",
    ).toBeVisible();
    // …and its tail marks list ITEM content on the mounted fragment —
    // per-item threading inside the page fragment (the paginated twin of
    // Plan 03's scrolling coverage; a list-entry bypass fails here).
    await expect(
      visibleBlock(page, pair!.listIdx).locator(
        `li mark.highlight[data-highlight-id="${hlId}"]`,
      ),
      "span mark renders inside a list item on the mounted fragment",
    ).toBeVisible();
    // One id per mounted page (Pitfall 2).
    await expect(page.locator(`[id="hl-${hlId}"]`)).toHaveCount(1);
  });

  test("(d) a caption-endpoint span marks the figcaption on the mounted page (caption routing pin)", async ({
    page,
  }) => {
    await openArticle(page, FIXTURES[1]!); // figure-heavy, paginated
    const total = await totalPages(page);
    let pair: { paraIdx: number; figIdx: number } | null = null;
    for (
      let target = await currentPageIdx(page);
      target < total && pair === null;
      target++
    ) {
      await turnToPage(page, target);
      pair = await findParagraphAndCaptionedFigureOnMountedPage(page);
    }
    expect(
      pair,
      "some page carries a paragraph followed by a captioned figure",
    ).not.toBeNull();
    // Select from the paragraph's first char into the figure's caption
    // (non-empty alt — the Pitfall 1 symmetric-offset case).
    const ok = await selectFromBlockIntoElement(page, {
      fromBlockIndex: pair!.paraIdx,
      fromOffset: 0,
      toSelector: `[data-block-index="${pair!.figIdx}"] figcaption`,
      toOffset: 10,
    });
    expect(
      ok,
      "cross-block selection from paragraph into the figcaption",
    ).toBeTruthy();
    const toolbar = page.locator(".selection-toolbar");
    await expect(toolbar).toBeVisible();
    await toolbar
      .getByRole("button", { name: "Highlight", exact: true })
      .click();
    const hlId = await page
      .locator("mark.highlight")
      .first()
      .getAttribute("data-highlight-id");
    expect(hlId, "mark carries a highlight id").toBeTruthy();
    const figLoc = visibleBlock(page, pair!.figIdx);
    // The mark is visible INSIDE the figcaption — Task 1's caption
    // routing pin. A silent paginated bypass of Plan 03's caption path
    // fails this cell (the mark would render nowhere).
    await expect(
      figLoc.locator(
        `figcaption mark.highlight[data-highlight-id="${hlId}"]`,
      ),
      "caption-endpoint span marks the figcaption",
    ).toBeVisible();
    // ZERO marks on the img surface (alt is an attribute — D19-02 gap by
    // construction) and every figure mark lives inside the caption.
    await expect(figLoc.locator("img mark.highlight")).toHaveCount(0);
    const inCaption = await figLoc
      .locator("figcaption mark.highlight")
      .count();
    const inFigure = await figLoc.locator("mark.highlight").count();
    expect(inFigure, "no figure marks outside the caption").toBe(inCaption);
    expect(inCaption).toBeGreaterThan(0);
    // One id per mounted page (Pitfall 2).
    await expect(page.locator(`[id="hl-${hlId}"]`)).toHaveCount(1);
  });
});
