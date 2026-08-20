// tests/e2e/chrome/paginated-quiet-header.spec.ts
// Quick task 260819-qbq — the paginated quiet-header contract. In paginated
// mode the pinned header row drops to the page-indicator register (one
// ~14px/1.45 line, ≤44px row at 360×640) so nearly all pinned-surface
// height goes to the reading page.
//
// MECHANISM (one sentence): the back button keeps a REAL position:fixed
// 44×44 chrome-layer box because the header is a scroll container by the
// locked 09-07 rule, which clips any pseudo-element hit-area expansion for
// painting AND hit-testing (and would add scrollable overflow).
//
// CONTRACT CLAUSES:
//   1. PAGINATED @ 360×640: back button computed position "fixed" with a
//      boundingBox ≥ 44×44 (A11Y-07 real box); the header h1 computed
//      font-size "14px"; the header row (article.article-body > header)
//      bounding height ≤ 44px; header scrollHeight ≤ clientHeight (the
//      13-04 D13-13 no-internal-scroll bar still holds).
//   2. SCROLLING MODE (via the shared Reading-mode toggle): computed
//      position "static", h1 font-size "26px" (the base register), button
//      rect height ≥ 44 (the base min-height pill) — proving every new
//      rule is paginated-scoped and scrolling mode is pixel-unchanged.
//
// Harness mirrored from tests/e2e/chrome/header-geometry.spec.ts (image
// route pixel-svg fulfillment + indexedDB.deleteDatabase beforeEach; 600ms
// post-commit settle windows mirroring the corpus specs — no fixed sleeps
// for load-bearing readiness, which use waitForFunction instead). Plain
// test() calls inherit the 3-engine chromium/firefox/webkit matrix.
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5173";
const PIXEL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
// A long-form corpus fixture (same cell as header-geometry.spec.ts — the
// D13-13 narrow-phone reference).
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

test("paginated: header is the quiet indicator register and the back button keeps a real 44×44 fixed box", async ({
  page,
}) => {
  await openPaginatedAtSmallPhone(page);

  const geom = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>(
      "article.article-body > header",
    );
    const back = document.querySelector<HTMLElement>(
      "article.article-body > header .back-to-library",
    );
    const h1 = header?.querySelector<HTMLElement>("h1");
    if (!header || !back || !h1) return null;
    const backRect = back.getBoundingClientRect();
    return {
      backPosition: getComputedStyle(back).position,
      backWidth: backRect.width,
      backHeight: backRect.height,
      h1FontSize: getComputedStyle(h1).fontSize,
      headerRectHeight: header.getBoundingClientRect().height,
      headerScrollHeight: header.scrollHeight,
      headerClientHeight: header.clientHeight,
    };
  });
  expect(geom, "header + back button + h1 must be mounted").not.toBeNull();

  // A11Y-07 real box: fixed in the chrome layer, ≥44×44 border box (no
  // pseudo-element shim — see the mechanism note in the header comment).
  expect(geom!.backPosition).toBe("fixed");
  expect(
    geom!.backWidth,
    `back button width must be ≥44px (got ${geom!.backWidth})`,
  ).toBeGreaterThanOrEqual(44);
  expect(
    geom!.backHeight,
    `back button height must be ≥44px (got ${geom!.backHeight})`,
  ).toBeGreaterThanOrEqual(44);

  // Quiet title register: the exact .page-indicator 14px line (scoped rule
  // beats the base 26px/32px + ≥640px media override).
  expect(geom!.h1FontSize).toBe("14px");

  // The header row itself is one quiet line: previously the row floored at
  // the 44px pill and grew to ~96px on wrapped 26/32px titles; now it must
  // stay ≤44px (typically ~20px) so the reading page owns the surface.
  expect(
    geom!.headerRectHeight,
    `paginated header row must be ≤44px at 360×640 (got ${geom!.headerRectHeight}px — the quiet page-indicator register)`,
  ).toBeLessThanOrEqual(44);

  // The 13-04 D13-13 no-internal-scroll bar composes with the quiet row
  // (mirrors header-geometry test 1 — the 09-07 scroll net must not trip).
  expect(
    geom!.headerScrollHeight,
    `quiet header must not scroll internally (scrollHeight ${geom!.headerScrollHeight} vs clientHeight ${geom!.headerClientHeight})`,
  ).toBeLessThanOrEqual(geom!.headerClientHeight);
});

test("scrolling mode keeps the base header register", async ({ page }) => {
  await openPaginatedAtSmallPhone(page);

  // Switch to scrolling via the header mode toggle (the shared
  // handleToggleMode path — same as the M shortcut).
  await page.getByRole("button", { name: /reading mode/i }).click();
  await expect(page.locator(".page-viewport")).toHaveCount(0);

  const geom = await page.evaluate(() => {
    const back = document.querySelector<HTMLElement>(
      "article.article-body > header .back-to-library",
    );
    const h1 = document.querySelector<HTMLElement>(
      "article.article-body > header h1",
    );
    if (!back || !h1) return null;
    return {
      backPosition: getComputedStyle(back).position,
      backHeight: back.getBoundingClientRect().height,
      h1FontSize: getComputedStyle(h1).fontSize,
    };
  });
  expect(geom, "back button + h1 must be mounted in scrolling mode").not.toBeNull();

  // Every quiet-header rule is paginated-scoped: scrolling mode keeps the
  // 13-04 base register — static positioning, the 26px mobile-first title
  // (the ≥640px 32px media branch never applies at 360px), and the base
  // min-height pill still delivering the 44px touch target.
  expect(geom!.backPosition).toBe("static");
  expect(geom!.h1FontSize).toBe("26px");
  expect(
    geom!.backHeight,
    `scrolling-mode back button keeps the base ≥44px pill (got ${geom!.backHeight})`,
  ).toBeGreaterThanOrEqual(44);
});
