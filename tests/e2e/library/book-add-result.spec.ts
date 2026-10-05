// tests/e2e/library/book-add-result.spec.ts
// Issue #113 — the BOOK saved-result screen's 3-engine browser truth. The
// component suite (AddDialog.test.tsx) owns the jsdom-level state machine;
// jsdom has no dialog top layer, no focus ordering, no real hashchange
// routing (the focused-add.spec.ts Pitfall-5 discipline). Everything here
// runs on the REAL chromium/firefox/webkit matrix against the integrated
// AddDialog + app shell.
//
// Cases (the issue's acceptance criteria):
//   1. SUCCESS + SKIP DISCLOSURE: an EPUB save keeps the dialog OPEN on a
//      clear result — "Saved to your library." announces, the card shows
//      the book title + the honest skipped-chapter count (D12-11), and
//      Close / Add another / Open book are the explicit actions. No
//      auto-navigation ever happens.
//   2. CLOSE → UNREAD: Close (and Esc) returns to the prior destination —
//      no navigation — and the never-opened book appears in the Unread
//      view (no chapter location exists; the snapshot invalidation fired
//      while the dialog was open).
//   3. ADD ANOTHER: resets source, content, file pick, and tags to a
//      fresh session (D16-08 shape) with the dialog still up, and the
//      library already reflects the saved book WITHOUT waiting for
//      navigation (the next save is independent).
//   4. REFUSAL: a duplicate refusal stays distinct from the saved result
//      (calm copy, no result card, no outcome actions) and never
//      overwrites — the library keeps exactly one book.
//   5. OPEN BOOK: navigates close-first to the FIRST AVAILABLE chapter's
//      #/article/<id> route (a chapter IS an article); the reader follows
//      the existing reading-location rule (a never-opened chapter starts
//      at the top — no restoration marker).
//   6. FOCUS: the save landing focuses the result heading (keyboard + SR
//      land on the title); Tab reaches the actions; Esc restores the
//      Add to Library trigger.
//
// Harness discipline (add-result.spec.ts clone):
//   - openAddDialog/pickSource/openSavedBook/addAnother/closeSavedResult
//     from ./add-dialog — the shared idempotent helpers centralizing every
//     accessible name.
//   - wipeDatabase beforeEach (deterministic first-run state).
//   - page.route mocks **/api/ingest* with a schema-valid BOOK envelope
//     (the client re-validates the envelope + every article at the network
//     boundary) — no coupling to the live epub parser. The picked File's
//     bytes are irrelevant (the mock intercepts before the server), so a
//     minimal buffer stands in for the zip (setInputFiles is the sanctioned
//     file-input drive — an OS file picker is not keyboard-scriptable).
import { test, expect, type Page } from "@playwright/test";
import { BASE, wipeDatabase } from "../annotations/_fixtures";
import {
  openAddDialog,
  pickSource,
  openSavedBook,
  addAnother,
  closeSavedResult,
} from "./add-dialog";
import { bookEnvelope, mockEpubIngest } from "./book-envelope";

/** The header-row trigger (the single way into the dialog). */
function addButton(page: Page) {
  return page.getByRole("button", { name: "Add to Library" });
}

/** Open the library surface (the saved-articles list on #/). */
async function openLibrary(page: Page): Promise<void> {
  await page.goto(`${BASE}/#/`);
  await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible();
}

/** Pick a minimal .epub into the file picker and submit (the mock
 * intercepts before any read reaches a server, so the bytes are inert). */
async function uploadEpub(page: Page, name: string): Promise<void> {
  await openAddDialog(page);
  await pickSource(page, "file");
  await page.locator("input#ingest-file").setInputFiles({
    name,
    mimeType: "application/epub+zip",
    buffer: Buffer.from("PK-mock-bytes"),
  });
  await page.getByRole("button", { name: /add file/i }).click();
}

/** Drive an EPUB add to the result screen (the shared happy path) and wait
 * for the durable result signals (status + card). */
