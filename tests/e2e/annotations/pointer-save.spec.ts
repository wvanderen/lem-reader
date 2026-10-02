import { test, expect } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  findFirstBlockWithText,
  visibleBlock,
  switchMode,
  modeToggle,
} from "./_fixtures";

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

for (const mode of ["paginated", "scrolling"] as const) {
  for (const action of ["Undo", "Escape", "Add note"] as const) {
    test(`${mode}: pointer selection saves and supports ${action}`, async ({ page }) => {
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
      await block.dblclick();
      const toolbar = page.getByRole("toolbar", { name: "Highlight actions" });
      await expect(toolbar.getByRole("button", { name: "Undo" })).toBeVisible();
      await expect(toolbar.getByRole("status")).toHaveText("Highlight saved. Undo available.");
      const mark = page.locator("mark.highlight").first();
      await expect(mark).toBeVisible();
      const id = await mark.getAttribute("data-highlight-id");
      if (action === "Escape") await page.keyboard.press("Escape");
      else await toolbar.getByRole("button", { name: action }).click();
      await expect(toolbar).toHaveCount(0);
      if (action === "Add note") {
        await expect(page.locator("textarea.highlight-popover-textarea")).toBeVisible();
        await expect(page.locator(`mark.highlight[data-highlight-id="${id}"]`)).toBeVisible();
        await expect(page.locator("mark.highlight")).toHaveCount(1);
      } else await expect(page.locator("mark.highlight")).toHaveCount(0);
    });
  }
}
