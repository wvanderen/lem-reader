// tests/e2e/perf/perf.harness.spec.ts
// ACPT-04 perf measurement harness — measures cold + warm repagination
// wall-clock per (fixture × profile × engine × phase). Mirrors the
// calibration harness (calibration.harness.spec.ts) EXACTLY in structure:
// module-scope accumulator, a single per-project test, afterAll writes a
// temp file. The Node compare script (budget.compare.ts) merges + diffs +
// gates on regression.
//
// Design (RESEARCH §Architecture Pattern 1 + §Don't Hand-Roll + D6-01/D6-02):
//   - Worst-case fixtures (D6-02 / RESEARCH finding 3 — corpus survey by
//     normalized text chars): essay-long-form (text worst case, 2994 chars),
//     list-reference + technical-post (structural worst case). NOT
//     figure-heavy — its figures are stubbed to 1×1 SVG in every test, so
//     its measurement cost is trivial (smallest normalized text at 1475).
//   - Profiles (D6-02): desktop (chromium/firefox/webkit) + throttled-mobile
//     (chromium-only via CDP). Pitfall 5 — CDP CPU/network throttle is
//     chromium-only; firefox/webkit silently ignore it and would produce
//     misleadingly-fast numbers. The throttled-mobile Playwright project is
//     declared chromium-only (devices["Desktop Chrome"]) AND testMatch-
//     scoped to perf specs only, so this harness is the only spec that runs
//     under it (does NOT multiply the full suite — Pitfall 5 acceptance bar).
//   - Cold = first window.__lemLastTrustedConstraints write after page open
//     (page load → first trusted commit). Warm = subsequent write around a
//     viewport re-trigger (the "stable after fonts settle" dimension,
//     PROJECT.md Performance constraint). The DEV hook is the SAME seam
//     stale-drop.spec.ts + last-valid-view.spec.ts observe.
//   - Observation via the pre-existing DEV-only hook in useMeasurement.ts
//     L132-136 (gated import.meta.env.DEV — stripped from vite build). NO
//     timing probes are added to src/ (D3-04 invisible-by-default; RESEARCH
//     §Don't Hand-Roll — the hooks already exist for exactly this purpose).
//   - V7 (mirrors stale-drop.spec.ts L43-44, 115): measurement must NEVER
//     throw to the reader. pageerror events are collected and asserted empty.
//
// Output: per-project temp file at .perf-tmp/<engine>.<profile>.json. The
// filename is engine + profile (NOT browserName) so chromium.desktop and
// chromium.throttled-mobile never collide. budget.compare.ts merges.

import { test, expect, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = "http://localhost:5173";
const PIXEL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
const TMP_DIR = resolve(process.cwd(), ".perf-tmp");

// D6-02 worst-case fixtures (RESEARCH finding 3). The plan locks the text
// worst case (essay-long-form) + the structural worst case (list-reference
// + technical-post). NOT figure-heavy (stubbed to 1×1 SVG in tests).
const PERF_FIXTURES = ["essay-long-form", "list-reference", "technical-post"] as const;

// Samples per cell — enough to make p95 meaningful without flaking the
// harness. 5 cold samples = 5 page reloads; 5 warm samples = 5 resize
// triggers within a single load. Total per project = 3 × (5 + 5) = 30 cycles.
const SAMPLES_PER_CELL = 5;

// D6-02 throttled-mobile preset (RESEARCH Open Question 1 — Chrome DevTools
// "Low-end mobile" default). 4× CPU slowdown + Slow 3G network. Applied via
// CDP only when running under the chromium-throttled-mobile project.
const THROTTLE_CPU_RATE = 4;
const THROTTLE_LATENCY_MS = 400;
const THROTTLE_DOWNLOAD_BPS = 62_500; // 500 Kbps → bytes/sec
const THROTTLE_UPLOAD_BPS = 62_500;

/** Per-(fixture × profile × engine × phase) sample. */
export interface PerfSample {
  fixture: string;
  profile: "desktop" | "throttled-mobile";
  engine: string;
  phase: "cold" | "warm";
  wallClockMs: number;
}

/** Per-worker accumulator (mirrors calibration harness's engineResults). */
const projectResults: PerfSample[] = [];

/**
 * Apply chromium-only CDP CPU + network throttle (D6-02). Pitfall 5: CDP
 * throttle is chromium-only; firefox/webkit silently ignore it. The
 * throttled-mobile Playwright project is chromium-only (devices["Desktop
 * Chrome"] + testMatch scope), so this branch only fires under that project
 * name. Returns the CDPSession so the caller can detach it after the cell.
 * No-op (returns null) under desktop projects.
 */
async function applyThrottleIfMobile(
  page: Page,
  projectName: string,
): Promise<import("@playwright/test").CDPSession | null> {
  if (projectName !== "chromium-throttled-mobile") return null;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE_CPU_RATE });
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: THROTTLE_LATENCY_MS,
    downloadThroughput: THROTTLE_DOWNLOAD_BPS,
    uploadThroughput: THROTTLE_UPLOAD_BPS,
  });
  return cdp;
}

