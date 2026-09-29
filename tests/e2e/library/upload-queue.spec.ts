// tests/e2e/library/upload-queue.spec.ts
// Plan 13-08 Task 2 — the G2 e2e contract (13-UAT.md § Gaps): the intake
// upload control behaves like a finished queue. Three user-bar behaviors:
//   1. a queued pick can be REMOVED before upload (Remove file control),
//   2. a completed book upload resets the picker WITHOUT a page refresh
//      (the exact user-reported path — the EPUB success stays on #/ with
//      a stale queued file until reload),
//   3. every refusal clears the pick so re-picking the SAME file re-fires
//      the picker (the import-input reset discipline applied to intake).
//
// Plan 16-03 migration: every drive opens the Add dialog on the file
// source first (openAddDialog/pickSource — the forms live behind the
// header button, ADD-01). Issue #113 (D16-12 as amended): a book success
// STAYS OPEN on the result screen — the result card is the success signal,
// the G2 reset already ran (resetFilePick fires at every terminal outcome
// of the file arm), and the library reflects the book behind the dialog
// (onSaved → snapshot invalidation, Issue #3). Refusals keep the dialog
// OPEN too (consecutive drives skip the trigger click — the helper is
// idempotent).
//
// Harness (cloned from tests/e2e/epub-intake.spec.ts + the library-suite
// markdown-upload.spec.ts conventions):
//   - BASE URL:    http://localhost:5173 (Vite dev server; /api/ingest
//                  middleware serves the full /server pipeline)
//   - beforeEach:  IndexedDB wipe via the shared annotations/_fixtures.ts
//                  wipeDatabase (deterministic first-run state)
//   - fixtures:    validBookEpub3 + corruptNotEpub imported from
//                  tests/unit/server/epub-fixtures (REUSE-DO-NOT-FORK —
//                  the generator IS the fixture source; no new generators)
//   - matrix:      plain test() — the 3-engine chromium/firefox/webkit
//                  project matrix is inherited from playwright.config.ts
//
// Assertion discipline (suite-wide Pitfall 8):
//   - ZERO fixed sleeps — every end condition is an auto-retrying
//     expect() on a locator or a locator.evaluate DOM read that is
//     race-free by construction (resetFilePick clears input.value
//     imperatively in the same handler tick that sets the status copy,
//     so once the copy is visible the value is already the empty string).
//   - The picker's value is read through locator.evaluate returning the
//     raw string: a set picker reads as a fake-path-prefixed filename, a
//     cleared picker reads as "".
import { test, expect, type Page } from "@playwright/test";
import { BASE, wipeDatabase } from "../annotations/_fixtures";
import { validBookEpub3, corruptNotEpub } from "../../unit/server/epub-fixtures";
import { openAddDialog, pickSource, closeSavedResult } from "./add-dialog";

/** A small .md pick for the remove-before-upload case. Never submitted —
 * the content only needs to be a valid picker selection. */
const SMALL_MARKDOWN = `# A Queued Pick

This small markdown buffer exercises the Remove file control before any
upload. The control must return to its empty, disabled resting state.
`;

/** The calm status line inside the Add dialog's live region. */
function ingestStatus(page: Page, text: string): import("@playwright/test").Locator {
  return page.locator("dialog.add-dialog .status").filter({ hasText: text });
}

/** Open the Add dialog on the file source, attach an EPUB to the picker,
 * and submit via the Add file button (the epub-intake.spec.ts helper
 * shape — every upload drives the REAL input#ingest-file + Add file
 * button, never a direct API POST). Idempotent open: a refusal leaves the
 * dialog open, so consecutive drives skip the trigger click. */
async function uploadEpub(page: Page, name: string, bytes: Uint8Array): Promise<void> {
  await openAddDialog(page);
  await pickSource(page, "file");
  await page.locator("input#ingest-file").setInputFiles({
    name,
    mimeType: "application/epub+zip",
    buffer: Buffer.from(bytes),
  });
  await page.getByRole("button", { name: /add file/i }).click();
}

