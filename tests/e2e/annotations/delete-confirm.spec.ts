// tests/e2e/annotations/delete-confirm.spec.ts
// ANNO-03 / D5-12 — Delete is a two-step confirm with non-destructive
// default focus (mirrors WipeConfirm Pitfall 8). The destructive action
// removes the highlight + its note together (cascade-delete).
//
// SCENARIO: open popover on a highlight → Delete → confirm prompt
// "Delete this highlight?" replaces the body + focus moves to Keep
// ([data-initial-focus]). Click Keep → returns to edit view, nothing
// deleted. Click Delete again → confirm → Delete → highlight + note
// removed together, popover closes, "Highlight deleted." announces.
import { test, expect } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  selectRangeInBlock,
  findFirstBlockWithText,
  announcementRegion,
} from "./_fixtures";

const FIXTURE = FIXTURES[0]!; // essay-long-form

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

test.describe("ANNO-03 delete confirm (05-05)", () => {
  test("Delete starts a two-step confirm with non-destructive default focus (Keep)", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    await selectRangeInBlock(page, blockIdx, 0, 18);
    await page.keyboard.press("n");
    const textarea = page.locator("textarea.highlight-popover-textarea");
    await textarea.fill("Note to delete.");
    await page.locator("#highlight-popover .highlight-popover-done").click();
    // Reopen the popover on the highlight.
    await page.locator("mark.highlight").first().click();
    // Step 1: click Delete → confirm prompt replaces the body.
    await page.locator("#highlight-popover .highlight-popover-delete").click();
    await expect(page.locator("#highlight-popover .highlight-popover-confirm")).toBeVisible();
    await expect(page.locator("#highlight-popover .highlight-popover-confirm-prompt")).toContainText(
      /Delete this highlight\?/i,
    );
    // Non-destructive default focus → the Keep button ([data-initial-focus]).
    const keepBtn = page.locator("#highlight-popover [data-initial-focus]");
    await expect(keepBtn).toBeVisible();
    await expect(keepBtn).toContainText(/Keep/i);
    const isFocused = await keepBtn.evaluate((el) => el === document.activeElement);
    expect(isFocused, "Keep button has non-destructive default focus").toBeTruthy();
  });

  test("Keep cancels the delete — returns to edit view, nothing deleted", async ({ page }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    await selectRangeInBlock(page, blockIdx, 0, 18);
    await page.keyboard.press("n");
    await page.locator("textarea.highlight-popover-textarea").fill("Note to keep.");
    await page.locator("#highlight-popover .highlight-popover-done").click();
    await expect(page.locator("mark.highlight").first()).toBeVisible();
    const baseline = await page.locator("mark.highlight").count();
    // Reopen + start delete.
    await page.locator("mark.highlight").first().click();
    await page.locator("#highlight-popover .highlight-popover-delete").click();
    await expect(page.locator("#highlight-popover .highlight-popover-confirm")).toBeVisible();
    // Keep → returns to edit view.
    await page.locator("#highlight-popover [data-initial-focus]").click();
    await expect(page.locator("#highlight-popover .highlight-popover-confirm")).toHaveCount(0);
    // The highlight is still present.
    await expect(page.locator("mark.highlight")).toHaveCount(baseline);
  });

  test("Confirmed delete removes the highlight + note together + announces 'Highlight deleted.'", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    await selectRangeInBlock(page, blockIdx, 0, 18);
    await page.keyboard.press("n");
    await page.locator("textarea.highlight-popover-textarea").fill("Note to delete.");
    await page.locator("#highlight-popover .highlight-popover-done").click();
    // Capture the highlight id so we can verify both the mark + the Dexie
    // row are gone after delete.
    const hlId = await page
      .locator("mark.highlight")
      .first()
      .getAttribute("data-highlight-id");
    expect(hlId, "highlight has data-highlight-id").toBeTruthy();
    // Reopen + start delete + confirm.
    await page.locator("mark.highlight").first().click();
    await page.locator("#highlight-popover .highlight-popover-delete").click();
    await expect(page.locator("#highlight-popover .highlight-popover-confirm")).toBeVisible();
    await page.locator("#highlight-popover .highlight-popover-destructive").click();
    // The mark unmounts.
    await expect(page.locator(`mark.highlight[data-highlight-id="${hlId}"]`)).toHaveCount(0);
    // "Highlight deleted." announced.
    await expect(announcementRegion(page)).toContainText(/Highlight deleted/i);
    // Cascade-delete: the note row is gone too (verify via Dexie).
    const noteCount = await page.evaluate(async (id) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open("lem-reader");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      return await new Promise<number>((resolve, reject) => {
        const tx = db.transaction("notes", "readonly");
        const req = tx.objectStore("notes").index("highlightId").count(IDBKeyRange.only(id));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }, hlId!);
    expect(noteCount, "note cascade-deleted with the highlight").toBe(0);
  });
});
