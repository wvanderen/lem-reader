// tests/e2e/library/search-tag-filter.spec.ts
// Plan 08-05 Task 2 — SC#3 + LIB-03 + LIB-04 phase-exit e2e gate. Proves the
// library search + tag-filter composition: tag entry via TagEntry (D8-05),
// chip-based tag filter (D8-07), auto-prune when the last article loses the
// tag (D8-08), search by title/author/domain/tag-name (D8-06), and search +
// tag composition (intersection).
//
// Harness (cloned from happy-path.spec.ts):
//   - BASE URL:    http://localhost:5173
//   - beforeEach:  image-stub + IndexedDB wipe
//   - article ingest: paste-HTML via IngestControl (real Vite Node middleware)
//
// Test corpus: 3 ingested paste-HTML articles with distinct titles:
//   - "Plato Essay" (no tags initially)
//   - "Marcus Meditations" (no tags initially)
//   - "Seneca Letters" (no tags initially)
// Tag "stoic" is added to two of them via TagEntry (D8-05) to exercise:
//   - chip strip rendering (D8-07)
//   - chip toggle (single-select — D8-07)
//   - auto-prune when the last article loses the tag (D8-08)
//   - search by tag name (D8-06 — tags are first-class searchable metadata)
//
// Threat register:
//   - T-8-19 (Repudiation, false-positive verification) → the search + tag
//     composition assertion checks the INTERSECTION (both filters apply),
//     not just one. Empty-results test asserts no crash + no rows.
import { test, expect } from "@playwright/test";

const BASE = "http://localhost:5173";

// Three distinct paste-HTML articles rich enough to clear the ING-06
// confidence thresholds + the round-trip anchor gate. Each has a unique
// title so search-by-title assertions are deterministic.
const PLATO_HTML = pasteHtml("Plato Essay", "Plato");
const MARCUS_HTML = pasteHtml("Marcus Meditations", "Marcus Aurelius");
const SENECA_HTML = pasteHtml("Seneca Letters", "Seneca");

/**
 * Build a paste-HTML payload with the given title + author. Long enough to
 * clear ING-06 + the round-trip anchor gate; varied enough that the
 * selectors resolve confidently.
 */
function pasteHtml(title: string, author: string): string {
  return `<!DOCTYPE html>
<html><head><title>${title}</title></head>
<body>
<article>
<h1>${title}</h1>
<p><address>${author}</address></p>
<p>The first paragraph of ${title}. Long enough to clear the ING-06
confidence threshold (textLength >= 500) and varied enough that the round-
trip anchor gate samples five grapheme offsets that all resolve to confident
via the shipped TextQuoteSelector machinery. The library surfaces this
ingested article under the same Saved articles heading, the same per-row
structure, and the same open-article gesture as a bundled v1.0 fixture.</p>
<p>The second paragraph continues the long-form prose. The reading engine
cannot tell this ingested article from a fixture — that is the load-bearing
invariant of Phase 7 and Phase 8. Pagination, annotation, location restore,
and the accessible reading surface all behave identically because the article
IS a CanonicalArticle by the time it reaches ArticleView.</p>
<p>The third paragraph closes the corpus. The reader who reaches this
article via #/article/&lt;id&gt; sees the same h1 + paragraph structure, the
same reading-mode toggle, the same annotation toolbar, and the same scroll
or paginate behavior as a bundled fixture. The library surfaces the article
without distinguishing its origin except via the quiet source badge.</p>
</article>
</body></html>`;
}

/**
 * Ingest a paste-HTML article via IngestControl. Returns after navigation
 * to #/article/<id> completes. Caller is responsible for navigating back
 * to #/ when needed.
 */
async function ingestPaste(page: import("@playwright/test").Page, html: string) {
  await page
    .getByRole("textbox", { name: /paste html/i })
    .fill(html);
  await page.getByRole("button", { name: /add pasted article/i }).click();
  await page.waitForURL(/#\/article\//, { timeout: 15_000 });
}

/**
 * Navigate to #/ and wait for the library list to be ready (at least one
 * row visible). The LibraryView load effect resolves async after mount;
 * returning before the list renders causes .count() snapshots to race.
 */
async function openLibrary(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    window.location.hash = "#/";
  });
  await expect(
    page.getByRole("heading", { level: 1, name: "Saved articles" }),
  ).toBeVisible();
  // Wait for the list to mount (at least one row).
  await expect(page.locator(".library-list > li").first()).toBeVisible({
    timeout: 10_000,
  });
}

