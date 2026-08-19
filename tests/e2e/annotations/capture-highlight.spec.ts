// tests/e2e/annotations/capture-highlight.spec.ts
// ANNO-01 — Reader can select supported article text and create a highlight
// in EITHER reading mode (D5-05 selection-to-action, D5-06 single-block,
// D5-07 broad eligible set, D5-08 paginated visible-fragment binding).
//
// SCENARIO: for each fixture in a representative corpus subset × both modes
// × 3 engines (chromium/firefox/webkit): open article, select a known range
// in a paragraph, assert the floating toolbar appears, click "Highlight",
// assert a mark.highlight renders at the captured range with the right
// data-highlight-id + aria-label prefix, the selection cleared, and
// "Highlight saved." announced.
//
// Eligible-set breadth (D5-07): one capture each in a paragraph + at least
// one other eligible block kind (heading/blockquote/list/caption/code/
// footnote-marker) — "if you can read it, you can highlight it".
//
// Cross-engine selection parity (Pitfall 2): we drive the DOM Range directly
// (NEVER Selection.toString()) so a highlight created in chromium re-anchors
// identically in firefox/webkit.
import { test, expect } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  selectRangeInBlock,
  findFirstBlockWithText,
  visibleReadingSurface,
  switchMode,
  announcementRegion,
  findDisjointBlockWalkingPages,
  turnToPage,
  totalPages,
  currentPageIdx,
} from "./_fixtures";

// Representative subset (mirrors mode-switch-anchor.spec.ts SWATCH_FIXTURES).
const SWATCH_FIXTURES = FIXTURES.slice(0, 2);

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

