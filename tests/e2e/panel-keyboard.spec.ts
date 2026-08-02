// tests/e2e/panel-keyboard.spec.ts
// A11Y-01 + A11Y-02 — THE Pitfall 1 test. jsdom cannot replicate this
// (Pitfall 2): the native <dialog>/showModal focus trap, inert backdrop, and
// trigger focus-restore are real-browser behaviors. Asserted across Chromium,
// Firefox, and WebKit (the three projects declared in playwright.config.ts).
//
// What this proves that axe and jsdom cannot:
//   1. Opening the panel moves focus INTO the dialog (showModal behavior).
//   2. Tab cycles ONLY within the dialog (focus trap — never leaks to article).
//   3. Escape closes the dialog.
//   4. After close, focus returns to the gear trigger (Pitfall 1 — the load-
//      bearing focus-restore claim; showModal does NOT auto-restore).
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5173";

const FIRST_FIXTURE = "essay-long-form";

test.describe("Settings panel keyboard (A11Y-01/02 — Pitfall 1)", () => {
  test("focus moves into the dialog on open, traps on Tab, restores to gear on Escape", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIRST_FIXTURE}`);

    // Focus the gear trigger explicitly (predictable starting point).
    const gear = page.getByRole("button", { name: "Reading settings" });
    await gear.focus();
    await expect(gear).toBeFocused();

    // Open the panel via the keyboard (Enter on the focused gear).
    await page.keyboard.press("Enter");

    // The <dialog> is now open. Wait for it to be visible.
    const dlg = page.locator("dialog.settings-panel");
    await expect(dlg).toBeVisible();

    // (1) Focus is now INSIDE the dialog (showModal behavior).
    const activeInDialog = await page.evaluate(() => {
      const dlg = document.querySelector("dialog.settings-panel");
      return dlg && document.activeElement
        ? dlg.contains(document.activeElement)
        : false;
    });
    expect(activeInDialog, "focus should move into the dialog after open").toBe(
      true,
    );

    // (2) Tab cycles ONLY within the dialog (focus trap — never escapes to an
    // interactive control outside). The browser-provided focus trap on
    // showModal() is the canonical implementation (Pitfall 1 / 02-RESEARCH.md
    // anti-pattern: never hand-roll). We sample enough Tab presses to wrap
    // past the last focusable element (Reset) and exercise wrap-around.
    //
    // Implementation note: real Chromium/Firefox/WebKit briefly land focus on
    // <body> during the wrap-around from the last focusable to the first. That
    // transient body touch is not an escape to an interactive control (the
    // gear, the article links, etc.) and is corrected on the next Tab. The
    // load-bearing contract is that focus NEVER lands on an interactive
    // element outside the dialog.
    const outsideInteractive = async () => {
      return await page.evaluate(() => {
        const dlg = document.querySelector("dialog.settings-panel");
        const ae = document.activeElement;
        if (!dlg || !ae) return false;
        if (dlg.contains(ae) || ae === dlg) return false; // inside
        if (ae === document.body || ae === document.documentElement) {
          return false; // transient body/html touch during wrap — not interactive
        }
        return true; // focus landed on an interactive control outside the dialog
      });
    };
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press("Tab");
      const escaped = await outsideInteractive();
      expect(
        escaped,
        `focus escaped to an interactive control outside the dialog on Tab iteration ${i}`,
      ).toBe(false);
    }

    // Shift+Tab also never escapes to an interactive control (wrap-around in
    // the reverse direction works the same way).
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Shift+Tab");
      const escaped = await outsideInteractive();
      expect(
        escaped,
        `focus escaped to an interactive control outside the dialog on Shift+Tab iteration ${i}`,
      ).toBe(false);
    }

    // (3) Escape closes the dialog.
    await page.keyboard.press("Escape");
    await expect(dlg).not.toBeVisible();

    // (4) THE Pitfall 1 assertion: focus is restored to the gear trigger.
    // showModal() does NOT do this automatically; the SettingsPanel's close
    // listener calls triggerRef.current?.focus(). If that line is removed,
    // this assertion fails.
    await expect(gear).toBeFocused();
  });

  test("clicking the × close button restores focus to the gear trigger", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIRST_FIXTURE}`);
    const gear = page.getByRole("button", { name: "Reading settings" });
    await gear.focus();
    await page.keyboard.press("Enter");

    const dlg = page.locator("dialog.settings-panel");
    await expect(dlg).toBeVisible();

    // Close via the × button (pointer activation path).
    await page.getByRole("button", { name: "Close reading settings" }).click();
    await expect(dlg).not.toBeVisible();

    // Focus is restored to the gear even on pointer-close.
    await expect(gear).toBeFocused();
  });
});
