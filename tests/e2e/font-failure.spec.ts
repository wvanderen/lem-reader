// tests/e2e/font-failure.spec.ts
// ACPT-03 (D6-11) — the font-failure gap spec. Closes the genuine coverage
// gap: no existing spec exercises the real font-load pipeline (the D3-06 font
// gate, PAGE-06 last-valid-view, PAGE-07 stale-epoch drop) against a genuinely
// pending web font. Phase 3 built + unit-tested the gate; this spec proves it
// end-to-end across chromium/firefox/webkit.
//
// CRITICAL — Lem Reader loads ZERO web fonts (06-RESEARCH.md finding 2,
// VERIFIED: src/settings/tokens.ts FONT_STACKS are all OS-installed cascades;
// src/app.css + index.html have no @font-face). Therefore the harness MUST
// inject a web font FIRST so document.fonts.ready becomes genuinely pending.
// Calling page.route("**/*.woff2", ...) on the unmodified app intercepts
// NOTHING → the test passes vacuously (Pitfall 1). The injection is the
// reason the route has anything to intercept.
//
// HARNESS ORDERING (the non-vacuous pattern, per 06-RESEARCH §Code Examples):
//   1. page.route(FONT_URL, handler)  — register the route so it is ACTIVE
//      before the font request fires.
//   2. openArticle(page, FIXTURE)     — goto + settle. The app loads NO web
//      fonts, so no font request fires yet (OS cascades only).
//   3. injectTestFont(page)            — page.addStyleTag injects the @font-face
//      + a rule applying "TestInjectedFont" to .article-body / .page-fragment.
//      The browser requests /test-injected-font.woff2 → the active route
//      intercepts it (block/delay/continue per the mode).
//   4. verify via page.on("request") that the font URL was actually requested
//      (the Pitfall 1 guard — fails the test if the injection didn't take).
//
// The injected @font-face is TEST-TIER ONLY (page.addStyleTag on a Playwright
// page); it is never present in production builds (D3-04 invisible-by-default
// holds — the app ships zero @font-face rules).
import { test, expect, type Page } from "@playwright/test";
import { assertEdgeInvariant } from "./_edge-invariant";
import { wipeDatabase, openArticle } from "./annotations/_fixtures";

// essay-long-form = the text worst case (2994 normalized chars, 06-RESEARCH
// finding 3) — exercises the most text-heavy measurement path under font
// failure.
const FIXTURE = "essay-long-form";

// The injected font URL + @font-face. The !important on the font-family rule
// GUARANTEES the browser requests the font regardless of the app's CSS cascade
// order (the app inherits font-family from body via --font-body; an explicit
// rule on .article-body already wins over inheritance, but !important removes
// any doubt — Pitfall 1 defense).
const FONT_URL = "**/test-injected-font.woff2";
const FONT_FACE_CSS = `
  @font-face {
    font-family: "TestInjectedFont";
    src: url("/test-injected-font.woff2") format("woff2");
  }
  .article-body, .page-fragment { font-family: "TestInjectedFont", var(--font-body) !important; }
`;

/**
 * Inject the test web font via page.addStyleTag so document.fonts.ready
 * becomes genuinely pending (the app loads no web fonts). MUST run AFTER
 * page.route(FONT_URL) is registered and AFTER navigation, so the request
 * the injection triggers is intercepted by the active route (the non-vacuous
 * pattern — Pitfall 1).
 */
async function injectTestFont(page: Page): Promise<void> {
  await page.addStyleTag({ content: FONT_FACE_CSS });
}

/**
 * Attach a request listener that flips `fontRequested` to true when the
 * injected font URL is requested. Returns the flag accessor. This is the
 * Pitfall 1 guard: if the injection did not trigger a font request, the route
 * interception is vacuous and the test must fail.
 */
function trackFontRequest(page: Page): { wasRequested: () => boolean } {
  let requested = false;
  page.on("request", (req) => {
    if (req.url().includes("test-injected-font.woff2")) requested = true;
  });
  return { wasRequested: () => requested };
}

test.beforeEach(async ({ page }) => {
  // Image stub + IndexedDB wipe = the canonical deterministic-first-run
  // harness (mirrors measurement/stale-drop.spec.ts + annotations/_fixtures).
  await wipeDatabase(page);
});

