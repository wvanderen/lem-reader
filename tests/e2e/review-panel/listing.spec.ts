// tests/e2e/review-panel/listing.spec.ts
// Wave-0 sentinel — Plan 10-01 Task 2.
//
// Verification-map rows owned by this file (10-VALIDATION.md):
//   - RECV-01.b — cross-article listing w/ article/date/position metadata
//
// SENTINEL ONLY (the 04-02 h1-visible precedent): proves the Playwright
// harness reaches the app under this Phase-10 route form in all three
// engines. Plan 10-02 landed the three-view router, so `#/review` now
// resolves to ReviewView — the sentinel asserts the review h1 is visible
// after navigation (updated from the 10-01 two-view fallback assertion).
//
// Plan 10-03 REPLACES this sentinel with the real listing assertions
// (cross-article rows + article/date/position metadata + React-text-children
// rendering) while keeping the file, describe naming, and helper wiring
// (strengthen-only; this file is Phase-10-native so its content may be
// rewritten in full).
import { test, expect } from "@playwright/test";
import { BASE } from "../annotations/_fixtures";

test.describe("RECV-01.b review-panel listing (10-01 Wave-0 sentinel)", () => {
  test("#/review reaches the app (review h1 visible)", async ({ page }) => {
    await page.goto(`${BASE}/#/review`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Review highlights" }),
    ).toBeVisible();
  });
});
