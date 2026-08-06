// tests/e2e/pagination/repagination-anchor.spec.ts
// PAGE-05 — Reader remains anchored through viewport, typography, font, and
// supported asset changes while a previous valid view remains available
// during repagination.
//
// SCENARIO: Reader is on page N at D-05 offset X. Viewport resizes /
// typography changes / a font swap invalidates the current pagination. The
// engine repaginates; the reader lands on the page containing offset X
// (D4-11 repagination anchor). During the in-flight repagination, the
// previous page stays mounted (no blank flash — same discipline as PAGE-06).
//
// SCAFFOLD — sentinel assertion only. Real assertions exercise resize +
// typography + font-swap repagination + D4-11 anchor. Filled by Plan 04-04.
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

test.describe("PAGE-05 repagination anchor (04-04)", () => {
  test("scaffold: harness wires up + article h1 renders", async ({ page }) => {
    // Plan 04-04 fills: trigger repagination (resize/typography/font), assert
    // D4-11 anchor lands on the page containing the pre-repaginate D-05
    // offset + previous view stays mounted during in-flight work.
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
