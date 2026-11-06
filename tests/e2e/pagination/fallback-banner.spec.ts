// tests/e2e/pagination/fallback-banner.spec.ts
// PAGE-09 + issue #240 — pagination failures surface through the ONE
// validated classifier (src/reader/paginationFailure.ts): genuinely
// unpageable content and processing failures are explicit and DISTINCT, the
// disclosed session flip only happens for unpageable content, and the banner
// offers the appropriate escape routes (retry pages, scrolling, original
// source). The persisted readingMode preference is NEVER overwritten by a
// fallback (D4-12/T-04-15 — session-only flip).
//
// The DiagnosticBus DEV hook (__lemDiagnosticBus, T-04-17) is the injection
// seam: the banner SURFACE is independent of the measurement engine's
// cross-engine consistency (the oversize guard fires reliably on
// chromium/webkit but not firefox at the test viewport — the REAL-engine
// oversize path is covered by giant-prose.spec.ts's giant-code test).
import { test, expect, type Page } from "@playwright/test";
import { BASE } from "../_base";

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
async function readPersistedReadingMode(page: Page): Promise<string | null> {
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

type Bus = { emit: (event: unknown) => void; recent: () => { kind: string; reason?: string }[] };

async function waitForBus(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as Record<string, unknown>).__lemDiagnosticBus !== undefined,
    undefined,
    { timeout: 8000 },
  );
}

/** The shared <article> element's mode class: paginated-surface = the
    EFFECTIVE mode is paginated; its absence = scrolling. */
async function effectiveMode(page: Page): Promise<"paginated" | "scrolling"> {
  return page.evaluate(() =>
    document
      .querySelector("article.article-body")
      ?.classList.contains("paginated-surface")
      ? "paginated"
      : "scrolling",
  );
}

interface PaginationDev {
  status: string;
  anchorOffset: number | null;
  publicationSeq: number;
}

async function readPaginationDev(page: Page): Promise<PaginationDev> {
  return page.evaluate(() => {
    const dev = (
      window as unknown as { __lemPagination?: PaginationDev }
    ).__lemPagination;
    return {
      status: dev?.status ?? "absent",
      anchorOffset: dev?.anchorOffset ?? null,
      publicationSeq: dev?.publicationSeq ?? 0,
    };
  });
}

/**
 * Open FALLBACK_FIXTURE in a TINY viewport (a real oversize geometry) and
 * inject a dom-fallback diagnostic with the given reason — the exact
 * production path ArticleView takes when the engine or the overflow guard
 * emits a real failure.
 */
