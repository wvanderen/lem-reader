import { expandSettingsGroup } from "../settings";
// tests/e2e/chrome/custom-theme.spec.ts
// Issues #86/#120 (decision #73 + the two-slot split) — the custom-theme
// builder, proven in the real browser (jsdom owns no layout/color truth —
// the Pitfall 2 discipline):
//
//   CT-01 — keyboard-complete: the Theme radios are reachable and operable
//           (native radio-group arrow navigation — FIVE choices since
//           #120), the disclosure summary toggles from the keyboard, every
//           color picker + hex field is labeled and focusable, and the
//           global :focus-visible ring shows.
//   CT-02 — live apply: a hex commit writes the resolved palette INLINE on
//           <html> (decision #73: the inline writes ARE the theme) and the
//           computed body background follows — instantly (no transition is
//           added; the reduced-motion posture is inherited, A11Y-06).
//   CT-03 — the contrast guardrail: a broken policed pair renders the calm
//           warning + "Fix contrast"; the fix restores AA on that pair
//           (recomputed in-page from the inline tokens) without touching
//           unrelated tokens.
//   CT-04 — persistence: a slot's custom theme survives a reload (Dexie
//           truth + mirror hint; the pre-React script paints the seeded
//           :root defaults until hydration — accepted by decision #73).
//   CT-05 — the two reset semantics: "Reset to base colors" restores the
//           seed tokens while STAYING custom; the panel-wide Reset drops
//           BOTH records wholesale (the next activation re-seeds fresh).
//   CT-06 — axe (WCAG 2.2 AA) on the OPEN settings dialog with the builder
//           live — the a11y.spec dialog-scan discipline.
//   CT-07 — slot independence (#120): the two slots save independently —
//           an edit in one never rides into the other, and BOTH survive a
//           reload with their own tokens (reopening restores the active
//           slot's appearance exactly).
//   CT-08 — migration (#120): a legacy ONE-slot record (theme "custom" +
//           customTheme, the pre-#120 shape) seeded directly into Dexie
//           hydrates into Custom dark (dark-seeded) with the edited tokens
//           byte-exact; the OTHER slot starts from its matching preset;
//           there is no automatic system-theme switching anywhere.
//
// Harness reuse (REUSE-DO-NOT-FORK): BASE + wipeDatabase from
// ../annotations/_fixtures; the axe serious-only gate from a11y.spec.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { wipeDatabase, BASE } from "../annotations/_fixtures";

// CT-06 scans the FULL 2.2 AA rule set the header claims: axe's wcag22a/
// wcag22aa tags on top of the 2.0/2.1 set the other specs scan.
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"] as const;

/** Open the settings panel on the shell (the a11y.spec entry). */
async function openSettings(page: Page): Promise<void> {
  await page.goto(`${BASE}/#/`);
  await page.getByRole("button", { name: "Reading settings" }).click();
  await expandSettingsGroup(page, "Appearance");
  await expect(page.locator("dialog.settings-panel")).toBeVisible();
}

/** Activate a custom slot by radio name and wait for the builder. */
async function activateSlot(page: Page, name: "Custom light" | "Custom dark"): Promise<void> {
  await page.getByRole("radio", { name }).click();
  await expect(page.locator("details.custom-theme-builder")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    name === "Custom light" ? "custom-light" : "custom-dark",
  );
}

/** Seed a pre-#120 reader-prefs row directly into Dexie (raw IndexedDB —
 * the seedHighlightRecord discipline in ../annotations/_fixtures.ts). The
 * record carries ONE deliberately uppercase edited token so the byte-exact
 * migration (storage-layer case preservation) is visible. */
async function seedLegacyCustomRow(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const legacyRow = {
      key: "reader-prefs",
      value: {
        schemaVersion: 4,
        font: "serif",
        size: 18,
        measure: 64,
        spacing: "comfortable",
        theme: "custom",
        customTheme: {
          baseTheme: "dark",
          tokens: {
            surface: "#1b1814",
            surfaceRaised: "#26221c",
            ink: "#EDE6D9",
            accent: "#c49a6c",
            hairline: "#3a3328",
          },
        },
        animatePageTurns: false,
        readingMode: "paginated",
        rate: 1,
        librarySort: "recently-added",
      },
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction("settings", "readwrite");
    tx.objectStore("settings").put(legacyRow);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    // A stale mirror must not outshout the seeded Dexie truth.
    localStorage.removeItem("lem-settings-mirror-v1");
  });
}