/** Read the DEV-only trusted-constraints hook (useMeasurement.ts L132-136). */
async function readTrustedConstraints(
  page: Page,
): Promise<{ size: number; viewportWidthPx: number } | null> {
  return await page.evaluate(() => {
    const c = (window as unknown as Record<string, unknown>).__lemLastTrustedConstraints as
      | { size: number; viewportWidthPx: number }
      | undefined;
    return c ?? null;
  });
}

/**
 * Measure cold repagination: page open → first trusted commit. Returns one
 * wall-clock ms per sample (node-side Date.now delta — captures full cold
 * cost: page load + fonts.ready + the measurement pass that survives the
 * font gate + epoch guard). Reloads the page SAMPLES_PER_CELL times so p95
 * has a real distribution.
 */
async function measureColdSamples(page: Page, fixture: string): Promise<number[]> {
  const samples: number[] = [];
  for (let i = 0; i < SAMPLES_PER_CELL; i++) {
    // Each page.goto reloads → fresh window → hook starts undefined, so
    // waitForFunction reliably catches THIS load's first trusted commit.
    const t0 = Date.now();
    await page.goto(`${BASE}/#/article/${fixture}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForFunction(
      () =>
        (window as unknown as Record<string, unknown>).__lemLastTrustedConstraints !==
        undefined,
      undefined,
      { timeout: 15_000 },
    );
    samples.push(Date.now() - t0);
  }
  return samples;
}

/**
 * Measure warm repagination: a typography re-trigger → next trusted commit
 * reflecting the new size. PROJECT.md Performance constraint — "stable
 * after fonts settle" — the warm budget is the dimension that proves the
 * reader never sees jank when they resize or change typography.
 *
 * Trigger choice (Rule 1 — robustness): a typography size change via the
 * SettingsPanel slider is the proven warm trigger (stale-drop.spec.ts L86-
 * 98 drives the same slider through ArrowUp presses). It is unambiguous:
 * each press changes the `size` constraint by one step (SIZE_STEPS =
 * [18,20,22,24]), so the predicate waits for `constraints.size !== preSize`
 * — a guaranteed, geometry-independent signal that a FRESH commit landed.
 * Viewport resize was considered but rejected: above the ~641px measure cap
 * the article width doesn't change (no observable commit signal), and below
 * it the engine's re-commit timing after rapid cold page.gotos was flaky
 * across engines. The typography path mirrors the exact substrate
 * stale-drop.spec.ts proves.
 *
 * Adaptive direction: pick Up if the current size is below the range
 * midpoint (22), Down otherwise. This guarantees every press produces a
 * size change regardless of the starting size (handles the max-24 / min-18
 * boundaries).
 */
async function measureWarmSamples(page: Page): Promise<number[]> {
  const samples: number[] = [];

  // Open the settings panel to access the size slider (mirrors stale-
  // drop.spec.ts L83-86).
  await page.getByRole("button", { name: "Reading settings" }).click();
  await expect(
    page.getByRole("heading", { name: "Reading settings", level: 2 }),
  ).toBeVisible();
  const slider = page.getByRole("slider", { name: "Text size" });
  await slider.focus();

  for (let i = 0; i < SAMPLES_PER_CELL; i++) {
    const pre = await readTrustedConstraints(page);
    const preSize = pre?.size ?? 18;
    // Adaptive direction — guaranteed to change the size from any starting
    // value in [18, 24]. Below midpoint (22) → Up; at/above → Down.
    const dir: "ArrowUp" | "ArrowDown" = preSize < 22 ? "ArrowUp" : "ArrowDown";
    const t0 = Date.now();
    await slider.press(dir);
    // Wait for the committed size constraint to differ from the pre-press
    // value — unambiguous proof a fresh trusted commit landed (the hook
    // only updates on a result that survived the font gate + epoch guard).
    await page.waitForFunction(
      (preS: number) => {
        const c = (window as unknown as Record<string, unknown>).__lemLastTrustedConstraints as
          | { size: number }
          | undefined;
        return c !== undefined && c.size !== preS;
      },
      preSize,
      { timeout: 15_000 },
    );
    samples.push(Date.now() - t0);
  }

  // Close the settings panel to leave a clean state for the next fixture.
  await page.keyboard.press("Escape");
  return samples;
}

test.beforeEach(async ({ page }) => {
  // Image-stub + IndexedDB-wipe harness — mirrors every e2e spec
  // (open-every-fixture.spec.ts:22-26 + annotations/_fixtures.ts:44-57).
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

test(
  `perf: measure cold + warm repagination (worst-case fixtures × profile)`,
  async ({ page, browserName }) => {
    // Generous timeout: 3 fixtures × (5 cold + 5 warm) = 30 measurement
    // cycles per project, plus the throttled-mobile project adds CPU +
    // network latency per cycle. CI machines vary.
    test.setTimeout(300_000);

    const projectName = test.info().project.name;
    // The profile is derived from the project name: chromium-throttled-
    // mobile → throttled-mobile; chromium/firefox/webkit → desktop.
    const profile: "desktop" | "throttled-mobile" =
      projectName === "chromium-throttled-mobile" ? "throttled-mobile" : "desktop";

    // V7 — measurement must NEVER throw to the reader. Collect pageerrors;
    // assert empty at the end (mirrors stale-drop.spec.ts L43-44, 115).
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    for (const fixture of PERF_FIXTURES) {
      // Reset to the default desktop viewport before each fixture so cold
      // runs at a consistent geometry AND warm starts from the measure-
      // capped article width (the previous fixture's warm cycle may have
      // left the viewport at a sub-measure width, which would make the
      // next fixture's warm iteration 0 a no-op).
      await page.setViewportSize({ width: 1280, height: 720 });

      // Apply throttle INSIDE the per-fixture loop so each cold measurement
      // runs under the configured profile. (Throttle is chromium-only; this
      // branch is a no-op under desktop projects.)
      const cdp = await applyThrottleIfMobile(page, projectName);

      // Cold: SAMPLES_PER_CELL page reloads → first trusted commit each.
      const coldSamples = await measureColdSamples(page, fixture);
      for (const wallClockMs of coldSamples) {
        projectResults.push({ fixture, profile, engine: browserName, phase: "cold", wallClockMs });
      }

      // Warm: run SAMPLES_PER_CELL sub-measure resize re-triggers. The
      // hook must be non-null here (measureColdSamples waited for it);
      // guard defensively anyway. Sub-measure widths are required because
      // above the ~550px measure cap the article width doesn't change on
      // viewport resize (see measureWarmSamples comment).
      const anchor = await readTrustedConstraints(page);
      if (anchor) {
        const warmSamples = await measureWarmSamples(page);
        for (const wallClockMs of warmSamples) {
          projectResults.push({ fixture, profile, engine: browserName, phase: "warm", wallClockMs });
        }
      }

      if (cdp) {
        try {
          await cdp.detach();
        } catch {
          // ignore — page is navigating to the next fixture anyway
        }
      }
    }

    expect(
      projectResults.length,
      `expected at least one sample for ${projectName}`,
    ).toBeGreaterThan(0);
    expect(pageErrors, "no uncaught errors during measurement").toEqual([]);
  },
);

test.afterAll(async () => {
  // afterAll runs once per worker; write this project's results to a per-
  // project temp file the compare script merges. The filename is engine +
  // profile (NOT browserName) so chromium.desktop and chromium.throttled-
  // mobile never collide — Pitfall 5 demands distinct profiles produce
  // distinct artifacts. (Each worker ran exactly one project, so all samples
  // share the same engine + profile — derive from projectResults[0].)
  if (projectResults.length === 0) return;
  const first = projectResults[0]!;
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(
    resolve(TMP_DIR, `${first.engine}.${first.profile}.json`),
    JSON.stringify(projectResults, null, 2),
    "utf8",
  );
});

export { PERF_FIXTURES };