/** Open the library surface (the saved-articles list on #/). */
async function openLibrary(page: Page): Promise<void> {
  await page.goto(`${BASE}/#/`);
  await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

test("Remove file clears a queued pick before upload", async ({ page }) => {
  await openLibrary(page);
  await openAddDialog(page);
  await pickSource(page, "file");

  const fileInput = page.locator("input#ingest-file");
  const addFile = page.getByRole("button", { name: /add file/i });

  // Pick a small .md — Add file becomes enabled (the hasFile mirror
  // re-evaluated after the OS picker resolved).
  await fileInput.setInputFiles({
    name: "queued-pick.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(SMALL_MARKDOWN, "utf-8"),
  });
  await expect(addFile).toBeEnabled();

  // Remove file (located via the add-remove-file hook class) clears
  // the queued pick: the raw input value reads as the empty string and
  // Add file is disabled again.
  await page.locator("button.add-remove-file").click();
  expect(await fileInput.evaluate((el) => (el as HTMLInputElement).value)).toBe("");
  await expect(addFile).toBeDisabled();
  // The Remove control unmounts with the pick (rendered only when
  // hasFile).
  await expect(page.locator("button.add-remove-file")).toHaveCount(0);

  // Re-picking the SAME name+buffer re-fires onChange — Add file is
  // enabled again (the reset cleared the picker, not just the visual).
  await fileInput.setInputFiles({
    name: "queued-pick.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(SMALL_MARKDOWN, "utf-8"),
  });
  await expect(addFile).toBeEnabled();
  await expect(page.locator("button.add-remove-file")).toBeVisible();
});

test("a completed book upload resets the picker without a page refresh", async ({ page }) => {
  await openLibrary(page);

  // The canonical 4-chapter book through the REAL pipeline (epub-intake
  // uploadEpub shape). Issue #113 (D16-12 as amended): the book success
  // STAYS OPEN on the result screen — the result card is the success
  // signal, and the G2 reset already happened (resetFilePick runs at every
  // terminal outcome of the file arm).
  await uploadEpub(page, "the-synthetic-book.epub", validBookEpub3());
  const dialog = page.locator("dialog.add-dialog");
  await expect(dialog.locator(".add-result")).toBeVisible({ timeout: 15_000 });

  // The exact user-reported G2 path: the result is on screen with NO
  // reload. The picker must already be empty and the Remove control gone
  // (resetFilePick cleared the pick in the same outcome tick). The shared
  // submit is RETIRED in result mode (the outcome action row replaced it —
  // its absence IS the resting submit state); the fresh-session disabled
  // gate is asserted after the reopen below. The picker is HIDDEN in
  // result mode (attached DOM, no remount; CSS locators, not role queries
  // — the hidden slot is excluded from the accessibility tree).
  const fileInput = page.locator("input#ingest-file");
  expect(await fileInput.evaluate((el) => (el as HTMLInputElement).value)).toBe("");
  await expect(page.locator("dialog.add-dialog .add-dialog-submit")).toHaveCount(0);
  await expect(page.locator("button.add-remove-file")).toHaveCount(0);

  // And the library reflects the book WITHOUT waiting for navigation —
  // Close (the Unread-preserving path) reveals the row already saved
  // behind the dialog; a REOPENED dialog starts the fresh session with
  // the submit disabled (the G2 resting gate).
  await closeSavedResult(page);
  await expect(page.locator("li.book-row")).toBeVisible({ timeout: 15_000 });
  await openAddDialog(page);
  await expect(page.locator(".add-dialog-submit")).toBeDisabled();
});

test("a refusal clears the pick so re-picking the same file re-fires the picker", async ({
  page,
}) => {
  await openLibrary(page);
  await openAddDialog(page);
  await pickSource(page, "file");

  const fileInput = page.locator("input#ingest-file");
  const addFile = page.getByRole("button", { name: /add file/i });
  const bytes = corruptNotEpub();

  // A corrupt not-a-zip buffer named .epub → the calm unreadable copy
  // (the refusal keeps the dialog open — the copy is visible inside it).
  await fileInput.setInputFiles({
    name: "broken.epub",
    mimeType: "application/epub+zip",
    buffer: Buffer.from(bytes),
  });
  await addFile.click();
  await expect(ingestStatus(page, "This file could not be read as an EPUB book.")).toBeVisible({
    timeout: 15_000,
  });

  // The refusal cleared the pick: the raw input value reads empty and
  // Add file is disabled again.
  expect(await fileInput.evaluate((el) => (el as HTMLInputElement).value)).toBe("");
  await expect(addFile).toBeDisabled();

  // Re-pick the SAME name+buffer — the reset made the second pick count
  // (onChange re-fired; Add file becomes enabled).
  await fileInput.setInputFiles({
    name: "broken.epub",
    mimeType: "application/epub+zip",
    buffer: Buffer.from(bytes),
  });
  await expect(addFile).toBeEnabled();

  // Submit again — the second refusal cycle re-fires end to end: the
  // submitting copy appears (this is genuinely the SECOND cycle, not the
  // lingering first copy), then the calm unreadable copy again.
  await addFile.click();
  await expect(ingestStatus(page, "Reading file…")).toBeVisible({
    timeout: 15_000,
  });
  await expect(ingestStatus(page, "This file could not be read as an EPUB book.")).toBeVisible({
    timeout: 15_000,
  });
  // And the terminal state resets the picker once more.
  expect(await fileInput.evaluate((el) => (el as HTMLInputElement).value)).toBe("");
  await expect(addFile).toBeDisabled();
});
