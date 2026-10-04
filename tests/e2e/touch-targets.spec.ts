import { expandSettingsGroup } from "./settings";
// tests/e2e/touch-targets.spec.ts
// A11Y-07 — every interactive control in the new chrome has a ≥ 44 × 44 px hit
// area (UI-SPEC §Spacing exceptions; iOS HIG / WCAG 2.5.5 target-size). The
// radio hit area is the LABEL row, NOT the 13px glyph — the test asserts the
// label/row box via .boundingBox() on the label, not the input. The gear,
// close ×, ranges (44px tall via min-height: var(--touch)), and Reset button
// are also asserted.
import { test, expect } from "@playwright/test";
import { assertEdgeInvariant } from "./_edge-invariant";
// Plan 21-06 (D21-14 / ACPT-08) — the four-destination matrix cells below
// (additive import; the cells are additive to the reader cells above).
import {
  DESTINATIONS,
  assertDestinationInvariant,
  openEdgeDestination,
  type EdgeDestination,
} from "./_edge-invariant";
import { FIXTURES, wipeDatabase, openArticle } from "./annotations/_fixtures";
import { BASE } from "./_base";

const FIRST_FIXTURE = "essay-long-form";

const MIN = 44;

async function bbox(page: import("@playwright/test").Locator) {
  const box = await page.boundingBox();
  if (!box) throw new Error("element has no bounding box (not visible?)");
  // Firefox can report a CSS 44px height as 43.999999 after scrolling.
  // Normalize floating-point noise without relaxing the 44px contract.
  return {
    ...box,
    width: Math.round(box.width * 1000) / 1000,
    height: Math.round(box.height * 1000) / 1000,
  };
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
    await expandSettingsGroup(page, "Appearance");
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
    // {name, value} pairs: accessible names and input values part ways for
    // "Dyslexia-friendly" (value dyslexic) and the #120 custom slots
    // (custom-light / custom-dark), and exact matching keeps "Light" from
    // also resolving "Custom light" (strict-mode).
    for (const { name, value } of [
      // Typeface
      { name: "Serif", value: "serif" },
      { name: "Sans", value: "sans" },
      { name: "Dyslexia-friendly", value: "dyslexic" },
      // Spacing
      { name: "Compact", value: "compact" },
      { name: "Comfortable", value: "comfortable" },
      { name: "Spacious", value: "spacious" },
      // Theme
      { name: "Daylight", value: "light" },
      { name: "Warm paper", value: "sepia" },
      { name: "Night", value: "dark" },
      { name: "Trans pride", value: "trans-light" },
      { name: "Bi pride", value: "bi-dark" },
      { name: "Custom light", value: "custom-light" },
      { name: "Custom dark", value: "custom-dark" },
    ]) {
      const radio = page.getByRole("radio", { name, exact: true });
      // The label row carries the hit area (the input itself is the 13px
      // glyph); the value pins the row even when names share substrings.
      const lbl = page.locator(
        `label.settings-row:has(input[type='radio'][value='${value}'])`,
      );
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

  // ─────────────────────────────────────────────────────────────────────
  // Plan 21-06 (D21-14 / ACPT-08): destination cells. The four-destination
  // matrix extends this spec's A11Y-07 target-size contract to Library,
  // the open Add dialog, and Highlights: the shared invariant
  // (assertDestinationInvariant — (b) required functions + (c) no overflow)
  // PLUS this spec's own idiom — every canonical destination control's
  // bounding box meets the 44px --touch minimum. Height is the load-
  // bearing assertion (min-height: var(--touch) in app.css — the ranges
  // precedent above); width is additionally asserted where it is
  // structurally guaranteed (full-width rows / inline-flex buttons with
  // padding-inline: var(--space-md)). The Add-dialog radio hit area is the
  // label row (.add-source-row), never the 13px input — the panel radio
  // precedent above. Strengthen-only — additive cells; the reader corpus
  // cells above stay byte-stable (D6-12).
  const MEASURED: Record<
    EdgeDestination,
    Array<{ desc: string; locator: (page: import("@playwright/test").Page) => import("@playwright/test").Locator; width?: boolean }>
  > = {
    library: [
      {
        desc: "Add to Library trigger",
        locator: (page) => page.getByRole("button", { name: "Add to Library" }),
        width: true,
      },
      {
        desc: "All view link",
        locator: (page) => page.getByRole("link", { name: /^All \(\d+\)$/ }),
      },
      {
        desc: "library searchbox",
        locator: (page) =>
          page.getByRole("searchbox", { name: "Search your library" }),
      },
      {
        desc: "tag filter chip",
        locator: (page) => page.locator(".tag-filter .tag-chip").first(),
        width: true,
      },
      {
        desc: "shell-nav Library link",
        locator: (page) =>
          page
            .getByRole("navigation", { name: "Primary" })
            .getByRole("link", { name: "Library" }),
      },
      {
        desc: "shell-nav Highlights link",
        locator: (page) =>
          page
            .getByRole("navigation", { name: "Primary" })
            .getByRole("link", { name: "Highlights" }),
      },
    ],
    discover: [
      {
        desc: "feed URL input",
        locator: (page) =>
          page.getByRole("textbox", { name: "Subscribe to a feed" }),
      },
      {
        desc: "Subscribe button",
        locator: (page) => page.getByRole("button", { name: "Subscribe" }),
        width: true,
      },
      {
        desc: "shell-nav Library link",
        locator: (page) =>
          page
            .getByRole("navigation", { name: "Primary" })
            .getByRole("link", { name: "Library" }),
      },
      {
        desc: "shell-nav Highlights link",
        locator: (page) =>
          page
            .getByRole("navigation", { name: "Primary" })
            .getByRole("link", { name: "Highlights" }),
      },
    ],
    highlights: [
      {
        desc: "article filter combobox",
        locator: (page) => page.getByRole("combobox", { name: "Article" }),
      },
      {
        desc: "anchor-confidence filter combobox",
        locator: (page) =>
          page.getByRole("combobox", { name: "Anchor confidence" }),
      },
      {
        desc: "sort select",
        locator: (page) => page.getByRole("combobox", { name: "Sort" }),
      },
      {
        desc: "row jump link",
        locator: (page) =>
          page.getByRole("link", { name: /^Go to highlight:/ }).first(),
        width: true,
      },
    ],
    "add-dialog": [
      {
        desc: "Web address radio label row",
        locator: (page) =>
          page.locator("label.add-source-row", { hasText: "Web address" }),
        width: true,
      },
      {
        desc: "Paste text radio label row",
        locator: (page) =>
          page.locator("label.add-source-row", { hasText: "Paste text" }),
        width: true,
      },
      {
        desc: "Upload file radio label row",
        locator: (page) =>
          page.locator("label.add-source-row", { hasText: "Upload file" }),
        width: true,
      },
      {
        desc: "Cancel button",
        locator: (page) =>
          page.getByRole("button", { name: "Cancel", exact: true }),
        width: true,
      },
    ],
  };

  for (const destination of DESTINATIONS) {
    test(`destination invariant + 44px touch targets hold @ ${destination} (D21-14)`, async ({
      page,
    }) => {
      await openEdgeDestination(page, destination);
      await assertDestinationInvariant(page, {
        destination,
        condition: "touch-targets",
      });

      // The A11Y-07 measurement at the destination — this spec's own
      // idiom (failures collected, then one assertion names them all).
      // Sub-pixel tolerance: getBoundingClientRect can report the token
      // minus a rendering fraction (firefox measured 43.99999px on an
      // exactly-44px min-height row) — the 21-02 sub-pixel-precise
      // readBoxes discipline tolerates ±0.5px; the existing cells above
      // keep their exact bar byte-stable.
      const SUB_PIXEL = 0.5;
      const failures: string[] = [];
      for (const { desc, locator, width } of MEASURED[destination]) {
        const b = await bbox(locator(page));
        if (b.height < MIN - SUB_PIXEL) {
          failures.push(`${desc}: height ${b.height}px < ${MIN}px`);
        }
        if (width && b.width < MIN - SUB_PIXEL) {
          failures.push(`${desc}: width ${b.width}px < ${MIN}px`);
        }
      }
      expect(
        failures,
        `destination controls failing the 44×44px touch-target contract on ${destination}:\n${failures.join("\n")}`,
      ).toEqual([]);
    });
  }
});
