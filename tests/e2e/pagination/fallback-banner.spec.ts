// tests/e2e/pagination/fallback-banner.spec.ts
// PAGE-09 — When pagination fails (dom-fallback diagnostic), a quiet banner
// appears with the UI-SPEC §Copywriting text and the reader lands at the
// same passage in scrolling mode.
//
// SCENARIO: The engine emits dom-fallback (oversize, page-ceiling, or
// unsplittable-block-overflow). PaginationFallbackBanner subscribes to
// DiagnosticBus and renders the banner; the session-mode flips to scrolling
// at the same D-05 offset; the persisted readingMode preference is NOT
// overwritten (D4-12 — session-only flip).
//
// SCENARIO: Dismissing the banner is session-scoped (resets on reload per
// D2-13, mirroring StorageBanner discipline).
//
// SCAFFOLD — sentinel assertion only. Real assertions exercise the banner
// visibility + session-mode flip + persistence discipline. Filled by
// Plan 04-05.
//
// Harness copied verbatim from tests/e2e/measurement/stale-drop.spec.ts.
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

test.describe("PAGE-09 pagination fallback banner (04-05)", () => {
  test("scaffold: harness wires up + article h1 renders", async ({ page }) => {
    // Plan 04-05 fills: trigger dom-fallback, assert PaginationFallbackBanner
    // renders with UI-SPEC copy + session-mode flips to scrolling at the same
    // offset + persisted readingMode unchanged + dismiss is session-scoped.
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
