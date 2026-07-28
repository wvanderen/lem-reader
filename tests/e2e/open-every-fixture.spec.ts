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
