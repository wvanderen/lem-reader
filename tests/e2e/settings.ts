import type { Page } from "@playwright/test";

/** Open a native settings disclosure before exercising its controls. */
export async function expandSettingsGroup(
  page: Page,
  name: "Reading" | "Appearance" | "Read-aloud" | "Your data",
) {
  const summary = page
    .locator(".settings-group > summary")
    .filter({ hasText: new RegExp(`^${name}$`) });
  if (!(await summary.evaluate((el) => (el.parentElement as HTMLDetailsElement).open))) {
    await summary.click();
  }
}
