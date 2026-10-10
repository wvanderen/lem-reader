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
  await page.getByRole("button", { name: "Read aloud", exact: true }).click();
  await expect(page.locator(".readaloud-failure")).toContainText("loud audio pops");
  await expect(page.getByRole("status").filter({ hasText: "loud audio pops" })).toBeAttached();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { __speechSpoken: unknown[] }).__speechSpoken.length,
    ),
  ).toBe(0);
});
