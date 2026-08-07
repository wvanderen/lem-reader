// tests/e2e/annotations/navigate-back.spec.ts
// ANNO-04 / D5-11 — From the drawer, tapping an entry closes the drawer,
// jumps to the block containing the highlight, and focuses the <mark>.
// Works in BOTH modes (paginated turns the page; scrolling scrollIntoView).
// Ambiguous/orphan entries do NOT navigate (disabled jump button).
import { test, expect } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  selectRangeInBlock,
  findFirstBlockWithText,
  drawerTrigger,
  switchMode,
} from "./_fixtures";

const FIXTURE = FIXTURES[0]!; // essay-long-form

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

test.describe("ANNO-04 navigate back (05-05)", () => {
  test("paginated: drawer entry jump turns the page + focuses the <mark>", async ({ page }) => {
    await openArticle(page, FIXTURE);
    // Create a highlight on a block that is NOT on page 1 (so navigate-back
    // actually turns the page). Turn to page 2 first, create the highlight
    // there, then return to page 1 + open the drawer.
    await page.getByRole("button", { name: "Next page" }).click();
    await page.waitForTimeout(300);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx, "page 2 must have a selectable block").not.toBe(-1);
    const ok = await selectRangeInBlock(page, blockIdx, 0, 18);
    expect(ok).toBeTruthy();
    await page.locator(".selection-toolbar").getByRole("button", { name: "Highlight", exact: true }).click();
    await expect(page.locator("mark.highlight").first()).toBeVisible();
    const hlId = await page.locator("mark.highlight").first().getAttribute("data-highlight-id");
    expect(hlId).toBeTruthy();
    // Return to page 1 + open the drawer.
    await page.getByRole("button", { name: "Previous page" }).click();
    await page.waitForTimeout(300);
    await drawerTrigger(page).click();
    const entry = page.locator("dialog.annotations-drawer .drawer-list li").first();
    await expect(entry).toBeVisible();
    // Jump → drawer closes, page turns to the target, mark focuses.
    await entry.locator(".drawer-entry").click();
    await expect(page.locator("dialog.annotations-drawer")).toBeHidden();
    // The mark with the highlight id is now focused (D5-11 + D4-07). The
    // focus is rAF-deferred after the page-turn commit; retry (firefox's
    // page-turn + rAF focus can race a fixed wait).
    const mark = page.locator(`mark.highlight[data-highlight-id="${hlId}"]`);
    await expect(mark.first()).toBeVisible();
    await expect(async () => {
      const focusedId = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.getAttribute?.("data-highlight-id") ?? null;
      });
      expect(focusedId, "navigate-back focuses the <mark>").toBe(hlId);
    }).toPass({ timeout: 3000 });
  });

  test("scrolling: drawer entry jump scrollIntoView-s the block + focuses the <mark>", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    await switchMode(page);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    const ok = await selectRangeInBlock(page, blockIdx, 0, 18);
    expect(ok).toBeTruthy();
    await page.locator(".selection-toolbar").getByRole("button", { name: "Highlight", exact: true }).click();
    await expect(page.locator("mark.highlight").first()).toBeVisible();
    const hlId = await page.locator("mark.highlight").first().getAttribute("data-highlight-id");
    expect(hlId).toBeTruthy();
    // Scroll away from the mark, then jump back via the drawer.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    await drawerTrigger(page).click();
    const entry = page.locator("dialog.annotations-drawer .drawer-list li").first();
    await expect(entry).toBeVisible();
    await entry.locator(".drawer-entry").click();
    await expect(page.locator("dialog.annotations-drawer")).toBeHidden();
    const mark = page.locator(`mark.highlight[data-highlight-id="${hlId}"]`);
    await expect(mark.first()).toBeVisible();
    await expect(async () => {
      const focusedId = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.getAttribute?.("data-highlight-id") ?? null;
      });
      expect(focusedId, "scrolling navigate-back focuses the <mark>").toBe(hlId);
    }).toPass({ timeout: 3000 });
    // Navigating from scrolling mode did NOT force a mode switch.
    await expect(page.getByRole("button", { name: /^Reading mode:/ })).toHaveAttribute(
      "aria-label",
      "Reading mode: scrolling",
    );
  });

  test("ambiguous/orphan drawer entries are non-navigating (disabled jump button)", async ({
    page,
  }) => {
    // Seed an orphan highlight (quote.exact not in the article) so the eager
    // batch-resolve surfaces it as unresolved. The drawer entry's jump button
    // must be disabled (ANNO-07 — never jump to an uncertain spot).
    await openArticle(page, FIXTURE);
    const articleId = FIXTURE;
    await seedOrphan(page, articleId);
    // Reload so the seeded record is picked up by the eager batch-resolve.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(800);
    await drawerTrigger(page).click();
    const entry = page.locator("dialog.annotations-drawer .drawer-list li").first();
    await expect(entry).toBeVisible();
    // The jump button is disabled (D5-04 / ANNO-07).
    await expect(entry.locator(".drawer-entry")).toBeDisabled();
    // The flag copy surfaces the unresolved state.
    await expect(entry).toContainText(/Couldn't/i);
  });
});

/**
 * Seed an orphan highlight directly into Dexie. The quote.exact is a string
 * that does NOT appear anywhere in the article's normalized text, so
 * resolveQuoteSelector returns "orphan" on the eager batch-resolve. The
 * position is a nearness hint (rendered at the best-effort vicinity).
 */
async function seedOrphan(
  page: import("@playwright/test").Page,
  articleId: string,
): Promise<void> {
  await page.evaluate(
    async (aid) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open("lem-reader");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      const tx = db.transaction("highlights", "readwrite");
      tx.objectStore("highlights").put({
        schemaVersion: 1,
        id: "seed-orphan-1",
        articleId: aid,
        revision: 1,
        position: { start: 5, end: 15 },
        quote: {
          prefix: "zzqxx ",
          exact: "ZZQXX NONEXISTENT ORPHAN PASSAGE QQZZX",
          suffix: " qqzzx",
        },
        createdAt: new Date().toISOString(),
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    articleId,
  );
}
