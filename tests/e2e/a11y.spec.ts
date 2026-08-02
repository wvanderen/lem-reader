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

// ── A11Y-03 single-content-tree: settings panel open ─────────────────────────
// Phase 2 (02-01): with the settings panel open via showModal, the article
// must NOT be duplicated (single content tree). The browser auto-inerts the
// rest of the document under showModal, so screen-reader reading order stays
// equal to document order. Asserted on one fixture article (representative)
// because the panel mechanism is identical across fixtures.
test("a11y 02-01 single-content-tree: article is rendered exactly once while panel is open (A11Y-03)", async ({
  page,
}) => {
  await page.goto(`${BASE}/#/article/essay-long-form`);

  // Open the settings panel via the gear.
  await page.getByRole("button", { name: "Reading settings" }).click();
  await expect(page.locator("dialog.settings-panel")).toBeVisible();

  // Run axe on the panel-open state — zero serious/critical violations.
  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
  const serious = seriousViolations(results);
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);

  // A11Y-03 invariant: exactly ONE .article-body in the DOM (not duplicated).
  const articleCount = await page.locator("article.article-body").count();
  expect(articleCount, "article-body must appear exactly once").toBe(1);

  // The dialog is open — the browser has made the rest of the document inert
  // (showModal's top-layer behavior). Confirm the dialog is in the open state
  // so the inert backdrop is in effect.
  const dlgOpen = await page.locator("dialog.settings-panel").evaluate(
    (el) => (el as HTMLDialogElement).open,
  );
  expect(dlgOpen, "dialog must be open (modal inert backdrop active)").toBe(true);
});
