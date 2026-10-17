// tests/e2e/annotations/delete-confirm.spec.ts
// ANNO-03 / D5-12 — Delete is a two-step confirm with non-destructive
// default focus (mirrors WipeConfirm Pitfall 8). The destructive action
// removes the highlight + its note together (cascade-delete).
//
// Issue #175 reshape: the Delete ENTRY lives on the lightweight highlight
// controls (mark activation), not inside the note editor. The confirm step
// still runs inside the SAME dialog footprint (the editor's confirm view):
// controls → Delete → "Delete this highlight?" replaces the editor body +
// focus moves to Keep ([data-initial-focus]). Keep closes back to the
// controls (nothing deleted); Delete removes the highlight + note together.
// The no-note delete stays IMMEDIATE at the controls (issue #174).
import { test, expect } from "@playwright/test";
import {
  BASE,
  FIXTURES,
  wipeDatabase,
  openArticle,
  selectRangeInBlock,
  findFirstBlockWithText,
  announcementRegion,
  switchMode,
  selectRangeBetweenBlocks,
  countHighlightsInDexie,
  installHighlightDeleteSabotage,
  failNextHighlightDelete,
  openHighlightControls,
  highlightControls,
  noteTextarea,
} from "./_fixtures";

const FIXTURE = FIXTURES[0]!; // essay-long-form

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

test.describe("ANNO-03 delete confirm (05-05)", () => {
  test("controls Delete starts a two-step confirm with non-destructive default focus (Keep)", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    await selectRangeInBlock(page, blockIdx, 0, 18);
    await page.keyboard.press("n");
    await noteTextarea(page).fill("Note to delete.");
    await page.locator("#highlight-popover .highlight-popover-done").click();
    // Reopen: mark click → the lightweight controls → Delete.
    await openHighlightControls(page);
    await highlightControls(page).getByRole("button", { name: "Delete" }).click();
    // The confirm prompt opens inside the editor dialog (same footprint).
    const dlg = page.locator("#highlight-popover");
    await expect(dlg.locator(".highlight-popover-confirm")).toBeVisible();
    await expect(dlg.locator(".highlight-popover-confirm-prompt")).toContainText(
      /Delete this highlight\?/i,
    );
    // Non-destructive default focus → the Keep button ([data-initial-focus]).
    const keepBtn = dlg.locator("[data-initial-focus]");
    await expect(keepBtn).toBeVisible();
    await expect(keepBtn).toContainText(/Keep/i);
    const isFocused = await keepBtn.evaluate((el) => el === document.activeElement);
    expect(isFocused, "Keep button has non-destructive default focus").toBeTruthy();
  });

  test("Keep cancels the delete — closes back to the controls, nothing deleted", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    await selectRangeInBlock(page, blockIdx, 0, 18);
    await page.keyboard.press("n");
    await noteTextarea(page).fill("Note to keep.");
    await page.locator("#highlight-popover .highlight-popover-done").click();
    await expect(page.locator("mark.highlight").first()).toBeVisible();
    const baseline = await page.locator("mark.highlight").count();

    // Reopen + start delete.
    await openHighlightControls(page);
    await highlightControls(page).getByRole("button", { name: "Delete" }).click();
    const dlg = page.locator("#highlight-popover");
    await expect(dlg.locator(".highlight-popover-confirm")).toBeVisible();
    // Keep → the dialog closes, back to the controls (the acceptance
    // criteria: "Keep returns to controls"; the trigger restore lands on
    // the anchor <mark>).
    await dlg.locator("[data-initial-focus]").click();
    await expect(dlg.locator(".highlight-popover-confirm")).toHaveCount(0);
    await expect(dlg).toBeVisible();
    await expect(highlightControls(page)).toBeVisible();
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
    await noteTextarea(page).fill("Note to delete.");
    await page.locator("#highlight-popover .highlight-popover-done").click();
    // Capture the highlight id so we can verify both the mark + the Dexie
    // row are gone after delete.
    const hlId = await page.locator("mark.highlight").first().getAttribute("data-highlight-id");
    expect(hlId, "highlight has data-highlight-id").toBeTruthy();
    // Reopen + start delete + confirm.
    await openHighlightControls(page);
    await highlightControls(page).getByRole("button", { name: "Delete" }).click();
    const dlg = page.locator("#highlight-popover");
    await expect(dlg.locator(".highlight-popover-confirm")).toBeVisible();
    await dlg.locator(".highlight-popover-destructive").click();
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

  test("Phase 19 span: deleting a multi-block span from the review confirm removes EVERY mark atomically in BOTH modes + the note (ANNO-11)", async ({
    page,
  }) => {
    // Strengthen-only Phase 19 cell: the SPAN variant of the atomic
    // delete — one cross-block highlight WITH a note, deleted through the
    // Highlights review's DeleteHighlightConfirm (the single-call-site
    // discipline). Atomicity = zero leftover fragments in EITHER mode +
    // the note row gone + the highlight row gone, all after ONE Proceed.
    await openArticle(page, FIXTURE);
    await switchMode(page); // scrolling — capture across blocks 0 → 1
    const ok = await selectRangeBetweenBlocks(
      page,
      { blockIndex: 0, offset: 5 },
      { blockIndex: 1, offset: 14 },
    );
    expect(ok, "cross-block span selection placed").toBeTruthy();
    // N creates the span highlight + opens the note editor.
    await page.keyboard.press("n");
    await noteTextarea(page).fill("Span note to delete with the highlight.");
    await page.locator("#highlight-popover .highlight-popover-done").click();
    const mark = page.locator("mark.highlight").first();
    await expect(mark).toBeVisible();
    const hlId = await mark.getAttribute("data-highlight-id");
    expect(hlId).toBeTruthy();
    // The span renders marks in BOTH blocks before the delete.
    const before = await page.locator(`mark.highlight[data-highlight-id="${hlId}"]`);
    expect(await before.count()).toBeGreaterThanOrEqual(2);

    // The review surface: one row → Remove highlight → the confirm dialog.
    await page.goto(`${BASE}/#/highlights`);
    await expect(page.getByRole("heading", { level: 1, name: "Highlights" })).toBeVisible();
    await page
      .getByRole("button", { name: /^Remove highlight:/ })
      .first()
      .click();
    const dialog = page.locator("dialog.review-remove-confirm");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Remove highlight", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator("main .status").first()).toContainText(/Highlight removed/i);

    // Back in the article: ZERO marks for the id in scrolling mode (the
    // whole body mounts — nothing survives anywhere in the document)…
    await openArticle(page, FIXTURE);
    await expect(page.getByRole("button", { name: /^Reading mode:/ })).toHaveAttribute(
      "aria-label",
      "Reading mode: scrolling",
    );
    await expect(
      page.locator(`mark.highlight[data-highlight-id="${hlId}"]`),
      "no leftover span fragment in scrolling mode",
    ).toHaveCount(0);
    await expect(page.locator(`#hl-${hlId}`)).toHaveCount(0);
    // …and in paginated mode (the mounted fragment carries nothing).
    await switchMode(page);
    await page.waitForTimeout(500);
    await expect(
      page.locator(`mark.highlight[data-highlight-id="${hlId}"]`),
      "no leftover span fragment in paginated mode",
    ).toHaveCount(0);

    // Atomic cascade truth: the highlight row AND the note row are gone.
    expect(await countHighlightsInDexie(page, FIXTURE)).toBe(0);
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
    expect(noteCount, "note cascade-deleted with the span (atomic)").toBe(0);
  });
});