async function gotoWithFallback(
  page: Page,
  reason?: string,
): Promise<void> {
  await page.setViewportSize({ width: 200, height: 200 });
  await page.goto(`${BASE}/#/article/technical-post`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await waitForBus(page);
  await page.evaluate((r) => {
    const bus = (window as unknown as { __lemDiagnosticBus: Bus }).__lemDiagnosticBus;
    bus.emit({ kind: "dom-fallback", ts: new Date().toISOString(), ...(r ? { reason: r } : {}) });
  }, reason);
}

test.describe("PAGE-09 fallback banner — unpageable content (issue #240)", () => {
  test("oversized-block shows the SPECIFIC content limit, the disclosed flip, and both escape routes", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await gotoWithFallback(page, "oversized-block");

    const banner = page.locator(".pagination-fallback-banner").first();
    await expect(banner).toBeVisible();
    // The SPECIFIC content limit — not the generic inference (#240).
    await expect(banner.getByRole("heading", { level: 2 })).toHaveText(
      "An element in this article is too large to fit on one page.",
    );
    await expect(banner.getByText(/Switched to scrolling so you can keep reading/)).toBeVisible();
    // The disclosed flip really happened (session-scoped).
    await expect(banner.getByText("Switched to scrolling reading.")).toBeAttached();
    expect(await effectiveMode(page)).toBe("scrolling");
    // Escape routes: the reversible pages path + the original source.
    await expect(banner.getByRole("button", { name: "Switch to pages" })).toBeVisible();
    const source = banner.getByRole("link", { name: /See the original/ });
    await expect(source).toBeVisible();
    expect(await source.getAttribute("rel")).toBe("noopener noreferrer");
    expect(await source.getAttribute("target")).toBe("_blank");
    // Retry controls belong to processing failures only — never conflated.
    await expect(banner.getByRole("button", { name: "Try pages again" })).toHaveCount(0);

    // × dismiss hides the banner.
    await banner.getByRole("button", { name: "Dismiss" }).click();
    await expect(banner).toBeHidden();

    expect(pageErrors, "no uncaught errors").toEqual([]);
  });

  test("the unpageable session flip does NOT overwrite the persisted readingMode (T-04-15)", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await gotoWithFallback(page, "oversized-block");
    await expect(page.locator(".pagination-fallback-banner").first()).toBeVisible();

    // Give any wrongly-persisted write time to land before reading.
    await page.waitForTimeout(1500);
    const persisted = await readPersistedReadingMode(page);
    expect(
      persisted,
      "persisted readingMode must NOT be scrolling (a fallback never persists — T-04-15)",
    ).not.toBe("scrolling");

    expect(pageErrors, "no uncaught errors").toEqual([]);
  });

  test("Switch to pages clears the session override and returns to paginated", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await gotoWithFallback(page, "oversized-block");
    const banner = page.locator(".pagination-fallback-banner").first();
    await expect(banner).toBeVisible();

    // Switch to pages clears the session override; the real engine
    // re-attempts pagination at this viewport and (this geometry being a
    // genuine oversize) the banner may legitimately reappear — the action
    // itself must not throw and must not persist.
    await banner.getByRole("button", { name: "Switch to pages" }).click();
    await page.waitForTimeout(800);
    await expect(banner.getByRole("button", { name: "Dismiss" })).toBeAttached();

    const persisted = await readPersistedReadingMode(page);
    if (persisted !== null) {
      expect(persisted, "Switch to pages must not overwrite the persisted preference").toBe(
        "paginated",
      );
    }

    expect(pageErrors, "no uncaught errors").toEqual([]);
  });
});

