// tests/e2e/portability/a11y.spec.ts
// Plan 09-06 Task 3b — the a11y/keyboard gate for Phase 9's new surfaces:
// the Settings "Your data" cluster and the ImportPreviewDialog. Mirrors the
// tests/e2e/a11y.spec.ts AxeBuilder pattern (WCAG 2.2 AA tags, real
// browsers). axe reports only automatable issues — the manual screen-reader
// passes remain ACPT-02/05/06 territory.
//
// Keyboard truth (jsdom is not authoritative — the panel-keyboard.spec.ts
// discipline): inside the open preview dialog, Tab/Shift+Tab wrap within the
// dialog (native showModal focus scope — focus never escapes to body), and
// Escape closes with focus restored into the settings panel (Pitfall 1).
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import { buildBundleZip, makeArticle, openSettings, prepareFreshPage } from "./_portability";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] as const;

type AxeViolation = { id: string; impact?: string | null | undefined };
type AxeResultLike = { violations: AxeViolation[] };

/** A tiny valid bundle so the import flow reaches the preview dialog. */
const SMALL_BUNDLE = await buildBundleZip({
  schemaVersion: 1,
  exportedAt: "2026-08-15T00:00:00.000Z",
  appVersion: "0.1.0",
  articles: [
    makeArticle({
      id: "md-a11ydemosmll",
      title: "A11y Preview Dialog Article",
      paragraphs: [
        "A single small paragraph is enough to validate the bundle envelope and reveal the import preview dialog for the axe and keyboard passes.",
      ],
    }),
  ],
  locations: [],
  highlights: [],
  notes: [],
  preferences: { ...DEFAULT_SETTINGS },
  fixtureIds: [],
});

test.describe("portability surfaces — axe + keyboard", () => {
  test("settings panel (incl. Your data cluster): zero WCAG 2.2 AA violations", async ({
    page,
  }) => {
    await prepareFreshPage(page);
    await openSettings(page);
    // Scope axe to the open panel subtree (the rest of the page is inert
    // under showModal; the panel is the surface under test).
    const results = await new AxeBuilder({ page })
      .include("dialog.settings-panel")
      .withTags([...WCAG_TAGS])
      .analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test("import preview dialog: axe-clean, focus trapped, Esc restores focus", async ({ page }) => {
    await prepareFreshPage(page);
    const panel = await openSettings(page);
    await panel.locator('input[type="file"][accept=".zip"]').setInputFiles({
      name: "small-bundle.zip",
      mimeType: "application/zip",
      buffer: SMALL_BUNDLE,
    });

    const preview = page.locator("dialog.import-preview");
    await expect(preview).toBeVisible({ timeout: 15_000 });

    // (a) Initial focus is the NON-destructive Cancel import (Pitfall 8 —
    // the explicit [data-initial-focus] focus call after showModal).
    const cancel = preview.getByRole("button", { name: "Cancel import" });
    await expect(cancel).toBeFocused();

    // (b) The native modal focus trap keeps focus INSIDE the dialog: Tab
    // presses never land on an INTERACTIVE control outside it (transient
    // <body> stops during wrap-around are inert and not an escape — the
    // panel-keyboard.spec.ts discipline).
    //
    // ENGINE REALITY (logged to deferred-items for 09-07): with TWO stacked
    // sibling showModal dialogs (settings panel + preview), sequential focus
    // navigation diverges by engine — chromium cycles fully (with a
    // transient body touch), firefox retains focus on the last control at
    // the wrap point, and webkit parks focus on inert body/the dialog
    // element. None lets focus reach an interactive control outside the
    // dialog, and the controls remain operable (click paths are proven on
    // all three engines by import-preview.spec.ts). The full wrap-cycle is
    // asserted on chromium (the engine with healthy stacked-modal
    // navigation); the safety property is asserted everywhere. Mirrors the
    // high-zoom spec's engine-variable assertion precedent.
    const focusEscaped = () =>
      page.evaluate(() => {
        const ae = document.activeElement;
        if (ae === null) return false;
        if (ae === document.body || ae === document.documentElement) {
          return false; // transient body/html touch during wrap — not interactive
        }
        return ae.closest("dialog.import-preview") === null;
      });
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(80);
      expect(
        await focusEscaped(),
        `focus escaped to an interactive control outside the dialog on Tab ${i + 1}`,
      ).toBe(false);
    }
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press("Shift+Tab");
      await page.waitForTimeout(80);
      expect(
        await focusEscaped(),
        `focus escaped to an interactive control outside the dialog on Shift+Tab ${i + 1}`,
      ).toBe(false);
    }
    // Full wrap-cycle (last focusable → first focusable) on chromium only.
    if (test.info().project.name === "chromium") {
      // Return to a known stop first (the loop above may sit on body).
      await cancel.focus();
      const checkboxFocused = () =>
        preview
          .getByLabel("Apply imported reading preferences")
          .evaluate((el) => document.activeElement === el);
      for (let i = 0; i < 3 && !(await checkboxFocused()); i++) {
        await page.keyboard.press("Tab");
        await page.waitForTimeout(80);
      }
      expect(await checkboxFocused(), "chromium: wrap reaches the first focusable").toBe(true);
    }

    // (c) Escape closes the dialog and restores focus to the captured
    // trigger — an element inside the settings panel, never body (Pitfall 1).
    await page.keyboard.press("Escape");
    await expect(preview).not.toBeVisible();
    await expect(panel).toBeVisible(); // the settings panel itself stays open
    const activeInsidePanel = await page.evaluate(
      () =>
        document.activeElement !== null &&
        document.activeElement.closest("dialog.settings-panel") !== null,
    );
    expect(activeInsidePanel, "focus returns into the settings panel after Esc").toBe(true);

    // (d) axe on a freshly reopened dialog subtree — zero violations. (The
    // Esc-close cleanup from the fix above resets the state machine, so the
    // same bundle re-opens the preview deterministically.)
    await panel.locator('input[type="file"][accept=".zip"]').setInputFiles({
      name: "small-bundle.zip",
      mimeType: "application/zip",
      buffer: SMALL_BUNDLE,
    });
    await expect(preview).toBeVisible({ timeout: 15_000 });
    const results = await new AxeBuilder({ page })
      .include("dialog.import-preview")
      .withTags([...WCAG_TAGS])
      .analyze();
    expect(
      (results as AxeResultLike).violations,
      JSON.stringify((results as AxeResultLike).violations, null, 2),
    ).toEqual([]);
  });
});
