// tests/e2e/annotations/span-capture.spec.ts
// ANNO-08 (Phase 19 / D19-01..08) — span CAPTURE: a native selection
// spanning two eligible mounted blocks creates ONE highlight (one Dexie
// record, marks visible on BOTH blocks), in BOTH reading modes; a
// cross-block span overlapping an existing highlight refuses with the
// existing overlap hint (D19-07 global no-overlap).
//
// D19 sanctioned churn #1 (19-RESEARCH Pitfall 7): the D5-06 two-block
// refusal cell that lived in capture-rejects.spec.ts test 1 MOVED here and
// flipped to a SUCCESS cell — the multi-block selection setup (page-walk +
// cross-block Range) is now the proof that spans capture. The refusal file
// keeps the overlap + measurement-body tests (cross-page still refuses —
// ANNO-13 is Future).
//
// No skipped or fixme tests — the plan's anti-pattern guard: a red suite
// must stay red; never silently skip a failing spec to make a gate green.
// 3-engine expectation: chromium/firefox/webkit run every spec via
// playwright.config.ts projects.
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  switchMode,
  visibleBlock,
  selectRangeInBlock,
  countHighlightsInDexie,
  announcementRegion,
  totalPages,
  turnToPage,
  currentPageIdx,
} from "./_fixtures";

const FIXTURE = FIXTURES[0]!; // essay-long-form

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

/**
 * Find two consecutive VISIBLE text blocks and span a selection across them
 * (start at block A's first text char, end 4 chars into block B). This is
 * the moved selection setup from capture-rejects.spec.ts test 1 (D5-06),
 * now driving span-SUCCESS cells (D19). Returns the two block indices, or
 * null when the mounted surface carries no consecutive text pair.
 */
async function spanSelectionAcrossConsecutiveBlocks(
  page: Page,
): Promise<{ aIdx: number; bIdx: number } | null> {
  return page.evaluate(() => {
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
        if (!sel) return null;
        sel.removeAllRanges();
        sel.addRange(range);
        return {
          aIdx: Number(a.getAttribute("data-block-index")),
          bIdx: Number(b.getAttribute("data-block-index")),
        };
      } catch {
        continue;
      }
    }
    return null;
  });
}

