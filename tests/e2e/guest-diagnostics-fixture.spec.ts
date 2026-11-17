// tests/e2e/guest-diagnostics-fixture.spec.ts
// Issue #279 — the DELIBERATELY FAILING fixture for the browser-diagnostics
// transport proof (docs/specs/lemcentre-browser-diagnostics.md). Its purpose
// is the failure itself: a small, dependency-free spec that fails
// assertively in Chromium, Firefox and WebKit, so the confined guest's
// bounded artifact channel has real per-engine reports, traces and
// screenshots to export.
//
// Scope discipline (mirrors browser-guest-smoke.spec.ts): no seeding
// helpers, no image stubbing, no engine conditionals — the guest's Linux
// baseline must run the exact same spec byte-for-byte. The spec renders the
// reader first so the failure screenshot is meaningful, then fails one
// explicit assertion with a message that names itself.
//
// Where it runs: ONLY through playwright.diagnostics.config.ts (the
// browser-guest-diagnostics lane). The ordinary functional and PR configs
// ignore it exactly like calibration/perf harnesses — a deliberately red
// spec must never attach to a PR gate.
import { test, expect } from "@playwright/test";
import { BASE } from "./_base";

test("deliberately fails so diagnostics are produced", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible({
    timeout: 10_000,
  });
  // This assertion fails ON PURPOSE. If it ever passes, the fixture has
  // rotted (or the wrong suite ran): the diagnostics lane's conclude step
  // treats exit 0 as a fixture failure, not a success.
  expect(
    false,
    "guest-diagnostics fixture: deliberate failure (issue #279) — this spec exists to produce traces and screenshots for the bounded artifact transport",
  ).toBe(true);
});
