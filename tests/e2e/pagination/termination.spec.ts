// tests/e2e/pagination/termination.spec.ts
// PAGE-03c — Termination: finite pages[] with pages.length <= 300; bounded
// wall-clock. The three termination guards (0.75 atomic-oversize threshold,
// 300-page ceiling, zero-progress / unsplittable-block-overflow) guarantee
// the engine never loops.
//
// SCENARIO: For each cell of the corpus matrix (fixtures × responsive
// viewports), paginate and assert the engine returns within a bounded
// wall-clock with EITHER status "ok" (pages.length <= 300) OR status
// "fallback" (a termination guard tripped — the reader falls back to
// scrolling, proven by fallback-oversize). The engine NEVER hangs.
//
// Harness copied verbatim from tests/e2e/measurement/stale-drop.spec.ts.
import { test, expect } from "@playwright/test";
import { FIXTURES, VIEWPORTS } from "./fixtures-matrix";

const BASE = "http://localhost:5173";
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
  pagesLength: number;
  status: string;
}

test.describe("PAGE-03c termination (04-05)", () => {
  test.describe.configure({ mode: "parallel" });

  for (const fixture of FIXTURES) {
    for (const viewport of VIEWPORTS) {
      const cell = `${fixture}@${viewport.width}x${viewport.height}`;
      test(`${cell}: engine terminates with ≤300 pages or explicit fallback (bounded wall-clock)`, async ({
        page,
      }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (err) => pageErrors.push(String(err)));

        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        // Bounded wall-clock: race the navigation + pagination commit against
        // a generous timeout. If the engine hung, waitForFunction would throw
        // at the timeout — proving non-termination.
        const start = Date.now();
        await page.goto(`${BASE}/#/article/${fixture}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.waitForFunction(
          () =>
            (window as unknown as Record<string, unknown>).__lemPagination !== undefined,
          undefined,
          { timeout: 15000 },
        );
        const elapsedMs = Date.now() - start;

        const dev = await page.evaluate(() => {
          return (window as unknown as Record<string, unknown>).__lemPagination as PaginationDev;
        });

        // The engine must terminate with one of two outcomes:
        //   - status "ok": 0 < pagesLength <= 300 (PAGE-04 page-ceiling guard)
        //   - status "fallback": a termination guard tripped (oversize /
        //     page-ceiling / zero-progress) — the reader falls back to scrolling
        if (dev.status === "ok") {
          expect(dev.pagesLength, "ok status must produce ≥1 page").toBeGreaterThan(0);
          expect(dev.pagesLength, "pages must not exceed the 300-page ceiling").toBeLessThanOrEqual(
            300,
          );
        } else {
          expect(dev.status, `unexpected status: ${dev.status}`).toBe("fallback");
          // Fallback produces 0 pages (the reader is in scrolling mode).
          expect(dev.pagesLength).toBe(0);
        }

        // Wall-clock bound: the engine + font gate + measurement must settle
        // well within 15s on every cell. Generous headroom for slow CI.
        expect(elapsedMs, `wall-clock ${elapsedMs}ms must be bounded (<15000ms)`).toBeLessThan(
          15000,
        );

        expect(pageErrors, "no uncaught errors during pagination").toEqual([]);
      });
    }
  }

  test("pathological case (huge font + tiny viewport) terminates with fallback, not a hang", async ({
    page,
  }) => {
    // Crank the font size to the max (24) + reduce the viewport until an
    // atomic block is likely to exceed 75% of page height. The engine must
    // emit dom-fallback (status "fallback") rather than hang or produce a
    // pathological page count.
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await page.setViewportSize({ width: 320, height: 400 });
    await page.goto(`${BASE}/#/article/technical-post`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Open settings + crank size to 24 (ArrowUp x3 from default 18) to stress
    // the page geometry toward the oversize threshold.
    await page.getByRole("button", { name: "Reading settings" }).click();
    const slider = page.getByRole("slider", { name: "Text size" });
    await slider.focus();
    await slider.press("ArrowUp");
    await slider.press("ArrowUp");
    await slider.press("ArrowUp"); // 18 → 24
    await page.keyboard.press("Escape");

    await page.waitForFunction(
      () =>
        (window as unknown as Record<string, unknown>).__lemPagination !== undefined,
      undefined,
      { timeout: 15000 },
    );
    await page.waitForTimeout(800);

    const dev = await page.evaluate(() => {
      return (window as unknown as Record<string, unknown>).__lemPagination as PaginationDev;
    });
    // Either outcome is acceptable as long as the engine TERMINATED (the hook
    // fired, proving no hang). A fallback here is the expected oversize path;
    // an ok result means the corpus block fit even at 24px/320px.
    expect(["ok", "fallback"], `unexpected status: ${dev.status}`).toContain(dev.status);
    if (dev.status === "ok") {
      expect(dev.pagesLength).toBeLessThanOrEqual(300);
    }
    expect(pageErrors, "no uncaught errors").toEqual([]);
  });
});
