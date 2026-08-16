// tests/e2e/review-panel/route-entry.spec.ts
// Wave-0 sentinel — Plan 10-01 Task 2.
//
// Verification-map rows owned by this file (10-VALIDATION.md):
//   - RECV-01.a — route entry (#/review swap, LibraryView entry button)
//
// SENTINEL ONLY (the 04-02 h1-visible precedent): proves the Playwright
// harness reaches the app under this Phase-10 route form in all three
// engines — not merely that the file compiles. Under today's two-view router
// `#/review` is an unknown route that falls back to the library list, so the
// sentinel asserts the list h1 is visible after navigation.
//
// Plan 10-02 REPLACES this sentinel with the real route-entry assertions
// (review view swap + LibraryView entry button) while keeping the file,
// describe naming, and helper wiring (strengthen-only; this file is
// Phase-10-native so its content may be rewritten in full).
import { test, expect } from "@playwright/test";
import { BASE } from "../annotations/_fixtures";

test.describe("RECV-01.a review-panel route entry (10-01 Wave-0 sentinel)", () => {
  test("#/review reaches the app (h1 visible after router fallback)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/review`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
  });
});
