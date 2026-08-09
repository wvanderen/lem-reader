// tests/e2e/pagination/no-overflow-invariant.spec.ts
// PAGE-03b — No clipping: no page's rendered text lines extend below the page
// viewport. A fixed-height fragment can report a safe scrollHeight while block
// margins and text still paint beyond it, so this spec checks live Range rects
// in addition to the coarse scrollHeight invariant.
//
// SCENARIO: For each cell of the corpus matrix (fixtures × responsive
// viewports), turn through every page and assert that live text-line rects
// stay inside the dedicated page viewport. Retain scrollHeight as a coarse
// secondary check and assert that no page errors occur (V7).
//
// Plan 04-06: every corpus fixture paginates (containers included) — the
// no-overflow assertion runs unconditionally. (Earlier MVP skipped fixtures
// that tripped dom-fallback; that fallback path is now exercised only by
// the intentional fallback-oversize spec.)
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
      test(`${cell}: no rendered text crosses the page boundary`, async ({
        page,
      }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (err) => pageErrors.push(String(err)));

        const dev = await waitForPaginationReady(page, fixture, viewport);

        // Plan 04-06: every corpus fixture paginates. A non-ok status here
        // is a real engine regression — surface it instead of skipping.
        expect(dev.status, `engine status for ${cell}`).toBe("ok");
        expect(dev.pagesLength, `pages count for ${cell}`).toBeGreaterThan(0);

        const totalPages = dev.pagesLength;
        // Tolerance for sub-pixel rounding between engine measurement
        // (getBoundingClientRect fractional) and scrollHeight (integer). 2px
        // is generous for the corpus; a real fragmentation overflow is tens
        // of pixels.
        const TOLERANCE_PX = 2;

        // Turn through every page; after each turn settles, compare its live
        // text-line rects with the dedicated .page-viewport boundary. This is
        // authoritative because a height-constrained fragment can report a
        // safe scrollHeight while descendants still paint outside it.
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
          // Read geometry for the current page.
          const geom = await page.evaluate(() => {
            const fragment = document.querySelector(".page-fragment") as HTMLElement | null;
            if (!fragment) return null;
            const pageViewport = document.querySelector(".page-viewport") as HTMLElement | null;
            if (!pageViewport) return null;
            const pageBottom = pageViewport.getBoundingClientRect().bottom;
            const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
            const range = document.createRange();
            let maxTextBottom = Number.NEGATIVE_INFINITY;
            let clippedTextRects = 0;
            let node: Node | null;
            while ((node = walker.nextNode()) !== null) {
              const parent = node.parentElement;
              const closedDetails = parent?.closest("details:not([open])");
              if (closedDetails && !parent?.closest("summary")) continue;
              range.selectNodeContents(node);
              for (const rect of range.getClientRects()) {
                maxTextBottom = Math.max(maxTextBottom, rect.bottom);
                if (rect.bottom > pageBottom + 2) clippedTextRects += 1;
              }
            }
            return {
              // Coarse secondary signal; live Range rects below are the
              // authoritative check for painted text crossing the boundary.
              fragmentScrollHeight: fragment.scrollHeight,
              // The viewport excludes the provenance header and is the exact
              // height supplied to the pagination engine and overflow guard.
              pageViewportClientHeight: pageViewport.clientHeight,
              maxTextBottomRelativeToPage: maxTextBottom - pageBottom,
              clippedTextRects,
            };
          });
          expect(geom, `page ${pageNum}: paginated-surface + page-fragment must be mounted`).not.toBeNull();
          const overflow =
            geom!.fragmentScrollHeight - geom!.pageViewportClientHeight;
          expect(
            overflow,
            `page ${pageNum}/${totalPages}: fragment scrollHeight (${geom!.fragmentScrollHeight}) must not exceed page viewport clientHeight (${geom!.pageViewportClientHeight}) + ${TOLERANCE_PX}px tolerance`,
          ).toBeLessThanOrEqual(TOLERANCE_PX);
          expect(
            geom!.clippedTextRects,
            `page ${pageNum}/${totalPages}: ${geom!.clippedTextRects} rendered text line(s) extend below the page boundary (furthest by ${geom!.maxTextBottomRelativeToPage}px)`,
          ).toBe(0);

          // Turn to the next page (chevron click — the shared turn path).
          if (pageNum < totalPages) {
            const next = page.getByRole("button", { name: "Next page" });
            await next.click();
            // Let the new page render + measurement settle.
            await page.waitForTimeout(600);
          }
        }

        expect(pageErrors, "no uncaught errors during pagination").toEqual([]);
      });
    }
  }
});
