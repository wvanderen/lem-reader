// tests/e2e/annotations/note-create-edit.spec.ts
// ANNO-02 — Reader can attach + edit a text note on a highlight (D5-10
// editor, debounced save mirroring D2-03).
//
// SCENARIO: create a highlight via N → the WRITING-ONLY editor opens with a
// focused empty textarea (issue #175 — the editor carries the textarea + Done
// only; Tags/Color/Delete live on the lightweight controls and their own
// surfaces). Type a note → "Note saved." announces after the debounce window
// (NOT per-keystroke). Activate the <mark> → the LIGHTWEIGHT CONTROLS appear
// (never the quotation) → "Edit note" reopens the editor with the existing
// note text + mark.highlight.has-note modifier. Edit → debounced save.
// Clear + Done → has-note modifier removed (empty = no note).
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
  openHighlightControls,
  highlightControls,
  openNoteEditorViaControls,
  noteTextarea,
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

  test("activating the <mark> exposes the controls; Edit note reopens the editor with the existing text", async ({
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
    // Activate the mark → the LIGHTWEIGHT CONTROLS appear (issue #175).
    const controls = await openHighlightControls(page);
    // The controls never repeat the passage quotation.
    await expect(noteTextarea(page)).toHaveValue("Persistent note.");
    // A noted highlight labels the action "Edit note".
    await expect(controls.getByRole("button", { name: "Edit note" })).toHaveCount(0);
    await openNoteEditorViaControls(page);
    const reopenedTextarea = noteTextarea(page);
    await expect(reopenedTextarea).toBeVisible();
    await expect(reopenedTextarea).toHaveValue("Persistent note.");
    // The has-note modifier is still present.
    await expect(page.locator("mark.highlight").first()).toHaveClass(/has-note/);
  });

  test("the note editor retains highlight controls without repeating the passage", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    await selectRangeInBlock(page, blockIdx, 0, 10);
    await page.keyboard.press("n");
    await noteTextarea(page).fill("Writing surface only.");
    // Explicit note entry shares the same controls and accessible boundary.
    // Issue #207 — the always-visible organization area (tag field + color
    // slots) rides beside the editor. Issue #222 — the slots ARE the color
    // vocabulary: ONE fieldset of five slot pills replaces the named-radios
    // fieldset + Apply-slot row, so two fieldsets total and no radios left
    // in the panel (the pills are action buttons, not a checked choice).
    const dlg = page.locator("#highlight-popover");
    await expect(dlg.locator("fieldset")).toHaveCount(2);
    await expect(dlg.getByRole("button", { name: /^Apply slot \d+: / })).toHaveCount(5);
    await expect(dlg.getByRole("radio")).toHaveCount(0);
    await expect(dlg.getByRole("button", { name: "Delete" })).toHaveCount(1);
    await expect(dlg.getByRole("button", { name: "Done" })).toBeVisible();
    await popoverDone(page);

    // Reopening from the controls reaches the same writing-only editor —
    // and the passage quotation is never reproduced VISUALLY (the excerpt
    // is the accessible description only, carried by the visually-hidden
    // clip pattern — Playwright counts a 1px clipped box as "visible", so
    // the contract is pinned by the class + the unit suite's DOM shape).
    await openNoteEditorViaControls(page);
    await expect(noteTextarea(page)).toHaveValue("Writing surface only.");
    const excerpt = dlg.locator(".highlight-popover-excerpt");
    await expect(excerpt).toBeAttached();
    await expect(excerpt).toHaveClass(/visually-hidden/);
    await popoverDone(page);
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
    // Reopen + clear (via the controls → Edit note).
    await openNoteEditorViaControls(page);
    const reopenedTextarea = noteTextarea(page);
    await expect(reopenedTextarea).toBeVisible();
    await reopenedTextarea.fill("");
    // Empty textarea = no note → has-note modifier removed (optimistic).
    await expect(page.locator("mark.highlight").first()).not.toHaveClass(/has-note/);
    await popoverDone(page);
  });

  test("the editor keeps a bounded footprint: consistent width, long notes scroll internally (AC6/AC9)", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    await selectRangeInBlock(page, blockIdx, 0, 10);
    await page.keyboard.press("n");
    const textarea = noteTextarea(page);
    await expect(textarea).toBeVisible();

    // A LONG note: the textarea must stay at (or under) its bounded height
    // (app.css: max-height min(40vh, 280px)) and scroll INTERNALLY instead
    // of growing the dialog; the dialog itself stays within its own bound
    // (app.css: max-height 100vh − 2×--space-lg) and its consistent width
    // (max-width 380px). Real layout metrics — Playwright owns layout truth.
    await textarea.fill("B".repeat(6000));
    const metrics = await page.evaluate(() => {
      const dlg = document.querySelector<HTMLElement>("dialog#highlight-popover");
      const ta = document.querySelector<HTMLTextAreaElement>("textarea.highlight-popover-textarea");
      if (!dlg || !ta) return null;
      return {
        dlgWidth: dlg.getBoundingClientRect().width,
        dlgHeight: dlg.getBoundingClientRect().height,
        viewportH: window.innerHeight,
        taClientH: ta.clientHeight,
        taScrollH: ta.scrollHeight,
      };
    });
    expect(metrics, "editor metrics readable").not.toBeNull();
    expect(metrics!.dlgWidth, "consistent editor width (380px cap)").toBeLessThanOrEqual(380);
    expect(
      metrics!.dlgHeight,
      "dialog height bounded inside the viewport (never grows past it)",
    ).toBeLessThanOrEqual(metrics!.viewportH - 16);
    expect(
      metrics!.taClientH,
      "textarea height bounded (max-height min(40vh, 280px))",
    ).toBeLessThanOrEqual(281);
    expect(metrics!.taScrollH, "long note content overflows the textarea box").toBeGreaterThan(
      metrics!.taClientH,
    );
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
    // Reopen via the controls → the editor's content must NOT contain a
    // parsed <script> or <b> element — the note text is rendered as text.
    await openNoteEditorViaControls(page);
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
    const hlId = await page.locator("mark.highlight").first().getAttribute("data-highlight-id");
    expect(hlId).toBeTruthy();
    await expect(page.locator(`#hl-${hlId}`)).toHaveCount(1);
    const extentsBefore = await markTextsForHighlight(page, hlId!);
    expect(extentsBefore.length, "marks render in BOTH blocks").toBeGreaterThanOrEqual(2);
    const notedMarks = page.locator(`mark.highlight.has-note[data-highlight-id="${hlId}"]`);
    expect(await notedMarks.count()).toBe(extentsBefore.length);

    // Reopen the editor ON THE FIRST SLICE (controls → Edit note) + edit.
    await page.locator(`#hl-${hlId}`).click();
    await expect(highlightControls(page)).toBeVisible();
    await openNoteEditorViaControls(page);
    const reopened = noteTextarea(page);
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
      const count = await page.locator(`mark.highlight[data-highlight-id="${hlId}"]`).count();
      if (count > 0) {
        await expect(
          page.locator(`mark.highlight[data-highlight-id="${hlId}"]`).first(),
        ).toBeVisible();
        await expect(page.locator(`#hl-${hlId}`)).toHaveCount(1);
        foundPaginated = true;
        break;
      }
    }
    expect(foundPaginated, "span marks still render in paginated mode after the note edit").toBe(
      true,
    );
  });
});
