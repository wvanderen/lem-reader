import { defineConfig, devices } from "@playwright/test";
import functional from "./playwright.config";

// Measurement commands select one harness; ordinary e2e excludes both.
export default defineConfig({
  ...functional,
  testIgnore: [],
  testMatch: /(?:calibration|perf)\.harness\.spec\.ts/,
  // Pinned: measurements must run under the same concurrency wherever they
  // execute, so a quiet box's load-aware functional cap (issue #185) never
  // changes calibration/perf conditions. Comparisons stay like-for-like
  // with the recorded thresholds.
  workers: 3,
  projects: [
    ...functional.projects!,
    {
      name: "chromium-throttled-mobile",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /perf\.harness/,
    },
  ],
});
