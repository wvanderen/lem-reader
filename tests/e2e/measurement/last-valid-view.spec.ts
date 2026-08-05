// tests/e2e/measurement/last-valid-view.spec.ts
// PAGE-06 (last-valid-view retention) — real-browser proof across the three
// supported engines. A re-measure cycle (viewport resize) MUST NOT blank
// the article: the previously-rendered content stays mounted continuously
// while the engine computes a newer trusted view. The h1 + the first
// paragraph remain visible before, during, and after the cycle.
//
// D3-04 (invisible by default): the `role="status"` live region MUST NOT
// receive measurement chatter. The test captures its text before and after
// the re-measure and asserts equality — measurement must never write there.
//
// Reuses the typography-live-apply.spec.ts harness.
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5173";
const FIXTURE = "essay-long-form";
const PIXEL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';

test.beforeEach(async ({ page }) => {
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: PIXEL_SVG }),
  );
  await page.goto(`${BASE}/`);
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("lem-reader");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
});

test.describe("PAGE-06 last-valid-view retention (03-01)", () => {
  test("the article h1 + first paragraph stay visible across a re-measure cycle (no blank flash)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIXTURE}`);

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();

    // The first paragraph in document order. ArticleBody emits blocks in
    // array order; the first <p> is the first prose paragraph.
    const firstParagraph = page.locator("article p").first();
    await expect(firstParagraph).toBeVisible();

    // Capture the status region's text BEFORE the re-measure (D3-04 —
    // measurement must not write here). The status region only carries
    // copy during loading/error states, which we are not in.
    const statusBefore = await page
      .locator('[role="status"]')
      .textContent({ timeout: 2000 })
      .catch(() => null);

    // Capture visibility state at three points: before, mid-flight (during
    // the resize that triggers a re-measure), and after the debounce +
    // engine commit settle. The article element must NEVER lose its child
    // content across the cycle.
    const article = page.locator("article");
    const childCountBefore = await article.evaluate((el) => el.children.length);

    // Trigger the re-measure: a viewport resize bumps the ResizeObserver
    // → coalescer schedules a debounced trigger → engine runs.
    await page.setViewportSize({ width: 900, height: 1100 });

    // Mid-flight assertion: immediately after the resize, the article must
    // STILL have its content (the previous render stays mounted while the
    // engine computes the next trusted view).
    const childCountDuring = await article.evaluate((el) => el.children.length);
    expect(
      childCountDuring,
      "article must retain content during the in-flight re-measure",
    ).toBeGreaterThanOrEqual(childCountBefore);

    // h1 + first paragraph never disappeared.
    await expect(h1).toBeVisible();
    await expect(firstParagraph).toBeVisible();

    // Let the coalescer's 400ms debounce + the engine's font-gate + DOM
    // measure settle (D3-06 mandates re-awaiting document.fonts.ready).
    await page.waitForTimeout(1500);

    // After the cycle: content + h1 still visible.
    await expect(h1).toBeVisible();
    await expect(firstParagraph).toBeVisible();
    const childCountAfter = await article.evaluate((el) => el.children.length);
    expect(
      childCountAfter,
      "article must retain content after the re-measure",
    ).toBeGreaterThanOrEqual(childCountBefore);

    // D3-04: the status region is unchanged by measurement activity.
    const statusAfter = await page
      .locator('[role="status"]')
      .textContent({ timeout: 2000 })
      .catch(() => null);
    expect(statusAfter, "status region must NOT change due to measurement").toBe(
      statusBefore,
    );
  });
});
