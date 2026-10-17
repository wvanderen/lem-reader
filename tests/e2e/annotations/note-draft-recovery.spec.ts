// tests/e2e/annotations/note-draft-recovery.spec.ts
// Issue #178 — recovering a note interrupted by tab closure. jsdom cannot
// replicate the behaviors under test: real page death (reload) over the
// real Dexie stores, the modal controls handoff, and the live restored
// editor. Asserted across Chromium, Firefox, and WebKit.
//
// What each cell proves:
//   1. INTERRUPTED-SAVE REOPENING: an edit pending when the page dies
//      leaves NO note row but DOES leave its recovery draft; the next
//      editor open for the same highlight restores the draft, marks the
//      session "Recovered draft" (visible + announced), and Done lands the
//      recovered text and cleans the draft up. A later open shows no
//      marker (the recovery completed).
//   2. SUCCESSFUL-SAVE CLEANUP: a landed save leaves no draft row, and a
//      fresh open of the same note shows no recovered marker.
//   3. DELETION CLEANUP: a cancelled deletion keeps the highlight's note
//      AND draft; a FAILED deletion keeps them (the honest-failure
//      register); only the CONFIRMED deletion cascade-deletes all three.
//   4. ISOLATION: a draft pending on one highlight never surfaces in
//      another highlight's editor — and the original highlight's editor
//      still recovers it.
//
// A note on the interruption recipe: the cells simulate tab death with a
// page.reload() while the note save is sabotaged (the one-shot abort
// wrapper consumes the dual-event flush's attempt during unload), so the
// note row provably never lands and the outcome is deterministic. The
// deliberately-ABSENT cell — reloading with a pending edit and a WORKING
// save — is inherently racy (the pagehide flush usually lands, which is
// correct behavior: the note saved and no recovery is needed); the unit
// layer (note-draft-recovery.test.tsx + note-drafts-store.spec.ts) owns
// the write-through-before-any-unload proof.
import { test, expect } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  openNoteEditorViaControls,
  selectRangeInBlock,
  findFirstBlockWithText,
  installNoteSaveSabotage,
  failNextNoteSave,
  installHighlightDeleteSabotage,
  failNextHighlightDelete,
  noteRowCountFor,
  noteDraftRowCountFor,
  noteDraftTextFor,
  noteTextarea,
  countHighlightsInDexie,
} from "./_fixtures";

const FIXTURE = FIXTURES[0]!; // essay-long-form
const DRAFT = "Recovered from a closed tab.";

// Per-describe beforeEach (NOT file-level): the sabotage describes must
// install their init scripts BEFORE ANY navigation (the note-save
// reliability spec's ordering discipline — the wipe's first goto injects
// the wrappers).

/** Create a highlight (N shortcut) with the note editor open. */
async function createHighlightAndOpenEditor(
  page: import("@playwright/test").Page,
): Promise<string> {
  await openArticle(page, FIXTURE);
  const blockIdx = await findFirstBlockWithText(page, 24);
  expect(blockIdx).not.toBe(-1);
  await selectRangeInBlock(page, blockIdx, 0, 18);
  await page.keyboard.press("n");
  const mark = page.locator("mark.highlight").first();
  await expect(mark).toBeVisible();
  await expect(page.locator("dialog#highlight-popover")).toBeVisible();
  return (await mark.getAttribute("data-highlight-id"))!;
}

/**
 * The interruption recipe: type the draft, let the write-through draft put
 * commit (300ms — well inside the 800ms debounce, so the note save itself
 * never fires), arm the one-shot sabotage for the pagehide flush's put,
 * then reload — the page dies with the edit pending and the note row
 * provably absent.
 */
async function interruptPendingEdit(page: import("@playwright/test").Page): Promise<void> {
  await noteTextarea(page).fill(DRAFT);
  await page.waitForTimeout(300);
  await failNextNoteSave(page);
  await page.reload();
}

