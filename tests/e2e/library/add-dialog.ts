// tests/e2e/library/add-dialog.ts
// Plan 16-03 Task 2 — the shared dialog-driving helper for every
// ingestion e2e spec. After the add-section dissolution (ADD-01), the
// three intake forms live behind the header-row "Add to Library" button's
// modal (dialog.add-dialog); no spec can drive an ingest input without
// opening it first.
//
// NON-SPEC FILENAME convention (markdown-payload.ts / _portability.ts /
// _fixtures.ts): this filename is not matched by Playwright's default
// testMatch, so importing it registers nothing — and a spec must NEVER
// import another .spec.ts (re-registers the source spec's cells in the
// importer's module registry). These two functions centralize every
// accessible name on the path (button label, dialog class, radio labels)
// so a future copy change is a one-file edit.
import { expect, type Page } from "@playwright/test";

/**
 * openAddDialog — click the header-row "Add to Library" trigger and wait
 * for the modal. Idempotent by construction: a refusal path leaves the
 * dialog OPEN (consecutive drives in one test — e.g. the upload-queue
 * re-pick cycles or the epub refusal ladder — must not re-click a trigger
 * that the open modal has made inert), so the click is skipped when the
 * dialog is already visible. The dialog always opens on Web address
 * (D16-08 — callers pick another source via pickSource when needed).
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
export async function pickSource(
  page: Page,
  source: "url" | "paste" | "file",
): Promise<void> {
  const name =
    source === "url"
      ? "Web address"
      : source === "paste"
        ? "Paste text"
        : "Upload file";
  await page.getByRole("radio", { name }).check();
}

/**
 * openSavedArticle — the result screen's primary action: click "Open
 * article" and wait for the dialog to leave the top layer AND the reader
 * route to take over (the D16-12 close-first ordering's browser-level
 * consequence — the dialog is closed before the hash write navigates).
 * The optional `urlPattern` narrows the awaited route (e.g. /#\/article\/md-/
 * for the markdown id-shape assertions).
 */
export async function openSavedArticle(
  page: Page,
  urlPattern: RegExp = /#\/article\//,
): Promise<void> {
  await page
    .locator("dialog.add-dialog")
    .getByRole("button", { name: "Open article" })
    .click();
  await expect(page.locator("dialog.add-dialog")).not.toBeVisible();
  await page.waitForURL(urlPattern, { timeout: 15_000 });
}

/**
 * addAnother — the result screen's reset action (issue #112): click "Add
 * another" and wait for the FRESH intake session (the result card gone,
 * the Web address radio checked). The dialog never closed.
 */
export async function addAnother(page: Page): Promise<void> {
  await page
    .locator("dialog.add-dialog")
    .getByRole("button", { name: "Add another" })
    .click();
  await expect(page.locator("dialog.add-dialog .add-result")).toHaveCount(0);
  await expect(
    page.locator("dialog.add-dialog fieldset.add-source-picker"),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: "Web address" })).toBeChecked();
}

/**
 * closeSavedResult — dismiss the result screen WITHOUT opening the article
 * (the issue #112 Unread-preserving path): click "Close" and wait for the
 * dialog to leave the top layer. The reader stays on the prior
 * destination; the saved article appears in the library as Unread.
 */
export async function closeSavedResult(page: Page): Promise<void> {
  await page
    .locator("dialog.add-dialog")
    .getByRole("button", { name: "Close" })
    .click();
  await expect(page.locator("dialog.add-dialog")).not.toBeVisible();
}
