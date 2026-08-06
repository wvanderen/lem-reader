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
// Plan 04-08: this Phase 3 spec observes scrolling-mode DOM stability —
// article.children.length stays >= childCountBefore because the scrolling
// ArticleBody stays mounted throughout the re-measure cycle. The Phase 4
// D4-12 default (paginated) legitimately restructures the article DOM when
// PaginatedSurface activates (ArticleBody → page-fragment chrome), which
// would change the child count for reasons unrelated to the staleness
// contract under test. We seed readingMode "scrolling" so the spec runs in
// its Phase 3 habitat — the same pattern Plan 04-06 Task 5 established for
// the STATE-01 location-restore tests (which likewise assume scrolling mode).
// The paginated-mode re-measurement contract is proven separately by
// stale-drop.spec.ts (PAGE-07), which runs under the D4-12 default and
// exercises the production fix (hidden ArticleBody alongside PaginatedSurface).
//
// Reuses the typography-live-apply.spec.ts harness.
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5173";
const FIXTURE = "essay-long-form";
const PIXEL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';

/**
 * Seed the Dexie `settings` store with a reader-prefs record carrying
 * `readingMode: "scrolling"` so a SUBSEQUENT reload hydrates scrolling mode.
 * Mirrors Plan 04-06 Task 5's seedScrollingMode helper in persistence.spec.ts.
 * MUST run AFTER the IndexedDB wipe AND AFTER the app's first load (so Dexie
 * has declared its schema). Callers navigate, call this, then reload.
 */
async function seedScrollingMode(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains("settings")) {
            resolve();
            return;
          }
          const tx = db.transaction("settings", "readwrite");
          const store = tx.objectStore("settings");
          store.put({
            key: "reader-prefs",
            value: {
              schemaVersion: 2,
              font: "serif",
              size: 18,
              measure: 64,
              spacing: "comfortable",
              theme: "sepia",
              readingMode: "scrolling",
            },
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      };
      req.onerror = () => resolve();
    });
  });
}

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
    // Plan 04-08: first navigation establishes Dexie's schema so the seed
    // can write to the settings store; reload hydrates scrolling mode.
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await seedScrollingMode(page);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Wait for SettingsProvider hydration to apply the scrolling mode.
    await page.waitForTimeout(500);

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
