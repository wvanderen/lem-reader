import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // 13-10 honest-gate repair (the 09-07 starvation class, converged): the
  // default worker count (cores/2 = 5 on the 10-core reference machine)
  // oversubscribes the CPU under ordinary multi-user load (observed load
  // avg 6–10), and late-suite webkit contexts starved on the single Vite
  // dev server's module fetches — page.goto exceeded the 30s test budget
  // on a DIFFERENT moving set of tail specs each full-suite run (two runs,
  // 5 webkit goto-timeouts each, zero code-level failures). Per-spec
  // budget raises cannot converge against a moving target; the scheduling
  // cap removes the oversubscription at the source. The perf harness's
  // ACPT-04 ceilings are UPPER bounds — reduced contention keeps them
  // green (never tighter). Assertions, engines, and spec selection are
  // byte-unchanged; only concurrency drops (≈7m → ≈10m full suite).
  workers: 3,
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