test.describe("note draft recovery — interrupted save reopening (issue #178)", () => {
  test.beforeEach(async ({ page }) => {
    await installNoteSaveSabotage(page);
    await wipeDatabase(page);
  });

  test("an edit pending at page death reopens as a Recovered draft; Done lands it and cleans up", async ({
    page,
  }) => {
    const hlId = await createHighlightAndOpenEditor(page);
    await interruptPendingEdit(page);
    await openArticle(page, FIXTURE);

    // Persistence truth: the note never landed; the draft survived the
    // page death and holds the reader's exact writing.
    expect(await noteRowCountFor(page, hlId)).toBe(0);
    expect(await noteDraftRowCountFor(page, hlId)).toBe(1);
    expect(await noteDraftTextFor(page, hlId)).toBe(DRAFT);

    // The same note next opens: the draft is restored and clearly marked.
    const controls = page.locator("dialog.annotation-panel[open]");
    await page.locator("mark.highlight").first().click();
    await expect(controls).toBeVisible();
    await openNoteEditorViaControls(page);
    const dlg = page.locator("dialog#highlight-popover");
    await expect(dlg).toBeVisible();
    await expect(noteTextarea(page)).toHaveValue(DRAFT);
    await expect(dlg.locator(".highlight-popover-recovered")).toBeVisible();

    // Done lands the recovered text through the normal pending-edit path
    // and retires the draft.
    await dlg.locator(".highlight-popover-done").click();
    await expect(dlg).not.toBeVisible();
    await expect
      .poll(async () => noteRowCountFor(page, hlId), { message: "the recovered text landed" })
      .toBe(1);
    await expect
      .poll(async () => noteDraftRowCountFor(page, hlId), {
        message: "the draft was cleaned up after the save",
      })
      .toBe(0);

    // The recovery is complete: a later open shows no recovered marker.
    await page.locator("mark.highlight").first().click();
    await openNoteEditorViaControls(page);
    await expect(dlg).toBeVisible();
    await expect(noteTextarea(page)).toHaveValue(DRAFT);
    await expect(dlg.locator(".highlight-popover-recovered")).toHaveCount(0);
  });
});

test.describe("note draft recovery — successful-save cleanup (issue #178)", () => {
  test.beforeEach(async ({ page }) => {
    await wipeDatabase(page);
  });

  test("a landed save leaves no draft row and no recovered marker on reopen", async ({ page }) => {
    const hlId = await createHighlightAndOpenEditor(page);
    await noteTextarea(page).fill("A draft that saved cleanly.");
    await page.locator("#highlight-popover .highlight-popover-done").click();
    await expect(page.locator("dialog#highlight-popover")).not.toBeVisible();
    expect(await noteRowCountFor(page, hlId)).toBe(1);
    expect(await noteDraftRowCountFor(page, hlId)).toBe(0);

    // Reopen through the controls: the persisted text, no recovered marker.
    await page.locator("mark.highlight").first().click();
    await openNoteEditorViaControls(page);
    const dlg = page.locator("dialog#highlight-popover");
    await expect(dlg).toBeVisible();
    await expect(noteTextarea(page)).toHaveValue("A draft that saved cleanly.");
    await expect(dlg.locator(".highlight-popover-recovered")).toHaveCount(0);
  });
});

