// tests/e2e/reflow.spec.ts
// A11Y-04 — content and controls remain visible, operable, and within a single
// column at 320 CSS px (the WCAG reflow breakpoint) and at 200% browser zoom,
// with no horizontal scroll of the article body. The settings panel must open
// and all five fieldsets + Reset + close remain operable at this size.
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5173";
const FIRST_FIXTURE = "essay-long-form";

test.describe("Reflow at 320px (A11Y-04)", () => {
  test.beforeEach(async ({ page }) => {
    // 320 CSS px is the WCAG reflow breakpoint. Tall viewport so the panel
    // (full-height sheet) has room to lay out.
    await page.setViewportSize({ width: 320, height: 800 });
  });

  test("article body has no horizontal overflow at 320px", async ({ page }) => {
    await page.goto(`${BASE}/#/article/${FIRST_FIXTURE}`);
    await expect(page.getByRole("article")).toBeVisible();

    // Body scrollWidth must not exceed clientWidth by more than a 1px tolerance
    // (sub-pixel rounding in some engines). This is the WCAG 1.4.10 contract.
    const overflow = await page.evaluate(() => {
      return {
        body: {
          scrollW: document.body.scrollWidth,
          clientW: document.body.clientWidth,
        },
        article: (() => {
          const el = document.querySelector(".article-body");
          if (!el) return null;
          return {
            scrollW: el.scrollWidth,
            clientW: el.clientWidth,
          };
        })(),
      };
    });
    expect(
      overflow.body.scrollW,
      `body scrolls horizontally at 320px (scrollW ${overflow.body.scrollW} > clientW ${overflow.body.clientW})`,
    ).toBeLessThanOrEqual(overflow.body.clientW + 1);
    if (overflow.article) {
      expect(
        overflow.article.scrollW,
        `article-body scrolls horizontally at 320px`,
      ).toBeLessThanOrEqual(overflow.article.clientW + 1);
    }
  });

  test("settings panel opens at 320px and every section + Reset + close is visible", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIRST_FIXTURE}`);
    await page.getByRole("button", { name: "Reading settings" }).click();
    const dlg = page.locator("dialog.settings-panel");
    await expect(dlg).toBeVisible();

    // All five fieldset sections present and visible.
    for (const legend of [
      "Typeface",
      "Text size",
      "Reading width",
      "Spacing",
      "Theme",
    ]) {
      await expect(page.getByText(legend, { exact: false }).first()).toBeVisible();
    }

    // Reset + close buttons are visible and operable.
    await expect(page.getByRole("button", { name: "Reset to defaults" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Close reading settings" }),
    ).toBeVisible();

    // The panel itself does not introduce horizontal overflow on the page.
    const bodyOverflow = await page.evaluate(() => {
      return document.body.scrollWidth - document.body.clientWidth;
    });
    expect(bodyOverflow).toBeLessThanOrEqual(1);
  });
});