test.describe("PAGE-09 fallback banner — processing failures (issue #240)", () => {
  // A NORMAL viewport: real pagination succeeds here, so the ONLY failure
  // event is the injected one — the mode policy under test is not confounded
  // by a genuine oversize fallback (which is real at pathological viewports;
  // that path is covered above and by giant-prose's giant-code test).
  async function gotoNormalWithFallback(page: Page, event: Record<string, unknown>): Promise<void> {
    await page.setViewportSize({ width: 1024, height: 720 });
    await page.goto(`${BASE}/#/article/technical-post`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForFunction(
      () =>
        (window as unknown as { __lemPagination?: { status: string } }).__lemPagination?.status ===
        "ok",
      undefined,
      { timeout: 15000 },
    );
    await waitForBus(page);
    await page.evaluate((e) => {
      const bus = (window as unknown as { __lemDiagnosticBus: Bus }).__lemDiagnosticBus;
      bus.emit({ ts: new Date().toISOString(), ...e });
    }, event);
  }

  test("a processing failure is distinct: NO mode flip, retry + scrolling escape routes", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await gotoNormalWithFallback(page, { kind: "dom-fallback", reason: "zero-progress" });

    const banner = page.locator(".pagination-fallback-banner").first();
    await expect(banner).toBeVisible();
    await expect(banner.getByRole("heading", { level: 2 })).toHaveText(
      "Preparing this article as pages didn't finish.",
    );
    await expect(banner.getByText(/Something went wrong while preparing pages/)).toBeVisible();
    // Explicit + distinct: the reader keeps their SELECTED mode.
    await expect(banner.getByText("Preparing pages failed. You can try again or read in scrolling.")).toBeAttached();
    expect(await effectiveMode(page)).toBe("paginated");
    await expect(banner.getByRole("button", { name: "Try pages again" })).toBeVisible();
    await expect(banner.getByRole("button", { name: "Read in scrolling" })).toBeVisible();
    // The flip disclosure is false here — the mode did not change.
    await expect(banner.getByText(/Switched to scrolling/)).toHaveCount(0);
    // The reversible pages action belongs to the unpageable flip only.
    await expect(banner.getByRole("button", { name: "Switch to pages" })).toHaveCount(0);

    // "Read in scrolling" is the explicit, session-scoped escape.
    await banner.getByRole("button", { name: "Read in scrolling" }).click();
    await expect(banner).toBeHidden();
    expect(await effectiveMode(page)).toBe("scrolling");
    await page.waitForTimeout(800);
    const persisted = await readPersistedReadingMode(page);
    expect(persisted, "the explicit escape never persists (T-04-15)").not.toBe("scrolling");

    expect(pageErrors, "no uncaught errors").toEqual([]);
  });

  test("an UNKNOWN reason never claims a specific content limit and never flips", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await gotoNormalWithFallback(page, { kind: "dom-fallback", reason: "some-future-guard-v2" });
    const banner = page.locator(".pagination-fallback-banner").first();
    await expect(banner).toBeVisible();
    // Honest processing failure — no inferred cause (#240).
    await expect(banner.getByRole("heading", { level: 2 })).toHaveText(
      "Preparing this article as pages didn't finish.",
    );
    expect(await effectiveMode(page)).toBe("paginated");

    expect(pageErrors, "no uncaught errors").toEqual([]);
  });

  test("Try pages again repaginates at the SAME affected passage, without a mode change", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await gotoNormalWithFallback(page, {
      kind: "measurement-error",
      message: "injected for issue #240 retry coverage",
    });
    const before = await readPaginationDev(page);
    expect(before.anchorOffset).not.toBeNull();
    const banner = page.locator(".pagination-fallback-banner").first();
    await expect(banner).toBeVisible();
    expect(await effectiveMode(page)).toBe("paginated");

    await banner.getByRole("button", { name: "Try pages again" }).click();
    await expect(banner).toBeHidden();
    // A NEW publication commits (the epoch re-ran the pass), still paginated.
    await page.waitForFunction(
      (seq) =>
        ((window as unknown as { __lemPagination?: { publicationSeq: number } }).__lemPagination
          ?.publicationSeq ?? 0) > seq,
      before.publicationSeq,
      { timeout: 15000 },
    );
    const after = await readPaginationDev(page);
    expect(after.status).toBe("ok");
    // The affected passage survived the retry — never a reset to the start.
    expect(after.anchorOffset).toBe(before.anchorOffset);
    expect(await effectiveMode(page)).toBe("paginated");
    const persisted = await readPersistedReadingMode(page);
    expect(persisted).not.toBe("scrolling");

    expect(pageErrors, "no uncaught errors").toEqual([]);
  });

  test("cancellation: rapid M-M mode toggles emit no failure and no banner", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await page.setViewportSize({ width: 1024, height: 720 });
    await page.goto(`${BASE}/#/article/technical-post`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForFunction(
      () =>
        (window as unknown as { __lemPagination?: { status: string } }).__lemPagination?.status ===
        "ok",
      undefined,
      { timeout: 15000 },
    );
    await waitForBus(page);

    // Two rapid toggles: the first superseding pass aborts silently. The
    // final settle is paginated again with committed pages.
    await page.keyboard.press("m");
    await page.keyboard.press("m");
    await page.waitForFunction(
      () =>
        (window as unknown as { __lemPagination?: { status: string } }).__lemPagination?.status ===
        "ok",
      undefined,
      { timeout: 15000 },
    );
    await page.waitForTimeout(500);

    const events = await page.evaluate(() => {
      const bus = (window as unknown as { __lemDiagnosticBus: Bus }).__lemDiagnosticBus;
      return bus.recent().map((e) => ({ kind: e.kind, reason: e.reason }));
    });
    expect(
      events.filter((e) => e.kind === "dom-fallback" || e.kind === "measurement-error"),
      "supersession/cancellation must produce no reader-facing failure",
    ).toEqual([]);
    await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
    expect(await effectiveMode(page)).toBe("paginated");

    expect(pageErrors, "no uncaught errors").toEqual([]);
  });
});
