// tests/e2e/chrome/header-geometry.spec.ts
// Plan 13-04 (POLISH-03 / D13-13 + Option A — human decision 2026-08-18):
// the slimmed article header + article-top metadata spot geometry bar.
//
// SCENARIOS (360×640 — the D13-13 narrow-phone reference cell):
//   1. PAGINATED slim header: the pinned per-page header (BackToLibrary +
//      title only) reports NO internal scrolling (scrollHeight ≤
//      clientHeight) — the 09-07 cap composes with the slimmer content.
//   2. Render-once metadata spot + Option A reserve: exactly ONE
//      .article-top-meta / TagEntry / Export instance; while mounted at
//      article start the spot + page-1 fragment coexist inside
//      .page-viewport without overflow (the engine's firstPageReservedPx
//      budget and the --article-top-meta-reserve fragment height agree);
//      after the first turn the spot is gone; turning back re-mounts it —
//      and the page count NEVER changes across those mounts (no
//      spot-driven repagination / ResizeObserver loop).
//   3. SCROLLING mode: the slim header holds at 360×640 and the spot is
//      ordinary flow content above the body (rendered once, never pinned).
//
// Harness copied from tests/e2e/pagination/no-overflow-invariant.spec.ts
// (image-route pixel-svg fulfillment + indexedDB.deleteDatabase beforeEach;
// 600ms post-commit settle windows mirroring the corpus specs — no fixed
// sleeps for load-bearing readiness, which use waitForFunction instead).
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5173";
const PIXEL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
// A long-form corpus fixture with byline + source provenance (so the spot's
// meta lines render) and enough pages at 360×640 to exercise turns.
const FIXTURE = "essay-long-form";
const SMALL_PHONE = { width: 360, height: 640 } as const;

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

