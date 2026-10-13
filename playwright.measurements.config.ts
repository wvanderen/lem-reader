import { defineConfig, devices } from "@playwright/test";
import functional from "./playwright.config";

// Measurement commands select one harness; ordinary e2e excludes both.
export default defineConfig({
  ...functional,
  testIgnore: [],
  testMatch: /(?:calibration|perf)\.harness\.spec\.ts/,
  projects: [
    ...functional.projects!,
    {
      name: "chromium-throttled-mobile",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /perf\.harness/,
    },
  ],
});
