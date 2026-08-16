// tests/e2e/review-panel/curate.spec.ts
// Wave-0 sentinel — Plan 10-01 Task 2.
//
// Verification-map rows owned by this file (10-VALIDATION.md):
//   - RECV-01.f — curate in place (edit note, delete w/ confirm + cascade
//     copy, .status announcements)
//
// SENTINEL ONLY (the 04-02 h1-visible precedent): proves the Playwright
// harness reaches the app under this Phase-10 route form in all three
// engines. Under today's two-view router `#/review` is an unknown route that
// falls back to the library list, so the sentinel asserts the list h1 is
// visible after navigation.
//
// Plan 10-05 REPLACES this sentinel with the real curation assertions
// (ReviewNoteDialog edit, DeleteHighlightConfirm w/ [data-initial-focus] on
// the non-destructive button, cascade copy, .status announcements) while
// keeping the file, describe naming, and helper wiring (strengthen-only;
// this file is Phase-10-native so its content may be rewritten in full).
import { test, expect } from "@playwright/test";
import { BASE } from "../annotations/_fixtures";

test.describe("RECV-01.f review-panel curate (10-01 Wave-0 sentinel)", () => {
  test("#/review reaches the app (h1 visible after router fallback)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/review`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
  });
});
