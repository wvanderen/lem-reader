// tests/e2e/pagination/mode-switch-anchor.spec.ts
// PAGE-01 — Reader can explicitly switch the same article between semantic
// paginated and scrolling modes while remaining at the same logical passage.
//
// SCENARIO: Reader is mid-article, toggles ModeToggle (header button + `M`
// shortcut), and the new mode renders at the same D-05 grapheme offset
// (D4-10 top-of-view→grapheme→target anchor). Repeated toggles do not drift
// the anchor.
//
// SCAFFOLD — sentinel assertion only (harness wires up + h1 visible). Real
// assertions (mode-aware render branch + anchor round-trip + focus
// restoration) are filled by Plan 04-04 (dual-mode navigation).
//
// Harness copied verbatim from tests/e2e/measurement/stale-drop.spec.ts:
//   - PIXEL_SVG image-stub (figure load does not race pagination measurement)
//   - IndexedDB deleteDatabase wipe (deterministic first-run state)
//   - hash-route navigation + h1-visible sentinel
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5173";
const FIXTURE = "essay-long-form";
const PIXEL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';

test.beforeEach(async ({ page }) => {
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: PIXEL_SVG }),
  );
  await page.goto(`${BASE}/`);
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("lem-reader");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
});

test.describe("PAGE-01 mode-switch anchor (04-04)", () => {
  test("scaffold: harness wires up + article h1 renders", async ({ page }) => {
    // Plan 04-04 fills: toggle ModeToggle, assert mode flips + anchor round-trips
    // through the same D-05 offset across paginated ↔ scrolling.
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
