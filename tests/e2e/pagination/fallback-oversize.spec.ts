// tests/e2e/pagination/fallback-oversize.spec.ts
// PAGE-04 — Oversized or unsupported content produces an understandable
// diagnostic and a usable scrolling fallback at the same passage.
//
// SCENARIO: An atomic block (e.g. a tall code-block or figure) larger than
// 75% of the page height triggers the dom-fallback diagnostic + flips the
// session to scrolling at the same D-05 offset. The persisted readingMode
// preference is NOT overwritten (session-only flip).
//
// SCENARIO: An adversarial fixture producing >300 pages trips the page-ceiling
// guard and emits dom-fallback with reason page-ceiling.
//
// SCAFFOLD — sentinel assertion only. Real assertions exercise both oversize
// paths + reason codes. Filled by Plan 04-05.
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

test.describe("PAGE-04 fallback on oversize (04-05)", () => {
  test("scaffold: harness wires up + article h1 renders", async ({ page }) => {
    // Plan 04-05 fills: trigger an atomic block > 75% page height, assert
    // dom-fallback diagnostic emits + session-mode flips to scrolling at the
    // same D-05 offset + persisted readingMode unchanged.
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