test.describe("ANNO-08 span capture (D19) — 19-01", () => {
  test("scrolling: two-paragraph span → toolbar buttons → ONE record + marks on BOTH blocks", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    // Scrolling mode: the whole article is one flow — consecutive text
    // blocks are adjacent without a page walk.
    await switchMode(page);
    const spanned = await spanSelectionAcrossConsecutiveBlocks(page);
    expect(spanned, "two consecutive text blocks in scrolling mode").not.toBeNull();
    // The toolbar shows the TWO action buttons (NOT a hint) — the retired
    // D5-06 refusal is gone; spans are ordinary valid selections (D19-09).
    const toolbar = page.locator(".selection-toolbar");
    await expect(toolbar).toBeVisible();
    await expect(
      toolbar.getByRole("button", { name: "Highlight", exact: true }),
    ).toBeVisible();
    await expect(
      toolbar.getByRole("button", { name: "Highlight + note" }),
    ).toBeVisible();
    await toolbar
      .getByRole("button", { name: "Highlight", exact: true })
      .click();
    await expect(announcementRegion(page)).toContainText(/Highlight saved/i);
    // ONE Dexie record — one identity for the whole span (ANNO-08/09).
    expect(await countHighlightsInDexie(page, FIXTURE)).toBe(1);
    // Marks visible in BOTH blocks, sharing ONE data-highlight-id.
    const mark = page.locator("mark.highlight");
    await expect(mark.first()).toBeVisible();
    const id = await mark.first().getAttribute("data-highlight-id");
    expect(id, "mark carries a highlight id").toBeTruthy();
    await expect(
      visibleBlock(page, spanned!.aIdx).locator(
        `mark.highlight[data-highlight-id="${id}"]`,
      ),
      "span mark renders in the START block",
    ).toBeVisible();
    await expect(
      visibleBlock(page, spanned!.bIdx).locator(
        `mark.highlight[data-highlight-id="${id}"]`,
      ),
      "span mark renders in the END block",
    ).toBeVisible();
  });

  test("paginated: two-block span WITHIN one mounted page → same composition via slice attributes", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    // Under the Option A page-1 budget (viewport − the metadata spot's
    // reserve), essay page 1 carries a single long paragraph — two
    // CONSECUTIVE text blocks live on a later page. Walk pages until the
    // visible fragment carries such a pair (the D13-09 walk-pages
    // precedent), then span the selection across them. Both endpoint
    // blocks may be page SLICES carrying data-block-grapheme-start — the
    // per-endpoint D5-08 slice math composes the same global range.
    const total = await totalPages(page);
    let spanned: { aIdx: number; bIdx: number } | null = null;
    for (
      let target = await currentPageIdx(page);
      target < total && spanned === null;
      target++
    ) {
      await turnToPage(page, target);
      spanned = await spanSelectionAcrossConsecutiveBlocks(page);
    }
    expect(
      spanned,
      "some page must carry two consecutive text blocks",
    ).not.toBeNull();
    // Same toolbar + creation + one-record + both-marks assertions.
    const toolbar = page.locator(".selection-toolbar");
    await expect(toolbar).toBeVisible();
    await expect(
      toolbar.getByRole("button", { name: "Highlight", exact: true }),
    ).toBeVisible();
    await toolbar
      .getByRole("button", { name: "Highlight", exact: true })
      .click();
    await expect(announcementRegion(page)).toContainText(/Highlight saved/i);
    expect(await countHighlightsInDexie(page, FIXTURE)).toBe(1);
    const mark = page.locator("mark.highlight");
    await expect(mark.first()).toBeVisible();
    const id = await mark.first().getAttribute("data-highlight-id");
    expect(id, "mark carries a highlight id").toBeTruthy();
    await expect(
      visibleBlock(page, spanned!.aIdx).locator(
        `mark.highlight[data-highlight-id="${id}"]`,
      ),
      "span mark renders in the START block's page slice",
    ).toBeVisible();
    await expect(
      visibleBlock(page, spanned!.bIdx).locator(
        `mark.highlight[data-highlight-id="${id}"]`,
      ),
      "span mark renders in the END block's page slice",
    ).toBeVisible();
  });

  test("D19-07: a cross-block span overlapping an existing highlight refuses with the overlap hint", async ({
    page,
  }) => {
    // The global no-overlap policy (D5-13 generalized by D19-07): a new
    // span — like any single-block highlight — may not overlap ANY existing
    // highlight's article-global range. One rangesOverlap check, one hint.
    await openArticle(page, FIXTURE);
    await switchMode(page);
    const spanned = await spanSelectionAcrossConsecutiveBlocks(page);
    expect(spanned, "two consecutive text blocks in scrolling mode").not.toBeNull();
    // First create a single-block highlight on the START block.
    const ok = await selectRangeInBlock(page, spanned!.aIdx, 0, 20);
    expect(ok, "first single-block selection").toBeTruthy();
    await page
      .locator(".selection-toolbar")
      .getByRole("button", { name: "Highlight", exact: true })
      .click();
    await expect(page.locator("mark.highlight").first()).toBeVisible();
    expect(await countHighlightsInDexie(page, FIXTURE)).toBe(1);
    // Now span from INSIDE that highlight into the next block — the global
    // ranges intersect, so the whole span refuses (existing hint, no
    // buttons, H is a no-op).
    const respanned = await spanSelectionAcrossConsecutiveBlocks(page);
    expect(respanned, "span selection set").not.toBeNull();
    const toolbar = page.locator(".selection-toolbar");
    await expect(toolbar).toBeVisible();
    await expect(toolbar).toContainText(/overlaps an existing highlight/i);
    await expect(
      toolbar.getByRole("button", { name: "Highlight", exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("h");
    await page.waitForTimeout(200);
    expect(
      await countHighlightsInDexie(page, FIXTURE),
      "no second highlight created on overlapping span",
    ).toBe(1);
  });
});
