// tests/e2e/measurement/longtask-smoke.spec.ts
// 260820-beo long-task tripwire — a PROPORTIONATE regression guard for the
// time-sliced measurement pass. A PerformanceObserver watches "longtask"
// entries across a cold open + one deterministic typography warm re-trigger
// of essay-long-form (the text-worst-case fixture); every entry must stay
// ≤ 150ms and the page must collect zero uncaught errors (V7 — measurement
// must never throw to the reader; mirrors stale-drop.spec.ts L43-44, 115).
//
// Honest scope (Pitfall 5 project honesty, mirroring perf.harness.spec.ts):
//   - The 3k-char corpus fixtures CANNOT reproduce the ~100k-grapheme
//     article that motivated the fix — this spec is a tripwire against a
//     regression back to a SYNCHRONOUS full pass (which even on this small
//     fixture would surface as longtasks), not a substitute for the
//     blocking human smoke on the real long article (quick-260820-beo
//     Task 4).
//   - The 150ms bound is a low-flake tripwire, NOT the ~50ms aspirational
//     per-task bound from the task direction: incidental dev-server/Vite
//     first-compile tasks on a cold load can legitimately exceed 50ms. With
//     ~10ms slices the measurement pass itself contributes tasks well
//     under 50ms; a return to an unsliced pass would blow far past 150ms.
//   - `longtask` PerformanceObserver entries are chromium-observable only —
//     firefox/webkit silently never fire them, so a green run there would
//     be MISLEADING (the same Pitfall 5 rationale that confines the CDP
//     throttle + throttled-mobile project to chromium). The spec therefore
//     skips cleanly on non-chromium engines instead of vacuously passing.
import { test, expect, type Page } from "@playwright/test";

const BASE = "http://localhost:5173";
const FIXTURE = "essay-long-form";
const PIXEL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
const LONGTASK_BUDGET_MS = 150;

test.describe("longtask smoke — time-sliced measurement pass (260820-beo)", () => {
  // longtask entries are chromium-observable only (see header). Skipping on
  // firefox/webkit is the honest alternative to a vacuous green run.
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "longtask PerformanceObserver entries are chromium-observable only",
  );

  test.beforeEach(async ({ page }) => {
    // Image-stub + IndexedDB-wipe harness — mirrors perf.harness.spec.ts
    // L204-219 exactly (stubbed figures never race the measurement pass;
    // a wiped DB gives deterministic first-run state).
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

  test("cold open + one warm typography re-measure produce no longtask over 150ms and zero pageerrors", async ({
    page,
  }) => {
    // Generous cap: the cold phase includes Vite dev-server transforms.
    test.setTimeout(60_000);

    // V7 — measurement must NEVER throw to the reader.
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    // Install the longtask observer BEFORE navigation so it captures the
    // full cold-load window (guarded typeof check + try/catch: an engine
    // without longtask support leaves the accumulator empty rather than
    // throwing inside every page).
    await page.addInitScript(() => {
      const w = window as unknown as {
        __lemLongtasks?: Array<{ startTime: number; duration: number }>;
      };
      w.__lemLongtasks = [];
      if (typeof PerformanceObserver === "undefined") return;
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            w.__lemLongtasks!.push({
              startTime: entry.startTime,
              duration: entry.duration,
            });
          }
        });
        observer.observe({ entryTypes: ["longtask"] });
      } catch {
        // entryType "longtask" unsupported — accumulator stays empty.
      }
    });

    // Cold phase: open the article and wait for the first trusted commit
    // via the DEV-only __lemLastTrustedConstraints seam (the same hook
    // stale-drop.spec.ts + perf.harness.spec.ts observe).
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForFunction(
      () =>
        (window as unknown as Record<string, unknown>).__lemLastTrustedConstraints !==
        undefined,
      undefined,
      { timeout: 15_000 },
    );
    // Settle so the cold pass (+ any follow-up image-load triggers inside
    // the 400ms debounce) completes inside the measured window.
    await page.waitForTimeout(500);

    // Warm phase: ONE deterministic typography re-measure. Adaptive like
    // the perf harness's measureWarmSamples — Up when below the SIZE_STEPS
    // midpoint (22), Down otherwise — so the size always changes from any
    // starting value in [18, 24].
    await page.getByRole("button", { name: "Reading settings" }).click();
    await expect(
      page.getByRole("heading", { name: "Reading settings", level: 2 }),
    ).toBeVisible();
    const slider = page.getByRole("slider", { name: "Text size" });
    await slider.focus();
    const pre = await readTrustedConstraints(page);
    const preSize = pre?.size ?? 18;
    const dir: "ArrowUp" | "ArrowDown" = preSize < 22 ? "ArrowUp" : "ArrowDown";
    await slider.press(dir);
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
    // Settle past the 400ms debounce so a full post-fix sliced pass (plus
    // its commit) lands inside the measured window, then close the panel.
    await page.waitForTimeout(800);
    await page.keyboard.press("Escape");

    // Tripwire: every collected longtask entry is within budget.
    const longtasks = await page.evaluate(
      () =>
        (window as unknown as { __lemLongtasks?: Array<{ startTime: number; duration: number }> })
          .__lemLongtasks ?? [],
    );
    const violations = longtasks.filter((t) => t.duration > LONGTASK_BUDGET_MS);
    const maxDuration = longtasks.reduce(
      (max, t) => Math.max(max, t.duration),
      0,
    );
    // Visible in the run output for the task summary (count + worst entry).
    console.log(
      `[longtask-smoke] ${longtasks.length} entries, max ${maxDuration.toFixed(1)}ms (budget ${LONGTASK_BUDGET_MS}ms)`,
    );
    expect(
      violations,
      `longtasks over ${LONGTASK_BUDGET_MS}ms: ${JSON.stringify(violations)}`,
    ).toEqual([]);

    // V7 — no measurement failure surfaced as a reader-visible pageerror.
    expect(pageErrors, "no uncaught errors during cold + warm passes").toEqual([]);
  });
});

/** Read the DEV-only trusted-constraints hook (mirrors perf.harness.spec.ts). */
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
