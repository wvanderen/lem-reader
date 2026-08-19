// tests/e2e/polish/first-paint-progress.spec.ts
// POLISH-02 / SC#2 — first-paint progress boundary on the REAL paginated
// surface (Phase 13 Plan 02, Task 3). Proves across chromium/firefox/webkit
// that the paginated hairline is offset-anchored (D-05 grapheme coordinates)
// instead of page-count-divided:
//
//   Case A (one-page article): opening a short article shows the hairline
//   near empty (scaleX < 0.1) — the OLD N/M semantics read 1/1 = 100% on
//   open. PageIndicator still reads "1 of 1" (D4-08 — N-of-M stays).
//
//   Case B (multi-page article): page 1 starts near 0 (was 1/M); each turn
//   grows the fill monotonically; turning to page 2 is strictly greater than
//   page 1; the LAST page stays strictly below 1.0 (progress reflects
//   position, never claims completion while content remains).
//
// Harness reuse (REUSE-DO-NOT-FORK):
//   - computed-transform matrix parsing + expect.poll settle discipline from
//     tests/e2e/progress.spec.ts L81-131
//   - raw-Dexie seeding via seedRows + schema-valid makeArticle from
//     tests/e2e/portability/_portability.ts (the highlights-export.spec.ts
//     seeding precedent)
//   - PageDown turn + window.__lemPagination settle from the pagination
//     specs' gotoPaginated discipline
//
// Settle discipline: every end condition is polled (expect.poll /
// waitForFunction) — zero fixed sleeps (Pitfall 8: firefox rAF-throttle is a
// known flake class under load).
import { test, expect, type Page } from "@playwright/test";
import {
  makeArticle,
  prepareFreshPage,
  seedRows,
} from "../portability/_portability";

const BASE = "http://localhost:5173";
/** Corpus fixture proven to paginate to ≥2 pages at default settings. */
const MULTI_PAGE_FIXTURE = "essay-long-form";

/** A short schema-valid article: 3 short paragraphs — one page at any
 * realistic viewport geometry (the Case A seed, built through the SHIPPED
 * ArticleSchema so the Dexie read path never drops it). */
const ONE_PAGE_ARTICLE = makeArticle({
  id: "polish-one-page",
  title: "One calm page",
  paragraphs: [
    "A short opening paragraph.",
    "A second short paragraph.",
    "A third short paragraph closes the page.",
  ],
});

/** The DEV-only pagination hook shape published by PaginatedSurface. */
interface PaginationDev {
  currentPageIdx: number;
  pagesLength: number;
  status: string;
}

async function paginationState(page: Page): Promise<PaginationDev> {
  return page.evaluate(
    () =>
      (window as unknown as Record<string, unknown>)
        .__lemPagination as PaginationDev,
  );
}

/**
 * The hairline fill's computed scaleX, parsed from the transform matrix
 * (progress.spec.ts L89-98 pattern). "none" means scaleX(1) — the identity.
 */
async function hairlineScaleX(page: Page): Promise<number> {
  const transform = await page
    .locator(".progress-hairline-fill")
    .evaluate((el) => getComputedStyle(el).transform);
  const match = /matrix\(([\d.eE+-]+)/.exec(transform ?? "");
  return match && match[1] ? parseFloat(match[1]) : transform === "none" ? 1 : 0;
}

/**
 * Poll until the fill's scaleX is strictly above `floor`, then return the
 * observed value (waitForFunction both waits for the end condition AND
 * yields the number — the value-capturing counterpart of expect.poll).
 */
async function pollScaleXAbove(page: Page, floor: number): Promise<number> {
  const handle = await page.waitForFunction(
    (floorValue: number) => {
      const el = document.querySelector(".progress-hairline-fill");
      if (!el) return false;
      const m = /matrix\(([\d.eE+-]+)/.exec(
        getComputedStyle(el).transform ?? "",
      );
      const a = m && m[1] ? parseFloat(m[1]) : 0;
      return a > floorValue ? a : false;
    },
    floor,
    { timeout: 5000 },
  );
  return (await handle.jsonValue()) as number;
}

/** Open an article in paginated mode and wait for the engine's first commit. */
async function openPaginated(
  page: Page,
  articleId: string,
): Promise<PaginationDev> {
  await page.goto(`${BASE}/#/article/${articleId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForFunction(
    () =>
      (window as unknown as Record<string, unknown>).__lemPagination !==
      undefined,
    undefined,
    { timeout: 10_000 },
  );
  return paginationState(page);
}

/** Turn one page forward and poll until the committed index is `targetIdx`. */
async function turnForward(page: Page, targetIdx: number): Promise<void> {
  await page.keyboard.press("PageDown");
  await expect.poll(async () => (await paginationState(page)).currentPageIdx, {
    timeout: 5000,
    message: `expected currentPageIdx to reach ${targetIdx}`,
  }).toBe(targetIdx);
}

test.describe("POLISH-02 first-paint progress boundaries (SC#2)", () => {
  test("Case A: a one-page article opens with the hairline near empty (not 100%)", async ({
    page,
  }) => {
    await prepareFreshPage(page);
    await seedRows(page, { articles: [ONE_PAGE_ARTICLE] });

    const state = await openPaginated(page, ONE_PAGE_ARTICLE.id);
    expect(state.status, "one-page article must paginate cleanly").toBe("ok");
    expect(state.pagesLength, "short article yields exactly one page").toBe(1);

    // Sanity: the N-of-M readout still says "1 of 1" (D4-08 unchanged).
    await expect(page.locator(".page-indicator")).toHaveText(/^1\s+of\s+1$/);

    // The SC#2 boundary: near-empty fill on open (was scaleX 1.0 before).
    await expect
      .poll(hairlineScaleX.bind(null, page), {
        timeout: 5000,
        message: "expected one-page open scaleX below 0.1",
      })
      .toBeLessThan(0.1);
  });

  test("Case B: multi-page progress starts near 0, grows strictly, and the last page stays below 1", async ({
    page,
  }) => {
    await prepareFreshPage(page);

    const state = await openPaginated(page, MULTI_PAGE_FIXTURE);
    expect(state.status, "multi-page fixture must paginate cleanly").toBe("ok");
    expect(state.pagesLength).toBeGreaterThanOrEqual(2);
    const total = state.pagesLength;

    // Page 1 starts near 0 (was 1/M under the old N/M semantics).
    await expect
      .poll(hairlineScaleX.bind(null, page), {
        timeout: 5000,
        message: "expected page-1 scaleX below 0.1",
      })
      .toBeLessThan(0.1);
    const page1X = await hairlineScaleX(page);

    // Turn to page 2: strictly greater than page 1 (offset advanced).
    await turnForward(page, 1);
    await expect
      .poll(hairlineScaleX.bind(null, page), {
        timeout: 5000,
        message: "expected page-2 scaleX strictly greater than page 1",
      })
      .toBeGreaterThan(page1X);
    const page2X = await hairlineScaleX(page);

    // Walk to the last page: every sampled turn is monotonically
    // non-decreasing (page starts only advance, never regress).
    let prev = page2X;
    for (let idx = 2; idx < total; idx++) {
      await turnForward(page, idx);
      const x = await pollScaleXAbove(page, prev - 1e-9);
      expect(
        x,
        `page ${idx + 1} scaleX must be >= the previous page's (${prev})`,
      ).toBeGreaterThanOrEqual(prev);
      prev = x;
    }

    // The last page still has content, so its START offset sits strictly
    // inside the article — the fill never claims completion.
    expect(prev, "last-page scaleX must stay below 1.0").toBeLessThan(1.0);
  });
});
