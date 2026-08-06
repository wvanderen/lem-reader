// tests/e2e/pagination/repagination-anchor.spec.ts
// PAGE-05 — Reader remains anchored through viewport, typography, font, and
// supported asset changes while a previous valid view remains available
// during repagination (D4-11 repagination anchor).
//
// SCENARIO: Reader is on page N at D-05 offset X. A viewport resize (or
// typography change) invalidates the current pagination. The engine
// repaginates; the reader lands on the page containing offset X (D4-11
// anchor). During the in-flight repagination, the previous page stays
// mounted (no blank flash — PAGE-06 last-valid-view retention).
//
// Reuses the rapid-trigger harness discipline from stale-drop.spec.ts. Uses
// essay-long-form (paginates cleanly at default settings).
//
// Harness copied verbatim from tests/e2e/measurement/stale-drop.spec.ts.
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

interface PaginationDev {
  currentPageIdx: number;
  pagesLength: number;
  status: string;
}

async function readPagination(page: import("@playwright/test").Page): Promise<PaginationDev> {
  return page.evaluate(
    () => (window as unknown as Record<string, unknown>).__lemPagination as PaginationDev,
  );
}

test.describe("PAGE-05 repagination anchor (04-05)", () => {
  test("viewport resize re-derives pages and keeps the reader on the same passage (D4-11)", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForFunction(
      () =>
        (window as unknown as Record<string, unknown>).__lemPagination !== undefined,
      undefined,
      { timeout: 8000 },
    );
    await page.waitForTimeout(600);
    const dev0 = await readPagination(page);
    // Plan 04-06: essay-long-form paginates cleanly; status "ok" with ≥2
    // pages is the contract. A fallback here is a real engine regression.
    expect(dev0.status, "engine status before resize").toBe("ok");
    expect(dev0.pagesLength, "essay-long-form must produce ≥2 pages").toBeGreaterThanOrEqual(2);

    // Turn to page 3 (index 2) and capture its first passage's text — the
    // passage to preserve across the resize.
    await page.getByRole("button", { name: "Next page" }).click();
    await page.getByRole("button", { name: "Next page" }).click();
    await page.waitForTimeout(200);
    const passageHeading = await page.evaluate(() => {
      const fragment = document.querySelector(".page-fragment");
      const h = fragment?.querySelector("h2, h3, h4, p");
      return h?.textContent?.trim()?.slice(0, 40) ?? null;
    });
    expect(passageHeading, "page 3 must have a passage to anchor on").not.toBeNull();

    // Resize the viewport (PAGE-05 trigger). The coalescer debounces; the
    // engine repaginates; D4-11 anchor keeps the reader on the page with the
    // captured passage.
    await page.setViewportSize({ width: 480, height: 700 });
    // Let the coalescer + font gate + measure pass settle.
    await page.waitForTimeout(1500);

    const dev1 = await readPagination(page);
    expect(dev1.status, "repagination must produce ok status").toBe("ok");

    // The captured passage should still be on the current (or immediately
    // adjacent) page after repagination.
    const stillOnPassage = await page.evaluate((needle) => {
      if (!needle) return false;
      const fragment = document.querySelector(".page-fragment");
      return !!fragment && fragment.textContent?.includes(needle);
    }, passageHeading);
    expect(
      stillOnPassage,
      "D4-11 anchor must keep the reader on the captured passage's page after resize",
    ).toBeTruthy();

    expect(pageErrors, "no uncaught errors during repagination").toEqual([]);
  });

  test("typography change (size 18→24) repaginates and keeps the passage (D4-11)", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForFunction(
      () =>
        (window as unknown as Record<string, unknown>).__lemPagination !== undefined,
      undefined,
      { timeout: 8000 },
    );
    await page.waitForTimeout(600);
    const dev0 = await readPagination(page);
    // Plan 04-06: essay-long-form paginates cleanly. A fallback here is a
    // real engine regression (no skip).
    expect(dev0.status, "engine status before typography change").toBe("ok");
    expect(dev0.pagesLength, "essay-long-form must produce ≥2 pages").toBeGreaterThanOrEqual(2);

    // Capture the current passage before the typography change.
    const passageHeading = await page.evaluate(() => {
      const fragment = document.querySelector(".page-fragment");
      const h = fragment?.querySelector("h2, h3, h4, p");
      return h?.textContent?.trim()?.slice(0, 40) ?? null;
    });

    // Open settings + crank size 18→24 (typography trigger).
    await page.getByRole("button", { name: "Reading settings" }).click();
    const slider = page.getByRole("slider", { name: "Text size" });
    await slider.focus();
    await slider.press("ArrowUp");
    await slider.press("ArrowUp");
    await slider.press("ArrowUp"); // 18 → 24
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1500);

    const dev1 = await readPagination(page);
    // Plan 04-06: essay-long-form paginates cleanly even at 24px. Assert
    // status "ok" + the D4-11 anchor round-trip unconditionally — a fallback
    // here is a real engine regression (no skip).
    expect(dev1.status, "repagination at size 24 must produce ok status").toBe("ok");
    const stillOnPassage = await page.evaluate((needle) => {
      if (!needle) return false;
      const fragment = document.querySelector(".page-fragment");
      return !!fragment && fragment.textContent?.includes(needle);
    }, passageHeading);
    expect(
      stillOnPassage,
      "D4-11 anchor must keep the reader on the passage after typography change",
    ).toBeTruthy();

    expect(pageErrors, "no uncaught errors during typography repagination").toEqual([]);
  });
});
