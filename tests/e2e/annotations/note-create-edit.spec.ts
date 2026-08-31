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
  switchMode,
  selectRangeBetweenBlocks,
  markTextsForHighlight,
  countHighlightsInDexie,
  totalPages,
  turnToPage,
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

// ── Phase 19 (Plan 19-05 Task 2 item 6): the SPAN note-edit cell ──────────────
// ANNO-11 note-edit-on-span: a multi-block highlight carries ONE note keyed to
// the ONE record (D5-10 1:1 substrate) — editing the note from the span's
// FIRST slice reaches that one record, never forks per fragment, and leaves
// the mark extents untouched in both reading modes.

test.describe("ANNO-02/ANNO-11 note edit on a multi-block span (19-05)", () => {
  test("editing a note on a span reaches the ONE record + mark extents unchanged in both modes", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    await switchMode(page); // scrolling — the whole body mounts
    const ok = await selectRangeBetweenBlocks(
      page,
      { blockIndex: 0, offset: 5 },
      { blockIndex: 1, offset: 14 },
    );
    expect(ok, "cross-block span selection placed").toBeTruthy();
    // N creates the span highlight + opens the popover with a focused
    // textarea (the same D5-10 flow — unchanged for spans, D19-09).
    await page.keyboard.press("n");
    const textarea = page.locator("textarea.highlight-popover-textarea");
    await expect(textarea).toBeVisible();
    await textarea.fill("Span note first draft.");
    await popoverDone(page);
    await expect(announcementRegion(page)).toContainText(/Note saved/i);

    // The span's FIRST slice (document order in scrolling mode) carries
    // the hl- DOM id + the has-note modifier on every slice.
    const hlId = await page
      .locator("mark.highlight")
      .first()
      .getAttribute("data-highlight-id");
    expect(hlId).toBeTruthy();
    await expect(page.locator(`#hl-${hlId}`)).toHaveCount(1);
    const extentsBefore = await markTextsForHighlight(page, hlId!);
    expect(extentsBefore.length, "marks render in BOTH blocks").toBeGreaterThanOrEqual(2);
    const notedMarks = page.locator(
      `mark.highlight.has-note[data-highlight-id="${hlId}"]`,
    );
    expect(await notedMarks.count()).toBe(extentsBefore.length);

    // Reopen the popover ON THE FIRST SLICE + edit the note.
    await page.locator(`#hl-${hlId}`).click();
    const reopened = page.locator("textarea.highlight-popover-textarea");
    await expect(reopened).toBeVisible();
    await expect(reopened).toHaveValue("Span note first draft.");
    await reopened.fill("Span note edited once.");
    await popoverDone(page);
    await expect(announcementRegion(page)).toContainText(/Note saved/i);

    // ONE record: exactly one highlight row + ONE note row attached to it
    // (the D5-10 1:1 substrate — the edit never forked a per-fragment note).
    expect(await countHighlightsInDexie(page, FIXTURE)).toBe(1);
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
    expect(noteCount, "exactly ONE note row on the ONE span record").toBe(1);

    // Mark extents are unchanged by the note edit — byte-stable in
    // scrolling (the full-extent surface)…
    expect(await markTextsForHighlight(page, hlId!)).toEqual(extentsBefore);
    await expect(page.locator(`#hl-${hlId}`)).toHaveCount(1);

    // …and still rendering in paginated mode (walk pages to the passage —
    // the D13-09 walk-pages precedent; one id per mounted page).
    await switchMode(page);
    await page.waitForTimeout(500);
    let foundPaginated = false;
    const total = await totalPages(page);
    for (let target = 0; target < total; target++) {
      await turnToPage(page, target);
      const count = await page
        .locator(`mark.highlight[data-highlight-id="${hlId}"]`)
        .count();
      if (count > 0) {
        await expect(
          page.locator(`mark.highlight[data-highlight-id="${hlId}"]`).first(),
        ).toBeVisible();
        await expect(page.locator(`#hl-${hlId}`)).toHaveCount(1);
        foundPaginated = true;
        break;
      }
    }
    expect(foundPaginated, "span marks still render in paginated mode after the note edit").toBe(true);
  });
});