async function addEpubToResult(
  page: Page,
  bookId: string,
  title: string,
  skippedCount = 0,
): Promise<void> {
  await mockEpubIngest(page, { current: bookEnvelope(bookId, title, skippedCount) });
  await openLibrary(page);
  await uploadEpub(page, `${bookId}.epub`);
  const dialog = page.locator("dialog.add-dialog");
  await expect(dialog.locator(".status")).toContainText("Saved to your library.");
  await expect(dialog.locator(".add-result")).toBeVisible();
  await expect(dialog.getByRole("heading", { name: title, level: 3 })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

test.describe("Book add result preserves Unread (issue #113)", () => {
  test("a skipped save stays open with the honest count; Close returns to the library with the book Unread", async ({
    page,
  }) => {
    await addEpubToResult(page, "epub-mockskip01", "The Mock Skip Book", 2);

    const dialog = page.locator("dialog.add-dialog");
    // The honest skipped-chapter count (D12-11, the BookRow sentences).
    await expect(dialog.locator(".add-result .add-result-skips")).toHaveText(
      "2 chapters could not be read.",
    );
    // The outcome actions are explicit; NO navigation ever happened.
    await expect(dialog.getByRole("button", { name: "Open book" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Add another" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
    expect(page.url(), "no auto-navigation on save").not.toContain("#/article");
    // A book result carries no per-article limits and no provenance link.
    await expect(dialog.locator(".add-result .extraction-note")).toHaveCount(0);
    await expect(dialog.locator(".add-result .partial-content-note")).toHaveCount(0);
    await expect(dialog.locator(".add-result .add-result-source")).toHaveCount(0);

    // Close: back on the library destination, dialog gone.
    await closeSavedResult(page);
    expect(page.url()).not.toContain("#/article");
    await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible();

    // THE Unread transition: the never-opened book is in the Unread view
    // (no chapter location exists; the snapshot invalidated while the
    // dialog was open — the reload-free row appearance is asserted in the
    // add-another case below).
    await page.goto(`${BASE}/#/unread`);
    await expect(page.getByRole("link", { name: /^Unread \(\d+\)$/ })).toBeVisible();
    await expect(
      page.locator("li.book-row").filter({ hasText: "The Mock Skip Book" }),
    ).toBeVisible();
  });

  test("a clean save is silent about skips", async ({ page }) => {
    await addEpubToResult(page, "epub-mockclean01", "The Mock Clean Book", 0);

    // Silence is the all-chapters-admitted state — no disclosure line.
    await expect(page.locator("dialog.add-dialog .add-result .add-result-skips")).toHaveCount(0);
    await closeSavedResult(page);
  });

  test("Add another resets to a fresh session; the library reflects the saved books without navigation", async ({
    page,
  }) => {
    const payload = {
      current: bookEnvelope("epub-mockfirst01", "The First Book", 0),
    };
    await mockEpubIngest(page, payload);
    await openLibrary(page);
    await uploadEpub(page, "first.epub");

    const dialog = page.locator("dialog.add-dialog");
    await expect(dialog.locator(".add-result")).toBeVisible();
    // THE no-wait library reflection: the saved book row is ALREADY in the
    // library behind the dialog (Playwright visibility = not hidden with a
    // bounding box; the modal does not hide background content) — no
    // navigation, no reload.
    await expect(page.locator("li.book-row").filter({ hasText: "The First Book" })).toBeVisible();

    await addAnother(page);

    // Fresh session (D16-08 shape, dialog still up): Web address checked,
    // the result gone, the file pick cleared, the status region reset.
    await expect(dialog.locator(".status")).toHaveText("");
    await expect(page.getByRole("radio", { name: "Web address" })).toBeChecked();
    await expect(page.locator("input#ingest-file")).toHaveValue("");
    await expect(dialog.locator(".add-dialog-submit")).toBeDisabled();
    // The reset focus rail: the reader's next decision is the URL field.
    await expect(page.locator("input#ingest-url")).toBeFocused();

    // The NEXT save is independent: swap the envelope, add a second book
    // through the SAME dialog session, and the result shows the SECOND
    // title.
    payload.current = bookEnvelope("epub-mocksecond", "The Second Book", 1);
    await openAddDialog(page);
    await pickSource(page, "file");
    await page.locator("input#ingest-file").setInputFiles({
      name: "second.epub",
      mimeType: "application/epub+zip",
      buffer: Buffer.from("PK-mock-bytes-2"),
    });
    await page.getByRole("button", { name: /add file/i }).click();
    await expect(dialog.locator(".status")).toContainText("Saved to your library.");
    await expect(dialog.getByRole("heading", { name: "The Second Book", level: 3 })).toBeVisible();
    await expect(dialog.locator(".add-result .add-result-skips")).toHaveText(
      "1 chapter could not be read.",
    );
    await closeSavedResult(page);
    await expect(page.locator("li.book-row").filter({ hasText: "The Second Book" })).toBeVisible();
    await expect(page.locator("li.book-row")).toHaveCount(2);
  });

  test("a duplicate refusal stays distinct from the saved result and never overwrites", async ({
    page,
  }) => {
    await addEpubToResult(page, "epub-mockdup001", "The Dup Book", 0);

    // Add another → submit the SAME input: the service's hasBook() now
    // finds the saved book → dedupe-refuse (D7-07/D16-09).
    await addAnother(page);
    await pickSource(page, "file");
    await page.locator("input#ingest-file").setInputFiles({
      name: "dup.epub",
      mimeType: "application/epub+zip",
      buffer: Buffer.from("PK-mock-bytes"),
    });
    await page.getByRole("button", { name: /add file/i }).click();

    const dialog = page.locator("dialog.add-dialog");
    // Distinct surfaces: the calm refusal copy, NOT a saved result.
    await expect(dialog.locator(".status")).toContainText("Already in your library.");
    await expect(dialog.locator(".add-result")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Open book" })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Add another" })).toHaveCount(0);
    // Retry stays available (D16-11 — the pick cleared for a re-pick).
    await expect(dialog.locator("button.add-dialog-submit")).toBeDisabled();

    // Never overwritten: Esc closes; the library holds EXACTLY ONE book.
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(page.locator("li.book-row")).toHaveCount(1);
  });

  test("Open book navigates close-first to the first available chapter and starts at the top (the reading-location rule)", async ({
    page,
  }) => {
    await addEpubToResult(page, "epub-mockopen01", "The Open Book", 0);

    // The first DECLARED live chapter opens (a chapter IS an article).
    await openSavedBook(page, /#\/article\/epub-mockopen01-c00$/);
    await expect(page.getByRole("heading", { level: 1, name: "Chapter 1. Mock" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("dialog.add-dialog")).not.toBeVisible();
    // The reading-location rule for a never-opened chapter: the reader
    // starts at the beginning — no restoration marker, no resume banner.
    await expect(page.locator(".restoration-marker")).toHaveCount(0);
  });

  test("keyboard activation: Enter on Add another resets; Enter on Open book navigates", async ({
    page,
  }) => {
    const payload = {
      current: bookEnvelope("epub-mockkeys01", "The Keys Book", 0),
    };
    await mockEpubIngest(page, payload);
    await openLibrary(page);
    await uploadEpub(page, "keys.epub");

    const dialog = page.locator("dialog.add-dialog");
    await expect(dialog.locator(".add-result")).toBeVisible();

    // KEYBOARD Add another: native button activation from a real Enter —
    // the fresh-session reset (D16-08 shape) with the dialog kept up.
    await dialog.getByRole("button", { name: "Add another" }).focus();
    await page.keyboard.press("Enter");
    await expect(dialog.locator(".add-result")).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "Web address" })).toBeChecked();
    await expect(page.locator("input#ingest-url")).toBeFocused();

    // KEYBOARD Open book: re-drive a save, land on the result, then a real
    // Enter on the focused primary navigates close-first to the first
    // available chapter.
    payload.current = bookEnvelope("epub-mockkeys02", "The Keys Book II", 1);
    await openAddDialog(page);
    await pickSource(page, "file");
    await page.locator("input#ingest-file").setInputFiles({
      name: "keys-2.epub",
      mimeType: "application/epub+zip",
      buffer: Buffer.from("PK-mock-bytes-2"),
    });
    await page.getByRole("button", { name: /add file/i }).click();
    await expect(dialog.locator(".add-result")).toBeVisible();
    await expect(dialog.locator(".add-result .add-result-skips")).toHaveText(
      "1 chapter could not be read.",
    );
    await dialog.getByRole("button", { name: "Open book" }).focus();
    await page.keyboard.press("Enter");
    await page.waitForURL(/#\/article\/epub-mockkeys02-c00$/, {
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { level: 1, name: "Chapter 1. Mock" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("dialog.add-dialog")).not.toBeVisible();
  });

  test("focus: the save landing focuses the result heading; Esc restores the trigger", async ({
    page,
  }) => {
    await mockEpubIngest(page, {
      current: bookEnvelope("epub-mockfocus1", "The Focus Book", 1),
    });
    await openLibrary(page);

    // Keyboard-open from the trigger (the panel-keyboard discipline) so
    // the close path's restore target is known.
    const trigger = addButton(page);
    await trigger.focus();
    await trigger.press("Enter");
    await expect(page.locator("dialog.add-dialog")).toBeVisible();

    await pickSource(page, "file");
    await page.locator("input#ingest-file").setInputFiles({
      name: "focus.epub",
      mimeType: "application/epub+zip",
      buffer: Buffer.from("PK-mock-bytes"),
    });
    // Keyboard submit: the shared submit is focusable; Enter activates it.
    await page.locator("dialog.add-dialog .add-dialog-submit").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("dialog.add-dialog .add-result")).toBeVisible();

    // THE landing: focus sits on the saved title (the keyboard + SR entry
    // point into the result).
    const focusedClass = await page.evaluate(() => document.activeElement?.className ?? "");
    expect(focusedClass).toBe("add-result-title");

    // Tab moves past the card (a book carries no original link) into the
    // action row's leading quiet control. Engine-honest (the focused-add
    // wrap precedent — engine-specific subsets, never weakened
    // universals): WebKit's sequential focus navigation from a
    // tabindex="-1" heading parks on <body> (the Safari quirk — the #112
    // finding), so the intermediate Tab walk is asserted on chromium +
    // firefox only. The dialog trap itself is universal and owned by
    // focused-add.spec.ts (from a radio origin).
    if (test.info().project.name !== "webkit") {
      await page.keyboard.press("Tab");
      await expect(
        page.locator("dialog.add-dialog").getByRole("button", { name: "Close" }),
      ).toBeFocused();
    }

    // Esc in result mode closes; focus restores to the Add to Library
    // trigger (the Pitfall-1 close-listener restore).
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.add-dialog")).not.toBeVisible();
    await expect(trigger).toBeFocused();
    // Closing (not opening) preserved Unread: the book is in Unread.
    await page.goto(`${BASE}/#/unread`);
    await expect(page.locator("li.book-row").filter({ hasText: "The Focus Book" })).toBeVisible();
  });
});
