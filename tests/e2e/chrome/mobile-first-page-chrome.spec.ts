import { expect, test, type Page } from "@playwright/test";

const BASE = "http://localhost:5173";
const FIXTURE = "essay-long-form";

type Rect = { top: number; right: number; bottom: number; left: number; width: number; height: number };

async function openReady(page: Page, width: 320 | 360): Promise<void> {
  await page.setViewportSize({ width, height: 640 });
  await page.goto(`${BASE}/#/article/${FIXTURE}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForFunction(
    () => (window as unknown as Record<string, unknown>).__lemPagination !== undefined,
  );
  await page.waitForTimeout(600);
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string): Rect | null => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return null;
      const { top, right, bottom, left, width, height } = element.getBoundingClientRect();
      return { top, right, bottom, left, width, height };
    };
    return {
      appHeader: rect(".app-header"),
      resume: rect(".resume-banner"),
      article: rect("article.paginated-surface"),
      articleHeader: rect("article.paginated-surface > header"),
      back: rect(".back-to-library"),
      indicator: rect(".page-indicator"),
      viewport: rect(".page-viewport"),
      meta: rect(".article-top-meta"),
      firstText: rect(".page-fragment p"),
      main: rect("main.paginated-main"),
      mainScrollTop: document.querySelector<HTMLElement>("main.paginated-main")?.scrollTop ?? null,
      articleScrollTop: document.querySelector<HTMLElement>("article.paginated-surface")?.scrollTop ?? null,
    };
  });
}

for (const width of [320, 360] as const) {
  test(`mobile paginated chrome stays vertically ordered at ${width}px`, async ({ page }) => {
    await openReady(page, width);
    const fresh = await geometry(page);
    expect(fresh.appHeader).not.toBeNull();
    expect(fresh.articleHeader).not.toBeNull();
    expect(fresh.back).not.toBeNull();
    expect(fresh.indicator).not.toBeNull();
    expect(fresh.meta).not.toBeNull();
    expect(fresh.back!.height).toBeGreaterThanOrEqual(44);
    expect(fresh.back!.top).toBeGreaterThanOrEqual(fresh.articleHeader!.top);
    expect(fresh.back!.bottom).toBeLessThanOrEqual(fresh.articleHeader!.bottom);
    expect(fresh.indicator!.top).toBeGreaterThanOrEqual(fresh.articleHeader!.top);
    expect(fresh.indicator!.bottom).toBeLessThanOrEqual(fresh.articleHeader!.bottom);
    expect(fresh.articleHeader!.bottom).toBeLessThanOrEqual(fresh.meta!.top);

    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("lem-reader");
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("location", "readwrite");
          transaction.objectStore("location").put({
            schemaVersion: 1,
            articleId: "essay-long-form",
            revision: 1,
            graphemeOffset: 500,
            savedAt: new Date().toISOString(),
          });
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        };
        request.onerror = () => reject(request.error);
      });
    });
    await page.reload();
    await expect(page.getByRole("status").filter({ hasText: "You left off here" })).toBeVisible();
    await page.waitForFunction(
      () => (window as unknown as Record<string, unknown>).__lemPagination !== undefined,
    );
    await page.waitForTimeout(600);
    const resumed = await geometry(page);
    expect(resumed.resume).not.toBeNull();
    expect(resumed.article).not.toBeNull();
    expect(resumed.resume!.top).toBeGreaterThanOrEqual(resumed.appHeader!.bottom);
    expect(resumed.resume!.bottom).toBeLessThanOrEqual(640);
    expect(Math.abs(resumed.article!.top - fresh.article!.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(resumed.article!.bottom - fresh.article!.bottom)).toBeLessThanOrEqual(1);
    expect(resumed.article!.bottom).toBeLessThanOrEqual(resumed.main!.bottom);
  });
}
