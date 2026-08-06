// tests/e2e/pagination/no-overflow-invariant.spec.ts
// PAGE-03b — No clipping: no page's rendered content overflows its content-box
// (scrollHeight <= contentBoxHeight + tolerance). The .paginated-surface is
// overflow:hidden so any overflow is a fragmentation bug — visible clipping or
// scroll-bar leakage fails PAGE-03.
//
// SCENARIO: For each cell of the corpus matrix (fixtures × responsive
// viewports), turn through every page and assert the article element's
// scrollHeight stays within its content-box height (small tolerance for
// sub-pixel rounding). Capture pageerror and assert none (V7).
//
// Fixtures that trip the MVP dom-fallback (containers) are skipped — they
// render in scrolling mode where overflow is the native scroll behavior, not a
// pagination bug. No-overflow is asserted only on status === "ok" cells.
//
// Matrix note: iterates FIXTURES × VIEWPORTS at the default typography (the
// no-overflow property is viewport-sensitive — narrower viewports produce
// taller blocks — but typography-independent in invariant form).
//
// Harness copied verbatim from tests/e2e/measurement/stale-drop.spec.ts.
import { test, expect } from "@playwright/test";
import { FIXTURES, VIEWPORTS, type Viewport } from "./fixtures-matrix";

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

async function waitForPaginationReady(
  page: import("@playwright/test").Page,
  fixture: string,
  viewport: Viewport,
): Promise<PaginationDev> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(`${BASE}/#/article/${fixture}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForFunction(
    () =>
      (window as unknown as Record<string, unknown>).__lemPagination !== undefined,
    undefined,
    { timeout: 8000 },
  );
  await page.waitForTimeout(600);
  return page.evaluate(() => {
    return (window as unknown as Record<string, unknown>).__lemPagination as PaginationDev;
  });
}

test.describe("PAGE-03b no-overflow invariant (04-05)", () => {
  test.describe.configure({ mode: "parallel" });

  for (const fixture of FIXTURES) {
    for (const viewport of VIEWPORTS) {
      const cell = `${fixture}@${viewport.width}x${viewport.height}`;
      test(`${cell}: no page overflows its content-box (scrollHeight ≤ contentBoxHeight + tolerance)`, async ({
        page,
      }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (err) => pageErrors.push(String(err)));

        const dev = await waitForPaginationReady(page, fixture, viewport);

        if (dev.status !== "ok" || dev.pagesLength === 0) {
          test.skip(true, `fixture tripped dom-fallback (status=${dev.status}) — PAGE-04 scope`);
          return;
        }

        const totalPages = dev.pagesLength;
        // Tolerance for sub-pixel rounding between engine measurement
        // (getBoundingClientRect fractional) and scrollHeight (integer). 2px
        // is generous for the corpus; a real fragmentation overflow is tens
        // of pixels.
        const TOLERANCE_PX = 2;

        // Turn through every page; after each turn settles, read the article
        // element's scrollHeight vs its clientHeight (content-box). The
        // .paginated-surface is overflow:hidden so clientHeight is the box;
        // scrollHeight > clientHeight + tolerance means content clipped.
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
          // Read geometry for the current page.
          const geom = await page.evaluate(() => {
            const el = document.querySelector(".article-body.paginated-surface") as HTMLElement | null;
            if (!el) return null;
            return {
              scrollHeight: el.scrollHeight,
              clientHeight: el.clientHeight,
            };
          });
          expect(geom, `page ${pageNum}: paginated-surface must be mounted`).not.toBeNull();
          const overflow = geom!.scrollHeight - geom!.clientHeight;
          expect(
            overflow,
            `page ${pageNum}/${totalPages}: scrollHeight (${geom!.scrollHeight}) must not exceed clientHeight (${geom!.clientHeight}) + ${TOLERANCE_PX}px tolerance`,
          ).toBeLessThanOrEqual(TOLERANCE_PX);

          // Turn to the next page (chevron click — the shared turn path).
          if (pageNum < totalPages) {
            const next = page.getByRole("button", { name: "Next page" });
            await next.click();
            // Let the new page render + measurement settle.
            await page.waitForTimeout(150);
          }
        }

        expect(pageErrors, "no uncaught errors during pagination").toEqual([]);
      });
    }
  }
});
