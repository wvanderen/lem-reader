// tests/e2e/reduced-motion.spec.ts
// A11Y-06 — under prefers-reduced-motion, NO required animation. The global
// @media (prefers-reduced-motion: reduce) gate in app.css (lines 43-52) sets
// transition/animation to none !important. Phase 2 ships NO transitions on the
// settings panel or its controls, so the gate is trivially satisfied. This
// test guards against a regression that adds a transition.
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5173";
const FIRST_FIXTURE = "essay-long-form";

test.describe("Reduced motion (A11Y-06)", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("the settings panel has no entrance transition", async ({ page }) => {
    await page.goto(`${BASE}/#/article/${FIRST_FIXTURE}`);
    await page.getByRole("button", { name: "Reading settings" }).click();
    const dlg = page.locator("dialog.settings-panel");
    await expect(dlg).toBeVisible();

    // Computed transition-duration on the panel itself resolves to 0s under the
    // global gate (transition: none !important). The gate wins over any
    // per-element transition the panel might declare.
    const td = await dlg.evaluate(
      (el) => window.getComputedStyle(el).transitionDuration,
    );
    // Accept "0s" or "0ms" (engines vary slightly).
    expect(
      td === "0s" || td === "0ms",
      `panel transition-duration under reduced-motion should be 0s, got "${td}"`,
    ).toBe(true);
  });

  test("panel controls (radio, range, reset) declare no transition", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIRST_FIXTURE}`);
    await page.getByRole("button", { name: "Reading settings" }).click();
    const dlg = page.locator("dialog.settings-panel");
    await expect(dlg).toBeVisible();

    // Sample a representative cross-section of controls.
    const samples = [
      "input[type='radio']",
      "input[type='range']",
      "button.settings-reset",
      "button.settings-close",
    ];
    for (const sel of samples) {
      const td = await page
        .locator(`dialog.settings-panel ${sel}`)
        .first()
        .evaluate((el) => window.getComputedStyle(el).transitionDuration)
        .catch(() => "missing-element");
      // Tolerate "missing-element" if a sample didn't match — the panel must
      // exist but we don't need every selector to be present.
      if (td !== "missing-element") {
        expect(
          td === "0s" || td === "0ms",
          `${sel} transition-duration under reduced-motion should be 0s, got "${td}"`,
        ).toBe(true);
      }
    }
  });

  test("opening the panel does not animate (the gate wins)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIRST_FIXTURE}`);
    // The animation-name on every element is "none" under the gate.
    const before = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll("*"));
      return all.some(
        (el) => window.getComputedStyle(el).animationName !== "none",
      );
    });
    expect(before, "no element should declare an animation name under reduced-motion").toBe(
      false,
    );

    await page.getByRole("button", { name: "Reading settings" }).click();
    await expect(page.locator("dialog.settings-panel")).toBeVisible();

    const after = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll("*"));
      return all.some(
        (el) => window.getComputedStyle(el).animationName !== "none",
      );
    });
    expect(
      after,
      "opening the panel should not introduce any animation under reduced-motion",
    ).toBe(false);
  });
});
