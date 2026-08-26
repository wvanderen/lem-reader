// tests/e2e/review-panel/route-entry.spec.ts
// Plan 10-02 Task 2 — the REAL route-entry assertions (RECV-01.a),
// replacing the 10-01 Wave-0 sentinel in place (strengthen-only rewrite:
// the file + describe naming carry forward; the sentinel's library-h1
// fallback assertion is superseded by the three-view router).
//
// Verification-map rows owned by this file (10-VALIDATION.md):
//   - RECV-01.a — route entry (#/highlights swap, LibraryView entry button)
//
// Covers (Plan 10-02 Task 2 action; renamed atomically by Plan 15-01 /
// D15-06 — #/highlights is the canonical route, #/review the D15-07
// legacy alias exercised ONLY by case (f)):
//   (a) LibraryView "Highlights" button → #/highlights + panel h1
//   (b) direct deep link BASE#/highlights → panel h1 (route is addressable)
//   (c) browser-back from #/highlights → library h1 returns (history
//       discipline — D10-01: a dedicated route, not a modal, so Back
//       works for free via plain hash assignments)
//   (d) route swap back leaves exactly ONE main#main + one h1 (view swap
//       does not duplicate page landmarks)
//   (e) header gating on the third view: the Header annotations-trigger
//       (/Highlights and notes/) is conditionally rendered — count 0 on
//       #/highlights (App passes articleMounted={view.name === "article"};
//       Header.tsx stays byte-stable, this test PINS the existing L98
//       conditional). Contrast leg: on the article view the trigger IS
//       present, proving the name regex is not vacuously passing.
//   (f) D15-07 alias-compat: a legacy BASE#/review deep link lands on the
//       Highlights page with the URL normalized to #/highlights
//       (replaceState — no extra history entry, so a single Back returns
//       to the library).
//
// Selector discipline: query by role/name (getByRole) — never by CSS class.
import { test, expect } from "@playwright/test";
import { BASE, wipeDatabase, FIXTURES } from "../annotations/_fixtures";

test.describe("RECV-01.a review-panel route entry", () => {
  test.beforeEach(async ({ page }) => {
    await wipeDatabase(page);
  });

  test("(a) LibraryView 'Highlights' button navigates to #/highlights", async ({
    page,
  }) => {
    await page.goto(`${BASE}/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Highlights" }).click();

    await expect(
      page.getByRole("heading", { level: 1, name: "Highlights" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/#\/highlights$/);
  });

  test("(b) #/highlights is directly addressable (deep link)", async ({ page }) => {
    await page.goto(`${BASE}/#/highlights`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Highlights" }),
    ).toBeVisible();
  });

  test("(c) browser-back from #/highlights returns to the library", async ({
    page,
  }) => {
    // Two explicit entries so goBack deterministically lands on the library.
    await page.goto(`${BASE}/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await page.goto(`${BASE}/#/highlights`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Highlights" }),
    ).toBeVisible();

    await page.goBack();

    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
  });

  test("(d) route swap back leaves one main and one h1 (no duplicate landmarks)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/`);
    await page.getByRole("button", { name: "Highlights" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Highlights" }),
    ).toBeVisible();

    await page.goBack();

    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.locator("main#main")).toHaveCount(1);
  });

  test("(e) annotations-trigger is not rendered on #/highlights (articleMounted gating)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/highlights`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Highlights" }),
    ).toBeVisible();

    // Regex name because the aria-label appends a formatted count when
    // highlights exist ("Highlights and notes, 3"). The trigger is
    // conditionally rendered (NOT CSS-hidden) — count 0 proves the Header
    // L98 articleMounted conditional is false outside the article view.
    await expect(
      page.getByRole("button", { name: /Highlights and notes/ }),
    ).toHaveCount(0);

    // Contrast leg — the same regex matches on the article view, so the
    // zero-count above pins the gating rather than a bad selector.
    await page.goto(`${BASE}/#/article/${FIXTURES[0]}`);
    await expect(
      page.getByRole("button", { name: /Highlights and notes/ }),
    ).toBeVisible();
  });

  // Plan 15-01 (D15-07) — the ONLY deliberate alias-exercise goto in the
  // suite: a legacy #/review deep link must land on the Highlights page
  // with the URL normalized to the canonical #/highlights. Normalization
  // is history.replaceState (never pushState — D14-14 Back-count
  // semantics), so NO extra history entry exists: a single browser Back
  // crosses the alias straight to the library that preceded it. (A
  // pushState implementation would fail this — Back would re-land on a
  // #/review entry that normalizes again, and the library would need a
  // second Back.)
  test("(f) legacy #/review deep link lands on Highlights with the URL normalized (D15-07 alias)", async ({
    page,
  }) => {
    // Two explicit entries so goBack deterministically tests the entry
    // count (mirrors case (c)'s discipline).
    await page.goto(`${BASE}/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await page.goto(`${BASE}/#/review`);

    // The alias lands on the Highlights page…
    await expect(
      page.getByRole("heading", { level: 1, name: "Highlights" }),
    ).toBeVisible();
    // …and the URL is normalized to the canonical form.
    await expect(page).toHaveURL(/#\/highlights$/);

    // Single-entry Back semantics: replaceState added no history entry,
    // so one Back crosses directly to the library.
    await page.goBack();
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
  });
});
