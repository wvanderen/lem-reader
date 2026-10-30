import { waitForPageSettled } from "../pagination/_harness";
import { test, expect } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  drawerTrigger,
  modeToggle,
  waitForReadingSurface,
} from "./_fixtures";

for (const mode of ["paginated", "scrolling"] as const) {
  test(`${mode}: independent reflections save, retain order, recover empty edits and delete deliberately`, async ({
    page,
  }) => {
    await wipeDatabase(page);
    await openArticle(page, FIXTURES[0]!);
    if (mode === "scrolling") {
      await modeToggle(page).click();
      await waitForReadingSurface(page);
    }
    if (mode === "paginated") {
      await page.getByRole("button", { name: "Next page", exact: true }).click();
      await waitForPageSettled(page, 1);
    } else {
      await page.evaluate(() => window.scrollTo(0, 800));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    }
    const scrollY = await page.evaluate(() => window.scrollY);
    const location = await page.evaluate(() =>
      JSON.stringify((window as unknown as { __lemPagination: unknown }).__lemPagination),
    );
    await drawerTrigger(page).click();
    const section = page.getByRole("region", { name: "Article notes", exact: true });
    const add = section.getByRole("button", { name: "Add article note" });
    const text = page.getByRole("textbox", { name: "Article note", exact: true });
    await add.click();
    await section.getByRole("button", { name: "Done", exact: true }).click();
    await expect(section.locator("li")).toHaveCount(0);
    await add.click();
    await text.fill("   ");
    await section.getByRole("button", { name: "Done", exact: true }).click();
    await expect(section.locator("li")).toHaveCount(0);
    for (const reflection of ["First reflection", "Second reflection"]) {
      await add.click();
      await text.fill(reflection);
      await expect(section.getByRole("status")).toHaveText("Saved.");
      await section.getByRole("button", { name: "Done", exact: true }).click();
      await expect(add).toBeFocused();
    }
    await expect(section.locator("li")).toHaveText(["Second reflection", "First reflection"]);
    const first = section.getByRole("button", { name: "First reflection", exact: true });
    await first.click();
    await text.fill("Edited first reflection");
    await expect(section.getByRole("status")).toHaveText("Saved.");
    await page.keyboard.press("Escape");
    await expect(
      section.getByRole("button", { name: "Edited first reflection", exact: true }),
    ).toBeFocused();
    await expect(section.locator("li")).toHaveText([
      "Second reflection",
      "Edited first reflection",
    ]);
    expect(
      await page.evaluate(() =>
        JSON.stringify((window as unknown as { __lemPagination: unknown }).__lemPagination),
      ),
    ).toBe(location);
    await page.getByRole("button", { name: "Close highlights and notes", exact: true }).click();
    await expect(drawerTrigger(page)).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
    await page.reload();
    await waitForReadingSurface(page);
    await drawerTrigger(page).click();
    await section.getByRole("button", { name: "Edited first reflection", exact: true }).click();
    await text.fill("");
    await expect(section.getByRole("status")).toContainText("last saved text is preserved");
    await page.reload();
    await waitForReadingSurface(page);
    await drawerTrigger(page).click();
    await section.getByRole("button", { name: "Edited first reflection", exact: true }).click();
    await expect(text).toHaveValue("");
    await expect(section.getByRole("status")).toHaveText("Recovered draft");
    await section.getByRole("button", { name: "Delete article note", exact: true }).click();
    await section.getByRole("button", { name: "Keep note", exact: true }).click();
    await expect(text).toHaveValue("");
    await section.getByRole("button", { name: "Delete article note", exact: true }).click();
    await section.getByRole("button", { name: "Confirm delete article note", exact: true }).click();
    await expect(section.locator("li")).toHaveText(["Second reflection"]);
    await expect(add).toBeFocused();
  });
}

test("narrow screen and magnified UI keep article-note actions reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await wipeDatabase(page);
  await openArticle(page, FIXTURES[0]!);
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  await drawerTrigger(page).click();
  await page.getByRole("button", { name: "Add article note" }).click();
  const text = page.getByRole("textbox", { name: "Article note", exact: true });
  await text.fill("A reflection at high magnification.");
  await expect(page.locator(".article-notes [role=status]")).toHaveText("Saved.");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add article note" })).toBeFocused();
});

test("failed article-note saving recovers interrupted writing after reload", async ({ page }) => {
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof original>) {
      const result = original.apply(this, args);
      if (
        this.name === "articleNotes" &&
        (window as unknown as Record<string, unknown>).__failArticleNoteSaves
      ) {
        const transaction = this.transaction;
        void Promise.resolve().then(() => transaction.abort());
      }
      return result;
    };
  });
  await wipeDatabase(page);
  await openArticle(page, FIXTURES[0]!);
  await drawerTrigger(page).click();
  await page.getByRole("button", { name: "Add article note" }).click();
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__failArticleNoteSaves = true;
  });
  const text = page.getByRole("textbox", { name: "Article note", exact: true });
  await text.fill("Writing interrupted by a failed save");
  const status = page.locator(".article-notes [role=status]");
  await expect(status).toContainText("Couldn't save");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(text).toHaveValue("Writing interrupted by a failed save");
  await page.reload();
  await waitForReadingSurface(page);
  await drawerTrigger(page).click();
  await page
    .getByRole("button", { name: "Writing interrupted by a failed save", exact: true })
    .click();
  await expect(text).toHaveValue("Writing interrupted by a failed save");
  await expect(status).toHaveText("Recovered draft");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(status).toHaveText("Saved.");
  await page.reload();
  await waitForReadingSurface(page);
  await drawerTrigger(page).click();
  await expect(
    page.getByRole("button", { name: "Writing interrupted by a failed save", exact: true }),
  ).toBeVisible();
});
