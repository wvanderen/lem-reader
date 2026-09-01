// tests/e2e/typography-live-apply.spec.ts
// 02-04 Gap 2: real-browser proof that the typography cascade reaches body
// text. jsdom cannot prove cascaded computed style (Pitfall 2), so this spec
// drives the actual SettingsPanel controls in a real browser and asserts the
// body's computed font-size + word-spacing change. This closes the regression
// where applyTheme wrote bare font-size/line-height on <html> that the body
// rule's hardcoded values overrode — size + the line-height half of spacing
// never reached the text. The 02-04 fix routes the four typography knobs
// through --font-size / --line-height / --letter-spacing / --word-spacing
// custom properties consumed by the SECOND body rule in app.css via var().
//
// Uses real IndexedDB via Dexie — wiped at the start of each test so the
// first-run state is deterministic. Reuses BASE + image-stub conventions
// from persistence.spec.ts / progress.spec.ts.
import { test, expect, type Page } from "@playwright/test";

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

test.describe("READ-02 typography live-apply (02-04 gap 2)", () => {
  // 60s budget (the calibration/perf harness precedent): under FULL-suite
  // parallel load, webkit's first module fetch can starve the context long
  // enough to burn the default 30s inside beforeEach's page.goto — the
  // 09-07 load-race class (passes in isolation). Assertions unchanged.
  test.setTimeout(60_000);
  test("the article body's computed font-size and word-spacing track the SettingsPanel controls", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Open the settings panel via the gear button (aria-label "Reading
    // settings"). Live-apply happens while the panel is open (D2-03 — no
    // Save step).
    await page.getByRole("button", { name: "Reading settings" }).click();
    await expect(
      page.getByRole("heading", { name: "Reading settings", level: 2 }),
    ).toBeVisible();

    // (a) DEFAULT: body computed font-size is the D-07 default 18px (the
    // --font-size custom property is unset on first paint; the body rule's
    // var(--font-size, 18px) fallback fires; applyTheme then runs on mount
    // and writes 18px via the SettingsProvider effect).
    const defaultSize = await page.evaluate(
      () => getComputedStyle(document.body).fontSize,
    );
    expect(defaultSize, `expected default body font-size 18px, got ${defaultSize}`).toBe(
      "18px",
    );

    // (b) Set the Text size slider to 24. The slider's step is 2 (SIZE_STEPS
    // 16/18/20/22/24), so 3 ArrowUp presses move 18→20→22→24. fill() is not
    // always supported on range inputs in this Playwright version; the
    // keyboard fallback is documented.
    const slider = page.getByRole("slider", { name: "Text size" });
    await slider.focus();
    await slider.press("ArrowUp");
    await slider.press("ArrowUp");
    await slider.press("ArrowUp");

    const sizedUp = await page.evaluate(
      () => getComputedStyle(document.body).fontSize,
    );
    expect(
      sizedUp,
      `expected body font-size 24px after slider to 24, got ${sizedUp}`,
    ).toBe("24px");

    // (c) Click the "Spacious" spacing radio. The spacious preset writes
    //    --word-spacing: 0.05em, which at 24px font-size resolves to a
    //    nonzero pixel value (1.2px). This proves the previously-dead
    //    --word-spacing write is now consumed by the body rule.
    await page.getByRole("radio", { name: "Spacious" }).click();
    const spaciousWordSpacing = await page.evaluate(
      () => getComputedStyle(document.body).wordSpacing,
    );
    expect(
      spaciousWordSpacing,
      `expected nonzero word-spacing under spacious preset, got ${spaciousWordSpacing}`,
    ).not.toBe("0px");

    // (d) Click "Compact" — word-spacing returns to 0px (the compact preset
    //    writes 0).
    await page.getByRole("radio", { name: "Compact" }).click();
    const compactWordSpacing = await page.evaluate(
      () => getComputedStyle(document.body).wordSpacing,
    );
    expect(
      compactWordSpacing,
      `expected word-spacing back to 0px under compact preset, got ${compactWordSpacing}`,
    ).toBe("0px");
  });
});

