// tests/e2e/pagination/page-turn-controls.spec.ts
// PAGE-02 — Reader can move forward and backward through responsive pages
// using keyboard, pointer, and touch controls with predictable focus (D4-05
// keyboard bundle + D4-06 pointer chevrons + D4-07 context-aware focus).
//
// SCENARIO: In paginated mode, PageDown/ArrowRight/Space advance;
// PageUp/ArrowLeft/Shift+Space retreat. At page 1 backward keys no-op; at
// last page forward keys no-op. Clicking the chevrons turns. The bail rule
// (form fields, A11Y-01) keeps Space from hijacking an input outside the
// article.
//
// Uses essay-long-form (paginates cleanly at default settings).
//
// Harness copied verbatim from tests/e2e/measurement/stale-drop.spec.ts.
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

interface PaginationDev {
  currentPageIdx: number;
  pagesLength: number;
  status: string;
}

async function gotoPaginated(page: import("@playwright/test").Page): Promise<PaginationDev> {
  await page.goto(`${BASE}/#/article/${FIXTURE}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForFunction(
    () =>
      (window as unknown as Record<string, unknown>).__lemPagination !== undefined,
    undefined,
    { timeout: 8000 },
  );
  await page.waitForTimeout(600);
  const dev = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__lemPagination as PaginationDev,
  );
  // Plan 04-06: the engine paginates essay-long-form cleanly. Assert ≥2
  // pages explicitly — a fallback or single-page result is a regression.
  expect(dev.status, "engine status for essay-long-form").toBe("ok");
  expect(dev.pagesLength, "essay-long-form must produce ≥2 pages").toBeGreaterThanOrEqual(2);
  return dev;
}

async function currentPage(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(
    () =>
      ((window as unknown as Record<string, unknown>).__lemPagination as PaginationDev)
        .currentPageIdx,
  );
}

test.describe("PAGE-02 page-turn controls (04-05)", () => {
  test("keyboard bundle: PageDown/ArrowRight/Space advance; PageUp/ArrowLeft/Shift+Space retreats", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    const dev = await gotoPaginated(page);
    const total = dev.pagesLength;
    expect(total).toBeGreaterThan(1);

    // Forward keys advance one page each.
    expect(await currentPage(page)).toBe(0);
    await page.keyboard.press("PageDown");
    expect(await currentPage(page), "PageDown advances to page 2").toBe(1);
    await page.keyboard.press("ArrowRight");
    expect(await currentPage(page), "ArrowRight advances to page 3").toBe(2);
    await page.keyboard.press("Space");
    expect(await currentPage(page), "Space advances to page 4").toBe(3);

    // Backward keys retreat one page each.
    await page.keyboard.press("PageUp");
    expect(await currentPage(page), "PageUp retreats to page 3").toBe(2);
    await page.keyboard.press("ArrowLeft");
    expect(await currentPage(page), "ArrowLeft retreats to page 2").toBe(1);
    await page.keyboard.press("Shift+Space");
    expect(await currentPage(page), "Shift+Space retreats to page 1").toBe(0);

    // Boundary: at page 1, backward keys are a no-op (no wrap).
    await page.keyboard.press("PageUp");
    expect(await currentPage(page), "PageUp at page 1 is a no-op").toBe(0);

    // Boundary: at last page, forward keys are a no-op.
    for (let i = 0; i < total + 5; i++) {
      await page.keyboard.press("PageDown");
    }
    expect(await currentPage(page), "forward keys clamp at last page").toBe(total - 1);

    expect(pageErrors, "no uncaught errors during turns").toEqual([]);
  });

  test("chevron click turns the page (shared turn path)", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    const dev = await gotoPaginated(page);
    const total = dev.pagesLength;

    // Previous chevron is aria-disabled at page 1.
    const prev = page.getByRole("button", { name: "Previous page" });
    const next = page.getByRole("button", { name: "Next page" });
    await expect(prev).toHaveAttribute("aria-disabled", "true");

    await next.click();
    expect(await currentPage(page), "Next chevron advances").toBe(1);
    await expect(prev).not.toHaveAttribute("aria-disabled", "true");

    await prev.click();
    expect(await currentPage(page), "Previous chevron retreats").toBe(0);

    // Next chevron is aria-disabled at last page.
    // Plan 04-09: Playwright treats aria-disabled="true" as non-actionable
    // (it won't click the button once the attribute is set). { force: true }
    // bypasses the actionability check so the loop can run the full
    // total + 5 iterations; commitTurn returns moved:false at the boundary
    // so the extra clicks are harmless no-ops.
    for (let i = 0; i < total + 5; i++) {
      await next.click({ force: true }).catch(() => {});
    }
    await expect(next).toHaveAttribute("aria-disabled", "true");

    expect(pageErrors, "no uncaught errors during chevron turns").toEqual([]);
  });

  test("document scrolling never turns a page during screen-reader block navigation", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await gotoPaginated(page);
    expect(await currentPage(page)).toBe(0);

    // Plain Down Arrow belongs to the screen reader/browser's sequential
    // reading path. It is intentionally absent from the page-turn key map.
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(150);
    expect(await currentPage(page), "Down Arrow must stay on page 1").toBe(0);

    // Paginated mode owns a viewport, not a vertically scrollable document.
    // A document scroll seam lets VoiceOver/browser focus move the entire
    // page surface and strand the reader outside its stable page geometry.
    const maxScroll = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
    );
    expect(
      maxScroll,
      "paginated mode must not expose a document scroll seam",
    ).toBe(0);
    await page.evaluate(() => window.scrollTo(0, 1000));

    const surfaceBeforeWheel = await page
      .locator(".paginated-surface")
      .evaluate((surface) => surface.getBoundingClientRect().top);
    await page.mouse.wheel(0, 1200);

    await page.waitForTimeout(150);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(
      await page.locator(".paginated-surface").evaluate((surface) =>
        surface.getBoundingClientRect().top,
      ),
      "wheel input must not displace the paginated surface",
    ).toBe(surfaceBeforeWheel);
    expect(
      await page.evaluate(() => getComputedStyle(document.body).position),
      "Safari paginated mode uses a viewport-fixed root",
    ).toBe("fixed");
    const internalScroll = await page.locator(".paginated-surface").evaluate((surface) => {
      const article = surface as HTMLElement;
      const before = article.scrollTop;
      article.scrollTop = 1000;
      return {
        before,
        after: article.scrollTop,
        overflow: getComputedStyle(article).overflow,
      };
    });
    expect(internalScroll.before).toBe(0);
    expect(
      internalScroll.after,
      "AT/programmatic scrolling must not move the clipped page surface",
    ).toBe(0);
    expect(internalScroll.overflow).toBe("clip");
    expect(
      await currentPage(page),
      "screen-reader-induced scrolling must not advance pagination",
    ).toBe(0);
    expect(pageErrors, "no uncaught errors during document scroll").toEqual([]);
  });

  test("content-triggered turns hand VoiceOver to a fresh page boundary", async ({
    page,
  }) => {
    await gotoPaginated(page);

    // Model a screen-reader/content-origin turn by placing DOM focus on the
    // current paragraph. The temporary attribute belongs only to this old
    // page and must not be recreated by the focus-restoration implementation.
    await page.locator(".page-fragment p").first().evaluate((paragraph) => {
      paragraph.setAttribute("tabindex", "-1");
      paragraph.focus();
    });
    const scrollBeforeTurn = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("PageDown");

    await expect
      .poll(() => currentPage(page), { message: "PageDown advances to page 2" })
      .toBe(1);
    const pageBoundary = page.getByRole("heading", {
      name: "Page 2 begins",
      level: 2,
    });
    await expect(pageBoundary).toBeFocused();
    await expect(pageBoundary).toHaveAttribute("tabindex", "-1");
    const boundaryGeometry = await pageBoundary.evaluate((boundary) => {
      const boundaryRect = boundary.getBoundingClientRect();
      const viewportRect = document
        .querySelector<HTMLElement>(".page-viewport")!
        .getBoundingClientRect();
      const firstBlockRect = document
        .querySelector<HTMLElement>(".page-fragment > [data-block-index]")!
        .getBoundingClientRect();
      return {
        boundaryTop: boundaryRect.top,
        boundaryBottom: boundaryRect.bottom,
        viewportTop: viewportRect.top,
        firstBlockTop: firstBlockRect.top,
      };
    });
    expect(boundaryGeometry.boundaryTop).toBeGreaterThanOrEqual(
      boundaryGeometry.viewportTop,
    );
    expect(
      boundaryGeometry.boundaryTop,
      "page boundary must be spatially before visible article content",
    ).toBeLessThanOrEqual(boundaryGeometry.firstBlockTop);
    await expect(page.locator(".page-fragment")).not.toHaveAttribute("tabindex");
    await expect(page.locator(".page-fragment > [data-block-index][tabindex]"), {
      message: "mutable article text must not retain the page-entry focus",
    }).toHaveCount(0);
    expect(
      await page.evaluate(() => window.scrollY),
      "semantic focus handoff must not scroll the paginated viewport",
    ).toBe(scrollBeforeTurn);

    // Up/Down remain available to the browser/screen reader after the handoff.
    const keys = await page.evaluate(() => {
      const outcomes: boolean[] = [];
      for (const key of ["ArrowDown", "ArrowUp"]) {
        const event = new KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
        });
        document.activeElement?.dispatchEvent(event);
        outcomes.push(event.defaultPrevented);
      }
      return outcomes;
    });
    expect(keys, "Up/Down remain uncancelled after focus restoration").toEqual([
      false,
      false,
    ]);
  });

  test("Space does NOT hijack a form field outside the article (A11Y-01 bail)", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await gotoPaginated(page);
    const beforeIdx = await currentPage(page);

    // Open the settings panel (native <dialog>) and focus its slider; Space
    // inside a form control must NOT turn the page (isFormField bail).
    await page.getByRole("button", { name: "Reading settings" }).click();
    const slider = page.getByRole("slider", { name: "Text size" });
    await slider.focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(150);

    expect(
      await currentPage(page),
      "Space inside a settings control must not turn the page",
    ).toBe(beforeIdx);

    await page.keyboard.press("Escape");
    expect(pageErrors, "no uncaught errors").toEqual([]);
  });
});
