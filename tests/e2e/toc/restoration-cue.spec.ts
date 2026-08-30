// tests/e2e/toc/restoration-cue.spec.ts
// Phase 18 Plan 18-03 Task 2 — RestorationMarker e2e (ORNT-06, D18-05/07/08).
//
// SCROLLING-MODE cells on the mobile-first-page-chrome harness shape (raw
// IndexedDB location put → reload → assert). The paginated cells + the full
// 3-engine×mode matrix land in Plan 18-04 (this file's cells still run on
// all three engines via the default playwright projects).
//
// Proves:
//   1. A reopen-restore shows the marker bar at the restored block AND the
//      polite announce "Returned to where you left off." (D18-05 — the cue
//      IS the location).
//   2. The marker is TRANSIENT: present after restore, gone by the 4s
//      lifecycle deadline (D18-07; generous timeouts — the fade window).
//   3. First open with NO seeded location shows NO marker and NO announce
//      (rule 11 marker honesty — never claim a restore that didn't happen).
//   4. Content is NOT shifted: the marker is overlay-only — article
//      geometry is byte-equal while the marker is mounted vs after it
//      unmounts (ORNT-06 no-content-shift).
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5173";
const FIXTURE = "essay-long-form";
const SAVED_OFFSET = 500;

// Pure-string SVG stub (see open-every-fixture.spec.ts for rationale).
const PIXEL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1"  height="1"/>';

test.beforeEach(async ({ page }) => {
  // Mobile-first harness shape (mobile-first-page-chrome.spec.ts).
  await page.setViewportSize({ width: 360, height: 640 });
  // Stub remote images so figure-heavy fixtures are deterministic.
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: PIXEL_SVG }),
  );
  // Wipe the lem-reader IndexedDB so each test starts from a first-run
  // state (persistence.spec.ts shape — deleteDatabase on the bare BASE URL
  // so the next goto sees an empty DB and Dexie constructs it fresh).
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

/** Seed readingMode "scrolling" (persistence.spec.ts seedScrollingMode
 *  shape) — MUST run after the app has loaded once so Dexie's settings
 *  store exists; a subsequent reload hydrates scrolling mode. */
async function seedScrollingMode(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains("settings")) {
            resolve();
            return;
          }
          const tx = db.transaction("settings", "readwrite");
          tx.objectStore("settings").put({
            key: "reader-prefs",
            value: {
              schemaVersion: 2,
              font: "serif",
              size: 18,
              measure: 64,
              spacing: "comfortable",
              theme: "sepia",
              readingMode: "scrolling",
            },
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      };
      req.onerror = () => resolve();
    });
  });
}

/** Seed a raw LocationRecord (the mobile-first-page-chrome put shape). */
async function seedLocation(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(async (seed) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("lem-reader");
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("location", "readwrite");
        transaction.objectStore("location").put({
          schemaVersion: 1,
          articleId: seed.articleId,
          revision: 1,
          graphemeOffset: seed.graphemeOffset,
          savedAt: new Date().toISOString(),
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      };
      request.onerror = () => reject(request.error);
    });
  }, { articleId: FIXTURE, graphemeOffset: SAVED_OFFSET });
}

/** Open the article in scrolling mode and settle: first navigation (Dexie
 *  constructs the schema), scrolling-mode seed, reload, hydration wait. */
