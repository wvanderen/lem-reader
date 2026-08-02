// tests/e2e/forced-colors.spec.ts
// A11Y-05 — under forced-colors (Windows High Contrast mode), state and meaning
// must survive without relying on color alone (UI-SPEC §Color contrast contract
// line 290). The settings panel, gear, and links must remain legible and
// operable. Asserted via emulateMedia({ forcedColors: "active" }) across
// Chromium/Firefox/WebKit (forced-colors emulation is supported in all three).
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5173";
const FIRST_FIXTURE = "essay-long-form";

test.describe("Forced colors (A11Y-05)", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
  });

  test("article links keep their underlines (UI-SPEC §Interaction 2 / global gate)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIRST_FIXTURE}`);
    // The global @media (forced-colors: active) { a { text-decoration: underline } }
    // gate in app.css keeps link underlines visible under forced-colors. Find
    // any link inside the article body and assert underline.
    const link = page.locator(".article-body a").first();
    await expect(link).toBeVisible();
    const td = await link.evaluate(
      (el) => window.getComputedStyle(el).textDecoration,
    );
    // `text-decoration` shorthand includes line, style, color. We just assert
    // that the line is present (underline or "line-through underline" etc.).
    expect(td.toLowerCase(), `link underline lost under forced-colors`).toContain(
      "underline",
    );
  });

  test("gear open/closed distinction is conveyed by aria-expanded (beyond color)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIRST_FIXTURE}`);
    // exact: true because the close button's accessible name ("Close reading
    // settings") would otherwise match "Reading settings" via substring.
    const gear = page.getByRole("button", { name: "Reading settings", exact: true });
    await expect(gear).toHaveAttribute("aria-expanded", "false");
    await gear.click();
    await expect(gear).toHaveAttribute("aria-expanded", "true");
    // The dialog is open — the open-state IS conveyed by aria-expanded, which
    // survives forced-colors (color alone would be lost).
  });

  test("every panel control has a visible focus outline when focused (UI-SPEC §Interaction 4)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIRST_FIXTURE}`);
    await page.getByRole("button", { name: "Reading settings" }).click();
    const dlg = page.locator("dialog.settings-panel");
    await expect(dlg).toBeVisible();

    // Focus each control programmatically and assert a visible outline.
    // (Programmatic focus is more reliable than Tab for this contract: WebKit's
    // Tab handling inside <dialog> is independently buggy — see
    // panel-keyboard.spec.ts for the trap-coverage test.)
    //
    // Cross-engine note: under forced-colors, the browser activates its own
    // default focus indicator (typically 3px solid CanvasText) regardless of
    // whether `:focus-visible` matches the programmatic focus. We assert on
    // outline-WIDTH > 0 (the load-bearing visibility signal) rather than on
    // outline-style/match-state, which varies by engine.
    const targets = [
      { sel: "button.settings-close", label: "close ×" },
      { sel: "input[name='font']", label: "first radio" },
      { sel: "input[name='size']", label: "size range" },
      { sel: "input[name='measure']", label: "measure range" },
      { sel: "button.settings-reset", label: "Reset button" },
    ];
    for (const { sel, label } of targets) {
      await dlg.locator(sel).first().focus();
      const outline = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        const cs = window.getComputedStyle(el);
        return {
          outlineStyle: cs.outlineStyle,
          outlineWidth: cs.outlineWidth,
        };
      });
      expect(outline, `${label}: should have a focused element`).not.toBeNull();
      // outline-width must resolve to a non-zero pixel value (the global
      // :focus-visible rule OR the browser's forced-colors default).
      const widthPx = parseFloat((outline?.outlineWidth ?? "0px").replace(/px$/, ""));
      expect(
        widthPx,
        `${label}: focused control lost its outline under forced-colors (outline-width=${outline?.outlineWidth}, style=${outline?.outlineStyle})`,
      ).toBeGreaterThan(0);
    }
  });

  test("selected radio state is conveyed by native checked (not just the marker)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIRST_FIXTURE}`);
    await page.getByRole("button", { name: "Reading settings" }).click();
    // The default-selected theme radio is "Sepia" — its checked state conveys
    // selection independent of the marker color.
    const sepia = page.getByRole("radio", { name: "Sepia" });
    await expect(sepia).toBeChecked();

    // Selecting "Dark" updates the checked state.
    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
    await expect(sepia).not.toBeChecked();
  });
});