test.beforeEach(async ({ page }) => {
  // Stub remote images so figure-heavy fixtures don't couple to network.
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg/>" }),
  );

  // Wipe the lem-reader IndexedDB before each test (happy-path pattern).
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

test.describe("SC#3 + LIB-03 + LIB-04 — search + tag filter + auto-prune", () => {
  test("tag entry via TagEntry renders chip on row + filter chip on library (D8-05 + D8-07)", async ({
    page,
  }) => {
    // Ingest the three-article corpus.
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await ingestPaste(page, PLATO_HTML);
    await openLibrary(page);
    await ingestPaste(page, MARCUS_HTML);
    await openLibrary(page);
    await ingestPaste(page, SENECA_HTML);
    await openLibrary(page);

    // Navigate to one article's ArticleView. TagEntry is mounted in the
    // ArticleView <header> (Pitfall 8-5 — inert at mount; reader activates
    // via Tab/Click). Add tag "stoic".
    const platoRow = page
      .locator(".library-list > li")
      .filter({ hasText: "Plato Essay" });
    await platoRow.locator('a[href^="#/article/"]').click();
    await page.waitForURL(/#\/article\//, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: "Plato Essay" }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // TagEntry: focus input, type "stoic", press Enter (or click Add tag).
    const tagInput = page.locator("input#tag-entry-new");
    await tagInput.fill("stoic");
    await page.getByRole("button", { name: /add tag/i }).click();

    // The chip appears in the TagEntry fieldset (display-only span).
    await expect(
      page.locator(".tag-entry-list .tag-chip-readonly").filter({ hasText: "stoic" }),
    ).toBeVisible();

    // Navigate back to #/. TagFilter derives its tags from loadAllTags
    // (Plan 02) which Zod-validates every article row; the "stoic" tag is
    // now present on the Plato article.
    await openLibrary(page);

    // TagFilter chip strip shows "stoic" (D8-07).
    const stoicChip = page
      .locator(".tag-filter .tag-chip")
      .filter({ hasText: "stoic" });
    await expect(stoicChip).toBeVisible();

    // Activate the chip (single-select). aria-pressed={true} conveys state
    // beyond color (forced-colors safety — UI-SPEC §Interaction 10).
    await stoicChip.click();
    await expect(stoicChip).toHaveAttribute("aria-pressed", "true");

    // The library list filters to only articles carrying "stoic" (D8-07 —
    // single-tag AND-style). Only the Plato article has the tag.
    const filteredRows = page.locator(".library-list > li");
    await expect(filteredRows).toHaveCount(1);
    await expect(filteredRows).toContainText("Plato Essay");

    // Click the active chip again — the filter clears (all rows reappear).
    await stoicChip.click();
    await expect(stoicChip).toHaveAttribute("aria-pressed", "false");
    // Library list count grows back to fixtures.length + 3 ingested.
    const { fixtures } = await import("../../../src/fixtures");
    await expect(page.locator(".library-list > li")).toHaveCount(
      fixtures.length + 3,
    );
  });

  test("auto-prune: removing the last instance of a tag clears the chip (D8-08)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await ingestPaste(page, PLATO_HTML);
    await openLibrary(page);
    await ingestPaste(page, MARCUS_HTML);
    await openLibrary(page);

    // Add "stoic" to the Plato article.
    const platoRow = page
      .locator(".library-list > li")
      .filter({ hasText: "Plato Essay" });
    await platoRow.locator('a[href^="#/article/"]').click();
    await page.waitForURL(/#\/article\//, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: "Plato Essay" }).first(),
    ).toBeVisible({ timeout: 10_000 });
    await page.locator("input#tag-entry-new").fill("stoic");
    await page.getByRole("button", { name: /add tag/i }).click();
    await expect(
      page.locator(".tag-entry-list .tag-chip-readonly").filter({ hasText: "stoic" }),
    ).toBeVisible();

    // Back to #/ — chip present.
    await openLibrary(page);
    await expect(
      page.locator(".tag-filter .tag-chip").filter({ hasText: "stoic" }),
    ).toBeVisible();

    // Remove "stoic" from the Plato article (the ONLY article carrying it).
    // Use the × remove on the TagEntry chip (NOT the TagFilter chip).
    await platoRow.locator('a[href^="#/article/"]').click();
    await page.waitForURL(/#\/article\//, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: "Plato Essay" }).first(),
    ).toBeVisible({ timeout: 10_000 });
    await page
      .locator(".tag-entry-list li")
      .filter({ hasText: "stoic" })
      .locator(".tag-chip-remove")
      .click();
    // The chip leaves the TagEntry fieldset.
    await expect(
      page.locator(".tag-entry-list .tag-chip-readonly").filter({ hasText: "stoic" }),
    ).toHaveCount(0);

    // Back to #/. Auto-prune (D8-08) — the TagFilter chip strip no longer
    // renders "stoic" because no article carries it. loadAllTags Set-based
    // derivation drops it implicitly (no cleanup write).
    await openLibrary(page);
    await expect(
      page.locator(".tag-filter .tag-chip").filter({ hasText: "stoic" }),
    ).toHaveCount(0);
  });

  test("search by title + clear query (D8-06)", async ({ page }) => {
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await ingestPaste(page, PLATO_HTML);
    await openLibrary(page);
    await ingestPaste(page, MARCUS_HTML);
    await openLibrary(page);
    await ingestPaste(page, SENECA_HTML);
    await openLibrary(page);

    // Search input is the LibrarySearch controlled <input type="search">.
    // (id="library-search", name="q" — see LibrarySearch.tsx.)
    // Use "marcus" rather than "plato" because the footnote-academic
    // fixture's sourceUrl domain is "plato.stanford.edu" — D8-06 search
    // haystack includes the domain, so "plato" would match both Plato Essay
    // AND the Stanford Encyclopedia of Philosophy fixture. "marcus" matches
    // only the ingested Marcus article title.
    const searchInput = page.locator("input#library-search");
    await searchInput.fill("marcus");

    // Only the "Marcus Meditations" row remains (D8-06 — title is in the
    // haystack; no fixture or other ingested article matches).
    const filteredRows = page.locator(".library-list > li");
    await expect(filteredRows).toHaveCount(1);
    await expect(filteredRows).toContainText("Marcus Meditations");

    // Clear the query — all rows reappear.
    await searchInput.fill("");
    const { fixtures } = await import("../../../src/fixtures");
    await expect(page.locator(".library-list > li")).toHaveCount(
      fixtures.length + 3,
    );
  });

  test("search by tag name + composition with active tag (D8-06 + D8-07)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await ingestPaste(page, PLATO_HTML);
    await openLibrary(page);
    await ingestPaste(page, MARCUS_HTML);
    await openLibrary(page);

    // Add "stoic" to the Plato article.
    const platoRow = page
      .locator(".library-list > li")
      .filter({ hasText: "Plato Essay" });
    await platoRow.locator('a[href^="#/article/"]').click();
    await page.waitForURL(/#\/article\//, { timeout: 10_000 });
    await page.locator("input#tag-entry-new").fill("stoic");
    await page.getByRole("button", { name: /add tag/i }).click();
    await openLibrary(page);

    // Search by tag name — tags are first-class searchable metadata (D8-06).
    const searchInput = page.locator("input#library-search");
    await searchInput.fill("stoic");
    await expect(page.locator(".library-list > li")).toContainText("Plato Essay");

    // Composition: activate the "stoic" chip AND type a query. Both filters
    // apply (intersection — libraryFilter.filterLibrary).
    const stoicChip = page
      .locator(".tag-filter .tag-chip")
      .filter({ hasText: "stoic" });
    await stoicChip.click();
    await expect(stoicChip).toHaveAttribute("aria-pressed", "true");

    // Both filters apply: tag=stoic AND query=stoic. Plato matches both.
    await expect(page.locator(".library-list > li")).toContainText("Plato Essay");

    // Change query to "marcus" — composition with tag=stoic returns 0 rows
    // (Marcus has no "stoic" tag).
    await searchInput.fill("marcus");
    await expect(page.locator(".library-list > li")).toHaveCount(0);
  });

  test("empty search results: no rows + no crash", async ({ page }) => {
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await ingestPaste(page, PLATO_HTML);
    await openLibrary(page);

    // Type a nonexistent string — graceful empty state.
    await page.locator("input#library-search").fill("zzzz-not-a-real-query");
    await expect(page.locator(".library-list > li")).toHaveCount(0);

    // The page itself didn't crash — the Saved articles heading is still
    // visible (LibraryView handles empty-results gracefully).
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
  });
});
