// tests/e2e/library/v1-regression.spec.ts
// Plan 08-05 Task 1 — SC#1 regression bar. The LibraryView replaced
// FixtureList as the default route component (Plan 08-03); this spec is the
// explicit gate that the superset does not regress any v1.0 fixture-open
// path. Iterates EVERY fixture id in the v1.0 corpus (dynamic from
// src/fixtures/index.ts — T-8-20 mitigation: the spec cannot silently skip
// a fixture by hardcoding a subset) and asserts:
//
//   1. The fixture's Open-article link is present on #/ (byte-stable <a>).
//   2. Clicking it navigates to #/article/<id> and ArticleView renders the
//      fixture's provenance.title as <h1> (the load-bearing invariant).
//   3. The ArticleView renders at least one paragraph in the body (the
//      article body mounted, not just the header chrome).
//   4. Browser back returns to #/ and the Saved articles heading is visible
//      (the hash router handles the list route gracefully).
//
// Mirrors tests/e2e/open-every-fixture.spec.ts (the original v1.0 spec) but
// drives navigation through the LibraryView list (clicking the Open-article
// link) rather than navigating directly to the deep #/article/<id> URL. This
// proves the full reader path: list → row → open → read.
//
// Pitfall 8-5 reference: the byte-stable elements (<h1>Saved articles</h1>,
// <a href="#/article/{id}">Open article</a>, <h1>{title}</h1> inside
// ArticleView, <article> body region) are the regression target surface.
// LibraryView is a SUPERSET of FixtureList — the new chrome (SourceBadge,
// ContinueReadingStrip, TagEntry, RemoveConfirm) is additive, not structural.
import { test, expect } from "@playwright/test";
import { fixtures } from "../../../src/fixtures";

const BASE = "http://localhost:5173";
const PIXEL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';

test.beforeEach(async ({ page }) => {
  // Stub remote images so figure-heavy fixtures don't couple to network
  // (open-every-fixture.spec.ts L20-26 pattern).
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: PIXEL_SVG }),
  );

  // Wipe the lem-reader IndexedDB before each test so each test starts from
  // a first-run state (no leftover ingested articles).
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

// SC#1 regression bar: iterate EVERY v1.0 fixture and prove it still opens,
// renders, and returns through the LibraryView surface. Dynamic fixture list
// (T-8-20 mitigation — the spec exercises exactly what the app loads).
for (const article of fixtures) {
  test.describe(`v1 regression: open ${article.id} through LibraryView`, () => {
    test("row present on #/, opens in ArticleView, renders body, returns to #/", async ({
      page,
    }) => {
      // 1. Mount LibraryView at #/.
      await page.goto(`${BASE}/#/`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Saved articles" }),
      ).toBeVisible();

      // 2. The fixture's Open-article link is present on #/ (byte-stable <a>
      //    with aria-labelledby — Pitfall 8-5). Clicking it mounts ArticleView.
      const openLink = page.locator(
        `a[href="#/article/${article.id}"]`,
      );
      await expect(openLink, `Open-article link for ${article.id}`).toBeVisible();
      await openLink.click();

      // 3. Navigation landed at the article route. waitForURL takes a regex
      //    (the URL includes the full origin + path; a literal string would
      //    glob-match the whole URL and miss the fragment).
      await page.waitForURL(new RegExp(`#/article/${article.id}$`), {
        timeout: 10_000,
      });

      // 4. ArticleView renders the fixture's title as <h1> (provenance.title
      //    — the load-bearing v1.0 invariant, identical to open-every-
      //    fixture.spec.ts L47-49).
      await expect(
        page.getByRole("heading", { level: 1, name: article.provenance.title }),
      ).toBeVisible({ timeout: 10_000 });

      // 5. The article body mounted (at least one paragraph visible). This
      //    catches a regression where LibraryView's structure breaks the
      //    ArticleView mount (e.g. a shared context provider fails).
      const paragraphCount = await page.locator("article p").count();
      expect(
        paragraphCount,
        `${article.id}: expected at least one paragraph in the article body`,
      ).toBeGreaterThan(0);

      // 6. Browser back returns to #/ and the Saved articles heading is
      //    visible again (the hash router handles the list route gracefully).
      await page.goBack();
      await expect(
        page.getByRole("heading", { level: 1, name: "Saved articles" }),
      ).toBeVisible();
    });
  });
}
