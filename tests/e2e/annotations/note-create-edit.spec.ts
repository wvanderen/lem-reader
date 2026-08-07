// tests/e2e/annotations/note-create-edit.spec.ts
// ANNO-02 — Reader can attach + edit a text note on a highlight (D5-10
// popover, debounced save mirroring D2-03).
//
// SCENARIO: create a highlight via N → popover opens with focused empty
// textarea. Type a note → "Note saved." announces after the debounce window
// (NOT per-keystroke). Activate the <mark> → popover reopens with the
// existing note text + mark.highlight.has-note modifier. Edit → debounced
// save. Clear + Done → has-note modifier removed (empty = no note).
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

test.describe("ANNO-02 note create + edit (05-05)", () => {
  test("N creates a highlight + opens the popover with a focused empty textarea", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    await selectRangeInBlock(page, blockIdx, 0, 18);
    await page.keyboard.press("n");
    await expect(page.locator("mark.highlight").first()).toBeVisible();
    const popover = page.locator("#highlight-popover.highlight-popover");
    await expect(popover).toBeVisible();
    const textarea = popover.locator("textarea.highlight-popover-textarea");
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue("");
    const isFocused = await textarea.evaluate((el) => el === document.activeElement);
    expect(isFocused, "textarea focused on N-open").toBeTruthy();
  });

  test("typing a note persists (debounced) + has-note modifier appears", async ({ page }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    await selectRangeInBlock(page, blockIdx, 0, 18);
    await page.keyboard.press("n");
    const textarea = page.locator("textarea.highlight-popover-textarea");
    await expect(textarea).toBeVisible();
    // Type a note. The in-memory state updates immediately so the has-note
    // modifier reflects; the persistence write is debounced (~800ms).
    await textarea.fill("My note text for this highlight.");
    // The has-note modifier reflects optimistically (D5-10).
    await expect(page.locator("mark.highlight").first()).toHaveClass(/has-note/);
    // Done flushes the debounced save → "Note saved." announces.
    await popoverDone(page);
    await expect(announcementRegion(page)).toContainText(/Note saved/i);
  });

  test("activating the <mark> reopens the popover with the existing note text", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    await selectRangeInBlock(page, blockIdx, 0, 18);
    await page.keyboard.press("n");
    const textarea = page.locator("textarea.highlight-popover-textarea");
    await textarea.fill("Persistent note.");
    await popoverDone(page);
    await expect(announcementRegion(page)).toContainText(/Note saved/i);
    // Close any open popover state, then activate the mark to reopen.
    await expect(page.locator("mark.highlight").first()).toBeVisible();
    await page.locator("mark.highlight").first().click();
    const reopenedTextarea = page.locator("textarea.highlight-popover-textarea");
    await expect(reopenedTextarea).toBeVisible();
    await expect(reopenedTextarea).toHaveValue("Persistent note.");
    // The has-note modifier is still present.
    await expect(page.locator("mark.highlight").first()).toHaveClass(/has-note/);
  });

  test("clearing the textarea + Done removes the has-note modifier (empty = no note)", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    await selectRangeInBlock(page, blockIdx, 0, 18);
    await page.keyboard.press("n");
    const textarea = page.locator("textarea.highlight-popover-textarea");
    await textarea.fill("Temporary note.");
    await expect(page.locator("mark.highlight").first()).toHaveClass(/has-note/);
    await popoverDone(page);
    // Reopen + clear.
    await page.locator("mark.highlight").first().click();
    const reopenedTextarea = page.locator("textarea.highlight-popover-textarea");
    await expect(reopenedTextarea).toBeVisible();
    await reopenedTextarea.fill("");
    // Empty textarea = no note → has-note modifier removed (optimistic).
    await expect(page.locator("mark.highlight").first()).not.toHaveClass(/has-note/);
    await popoverDone(page);
  });

  test("note text renders as a text child (no HTML injection surface)", async ({ page }) => {
    // Type a note containing HTML-like content; the textarea value is a plain
    // string (Pitfall 8 — React escapes text children; react/no-danger ESLint
    // rule forbids raw HTML). The note persists verbatim and re-renders as
    // text, NOT parsed HTML.
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    await selectRangeInBlock(page, blockIdx, 0, 18);
    await page.keyboard.press("n");
    const textarea = page.locator("textarea.highlight-popover-textarea");
    await textarea.fill("<script>alert(1)</script><b>bold</b>");
    await popoverDone(page);
    await expect(announcementRegion(page)).toContainText(/Note saved/i);
    // The popover's excerpt region (the read-only context) must NOT contain a
    // parsed <script> or <b> element — the note text is rendered as text.
    await page.locator("mark.highlight").first().click();
    const popover = page.locator("#highlight-popover");
    await expect(popover.locator("script")).toHaveCount(0);
    await expect(popover.locator("b")).toHaveCount(0);
  });
});

/** Click the popover's Done button (flushes the debounced note save). */
async function popoverDone(page: import("@playwright/test").Page): Promise<void> {
  await page.locator("#highlight-popover .highlight-popover-done").click();
}
