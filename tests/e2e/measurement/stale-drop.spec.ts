// tests/e2e/measurement/stale-drop.spec.ts
// PAGE-07 (stale work can never win) — real-browser proof across the three
// supported engines (chromium / firefox / webkit via playwright.config). A
// rapid-trigger race: three viewport resizes + three typography changes
// fired inside the coalescer's 400ms debounce window. After the dust
// settles, the committed trusted view MUST reflect the FINAL constraints;
// any older-epoch result that slipped through would prove PAGE-07 broken.
//
// Reuses the typography-live-apply.spec.ts harness: image-stub (so figure
// load does not race), IndexedDB-wipe (deterministic first-run state),
// hash-route navigation, h1-visible sentinel. The DEV-only debug hook
// `window.__lemLastTrustedConstraints` (set by useMeasurement in dev) is
// the observation point — it captures the LATEST committed Constraints
// (only written by a result that passed the font gate + epoch guard).
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5173";
const FIXTURE = "essay-long-form";
const PIXEL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';

test.beforeEach(async ({ page }) => {
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

test.describe("PAGE-07 stale-epoch drop (03-01)", () => {
  test("the committed trusted view reflects the FINAL viewport + typography after a rapid-trigger race", async ({
    page,
  }) => {
    // Collect uncaught page errors — measurement must NEVER throw to the
    // reader (V7). AbortError is internal (caught by the engine) and never
    // surfaces as a pageerror; any non-Abort error means PAGE-07 leaked.
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Let the initial measurement commit so the trusted view is non-null
    // before the race begins (gives the engine + coalescer a beat to fire
    // after fonts.ready resolves).
    await page.waitForFunction(
      () =>
        (window as unknown as Record<string, unknown>).__lemLastTrustedConstraints !==
        undefined,
      undefined,
      { timeout: 5000 },
    );

    // (a) Three rapid viewport changes inside the 400ms debounce window.
    // Each setViewportSize schedules a ResizeObserver callback → coalescer
    // schedules a debounced trigger. Older epochs are cancelled by the
    // per-trigger bump; only the final viewport survives.
    const finalWidth = 1000;
    await page.setViewportSize({ width: 480, height: 700 });
    await page.waitForTimeout(80);
    await page.setViewportSize({ width: 768, height: 900 });
    await page.waitForTimeout(80);
    await page.setViewportSize({ width: finalWidth, height: 1000 });

    // (b) Three rapid typography changes inside the same window. Drive the
    // SettingsPanel size slider: ArrowUp x3 = 18→20→22→24 (SIZE_STEPS).
    await page.getByRole("button", { name: "Reading settings" }).click();
    await expect(
      page.getByRole("heading", { name: "Reading settings", level: 2 }),
    ).toBeVisible();
    const slider = page.getByRole("slider", { name: "Text size" });
    await slider.focus();
    const finalSize = 24;
    await slider.press("ArrowUp"); // 18 → 20
    await page.waitForTimeout(40);
    await slider.press("ArrowUp"); // 20 → 22
    await page.waitForTimeout(40);
    await slider.press("ArrowUp"); // 22 → 24 (final)
    // Close the panel so a final reflow can settle.
    await page.keyboard.press("Escape");

    // Let the coalescer's debounce + the engine's font gate + measure pass
    // commit. Generous wait because the engine awaits document.fonts.ready
    // (D3-06) before any commit.
    await page.waitForTimeout(1500);

    // The committed trusted view MUST reflect the FINAL constraints. The
    // debug hook captures only the latest commit; an older-epoch leak
    // would leave size or viewportWidthPx at an intermediate value.
    const committed = await page.evaluate(() => {
      const c = (window as unknown as Record<string, unknown>).__lemLastTrustedConstraints as
        | { size: number; viewportWidthPx: number }
        | undefined;
      return c ?? null;
    });
    expect(committed, "a trusted view must have committed").not.toBeNull();
    expect(committed!.size, `final committed size must be 24, got ${committed!.size}`).toBe(
      finalSize,
    );
    // viewportWidthPx is the article element's content-box width at commit
    // time — it should be in the final viewport's neighborhood (within a
    // small tolerance for scrollbar + layout).
    expect(
      committed!.viewportWidthPx,
      `final committed viewportWidthPx must be near ${finalWidth}, got ${committed!.viewportWidthPx}`,
    ).toBeGreaterThan(finalWidth - 200);

    // No measurement failure surfaced as a reader-visible pageerror (V7).
    expect(pageErrors, "no uncaught errors during the race").toEqual([]);
  });
});
