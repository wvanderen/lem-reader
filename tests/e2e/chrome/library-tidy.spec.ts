// tests/e2e/chrome/library-tidy.spec.ts
// POLISH-06 / D13-16 — the library home reads as a header row plus calm
// ordered regions: continue reading, then the library list, with the
// library-load status card following the list. This spec pins the DOM
// ORDER and the byte-stable anchors the tidy promised to preserve
// (Pitfall 8-5): main with id "main" (skip-link target), the h1 "Saved
// articles", the .status live region (role=status + aria-live=polite),
// and the ul.library-list rows — while proving the LibraryView reorg
// introduced NO behavior change (the three existing library specs stay
// green byte-unchanged, run separately by the plan's verification).
//
// Plan 16-03 re-anchor (same commit as the DOM change — Pitfall 1): the
// permanently-mounted add-content section DISSOLVED (ADD-01). The header
// row now holds the h1 PLUS the Add to Library trigger (D16-03 — the
// gear-button aria shape); the forms live behind that button's modal
// dialog. The ordered-regions computation, the load-status scoping, and
// the wide/narrow geometry below all reflect the post-dissolution DOM.
//
// Selector scoping note: the library page carries TWO .status live
// regions — LibraryView's byte-stable load-status (a DIRECT child of
// main#main, following the list region) and the Add dialog's own
// submit-status (inside dialog.add-dialog, inert while closed). The tidy
// assertions scope to the load-status one via main#main > .status.
//
// Harness reuse (REUSE-DO-NOT-FORK): prepareFreshPage from
// portability/_portability.ts (mount + clear-rows — deterministic first-run
// state with the fixture corpus listed).
import { test, expect, type Page } from "@playwright/test";
import { prepareFreshPage } from "../portability/_portability";

/** DOM-order predicate bundle evaluated in the live page. compareDocumentPosition
 * is the authoritative order check (visual position can differ under CSS). */
async function tidyOrder(page: Page): Promise<{
  continueBeforeSearch: boolean;
  addBeforeSearch: boolean;
  searchBeforeList: boolean;
  statusFollowsList: boolean;
  headerHoldsH1AndAdd: boolean;
}> {
  return page.evaluate(() => {
    const q = (sel: string): Element => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`tidy spec: expected ${sel} in the DOM`);
      return el;
    };
    const before = (a: Element, b: Element): boolean =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    return {
      // The ordered regions after the Plan 16-03 dissolution:
      // continue-reading container → the header Add button → search input
      // → the library list (the continue section is unconditionally
      // mounted on EVERY view — D16-14 superseded 2026-09-08 — so its
      // presence here needs no #/ landing justification).
      continueBeforeSearch: before(
        q(".library-section-continue"),
        q(".library-search"),
      ),
      addBeforeSearch: before(q(".library-add-button"), q(".library-search")),
      searchBeforeList: before(q(".library-search"), q("ul.library-list")),
      // The byte-stable .status load live region is re-homed as a DIRECT
      // child of main, AFTER the list region (Plan 16-03 — it follows the
      // list, not the retired add-content controls).
      statusFollowsList: before(
        q("ul.library-list"),
        q("main#main > .status"),
      ),
      // The header row holds the h1 AND the Add to Library trigger beside
      // it (D16-03) — and still no in-page Highlights button (the 15-02
      // OQ1 removal; the shell link is the sole highlights entry).
      headerHoldsH1AndAdd:
        document.querySelector(".library-header h1") !== null &&
        document.querySelector(".library-header .library-add-button") !==
          null &&
        document.querySelector(".library-header .article-export-highlights") ===
          null,
    };
  });
}

