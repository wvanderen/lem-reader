import { test, expect } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  findFirstBlockWithText,
  visibleBlock,
  switchMode,
  modeToggle,
  announcementRegion,
} from "./_fixtures";

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

// Issue #220 — every creation auto-dismisses the toolbar (the saved-state
// "Highlighted / Undo / Add note" variant is gone) and arms the ~4s undo
// grace: Escape deletes the just-created, UNEDITED highlight — one shot.
// The announcement names it on the one article-level status region.
for (const mode of ["paginated", "scrolling"] as const) {
  test(`${mode}: pointer selection saves, auto-dismisses, and Escape undoes within the grace`, async ({
    page,
  }) => {
    await openArticle(page, FIXTURES[0]!);
    if (!(await modeToggle(page).getAttribute("aria-label"))?.includes(`Reading mode: ${mode}`)) {
      await switchMode(page);
    }
    await expect(modeToggle(page)).toHaveAttribute(
      "aria-label",
      new RegExp(`^Reading mode: ${mode}`),
    );
    const index = await findFirstBlockWithText(page, 24);
    const block = visibleBlock(page, index);
    // A real double-click selects a word and completes a pointer gesture.
    await page.keyboard.down("1");
    await block.dblclick();
    await page.keyboard.up("1");
    // Auto-dismiss: no floating toolbar lingers over the creation.
    await expect(page.getByRole("toolbar", { name: "Highlight actions" })).toHaveCount(0);
    // One polite article-level announcement per creation, naming the grace.
    await expect(announcementRegion(page)).toHaveText("Highlight saved. Press Escape to undo.");
    const mark = page.locator("mark.highlight").first();
    await expect(mark).toBeVisible();
    // The grace: Escape deletes exactly the untouched new highlight.
    await page.keyboard.press("Escape");
    await expect(page.locator("mark.highlight")).toHaveCount(0);
    await expect(announcementRegion(page)).toHaveText("Highlight deleted.");
  });

  test(`${mode}: create → open the panel → Escape dismisses the panel, the highlight survives`, async ({
    page,
  }) => {
    await openArticle(page, FIXTURES[0]!);
    if (!(await modeToggle(page).getAttribute("aria-label"))?.includes(`Reading mode: ${mode}`)) {
      await switchMode(page);
    }
    const index = await findFirstBlockWithText(page, 24);
    await page.keyboard.down("1");
    await visibleBlock(page, index).dblclick();
    await page.keyboard.up("1");
    await expect(page.locator("mark.highlight")).toHaveCount(1);
    // Opening the annotation panel retires the grace (a dialog opening) —
    // from that moment Escape belongs to the panel's layers.
    await page.locator("mark.highlight").first().click();
    const panel = page.locator("dialog.annotation-panel[open]");
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible();
    // The highlight survives — and a second Escape cannot delete it either
    // (the grace retired at the panel's open, not at its dismiss).
    await expect(page.locator("mark.highlight")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator("mark.highlight")).toHaveCount(1);
  });
}

for (const mode of ["paginated", "scrolling"] as const) {
  test(`${mode}: multi-block save auto-dismisses; the grace survives a page turn`, async ({
    page,
  }) => {
    await openArticle(page, FIXTURES[0]!);
    if (!(await modeToggle(page).getAttribute("aria-label"))?.includes(`Reading mode: ${mode}`)) {
      await switchMode(page);
    }
    await page.keyboard.down("1");
    await page.evaluate(() => {
      const surface =
        document.querySelector(".page-fragment") ??
        document.querySelector(".article-body:not(.article-body-measurement)");
      const blocks = surface!.querySelectorAll("p[data-block-index]");
      const first = blocks[0]!;
      const second = blocks[1]!;
      first.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      const range = document.createRange();
      range.setStart(first.firstChild!, 10);
      range.setEnd(second.firstChild!, 40);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      second.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    });
    await page.keyboard.up("1");
    await expect(page.getByRole("toolbar", { name: "Highlight actions" })).toHaveCount(0);
    await expect(page.locator("mark.highlight")).toHaveCount(2);
    if (mode === "paginated") {
      // The grace survives scrolling — a page turn is scrolling. Escape
      // still deletes the just-created highlight after the turn.
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("Escape");
    } else {
      await page.keyboard.press("Escape");
    }
    await expect(page.locator("mark.highlight")).toHaveCount(0);
  });
}
