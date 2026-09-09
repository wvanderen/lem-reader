import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5173";

test("card navigation and read status stay independent and persist", async ({ page }) => {
  await page.goto(BASE);
  const card = page.locator(".library-row").filter({ hasText: "Getting started with Lem Reader" });
  await card.getByRole("button", { name: /^Mark as read:/ }).click();
  await expect(card.getByText("Finished", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(BASE + "/");
  await page.reload();
  await card.getByRole("button", { name: /^Mark as unread:/ }).click();
  await expect(card.getByRole("button", { name: /^Mark as read:/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Unread (1)", exact: true })).toBeVisible();
  await page.reload();
  await expect(card.getByRole("button", { name: /^Mark as read:/ })).toBeVisible();
  // The bare corner is covered by the title's native link.
  await card.click({ position: { x: 10, y: 10 } });
  await expect(page).toHaveURL(/#\/article\//);
});
