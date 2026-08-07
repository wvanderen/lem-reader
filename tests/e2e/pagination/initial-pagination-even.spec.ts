// tests/e2e/pagination/initial-pagination-even.spec.ts
// 05-06 regression guard — captures the FIRST pagination publication for a
// long-form fixture and asserts even, viewport-sized distribution with NO racy
// mega-page correction.
//
// SCENARIO: On initial article load in paginated mode (the default), the very
// FIRST pagination commit must distribute a long-form essay across MORE than
// one viewport-bounded page. The diagnosed regression packed nearly the ENTIRE
// article onto P1 (pagesLength=1) because ArticleView's geometry-effect rAF
// fired while the scrolling branch was still mounted (trustedView null on first
// render) and captured the tall scrolling-body natural height. A racy
// ~0.5–0.9s downstream re-pagination then corrected it, masking the broken
// initial state. This spec captures the FIRST publication deterministically and
// proves the first pass is already correct — if the mega-page mode ever
// returns, this spec fails loudly.
//
// Harness skeleton copied verbatim from tests/e2e/pagination/no-overflow-invariant.spec.ts
// (BASE url, image-route pixel-svg fulfillment, indexedDB.deleteDatabase beforeEach).
import { test, expect } from "@playwright/test";
import { FIXTURES, VIEWPORTS } from "./fixtures-matrix";

const BASE = "http://localhost:5173";
const PIXEL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';

// The aeon.co long-form essay the UAT Test 11 failure reproduced on, at the
// desktop viewport cell (1024×800 — the calm 64ch default).
const ESSAY_LONG_FORM = "essay-long-form";
const DESKTOP = VIEWPORTS.find((v) => v.width === 1024 && v.height === 800)!;

// Reference the imports so the matrix surface stays observable (mirrors the
// sibling spec's import surface); the focused regression below targets the
// single cell the UAT failure reproduced on.
void FIXTURES;

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

interface FirstPagination {
  pagesLength: number;
  status: string;
}

test.describe("initial-pagination-even (05-06)", () => {
  test.describe.configure({ mode: "parallel" });

  test(`${ESSAY_LONG_FORM}@${DESKTOP.width}x${DESKTOP.height}: first pagination publication is even (>1 page) and stable — no racy mega-page correction`, async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await page.setViewportSize({ width: DESKTOP.width, height: DESKTOP.height });
    await page.goto(`${BASE}/#/article/${ESSAY_LONG_FORM}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Capture the FIRST pagination publication DETERMINISTICALLY in a single
    // browser-side callback. Poll via requestAnimationFrame until
    // window.__lemPagination is defined, then resolve immediately with the
    // pagesLength it published. NO fixed waitForTimeout before the capture —
    // the whole point is to observe the UNCORRECTED initial state. A racy
    // downstream correction must NOT be able to slip between this poll and the
    // resolution (one continuous evaluate, no round-trip gap). The first
    // publication persists for ~3-4 rAF ticks before any correction overwrites
    // it (debug session measured ~62ms+ between passes), so the poll reliably
    // catches the first value.
    const first = await page.evaluate(() => {
      return new Promise<FirstPagination>((resolve) => {
        const tick = () => {
          const dev = (window as unknown as Record<string, unknown>).__lemPagination as
            | { pagesLength?: number; status?: string }
            | undefined;
          if (dev && typeof dev.pagesLength === "number") {
            resolve({ pagesLength: dev.pagesLength, status: dev.status ?? "unknown" });
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    });

    // (a) The first publication must distribute a long-form essay across MORE
    // THAN ONE viewport-bounded page. A value of 1 means the whole article was
    // packed onto P1 — the diagnosed mega-page regression.
    expect(
      first.pagesLength,
      `first pagination publication pagesLength (captured ${first.pagesLength}; expected >1 for a long-form essay at desktop — a value of 1 is the mega-page regression)`,
    ).toBeGreaterThan(1);

    // (b) After a short settle, re-read pagesLength and assert it EQUALS the
    // first captured value — the first pass was already stable, NO racy
    // correction path fired. (waitForTimeout is acceptable HERE because we
    // already captured the initial value above; this only proves stability.)
    await page.waitForTimeout(600);
    const settled = await page.evaluate(() => {
      const dev = (window as unknown as Record<string, unknown>).__lemPagination as
        | { pagesLength?: number; status?: string }
        | undefined;
      return {
        pagesLength: dev?.pagesLength ?? 0,
        status: dev?.status ?? "unknown",
      };
    });
    expect(
      settled.pagesLength,
      `settled pagesLength (${settled.pagesLength}) must equal first publication (${first.pagesLength}) — a racy correction would change the count`,
    ).toBe(first.pagesLength);

    // (c) engine status for the cell is "ok".
    expect(settled.status, `engine status for ${ESSAY_LONG_FORM}@${DESKTOP.width}x${DESKTOP.height}`).toBe("ok");

    expect(pageErrors, "no uncaught errors during pagination").toEqual([]);
  });
});
