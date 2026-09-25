// tests/e2e/library/mark-read-and-close.spec.ts
// Issue #2 e2e leg — the explicit "Mark read and close" completion gesture
// (the 260908-oht affordance, now one of readingPosition's four decision
// sites). The issue's "existing completion e2e specs (passive pins,
// mark-read-and-close) stay green" criterion named a mark-read-and-close
// spec that did not exist — only the RTL component suite (MarkReadAndClose
// .test.tsx) covered the button. This spec supplies the missing real-
// browser leg; plain test() blocks inherit the chromium/firefox/webkit
// matrix by default.
//
// What is pinned here (per placement):
//   1. The gesture CLOSES through the shared leaveArticleToLibrary
//      contract (URL returns to the library, Pitfall 7).
//   2. The flush-now seam PERSISTED offset = total (the ONE end-pin,
//      endPinOffset) — asserted against the raw IndexedDB location row,
//      not against rendered UI. This is the save-before-navigate proof:
//      the write must have landed before the unmount cancelled the
//      debounced path.
//   3. The library AGREES the article is finished (the Finished switcher
//      count + the card's Finished mark), across a reload.
//   4. The continue-reading strip: an in-progress article LEAVES the strip
//      after the gesture (strip membership consumed readingState truth —
//      behavior unchanged by Issue #2).
//
// Harness (cloned from reading-views.spec.ts — REUSE-DO-NOT-FORK):
// image stub + goto BASE + "Saved articles" h1 wait + raw IndexedDB
// clear-rows (never deleteDatabase — the webkit race).
import { test, expect, type Page } from "@playwright/test";
import { fixtures } from "../../../src/fixtures";
import {
  normalizeText,
  graphemeClusters,
} from "../../../src/content/normalizeText";
import { BASE } from "../_base";

/** The sole starter-library fixture is the gesture's corpus. */
const ARTICLE = fixtures[0]!;
const ARTICLE_TITLE = ARTICLE.provenance.title;
const ARTICLE_HREF = `#/article/${ARTICLE.id}`;

/** The grapheme total — the SAME substrate endPinOffset reports
 * (graphemeLength = graphemeClusters(normalizeText(article), lang).length).
 * Node/browser Intl.Segmenter parity is the established seed discipline
 * (reading-views.spec.ts totalOf). */
const TOTAL = graphemeClusters(normalizeText(ARTICLE), ARTICLE.lang).length;

/** The persisted location row for the article (raw IndexedDB read — the
 * flush landed BEFORE the navigation; the row IS the truth, keyed
 * [articleId+revision] so the upsert keeps exactly one row). */
async function readLocationRow(
  page: Page,
): Promise<{ graphemeOffset: number } | null> {
  return page.evaluate(async (articleId) => {
    return new Promise((resolve) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("location")) {
          resolve(null);
          return;
        }
        const tx = db.transaction("location", "readonly");
        const getAll = tx.objectStore("location").getAll();
        getAll.onsuccess = () => {
          const rows = (
            getAll.result as Array<{ articleId: string; graphemeOffset: number }>
          ).filter((r) => r.articleId === articleId);
          resolve(rows[rows.length - 1] ?? null);
        };
        getAll.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  }, ARTICLE.id);
}

/** Wait until the persisted row carries the ONE end-pin offset (offset =
 * total — the flush-now seam's write, not a debounced mid-article save). */
async function expectEndPinPersisted(page: Page): Promise<void> {
  await expect
    .poll(async () => (await readLocationRow(page))?.graphemeOffset, {
      timeout: 10_000,
      message: `expected the persisted location row to carry offset=${TOTAL} (the end-pin)`,
    })
    .toBe(TOTAL);
}

test.beforeEach(async ({ page }) => {
  // Stub remote images so fixture figures don't couple to network.
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg/>" }),
  );

  // Mount the SPA so Dexie constructs the lem-reader DB schema, then CLEAR
  // every store's rows for deterministic first-run state (clear-rows, NOT
  // deleteDatabase — the webkit race; the reading-views discipline).
  await page.goto(`${BASE}/`);
  await expect(
    page.getByRole("heading", { name: "Saved articles" }),
  ).toBeVisible({ timeout: 10_000 });
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        const stores = [
          "articles",
          "settings",
          "location",
          "highlights",
          "notes",
          "books",
        ];
        const existing = stores.filter((s) =>
          db.objectStoreNames.contains(s),
        );
        if (existing.length === 0) {
          resolve();
          return;
        }
        const tx = db.transaction(existing, "readwrite");
        for (const s of existing) {
          tx.objectStore(s).clear();
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    });
  });
});