async function openScrollingReady(page: import("@playwright/test").Page): Promise<void> {
  await page.goto(`${BASE}/#/article/${FIXTURE}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await seedScrollingMode(page);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(500); // SettingsProvider hydration → scrolling
}

/** Live article geometry (the no-content-shift assertion's subject). */
function readGeometry(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const article = document.querySelector("article.article-body");
    const first = article?.querySelector<HTMLElement>("[data-block-index]");
    const articleRect = article?.getBoundingClientRect();
    const firstRect = first?.getBoundingClientRect();
    return {
      articleTop: articleRect?.top ?? null,
      articleBottom: articleRect?.bottom ?? null,
      firstTop: firstRect?.top ?? null,
      firstBottom: firstRect?.bottom ?? null,
      scrollY: window.scrollY,
    };
  });
}

test.describe("RestorationMarker — scrolling mode (ORNT-06)", () => {
  test.setTimeout(60_000);

  test("reopen-restore shows the marker at the restored block + the polite announce (D18-05)", async ({
    page,
  }) => {
    await openScrollingReady(page);
    await seedLocation(page);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // The polite announce region (the D18-05 verbatim carry-forward).
    const announce = page
      .getByRole("status")
      .filter({ hasText: "Returned to where you left off." });
    await expect(announce).toHaveCount(1, { timeout: 8_000 });

    // The marker bar: present, attached to the article, and intersecting
    // the viewport NEAR the restored block (the restore scrolls the target
    // block to the viewport top, so the bar rides it).
    const marker = page.locator(".restoration-marker");
    await expect(marker).toHaveCount(1, { timeout: 8_000 });
    const near = await page.evaluate(() => {
      const bar = document.querySelector<HTMLElement>(".restoration-marker");
      const article = document.querySelector("article.article-body");
      if (!bar || !article) return null;
      const b = bar.getBoundingClientRect();
      const a = article.getBoundingClientRect();
      return {
        inArticle: b.top >= a.top - 1 && b.bottom <= a.bottom + 1,
        intersectsViewport: b.top < window.innerHeight && b.bottom > 0,
        hasGutterOffset: b.left < a.left + (a.width / 2),
      };
    });
    expect(near).not.toBeNull();
    expect(near!.inArticle, "marker bar must sit within the article's span").toBe(true);
    expect(near!.intersectsViewport, "marker bar must be visible near the restored block").toBe(true);
    expect(near!.hasGutterOffset, "marker bar must sit in the inline-start gutter").toBe(true);
  });

  test("the marker is transient — present after restore, gone by the 4s deadline (D18-07)", async ({
    page,
  }) => {
    await openScrollingReady(page);
    await seedLocation(page);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const marker = page.locator(".restoration-marker");
    await expect(marker).toHaveCount(1, { timeout: 8_000 });

    // Presence-then-absence with a generous budget: the component unmounts
    // itself 4000ms after mount (fade class at 3400ms + 600ms CSS opacity
    // transition). The announce region goes with it — one cause, one cue.
    await expect(marker).toHaveCount(0, { timeout: 10_000 });
    await expect(
      page.getByText("Returned to where you left off."),
    ).toHaveCount(0);
  });

  test("first open with NO saved location: no marker and no announce (rule 11 honesty)", async ({
    page,
  }) => {
    // No seedLocation — first open, nothing to restore.
    await openScrollingReady(page);
    await page.waitForTimeout(1200); // the restore effect has resolved null

    await expect(page.locator(".restoration-marker")).toHaveCount(0);
    await expect(
      page.getByText("Returned to where you left off."),
    ).toHaveCount(0);
  });

  test("content is not shifted — the marker is overlay-only (ORNT-06)", async ({
    page,
  }) => {
    await openScrollingReady(page);
    await seedLocation(page);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const marker = page.locator(".restoration-marker");
    await expect(marker).toHaveCount(1, { timeout: 8_000 });

    // Geometry WITH the marker mounted…
    const withMarker = await readGeometry(page);
    // …and after the 4s lifecycle unmounts it (generous fade window).
    await expect(marker).toHaveCount(0, { timeout: 10_000 });
    const withoutMarker = await readGeometry(page);

    // Subpixel/rounding tolerance: firefox's scrollY drifted exactly 1px
    // over the ~5s lifecycle wait in calibration (fractional internal
    // scroll offset rounding) — the same ≤1px convention the mobile-first
    // geometry checks use; a real layout shift is tens of pixels.
    expect(Math.abs(withoutMarker.scrollY - withMarker.scrollY)).toBeLessThanOrEqual(1);
    expect(Math.abs(withoutMarker.articleTop! - withMarker.articleTop!)).toBeLessThanOrEqual(1);
    expect(Math.abs(withoutMarker.articleBottom! - withMarker.articleBottom!)).toBeLessThanOrEqual(1);
    expect(Math.abs(withoutMarker.firstTop! - withMarker.firstTop!)).toBeLessThanOrEqual(1);
    expect(Math.abs(withoutMarker.firstBottom! - withMarker.firstBottom!)).toBeLessThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 18 Plan 18-04 Task 2 — the PAGINATED cells + cross-engine presence
// (strengthen-only: the scrolling describe above is byte-stable; everything
// below is additive). Default mode is paginated (D4-12) and the beforeEach
// wiped the settings store — NO scrolling seed runs here. The DEV
// __lemPagination hook (persistence.spec shapes) supplies readiness + the
// article's grapheme length so the seeded offset is deterministically DEEP
// (60% — never page 1 on a multi-page pagination).
// ═══════════════════════════════════════════════════════════════════════════
test.describe("RestorationMarker — paginated mode (18-04)", () => {
  test.setTimeout(60_000);

  /** Wait for the DEV-only pagination hook (first commit). */
  async function paginationReady(page: import("@playwright/test").Page) {
    await page.waitForFunction(
      () =>
        (window as unknown as Record<string, unknown>).__lemPagination !==
        undefined,
      undefined,
      { timeout: 10_000 },
    );
  }

  /** Seed a raw LocationRecord with an arbitrary offset (the seedLocation
   *  put shape, parameterized — the scrolling describe's helper is
   *  hardwired to the shallow SAVED_OFFSET constant). */
  async function seedLocationOffset(
    page: import("@playwright/test").Page,
    graphemeOffset: number,
  ): Promise<void> {
    await page.evaluate(async (seed) => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("lem-reader");
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("location", "readwrite");
          transaction.objectStore("location").put({
            schemaVersion: 1,
            articleId: seed.articleId,
            revision: 1,
            graphemeOffset: seed.graphemeOffset,
            savedAt: new Date().toISOString(),
          });
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        };
        request.onerror = () => reject(request.error);
      });
    }, { articleId: FIXTURE, graphemeOffset });
  }

  /** Open once, read the article's total grapheme length (DEV hook), seed a
   *  DEEP location, and reload onto the restore. Resolves after the reopen
   *  has landed past page 1 (the readiness-gated paginated restore). */
  async function reopenOnDeepRestore(page: import("@playwright/test").Page): Promise<void> {
    await page.goto(`${BASE}/#/article/${FIXTURE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await paginationReady(page);
    const total = await page.evaluate(
      () =>
        (window as unknown as { __lemPagination?: { articleGraphemeLength: number } })
          .__lemPagination?.articleGraphemeLength ?? 0,
    );
    expect(total).toBeGreaterThan(0);
    await seedLocationOffset(page, Math.floor(total * 0.6));

    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await paginationReady(page);
    await page.waitForFunction(
      () => {
        const dev = (window as unknown as Record<string, unknown>)
          .__lemPagination as { currentPageIdx: number };
        return dev.currentPageIdx >= 1;
      },
      undefined,
      { timeout: 10_000 },
    );
  }

  test("paginated reopen-restore lands on the saved page with the marker at its inline-start edge + the announce (D18-05)", async ({
    page,
  }) => {
    await reopenOnDeepRestore(page);

    // The polite announce (the D18-05 verbatim carry-forward) AND the bar.
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Returned to where you left off." }),
    ).toHaveCount(1, { timeout: 8_000 });
    const marker = page.locator(".restoration-marker");
    await expect(marker).toHaveCount(1, { timeout: 8_000 });

    // Geometry (D18-05 "restored page edge"): the bar sits in the gutter at
    // the restored page fragment's inline-start edge (bar.right ≈ fragment
    // .left), spans page height, and intersects the viewport. Bounds are
    // honest against the header line + viewport (the fragment's full box
    // can extend a few px past the article's overflow:clip bottom — the
    // 18-03 decision).
    const near = await page.evaluate(() => {
      const bar = document.querySelector<HTMLElement>(".restoration-marker");
      const fragment = document.querySelector<HTMLElement>(".page-fragment");
      if (!bar || !fragment) return null;
      const b = bar.getBoundingClientRect();
      const f = fragment.getBoundingClientRect();
      return {
        atInlineStartEdge: Math.abs(b.right - f.left) <= 2,
        pageHeightBar: b.height >= f.height * 0.5,
        intersectsViewport: b.top < window.innerHeight && b.bottom > 0,
        belowHeaderLine: b.top >= 40,
        withinViewportBottom: b.bottom <= window.innerHeight + 8,
      };
    });
    expect(near).not.toBeNull();
    expect(near!.atInlineStartEdge, "the bar must sit at the restored page's inline-start edge").toBe(true);
    expect(near!.pageHeightBar, "the bar must span the restored page's height").toBe(true);
    expect(near!.intersectsViewport, "the bar must be visible at the restored page").toBe(true);
    expect(near!.belowHeaderLine).toBe(true);
    expect(near!.withinViewportBottom).toBe(true);
  });

  test("no dismissal exists — no interactive element inside the marker and the bar never intercepts pointers (ORNT-06)", async ({
    page,
  }) => {
    await reopenOnDeepRestore(page);
    const marker = page.locator(".restoration-marker");
    await expect(marker).toHaveCount(1, { timeout: 8_000 });

    // No button/link/focusable inside the marker — there is nothing to
    // dismiss (the cue IS the location; it retires on its own).
    const interactive = await marker.evaluate((el) =>
      el.querySelectorAll("button, a, input, select, textarea, [tabindex]").length,
    );
    expect(interactive).toBe(0);

    // pointer-events: none — the bar can never intercept a click or a page
    // turn gesture (ORNT-06 "does not block").
    const pointerEvents = await marker.evaluate(
      (el) => getComputedStyle(el).pointerEvents,
    );
    expect(pointerEvents).toBe("none");
  });

  test("page turns still work while the marker is visible (pointer-events none — ORNT-06)", async ({
    page,
  }) => {
    await reopenOnDeepRestore(page);
    const marker = page.locator(".restoration-marker");
    await expect(marker).toHaveCount(1, { timeout: 8_000 });

    const readIdx = () =>
      page.evaluate(
        () =>
          (window as unknown as { __lemPagination?: { currentPageIdx: number } })
            .__lemPagination?.currentPageIdx ?? -1,
      );
    const before = await readIdx();
    await page.keyboard.press("PageDown");
    await expect
      .poll(readIdx, { timeout: 5_000 })
      .toBe(before + 1);
    // The marker is still mounted (well within its 4s window) — reading
    // continued past it without dismissal.
    await expect(marker).toHaveCount(1);
  });

  test("content geometry is unchanged by the marker mount — overlay-only (ORNT-06)", async ({
    page,
  }) => {
    await reopenOnDeepRestore(page);
    const marker = page.locator(".restoration-marker");
    await expect(marker).toHaveCount(1, { timeout: 8_000 });

    // Fragment + article geometry WITH the marker mounted…
    const readGeometry = () =>
      page.evaluate(() => {
        const article = document.querySelector("article.article-body");
        const fragment = document.querySelector<HTMLElement>(".page-fragment");
        const articleRect = article?.getBoundingClientRect();
        const fragmentRect = fragment?.getBoundingClientRect();
        return {
          articleTop: articleRect?.top ?? null,
          articleBottom: articleRect?.bottom ?? null,
          fragmentTop: fragmentRect?.top ?? null,
          fragmentLeft: fragmentRect?.left ?? null,
        };
      });
    const withMarker = await readGeometry();
    // …and after the 4s lifecycle unmounts it (generous fade window).
    await expect(marker).toHaveCount(0, { timeout: 10_000 });
    const withoutMarker = await readGeometry();

    // The ≤1px convention (the scrolling describe's calibration note).
    expect(Math.abs(withoutMarker.articleTop! - withMarker.articleTop!)).toBeLessThanOrEqual(1);
    expect(Math.abs(withoutMarker.articleBottom! - withMarker.articleBottom!)).toBeLessThanOrEqual(1);
    expect(Math.abs(withoutMarker.fragmentTop! - withMarker.fragmentTop!)).toBeLessThanOrEqual(1);
    expect(Math.abs(withoutMarker.fragmentLeft! - withMarker.fragmentLeft!)).toBeLessThanOrEqual(1);
  });

  test("reduced motion: the marker clears as an instant state change — the global gate kills the fade transition (D18-07, Pitfall 8)", async ({
    page,
  }) => {
    // Emulate BEFORE navigation so the gate applies from first paint.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await reopenOnDeepRestore(page);
    const marker = page.locator(".restoration-marker");
    await expect(marker).toHaveCount(1, { timeout: 8_000 });

    // The fade class still lands at 3400ms (the lifecycle is timer-driven)
    // — but the global prefers-reduced-motion gate kills the transition, so
    // the opacity change is an instant step (computed transition-duration
    // 0s). Poll generously: the class arrives mid-window.
    await expect
      .poll(
        () => marker.evaluate((el) => el.classList.contains("is-fading")),
        { timeout: 6_000 },
      )
      .toBe(true);
    const duration = await marker.evaluate((el) =>
      getComputedStyle(el).transitionDuration,
    );
    expect(
      duration,
      "the reduced-motion gate must kill the fade (0s duration — no JS animation exists)",
    ).toBe("0s");

    // And the bar is gone by the lifecycle deadline.
    await expect(marker).toHaveCount(0, { timeout: 10_000 });
  });
});
