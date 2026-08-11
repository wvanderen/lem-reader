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
  // Phase 7: `webServer` is an ARRAY so a real workerd runtime
  // (`wrangler pages dev`) boots alongside the v1.0 Vite SPA dev server. The
  // ingestion e2e project (tests/e2e/ingestion/**) targets the wrangler port
  // (:8788) — the only honest way to exercise fetch + DNS + redirect behavior
  // for the SSRF matrix (D7-06); reader-flow tests target :5173 as before.
  // The jsdom-on-Workers spike (07-01 Task 2) reuses this wrangler process.
  webServer: [
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "npx wrangler pages dev --port 8788",
      url: "http://localhost:8788",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      cwd: ".",
    },
  ],
});
