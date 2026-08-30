// tests/e2e/chrome/back-nav.spec.ts
// POLISH-05 / D13-15 — the standardized "Back to library" affordance,
// proven on BOTH mount points (ArticleView's article header + ReviewView's
// review header) across all 3 engines (plain test() inherits the matrix):
//
//   (a) in-app return from an article — library → article → Back →
//       history.back() lands on the library at exactly "#/"
//   (b) deep-link fallback — a FRESH context goto of a fixture article
//       (no in-app history; App's hasAppHistory flag is false) → Back
//       assigns the literal "#/" route → library visible AND the page never
//       navigated away from the app origin (Pitfall 7 — history.back() on a
//       deep-link tab would exit the app; the fallback makes that
//       unreachable)
//   (c) review panel — both the in-app return (library → review → Back)
//       and the deep-link fallback (fresh #/highlights → Back → #/)
//   (d) keyboard — the control is a role=button with accessible name
//       "Back to library", Tab-reachable from the page top in DOM order
//       (chromium + firefox; webkit skips links/buttons in sequential
//       navigation — the 09-06 stacked-modal engine-divergence precedent,
//       degraded to focusability + Enter activation there) and Enter-
//       activatable on every engine
//
// Harness discipline: no DB wipe needed (the fixture corpus is app-bundled
// and the library rows mount without seeding — the open-every-fixture
// precedent); image stub keeps loads deterministic; no fixed sleeps for
// load-bearing assertions (toBeVisible auto-waiting only — Pitfall 8).
import { test, expect, type Page } from "@playwright/test";

const BASE = "http://localhost:5173";
const PIXEL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';

test.beforeEach(async ({ page }) => {
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: PIXEL_SVG }),
  );
});

/** The shared back affordance (role + accessible name — the a11y contract). */
function backToLibrary(page: Page) {
  return page.getByRole("button", { name: "Back to library" });
}

/** The library's byte-stable h1 (the arrival proof for every case). */
function libraryHeading(page: Page) {
  return page.getByRole("heading", { level: 1, name: "Saved articles" });
}

/**
 * Keyboard-order proof, engine-honest (the a11y.spec.ts 09-06 precedent):
 * chromium + firefox follow DOM order in sequential navigation, so the
 * Tab-walk asserts there. WebKit's default sequential navigation skips
 * links/buttons (Safari form-controls-only), so on webkit the claim
 * degrades to programmatic focusability + Enter activation (asserted
 * separately on every engine).
 */
function tabOrderFollowsDom(): boolean {
  return test.info().project.name !== "webkit";
}

/** Press Tab up to maxPresses times from the current focus until the
 *  active element matches selector. Returns true when the walk landed. */
async function tabWalkUntil(
  page: Page,
  targetSelector: string,
  maxPresses: number,
): Promise<boolean> {
  for (let i = 0; i < maxPresses; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(60);
    const matched = await page.evaluate(
      (s) => document.activeElement?.matches(s) ?? false,
      targetSelector,
    );
    if (matched) return true;
  }
  return false;
}

test("(a) in-app: library → article → Back to library returns to the library at #/", async ({
  page,
}) => {
  await page.goto(`${BASE}/#/`);
  await expect(libraryHeading(page)).toBeVisible({ timeout: 10_000 });

  // Open an article through its library row (a real in-app navigation that
  // pushes a history entry and flips App's hasAppHistory flag).
  await page.locator(".library-list a[href^='#/article/']").first().click();
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(
    "Saved articles",
  );
  await expect(backToLibrary(page)).toBeVisible();

  // history.back() → the prior "#/" entry; the router swaps to the library.
  await backToLibrary(page).click();
  await expect(libraryHeading(page)).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/#\/$/);
});

test("(b) deep link: fresh article URL → Back to library lands at #/ without leaving the app", async ({
  page,
}) => {
  const appOrigin = new URL(BASE).origin;
  // Fresh context direct goto — no prior in-app entry (hasAppHistory false).
  await page.goto(`${BASE}/#/article/essay-long-form`);
  await expect(backToLibrary(page)).toBeVisible({ timeout: 10_000 });

  await backToLibrary(page).click();
  await expect(libraryHeading(page)).toBeVisible({ timeout: 10_000 });

  // The fallback assigned the literal "#/" route (parseHash → list)…
  const hash = await page.evaluate(() => window.location.hash);
  expect(hash).toBe("#/");
  // …and the page NEVER navigated away from the app origin (Pitfall 7).
  expect(new URL(page.url()).origin).toBe(appOrigin);
});

