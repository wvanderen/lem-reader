// tests/e2e/pagination/coverage-invariant.spec.ts
// PAGE-03a — Exactly-once coverage: the union of every page fragment's source
// ranges == [0, graphemeLength(article)), no gaps, no overlaps.
//
// SCENARIO: For each cell in CORPUS_MATRIX (6 fixtures × 3 viewports × 3
// typography cells × 3 engines), the paginated result's source ranges tile
// the article's normalized text exactly once. A gap, overlap, or omission
// fails PAGE-03.
//
// SCAFFOLD — sentinel assertion only. Real assertions iterate CORPUS_MATRIX
// and assert the union-of-ranges invariant. Filled by Plan 04-05.
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

test.describe("PAGE-03a exactly-once coverage (04-05)", () => {
  test("scaffold: harness wires up + article h1 renders", async ({ page }) => {
    // Plan 04-05 fills: for each cell of CORPUS_MATRIX, paginate and assert
    // the union of page source ranges == [0, graphemeLength(article)) with no
    // gaps or overlaps (PAGE-03 invariant #1).
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
