// tests/e2e/library/book-add-result.spec.ts
// Issue #163 — the BOOK success landing's 3-engine browser truth. The
// component suite (AddDialog.test.tsx) owns the jsdom-level state machine;
// jsdom has no dialog top layer, no focus ordering, no real hashchange
// routing (the focused-add.spec.ts Pitfall-5 discipline). Everything here
// runs on the REAL chromium/firefox/webkit matrix against the integrated
// AddDialog + app shell. The #113 saved-result screen this suite used to
// pin is RETIRED — the remembered "Open after adding" preference decides
// the landing.
//
// Cases (issue #163's acceptance criteria, book arm):
//   1. CHECKED (the default): the save opens the book's first AVAILABLE
//      chapter — the dialog closes itself, the #/article/<chapterId> route
//      takes over, and the never-opened chapter starts at the top (no
//      restoration marker — the reading-location rule).
//   2. UNCHECKED + SKIPS: the dialog closes onto the library; the
//      confirmation announces "Saved to your library." WITH the honest
//      skipped-chapter count (D12-11), the book appears in the Unread view
//      (no chapter location exists), and the BookRow's durable skip
//      disclosure matches.
//   3. UNCHECKED + CLEAN: the confirmation carries no skip sentence.
//   4. PERSISTENCE: the unchecked choice survives a reload (the remembered
//      preference) and the next save lands quietly again.
//   5. REFUSAL: a duplicate refusal keeps the dialog open with the calm
//      copy, never navigates, and never overwrites — the library keeps
//      exactly one book.
//   6. KEYBOARD: the checkbox is keyboard-operable (Space toggles) and a
//      keyboard-submitted save lands like any other.
//
// Harness discipline (add-result.spec.ts clone):
//   - openAddDialog/pickSource/setOpenAfterAdding/awaitAutoOpened/
//     awaitQuietClosed from ./add-dialog — the shared idempotent helpers
//     centralizing every accessible name.
//   - wipeDatabase beforeEach (deterministic first-run state — the mirror
//     clear included, so openAfterAdd always starts at its checked
//     default).
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
  setOpenAfterAdding,
  awaitAutoOpened,
  awaitQuietClosed,
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
 * intercepts before any read reaches a server, so the bytes are inert).
 * `quiet` selects the UNCHECKED landing (issue #163) — the remembered
 * preference must be set BEFORE the submission. */
async function uploadEpub(page: Page, name: string, quiet: boolean): Promise<void> {
  await openAddDialog(page);
  await pickSource(page, "file");
  await setOpenAfterAdding(page, !quiet);
  await page.locator("input#ingest-file").setInputFiles({
    name,
    mimeType: "application/epub+zip",
    buffer: Buffer.from("PK-mock-bytes"),
  });
  await page.getByRole("button", { name: /add file/i }).click();
}

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

test.describe("Book add landings (issue #163)", () => {
  test("CHECKED: the save opens the book's first available chapter, starting at the top", async ({
    page,
  }) => {
    await mockEpubIngest(page, { current: bookEnvelope("epub-mockopen01", "The Open Book", 0) });
    await openLibrary(page);
    await uploadEpub(page, "open.epub", false);

    // The first DECLARED live chapter opens (a chapter IS an article); the
    // dialog closed itself — no result screen, no explicit Open book step.
    await awaitAutoOpened(page, /#\/article\/epub-mockopen01-c00$/);
    await expect(page.getByRole("heading", { level: 1, name: "Chapter 1. Mock" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("dialog.add-dialog")).not.toBeVisible();
    // The reading-location rule for a never-opened chapter: the reader
    // starts at the beginning — no restoration marker, no resume banner.
    await expect(page.locator(".restoration-marker")).toHaveCount(0);
  });

  test("UNCHECKED + skips: the quiet confirmation carries the honest count; the book is Unread; the BookRow discloses", async ({
    page,
  }) => {
    await mockEpubIngest(page, {
      current: bookEnvelope("epub-mockskip01", "The Mock Skip Book", 2),
    });
    await openLibrary(page);
    await uploadEpub(page, "skip.epub", true);

    // The quiet landing: dialog closed, back on the library, the notice
    // carries the save + the D12-11 skip sentences (the honest count at
    // the moment of success).
    await awaitQuietClosed(page, "Saved to your library. 2 chapters could not be read.");
    expect(page.url(), "no navigation on the quiet landing").not.toContain("#/article");
    await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible();

    // THE Unread transition: the never-opened book is in the Unread view
    // (no chapter location exists; the snapshot invalidated before the
    // close).
    await page.goto(`${BASE}/#/unread`);
    await expect(page.getByRole("link", { name: /^Unread \(\d+\)$/ })).toBeVisible();
    await expect(
      page.locator("li.book-row").filter({ hasText: "The Mock Skip Book" }),
    ).toBeVisible();

    // …and the durable BookRow disclosure matches (never silently missing).
    await expect(
      page.locator("li.book-row .book-skip-disclosure").filter({ hasText: "2 chapters" }),
    ).toHaveText("2 chapters could not be read.");
  });

  test("UNCHECKED + clean: the confirmation is silent about skips", async ({ page }) => {
    await mockEpubIngest(page, {
      current: bookEnvelope("epub-mockclean01", "The Mock Clean Book", 0),
    });
    await openLibrary(page);
    await uploadEpub(page, "clean.epub", true);

    // Silence is the all-chapters-admitted state — the plain confirmation.
    await awaitQuietClosed(page, "Saved to your library.");
    await expect(page.locator(".library-add-notice")).toHaveText("Saved to your library.");
  });

  test("the unchecked choice is REMEMBERED across a reload (the persisted preference)", async ({
    page,
  }) => {
    const payload = { current: bookEnvelope("epub-mockmem01", "The Memory Book", 0) };
    await mockEpubIngest(page, payload);
    await openLibrary(page);

    // Session 1: uncheck, save quietly.
    await uploadEpub(page, "memory-1.epub", true);
    await awaitQuietClosed(page);
    // The preference write is DEBOUNCED (the SettingsContext ~400ms save);
    // wait for the localStorage mirror to carry it before reloading — the
    // mirror is what the next cold load paints from first (no fixed
    // sleeps — an auto-retrying poll on the persisted truth).
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("lem-settings-mirror-v1") ?? ""))
      .toContain('"openAfterAdd":false');

    // Session 2: a reload is a fresh app — the preference hydrates from
    // storage, so the checkbox comes back UNCHECKED and the next save
    // lands quietly again.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible();
    await openAddDialog(page);
    const box = page.getByRole("checkbox", { name: "Open after adding" });
    await expect(box).not.toBeChecked();

    payload.current = bookEnvelope("epub-mockmem02", "The Memory Book II", 0);
    await uploadEpub(page, "memory-2.epub", true);
    await awaitQuietClosed(page);
    await expect(
      page.locator("li.book-row").filter({ hasText: "The Memory Book II" }),
    ).toBeVisible();
    await expect(page.locator("li.book-row")).toHaveCount(2);
  });

  test("a duplicate refusal keeps the dialog open with the calm copy and never overwrites", async ({
    page,
  }) => {
    await mockEpubIngest(page, { current: bookEnvelope("epub-mockdup001", "The Dup Book", 0) });
    await openLibrary(page);
    await uploadEpub(page, "dup.epub", true);
    await awaitQuietClosed(page);

    // Re-submit the SAME input: the service's hasBook() now finds the
    // saved book → dedupe-refuse (D7-07/D16-09). The dialog REOPENS for
    // the drive and STAYS OPEN on the calm copy — no navigation, no
    // landing.
    await uploadEpub(page, "dup.epub", true);
    const dialog = page.locator("dialog.add-dialog");
    await expect(dialog.locator(".status")).toContainText("Already in your library.");
    await expect(dialog).toBeVisible();
    expect(page.url()).not.toContain("#/article");
    // Retry stays available (the pick cleared for a re-pick — the G2
    // resting gate disables the submit until a new pick).
    await expect(dialog.locator("button.add-dialog-submit")).toBeDisabled();

    // Never overwritten: Esc closes; the library holds EXACTLY ONE book.
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(page.locator("li.book-row")).toHaveCount(1);
  });

  test("keyboard: Space toggles the checkbox; a keyboard-submitted save lands like any other", async ({
    page,
  }) => {
    await mockEpubIngest(page, { current: bookEnvelope("epub-mockkeys01", "The Keys Book", 0) });
    await openLibrary(page);

    // Keyboard-open from the trigger (the panel-keyboard discipline).
    const trigger = addButton(page);
    await trigger.focus();
    await trigger.press("Enter");
    await expect(page.locator("dialog.add-dialog")).toBeVisible();

    await pickSource(page, "file");
    // KEYBOARD checkbox: focus it and toggle with Space — the native
    // checkbox operation, no pointer.
    const box = page.getByRole("checkbox", { name: "Open after adding" });
    await expect(box).toBeChecked();
    await box.focus();
    await page.keyboard.press("Space");
    await expect(box).not.toBeChecked();

    await page.locator("input#ingest-file").setInputFiles({
      name: "keys.epub",
      mimeType: "application/epub+zip",
      buffer: Buffer.from("PK-mock-bytes"),
    });
    // Keyboard submit: the shared submit is focusable; Enter activates it.
    await page.locator("dialog.add-dialog .add-dialog-submit").focus();
    await page.keyboard.press("Enter");

    // The quiet landing: dialog closed, the confirmation announced, focus
    // restored to the Add to Library trigger (the Pitfall-1 close-listener
    // restore).
    await awaitQuietClosed(page);
    await expect(trigger).toBeFocused();
    // The quiet save preserved Unread: the book is in the Unread view.
    await page.goto(`${BASE}/#/unread`);
    await expect(page.locator("li.book-row").filter({ hasText: "The Keys Book" })).toBeVisible();
  });
});
