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
// (#/article/<id>/h/<highlightId>) in all three engines. Plan 10-02 landed
// the extended parseHash grammar, so the /h/ suffix now resolves to the
// ARTICLE view (jumpHighlightId captured but not yet consumed — Plan 10-03
// adds the on-mount jump pipeline). The sentinel asserts the article h1 is
// visible after navigation (updated from the 10-01 two-view fallback
// assertion).
//
// Plan 10-04 REPLACES this sentinel with the real jump assertions (both
// reading modes, focus on the <mark>, Back returns to #/review, deep-link
// no-re-jump) while keeping the file, describe naming, and helper wiring
// (strengthen-only; this file is Phase-10-native so its content may be
// rewritten in full).
import { test, expect } from "@playwright/test";
import { BASE, FIXTURES } from "../annotations/_fixtures";

const FIXTURE = FIXTURES[0]!; // essay-long-form — any corpus id exercises the form
const FIXTURE_TITLE = "The looting of science fiction"; // its provenance h1

test.describe("RECV-01.c review-panel jump bidirectional (10-01 Wave-0 sentinel)", () => {
  test("#/article/<id>/h/<hid> reaches the app (article h1 visible)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIXTURE}/h/some-highlight-id`);
    await expect(
      page.getByRole("heading", { level: 1, name: FIXTURE_TITLE }),
    ).toBeVisible();
  });
});
