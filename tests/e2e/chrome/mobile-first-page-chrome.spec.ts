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
      // Plan 18-03 (D18-06): the restore-surface assertion target is the
      // restoration marker (the resume banner's replacement — the retired
      // `.resume` box is gone).
      marker: rect(".restoration-marker"),
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
    // Plan 18-03 (D18-06 — deliberate retirement): the restore surface is
    // now the passive restoration marker + its polite announce (the resume
    // banner and its "You left off here" copy are retired). The paginated
    // reopen lands on the page containing the saved offset (Plan 18-03's
    // readiness-gated restore) and the marker attaches to that page
    // fragment's edge.
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Returned to where you left off." }),
    ).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator(".restoration-marker")).toHaveCount(1, {
      timeout: 10_000,
    });
    await page.waitForFunction(
      () => (window as unknown as Record<string, unknown>).__lemPagination !== undefined,
    );
    await page.waitForTimeout(600);
    // The marker is transient (4s lifecycle) — geometry must be read while
    // it is still mounted; the assertions below therefore run immediately.
    const resumed = await geometry(page);
    expect(resumed.marker).not.toBeNull();
    expect(resumed.article).not.toBeNull();
    // Overlay-only: the marker never shifts the pinned paginated geometry.
    expect(Math.abs(resumed.article!.top - fresh.article!.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(resumed.article!.bottom - fresh.article!.bottom)).toBeLessThanOrEqual(1);
    expect(resumed.article!.bottom).toBeLessThanOrEqual(resumed.main!.bottom);
    // The marker bar rides the restored page fragment's inline-start edge
    // for the fragment's FULL height — the fragment's box can extend a few
    // px past the article's overflow:clip bottom, so the honest bounds are
    // the header line above and the viewport below (the retired banner's
    // bounds), plus visibility through the article's clip box.
    expect(resumed.marker!.top).toBeGreaterThanOrEqual(resumed.appHeader!.bottom - 1);
    expect(resumed.marker!.bottom).toBeLessThanOrEqual(640);
    expect(resumed.marker!.top).toBeLessThan(resumed.article!.bottom);
  });
}
