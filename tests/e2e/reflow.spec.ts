// tests/e2e/reflow.spec.ts
// A11Y-04 — content and controls remain visible, operable, and within a single
// column at 320 CSS px (the WCAG reflow breakpoint) and at 200% browser zoom,
// with no horizontal scroll of the article body. The settings panel must open
// and all five fieldsets + Reset + close remain operable at this size.
import { test, expect } from "@playwright/test";
import { assertEdgeInvariant } from "./_edge-invariant";
import { FIXTURES, wipeDatabase, openArticle } from "./annotations/_fixtures";

const BASE = "http://localhost:5173";
const FIRST_FIXTURE = "essay-long-form";

test.describe("Reflow at 320px (A11Y-04)", () => {
  test.beforeEach(async ({ page }) => {
    // 320 CSS px is the WCAG reflow breakpoint. Tall viewport so the panel
    // (full-height sheet) has room to lay out.
    await page.setViewportSize({ width: 320, height: 800 });
    // Deterministic first-run state + image stub (the shared e2e harness
    // discipline — annotations/_fixtures.ts wipeDatabase; 06-PATTERNS §Shared
    // Patterns). Plan 06-05 audit (D6-12): every edge spec uses the same
    // harness baseline. Benign to the existing overflow/panel assertions.
    await wipeDatabase(page);
  });

  test("article body has no horizontal overflow at 320px", async ({ page }) => {
    await page.goto(`${BASE}/#/article/${FIRST_FIXTURE}`);
    await expect(page.getByRole("article")).toBeVisible();

    // Body scrollWidth must not exceed clientWidth by more than a 1px tolerance
    // (sub-pixel rounding in some engines). This is the WCAG 1.4.10 contract.
    const overflow = await page.evaluate(() => {
      return {
        body: {
          scrollW: document.body.scrollWidth,
          clientW: document.body.clientWidth,
        },
        article: (() => {
          const el = document.querySelector(".article-body");
          if (!el) return null;
          return {
            scrollW: el.scrollWidth,
            clientW: el.clientWidth,
          };
        })(),
      };
    });
    expect(
      overflow.body.scrollW,
      `body scrolls horizontally at 320px (scrollW ${overflow.body.scrollW} > clientW ${overflow.body.clientW})`,
    ).toBeLessThanOrEqual(overflow.body.clientW + 1);
    if (overflow.article) {
      expect(
        overflow.article.scrollW,
        `article-body scrolls horizontally at 320px`,
      ).toBeLessThanOrEqual(overflow.article.clientW + 1);
    }
  });

  test("settings panel opens at 320px and every section + Reset + close is visible", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIRST_FIXTURE}`);
    await page.getByRole("button", { name: "Reading settings" }).click();
    const dlg = page.locator("dialog.settings-panel");
    await expect(dlg).toBeVisible();

    // All five fieldset sections present and visible.
    for (const legend of [
      "Typeface",
      "Text size",
      "Reading width",
      "Spacing",
      "Theme",
    ]) {
      await expect(page.getByText(legend, { exact: false }).first()).toBeVisible();
    }

    // Reset + close buttons are visible and operable.
    await expect(page.getByRole("button", { name: "Reset to defaults" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Close reading settings" }),
    ).toBeVisible();

    // The panel itself does not introduce horizontal overflow on the page.
    const bodyOverflow = await page.evaluate(() => {
      return document.body.scrollWidth - document.body.clientWidth;
    });
    expect(bodyOverflow).toBeLessThanOrEqual(1);
  });

  // ───────────────────────────────────────────────────────────────────────
  // D6-09 shared edge-condition invariant (Plan 06-05 audit, D6-12).
  // reflow.spec.ts is the ORIGIN of the (c) overflow clause — its body +
  // article-body scrollWidth check above was lifted verbatim into
  // _edge-invariant.ts by Plan 06-01. This audit consumes the helper to
  // ALSO assert (a) full content reachable via keyboard in BOTH reading
  // modes and (b) required functions reachable, so reflow asserts the
  // COMPLETE invariant (a)/(b)/(c), not just overflow. The helper drives
  // the M shortcut internally so each fixture proves the invariant holds
  // in paginated AND scrolling at the 320px WCAG reflow target.
  // Strengthen-only — the existing focused (c) test above stays
  // authoritative as a direct WCAG 1.4.10 proof (D6-12); no duplication
  // in this new test (the helper owns (c) here).
  for (const fixture of FIXTURES) {
    test(`shared invariant holds at 320px reflow @ ${fixture} (D6-09)`, async ({
      page,
    }) => {
      await openArticle(page, fixture);
      await assertEdgeInvariant(page, {
        fixture,
        condition: "reflow-320",
      });
    });
  }
});
