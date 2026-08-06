// tests/e2e/pagination/termination.spec.ts
// PAGE-03c — Termination: finite pages[] with pages.length <= 300; bounded
// wall-clock. The three termination guards (0.75 atomic-oversize threshold,
// 300-page ceiling, zero-progress / unsplittable-block-overflow) guarantee
// the engine never loops.
//
// SCENARIO: For each cell in CORPUS_MATRIX, paginate and assert pages.length
// is finite, ≤ 300, and the wall-clock is bounded. Adversarial fixtures
// (pathological paragraph counts) trip the page-ceiling guard and emit
// dom-fallback.
//
// SCAFFOLD — sentinel assertion only. Real assertions iterate CORPUS_MATRIX
// and assert finite pages[] + ceiling. Filled by Plan 04-05.
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

test.describe("PAGE-03c termination (04-05)", () => {
  test("scaffold: harness wires up + article h1 renders", async ({ page }) => {
    // Plan 04-05 fills: for each cell of CORPUS_MATRIX, paginate and assert
    // 0 < pages.length <= 300 + bounded wall-clock (PAGE-03 invariant #5 +
    // PAGE-04 termination policy).
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
