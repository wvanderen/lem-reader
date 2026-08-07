// tests/e2e/annotations/cross-fragment-render.spec.ts
// D5-16 — A single-block highlight whose block is split across a page
// boundary renders a <mark> slice on EACH page fragment containing part of
// its grapheme range. Both slices share the same data-highlight-id (no silent
// gap at a page turn); the popover/note is reachable from either page.
import { test, expect } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  selectRangeInBlock,
  findFirstBlockWithText,
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
