import { test, expect } from "@playwright/test";
import { BASE } from "../_base";
import { openSettings, prepareFreshPage, seedRows } from "../portability/_portability";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import starter from "../../../src/fixtures/articles/getting-started.canonical.json" with { type: "json" };

test.beforeEach(async ({ page }) => {
  await prepareFreshPage(page);
});

for (const readingMode of ["paginated", "scrolling"] as const) {
  test(`explicit restore focuses the heading with an imported position in ${readingMode} mode`, async ({
    page,
  }) => {
    // State after importing a starter position into a library that removed it.
    await seedRows(page, {
      settings: [
        { key: "starter-article-removed", value: true },
        { key: "reader-prefs", value: { ...DEFAULT_SETTINGS, readingMode } },
      ],
      locations: [
        {
          schemaVersion: 1,
          articleId: starter.id,
          revision: starter.revision,
          graphemeOffset: 100,
          savedAt: new Date().toISOString(),
        },
      ],
    });
    await page.goto(`${BASE}/#/article/getting-started`);
    await expect(
      page.getByRole("heading", { name: "Getting Started is unavailable." }),
    ).toBeVisible();
    const restore = page.getByRole("button", { name: "Restore Getting Started" });
    await restore.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { level: 1, name: starter.provenance.title }),
    ).toBeFocused();
    await expect(page.getByRole("article")).toBeVisible();
  });
}

test("deletion survives reload of an empty library and Settings restores it", async ({ page }) => {
  const card = page.locator(".library-row").filter({ hasText: starter.provenance.title });
  await card.locator(".library-row-remove").click();
  await page.locator("dialog.library-remove-confirm .library-remove-destructive").click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible();
  await expect(card).toHaveCount(0);
  const settings = await openSettings(page);
  await settings.getByRole("button", { name: "Restore Getting Started" }).click();
  await expect(settings.getByText("Getting Started restored to your library.")).toBeVisible();
  await settings.getByRole("button", { name: "Close reading settings" }).click();
  await expect(card).toBeVisible();
  await page.reload();
  await expect(card).toBeVisible();
});

test("tag filter stays below sort and operable at narrow width and high zoom", async ({ page }) => {
  await seedRows(page, {
    articles: [{ ...starter, id: "tagged-starter", tags: ["reading", "accessibility"] }],
  });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.reload();
  const filter = page.getByRole("group", { name: "Filter by tag", exact: true });
  await expect(filter).toBeVisible();
  const geometry = await page.locator(".library-toolbar").evaluate((toolbar) => {
    const filter = toolbar.querySelector(".tag-filter")!.getBoundingClientRect();
    const sort = toolbar.querySelector("select")!.getBoundingClientRect();
    return {
      filterTop: filter.top,
      sortBottom: sort.bottom,
      left: filter.left,
      right: filter.right,
      width: window.innerWidth,
      scrollWidth: document.body.scrollWidth,
    };
  });
  expect(geometry.filterTop).toBeGreaterThanOrEqual(geometry.sortBottom);
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.width);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width + 1);
  const reading = filter.getByRole("button", { name: "Filter by tag: reading" });
  await reading.click();
  await expect(filter.getByRole("button", { name: /Active filter: reading/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.evaluate(() => {
    document.body.style.zoom = "4";
  });
  await filter.getByRole("button", { name: /Active filter: reading/ }).click();
  await expect(reading).toHaveAttribute("aria-pressed", "false");
});
