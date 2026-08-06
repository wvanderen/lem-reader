// tests/e2e/pagination/page-turn-controls.spec.ts
// PAGE-02 — Reader can move forward and backward through responsive pages
// using keyboard, pointer, and touch controls with predictable focus.
//
// SCENARIO: Reader presses ArrowRight/ArrowLeft (keyboard), clicks the
// quiet chevrons (pointer), and swipes left/right (touch). Each turn focuses
// the new page's first heading or focusable per D4-07 (content-triggered) or
// retains focus on the control (control-triggered).
//
// SCAFFOLD — sentinel assertion only (harness wires up + h1 visible). Real
// assertions (PageTurnControls + D4-07 focus + announce + turn directions)
// are filled by Plan 04-04 (dual-mode navigation).
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

test.describe("PAGE-02 page-turn controls (04-04)", () => {
  test("scaffold: harness wires up + article h1 renders", async ({ page }) => {
    // Plan 04-04 fills: keyboard/pointer/swipe turn + D4-07 focus restoration
    // (content-triggered focuses new first heading; control-triggered keeps
    // control focus).
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
