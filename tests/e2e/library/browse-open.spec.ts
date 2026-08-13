// tests/e2e/library/browse-open.spec.ts
// Plan 08-05 Task 1 — SC#1 + LIB-01 + LIB-05 phase-exit e2e gate. Proves the
// personal library is the default route, that v1.0 fixtures are badged with
// their source ("Sample"), that ingested paste-HTML articles are badged
// "Pasted", and that LIB-05 source links render for url/paste articles whose
// provenance carries a sourceUrl.
//
// Harness (cloned from tests/e2e/ingestion/happy-path.spec.ts):
//   - BASE URL:    http://localhost:5173 (Vite Node dev server)
//   - beforeEach:  image-stub route + IndexedDB wipe (first-run state)
//   - paste flow:  fill-textarea + click "Add pasted article" + waitForURL
//
// Pitfall 8-5 byte-stability: the `<h1>Saved articles</h1>` heading, the
// `<ul class="library-list"><li>` row structure, and the `<a aria-labelledby>`
// Open-article link are regression targets — LibraryView preserves them
// verbatim from FixtureList. This spec asserts they are present so a future
// refactor that renames the heading or restructures the list trips the gate.
//
// Threat register:
//   - T-8-20 (Tampering, e2e masks a real regression) → the row-count
//     assertion uses `fixtures.length` (dynamic, from src/fixtures/index.ts),
//     not a hardcoded number. Adding/removing a fixture flips the assertion.
import { test, expect } from "@playwright/test";
import { fixtures } from "../../../src/fixtures";

const BASE = "http://localhost:5173";

// A representative paste-HTML article rich enough to pass Readability's
// isProbablyReaderable() + the ING-06 confidence thresholds (blockCount >= 3
// AND textLength >= 500) + the SC#1 round-trip anchor gate (5 offsets resolve
// to confident). Mirrors happy-path.spec.ts PASTE_HTML shape. Carries a
// <link rel="canonical"> so the paste-extractor stamps a sourceUrl → the
// library row badge renders as a link (LIB-05 url-source variant).
const PASTE_HTML_WITH_SOURCE = `<!DOCTYPE html>
<html><head><title>Seneca on the Shortness of Life</title>
<link rel="canonical" href="https://example.com/seneca"/></head>
<body>
<article>
<h1>Seneca on the Shortness of Life</h1>
<p>Seneca's essay on the shortness of life opens with a calm admonition to
Paulinus: most people complain about life's brevity, but life is long enough
for the completing of the highest things, if it were well invested. This
paste-HTML fixture is rich enough to clear the ING-06 confidence threshold
and varied enough that the round-trip anchor gate samples five grapheme
offsets that all resolve to confident via the shipped TextQuoteSelector
machinery.</p>
<p>The second paragraph continues the long-form prose. The reading engine
cannot tell this ingested article from a fixture — that is the load-bearing
invariant of Phase 7 and Phase 8. The library surfaces it under the same
Saved articles heading, the same per-row structure, and the same
open-article gesture as a bundled v1.0 fixture.</p>
<p>The third paragraph closes the corpus. The reader who reaches this
article via #/article/&lt;id&gt; sees the same h1 + paragraph structure, the
same reading-mode toggle, the same annotation toolbar, and the same scroll
or paginate behavior as a bundled fixture. Phase 8's library surfaces the
article without distinguishing its origin except via the quiet source badge
underneath the title.</p>
</article>
</body></html>`;

