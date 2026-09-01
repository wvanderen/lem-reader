// tests/e2e/reflow.spec.ts
// A11Y-04 — content and controls remain visible, operable, and within a single
// column at 320 CSS px (the WCAG reflow breakpoint) and at 200% browser zoom,
// with no horizontal scroll of the article body. The settings panel must open
// and all five fieldsets + Reset + close remain operable at this size.
import { test, expect } from "@playwright/test";
import { assertEdgeInvariant } from "./_edge-invariant";
// Plan 21-06 (D21-14 / ACPT-08) — the four-destination matrix cells below
// (additive import; the cells are additive to the reader cells above).
import {
  DESTINATIONS,
  assertDestinationInvariant,
  openEdgeDestination,
} from "./_edge-invariant";
import { FIXTURES, wipeDatabase, openArticle } from "./annotations/_fixtures";
// Plan 16-04 — the shared dialog-opening helper (the dialog-open reflow
// case below; ADD-04 geometry proof).
import { openAddDialog, pickSource } from "./library/add-dialog";

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
  // Plan 16-04 (ADD-04): the OPEN Add dialog at the 320px WCAG reflow
  // target. Strengthen-only — the invariant walks above stay authoritative
  // for their surfaces; this case owns the dialog's geometry: no
  // horizontal overflow of the page under the open modal, the dialog
  // surface sits within the viewport horizontally (its own overflow:auto
  // is the tall-content/high-zoom mechanism — never page-level
  // horizontal scrolling), and the picker + submit stay operable.
  test("Add dialog opens at 320px with no horizontal overflow; picker + submit operable", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();

    await openAddDialog(page);
    const dlg = page.locator("dialog.add-dialog");
    await expect(dlg).toBeVisible();

    // The (c) overflow clause at 320px: the page does not scroll
    // horizontally under the open modal.
    const bodyOverflow = await page.evaluate(
      () => document.body.scrollWidth - document.body.clientWidth,
    );
    expect(bodyOverflow).toBeLessThanOrEqual(1);

    // The dialog surface is inside the viewport horizontally, and its
    // tall-content escape hatch is its own overflow:auto (computed style
    // contract — the CSS declares the scroll container).
    const geometry = await dlg.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        left: r.left,
        right: r.right,
        innerWidth: window.innerWidth,
        overflowY: cs.overflowY,
      };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(-1);
    expect(
      geometry.right,
      `dialog right edge ${geometry.right} overflows the ${geometry.innerWidth}px viewport`,
    ).toBeLessThanOrEqual(geometry.innerWidth + 1);
    expect(
      geometry.overflowY,
      "the dialog scrolls its own tall content (overflow:auto)",
    ).toBe("auto");

    // Operability at 320px: every radio responds, the selected source's
    // input renders, and the submit control reflects typed input.
    await pickSource(page, "paste");
    await expect(page.locator("textarea#ingest-paste")).toBeVisible();
    await pickSource(page, "file");
    await expect(page.locator("input#ingest-file")).toBeVisible();
    await pickSource(page, "url");
    await page
      .getByRole("textbox", { name: /add by url/i })
      .fill("https://example.com/reflow-320");
    await expect(page.getByRole("button", { name: /^add$/i })).toBeEnabled();
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

  // ─────────────────────────────────────────────────────────────────────
  // Plan 21-06 (D21-14 / ACPT-08): destination cells. The four-destination
  // matrix extends this spec's 320 CSS px WCAG 1.4.10 reflow target to
  // Library, the open Add dialog, and Highlights via the shared destination
  // machinery (assertDestinationInvariant — the destination-neutral (b)
  // required functions + (c) no-overflow clauses, where (c) is this spec's
  // OWN origin clause applied to body + main#main; the (a) article clause
  // stays reader-scoped in the corpus cells above). The Add-dialog geometry
  // at 320px (dialog box within viewport + overflow:auto + operability)
  // stays owned by the ADD-04 cell above. Strengthen-only — additive cells;
  // the reader corpus cells above stay byte-stable (D6-12).
  for (const destination of DESTINATIONS) {
    test(`destination invariant holds at 320px reflow @ ${destination} (D21-14)`, async ({
      page,
    }) => {
      await openEdgeDestination(page, destination);
      await assertDestinationInvariant(page, {
        destination,
        condition: "reflow-320",
      });
    });
  }
});
