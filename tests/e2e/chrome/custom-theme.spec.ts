// tests/e2e/chrome/custom-theme.spec.ts
// Issue #86 (decision #73) — the custom-theme builder, proven in the real
// browser (jsdom owns no layout/color truth — the Pitfall 2 discipline):
//
//   CT-01 — keyboard-complete: the 4th Theme radio is reachable and operable
//           (native radio-group arrow navigation), the disclosure summary
//           toggles from the keyboard, every color picker + hex field is
//           labeled and focusable, and the global :focus-visible ring shows.
//   CT-02 — live apply: a hex commit writes the resolved palette INLINE on
//           <html> (decision #73: the inline writes ARE the theme) and the
//           computed body background follows — instantly (no transition is
//           added; the reduced-motion posture is inherited, A11Y-06).
//   CT-03 — the contrast guardrail: a broken policed pair renders the calm
//           warning + "Fix contrast"; the fix restores AA on that pair
//           (recomputed in-page from the inline tokens) without touching
//           unrelated tokens.
//   CT-04 — persistence: the custom theme survives a reload (Dexie truth +
//           mirror hint; the pre-React script paints the seeded :root
//           defaults until hydration — accepted by decision #73).
//   CT-05 — the two reset semantics: "Reset to base colors" restores the
//           seed tokens while STAYING custom; the panel-wide Reset drops the
//           record wholesale (the next activation re-seeds fresh).
//   CT-06 — axe (WCAG 2.2 AA) on the OPEN settings dialog with the builder
//           live — the a11y.spec dialog-scan discipline.
//
// Harness reuse (REUSE-DO-NOT-FORK): BASE + wipeDatabase from
// ../annotations/_fixtures; the axe serious-only gate from a11y.spec; the
// LEM_E2E_BASE override for parallel-session dev servers.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { wipeDatabase, BASE } from "../annotations/_fixtures";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] as const;

/** Open the settings panel on the shell (the a11y.spec entry). */
async function openSettings(page: Page): Promise<void> {
  await page.goto(`${BASE}/#/`);
  await page.getByRole("button", { name: "Reading settings" }).click();
  await expect(page.locator("dialog.settings-panel")).toBeVisible();
}

/** Activate the Custom slot from a preset and wait for the builder. */
async function activateCustom(page: Page): Promise<void> {
  await page.getByRole("radio", { name: "Custom" }).click();
  await expect(page.locator("details.custom-theme-builder")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "custom");
}

