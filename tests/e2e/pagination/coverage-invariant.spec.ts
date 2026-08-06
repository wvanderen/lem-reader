// tests/e2e/pagination/coverage-invariant.spec.ts
// PAGE-03a — Exactly-once coverage: the union of every page fragment's source
// ranges == [0, graphemeLength(article)), no gaps, no overlaps, no omission,
// no duplication. Plus PAGE-03d — canonical order: page offsets are strictly
// monotonic (page N's first block starts at an article-global offset strictly
// greater than page N-1's).
//
// SCENARIO: For each cell of the corpus matrix (fixtures × responsive
// viewports) in Chromium, Firefox, and WebKit, the paginated result's source
// ranges tile the article's normalized text exactly once. A gap, overlap, or
// omission fails PAGE-03.
//
// The DEV-only window.__lemPagination hook (set by PaginatedSurface under
// import.meta.env.DEV) exposes {pages, status, blockGraphemeLengths,
// articleGraphemeLength} so this spec can reconstruct the coverage without
// probing private React state. Plan 04-06 unblocked container pagination
// (every fixture now paginates via pre-captured line boxes + the
// [data-block-index] 1:1 block↔element mapping); the ok-path runs
// unconditionally across the full corpus matrix.
//
// Matrix note: iterates FIXTURES × VIEWPORTS at the default typography. The
// typography axis (drift drivers) is exercised by repagination-anchor.spec.ts
// (PAGE-05); the exactly-once property is typography-independent (it is a
// property of the engine's coverage logic, not the specific breakpoints).
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
  pages:
    | Array<{
        pageIndex: number;
        blocks: Array<{ blockIndex: number; startGrapheme: number; endGrapheme: number }>;
      }>
    | null;
  status: string;
  blockGraphemeLengths: number[];
  articleGraphemeLength: number;
}

async function readPagination(page: import("@playwright/test").Page): Promise<PaginationDev> {
  return page.evaluate(() => {
    return (window as unknown as Record<string, unknown>).__lemPagination as PaginationDev;
  });
}

/** Resolve once window.__lemPagination reflects a settled pagination pass. */
async function waitForPagination(
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
  // Let the measurement + pagination settle (font gate + epoch guard).
  await page.waitForTimeout(600);
  return readPagination(page);
}

test.describe("PAGE-03a exactly-once coverage (04-05)", () => {
  test.describe.configure({ mode: "parallel" });

  for (const fixture of FIXTURES) {
    for (const viewport of VIEWPORTS) {
      const cell = `${fixture}@${viewport.width}x${viewport.height}`;
      test(`${cell}: page source ranges tile the article exactly once (canonical order, no gaps/overlaps/duplication)`, async ({
        page,
      }) => {
        const pageErrors: string[] = [];
        page.on("pageerror", (err) => pageErrors.push(String(err)));

        const dev = await waitForPagination(page, fixture, viewport);

        // Plan 04-06: the engine paginates every corpus fixture (containers
        // included) via pre-captured line boxes + the 1:1 [data-block-index]
        // block↔element mapping. status "ok" with non-empty pages is the
        // contract; a fallback here is a real engine regression.
        expect(dev.status, `engine status for ${cell}`).toBe("ok");
        expect(dev.pages, `pages must be present for ${cell}`).not.toBeNull();
        const pages = dev.pages!;
        expect(pages.length, `pages must be non-empty for ${cell}`).toBeGreaterThan(0);

        const blockLens = dev.blockGraphemeLengths;
        expect(blockLens.length, "blockGraphemeLengths must be non-empty").toBeGreaterThan(0);

        // (1) Per-block exactly-once: collect every slice, group by blockIndex,
        // sort by startGrapheme, assert contiguous [0, blockLen) with no
        // gaps/overlaps/duplication. Tracks the max endGrapheme seen per block.
        const slicesByBlock = new Map<number, Array<{ start: number; end: number; page: number }>>();
        for (const pg of pages) {
          for (const entry of pg.blocks) {
            const arr = slicesByBlock.get(entry.blockIndex) ?? [];
            arr.push({
              start: entry.startGrapheme,
              end: entry.endGrapheme,
              page: pg.pageIndex,
            });
            slicesByBlock.set(entry.blockIndex, arr);
          }
        }

        // Every block must be present and fully covered exactly once.
        for (let b = 0; b < blockLens.length; b++) {
          const slices = (slicesByBlock.get(b) ?? []).sort((a, b2) => a.start - b2.start);
          expect(slices.length, `block ${b} must have ≥1 slice`).toBeGreaterThan(0);
          let cursor = 0;
          for (const s of slices) {
            expect(s.end, `block ${b} slice end must exceed start`).toBeGreaterThan(s.start);
            expect(s.start, `block ${b} slice start ${s.start} must equal cursor ${cursor} (no gap/overlap)`).toBe(cursor);
            cursor = s.end;
          }
          expect(cursor, `block ${b} must be fully covered [0, ${blockLens[b]})`).toBe(
            blockLens[b],
          );
        }
        // No extra block indices beyond the article's block count.
        for (const key of slicesByBlock.keys()) {
          expect(key, `blockIndex ${key} must be in [0, ${blockLens.length})`).toBeGreaterThanOrEqual(0);
          expect(key).toBeLessThan(blockLens.length);
        }

        // (2) PAGE-03d canonical order: pages are strictly monotonic in
        // article-global offset. Reconstruct each page's first-block global
        // offset (accumulate blockLens + BLOCK_SEPARATOR) and assert strictly
        // increasing across pageIndex order.
        let prevGlobal = -1;
        for (const pg of pages) {
          const first = pg.blocks[0];
          expect(first, `page ${pg.pageIndex} must have ≥1 block entry`).toBeDefined();
          const firstBlock = first!;
          let global = 0;
          for (let i = 0; i < firstBlock.blockIndex; i++) {
            global += blockLens[i]! + 1; // +1 for BLOCK_SEPARATOR ("\n")
          }
          global += firstBlock.startGrapheme;
          expect(global, `page ${pg.pageIndex} global offset must exceed prev (${prevGlobal})`).toBeGreaterThan(prevGlobal);
          prevGlobal = global;
        }

        // (3) No page is empty (zero-progress guard would have fallen back).
        for (const pg of pages) {
          expect(pg.blocks.length, `page ${pg.pageIndex} must not be empty`).toBeGreaterThan(0);
        }

        // V7: pagination never throws to the reader.
        expect(pageErrors, "no uncaught errors during pagination").toEqual([]);
      });
    }
  }
});