test.describe("ACPT-03 font-failure (D6-11)", () => {
  test("BLOCK: injected font aborted → content readable in fallback fonts, last-valid-view retained, no errors", async ({
    page,
  }) => {
    // V7 — measurement must NEVER throw to the reader.
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));
    const font = trackFontRequest(page);

    // BLOCK the injected font. Route registered BEFORE addStyleTag so it is
    // active when the injection triggers the request (non-vacuous pattern).
    await page.route(FONT_URL, (route) => route.abort());
    await openArticle(page, FIXTURE);
    await injectTestFont(page);

    // Give the request + abort a beat to settle, then PROVE the font was
    // actually requested (Pitfall 1 guard — fails if the injection was vacuous).
    await page.waitForTimeout(300);
    expect(font.wasRequested(), "injected font must be requested (non-vacuous)").toBe(true);

    // document.fonts.ready still resolves — the aborted font settles as a
    // failed load and the reader continues in fallback fonts (D3-06 gate).
    await page.evaluate(() => document.fonts.ready);

    // PAGE-06 last-valid-view: h1 + first paragraph stay visible (no blank
    // flash while the font gate settles).
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("article p").first()).toBeVisible();

    // Shared D6-09 invariant holds under font block (content + functions +
    // no overflow in both reading modes).
    await assertEdgeInvariant(page, {
      fixture: FIXTURE,
      condition: "font-failure-block",
    });

    // V7: no reader-visible errors surfaced from the font/measurement pipeline.
    expect(pageErrors, "no uncaught errors under font block").toEqual([]);
  });

  test("DELAY: injected font delayed → content visible during the delay, then re-commits after fonts.ready resolves", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));
    const font = trackFontRequest(page);

    // DELAY the injected font by 1500ms, then continue (forwards to vite →
    // 404 → font settles as failed after the delay). The delay holds
    // document.fonts.ready genuinely pending, exercising the gate timing.
    await page.route(FONT_URL, async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await openArticle(page, FIXTURE);
    await injectTestFont(page);

    await page.waitForTimeout(300);
    expect(font.wasRequested(), "injected font must be requested (non-vacuous)").toBe(true);

    // PAGE-06 last-valid-view: content is visible DURING the delay (before
    // document.fonts.ready resolves + the engine commits). The scrolling
    // ArticleBody renders immediately on mount; the paginated surface mounts
    // after the first trusted commit. Either way, no blank flash.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("article p").first()).toBeVisible();

    // __lemLastTrustedConstraints UPDATES after fonts.ready resolves (the
    // re-commit). The engine awaits document.fonts.ready (D3-06); the delayed
    // font holds it pending for ~1500ms, then the 404 settles it → engine
    // measures + commits → DEV hook set. Observation pattern reused from
    // measurement/stale-drop.spec.ts.
    await page.waitForFunction(
      () =>
        (
          window as unknown as Record<string, unknown>
        ).__lemLastTrustedConstraints !== undefined,
      undefined,
      { timeout: 10_000 },
    );
    const committed = await page.evaluate(
      () =>
        (window as unknown as Record<string, unknown>).__lemLastTrustedConstraints as
          | { size: number; viewportWidthPx: number }
          | undefined,
    );
    expect(
      committed,
      "a trusted view must commit after the delayed font settles",
    ).not.toBeNull();
    expect(
      committed!.size,
      "committed size must be a valid step after the delayed font settles",
    ).toBeGreaterThan(0);

    // Shared invariant holds under font delay.
    await assertEdgeInvariant(page, {
      fixture: FIXTURE,
      condition: "font-failure-delay",
    });

    expect(pageErrors, "no uncaught errors under font delay").toEqual([]);
  });

  test("SWAP: injected font active + rapid-trigger race → stale-epoch guard drops stale results (PAGE-07)", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));
    const font = trackFontRequest(page);

    // The injected font is active throughout the race (continues to vite →
    // 404 → settles). The "swap" surface is the font being part of the active
    // set while rapid constraint changes fire multiple measurement epochs.
    await page.route(FONT_URL, async (route) => {
      await route.continue();
    });
    await openArticle(page, FIXTURE);
    await injectTestFont(page);

    await page.waitForTimeout(300);
    expect(font.wasRequested(), "injected font must be requested (non-vacuous)").toBe(true);

    // Wait for the initial commit (after fonts.ready resolves) so the race
    // starts from a non-null trusted view.
    await page.waitForFunction(
      () =>
        (
          window as unknown as Record<string, unknown>
        ).__lemLastTrustedConstraints !== undefined,
      undefined,
      { timeout: 10_000 },
    );

    // Rapid-trigger race — reuses measurement/stale-drop.spec.ts's proven
    // PAGE-07 shape: three viewport changes + three typography changes inside
    // the coalescer's 400ms debounce window. The stale-epoch guard must drop
    // every older-epoch result; only the FINAL constraints may commit.
    const finalWidth = 1000;
    await page.setViewportSize({ width: 480, height: 700 });
    await page.waitForTimeout(80);
    await page.setViewportSize({ width: 768, height: 900 });
    await page.waitForTimeout(80);
    await page.setViewportSize({ width: finalWidth, height: 1000 });

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
    await page.keyboard.press("Escape");

    // Let the coalescer's debounce + the engine's font gate + measure pass
    // settle (D3-06 mandates re-awaiting document.fonts.ready before commit).
    await page.waitForTimeout(1500);

    // The committed trusted view MUST reflect the FINAL constraints. The
    // debug hook captures only the latest commit; an older-epoch leak would
    // leave size or viewportWidthPx at an intermediate value (PAGE-07 broken).
    const committed = await page.evaluate(
      () =>
        (window as unknown as Record<string, unknown>).__lemLastTrustedConstraints as
          | { size: number; viewportWidthPx: number }
          | undefined,
    );
    expect(committed, "a trusted view must have committed after the race").not.toBeNull();
    expect(
      committed!.size,
      `final committed size must be ${finalSize} (stale result leaked?), got ${committed!.size}`,
    ).toBe(finalSize);
    expect(
      committed!.viewportWidthPx,
      `final committed viewportWidthPx must be near ${finalWidth}, got ${committed!.viewportWidthPx}`,
    ).toBeGreaterThan(finalWidth - 200);

    // Shared invariant holds after the font-active race.
    await assertEdgeInvariant(page, {
      fixture: FIXTURE,
      condition: "font-failure-swap",
    });

    // V7: no measurement/font failure surfaced as a reader-visible pageerror.
    expect(pageErrors, "no uncaught errors during the font race").toEqual([]);
  });
});
