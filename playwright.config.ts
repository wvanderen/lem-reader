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
  // Phase 7 (07-06 HYBRID CONTINGENCY + 07-07 Rule 3 blocker fix): the
  // webServer is now a SINGLE entry — the Vite dev server on :5173. The
  // Vite Node dev middleware (vite.config.ts `lem-ingest-dev-middleware`
  // plugin → viteIngestMiddleware) serves POST /api/ingest natively in Node
  // (jsdom/DOMPurify/Readability work in Node), so the SSRF matrix + happy-
  // path e2e target :5173 directly. The previous `wrangler pages dev --port
  // 8788` second entry was REMOVED because wrangler's workerd runtime
  // crashes at startup on the `undici` transitive dep from /functions/*
  // (`ReferenceError: MessagePort is not defined` — the documented 07-01
  // spike verdict). The 07-01 spike regression spec
  // (tests/unit/server/spike-jsdom-workers.spec.ts) skips gracefully when
  // workerd is unreachable, so the regression-lock discipline is preserved
  // (the verdict is locked in 07-01-SUMMARY regardless of the spec's
  // runtime reachability). The functions/api/ingest.ts Pages Function is
  // preserved as the production-future shape (D7-05) per the 07-06
  // HYBRID CONTINGENCY adaptation.
  webServer: [
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
