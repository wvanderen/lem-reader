// tests/e2e/pagination/no-overflow-invariant.spec.ts
// PAGE-03b — No clipping: no page's rendered content overflows its content-box
// (scrollHeight <= contentBoxHeight + tolerance); each page is overflow:hidden.
//
// SCENARIO: For each cell in CORPUS_MATRIX, every page fragment's rendered
// DOM stays within its content-box. Visible clipping or scroll-bar leakage
// fails PAGE-03.
//
// SCAFFOLD — sentinel assertion only. Real assertions iterate CORPUS_MATRIX
// and assert scrollHeight <= contentBoxHeight + tolerance per page. Filled
// by Plan 04-05.
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

test.describe("PAGE-03b no-overflow invariant (04-05)", () => {
  test("scaffold: harness wires up + article h1 renders", async ({ page }) => {
    // Plan 04-05 fills: for each cell of CORPUS_MATRIX, paginate and assert
    // every page's scrollHeight <= contentBoxHeight + tolerance (PAGE-03
    // invariant #2 — no clipping).
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
