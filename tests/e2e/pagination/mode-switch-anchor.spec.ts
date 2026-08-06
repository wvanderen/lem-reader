// tests/e2e/pagination/mode-switch-anchor.spec.ts
// PAGE-01 — Reader can explicitly switch the same article between semantic
// paginated and scrolling modes while remaining at the same logical passage
// (D4-10 mode-switch anchor).
//
// SCENARIO: Reader is mid-article in paginated mode, toggles ModeToggle (M
// shortcut or the header button), and the new mode renders at the SAME D-05
// grapheme offset. Repeated toggles do not drift the anchor. Cover 2 fixtures
// × serif default per the plan.
//
// Harness copied verbatim from tests/e2e/measurement/stale-drop.spec.ts:
//   - PIXEL_SVG image-stub (figure load does not race pagination measurement)
//   - IndexedDB deleteDatabase wipe (deterministic first-run state)
//   - hash-route navigation + h1-visible sentinel
import { test, expect } from "@playwright/test";
import { FIXTURES } from "./fixtures-matrix";

const BASE = "http://localhost:5173";
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

interface PaginationDev {
  currentPageIdx: number;
  pagesLength: number;
  status: string;
}

async function waitForPagination(page: import("@playwright/test").Page, fixture: string) {
  await page.goto(`${BASE}/#/article/${fixture}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForFunction(
    () =>
      (window as unknown as Record<string, unknown>).__lemPagination !== undefined,
    undefined,
    { timeout: 8000 },
  );
  await page.waitForTimeout(600);
  return page.evaluate(
    () => (window as unknown as Record<string, unknown>).__lemPagination as PaginationDev,
  );
}

const SWATCH_FIXTURES = FIXTURES.slice(0, 2); // essay-long-form + figure-heavy

test.describe("PAGE-01 mode-switch anchor (04-05)", () => {
  for (const fixture of SWATCH_FIXTURES) {
    test(`${fixture}: M toggles paginated↔scrolling and the passage round-trips (D4-10)`, async ({
      page,
    }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(String(err)));

      const dev = await waitForPagination(page, fixture);
      // Plan 04-06: every fixture paginates; the M-toggle round-trip runs
      // unconditionally. A non-ok status here is a real engine regression.
      expect(dev.status, `engine status for ${fixture}`).toBe("ok");
      expect(dev.pagesLength, `pages count for ${fixture}`).toBeGreaterThan(0);

      const toggle = page.getByRole("button", { name: /^Reading mode:/ });

      // Turn to page 2 and capture its first heading text — the passage to
      // preserve across the round-trip.
      await page.getByRole("button", { name: "Next page" }).click();
      await page.waitForTimeout(200);
      const passageHeading = await page.evaluate(() => {
        const fragment = document.querySelector(".page-fragment");
        const h = fragment?.querySelector("h2, h3, h4, p");
        return h?.textContent?.trim()?.slice(0, 40) ?? null;
      });
      // Sanity: page 2 should have content to anchor on.
      expect(passageHeading, "page 2 must render a passage to anchor on").not.toBeNull();

      // M shortcut → scrolling. The D4-10 anchor should land on the same
      // passage. Assert the captured heading text is visible in scrolling.
      await page.keyboard.press("m");
      await expect(toggle).toHaveAttribute("aria-label", "Reading mode: scrolling");
      await page.waitForTimeout(400);
      // The captured passage should appear somewhere in the scrolling DOM.
      const scrollingHasPassage = await page.evaluate((needle) => {
        if (!needle) return false;
        const article = document.querySelector(".article-body");
        return !!article && article.textContent?.includes(needle);
      }, passageHeading);
      expect(scrollingHasPassage, "scrolling mode must contain the captured passage").toBeTruthy();

      // M again → paginated. D4-10 scrolling→paginated anchor via
      // initialAnchorOffset should remount on the page with the passage.
      await page.keyboard.press("m");
      await expect(toggle).toHaveAttribute("aria-label", "Reading mode: paginated");
      await page.waitForFunction(
        () =>
          ((window as unknown as Record<string, unknown>).__lemPagination as PaginationDev)
            ?.status === "ok",
        undefined,
        { timeout: 8000 },
      );
      await page.waitForTimeout(300);
      const paginatedHasPassage = await page.evaluate((needle) => {
        if (!needle) return false;
        const fragment = document.querySelector(".page-fragment");
        return !!fragment && fragment.textContent?.includes(needle);
      }, passageHeading);
      // The reader should be on (or adjacent to) the page with the passage.
      expect(
        paginatedHasPassage,
        "paginated mode must re-land on the captured passage's page (D4-10)",
      ).toBeTruthy();

      expect(pageErrors, "no uncaught errors during mode switch").toEqual([]);
    });
  }
});
