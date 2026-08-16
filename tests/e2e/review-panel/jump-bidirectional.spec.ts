// tests/e2e/review-panel/jump-bidirectional.spec.ts
// Wave-0 sentinel — Plan 10-01 Task 2.
//
// Verification-map rows owned by this file (10-VALIDATION.md):
//   - RECV-01.c — jump bidirectional (both reading modes) + deep-link no re-jump
//   - RECV-01.i — regression rows (forced-colors / reduced-motion / keyboard /
//     a11y on #/review) extend this spec's route forms
//
// SENTINEL ONLY (the 04-02 h1-visible precedent): proves the Playwright
// harness reaches the app under the Phase-10 deep-link route form
// (#/article/<id>/h/<highlightId>) in all three engines. Under today's
// two-view router that suffix does not match the article regex, so the route
// falls back to the library list — the sentinel asserts the list h1 is
// visible after navigation.
//
// Plan 10-04 REPLACES this sentinel with the real jump assertions (both
// reading modes, focus on the <mark>, Back returns to #/review, deep-link
// no-re-jump) while keeping the file, describe naming, and helper wiring
// (strengthen-only; this file is Phase-10-native so its content may be
// rewritten in full).
import { test, expect } from "@playwright/test";
import { BASE, FIXTURES } from "../annotations/_fixtures";

const FIXTURE = FIXTURES[0]!; // essay-long-form — any corpus id exercises the form

test.describe("RECV-01.c review-panel jump bidirectional (10-01 Wave-0 sentinel)", () => {
  test("#/article/<id>/h/<hid> reaches the app (h1 visible after router fallback)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIXTURE}/h/some-highlight-id`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
  });
});