// ── POLISH-09 (D21-01/D21-02/D21-04): the truthful reading width ─────────────
//
// The slider's far-right endpoint is a TRUTHFUL 64ch: shown value,
// programmatic attributes, and the rendered column all agree, in BOTH
// reading modes. Truth criterion (css-values-4, RESEARCH Pitfall 4): `ch`
// is the advance measure of the "0" glyph — a hidden 64-"0" ruler probe
// inside the reading surface must equal the surface's content width within
// 1px. NEVER verify by counting prose characters (mixed-case glyph widths
// vary; the "0" advance is the unit the control displays).
test.describe("POLISH-09 truthful reading width (21-01)", () => {
  test.setTimeout(60_000);

  /** The 64-"0" ruler truth check: a hidden, absolutely-positioned,
   * white-space:pre probe span appended inside the surface measured against
   * the surface's own box width (D21-01 contract). */
  async function expectRulerEqualsSurfaceWidth(
    page: Page,
    selector: string,
  ): Promise<void> {
    const { ruler, surface, diff } = await page.evaluate((sel) => {
      const el = document.querySelector(sel)!;
      const probe = document.createElement("span");
      probe.style.cssText =
        "position:absolute;visibility:hidden;white-space:pre";
      probe.textContent = "0".repeat(64);
      el.appendChild(probe);
      const w = probe.getBoundingClientRect().width;
      const s = el.getBoundingClientRect().width;
      probe.remove();
      return { ruler: w, surface: s, diff: Math.abs(w - s) };
    }, selector);
    expect(
      diff,
      `64-zero ruler ${ruler}px must equal ${selector} width ${surface}px within 1px (ch = the "0"-glyph advance, css-values-4)`,
    ).toBeLessThanOrEqual(1);
  }

  test("far-right endpoint is a truthful 64 in scrolling AND paginated mode (ruler + aria + readout)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // The reading-mode default is paginated; switch to scrolling FIRST so
    // both surfaces are proven (D21-04: both reading modes).
    const modeToggle = page.getByRole("button", { name: /^Reading mode:/ });
    await modeToggle.click();
    await page.waitForFunction(
      () =>
        document.querySelector(".article-body.paginated-surface") === null &&
        document.querySelector(".article-body:not(.article-body-measurement)") !==
          null,
      undefined,
      { timeout: 10_000 },
    );

    // Open settings and drive the measure slider to far-right via the real
    // control (Home/End are the native range-input endpoint keys).
    await page.getByRole("button", { name: "Reading settings" }).click();
    await expect(
      page.getByRole("heading", { name: "Reading settings", level: 2 }),
    ).toBeVisible();
    const slider = page.getByRole("slider", { name: "Reading width" });
    await slider.focus();
    await slider.press("End");

    // (c) Programmatic agreement (D21-01): the aria attributes derive from
    // MEASURE_STEPS array ends — far-right is 64, the floor is 40.
    await expect(slider).toHaveAttribute("aria-valuenow", "64");
    await expect(slider).toHaveAttribute("aria-valuemax", "64");
    await expect(slider).toHaveAttribute("aria-valuemin", "40");

    // (d) Readout agreement (D21-04 keeps the inline shape).
    const readout = page.locator("legend", { hasText: "Reading width" });
    await expect(readout).toContainText("Reading width");
    await expect(readout).toContainText("64 ch");

    // The token the surfaces consume resolves to 64ch.
    const measureToken = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--measure")
        .trim(),
    );
    expect(measureToken).toBe("64ch");

    // (a) Ruler truth in scrolling mode (.article-body max-width:
    // var(--measure) — app.css). The panel may stay open; live-apply has
    // already written the token.
    await expectRulerEqualsSurfaceWidth(
      page,
      ".article-body:not(.article-body-measurement)",
    );

    // (b) Switch to paginated mode via the mode toggle and repeat the
    // ruler assertion against the paginated surface (width:
    // var(--measure) — app.css).
    await page.keyboard.press("Escape"); // close the modal settings dialog
    await expect(
      page.getByRole("heading", { name: "Reading settings", level: 2 }),
    ).toBeHidden();
    await modeToggle.click();
    await page.waitForFunction(
      () =>
        document.querySelector(".article-body.paginated-surface") !== null &&
        document.querySelector(".page-fragment") !== null,
      undefined,
      { timeout: 10_000 },
    );
    await expectRulerEqualsSurfaceWidth(page, ".article-body.paginated-surface");
  });

  test("far-left endpoint reaches the 40ch floor (D21-02)", async ({ page }) => {
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.getByRole("button", { name: "Reading settings" }).click();
    await expect(
      page.getByRole("heading", { name: "Reading settings", level: 2 }),
    ).toBeVisible();
    const slider = page.getByRole("slider", { name: "Reading width" });
    await slider.focus();
    await slider.press("Home");

    await expect(slider).toHaveAttribute("aria-valuenow", "40");
    await expect(slider).toHaveAttribute("aria-valuemin", "40");
    const measureToken = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--measure")
        .trim(),
    );
    expect(measureToken).toBe("40ch");
    // The 320px-reflow / 400%-zoom matrix cells (Plan 06 machinery)
    // empirically confirm the floor's usability; here the token truth is
    // the contract.
    const readout = page.locator("legend", { hasText: "Reading width" });
    await expect(readout).toContainText("40 ch");
  });
});