// ── Issue #174 — deletion proportional to the written content removed ────────

test.describe("Issue #174 — no-note highlights delete immediately (reading mode)", () => {
  test.beforeEach(async ({ page }) => {
    await wipeDatabase(page);
  });

  test("a no-note highlight deletes immediately via the keyboard — focus stays near the passage", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    await selectRangeInBlock(page, blockIdx, 0, 18);
    // N creates the highlight and opens the editor; the reader types NO note
    // and closes with Done — the highlight stays note-less.
    await page.keyboard.press("n");
    await page.locator("#highlight-popover .highlight-popover-done").click();
    const mark = page.locator("mark.highlight").first();
    await expect(mark).toBeVisible();
    const hlId = await mark.getAttribute("data-highlight-id");
    expect(hlId).toBeTruthy();

    // The passage block hosting the mark — the expected post-delete focus
    // target (the mark itself unmounts; its block survives).
    const markBlockIndex = await mark.evaluate(
      (el) => el.closest("[data-block-index]")?.getAttribute("data-block-index") ?? null,
    );
    expect(markBlockIndex).not.toBeNull();

    // KEYBOARD path: focus the mark, Enter exposes the CONTROLS (issue #175
    // — keyboard activation moves focus into them), Tab to Delete, Enter
    // deletes — no confirm step is reachable without a note.
    await mark.focus();
    await page.keyboard.press("Enter");
    const controls = highlightControls(page);
    await expect(controls).toBeVisible();
    const deleteBtn = controls.getByRole("button", { name: "Delete" });
    await deleteBtn.focus();
    await page.keyboard.press("Enter");

    // No confirm prompt ever mounted; the mark + its Dexie row are gone.
    await expect(page.locator("#highlight-popover .highlight-popover-confirm")).toHaveCount(0);
    await expect(page.locator(`mark.highlight[data-highlight-id="${hlId}"]`)).toHaveCount(0);
    await expect(announcementRegion(page)).toContainText(/Highlight deleted/i);

    // Focus restored NEAR the passage: the deleted mark's own block — never
    // dropped to <body> (the article top).
    const focus = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return {
        isBody: el === document.body,
        blockIndex: el?.getAttribute?.("data-block-index") ?? null,
      };
    });
    expect(focus.isBody, "focus must not drop to the article top").toBe(false);
    expect(focus.blockIndex, "focus lands on the passage block").toBe(markBlockIndex);
  });

  test("a whitespace-only note counts as no note — immediate delete, no confirm", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    await selectRangeInBlock(page, blockIdx, 0, 18);
    await page.keyboard.press("n");
    // Whitespace-only commentary: stored (the D5-10 length>0 policy is
    // unchanged) but it gates nothing — there is no written content to lose.
    await noteTextarea(page).fill("   ");
    await page.locator("#highlight-popover .highlight-popover-done").click();
    await expect(page.locator("mark.highlight").first()).toBeVisible();

    await openHighlightControls(page);
    await highlightControls(page).getByRole("button", { name: "Delete" }).click();

    await expect(page.locator("#highlight-popover .highlight-popover-confirm")).toHaveCount(0);
    await expect(page.locator("mark.highlight")).toHaveCount(0);
    await expect(announcementRegion(page)).toContainText(/Highlight deleted/i);
  });

  test("a nonempty note still routes through the confirm (Keep default, cascade-honest copy)", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    await selectRangeInBlock(page, blockIdx, 0, 18);
    await page.keyboard.press("n");
    await noteTextarea(page).fill("Worth a confirmation.");
    await page.locator("#highlight-popover .highlight-popover-done").click();
    await expect(page.locator("mark.highlight").first()).toBeVisible();

    await openHighlightControls(page);
    await highlightControls(page).getByRole("button", { name: "Delete" }).click();
    // The confirm step appears with the cascade-honest line + Keep focus.
    const confirm = page.locator("#highlight-popover .highlight-popover-confirm");
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText("The note attached to it will also be removed.");
    await expect(page.locator("#highlight-popover [data-initial-focus]")).toBeFocused();
    // Keep → nothing deleted; back to the controls.
    await page.locator("#highlight-popover [data-initial-focus]").click();
    await expect(page.locator("#highlight-popover .highlight-popover-confirm")).toHaveCount(0);
    await expect(page.locator("mark.highlight").first()).toBeVisible();
    await expect(highlightControls(page)).toBeVisible();
  });

  test("a FAILED no-note delete keeps the CONTROLS open with the failure line — the highlight stays (AC6 failure case)", async ({
    page,
  }) => {
    // The honest-failure path end-to-end: the sabotage rejects the final
    // IDB delete; the real Dexie/Dexie-transaction/useAnnotationState stack
    // above it must roll back and surface the failure — never dismiss the
    // controls as if the delete landed. Issue #175: the immediate no-note
    // delete runs FROM the controls, so the honest line renders THERE.
    await installHighlightDeleteSabotage(page);
    // The wipe left the page at ${BASE}/ — the article goto below is then a
    // SAME-DOCUMENT (hash-only) navigation, which injects no init scripts.
    // Force one real document load so the sabotage wrapper exists.
    await page.reload();
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    await selectRangeInBlock(page, blockIdx, 0, 18);
    await page.keyboard.press("n");
    await page.locator("#highlight-popover .highlight-popover-done").click();
    await expect(page.locator("mark.highlight").first()).toBeVisible();

    await openHighlightControls(page);
    await failNextHighlightDelete(page);
    await highlightControls(page).getByRole("button", { name: "Delete" }).click();

    // Honest failure: the controls STAY OPEN with the calm inline line; the
    // mark (and its Dexie row) survive for a retry.
    await expect(page.locator("#highlight-popover .highlight-popover-confirm")).toHaveCount(0);
    await expect(highlightControls(page)).toContainText(
      "Couldn't delete this highlight. Try again.",
    );
    await expect(page.locator("mark.highlight")).toHaveCount(1);
    // Never a success announcement.
    await expect(announcementRegion(page)).not.toContainText(/Highlight deleted/i);
  });
});