/** Open the fixture in paginated mode (the default) at 360×640 and wait for the engine. */
async function openPaginatedAtSmallPhone(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.setViewportSize({ width: SMALL_PHONE.width, height: SMALL_PHONE.height });
  await page.goto(`${BASE}/#/article/${FIXTURE}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForFunction(
    () =>
      (window as unknown as Record<string, unknown>).__lemPagination !== undefined,
    undefined,
    { timeout: 8000 },
  );
  // Settle window mirrors the corpus specs: the post-render overflow guard
  // commits any correction within ~1 rAF chain; 600ms is the established
  // corpus settle budget.
  await page.waitForTimeout(600);
}

test.describe("header geometry (13-04 — POLISH-03 / D13-13)", () => {
  test("paginated: slim header has no internal scrolling at 360×640", async ({
    page,
  }) => {
    await openPaginatedAtSmallPhone(page);

    const headerGeom = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>(
        "article.article-body > header",
      );
      if (!header) return null;
      return {
        scrollHeight: header.scrollHeight,
        clientHeight: header.clientHeight,
        h1Count: header.querySelectorAll("h1").length,
        tagEntryCount: header.querySelectorAll(".tag-entry").length,
      };
    });
    expect(headerGeom, "article header must be mounted").not.toBeNull();
    expect(
      headerGeom!.scrollHeight,
      `header must not scroll internally at 360×640 (scrollHeight ${headerGeom!.scrollHeight} vs clientHeight ${headerGeom!.clientHeight})`,
    ).toBeLessThanOrEqual(headerGeom!.clientHeight);
    // The slim anatomy: exactly one title; the TagEntry form lives at the
    // article-top metadata spot, never in the pinned header.
    expect(headerGeom!.h1Count).toBe(1);
    expect(headerGeom!.tagEntryCount).toBe(0);
  });

  test("paginated: metadata spot renders once, coexists with page 1 inside the reserve, and leaves after the first turn", async ({
    page,
  }) => {
    await openPaginatedAtSmallPhone(page);

    // (a) Render-once: exactly ONE metadata spot; exactly ONE TagEntry —
    //     and it lives in the TOP-BAR POPOVER (Plan 13-10 G5), never inside
    //     the spot and never in the pinned header (CSS locators match the
    //     closed popover's DOM; role/visibility queries would not).
    expect(await page.locator(".article-top-meta").count()).toBe(1);
    expect(await page.locator(".article-top-meta .tag-entry").count()).toBe(0);
    expect(await page.locator(".tag-entry").count()).toBe(1);
    expect(
      await page.getByRole("button", { name: "Export highlights" }).count(),
    ).toBe(1);

    // (b) Option A geometry: spot + page-1 content coexist inside
    // .page-viewport without clipped text. The assertions mirror the
    // corpus no-overflow spec's AUTHORITATIVE forms (live text-line rects
    // via Range.getClientRects + fragment scrollHeight) — the fragment's
    // BORDER BOX may extend a few px past the boundary because its first
    // child's block margin collapses through the borderless fragment while
    // the engine correctly budgets that margin INSIDE page 1 (text fits;
    // only empty box space crosses the edge).
    const startGeom = await page.evaluate(() => {
      const viewport = document.querySelector<HTMLElement>(".page-viewport");
      const spot = document.querySelector<HTMLElement>(".article-top-meta");
      const fragment = document.querySelector<HTMLElement>(".page-fragment");
      if (!viewport || !spot || !fragment) return null;
      const v = viewport.getBoundingClientRect();
      const s = spot.getBoundingClientRect();
      const f = fragment.getBoundingClientRect();
      const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let clippedTextRects = 0;
      let node: Node | null;
      while ((node = walker.nextNode()) !== null) {
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (rect.bottom > v.bottom + 2) clippedTextRects += 1;
        }
      }
      const dev = (window as unknown as Record<string, unknown>).__lemPagination as
        | { pagesLength: number }
        | undefined;
      return {
        pagesLength: dev?.pagesLength ?? 0,
        fragmentScrollHeight: fragment.scrollHeight,
        viewportClientHeight: viewport.clientHeight,
        clippedTextRects,
        spotInsideViewport:
          s.top >= v.top - 1 && s.bottom <= v.bottom + 1,
        fragmentStartsBelowSpot: f.top >= s.bottom - 1,
      };
    });
    expect(startGeom, "viewport + spot + fragment must be mounted at article start").not.toBeNull();
    expect(startGeom!.pagesLength).toBeGreaterThan(1);
    expect(startGeom!.spotInsideViewport).toBe(true);
    expect(
      startGeom!.clippedTextRects,
      "no page-1 text line may extend below the viewport (reserve budget holds)",
    ).toBe(0);
    expect(
      startGeom!.fragmentScrollHeight,
      "page-1 content must not overflow the viewport (2px sub-pixel tolerance)",
    ).toBeLessThanOrEqual(startGeom!.viewportClientHeight + 2);
    expect(
      startGeom!.fragmentStartsBelowSpot,
      "page-1 fragment must start below the metadata spot (no overlap)",
    ).toBe(true);

    // (c) First turn: the spot unmounts; the page count NEVER changes. The
    //     popover TagEntry is article chrome (not page content) — it stays
    //     mounted (count 1) while the SPOT-scoped count stays 0.
    await page.getByRole("button", { name: "Next page" }).click();
    await page.waitForTimeout(600);
    expect(await page.locator(".article-top-meta").count()).toBe(0);
    expect(await page.locator(".article-top-meta .tag-entry").count()).toBe(0);
    expect(await page.locator(".tag-entry").count()).toBe(1);
    const afterTurnPages = await page.evaluate(
      () =>
        ((window as unknown as Record<string, unknown>).__lemPagination as {
          pagesLength: number;
        }).pagesLength,
    );
    expect(afterTurnPages, "spot unmount must not re-trigger pagination").toBe(
      startGeom!.pagesLength,
    );

    // (d) Back to article start: the spot re-mounts; page count still
    // stable; page-1 text still fits inside the viewport.
    await page.getByRole("button", { name: "Previous page" }).click();
    await page.waitForTimeout(600);
    expect(await page.locator(".article-top-meta").count()).toBe(1);
    const backGeom = await page.evaluate(() => {
      const viewport = document.querySelector<HTMLElement>(".page-viewport");
      const fragment = document.querySelector<HTMLElement>(".page-fragment");
      const dev = (window as unknown as Record<string, unknown>).__lemPagination as
        | { pagesLength: number }
        | undefined;
      if (!viewport || !fragment) return null;
      const v = viewport.getBoundingClientRect();
      const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let clippedTextRects = 0;
      let node: Node | null;
      while ((node = walker.nextNode()) !== null) {
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (rect.bottom > v.bottom + 2) clippedTextRects += 1;
        }
      }
      return {
        pagesLength: dev?.pagesLength ?? 0,
        clippedTextRects,
      };
    });
    expect(backGeom).not.toBeNull();
    expect(backGeom!.pagesLength, "spot re-mount must not re-trigger pagination").toBe(
      startGeom!.pagesLength,
    );
    expect(backGeom!.clippedTextRects).toBe(0);
  });

  test("scrolling: slim header holds at 360×640 and the spot is flow content above the body", async ({
    page,
  }) => {
    await page.setViewportSize({ width: SMALL_PHONE.width, height: SMALL_PHONE.height });
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Switch to scrolling via the header mode toggle (the shared
    // handleToggleMode path — same as the M shortcut).
    await page.getByRole("button", { name: /reading mode/i }).click();
    await expect(page.locator(".page-viewport")).toHaveCount(0);

    const geom = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>(
        "article.article-body > header",
      );
      const spot = document.querySelector<HTMLElement>(".article-top-meta");
      // The first rendered article block (scrolling branch has no
      // .article-body-measurement clone — that is paginated-only).
      const firstBlock = document.querySelector<HTMLElement>(
        "article.article-body [data-block-index]",
      );
      if (!header || !spot || !firstBlock) return null;
      return {
        headerScrollHeight: header.scrollHeight,
        headerClientHeight: header.clientHeight,
        spotCount: document.querySelectorAll(".article-top-meta").length,
        // Plan 13-10 G5: the TagEntry count is popover-scoped — zero inside
        // the spot, exactly one overall (the closed popover instance).
        tagEntryCount: document.querySelectorAll(".tag-entry").length,
        spotTagEntryCount: document.querySelectorAll(
          ".article-top-meta .tag-entry",
        ).length,
        spotAboveFirstBlock:
          spot.getBoundingClientRect().bottom <=
          firstBlock.getBoundingClientRect().top + 1,
      };
    });
    expect(geom, "header + spot + body must be mounted in scrolling mode").not.toBeNull();
    // 2px sub-pixel tolerance (the corpus specs' TOLERANCE_PX class):
    // scrollHeight integer-rounds UP off fractional wrapped-title line
    // heights while clientHeight rounds down — a ≤2px delta is rounding,
    // not internal scrolling (a real overflow is tens of pixels).
    expect(
      geom!.headerScrollHeight,
      "scrolling-mode header must not scroll internally at 360×640",
    ).toBeLessThanOrEqual(geom!.headerClientHeight + 2);
    expect(geom!.spotCount).toBe(1);
    expect(geom!.tagEntryCount).toBe(1);
    expect(geom!.spotTagEntryCount).toBe(0);
    expect(geom!.spotAboveFirstBlock).toBe(true);
  });
});