test("(c) in-app: library → review panel → Back to library returns to the library", async ({
  page,
}) => {
  await page.goto(`${BASE}/#/`);
  await expect(libraryHeading(page)).toBeVisible({ timeout: 10_000 });

  // The shell Highlights link (Plan 15-02 / OQ1 — the D10-02 in-page button
  // is gone; nav Primary holds the sole library→highlights entry).
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Highlights" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Highlights" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(backToLibrary(page)).toBeVisible();

  // history.back() on the REVIEW mount → the prior "#/" entry.
  await backToLibrary(page).click();
  await expect(libraryHeading(page)).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/#\/$/);
});

test("(c) deep link: fresh #/highlights → Back to library falls back to #/ (Enter activation)", async ({
  page,
}) => {
  // Fresh context direct goto — the review mount's deep-link fallback, and
  // keyboard activation (focused button + Enter) covers the review mount's
  // operability without a pointer.
  await page.goto(`${BASE}/#/highlights`);
  await expect(backToLibrary(page)).toBeVisible({ timeout: 10_000 });

  await backToLibrary(page).focus();
  await expect(backToLibrary(page)).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(libraryHeading(page)).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/#\/$/);
});

test("(d) keyboard: Back to library is Tab-reachable from the article top and Enter-activatable", async ({
  page,
}) => {
  await page.goto(`${BASE}/#/`);
  await expect(libraryHeading(page)).toBeVisible({ timeout: 10_000 });
  await page.locator(".library-list a[href^='#/article/']").first().click();
  await expect(backToLibrary(page)).toBeVisible({ timeout: 10_000 });

  // The control's identity contract: role button + accessible name.
  await expect(backToLibrary(page)).toHaveAttribute("type", "button");

  // Tab from the page top (the skip link is the FIRST focusable in DOM
  // order — App.tsx) walks the app-header controls and reaches the back
  // affordance at the article header start, in DOM order. Chromium +
  // firefox only (webkit sequential-nav divergence — see header comment).
  if (tabOrderFollowsDom()) {
    await page.locator("a.skip-link").focus();
    await expect(page.locator("a.skip-link")).toBeFocused();
    // Plan 18-03 adjacency sweep (Rule 1 — stale budget, pre-existing from
    // 18-02): the walk cap was calibrated to the pre-18-02 four-button
    // article-scoped header; D18-02's locked 5th button (contents, FIRST in
    // the group) inserted one focusable, so DOM order to the back affordance
    // is now skip-link → wordmark → Library → Highlights → contents → tags
    // → annotations → mode → gear → back-to-library = 9 presses. The
    // assertion's contract (Tab-reachability in DOM order within a bounded
    // walk) is unchanged — only the bound tracks the sanctioned anatomy.
    expect(
      await tabWalkUntil(page, "button.back-to-library", 9),
      "Tab from the skip link must reach Back to library in DOM order",
    ).toBe(true);
    // Enter while focused → history.back() (the in-app path) → library.
    await page.keyboard.press("Enter");
    await expect(libraryHeading(page)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/#\/$/);
  } else {
    // webkit: programmatic focusability + Enter activation carry the claim.
    await backToLibrary(page).focus();
    await expect(backToLibrary(page)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(libraryHeading(page)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/#\/$/);
  }
});

// Plan 14-04 Task 2 — strengthen-only addition (D14-13/D14-14): view
// switches are replaceState, so the library's single history entry carries
// the switched-to view URL. Back from an article must return to the
// SWITCHED-TO view — never an intermediate view entry (views are
// state-within-destination, not destinations).
test("(e) view-route: library → switcher view → article → Back returns to the library at the switched-to view URL", async ({
  page,
}) => {
  await page.goto(`${BASE}/#/`);
  await expect(libraryHeading(page)).toBeVisible({ timeout: 10_000 });

  // Switch views via the switcher (replaceState — the in-app gesture; the
  // unmodified fixture corpus keeps Unread populated).
  await page.getByRole("link", { name: /^Unread \(\d+\)/ }).click();
  await expect(page).toHaveURL(/#\/unread$/);

  // Open an article through its library row (a real destination PUSH).
  await page.locator(".library-list a[href^='#/article/']").first().click();
  await expect(backToLibrary(page)).toBeVisible({ timeout: 10_000 });

  // Back → the library at #/unread (the entry the reader actually left),
  // with the Unread view's aria-current in place.
  await backToLibrary(page).click();
  await expect(libraryHeading(page)).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/#\/unread$/);
  await expect(
    page.locator(".view-switcher a[aria-current='page']"),
  ).toHaveAttribute("href", "#/unread");
});

