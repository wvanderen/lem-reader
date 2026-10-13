import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { BASE } from "./tests/e2e/_base";

// The managed server and test requests must share the same port, including
// the reference runner's override away from the development server.
const serverPort = new URL(BASE).port || (new URL(BASE).protocol === "https:" ? "443" : "80");

// macOS 27 protects the installed Firefox app-data directory. The bundled
// browser still consults it despite its temporary -profile, hanging at launch.
// Keep CoreFoundation's app-data home disposable and separate from the real
// browser; only Firefox inherits this override (Playwright upstream #42768).
const firefoxAppDataHome = join(tmpdir(), "lem-reader-playwright-firefox");
if (process.platform === "darwin") mkdirSync(firefoxAppDataHome, { recursive: true });

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  testIgnore: ["**/calibration/**", "**/perf/**"],
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
  // The same moving-target starvation class the worker cap above records
  // (full-suite load on the reference machine starves a DIFFERENT handful
  // of tail specs per run — two full runs, six distinct one-off sites,
  // zero code-level failures) converges here instead: the CI gate retries
  // each spec once, so a transient contention blip fails the gate only if
  // it reproduces. A real regression fails both attempts. `trace:
  // "on-first-retry"` keeps every absorbed blip auditable (flaky ≠ silent;
  // Playwright reports the count), and local runs stay retry-free so a
  // developer sees the blip raw.
  retries: process.env.CI ? 1 : 0,
  use: { trace: "on-first-retry" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        ...(process.platform === "darwin"
          ? {
              launchOptions: {
                env: { ...process.env, CFFIXED_USER_HOME: firefoxAppDataHome },
              },
            }
          : {}),
      },
    },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
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
      command: `npm run dev -- --port ${serverPort} --strictPort`,
      url: BASE,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