test("library home renders the header row plus ordered regions (header → continue → list → status)", async ({
  page,
}) => {
  await prepareFreshPage(page);
  // Gate on committed rows so ul.library-list is in its final state (the
  // load effect resolves async; auto-retry beats a snapshot race).
  await expect(page.locator(".library-list > li").first()).toBeVisible({
    timeout: 10_000,
  });

  const order = await tidyOrder(page);
  expect(order.continueBeforeSearch, "continue-reading section precedes the search input").toBe(true);
  expect(order.addBeforeSearch, "the header Add button precedes the search input").toBe(true);
  expect(order.searchBeforeList, "search input precedes the library list").toBe(true);
  expect(order.statusFollowsList, "the .status live region follows the library list").toBe(true);
  expect(order.headerHoldsH1AndAdd, "header row holds the h1 + the Add to Library button (D16-03)").toBe(true);
});

test("byte-stable library anchors survive the tidy (Pitfall 8-5)", async ({ page }) => {
  await prepareFreshPage(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Saved articles" }),
    "h1 text is the SC#1 regression target",
  ).toBeVisible({ timeout: 10_000 });

  // Skip-link target: main carries id="main".
  await expect(page.locator("main#main")).toBeAttached();

  // The LibraryView .status live region (a direct child of main following
  // the list region) keeps its polite live-region semantics.
  const status = page.locator("main#main > .status");
  await expect(status).toBeAttached();
  await expect(status).toHaveAttribute("role", "status");
  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(status).toHaveAttribute("aria-atomic", "true");

  // The list itself: the ul.library-list with li rows (direct children —
  // the 08-05 nested-chip lesson) is present and populated.
  await expect(page.locator("ul.library-list")).toBeAttached();
  await expect(page.locator(".library-list > li").first()).toBeVisible();
});

test("the header row shares the library measure (G1)", async ({ page }) => {
  // Wide viewport: the header row (h1 + the Add to Library button) sits
  // inside the SAME centered content measure as the library list — both
  // capped at the shared width and sharing one horizontal center — instead
  // of spanning edge-to-edge.
  await page.setViewportSize({ width: 1400, height: 900 });
  await prepareFreshPage(page);
  // Gate on committed rows so ul.library-list reflects its final state
  // (same gate as the order test — direct reads after, no fixed sleeps).
  await expect(page.locator(".library-list > li").first()).toBeVisible({
    timeout: 10_000,
  });

  const wideHeader = await page.locator(".library-header").boundingBox();
  const wideAdd = await page.locator(".library-add-button").boundingBox();
  const wideList = await page.locator("ul.library-list").boundingBox();
  if (!wideHeader || !wideAdd || !wideList) {
    throw new Error("tidy spec: measure boxes unresolved at 1400×900");
  }
  expect(wideHeader.width, "header row is capped at the shared measure").toBeLessThanOrEqual(1100);
  expect(wideList.width, "library list is capped at the shared measure").toBeLessThanOrEqual(1100);
  const headerCenter = wideHeader.x + wideHeader.width / 2;
  const listCenter = wideList.x + wideList.width / 2;
  expect(
    Math.abs(headerCenter - listCenter),
    "header row and library list share one horizontal center",
  ).toBeLessThanOrEqual(1);
  // The Add trigger lives INSIDE the header measure (its box is contained
  // by the header row's box — the button never escapes the shared width).
  expect(wideAdd.x, "Add button starts inside the header box").toBeGreaterThanOrEqual(wideHeader.x);
  expect(
    wideAdd.x + wideAdd.width,
    "Add button ends inside the header box",
  ).toBeLessThanOrEqual(wideHeader.x + wideHeader.width);

  // Narrow viewport: both boxes fill the main content box exactly — the
  // measure rule introduces no narrow-viewport regression.
  await page.setViewportSize({ width: 360, height: 640 });
  const narrowHeader = await page.locator(".library-header").boundingBox();
  const narrowList = await page.locator("ul.library-list").boundingBox();
  if (!narrowHeader || !narrowList) {
    throw new Error("tidy spec: measure boxes unresolved at 360×640");
  }
  expect(narrowHeader.width, "header row fills the content box like its siblings").toBe(narrowList.width);
});
