// tests/e2e/chrome/library-tidy.spec.ts
// POLISH-06 / D13-16 — the library home reads as a header row plus three
// calm ordered regions: continue reading, then add content, then the library
// list. This spec pins the DOM ORDER and the byte-stable anchors the tidy
// promised to preserve (Pitfall 8-5): main with id "main" (skip-link
// target), the h1 "Saved articles", the .status live region (role=status +
// aria-live=polite), and the ul.library-list rows — while proving the
// LibraryView reorg introduced NO behavior change (the three existing
// library specs stay green byte-unchanged, run separately by the plan's
// verification).
//
// Selector scoping note: the library page carries TWO .status live regions —
// IngestControl's own (inside .ingest-control) and LibraryView's byte-stable
// one (a DIRECT child of .library-section-add, directly following the
// ingest control). The tidy assertions scope to the LibraryView one.
//
// Harness reuse (REUSE-DO-NOT-FORK): prepareFreshPage from
// portability/_portability.ts (mount + clear-rows — deterministic first-run
// state with the fixture corpus listed).
import { test, expect, type Page } from "@playwright/test";
import { prepareFreshPage } from "../portability/_portability";

/** DOM-order predicate bundle evaluated in the live page. compareDocumentPosition
 * is the authoritative order check (visual position can differ under CSS). */
async function tidyOrder(page: Page): Promise<{
  continueBeforeIngest: boolean;
  ingestBeforeSearch: boolean;
  searchBeforeList: boolean;
  statusFollowsIngest: boolean;
  headerHoldsH1AndReviewButton: boolean;
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
      // The three ordered regions: continue-reading container → ingest
      // control → search input → the library list.
      continueBeforeIngest: before(
        q(".library-section-continue"),
        q(".ingest-control"),
      ),
      ingestBeforeSearch: before(q(".ingest-control"), q(".library-search")),
      searchBeforeList: before(q(".library-search"), q("ul.library-list")),
      // The byte-stable .status live region DIRECTLY follows the add-content
      // controls (LibraryView's status, not IngestControl's inner one).
      statusFollowsIngest: before(
        q(".ingest-control"),
        q(".library-section-add > .status"),
      ),
      // The header row groups the h1 with the quiet Review-highlights button.
      headerHoldsH1AndReviewButton:
        document.querySelector(".library-header h1") !== null &&
        document.querySelector(".library-header .article-export-highlights") !== null,
    };
  });
}

test("library home renders the header row plus three ordered regions (continue → add → list)", async ({
  page,
}) => {
  await prepareFreshPage(page);
  // Gate on committed rows so ul.library-list is in its final state (the
  // load effect resolves async; auto-retry beats a snapshot race).
  await expect(page.locator(".library-list > li").first()).toBeVisible({
    timeout: 10_000,
  });

  const order = await tidyOrder(page);
  expect(order.continueBeforeIngest, "continue-reading section precedes add-content").toBe(true);
  expect(order.ingestBeforeSearch, "add-content control precedes the search input").toBe(true);
  expect(order.searchBeforeList, "search input precedes the library list").toBe(true);
  expect(order.statusFollowsIngest, "the .status live region follows the add-content controls").toBe(true);
  expect(order.headerHoldsH1AndReviewButton, "header row holds the h1 + Review-highlights button").toBe(true);
});

test("byte-stable library anchors survive the tidy (Pitfall 8-5)", async ({ page }) => {
  await prepareFreshPage(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Saved articles" }),
    "h1 text is the SC#1 regression target",
  ).toBeVisible({ timeout: 10_000 });

  // Skip-link target: main carries id="main".
  await expect(page.locator("main#main")).toBeAttached();

  // The LibraryView .status live region (direct child of the add-content
  // section) keeps its polite live-region semantics.
  const status = page.locator(".library-section-add > .status");
  await expect(status).toBeAttached();
  await expect(status).toHaveAttribute("role", "status");
  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(status).toHaveAttribute("aria-atomic", "true");

  // The list itself: the ul.library-list with li rows (direct children —
  // the 08-05 nested-chip lesson) is present and populated.
  await expect(page.locator("ul.library-list")).toBeAttached();
  await expect(page.locator(".library-list > li").first()).toBeVisible();
});
