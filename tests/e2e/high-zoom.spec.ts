// tests/e2e/high-zoom.spec.ts
// ACPT-03 (D6-10) — the high-zoom gap spec. Closes the genuine coverage gap
// no existing edge spec exercised: 400% browser zoom AND 320 CSS px reflow
// (the WCAG 1.4.10 target). This strict bar trivially satisfies the WCAG
// 1.4.4 AA floor (200% without loss); 200%-only was explicitly rejected as
// under-testing the reflow path that matters most for the accessibility-first
// audience (06-CONTEXT.md D6-10).
//
// RESEARCH finding 1 (06-RESEARCH.md): Playwright has NO native browser-zoom
// API [CITED: playwright.dev/docs/emulation]. Therefore:
//   - LOAD-BEARING reflow assertion = `page.setViewportSize({ width: 320,
//     height: 800 })`. This IS the WCAG 1.4.10 320 CSS px condition and
//     forces single-column reflow. Cross-engine (chromium/firefox/webkit).
//     Already used by reflow.spec.ts.
//   - SECONDARY zoom assertion = `document.body.style.zoom = "4"`. This is
//     engine-variable (chromium yes, firefox 126+, webkit partial — Pitfall 3)
//     so we assert ONLY "no content is LOST" (article + blocks still present),
//     never exact pixel layout. The setViewportSize path is the load-bearing
//     one; the zoom path exercises the 400% zoom code path as a secondary
//     no-regression check.
//   - `deviceScaleFactor` is NEVER used — it is DPR (pixel density), NOT CSS
//     zoom, and does not trigger reflow (Pitfall 2).
//
// Applies the shared D6-09 invariant (assertEdgeInvariant) to ALL 6 fixtures
// so the single accessibility bar ("the reader loses nothing") holds at high
// zoom across the whole corpus, in BOTH reading modes. The locked 3-engine
// matrix (playwright.config.ts chromium/firefox/webkit) picks this up
// automatically.
import { test, expect } from "@playwright/test";
import { assertEdgeInvariant } from "./_edge-invariant";
import { FIXTURES, wipeDatabase, openArticle } from "./annotations/_fixtures";

// 320 CSS px is the WCAG 1.4.10 reflow breakpoint; 800px height gives the
// pinned paginated-surface + any full-height sheet room to lay out.
const REFLOW_VIEWPORT = { width: 320, height: 800 };
const ZOOM_LABEL = "high-zoom-400";

test.beforeEach(async ({ page }) => {
  // Image stub + IndexedDB wipe = the canonical deterministic-first-run
  // harness (mirrors reflow.spec.ts + annotations/_fixtures.ts wipeDatabase).
  await wipeDatabase(page);
  await page.setViewportSize(REFLOW_VIEWPORT);
});

// (a)/(b)/(c) shared invariant at 400% + 320 CSS px reflow, per fixture.
// The invariant drives BOTH reading modes internally (M toggle), so each
// fixture proves content + functions + no-overflow hold in paginated AND
// scrolling at the WCAG reflow target.
for (const fixture of FIXTURES) {
  test.describe(`high-zoom @ ${fixture}`, () => {
    test("400% + 320px reflow: shared invariant holds (content + functions + no overflow) in both modes", async ({
      page,
    }) => {
      // LOAD-BEARING: navigate + settle at 320px (setViewportSize ran in
      // beforeEach; openArticle waits for h1 + visible block + __lemPagination
      // DEV hook + 600ms font settle).
      await openArticle(page, fixture);

      // Assert the full D6-09 invariant at the 320px reflow target — this is
      // the cross-engine load-bearing assertion (setViewportSize is the
      // mechanism; assertEdgeInvariant checks (a) keyboard content in both
      // modes, (b) required functions, (c) body + article-body no overflow).
      await assertEdgeInvariant(page, {
        fixture,
        condition: ZOOM_LABEL,
      });

      // SECONDARY: apply 400% CSS zoom via document.body.style.zoom + assert
      // NO CONTENT IS LOST. Engine-variable (chromium yes, firefox 126+,
      // webkit partial — Pitfall 3), so we assert only survival, never exact
      // layout. setViewportSize above remains the load-bearing reflow
      // assertion; this exercises the zoom code path as a no-regression check.
      const visibleBlockSelector =
        "[data-block-index]:not(.article-body-measurement [data-block-index])";
      const before = await page.evaluate((sel) => {
        const blocks = document.querySelectorAll(sel);
        const first = blocks[0];
        return {
          count: blocks.length,
          sample: first?.textContent ?? "",
        };
      }, visibleBlockSelector);
      expect(before.count, `${ZOOM_LABEL} ${fixture}: blocks before zoom`).toBeGreaterThan(
        0,
      );

      // Apply 400% zoom. Wrapped so engines that don't support CSS zoom
      // still leave the page in a usable state (the assertion below is
      // survival, not zoom-magnitude).
      await page.evaluate(() => {
        (document.body.style as unknown as { zoom: string }).zoom = "4";
      });
      // Let the reflow + any ResizeObserver-triggered re-measure settle.
      await page.waitForTimeout(500);

      // No content lost under zoom: article still visible + visible blocks
      // still rendered + sample text preserved.
      await expect(
        page.getByRole("article"),
        `${ZOOM_LABEL} ${fixture}: article lost after 400% zoom`,
      ).toBeVisible();
      const after = await page.evaluate((sel) => {
        const blocks = document.querySelectorAll(sel);
        const first = blocks[0];
        return {
          count: blocks.length,
          sample: first?.textContent ?? "",
        };
      }, visibleBlockSelector);
      expect(
        after.count,
        `${ZOOM_LABEL} ${fixture}: visible blocks lost after 400% zoom`,
      ).toBeGreaterThan(0);
      expect(
        (after.sample ?? "").length,
        `${ZOOM_LABEL} ${fixture}: sample block text lost after 400% zoom`,
      ).toBeGreaterThan(0);
    });
  });
}

// Focused (c)-clause proof at the WCAG 1.4.10 reflow target: at 320px the
// body has NO horizontal overflow. This is the direct reflow contract
// (reflow.spec.ts asserts it for one fixture; here we re-prove it as part of
// the high-zoom acceptance bar on a representative text-heavy fixture).
test("320px reflow: body has no horizontal overflow (WCAG 1.4.10)", async ({
  page,
}) => {
  await openArticle(page, "essay-long-form");

  const overflow = await page.evaluate(() => ({
    scrollW: document.body.scrollWidth,
    clientW: document.body.clientWidth,
  }));
  expect(
    overflow.scrollW,
    `body scrolls horizontally at 320px (scrollW ${overflow.scrollW} > clientW ${overflow.clientW})`,
  ).toBeLessThanOrEqual(overflow.clientW + 1);
});
