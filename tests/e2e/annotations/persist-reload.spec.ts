// tests/e2e/annotations/persist-reload.spec.ts
// STATE-03 (focused) — Highlights + notes persist across a full page reload.
// Verifies the Dexie compound-index query + Zod boundary on real reload.
import { test, expect } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  selectRangeInBlock,
  findFirstBlockWithText,
  findDisjointBlockWalkingPages,
  turnToPage,
  totalPages,
} from "./_fixtures";

const FIXTURE = FIXTURES[0]!; // essay-long-form

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

test.describe("STATE-03 persist + reload (05-05)", () => {
  test("2 highlights + 1 note reload from Dexie + render at the same passages", async ({
    page,
  }) => {
    // Plan 13-06 repair: under the Option A page-1 budget (viewport − the
    // metadata spot's reserve), essay page 1 carries a single long paragraph
    // — highlight 2's disjoint block lives on a later page. WALK PAGES to
    // it (the D13-09 walk-pages precedent), and after the reload WALK the
    // pages again to prove BOTH marks re-render from Dexie at their own
    // passages (only the current page fragment is mounted in paginated
    // mode — the epub-intake SC#2 forward-walk pattern). The Dexie
    // persistence contract + drawer assertions are unchanged.
    await openArticle(page, FIXTURE);
    // Highlight 1 (bare) on the first eligible block (page 1).
    let b1 = await findFirstBlockWithText(page, 24);
    expect(b1).not.toBe(-1);
    let ok = await selectRangeInBlock(page, b1, 0, 16);
    expect(ok).toBeTruthy();
    await page.locator(".selection-toolbar").getByRole("button", { name: "Highlight", exact: true }).click();
    await expect(page.locator("mark.highlight").first()).toBeVisible();
    const id1 = await page.locator("mark.highlight").first().getAttribute("data-highlight-id");

    // Highlight 2 (with note) on a disjoint block — walking pages.
    const { blockIndex: b2, pageIndex: b2Page } = await findDisjointBlockWalkingPages(page, [b1], 24);
    expect(b2).not.toBe(-1);
    ok = await selectRangeInBlock(page, b2, 0, 16);
    expect(ok).toBeTruthy();
    await page.keyboard.press("n");
    await page.locator("textarea.highlight-popover-textarea").fill("Persistent note across reload.");
    await page.locator("#highlight-popover .highlight-popover-done").click();
    await expect(page.locator("mark.highlight").first()).toBeVisible();
    await expect(page.locator("mark.highlight.has-note").first()).toBeVisible();
    const id2 = await page
      .locator("mark.highlight.has-note")
      .first()
      .getAttribute("data-highlight-id");

    // Reload — full page reload.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(800);
    // The pagination engine re-commits before any page walk.
    await page.waitForFunction(
      () =>
        (window as unknown as Record<string, unknown>).__lemPagination !==
        undefined,
      undefined,
      { timeout: 10_000 },
    );

    // Both highlights reload + render — each on the page where its passage
    // lives (walk forward from page 1 through every page, the epub-intake
    // SC#2 pattern, so each mark's page is guaranteed current).
    const total = await totalPages(page);
    const seen1 = page.locator(`mark.highlight[data-highlight-id="${id1}"]`);
    const seen2 = page.locator(`mark.highlight[data-highlight-id="${id2}"]`);
    let found1 = false;
    let found2 = false;
    for (let target = 0; target < total; target++) {
      await turnToPage(page, target);
      if (!found1 && (await seen1.count()) > 0) {
        await expect(seen1).toBeVisible();
        // The note-bearing modifier is id2's contract (asserted on ITS page).
        found1 = true;
      }
      if (!found2 && (await seen2.count()) > 0) {
        await expect(seen2).toBeVisible();
        // The note-bearing highlight keeps its modifier after reload.
        await expect(seen2).toHaveClass(/has-note/);
        found2 = true;
      }
      if (found1 && found2) break;
    }
    expect(found1, "highlight 1 re-rendered from Dexie at its passage").toBe(true);
    expect(found2, "highlight 2 re-rendered from Dexie at its passage").toBe(true);
    expect(b2Page, "highlight 2's pre-reload page was real").toBeGreaterThanOrEqual(0);

    // The drawer count + entries match.
    await page.getByRole("button", { name: /^Highlights and notes/ }).click();
    const entries = page.locator("dialog.annotations-drawer .drawer-list li");
    await expect(entries).toHaveCount(2);
  });

  test("reload across engines — Dexie read is engine-stable (chromium/firefox/webkit)", async ({
    page,
  }) => {
    // A single highlight reloads cleanly. This test runs × 3 engines; if any
    // engine's IndexedDB read path diverged, the reload would lose the mark.
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    const ok = await selectRangeInBlock(page, blockIdx, 0, 16);
    expect(ok).toBeTruthy();
    await page.locator(".selection-toolbar").getByRole("button", { name: "Highlight", exact: true }).click();
    const hlId = await page.locator("mark.highlight").first().getAttribute("data-highlight-id");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page.locator(`mark.highlight[data-highlight-id="${hlId}"]`)).toHaveCount(1);
  });
});
