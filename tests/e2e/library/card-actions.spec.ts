import { test, expect } from "@playwright/test";
import { BASE } from "../_base";

test("card navigation and read status stay independent and persist", async ({ page }) => {
  await page.goto(BASE);
  const card = page.locator(".library-row").filter({ hasText: "Getting started with Lem Reader" });
  // This starter is chaptered: its existing state action opens correction
  // details rather than mixing mutations into the reader's navigation.
  await card.getByRole("button", { name: /^Reading status for / }).click();
  const dialog = page.getByRole("dialog", { name: "Reading status" });
  await dialog.getByRole("button", { name: "Mark finished: Whole reading", exact: true }).click();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(card.getByText("Finished", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(BASE + "/");
  await page.reload();
  await card.getByRole("button", { name: /^Reading status for / }).click();
  await dialog.getByRole("button", { name: "Mark unfinished: Whole reading", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Mark finished: Whole reading", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("link", { name: "Unread (1)", exact: true })).toBeVisible();
  await page.reload();
  await expect(card.getByRole("button", { name: /^Reading status for / })).toBeVisible();
  await expect(card.getByText("Finished", { exact: true })).toHaveCount(0);
  // The bare corner is covered by the title's native link.
  await card.click({ position: { x: 10, y: 10 } });
  await expect(page).toHaveURL(/#\/article\//);
});
