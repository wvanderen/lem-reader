import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  use: { trace: "on-first-retry" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    // ACPT-04 (D6-02): chromium-only throttled-mobile profile. CDP CPU +
    // network throttle is chromium-only (Pitfall 5 — firefox/webkit silently
    // ignore it → misleadingly-fast numbers), so this project uses
    // devices["Desktop Chrome"] (chromium channel) and the perf harness
    // applies the CDP throttle inside the test when it detects this project
    // name. testMatch confines this project to the perf harness ONLY, so
    // `npm run test` does NOT multiply the full e2e suite under throttle
    // (the throttled project runs exactly one spec — perf.harness — at
    // ~150s; the full suite stays on the 3 desktop projects above).
    {
      name: "chromium-throttled-mobile",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /perf\.harness/,
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
