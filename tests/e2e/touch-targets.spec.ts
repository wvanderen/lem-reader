// tests/e2e/touch-targets.spec.ts
// A11Y-07 — every interactive control in the new chrome has a ≥ 44 × 44 px hit
// area (UI-SPEC §Spacing exceptions; iOS HIG / WCAG 2.5.5 target-size). The
// radio hit area is the LABEL row, NOT the 13px glyph — the test asserts the
// label/row box via .boundingBox() on the label, not the input. The gear,
// close ×, ranges (44px tall via min-height: var(--touch)), and Reset button
// are also asserted.
import { test, expect } from "@playwright/test";
import { assertEdgeInvariant } from "./_edge-invariant";
import { FIXTURES, wipeDatabase, openArticle } from "./annotations/_fixtures";

const BASE = "http://localhost:5173";
const FIRST_FIXTURE = "essay-long-form";

const MIN = 44;

async function bbox(page: import("@playwright/test").Locator) {
  const box = await page.boundingBox();
  if (!box) throw new Error("element has no bounding box (not visible?)");
  return box;
}

test.describe("Touch targets ≥ 44×44px (A11Y-07)", () => {
  test.beforeEach(async ({ page }) => {
    // Deterministic first-run state + image stub (the shared e2e harness
    // discipline — annotations/_fixtures.ts wipeDatabase; 06-PATTERNS §Shared
    // Patterns). Plan 06-05 audit (D6-12): every edge spec uses the same
    // harness baseline. Benign to the existing touch-target sizing
    // assertions below.
    await wipeDatabase(page);
  });

  test("gear button meets 44×44px before the panel opens", async ({ page }) => {
    await page.goto(`${BASE}/#/article/${FIRST_FIXTURE}`);
    const gear = page.getByRole("button", { name: "Reading settings" });
    const box = await bbox(gear);
    expect(box.width, `gear width ${box.width}px < ${MIN}px`).toBeGreaterThanOrEqual(
      MIN,
    );
    expect(box.height, `gear height ${box.height}px < ${MIN}px`).toBeGreaterThanOrEqual(
      MIN,
    );
  });

  test("every control inside the open panel meets 44×44px", async ({ page }) => {
    await page.goto(`${BASE}/#/article/${FIRST_FIXTURE}`);
    await page.getByRole("button", { name: "Reading settings" }).click();
    await expect(page.locator("dialog.settings-panel")).toBeVisible();

    const failures: string[] = [];

    // Close × button.
    const close = page.getByRole("button", { name: "Close reading settings" });
    const closeBox = await bbox(close);
    if (closeBox.width < MIN || closeBox.height < MIN) {
      failures.push(
        `close ×: ${closeBox.width}×${closeBox.height}px`,
      );
    }

    // Reset button.
    const reset = page.getByRole("button", { name: "Reset to defaults" });
    const resetBox = await bbox(reset);
    if (resetBox.width < MIN || resetBox.height < MIN) {
      failures.push(`Reset: ${resetBox.width}×${resetBox.height}px`);
    }

    // The two ranges (size + reading width) — these have min-height: var(--touch)
    // in app.css so their bounding box should be ≥ 44px tall.
    const sizeRange = page.getByRole("slider", { name: "Text size" });
    const measureRange = page.getByRole("slider", { name: "Reading width" });
    for (const [label, loc] of [
      ["size range", sizeRange],
      ["measure range", measureRange],
    ] as const) {
      const b = await bbox(loc);
      // Width is naturally large (full panel width). Height is the load-bearing
      // assertion (min-height: var(--touch) in app.css).
      if (b.height < MIN) {
        failures.push(`${label}: height ${b.height}px < ${MIN}px`);
      }
    }

    // Every radio option. The hit area is the LABEL row (.settings-row), not
    // the 13px glyph — assert the label box, not input.boundingBox.
    for (const name of [
      // Typeface
      "Serif",
      "Sans",
      "Dyslexia-friendly",
      // Spacing
      "Compact",
      "Comfortable",
      "Spacious",
      // Theme
      "Sepia",
      "Light",
      "Dark",
    ]) {
      const radio = page.getByRole("radio", { name });
      // RTL queries the <input>, but its label row carries the hit area.
      // Find the enclosing label via XPath from the input.
      const label = page.locator(`label:has(input[type='radio'][value='${name.toLowerCase()}'])`);
      // For "Dyslexia-friendly" the value is 'dyslexic', not the label text.
      // Easier: find the label by its text content (the <span> inside it).
      const labelByText = page.locator(`label.settings-row`, {
        hasText: name,
      });
      const lbl = (await labelByText.count()) > 0 ? labelByText : label;
      const b = await bbox(lbl.first());
      if (b.height < MIN) {
        failures.push(`radio '${name}' label row: height ${b.height}px < ${MIN}px`);
      }
      if (b.width < MIN) {
        failures.push(`radio '${name}' label row: width ${b.width}px < ${MIN}px`);
      }
      // Touch the radio just to be sure the input itself is reachable.
      await radio.isEnabled();
    }

    expect(
      failures,
      `controls failing the 44×44px touch-target contract:\n${failures.join("\n")}`,
    ).toEqual([]);
  });

  // ───────────────────────────────────────────────────────────────────────
  // D6-09 shared edge-condition invariant (Plan 06-05 audit, D6-12). Under
  // the touch-target contract the SAME bar holds as every other edge
  // condition: (a) full content reachable via keyboard in BOTH reading
  // modes, (b) required functions reachable (the existing sizing test
  // above proves the gear + controls are ≥44×44 — the A11Y-07 substrate;
  // this adds the consolidated reachability check), (c) no layout overflow
  // clips content (WCAG 1.4.10). Applied uniformly across the 6-fixture
  // corpus so acceptance means the same thing everywhere.
  // Strengthen-only — no existing assertion removed (D6-12).
  for (const fixture of FIXTURES) {
    test(`shared invariant holds under touch-targets @ ${fixture} (D6-09)`, async ({
      page,
    }) => {
      await openArticle(page, fixture);
      await assertEdgeInvariant(page, {
        fixture,
        condition: "touch-targets",
      });
    });
  }
});