test.describe("Custom theme builder (#86 — one Custom slot, 5 tokens, derived palette)", () => {
  test.beforeEach(async ({ page }) => {
    await wipeDatabase(page);
  });

  // CT-01 — keyboard-complete end to end. The radio group is operated with
  // its NATIVE mechanism (arrow keys move + activate); the disclosure and
  // every field ride the native focus order; the global 2px :focus-visible
  // ring is the visible focus cue.
  test("keyboard-complete: radio arrows, disclosure toggle, labeled fields, visible focus (CT-01)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await openSettings(page);

    // The 4th radio is reachable: focus the group's first radio and walk
    // down with arrow keys (Sepia → Light → Dark → Custom).
    const sepia = page.getByRole("radio", { name: "Sepia" });
    await sepia.focus();
    await expect(sepia).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("radio", { name: "Custom" })).toBeChecked();
    await expect(page.locator("details.custom-theme-builder")).toBeVisible();

    // The disclosure toggles from the keyboard (native <details> semantics).
    const summary = page.locator("details.custom-theme-builder summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".custom-theme-rows")).toBeHidden();
    await page.keyboard.press("Enter");
    await expect(page.locator(".custom-theme-rows")).toBeVisible();
    // Focus on the summary shows the global visible-focus ring.
    const ring = await summary.evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: s.outlineWidth };
    });
    expect(ring.style).not.toBe("none");
    expect(parseInt(ring.width, 10)).toBeGreaterThanOrEqual(2);

    // Every color picker + hex field is labeled AND focusable (exact match —
    // "Surface color" must not also hit "Raised surface color").
    for (const label of ["Surface", "Raised surface", "Text", "Accent", "Hairline"]) {
      const swatch = page.getByLabel(`${label} color`, { exact: true });
      const hex = page.getByLabel(`${label} hex value`, { exact: true });
      await expect(swatch).toBeVisible();
      await expect(hex).toBeVisible();
      await swatch.focus();
      await expect(swatch).toBeFocused();
      await hex.focus();
      await expect(hex).toBeFocused();
    }

    // The hex fields commit from the keyboard too (the live-apply proof of
    // the fill lives in CT-02).
    await page.getByLabel("Text hex value").fill("#123456");
  });

  // CT-02 — live apply: the inline palette IS the theme.
  test("a hex commit applies the palette inline and recomputes the body paint (CT-02)", async ({
    page,
  }) => {
    await openSettings(page);
    await activateCustom(page);

    // Change the SURFACE: the body background consumes var(--surface), so
    // the computed paint is the direct proof the inline write took effect.
    await page.getByLabel("Surface hex value", { exact: true }).fill("#123456");
    const inline = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      ink: document.documentElement.style.getPropertyValue("--ink"),
      surface: document.documentElement.style.getPropertyValue("--surface"),
      highlight: document.documentElement.style.getPropertyValue("--highlight"),
      focusRing: document.documentElement.style.getPropertyValue("--focus-ring"),
      bodyPaint: getComputedStyle(document.body).backgroundColor,
    }));
    expect(inline.theme).toBe("custom");
    expect(inline.surface).toBe("#123456");
    expect(inline.ink).toBe("#1f1b16"); // the untouched seed token rides
    // The derived palette resolved (hex literals on <html>).
    expect(inline.highlight).toMatch(/^#[0-9a-f]{6}$/);
    expect(inline.focusRing).toMatch(/^#[0-9a-f]{6}$/);
    // The computed paint follows the inline write (rgb(18, 52, 86) = #123456).
    expect(inline.bodyPaint).toBe("rgb(18, 52, 86)");
  });

  // CT-03 — the guardrail: warn calmly, fix the offending pair only.
  test("below-AA warns + Fix contrast restores the pair without touching others (CT-03)", async ({
    page,
  }) => {
    await openSettings(page);
    await activateCustom(page);

    // Break ONE pair: ink = the surface color.
    await page.getByLabel("Text hex value").fill("#fbf8f3");
    await expect(page.locator(".custom-theme-builder .custom-theme-warning")).toBeVisible();

    await page.getByRole("button", { name: "Fix contrast" }).click();
    await expect(page.locator(".custom-theme-builder .custom-theme-warning")).toBeHidden();

    // Recompute the policed pair in-page from the inline tokens (the test
    // owns the WCAG math; the app owns the tokens).
    const verdict = await page.evaluate(() => {
      const lin = (c: number): number => {
        const s = c / 255;
        return s <= 0.04045
          ? s / 12.92
          : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      const lum = (hex: string): number => {
        const n = parseInt(hex.slice(1), 16);
        return (
          0.2126 * lin((n >> 16) & 255) +
          0.7152 * lin((n >> 8) & 255) +
          0.0722 * lin(n & 255)
        );
      };
      const ratio = (a: string, b: string): number => {
        const la = lum(a);
        const lb = lum(b);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
      };
      const style = document.documentElement.style;
      return {
        ink: style.getPropertyValue("--ink"),
        surface: style.getPropertyValue("--surface"),
        accent: style.getPropertyValue("--accent"),
        hairline: style.getPropertyValue("--hairline"),
        pairRatio: ratio(style.getPropertyValue("--ink"), style.getPropertyValue("--surface")),
      };
    });
    expect(verdict.pairRatio).toBeGreaterThanOrEqual(4.5);
    expect(verdict.surface).toBe("#fbf8f3"); // untouched
    expect(verdict.accent).toBe("#6b4423"); // untouched
    expect(verdict.hairline).toBe("#d9d1c2"); // untouched
    expect(verdict.ink).not.toBe("#fbf8f3"); // the offender moved
  });

  // CT-04 — persistence: Dexie truth survives reload; the mirror hint makes
  // the hydrated state immediate (the pre-React paint of the SEEDED defaults
  // until hydration is the accepted decision-#73 boundary). The reload
  // closes the panel (its open state is React state, not persisted) — the
  // assertions target the hydrated document, then the reopened panel.
  test("the custom theme survives a reload (CT-04)", async ({ page }) => {
    await openSettings(page);
    await activateCustom(page);
    await page.getByLabel("Text hex value").fill("#123456");
    // Let the debounced save land before tearing the page down.
    await page.waitForTimeout(700);

    await page.reload();
    // The shell booted (the settings gear is the mounted chrome).
    await expect(page.getByRole("button", { name: "Reading settings" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "custom");
    const inline = await page.evaluate(() => ({
      ink: document.documentElement.style.getPropertyValue("--ink"),
      surface: document.documentElement.style.getPropertyValue("--surface"),
    }));
    expect(inline.ink).toBe("#123456");
    expect(inline.surface).toBe("#fbf8f3");
  });

  // CT-05 — the two resets: builder-level restore vs panel-wide drop.
  test("Reset to base keeps custom; the panel Reset drops the record wholesale (CT-05)", async ({
    page,
  }) => {
    await openSettings(page);
    await activateCustom(page);
    await page.getByLabel("Text hex value").fill("#123456");

    // Builder-level: tokens restore, the slot STAYS custom.
    await page.getByRole("button", { name: "Reset to base colors" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "custom");
    const restored = await page.evaluate(() => ({
      ink: document.documentElement.style.getPropertyValue("--ink"),
      surface: document.documentElement.style.getPropertyValue("--surface"),
    }));
    expect(restored.ink).toBe("#1f1b16");
    expect(restored.surface).toBe("#fbf8f3");

    // Panel-wide: the record drops; a fresh activation re-seeds (the edited
    // value must NOT resume).
    await page.getByLabel("Text hex value").fill("#123456");
    await page.getByRole("button", { name: "Reset to defaults" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "sepia");
    await expect(page.locator("details.custom-theme-builder")).toHaveCount(0);

    await page.getByRole("radio", { name: "Custom" }).click();
    await expect(page.locator("details.custom-theme-builder")).toBeVisible();
    const reseeded = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--ink"),
    );
    expect(reseeded).toBe("#1f1b16");
  });

  // CT-06 — axe on the open dialog with the builder live (the a11y.spec
  // dialog-scan discipline: serious/critical must be empty).
  test("axe WCAG 2.2 AA on the settings dialog with the builder open (CT-06)", async ({ page }) => {
    await openSettings(page);
    await activateCustom(page);
    const results = await new AxeBuilder({ page })
      .withTags([...WCAG_TAGS])
      .include("dialog.settings-panel")
      .analyze();
    const serious = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
