// tests/e2e/progress.spec.ts
// READ-05 + A11Y-08 e2e coverage (02-03 Task 3). Proves in a REAL browser
// (Chromium / Firefox / WebKit — playwright.config.ts) that the
// ProgressHairline:
//   1. Is present, aria-hidden, and full-width under the header.
//   2. The fill's transform scaleX(...) is 0 (or near 0) at the top and
//      increases toward 1 after scrolling to the bottom.
//   3. CRITICAL (UI-SPEC §Interaction 12 + RESEARCH anti-pattern #6): the
//      fill's computed transitionProperty/transitionDuration resolves to
//      "none"/"0s" — NO animation on the transform. The hairline tracks
//      scroll position like a native scrollbar, never animates.
//
// Uses real IndexedDB via Dexie — wiped at the start of each test so the
// first-run state is deterministic. Reuses BASE + image-stub conventions.
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

test.describe("READ-05 progress hairline", () => {
  test("the .progress-hairline element exists, is aria-hidden, and has an inner fill", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const hairline = page.locator(".progress-hairline");
    await expect(hairline).toHaveCount(1);
    await expect(hairline).toHaveAttribute("aria-hidden", "true");

    const fill = page.locator(".progress-hairline-fill");
    await expect(fill).toHaveCount(1);
  });

  test("the fill's computed transition property resolves to 'none' (NO animation on the transform)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // CRITICAL acceptance criterion: NO CSS transition on the transform.
    // The fill's inline style writes scaleX(...) on every scroll; the rule
    // itself declares no transition property. Computed style should resolve
    // transitionProperty to "none" (or "all" with duration "0s" — the
    // global reduced-motion gate may apply, but the base rule has none).
    const transitionInfo = await page
      .locator(".progress-hairline-fill")
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          property: cs.transitionProperty,
          duration: cs.transitionDuration,
        };
      });
    // Accept either: transitionProperty === "none" OR duration === "0s".
    // Both prove no animation will run on the transform.
    const noAnimation =
      transitionInfo.property === "none" || transitionInfo.duration === "0s";
    expect(
      noAnimation,
      `expected transitionProperty=none or duration=0s, got ${JSON.stringify(transitionInfo)}`,
    ).toBe(true);
  });

  test("the fill scaleX is near 0 at the top of the article", async ({ page }) => {
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Ensure we're at the top.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);

    const transform = await page
      .locator(".progress-hairline-fill")
      .evaluate((el) => getComputedStyle(el).transform);
    // matrix(a, b, c, d, tx, ty) — scaleX is `a` (the [0][0] entry).
    // At scaleX(0) the matrix is "matrix(0, 0, 0, 1, 0, 0)".
    // At scaleX(1) it's "matrix(1, 0, 0, 1, 0, 0)".
    // We accept "none" (scaleX(1) default) or a matrix with a small `a`.
    const match = /matrix\(([\d.eE+-]+)/.exec(transform ?? "");
    const a = match && match[1] ? parseFloat(match[1]) : transform === "none" ? 1 : 0;
    expect(a, `expected scaleX near 0 at top, got transform=${transform}`).toBeLessThan(0.1);
  });

  test("the fill scaleX increases toward 1 after scrolling to the bottom", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Scroll to the bottom of the article.
    await page.evaluate(() => {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "instant",
      });
    });
    await page.waitForTimeout(300);

    const transform = await page
      .locator(".progress-hairline-fill")
      .evaluate((el) => getComputedStyle(el).transform);
    const match = /matrix\(([\d.eE+-]+)/.exec(transform ?? "");
    const a = match && match[1] ? parseFloat(match[1]) : transform === "none" ? 1 : 0;
    // At the bottom, scaleX should be ≥ 0.9 (close to 1).
    expect(
      a,
      `expected scaleX close to 1 at bottom, got transform=${transform}`,
    ).toBeGreaterThanOrEqual(0.9);
  });

  test("the fill's computed transform-origin resolves to the left edge (not center) — fills left-to-right", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // The `left` keyword computes to `0px 50%` (a 2-value origin: x=0px,
    // y=50% of the element's height). When the origin was the invalid
    // `inline-start`, the browser fell back to the initial `50% 50%`, whose
    // first token is a nonzero percentage of the element's WIDTH — and the
    // scaleX transform expanded from the horizontal center. Asserting the
    // first computed token is `0px` proves the origin sits on the left edge
    // so scaleX grows left-to-right.
    const origin = await page
      .locator(".progress-hairline-fill")
      .evaluate((el) => getComputedStyle(el).transformOrigin);
    const firstToken = String(origin).split(/\s+/)[0];
    expect(
      firstToken,
      `expected transform-origin x-axis to resolve to 0px (left edge), got "${origin}"`,
    ).toBe("0px");
  });
});