test.describe("Issue #2 — the Mark read and close completion gesture", () => {
  // 15-04 honest-gate run precedent: under full-suite parallel load a
  // webkit context's beforeEach page.goto exceeded the default 30s budget.
  // Assertions unchanged; the budget doubles so load contention cannot
  // flake the spec.
  test.setTimeout(60_000);

  /** The library truth after the gesture: URL, switcher count, card mark. */
  async function expectFinishedLibrary(page: Page): Promise<void> {
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible({ timeout: 10_000 });
    // The shared close contract: back lands on a library route — the entry
    // BEFORE the fragment navigation (hashless BASE or "#/", both parse to
    // the All view; never the article).
    await expect(page).toHaveURL(/(#\/?)?$/);
    // The policy counts the article finished (structural agreement).
    await expect(page.getByRole("link", { name: "Finished (1)" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page
        .locator(".library-row")
        .filter({ hasText: ARTICLE_TITLE })
        .getByText("Finished", { exact: true }),
    ).toBeVisible();
  }

  test("flow placement: marks read, closes to the library, persists the end-pin (scrolling mode)", async ({
    page,
  }) => {
    await page
      .locator(`.library-list a[href="${ARTICLE_HREF}"]`)
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: ARTICLE_TITLE }),
    ).toBeVisible({ timeout: 10_000 });

    // Scrolling mode mounts the flow-placement gesture at the article end
    // (the real mode toggle — the header-geometry clicking discipline).
    await page.getByRole("button", { name: /reading mode/i }).click();
    await expect(page.locator(".page-viewport")).toHaveCount(0);

    await page
      .getByRole("button", { name: "Mark read and close" })
      .click();

    // The shared close contract + the persisted flush truth + agreement.
    await expectFinishedLibrary(page);
    await expectEndPinPersisted(page);

    // Reload is a cold load: the persisted row (not session state) is the
    // truth — the article stays finished.
    await page.reload();
    await expectFinishedLibrary(page);
  });

  test("page placement: the final-page gesture marks read, closes, persists the end-pin (paginated mode)", async ({
    page,
  }) => {
    await page
      .locator(`.library-list a[href="${ARTICLE_HREF}"]`)
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: ARTICLE_TITLE }),
    ).toBeVisible({ timeout: 10_000 });

    // The paginated default mounts the gesture in the fixed bottom chrome
    // band ONLY when the committed page is the last (page === total — the
    // same truth that disables Next). Walk pages with the real Next
    // control until the band button appears; never click a disabled Next
    // (the starter article paginates to one page at the default viewport —
    // page 1 of 1 satisfies the gate per POLISH-02 — so the button is
    // there as soon as pagination settles).
    const pageMark = page.locator(".mark-read-close-page");
    const next = page.getByRole("button", { name: "Next page" });
    for (let i = 0; i < 40; i++) {
      if (await pageMark.isVisible()) break;
      if (!(await next.isEnabled())) break;
      await next.click();
    }
    await expect(pageMark).toBeVisible();

    await pageMark.click();

    await expectFinishedLibrary(page);
    await expectEndPinPersisted(page);

    await page.reload();
    await expectFinishedLibrary(page);
  });

  test("an in-progress article LEAVES the continue-reading strip after the gesture (strip behavior unchanged)", async ({
    page,
  }) => {
    // First open — the initial page-1 commit persists a location, so the
    // article becomes in-progress (opened = started, D14-18).
    await page
      .locator(`.library-list a[href="${ARTICLE_HREF}"]`)
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: ARTICLE_TITLE }),
    ).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(async () => (await readLocationRow(page)) !== null, {
        timeout: 10_000,
        message: "expected the initial location commit to land",
      })
      .toBe(true);

    // Back to the library — the strip now carries the in-progress card.
    await page.getByRole("button", { name: "Back to library" }).click();
    const strip = page.locator(".continue-reading-strip");
    await expect(strip).toBeVisible({ timeout: 10_000 });
    await expect(
      strip.locator(`a.library-card-link[href="${ARTICLE_HREF}"]`),
    ).toBeVisible();

    // Re-open FROM the strip card and complete via the gesture (flow
    // placement — deterministic at any restore offset).
    await strip.locator(`a.library-card-link[href="${ARTICLE_HREF}"]`).click();
    await expect(
      page.getByRole("heading", { level: 1, name: ARTICLE_TITLE }),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /reading mode/i }).click();
    await expect(page.locator(".page-viewport")).toHaveCount(0);
    await page.getByRole("button", { name: "Mark read and close" }).click();

    // The finished article is no longer strip material — with nothing
    // else in-progress, the spare section unmounts entirely (spare-chrome
    // discipline), and the library still agrees (Finished (1)).
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(strip).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Finished (1)" })).toBeVisible({
      timeout: 10_000,
    });
    await expectEndPinPersisted(page);
  });
});
