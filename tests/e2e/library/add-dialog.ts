// tests/e2e/library/add-dialog.ts
// The shared dialog-driving helper for every ingestion e2e spec. After the
// add-section dissolution (ADD-01), the three intake forms live behind the
// header-row "Add to Library" button's modal (dialog.add-dialog); no spec
// can drive an ingest input without opening it first.
//
// Issue #163 — the success landing is decided by the remembered
// "Open after adding" checkbox (schema default CHECKED): a successful save
// either OPENS the saved item (the reader route replaces the dialog) or —
// unchecked — CLOSES the dialog onto the library with the confirmation
// announced through the library's status region. The retired #112/#113
// saved-result screen (Open article / Open book / Add another / Close) is
// gone, and so are its helpers.
//
// NON-SPEC FILENAME convention (markdown-payload.ts / _portability.ts /
// _fixtures.ts): this filename is not matched by Playwright's default
// testMatch, so importing it registers nothing — and a spec must NEVER
// import another .spec.ts (re-registers the source spec's cells in the
// importer's module registry). These functions centralize every accessible
// name on the path (button label, dialog class, radio labels, checkbox
// label, status region) so a future copy change is a one-file edit.
import { expect, type Page } from "@playwright/test";

/**
 * openAddDialog — click the header-row "Add to Library" trigger and wait
 * for the modal. Idempotent by construction: a refusal path leaves the
 * dialog OPEN (consecutive drives in one test — e.g. the upload-queue
 * re-pick cycles or the epub refusal ladder — must not re-click a trigger
 * that the open modal has made inert), so the click is skipped when the
 * dialog is already visible. The dialog always opens on Web address
 * (D16-08 — callers pick another source via pickSource when needed) with
 * the remembered openAfterAdd preference on the checkbox.
 */
export async function openAddDialog(page: Page): Promise<void> {
  const dialog = page.locator("dialog.add-dialog");
  if (!(await dialog.isVisible())) {
    await page.getByRole("button", { name: "Add to Library" }).click();
  }
  await expect(dialog).toBeVisible();
}

/**
 * pickSource — check the 3-way source picker's radio by accessible name
 * (D16-05: Web address / Paste text / Upload file). `.check()` is a no-op
 * when the radio is already checked, so repeated calls are safe.
 */
export async function pickSource(page: Page, source: "url" | "paste" | "file"): Promise<void> {
  const name = source === "url" ? "Web address" : source === "paste" ? "Paste text" : "Upload file";
  await page.getByRole("radio", { name }).check();
}

/**
 * setOpenAfterAdding — check or uncheck the remembered "Open after adding"
 * preference (issue #163). `.check()`/`.uncheck()` are no-ops when the box
 * already carries the wanted state, so repeated calls are safe. The choice
 * persists (SettingsContext debounced save + mirror) — specs that need the
 * quiet landing MUST uncheck before submitting.
 */
export async function setOpenAfterAdding(page: Page, checked: boolean): Promise<void> {
  const box = page.getByRole("checkbox", { name: "Open after adding" });
  if (checked) {
    await box.check();
  } else {
    await box.uncheck();
  }
}

/**
 * awaitAutoOpened — the CHECKED success landing (issue #163): the dialog
 * closes itself and the saved item's route takes over — the article, or
 * the book's first AVAILABLE chapter (a chapter IS an article: the same
 * #/article/<id> shape). `urlPattern` narrows the awaited route (e.g.
 * /#\/article\/md-/ for the markdown id-shape assertions).
 */
export async function awaitAutoOpened(
  page: Page,
  urlPattern: RegExp = /#\/article\//,
): Promise<void> {
  await expect(page.locator("dialog.add-dialog")).not.toBeVisible();
  await page.waitForURL(urlPattern, { timeout: 15_000 });
}

/**
 * awaitQuietClosed — the UNCHECKED success landing (issue #163): the
 * dialog closes itself, the reader stays on the library destination, and
 * the confirmation ("Saved to your library.", books appending the D12-11
 * skip sentence) has landed in the library's notice status region. The
 * saved item appears in the library Unread (the snapshot invalidation
 * fired before the close).
 */
export async function awaitQuietClosed(
  page: Page,
  notice = "Saved to your library.",
): Promise<void> {
  await expect(page.locator("dialog.add-dialog")).not.toBeVisible();
  await expect(page.locator(".library-add-notice")).toContainText(notice);
}
