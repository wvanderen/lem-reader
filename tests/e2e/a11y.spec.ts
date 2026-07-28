// tests/e2e/a11y.spec.ts
// axe-core harness across the fixture-list route and every article view,
// under the WCAG 2.2 AA ruleset, across the three browser engines declared in
// playwright.config.ts (Chromium, Firefox, WebKit). Asserts zero serious or
// critical violations, and explicitly guards Pitfall 10 (heading-order and
// list-semantics regressions) which are the high-risk a11y failures for a
// semantic renderer.
//
// axe reports only automatable issues — these tests do NOT replace the manual
// keyboard and screen-reader passes documented in VALIDATION.md Manual-Only
// Verifications (performed before /gsd-verify-work).
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { fixtures } from "../../src/fixtures";

const BASE = "http://localhost:5173";
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] as const;
// Pure-string SVG stub (see open-every-fixture.spec.ts for rationale).
const PIXEL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';

type AxeViolation = { id: string; impact?: string | null | undefined };
type AxeResultLike = { violations: AxeViolation[] };

function seriousViolations(results: AxeResultLike) {
  return results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
}

test.beforeEach(async ({ page }) => {
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: PIXEL_SVG }),
  );
});

test("fixture list: zero serious/critical WCAG 2.2 AA violations", async ({ page }) => {
  await page.goto(`${BASE}/`);
  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
  const serious = seriousViolations(results);
  const ids = serious.map((v) => v.id);
  expect(ids, JSON.stringify(serious, null, 2)).not.toContain("heading-order");
  expect(ids).not.toContain("list");
  expect(serious).toEqual([]);
});

for (const article of fixtures) {
  test.describe(`a11y ${article.id}`, () => {
    test("zero serious/critical violations; no heading-order or list violations (Pitfall 10)", async ({
      page,
    }) => {
      await page.goto(`${BASE}/#/article/${article.id}`);
      const results = await new AxeBuilder({ page })
        .withTags([...WCAG_TAGS])
        .analyze();
      const serious = seriousViolations(results);
      const ids = serious.map((v) => v.id);
      // Pitfall 10 — explicit guards on the two high-risk semantic regressions.
      expect(ids, JSON.stringify(serious, null, 2)).not.toContain("heading-order");
      expect(ids).not.toContain("list");
      expect(serious).toEqual([]);
    });
  });
}
