// tests/e2e/annotations/capture-rejects.spec.ts
// ANNO-01 (D5-06 single-block rule + D5-13 disjoint-ranges rule) — the
// selection toolbar rejects invalid selections without creating a record.
//
// SCENARIO:
//   1. Multi-block selection (D5-06): a selection spanning two
//      [data-block-index] blocks surfaces "Select within a single block to
//      highlight it." H does nothing.
//   2. Overlap (D5-13): create a highlight, then select a range intersecting
//      it → "This overlaps an existing highlight." Create does not fire.
//   3. Cross-page (paginated): a selection spanning a page boundary is
//      rejected (single-block rule + visible-fragment binding, D5-08).
//
// No test.skip / test.fixme — the plan's anti-pattern guard: a red suite
// must stay red; never silently skip a failing spec to make a gate green.
import { test, expect } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  selectRangeInBlock,
  findFirstBlockWithText,
  totalPages,
  turnToPage,
  currentPageIdx,
} from "./_fixtures";

const FIXTURE = FIXTURES[0]!; // essay-long-form

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

test.describe("ANNO-01 capture rejects (D5-06 + D5-13) — 05-05", () => {
  test("D5-06 multi-block selection surfaces the 'single block' hint + H does nothing", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    // Plan 13-06 repair: under the Option A page-1 budget (viewport − the
    // metadata spot's reserve), essay page 1 carries a single long paragraph
    // — two CONSECUTIVE text blocks live on a later page. Walk pages until
    // the visible fragment carries such a pair (the D13-09 walk-pages
    // precedent), then span the selection across them. The D5-06 contract
    // (multi-block selection → hint, no action buttons, H is a no-op) is
    // unchanged.
    const total = await totalPages(page);
    let spannedPage = -1;
    for (let target = await currentPageIdx(page); target < total; target++) {
      await turnToPage(page, target);
      const hasPair = await page.evaluate(() => {
        const blocks = Array.from(
          document.querySelectorAll(
            '.page-fragment [data-block-index], .article-body:not(.article-body-measurement) [data-block-index]',
          ),
        ).filter((el) => !el.closest(".article-body-measurement"));
        for (let i = 0; i + 1 < blocks.length; i++) {
          const a = blocks[i]!;
          const b = blocks[i + 1]!;
          if ((a.textContent?.length ?? 0) < 4) continue;
          if ((b.textContent?.length ?? 0) < 4) continue;
          return true;
        }
        return false;
      });
      if (hasPair) {
        spannedPage = target;
        break;
      }
    }
    expect(spannedPage, "some page must carry two consecutive text blocks").toBeGreaterThanOrEqual(0);
    // Find two adjacent visible blocks + span a selection across them.
    const spanned = await page.evaluate(() => {
      const blocks = Array.from(
        document.querySelectorAll(
          '.page-fragment [data-block-index], .article-body:not(.article-body-measurement) [data-block-index]',
        ),
      ).filter((el) => !el.closest(".article-body-measurement"));
      // Pick two consecutive blocks that both have text.
      for (let i = 0; i + 1 < blocks.length; i++) {
        const a = blocks[i]!;
        const b = blocks[i + 1]!;
        if ((a.textContent?.length ?? 0) < 4) continue;
        if ((b.textContent?.length ?? 0) < 4) continue;
        const aWalker = document.createTreeWalker(a, NodeFilter.SHOW_TEXT);
        const aNode = aWalker.nextNode() as Text | null;
        const bWalker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
        const bNode = bWalker.nextNode() as Text | null;
        if (!aNode || !bNode) continue;
        try {
          const range = document.createRange();
          range.setStart(aNode, 0);
          range.setEnd(bNode, Math.min(4, bNode.nodeValue!.length));
          const sel = window.getSelection();
          if (!sel) return false;
          sel.removeAllRanges();
          sel.addRange(range);
          return true;
        } catch {
          continue;
        }
      }
      return false;
    });
    expect(spanned, "multi-block selection set").toBeTruthy();
    // The toolbar shows the multi-block hint (NOT the action buttons).
    const toolbar = page.locator(".selection-toolbar");
    await expect(toolbar).toBeVisible();
    await expect(toolbar).toContainText(/Select within a single block/i);
    await expect(toolbar.getByRole("button", { name: "Highlight", exact: true })).toHaveCount(0);
    // H does nothing (the shortcut is a no-op on an invalid selection).
    await page.keyboard.press("h");
    await expect(page.locator("mark.highlight")).toHaveCount(0);
  });

  test("D5-13 overlap selection surfaces 'overlaps an existing highlight' + Create does not fire", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    // First, create a valid highlight.
    const blockIdx = await findFirstBlockWithText(page, 30);
    expect(blockIdx).not.toBe(-1);
    let ok = await selectRangeInBlock(page, blockIdx, 0, 24);
    expect(ok, "first selection").toBeTruthy();
    await page.locator(".selection-toolbar").getByRole("button", { name: "Highlight", exact: true }).click();
    await expect(page.locator("mark.highlight").first()).toBeVisible();
    const baselineCount = await page.locator("mark.highlight").count();
    expect(baselineCount).toBeGreaterThanOrEqual(1);
    // Now select a range that overlaps it (intersect [0,24) with [10,30)).
    ok = await selectRangeInBlock(page, blockIdx, 10, 30);
    expect(ok, "overlapping selection").toBeTruthy();
    const toolbar = page.locator(".selection-toolbar");
    await expect(toolbar).toBeVisible();
    await expect(toolbar).toContainText(/overlaps an existing highlight/i);
    await expect(toolbar.getByRole("button", { name: "Highlight", exact: true })).toHaveCount(0);
    // Pressing H does not create a second highlight.
    await page.keyboard.press("h");
    await page.waitForTimeout(200);
    const afterCount = await page.locator("mark.highlight").count();
    expect(afterCount, "no second highlight created on overlap").toBe(baselineCount);
  });

  test("D5-08 paginated cross-page selection does not surface a valid Highlight button", async ({
    page,
  }) => {
    // A selection that starts on the visible page fragment and extends into
    // the hidden measurement body (the only mounted representation of off-
    // page content) is rejected. The user-select:none measurement body
    // should not host a valid endpoint; the toolbar either stays hidden or
    // shows an invalid hint — never the action buttons.
    await openArticle(page, FIXTURE);
    const tried = await page.evaluate(() => {
      // Find a visible block + a hidden-body block with the same data-block-index
      // so the cross-page span is realistic.
      const visible = document.querySelector(
        ".page-fragment [data-block-index]",
      ) as HTMLElement | null;
      const hidden = document.querySelector(
        ".article-body-measurement [data-block-index]",
      ) as HTMLElement | null;
      if (!visible || !hidden) return false;
      const vWalker = document.createTreeWalker(visible, NodeFilter.SHOW_TEXT);
      const vNode = vWalker.nextNode() as Text | null;
      const hWalker = document.createTreeWalker(hidden, NodeFilter.SHOW_TEXT);
      const hNode = hWalker.nextNode() as Text | null;
      if (!vNode || !hNode) return false;
      try {
        const range = document.createRange();
        range.setStart(vNode, 0);
        range.setEnd(hNode, 0);
        const sel = window.getSelection();
        if (!sel) return false;
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      } catch {
        return false;
      }
    });
    if (!tried) {
      // If the synthetic cross-page range can't be built (engine edge),
      // assert the negative honestly (no skip).
      expect(tried, "cross-page range buildable").toBeTruthy();
      return;
    }
    await page.waitForTimeout(200);
    // The toolbar must NOT present the valid action buttons for a cross-page
    // (multi-block or hidden-body) selection.
    const actionButtons = page.locator(".selection-toolbar").getByRole("button", { name: "Highlight", exact: true });
    const count = await actionButtons.count();
    expect(count, "no valid Highlight button for cross-page selection").toBe(0);
  });
});
