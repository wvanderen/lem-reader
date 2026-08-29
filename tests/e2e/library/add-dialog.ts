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
