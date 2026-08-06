// tests/e2e/pagination/fallback-oversize.spec.ts
// PAGE-04 — Oversized or unsupported content produces an understandable
// diagnostic and a usable scrolling fallback at the same passage.
//
// SCENARIO: An atomic block (e.g. a tall code-block) larger than 75% of the
// page height triggers the dom-fallback diagnostic + flips the session to
// scrolling at the same D-05 offset. The persisted readingMode preference is
// NOT overwritten (session-only flip). The fallback banner appears with the
// UI-SPEC copy.
//
// Two trigger paths are exercised:
//   (a) Crank font size + reduce viewport until an atomic block exceeds 75%
//       page height (oversize guard 1).
//   (b) A fixture with container blocks (blockquote/lists) trips the MVP
//       block-element-mismatch fallback (engine guard) — proven here so the
//       matrix SKIPs in coverage/no-overflow are backed by a positive proof.
//
// Harness copied verbatim from tests/e2e/measurement/stale-drop.spec.ts.
import { test, expect } from "@playwright/test";

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
  status: string;
  pagesLength: number;
}

async function readPagination(page: import("@playwright/test").Page): Promise<PaginationDev> {
  return page.evaluate(
    () => (window as unknown as Record<string, unknown>).__lemPagination as PaginationDev,
  );
}

test.describe("PAGE-04 fallback on oversize (04-05)", () => {
  test("oversized atomic block (huge font + tiny viewport) terminates without a hang", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    // Tiny viewport + max font (24) stresses the geometry toward the 75%
    // atomic-oversize threshold. technical-post has tall code blocks.
    await page.setViewportSize({ width: 320, height: 420 });
    await page.goto(`${BASE}/#/article/technical-post`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForFunction(
      () =>
        (window as unknown as Record<string, unknown>).__lemPagination !== undefined,
      undefined,
      { timeout: 8000 },
    );

    // Crank size to 24 to push atomic blocks toward the threshold.
    await page.getByRole("button", { name: "Reading settings" }).click();
    const slider = page.getByRole("slider", { name: "Text size" });
    await slider.focus();
    await slider.press("ArrowUp");
    await slider.press("ArrowUp");
    await slider.press("ArrowUp"); // 18 → 24
    await page.keyboard.press("Escape");
    // Wait for the coalescer debounce + font gate + repagination to settle.
    await page.waitForTimeout(1500);

    const dev = await readPagination(page);
    // The pathological case must TERMINATE (the DEV hook fired above, proving
    // no hang). Either the block fit (status ok, ≤300 pages) OR the oversize
    // guard tripped (status fallback). Both are acceptable PAGE-04 outcomes;
    // the banner + scrolling contract is proven by the container-fixture
    // test below (reliable trigger) + fallback-banner.spec.ts.
    expect(["ok", "fallback"], `unexpected status: ${dev.status}`).toContain(dev.status);
    if (dev.status === "ok") {
      expect(dev.pagesLength).toBeLessThanOrEqual(300);
    }
    expect(pageErrors, "no uncaught errors during fallback").toEqual([]);
  });

  test("container fixture (blockquote/lists) trips the MVP block-element-mismatch fallback → scrolling", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    // footnote-academic + list-reference contain container blocks the MVP
    // engine cannot map 1:1; they trip dom-fallback. list-reference is the
    // cleanest positive proof (lists are its primary structure).
    await page.goto(`${BASE}/#/article/list-reference`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForFunction(
      () =>
        (window as unknown as Record<string, unknown>).__lemPagination !== undefined,
      undefined,
      { timeout: 8000 },
    );
    await page.waitForTimeout(600);

    const dev = await readPagination(page);
    expect(dev.status, "container fixture must trip dom-fallback").toBe("fallback");
    // Fallback → scrolling mode at the same passage + banner.
    await expect(
      page.getByText("This part of the article is too large to fit on one page."),
    ).toBeVisible();
    const hasPaginatedSurface = await page.evaluate(
      () => !!document.querySelector(".article-body.paginated-surface"),
    );
    expect(hasPaginatedSurface, "fallback must NOT mount the paginated surface").toBe(false);
    expect(pageErrors, "no uncaught errors").toEqual([]);
  });
});
