import { test, expect } from "@playwright/test";
import { ArticleSchema, CollectionSchema } from "../../../src/content/schema";
import { listWorkChapterTargets } from "../../../src/content/chapterTargets";
import { prepareFreshPage, seedRows, readRow, BASE } from "../portability/_portability";

const article = ArticleSchema.parse({
  id: "status-reading",
  revision: 1,
  lang: "en",
  provenance: {
    title: "A reading with chapters",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "status-reading",
  },
  blocks: ["First chapter", "Second chapter", "Third chapter"].flatMap((title) => [
    { kind: "heading", level: 2, content: [{ text: title }] },
    { kind: "paragraph", content: [{ text: "A calm reading passage. ".repeat(20) }] },
  ]),
});
const chapter = listWorkChapterTargets(article)[0]!;

test("Reading status is usable on narrow screens and recovers honestly from a failed correction", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await prepareFreshPage(page);
  const collection = CollectionSchema.parse({
    schemaVersion: 1,
    id: "status-plan",
    name: "Reading plan",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    entries: [
      {
        id: "first",
        target: { kind: "work-chapter", articleId: article.id, destinationId: chapter.id },
        addedAt: "2026-01-01T00:00:00Z",
      },
    ],
  });
  const location = {
    schemaVersion: 1,
    articleId: article.id,
    revision: 1,
    graphemeOffset: 50,
    savedAt: "2026-01-01T00:00:00Z",
  };
  await seedRows(page, { articles: [article], locations: [location], collections: [collection] });
  await page.reload();
  const trigger = page.getByRole("button", {
    name: "Reading status for A reading with chapters",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Reading status" });
  const close = dialog.getByRole("button", { name: "Close", exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Mark finished: Whole reading", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(close).toBeFocused();
  // Native modal inertness rejects focus on the underlying library.
  await trigger.evaluate((element) => (element as HTMLElement).focus());
  await expect(close).toBeFocused();
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("reading-status-narrow.png") });

  // Storage is the injected system seam; production persistence stays real.
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as unknown as { restorePut: () => void }).restorePut = () => {
      IDBObjectStore.prototype.put = original;
    };
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "completions") throw new DOMException("Storage full", "QuotaExceededError");
      return original.apply(this, args);
    };
  });
  const mark = dialog.getByRole("button", { name: "Mark finished: First chapter", exact: true });
  await mark.click();
  await expect(
    dialog.getByText("Couldn't save reading status. Try again.", { exact: true }),
  ).toBeVisible();
  await expect(close).toBeEnabled();
  await expect(mark).toBeEnabled();
  await page.evaluate(() => (window as unknown as { restorePut: () => void }).restorePut());
  await mark.click();
  await expect(
    dialog.getByRole("button", { name: "Mark unfinished: First chapter", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Couldn't save reading status. Try again.", { exact: true }),
  ).toHaveCount(0);
  expect(await readRow(page, "location", [article.id, 1])).toEqual(location);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.goto(`${BASE}/#/collections/${collection.id}`);
  await expect(page.locator(".collection-progress")).toHaveText("1 of 1 finished");
  await page.reload();
  await expect(page.locator(".collection-progress")).toHaveText("1 of 1 finished");
});