test.describe("ANNO-01 capture highlight (05-05)", () => {
  for (const fixture of SWATCH_FIXTURES) {
    test(`${fixture}: paginated — select paragraph → Highlight → mark.highlight renders + announces`, async ({
      page,
    }) => {
      await openArticle(page, fixture);
      // Find the first block with enough text on the visible page fragment.
      const blockIndex = await findFirstBlockWithText(page, 24);
      expect(blockIndex, `${fixture} must have a selectable block`).not.toBe(-1);
      const ok = await selectRangeInBlock(page, blockIndex, 0, 24);
      expect(ok, `selection must be set on block ${blockIndex}`).toBeTruthy();
      // The floating toolbar appears near the selection.
      const toolbar = page.locator(".selection-toolbar");
      await expect(toolbar).toBeVisible();
      await expect(toolbar).toHaveAttribute("role", "toolbar");
      // The two action buttons are present on a VALID selection.
      await expect(toolbar.getByRole("button", { name: "Highlight", exact: true })).toBeVisible();
      await expect(
        toolbar.getByRole("button", { name: "Highlight + note" }),
      ).toBeVisible();
      // Click Highlight (the bare path).
      await toolbar.getByRole("button", { name: "Highlight", exact: true }).click();
      // A mark.highlight renders at the captured range.
      const mark = page.locator("mark.highlight");
      await expect(mark.first()).toBeVisible();
      await expect(mark.first()).toHaveAttribute("data-highlight-id", /.+/);
      await expect(mark.first()).toHaveAttribute("aria-haspopup", "dialog");
      // aria-label starts with "Highlight".
      const label = await mark.first().getAttribute("aria-label");
      expect(label ?? "", "aria-label prefix").toMatch(/^Highlight\b/i);
      // The toolbar dismissed (D5-05 — action activated; toolbar's job done).
      await expect(page.locator(".selection-toolbar")).toHaveCount(0);
      // "Highlight saved." announced via the visually-hidden role=status region.
      await expect(announcementRegion(page)).toContainText(/Highlight saved/i);
    });

    test(`${fixture}: scrolling — select paragraph → Highlight → mark.highlight renders (mode parity)`, async ({
      page,
    }) => {
      await openArticle(page, fixture);
      // Switch to scrolling mode + prove the same capture path works there.
      await switchMode(page);
      const blockIndex = await findFirstBlockWithText(page, 24);
      expect(blockIndex, `${fixture} scrolling must have a selectable block`).not.toBe(-1);
      const ok = await selectRangeInBlock(page, blockIndex, 0, 24);
      expect(ok, "selection must be set in scrolling mode").toBeTruthy();
      const toolbar = page.locator(".selection-toolbar");
      await expect(toolbar).toBeVisible();
      await toolbar.getByRole("button", { name: "Highlight", exact: true }).click();
      const mark = page.locator("mark.highlight");
      await expect(mark.first()).toBeVisible();
      await expect(mark.first()).toHaveAttribute("data-highlight-id", /.+/);
      await expect(announcementRegion(page)).toContainText(/Highlight saved/i);
    });
  }

  test("essay-long-form: eligible-set breadth (D5-07) — heading + paragraph captures succeed", async ({
    page,
  }) => {
    // D5-07 "if you can read it, you can highlight it": capture must succeed
    // in multiple eligible block kinds. We exercise two distinct blocks with
    // disjoint ranges against essay-long-form which carries a generous mix.
    // technical-post / figure-heavy below cover the rarer kinds (code +
    // caption).
    //
    // Plan 13-06 repair: under the Option A page-1 budget (viewport − the
    // metadata spot's reserve), essay page 1 carries a single long paragraph
    // — the second DISJOINT block legitimately lives on a later page. Walk
    // pages to it (the D13-09 technical-post precedent), then walk BACK to
    // assert both inline marks render at their own pages (only the current
    // fragment is mounted in paginated mode) + the physical Dexie rows.
    await openArticle(page, "essay-long-form");
    const b1Page = await currentPageIdx(page);
    // First eligible block.
    const b1 = await findFirstBlockWithText(page, 6);
    expect(b1, "first selectable block").not.toBe(-1);
    let ok = await selectRangeInBlock(page, b1, 0, 6);
    expect(ok, "first selection").toBeTruthy();
    await page.locator(".selection-toolbar").getByRole("button", { name: "Highlight", exact: true }).click();
    await expect(page.locator("mark.highlight").first()).toBeVisible();
    await expect(announcementRegion(page)).toContainText(/Highlight saved/i);
    // A second disjoint block (D5-13 disjoint-ranges proof in the positive) —
    // walking pages under the Option A page-1 budget.
    const { blockIndex: b2, pageIndex: b2Page } = await findDisjointBlockWalkingPages(page, [b1], 20);
    expect(b2, "second disjoint selectable block").not.toBe(-1);
    ok = await selectRangeInBlock(page, b2, 0, 20);
    expect(ok, "second selection").toBeTruthy();
    await page.locator(".selection-toolbar").getByRole("button", { name: "Highlight", exact: true }).click();
    await expect(page.locator("mark.highlight").first()).toBeVisible();
    // Both captures persisted (physical Dexie rows — the mode-independent
    // count) + both inline marks render at their own pages.
    const persisted = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return new Promise<number>((resolve, reject) => {
        const tx = db.transaction("highlights", "readonly");
        const req = tx.objectStore("highlights").count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    });
    expect(persisted, "both eligible-set captures persisted").toBeGreaterThanOrEqual(2);
    await expect(
      page.locator("mark.highlight").first(),
      "the walked-to block's mark renders on its page",
    ).toBeVisible();
    await turnToPage(page, b1Page);
    await expect(
      page.locator("mark.highlight").first(),
      "the first block's mark renders on page 1",
    ).toBeVisible();
    expect(b2Page, "the second block was found on a real page").toBeGreaterThanOrEqual(0);
  });

  test("technical-post: code-block source is capturable (D5-07 — capture + persist)", async ({ page }) => {
    // D5-07 "if you can read it, you can highlight it": code-block source is
    // in the eligible set. Capture must succeed + the highlight must persist
    // (D5-03 dual-selector). The inline <mark> overlay is paragraph + heading
    // + caption only (Plan 05-04's documented rendering scope — code-block
    // source is a plain string, not InlineRun[], so the InlineList overlay
    // path does not apply); we therefore assert capture + persistence rather
    // than an inline mark for this block kind.
    await openArticle(page, "technical-post");
    // The pagination engine may place the technical-post code block on a
    // later page than the heading + intro paragraphs (an atomic code block
    // can occupy up to 90% of a page under the PAGE-04 oversize threshold).
    // Walk pages until the visible fragment carries a <pre> code block, then
    // run the capture + persistence assertions from there. This keeps the
    // test resilient to content-distribution shifts (Plan 04-07's
    // page-viewport geometry fix changed how many blocks fit on page 1).
    const total = await totalPages(page);
    let codeBlockIdx = -1;
    for (let target = 0; target < total && codeBlockIdx === -1; target++) {
      await turnToPage(page, target);
      codeBlockIdx = await page.evaluate(() => {
        const blocks = Array.from(
          document.querySelectorAll(
            '[data-block-index]:not(.article-body-measurement [data-block-index])',
          ),
        ).filter((el) => !el.closest(".article-body-measurement"));
        for (const el of blocks) {
          const idx = Number(el.getAttribute("data-block-index"));
          if (
            (el.tagName === "PRE" || !!el.querySelector("pre")) &&
            (el.textContent?.length ?? 0) >= 6
          ) {
            return idx;
          }
        }
        return -1;
      });
    }
    expect(codeBlockIdx, "technical-post must have a code block on some page").not.toBe(-1);
    const ok = await selectRangeInBlock(page, codeBlockIdx, 0, 6);
    expect(ok, "code-block selection").toBeTruthy();
    // The toolbar shows the action buttons (capture eligible).
    const toolbar = page.locator(".selection-toolbar");
    await expect(toolbar).toBeVisible();
    await expect(toolbar.getByRole("button", { name: "Highlight", exact: true })).toBeVisible();
    await toolbar.getByRole("button", { name: "Highlight", exact: true }).click();
    // "Highlight saved." announced → capture succeeded + record persisted.
    await expect(announcementRegion(page)).toContainText(/Highlight saved/i);
    // The record persisted to Dexie (STATE-03).
    const count = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return new Promise<number>((resolve, reject) => {
        const tx = db.transaction("highlights", "readonly");
        const req = tx.objectStore("highlights").count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    });
    expect(count, "code-block highlight persisted").toBeGreaterThanOrEqual(1);
  });

  test("figure-heavy: figure caption is capturable (D5-07 — capture + persist)", async ({ page }) => {
    // D5-07: figure captions are in the eligible set. Capture must succeed +
    // the highlight must persist. The inline <mark> overlay is paragraph +
    // heading only (Plan 05-04's documented rendering scope — figure
    // blockNormalizedText includes alt + separator + caption, diverging from
    // the DOM textContent the capture map walks; handling that divergence is
    // deferred to keep the D-05 substrate stable). We assert capture +
    // persistence rather than an inline mark for this block kind.
    //
    // Plan 13-06 repair: under the Option A page-1 budget the figure +
    // caption no longer sit on page 1 — WALK PAGES until the visible
    // fragment carries a FIGURE with a figcaption (the same walk-pages
    // discipline the technical-post cell below uses for its <pre> block).
    await openArticle(page, "figure-heavy");
    const total = await totalPages(page);
    let captionIdx = -1;
    for (let target = 0; target < total && captionIdx === -1; target++) {
      await turnToPage(page, target);
      captionIdx = await page.evaluate(() => {
        const blocks = Array.from(
          document.querySelectorAll(
            '.page-fragment [data-block-index], .article-body:not(.article-body-measurement) [data-block-index]',
          ),
        ).filter((el) => !el.closest(".article-body-measurement"));
        for (let i = 0; i < blocks.length; i++) {
          const el = blocks[i]!;
          const idx = Number(el.getAttribute("data-block-index"));
          if (el.tagName === "FIGURE" && el.querySelector("figcaption")) return idx;
        }
        return -1;
      });
    }
    expect(
      captionIdx,
      "figure-heavy must have a figure+caption on some page",
    ).not.toBe(-1);
    // Select inside the figcaption specifically (the figure may have an img
    // + caption; we want the caption text).
    const ok = await page.evaluate((blockIndex) => {
      const visibleBlock = Array.from(
        document.querySelectorAll(`[data-block-index="${blockIndex}"]`),
      ).find((el) => !el.closest(".article-body-measurement"));
      if (!visibleBlock) return false;
      const cap = visibleBlock.querySelector("figcaption");
      if (!cap) return false;
      const walker = document.createTreeWalker(cap, NodeFilter.SHOW_TEXT);
      const first = walker.nextNode() as Text | null;
      if (!first || (first.nodeValue?.length ?? 0) < 4) return false;
      const range = document.createRange();
      range.setStart(first, 0);
      range.setEnd(first, Math.min(10, first.nodeValue?.length ?? 0));
      const sel = window.getSelection();
      if (!sel) return false;
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    }, captionIdx);
    expect(ok, "caption selection").toBeTruthy();
    const toolbar = page.locator(".selection-toolbar");
    await expect(toolbar).toBeVisible();
    await toolbar.getByRole("button", { name: "Highlight", exact: true }).click();
    // "Highlight saved." announced → capture succeeded + record persisted.
    await expect(announcementRegion(page)).toContainText(/Highlight saved/i);
    // The record persisted to Dexie (STATE-03).
    const count = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return new Promise<number>((resolve, reject) => {
        const tx = db.transaction("highlights", "readonly");
        const req = tx.objectStore("highlights").count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    });
    expect(count, "caption highlight persisted").toBeGreaterThanOrEqual(1);
  });

  test("D5-08 paginated binding: hidden .article-body-measurement is user-select:none + hidden", async ({
    page,
  }) => {
    // The always-mounted hidden measurement body (Plan 04-08) carries the
    // full article's [data-block-index] for measurement. D5-08 marks it
    // user-select:none so a reader never accidentally selects invisible
    // text. We assert the computed style + that it is not visible.
    await openArticle(page, "essay-long-form");
    const selectable = await page.evaluate(() => {
      const measurement = document.querySelector(".article-body-measurement");
      if (!measurement) return null;
      const cs = window.getComputedStyle(measurement);
      // webkit reports -webkit-user-select (not the standard user-select);
      // check both so the assertion is engine-tolerant.
      return {
        userSelect: cs.userSelect,
        webkitUserSelect: (cs as unknown as { webkitUserSelect?: string }).webkitUserSelect,
      };
    });
    expect(selectable, "measurement body exists").not.toBeNull();
    const anyNone =
      /none/i.test(selectable?.userSelect ?? "") ||
      /none/i.test(selectable?.webkitUserSelect ?? "");
    expect(anyNone, "measurement body is user-select:none").toBeTruthy();
    // The visible surface is distinct from the measurement body. The
    // measurement body is positioned out of flow + aria-hidden; assert it is
    // NOT the visible reading surface + is aria-hidden (the load-bearing
    // a11y contract — screen readers stay on the visible page fragment).
    await expect(visibleReadingSurface(page)).toBeVisible();
    await expect(page.locator(".article-body-measurement")).toHaveAttribute("aria-hidden", "true");
  });

  test("page-error free: no uncaught exceptions during capture (both modes)", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));
    await openArticle(page, "essay-long-form");
    const b1 = await findFirstBlockWithText(page, 24);
    expect(b1).not.toBe(-1);
    let ok = await selectRangeInBlock(page, b1, 0, 24);
    expect(ok).toBeTruthy();
    await page.locator(".selection-toolbar").getByRole("button", { name: "Highlight", exact: true }).click();
    await expect(page.locator("mark.highlight").first()).toBeVisible();
    await switchMode(page);
    // In scrolling mode, find a DIFFERENT block from b1 so the [0,24)
    // selection does not overlap the previously-created highlight on b1
    // (D5-13 disjoint-ranges rule would otherwise surface the overlap hint
    // instead of the action buttons).
    const b2 = await findSecondBlockWithText(page, b1, 24);
    expect(b2).not.toBe(-1);
    ok = await selectRangeInBlock(page, b2, 0, 24);
    expect(ok).toBeTruthy();
    await page.locator(".selection-toolbar").getByRole("button", { name: "Highlight", exact: true }).click();
    await expect(page.locator("mark.highlight").first()).toBeVisible();
    expect(pageErrors, "no uncaught errors during capture").toEqual([]);
  });
});

/**
 * Find the first visible block with text length >= minChars that is NOT
 * the already-used block (so the page-error-free test picks a disjoint
 * second block in scrolling mode, where the whole article is one flow).
 * Local helper (mirrors findFirstBlockWithText shape).
 */
async function findSecondBlockWithText(
  page: import("@playwright/test").Page,
  excludeIndex: number,
  minChars: number,
): Promise<number> {
  return page.evaluate(
    ({ exclude, min }) => {
      const blocks = Array.from(
        document.querySelectorAll(
          '.page-fragment [data-block-index], .article-body:not(.article-body-measurement) [data-block-index]',
        ),
      ).filter((el) => !el.closest(".article-body-measurement"));
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i]!;
        const idx = Number(block.getAttribute("data-block-index"));
        if (
          idx !== exclude &&
          !Number.isNaN(idx) &&
          (block.textContent?.length ?? 0) >= min
        ) {
          return idx;
        }
      }
      return -1;
    },
    { exclude: excludeIndex, min: minChars },
  );
}
