import { test, expect } from "@playwright/test";
import { openArticle } from "./_harness";

test("Firefox explains the audio limitation without starting synthesis", async ({ page }) => {
  await openArticle(page, "word");
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Macintosh) Gecko/20100101 Firefox/157.0",
    });
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "Read aloud", exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "only supported in Chromium" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Read-aloud availability" })).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByRole("complementary", { name: "Read-aloud availability" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { __speechSpoken: unknown[] }).__speechSpoken.length,
    ),
  ).toBe(0);
});

test("read-aloud controls can be hidden and restored in settings", async ({ page }) => {
  await openArticle(page, "word");
  await page.getByRole("button", { name: "Reading settings", exact: true }).click();
  await page
    .locator(".settings-group > summary")
    .filter({ hasText: /^Read-aloud$/ })
    .click();
  const toggle = page.getByRole("checkbox", { name: "Show read-aloud controls" });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(page.getByRole("button", { name: "Read aloud", exact: true })).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByRole("button", { name: "Read aloud", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Reading settings", exact: true }).click();
  const group = page.locator(".settings-group > summary").filter({ hasText: /^Read-aloud$/ });
  if (!(await group.evaluate((el) => (el.parentElement as HTMLDetailsElement).open)))
    await group.click();
  await toggle.check();
  await expect(page.getByRole("button", { name: "Read aloud", exact: true })).toBeAttached();
});
