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
