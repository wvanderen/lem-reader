// tests/e2e/pagination/article-swap-trust.spec.ts
// PR #232 regression — a committed measurement is valid only for the article
// it measured (long-work plan §"scope-aware": no cross-scope reuse of a
// trusted result).
//
// SCENARIO: a windowed long work (essay-long-form) paginates, the reader
// switches to scrolling (the preference persists), then navigates SAME-
// DOCUMENT to a legacy whole-article fixture (figure-heavy) and toggles back
// to paginated. Before the trust-boundary fix, ArticleView's useMeasurement
// kept the PREVIOUS article's committed view across the swap, so the new
// article's PaginatedSurface mounted against a foreign measurement —
// paginateDocument's scope guard rejected it (measurement-scope-mismatch),
// emitted dom-fallback, and the reader was flipped to scrolling with the
// fallback banner instead of paginating. The hook now resets trust when the
// article changes, so ArticleView renders its paginatedPending placeholder
// until THIS article's measurement commits and the flip never fires.
//
// Harness: the shared observable-readiness helpers (tests/e2e/pagination/
// _harness.ts) + the image-stub/db-wipe beforeEach copied from
// mode-switch-anchor.spec.ts (REUSE-DO-NOT-FORK — the epoch pair is required
// here: the second publication would otherwise satisfy the waits via the
// first article's stale __lemPagination).
import { test, expect } from "@playwright/test";
import { BASE } from "../_base";
import { markPaginationEpoch, openPaginated, waitForRepagination } from "./_harness";

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

test.describe("article-swap trust boundary (PR #232)", () => {
  test("scrolling→paginated flip on a legacy article after a windowed work paginates THAT article — never the fallback flip", async ({
    page,
  }) => {
    // 1. The long work paginates (windowed path — no whole-article measurement).
    await openPaginated(page, "essay-long-form");
    await expect(page.locator(".page-fragment").first()).toBeVisible();

    // 2. Toggle to scrolling — readingMode persists for the next article.
    await page.keyboard.press("m");
    await expect(
      page.locator(".article-body:not(.article-body-measurement):not(.paginated-surface)"),
    ).toBeVisible();

    // 3. Same-document navigate to the legacy whole-article fixture. It
    // mounts in scrolling mode (persisted preference) and measures whole.
    await markPaginationEpoch(page);
    await page.goto(`${BASE}/#/article/figure-heavy`);
    await expect(page.getByRole("heading", { level: 1, name: "Hummingbird" })).toBeVisible();
    await expect(
      page.locator(".article-body:not(.article-body-measurement):not(.paginated-surface)"),
    ).toBeVisible();

    // 4. Toggle back to paginated. THIS article's measurement must drive the
    // pagination; the previous article's committed view must never feed it.
    await page.keyboard.press("m");
    const dev = await waitForRepagination(page);
    expect(dev.status).toBe("ok");
    await expect(page.locator(".page-fragment").first()).toBeVisible();
    await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
    await expect(
      page.getByText("This part of the article is too large to fit on one page."),
    ).toHaveCount(0);
  });

  test("direct paginated→paginated navigation repaginates the new article against ITS OWN measurement", async ({
    page,
  }) => {
    // Two legacy whole-article fixtures, no mode change: the swap must not
    // reuse the first article's committed view (same count or not).
    await openPaginated(page, "figure-heavy");
    await expect(page.locator(".page-fragment").first()).toBeVisible();
    await markPaginationEpoch(page);
    await page.goto(`${BASE}/#/article/technical-post`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const dev = await waitForRepagination(page);
    expect(dev.status).toBe("ok");
    await expect(page.locator(".page-fragment").first()).toBeVisible();
    await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
  });
});
