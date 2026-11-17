import { defineConfig } from "@playwright/test";
import functional from "./playwright.config";

// Issue #279 — the config for the browser-guest diagnostics lane ONLY: the
// deliberately-failing fixture (tests/e2e/guest-diagnostics-fixture.spec.ts)
// plus everything the functional config already provides unchanged — the
// same webServer + BASE confinement, the same retry/trace discipline
// (`retries: CI ? 1 : 0`, `trace: "on-first-retry"`) that produces the
// trace.zip + failure screenshot the bounded artifact channel exports, and
// the default output roots (test-results/, playwright-report/) the guest
// packer selects. Ordinary e2e ignores this spec (see playwright.config.ts
// testIgnore, the calibration/perf precedent), so a deliberately red spec
// never attaches to a PR gate; the guest-side launcher contract
// (docs/specs/lemcentre-browser-diagnostics.md) runs exactly this config
// with CI=true so the retry+trace discipline is active inside the guest.
export default defineConfig({
  ...functional,
  testIgnore: [],
  testMatch: /guest-diagnostics-fixture\.spec\.ts/,
  // The lane's whole point is exported diagnostics, so failure screenshots
  // are captured explicitly here (Playwright's default is `off`; the
  // functional/PR gates' behavior is unchanged). Traces come from the
  // inherited on-first-retry discipline.
  use: { ...functional.use, screenshot: "only-on-failure" },
});