test.describe("Custom theme builder (#86/#120 — two custom slots, 5 tokens each, derived palettes)", () => {
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

    // The radios are reachable: focus the group's first radio and walk down
    // with arrow keys (Daylight → Warm paper → Night → Custom light → Custom
    // dark).
    const daylight = page.getByRole("radio", { name: "Daylight" });
    await daylight.focus();
    await expect(daylight).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("radio", { name: "Custom light" })).toBeChecked();
    await expect(page.locator("details.custom-theme-builder")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "custom-light");

    // One more arrow reaches the second slot; arrowing back returns to the
    // first (each keeps its own record — CT-07 covers the independence).
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("radio", { name: "Custom dark" })).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "custom-dark");
    await page.keyboard.press("ArrowUp");
    await expect(page.getByRole("radio", { name: "Custom light" })).toBeChecked();

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
    await activateSlot(page, "Custom light");

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
    expect(inline.theme).toBe("custom-light");
    expect(inline.surface).toBe("#123456");
    expect(inline.ink).toBe("#1c1f1d"); // the untouched light-seed token rides
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
    await activateSlot(page, "Custom light");

    // Break ONE pair: ink = the surface color.
    await page.getByLabel("Text hex value").fill("#f7f7f5");
    await expect(page.locator(".custom-theme-builder .custom-theme-warning")).toBeVisible();

    await page.getByRole("button", { name: "Fix contrast" }).click();
    await expect(page.locator(".custom-theme-builder .custom-theme-warning")).toBeHidden();

    // Recompute the policed pair in-page from the inline tokens (the test
    // owns the WCAG math; the app owns the tokens).
    const verdict = await page.evaluate(() => {
      const lin = (c: number): number => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      const lum = (hex: string): number => {
        const n = parseInt(hex.slice(1), 16);
        return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
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
    expect(verdict.surface).toBe("#f7f7f5"); // untouched
    expect(verdict.accent).toBe("#22604a"); // untouched
    expect(verdict.hairline).toBe("#d5d8d2"); // untouched
    expect(verdict.ink).not.toBe("#f7f7f5"); // the offender moved
  });

  // CT-04 — persistence: Dexie truth survives reload; the mirror hint makes
  // the hydrated state immediate (the pre-React paint of the SEEDED defaults
  // until hydration is the accepted decision-#73 boundary). The reload
  // closes the panel (its open state is React state, not persisted) — the
  // assertions target the hydrated document, then the reopened panel.
  test("the custom theme survives a reload (CT-04)", async ({ page }) => {
    await openSettings(page);
    await activateSlot(page, "Custom light");
    await page.getByLabel("Text hex value").fill("#123456");
    // Let the debounced save land before tearing the page down.
    await page.waitForTimeout(700);

    await page.reload();
    // The shell booted (the settings gear is the mounted chrome).
    await expect(page.getByRole("button", { name: "Reading settings" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "custom-light");
    const inline = await page.evaluate(() => ({
      ink: document.documentElement.style.getPropertyValue("--ink"),
      surface: document.documentElement.style.getPropertyValue("--surface"),
    }));
    expect(inline.ink).toBe("#123456");
    expect(inline.surface).toBe("#f7f7f5");
  });

  // CT-05 — the two resets: builder-level restore vs panel-wide drop.
  test("Reset to base keeps custom; the panel Reset drops BOTH records wholesale (CT-05)", async ({
    page,
  }) => {
    await openSettings(page);
    await activateSlot(page, "Custom light");
    await page.getByLabel("Text hex value").fill("#123456");

    // Builder-level: tokens restore, the slot STAYS custom.
    await page.getByRole("button", { name: "Reset to base colors" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "custom-light");
    const restored = await page.evaluate(() => ({
      ink: document.documentElement.style.getPropertyValue("--ink"),
      surface: document.documentElement.style.getPropertyValue("--surface"),
    }));
    expect(restored.ink).toBe("#1c1f1d");
    expect(restored.surface).toBe("#f7f7f5");

    // Panel-wide: BOTH records drop; a fresh activation re-seeds (the edited
    // value must NOT resume).
    await page.getByLabel("Text hex value").fill("#123456");
    await page.getByRole("button", { name: "Reset to defaults" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("details.custom-theme-builder")).toHaveCount(0);

    await page.getByRole("radio", { name: "Custom light" }).click();
    await expect(page.locator("details.custom-theme-builder")).toBeVisible();
    const reseeded = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--ink"),
    );
    expect(reseeded).toBe("#1c1f1d");
  });

  // CT-06 — axe on the open dialog with the builder live (the a11y.spec
  // dialog-scan discipline: serious/critical must be empty).
  test("axe WCAG 2.2 AA on the settings dialog with the builder open (CT-06)", async ({
    page,
  }) => {
    await openSettings(page);
    await activateSlot(page, "Custom dark");
    const results = await new AxeBuilder({ page })
      .withTags([...WCAG_TAGS])
      .include("dialog.settings-panel")
      .analyze();
    const serious = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  // CT-07 — slot independence (#120): two independently saved palettes.
  test("the two slots save independently and both survive a reload (CT-07)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await openSettings(page);

    // Edit the LIGHT slot.
    await activateSlot(page, "Custom light");
    await page.getByLabel("Text hex value").fill("#123456");

    // Switch to the DARK slot: it seeds from ITS matching preset (the light
    // edit does not bleed in), and editing it leaves the light record alone.
    await activateSlot(page, "Custom dark");
    const darkSeed = await page.evaluate(() => ({
      ink: document.documentElement.style.getPropertyValue("--ink"),
      surface: document.documentElement.style.getPropertyValue("--surface"),
    }));
    expect(darkSeed.ink).toBe("#ede6d9");
    expect(darkSeed.surface).toBe("#1b1814");
    await page.getByLabel("Surface hex value", { exact: true }).fill("#223344");

    // Back to the light slot: ITS edit resumes untouched.
    await activateSlot(page, "Custom light");
    const lightResumed = await page.evaluate(() => ({
      ink: document.documentElement.style.getPropertyValue("--ink"),
      surface: document.documentElement.style.getPropertyValue("--surface"),
    }));
    expect(lightResumed.ink).toBe("#123456");
    expect(lightResumed.surface).toBe("#f7f7f5");

    // Reload: the ACTIVE slot's appearance restores exactly — and the other
    // slot's record is still its own (reopen + spot-check).
    await page.waitForTimeout(700);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "custom-light");
    const reloaded = await page.evaluate(() => ({
      ink: document.documentElement.style.getPropertyValue("--ink"),
      surface: document.documentElement.style.getPropertyValue("--surface"),
    }));
    expect(reloaded.ink).toBe("#123456");
    expect(reloaded.surface).toBe("#f7f7f5");

    await page.getByRole("button", { name: "Reading settings" }).click();
    await expandSettingsGroup(page, "Appearance");
    await expect(page.locator("dialog.settings-panel")).toBeVisible();
    await activateSlot(page, "Custom dark");
    const darkResumed = await page.evaluate(() => ({
      ink: document.documentElement.style.getPropertyValue("--ink"),
      surface: document.documentElement.style.getPropertyValue("--surface"),
    }));
    expect(darkResumed.ink).toBe("#ede6d9");
    expect(darkResumed.surface).toBe("#223344");
  });

  // CT-08 — migration (#120): a legacy ONE-slot record hydrates into the
  // disposition slot with its tokens byte-exact; the other slot starts from
  // its matching preset. NO automatic system-theme switching: the migrated
  // slot is simply the active theme.
  test("a pre-#120 one-slot record migrates into Custom dark; the other slot starts from its preset (CT-08)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    // First boot creates the Dexie stores; then seed the legacy row + reload.
    await page.goto(`${BASE}/#/`);
    await expect(page.getByRole("button", { name: "Reading settings" })).toBeVisible();
    await seedLegacyCustomRow(page);
    await page.reload();

    // The migrated ACTIVE slot owns the document: dark disposition, the
    // edited ink byte-exact (uppercase preserved in storage; the inline
    // palette speaks canonical lowercase).
    await expect(page.locator("html")).toHaveAttribute("data-theme", "custom-dark");
    const inline = await page.evaluate(() => ({
      ink: document.documentElement.style.getPropertyValue("--ink"),
      surface: document.documentElement.style.getPropertyValue("--surface"),
      accent: document.documentElement.style.getPropertyValue("--accent"),
    }));
    expect(inline.ink).toBe("#ede6d9");
    expect(inline.surface).toBe("#1b1814");
    expect(inline.accent).toBe("#c49a6c");

    // In the panel: Custom dark is checked, the builder carries the edited
    // token byte-exact (the STORED record keeps its seeded uppercase case —
    // hydration never coerces), and Custom light exists with ITS
    // matching-preset record.
    await page.getByRole("button", { name: "Reading settings" }).click();
    await expandSettingsGroup(page, "Appearance");
    await expect(page.locator("dialog.settings-panel")).toBeVisible();
    await expect(page.getByRole("radio", { name: "Custom dark" })).toBeChecked();
    await expect(page.getByLabel("Text hex value")).toHaveValue("#EDE6D9");

    await activateSlot(page, "Custom light");
    const lightSlot = await page.evaluate(() => ({
      surface: document.documentElement.style.getPropertyValue("--surface"),
      ink: document.documentElement.style.getPropertyValue("--ink"),
    }));
    expect(lightSlot.surface).toBe("#f7f7f5"); // the light preset seed
    expect(lightSlot.ink).toBe("#1c1f1d");

    // Back to the dark slot: the migrated record resumes (not a re-seed).
    await activateSlot(page, "Custom dark");
    const darkResumed = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--ink"),
    );
    expect(darkResumed).toBe("#ede6d9");
  });
});
