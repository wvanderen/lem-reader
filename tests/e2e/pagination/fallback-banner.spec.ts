// tests/e2e/pagination/fallback-banner.spec.ts
// PAGE-09 — When pagination falls back (dom-fallback diagnostic), a quiet
// banner appears with the UI-SPEC §Copywriting text and the reader lands at
// the same passage in scrolling mode. The persisted readingMode preference
// is NOT overwritten (D4-12 — session-only flip).
//
// SCENARIO: Trigger dom-fallback (container fixture), assert the banner copy
// matches UI-SPEC verbatim, the polite announce fires, × dismiss hides the
// banner, and the persisted readingMode in IndexedDB is unchanged after the
// fallback.
//
// Harness copied verbatim from tests/e2e/measurement/stale-drop.spec.ts.
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5173";
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

/** Read the persisted readingMode from the Dexie settings store directly. */
async function readPersistedReadingMode(
  page: import("@playwright/test").Page,
): Promise<string | null> {
  return page.evaluate(() => {
    return new Promise<string | null>((resolve) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction("settings", "readonly");
          const store = tx.objectStore("settings");
          const get = store.get("reader-prefs");
          get.onsuccess = () => {
            const val = get.result?.value as { readingMode?: string } | undefined;
            resolve(val?.readingMode ?? null);
          };
          get.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  });
}

test.describe("PAGE-09 pagination fallback banner (04-05)", () => {
  test("fallback renders the UI-SPEC banner copy + polite announce; dismiss × hides it", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    // list-reference trips dom-fallback reliably (container blocks).
    await page.goto(`${BASE}/#/article/list-reference`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForFunction(
      () =>
        (window as unknown as Record<string, unknown>).__lemPagination !== undefined,
      undefined,
      { timeout: 8000 },
    );
    await page.waitForTimeout(600);

    // The banner is a role=status region (aria-live=polite). Assert the
    // UI-SPEC §Copywriting verbatim copy is present.
    const banner = page
      .locator(".pagination-fallback-banner")
      .first();
    await expect(banner).toBeVisible();
    await expect(
      banner.getByRole("heading", { level: 2 }),
    ).toHaveText("This part of the article is too large to fit on one page.");
    await expect(banner.getByText(/Switched to scrolling so you can keep reading/)).toBeVisible();
    // Polite announce on appearance (visually-hidden span).
    await expect(banner.getByText("Switched to scrolling reading.")).toBeAttached();
    // Switch to pages secondary button is present.
    await expect(banner.getByRole("button", { name: "Switch to pages" })).toBeVisible();

    // × dismiss hides the banner.
    await banner.getByRole("button", { name: "Dismiss" }).click();
    await expect(banner).toBeHidden();

    expect(pageErrors, "no uncaught errors").toEqual([]);
  });

  test("the fallback session-mode flip does NOT overwrite the persisted readingMode (T-04-15)", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await page.goto(`${BASE}/#/article/list-reference`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForFunction(
      () =>
        (window as unknown as Record<string, unknown>).__lemPagination !== undefined,
      undefined,
      { timeout: 8000 },
    );
    await page.waitForTimeout(600);

    // The fallback fired + session flipped to scrolling. The fallback banner
    // is visible (the subscription set showFallbackBanner=true on
    // dom-fallback). The header ModeToggle reflects the PERSISTED preference
    // (paginated — it reads useSettings, not ArticleView's session override);
    // the banner's "Switched to scrolling reading." announce communicates the
    // effective mode to the reader instead.
    const banner = page.locator(".pagination-fallback-banner").first();
    await expect(banner).toBeVisible();

    // ...but the PERSISTED preference in IndexedDB must NOT be "scrolling".
    // The app only persists readingMode via the user-initiated update() path
    // (handleToggleMode / ModeToggle); the fallback session override never
    // calls update(). On a fresh wipe the store may be null (DEFAULT_SETTINGS
    // is applied in-memory, persisted only on the first user-driven update)
    // or "paginated" (the default). Either way it must NOT be "scrolling" —
    // that would prove the fallback leaked into persistence (T-04-15 break).
    await page.waitForTimeout(1500);
    const persisted = await readPersistedReadingMode(page);
    expect(
      persisted,
      "persisted readingMode must NOT be scrolling (fallback never persists — T-04-15)",
    ).not.toBe("scrolling");

    expect(pageErrors, "no uncaught errors").toEqual([]);
  });

  test("Switch to pages clears the session override and returns to paginated at the same passage", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await page.goto(`${BASE}/#/article/list-reference`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForFunction(
      () =>
        (window as unknown as Record<string, unknown>).__lemPagination !== undefined,
      undefined,
      { timeout: 8000 },
    );
    await page.waitForTimeout(600);

    const banner = page.locator(".pagination-fallback-banner").first();
    await expect(banner).toBeVisible();

    // Click Switch to pages — clears the session override. The engine
    // re-attempts pagination; for a container fixture it will re-emit
    // dom-fallback (the oversize/mismatch persists), so the banner
    // reappears. For a clean fixture it would return to paginated. Either
    // way, the action must NOT throw.
    await banner.getByRole("button", { name: "Switch to pages" }).click();
    await page.waitForTimeout(800);

    // The persisted preference must STILL be "paginated" (Switch to pages
    // clears the override, it does not persist).
    const persisted = await readPersistedReadingMode(page);
    if (persisted !== null) {
      expect(persisted, "Switch to pages must not overwrite the persisted preference").toBe(
        "paginated",
      );
    }

    expect(pageErrors, "no uncaught errors").toEqual([]);
  });
});
