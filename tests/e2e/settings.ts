import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Shared settings-disclosure helpers (issue #254 discovery index — ONE home
 * for opening the settings panel, its disclosure groups, and its slot
 * editors; specs must not re-derive the disclosure dance — the slot
 * accordion's one-at-a-time behavior in particular is a requirement
 * discovery that drifted when copied).
 */

/** Open a native settings disclosure before exercising its controls. */
export async function expandSettingsGroup(
  page: Page,
  name: "Reading" | "Appearance" | "Highlights" | "Read-aloud" | "Your data",
) {
  const summary = page
    .locator(".settings-group > summary")
    .filter({ hasText: new RegExp(`^${name}$`) });
  if (!(await summary.evaluate((el) => (el.parentElement as HTMLDetailsElement).open))) {
    await summary.click();
  }
}

/**
 * The settings panel dialog, opened via the gear trigger when closed.
 * Returns the dialog locator.
 */
export async function openSettingsPanel(page: Page): Promise<Locator> {
  const dlg = page.locator("dialog.settings-panel");
  if (!(await dlg.isVisible())) {
    await page.getByRole("button", { name: "Reading settings" }).click();
  }
  await expect(dlg).toBeVisible();
  return dlg;
}

/**
 * Expand slot `slot`'s editor row (issue #222's one-at-a-time accordion:
 * opening a row collapses the previously open one) and return the slot's
 * group locator. Expands the Highlights disclosure first — the slot editors
 * live inside it. Reuses openSettingsPanel; never opens a second panel.
 */
export async function openSlotEditor(page: Page, slot: number): Promise<Locator> {
  const settings = await openSettingsPanel(page);
  await expandSettingsGroup(page, "Highlights");
  // exact: the editor group is aria-labeled "Slot N" — but a "Slot N color"
  // fieldset shares the prefix, and a substring match is a strict-mode
  // ambiguity (webkit-observed, issue #254 round).
  const group = settings.getByRole("group", { name: `Slot ${slot}`, exact: true });
  if (!(await group.isVisible())) {
    // The row trigger's name carries the slot's current label ("Slot 2:
    // Yellow", or the reader's custom name) — match the numbered prefix.
    await settings.getByRole("button", { name: new RegExp(`^Slot ${slot}: `) }).click();
  }
  await expect(group).toBeVisible();
  return group;
}