test.describe("note draft recovery — deletion cleanup (issue #178)", () => {
  test.beforeEach(async ({ page }) => {
    // The failed-deletion cell needs both saboteurs armed independently.
    await installNoteSaveSabotage(page);
    await installHighlightDeleteSabotage(page);
    await wipeDatabase(page);
  });

  test("cancelled and failed deletions keep the draft; the confirmed deletion clears note + draft", async ({
    page,
  }) => {
    const hlId = await createHighlightAndOpenEditor(page);
    // A landed note first, then a pending edit that dies with the page.
    await noteTextarea(page).fill("The landed note.");
    await page.locator("#highlight-popover .highlight-popover-done").click();
    await expect(page.locator("dialog#highlight-popover")).not.toBeVisible();
    expect(await noteRowCountFor(page, hlId)).toBe(1);

    // Reopen, type the never-saved continuation, and interrupt it.
    await page.locator("mark.highlight").first().click();
    await openNoteEditorViaControls(page);
    await expect(page.locator("dialog#highlight-popover")).toBeVisible();
    const pendingTail = " — and this part never landed.";
    await noteTextarea(page).fill("The landed note." + pendingTail);
    await failNextNoteSave(page);
    await expect(
      page.locator("dialog#highlight-popover").getByText("Couldn't save the note. Try again."),
    ).toBeVisible({ timeout: 5000 });
    await failNextNoteSave(page); // for the unload flush's attempt
    await page.reload();
    await openArticle(page, FIXTURE);

    // The draft survives; the note keeps its landed text.
    expect(await noteDraftRowCountFor(page, hlId)).toBe(1);
    expect(await noteDraftTextFor(page, hlId)).toBe("The landed note." + pendingTail);
    expect(await noteRowCountFor(page, hlId)).toBe(1);

    const controls = page.locator("dialog.annotation-panel[open]");
    const dlg = page.locator("dialog#highlight-popover");

    // CANCELLED deletion: the confirm view's Keep writes nothing — the
    // note AND its recovery draft stay.
    await page.locator("mark.highlight").first().click();
    await controls.getByRole("button", { name: "Delete" }).click();
    await expect(dlg).toBeVisible();
    await dlg.getByRole("button", { name: "Keep" }).click();
    await expect(dlg.locator(".highlight-popover-confirm")).not.toBeVisible();
    expect(await noteRowCountFor(page, hlId)).toBe(1);
    await expect(noteTextarea(page)).toHaveValue("The landed note." + pendingTail);
    expect(await countHighlightsInDexie(page, FIXTURE)).toBe(1);

    // FAILED deletion: the honest-failure register keeps the confirm view
    // open; nothing is written — the draft survives.
    await controls.getByRole("button", { name: "Delete" }).click();
    await expect(dlg).toBeVisible();
    await failNextHighlightDelete(page);
    await dlg.getByRole("button", { name: "Delete" }).click();
    await expect(dlg.getByText("Couldn't delete this highlight. Try again.")).toBeVisible();
    expect(await noteRowCountFor(page, hlId)).toBe(1);

    // CONFIRMED deletion: the cascade removes the highlight, its note, AND
    // the recovery draft in the one transaction.
    await dlg.getByRole("button", { name: "Delete" }).click();
    await expect(dlg).not.toBeVisible();
    await expect
      .poll(async () => countHighlightsInDexie(page, "essay-long-form"), {
        message: "the highlight is gone",
      })
      .toBe(0);
    expect(await noteRowCountFor(page, hlId)).toBe(0);
    expect(await noteDraftRowCountFor(page, hlId)).toBe(0);
  });
});

test.describe("note draft recovery — isolation between highlights (issue #178)", () => {
  test.beforeEach(async ({ page }) => {
    await installNoteSaveSabotage(page);
    await wipeDatabase(page);
  });

  test("a draft pending on one highlight never surfaces in another highlight's editor", async ({
    page,
  }) => {
    const hlA = await createHighlightAndOpenEditor(page);
    await interruptPendingEdit(page);
    await openArticle(page, FIXTURE);
    expect(await noteDraftRowCountFor(page, hlA)).toBe(1);

    // A SECOND highlight (disjoint range in the same long paragraph) opens
    // its own fresh editor: no recovered text, no marker — the draft on A
    // must not attach to B.
    await selectRangeInBlock(page, 0, 20, 38);
    await page.keyboard.press("n");
    const marks = page.locator("mark.highlight");
    await expect(marks).toHaveCount(2);
    const hlB = (await marks.nth(1).getAttribute("data-highlight-id"))!;
    expect(hlB).not.toBe(hlA);
    const dlg = page.locator("dialog#highlight-popover");
    await expect(dlg).toBeVisible();
    await expect(noteTextarea(page)).toHaveValue("");
    await expect(dlg.locator(".highlight-popover-recovered")).toHaveCount(0);
    expect(await noteDraftRowCountFor(page, hlB)).toBe(0);

    // Escape (nothing pending on B) closes the editor without a write.
    await page.keyboard.press("Escape");
    await expect(dlg).not.toBeVisible();
    expect(await noteRowCountFor(page, hlB)).toBe(0);

    // The ORIGINAL highlight still recovers its own draft.
    await page.locator(`mark.highlight[data-highlight-id="${hlA}"]`).click();
    await openNoteEditorViaControls(page);
    await expect(dlg).toBeVisible();
    await expect(noteTextarea(page)).toHaveValue(DRAFT);
    await expect(dlg.locator(".highlight-popover-recovered")).toBeVisible();
    await dlg.locator(".highlight-popover-done").click();
    await expect(dlg).not.toBeVisible();
    await expect
      .poll(async () => noteRowCountFor(page, hlA), { message: "A's recovered text landed" })
      .toBe(1);
    await expect
      .poll(async () => noteDraftRowCountFor(page, hlA), { message: "A's draft cleaned up" })
      .toBe(0);
    // B was never touched by A's recovery.
    expect(await noteRowCountFor(page, hlB)).toBe(0);
    expect(await noteDraftRowCountFor(page, hlB)).toBe(0);
  });
});