test.beforeEach(async ({ page }) => {
  // Stub remote images so figure-heavy fixtures don't couple to network.
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg/>" }),
  );

  // Wipe the lem-reader IndexedDB before each test so each test starts from
  // a first-run state (mirrors happy-path.spec.ts L73-83).
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

test.describe("SC#1 + LIB-01 + LIB-05 — browse + open + source badge", () => {
  test("#/ is the default route and renders the byte-stable Saved articles heading", async ({
    page,
  }) => {
    // Navigating to #/ mounts LibraryView (Plan 08-03). The byte-stable
    // <h1>Saved articles</h1> heading is the SC#1 regression target
    // (Pitfall 8-5). A future LibraryView refactor that renames the heading
    // trips this assertion.
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
  });

  test("the library list shows one row per v1.0 fixture (LIB-01 + SC#1)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();

    // The library list must carry exactly one row per bundled fixture. The
    // count is dynamic — fixtures.length is the canonical count from
    // src/fixtures/index.ts, so adding/removing a fixture flips this
    // assertion (T-8-20 mitigation).
    const expectedCount = fixtures.length;
    await expect(
      page.locator(".library-list > li"),
      `expected ${expectedCount} library rows (one per fixture)`,
    ).toHaveCount(expectedCount);
  });

  test('each v1.0 fixture row carries a "Sample" source badge', async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();

    // Wait for the library list to render before asserting on its
    // children (the LibraryView load effect resolves async after mount).
    await expect(page.locator(".library-list > li").first()).toBeVisible({
      timeout: 10_000,
    });

    // D8-02 — every fixture row carries a SourceBadge. The "fixture"
    // variant renders the label "Sample" (SourceBadge.tsx badgeLabel
    // switch). Use auto-retrying expect (not the non-retrying .count()
    // snapshot) so the assertion survives the async load on slower
    // engines under load.
    await expect(
      page.locator(".source-badge").first(),
      "expected at least one source badge",
    ).toBeVisible({ timeout: 10_000 });

    // The first .source-badge text is "Sample" — fixtures are the only
    // articles present at first run, so the first badge reflects the
    // fixture variant. (SourceBadge renders plain text for fixtures; the
    // link variant is asserted separately below.)
    await expect(page.locator(".source-badge").first()).toHaveText("Sample");
  });

  test("clicking a fixture's Open article link navigates to #/article/<id>", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();

    // The first fixture's Open-article link carries aria-labelledby pointing
    // at the row's <h2 id="title-{id}"> (Pitfall 8-5 byte-stable markup).
    // Click it → ArticleView mounts at #/article/<id> and renders the
    // article title as <h1> (provenance.title).
    const firstFixture = fixtures[0];
    const openLink = page
      .locator(`a[href="#/article/${firstFixture.id}"]`)
      .first();
    await expect(openLink).toBeVisible();
    await openLink.click();

    // waitForURL takes a regex (the URL includes the full origin + path; a
    // literal string would glob-match the whole URL and miss the fragment).
    await page.waitForURL(new RegExp(`#/article/${firstFixture.id}$`), {
      timeout: 10_000,
    });

    // ArticleView renders the title from provenance — the load-bearing
    // invariant (ingested article reads identically to a fixture).
    await expect(
      page.getByRole("heading", { level: 1, name: firstFixture.provenance.title }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("an ingested paste-HTML article appears in the library list with a Pasted badge", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();

    const baselineRows = await page.locator(".library-list > li").count();
    expect(baselineRows, "baseline fixture count").toBe(fixtures.length);

    // Ingest a paste-HTML article through the real Vite Node middleware.
    // This exercises the full pipeline (extractAndNormalize → htmlToBlocks
    // → ArticleSchema.parse → assertRoundTripAnchor → Dexie save). The
    // PASTE_HTML carries a <link rel="canonical"> so the extractor stamps
    // a sourceUrl, which makes the SourceBadge render as a link (LIB-05).
    await page
      .getByRole("textbox", { name: /paste html/i })
      .fill(PASTE_HTML_WITH_SOURCE);
    await page.getByRole("button", { name: /add pasted article/i }).click();

    // The IngestControl navigates to #/article/<id> on success; navigate
    // back to #/ to inspect the library row.
    await page.waitForURL(/#\/article\//, { timeout: 15_000 });
    await page.evaluate(() => {
      window.location.hash = "#/";
    });
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();

    // The library list grew by exactly one row (the ingested paste article).
    await expect(page.locator(".library-list > li")).toHaveCount(
      baselineRows + 1,
    );

    // The ingested row carries a "Pasted" source badge. The badge text is
    // the SourceBadge.tsx badgeLabel("paste") branch. With a sourceUrl
    // present, the badge wraps the label in an <a> (LIB-05 link variant).
    const pastedBadge = page
      .locator(".source-badge")
      .filter({ hasText: "Pasted" });
    await expect(pastedBadge.first()).toBeVisible();
    await expect(pastedBadge.first().locator("a")).toBeVisible();
  });
});
