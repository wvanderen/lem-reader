// tests/e2e/open-every-fixture.spec.ts
// DOC-01 smoke test across the full curated corpus. Iterates the canonical
// `fixtures` array (so the spec exercises exactly what the app loads) and
// opens each article via its hash route. Per fixture: asserts the <h1> (from
// provenance.title) is visible, the DOC-03 source-URL link is present, the
// article body region renders, and no JS-level console errors were emitted
// during load. Also asserts the fixture-list route exposes one row per fixture.
//
// External images are stubbed to a 1×1 GIF so the suite is deterministic and
// not at the mercy of network availability (figure-heavy loads remote
// Wikimedia images). We assert against JS errors / uncaught exceptions, not
// resource-load noise.
import { test, expect } from "@playwright/test";
import { fixtures } from "../../src/fixtures";
import { DEFAULT_SETTINGS } from "../../src/settings/defaults";
import { seedRows, prepareFreshPage } from "./portability/_portability";

const BASE = "http://localhost:5173";
// Pure-string SVG stub so remote <img> elements (figure-heavy's Wikimedia
// figures) load deterministically without network dependence. SVG is text, so
// no Buffer / @types/node is needed.
const PIXEL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';

test.beforeEach(async ({ page }) => {
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: PIXEL_SVG }),
  );
});

for (const article of fixtures) {
  test.describe(`open ${article.id}`, () => {
    test("renders title, source link, body; no console errors", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          const text = msg.text();
          // Ignore pure resource-load failures (external network), which are
          // not app-health signals and are already mitigated by image stubbing.
          if (!/Failed to load resource|net::|ERR_|Status code/i.test(text)) {
            errors.push(text);
          }
        }
      });

      await page.goto(`${BASE}/#/article/${article.id}`);

      // DOC-03: <h1> rendered from provenance.title
      await expect(
        page.getByRole("heading", { level: 1, name: article.provenance.title }),
      ).toBeVisible();

      // DOC-03: source-URL link to the original publisher
      await expect(
        page.getByRole("link", { name: /Originally published at/ }),
      ).toBeVisible();

      // DOC-02: article body region present
      await expect(page.getByRole("article")).toBeVisible();

      // No app-level console errors / uncaught exceptions during load
      expect(errors, errors.join("\n")).toEqual([]);
    });
  });
}

test("fixture list exposes one row per curated fixture (DOC-01)", async ({ page }) => {
  await page.goto(`${BASE}/`);
  const articleLinks = page.locator('a[href^="#/article/"]');
  await expect(articleLinks).toHaveCount(fixtures.length);
});

// Gap 3 / UAT test 10: the footnote round-trip stays in-article. Clicking a
// forward footnote-reference marker must scroll to the footnote body WITHOUT
// unmounting the article (the Task 1 router guard ignores the bare #fn-N
// fragment), and the new back-link (Task 2) scrolls back to the reference
// the same way. figure-heavy carries three footnote-reference blocks and
// three matching footnote bodies (per 01-03 SUMMARY). Scoped to figure-heavy
// (outside the per-fixture loop). Image stubbing from the top-level
// beforeEach still applies (figure-heavy loads remote Wikimedia images).
//
// Plan 13-09 (G4): the round-trip is a scrolling-flow interaction — native
// fragment scrolling to the footnote body and back. Before G4 it ran under
// the paginated default but only worked by clicking the marker inside the
// pre-settle scrolling window, the exact first-paint surface this plan
// removed (in settled paginated mode the DOM-first marker lives inside the
// hidden measurement clone and footnote bodies sit on other pages). Pinned
// to scrolling mode via persisted settings in BOTH truths (Dexie row +
// settings mirror — the cold-load-no-snap SC#1 seeding discipline) with an
// about:blank hop so the seeded row hydrates on a true cold load. The
// default-mode first-paint surface now has its own dedicated contract in
// polish/first-paint-mode-surface.spec.ts.
test("footnote round-trip stays in-article (figure-heavy, Gap 3)", async ({ page }) => {
  const SCROLLING = { ...DEFAULT_SETTINGS, readingMode: "scrolling" as const };
  // prepareFreshPage waits for the app to mount BEFORE clearing/seeding —
  // seeding concurrent with Dexie's first open/upgrade loses the write on
  // webkit (observed: hydration read no row and self-corrected the mirror
  // back to the paginated default). The cold-load-no-snap discipline.
  await prepareFreshPage(page);
  await seedRows(page, { settings: [{ key: "reader-prefs", value: SCROLLING }] });
  await page.addInitScript(
    (seed) => {
      try {
        localStorage.setItem("lem-settings-mirror-v1", seed);
      } catch {
        /* best-effort (about:blank hop) */
      }
    },
    JSON.stringify(SCROLLING),
  );
  await page.goto("about:blank");
  await page.goto(`${BASE}/#/article/figure-heavy`);
  const articleH1 = page.getByRole("heading", { level: 1, name: "Hummingbird" });
  await expect(articleH1).toBeVisible();

  // Forward: click the first footnote-reference marker.
  const forwardMarker = page.locator('sup > a[href^="#fn-"]').first();
  await forwardMarker.click();

  // The hash is now an in-page fragment (NOT a #/article/... route), the
  // article is still mounted, and the target footnote body is present.
  await expect(page).toHaveURL(/\/#fn-\d+$/);
  await expect(articleH1).toBeVisible();
  await expect(page.locator("li#fn-1")).toBeVisible();

  // Back: click the first back-link inside the Footnotes region.
  const backLink = page.locator('section[aria-label="Footnotes"] a[href^="#fn-ref-"]').first();
  await backLink.click();

  // The hash is now an in-page reference fragment, and the article is still
  // mounted (no route swap back to the fixture list).
  await expect(page).toHaveURL(/\/#fn-ref-\d+$/);
  await expect(articleH1).toBeVisible();
});
