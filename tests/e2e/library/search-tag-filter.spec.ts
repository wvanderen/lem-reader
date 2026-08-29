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
//   - article ingest: paste-HTML via the Add dialog (real Vite Node middleware)
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
// Plan 16-03 — the shared dialog-opening helper (ADD-01: the intake
// forms live behind the header Add button's modal).
import { openAddDialog, pickSource } from "./add-dialog";

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
 * Ingest a paste-HTML article via the Add dialog (opened on the paste
 * source — Plan 16-03). Returns after navigation to #/article/<id>
 * completes. Caller is responsible for navigating back to #/ when needed.
 */
async function ingestPaste(page: import("@playwright/test").Page, html: string) {
  await openAddDialog(page);
  await pickSource(page, "paste");
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

/**
 * seedLocation — cloned from progress-recent.spec.ts (the raw-put seeding
 * discipline; REUSE-DO-NOT-FORK). Plan 16-01 Task 2 uses it to push a tagged
 * article out of the Unread membership: ANY location (even a small offset)
 * flips the article to in-progress per the D14-18 policy
 * (articleReadingState), deterministically and without driving the reader
 * UI to the end of the article.
 */
async function seedLocation(
  page: import("@playwright/test").Page,
  articleId: string,
  graphemeOffset: number,
  savedAt: string,
): Promise<void> {
  await page.evaluate(
    async ({ articleId, graphemeOffset, savedAt }) => {
      const location = {
        schemaVersion: 1 as const,
        articleId,
        revision: 1,
        graphemeOffset,
        savedAt,
      };
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("location")) {
            resolve();
            return;
          }
          const tx = db.transaction("location", "readwrite");
          tx.objectStore("location").put(location);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    },
    { articleId, graphemeOffset, savedAt },
  );
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

    // Navigate to one article's ArticleView. TagEntry lives in the top-bar
    // tag popover (Plan 13-10 G5; Pitfall 8-5 — inert at mount; reader
    // activates via Tab/Click). Add tag "stoic".
    const platoRow = page
      .locator(".library-list > li")
      .filter({ hasText: "Plato Essay" });
    await platoRow.locator('a[href^="#/article/"]').click();
    await page.waitForURL(/#\/article\//, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: "Plato Essay" }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Tag picker (Plan 13-10 — G5): TagEntry lives in the top-bar tag
    // popover now, so open it via the header trigger first (the closed
    // popover is display:none — the input is unreachable until shown).
    await page.getByRole("button", { name: "Article tags" }).click();
    await expect(page.locator(".tag-popover")).toBeVisible();
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

    // Add "stoic" to the Plato article (open the tag popover first — Plan
    // 13-10 G5: TagEntry lives in the top-bar popover).
    const platoRow = page
      .locator(".library-list > li")
      .filter({ hasText: "Plato Essay" });
    await platoRow.locator('a[href^="#/article/"]').click();
    await page.waitForURL(/#\/article\//, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: "Plato Essay" }).first(),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Article tags" }).click();
    await expect(page.locator(".tag-popover")).toBeVisible();
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
    // Use the × remove on the TagEntry chip (NOT the TagFilter chip). The
    // popover must be open again — the view swap reset it on return.
    await platoRow.locator('a[href^="#/article/"]').click();
    await page.waitForURL(/#\/article\//, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: "Plato Essay" }).first(),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Article tags" }).click();
    await expect(page.locator(".tag-popover")).toBeVisible();
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

    // Add "stoic" to the Plato article (open the tag popover first — Plan
    // 13-10 G5: TagEntry lives in the top-bar popover).
    const platoRow = page
      .locator(".library-list > li")
      .filter({ hasText: "Plato Essay" });
    await platoRow.locator('a[href^="#/article/"]').click();
    await page.waitForURL(/#\/article\//, { timeout: 10_000 });
    await page.getByRole("button", { name: "Article tags" }).click();
    await expect(page.locator(".tag-popover")).toBeVisible();
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

// ── Plan 16-01 Task 2 — LIB-09: the honest filtered-to-zero feedback layer
// (D16-13/D14-26). A membership-non-empty view whose query/tag composition
// hides every row shows the calm no-matches line + a Clear search and
// filters control — NEVER the membership empty state. Strengthen-only: no
// existing test above was modified or removed.
test.describe("LIB-09 — filtered-to-zero no-matches feedback (D16-13)", () => {
  test("query-only filtered-to-zero: no-matches line visible, membership empty state absent (D16-13)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await ingestPaste(page, PLATO_HTML);
    await openLibrary(page);

    // A zero-match query narrows the (non-empty) All view to zero rows.
    await page.locator("input#library-search").fill("zzzz-not-a-real-query");
    await expect(page.locator(".library-list > li")).toHaveCount(0);

    // The calm no-matches line + clear-filters affordance render.
    const noMatches = page.locator(".library-no-matches");
    await expect(noMatches).toBeVisible();
    await expect(noMatches).toContainText(
      "Nothing in this view matches your filters.",
    );
    await expect(
      page.getByRole("button", { name: "Clear search and filters" }),
    ).toBeVisible();

    // Filtered-out is NOT an empty view (D14-26) — the All membership empty
    // heading must stay absent while the no-matches line shows.
    await expect(
      page.getByRole("heading", { name: "Your library is empty" }),
    ).toHaveCount(0);
  });

  test("tag-only filtered-to-zero on a non-All view: same no-matches treatment (D16-13)", async ({
    page,
  }) => {
    // The tag carrier is pushed out of the Unread membership by a seeded
    // mid-article location (ANY location ⇒ in-progress, D14-18); the chip
    // strip still derives from the WHOLE library (loadAllTags), so
    // activating "stoic" on #/unread narrows a non-empty view to zero.
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await ingestPaste(page, PLATO_HTML);
    await openLibrary(page);

    // Tag Plato "stoic" via the top-bar tag popover (the D8-05 pattern).
    const platoRow = page
      .locator(".library-list > li")
      .filter({ hasText: "Plato Essay" });
    const platoHref = await platoRow
      .locator('a[href^="#/article/"]')
      .getAttribute("href");
    const platoId = /^#\/article\/([a-z0-9-]+)$/.exec(platoHref ?? "")?.[1];
    expect(platoId).toBeTruthy();
    await platoRow.locator('a[href^="#/article/"]').click();
    await page.waitForURL(/#\/article\//, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: "Plato Essay" }).first(),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Article tags" }).click();
    await expect(page.locator(".tag-popover")).toBeVisible();
    await page.locator("input#tag-entry-new").fill("stoic");
    await page.getByRole("button", { name: /add tag/i }).click();
    await expect(
      page.locator(".tag-entry-list .tag-chip-readonly").filter({ hasText: "stoic" }),
    ).toBeVisible();

    // Seed the mid-article location AFTER the tag round-trip so the
    // article-open visit cannot race the seed (offset 10 of a >500-
    // grapheme article ⇒ ratio well under the finished threshold).
    await seedLocation(page, platoId!, 10, "2026-08-28T10:00:00.000Z");

    // Cold-load #/unread (goto + reload — the reading-views openView
    // discipline; the LibraryView load effect runs once per mount and the
    // seed happened after the previous mount). Readiness = parenthetical
    // All count (counts render only at status ready).
    await page.goto(`${BASE}/#/unread`);
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: /^All \(\d+\)/ })).toBeVisible({
      timeout: 10_000,
    });

    // Tag-only filtered-to-zero: the chip exists (Plato carries it) but NO
    // unread member does (Plato is in-progress; fixtures are untagged).
    const stoicChip = page
      .locator(".tag-filter .tag-chip")
      .filter({ hasText: "stoic" });
    await expect(stoicChip).toBeVisible();
    await stoicChip.click();
    await expect(stoicChip).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".library-list > li")).toHaveCount(0);
    await expect(page.locator(".library-no-matches")).toBeVisible();
    await expect(page.locator(".library-no-matches")).toContainText(
      "Nothing in this view matches your filters.",
    );

    // Membership is non-empty (the bundled fixtures are unread) — the
    // unread membership empty state never renders (D14-26).
    await expect(
      page.getByRole("heading", { name: "Nothing unread" }),
    ).toHaveCount(0);
  });

  test("combined filtered-to-zero + Clear search and filters resets BOTH query and tag, restoring rows (D16-13)", async ({
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

    // Tag Plato "stoic" (the D8-05 pattern above).
    const platoRow = page
      .locator(".library-list > li")
      .filter({ hasText: "Plato Essay" });
    await platoRow.locator('a[href^="#/article/"]').click();
    await page.waitForURL(/#\/article\//, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: "Plato Essay" }).first(),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Article tags" }).click();
    await expect(page.locator(".tag-popover")).toBeVisible();
    await page.locator("input#tag-entry-new").fill("stoic");
    await page.getByRole("button", { name: /add tag/i }).click();
    await expect(
      page.locator(".tag-entry-list .tag-chip-readonly").filter({ hasText: "stoic" }),
    ).toBeVisible();
    await openLibrary(page);

    // COMBINED filtered-to-zero: tag=stoic AND a query only Marcus's title
    // could satisfy — Marcus is untagged, Plato doesn't match "marcus".
    const stoicChip = page
      .locator(".tag-filter .tag-chip")
      .filter({ hasText: "stoic" });
    await stoicChip.click();
    await expect(stoicChip).toHaveAttribute("aria-pressed", "true");
    await page.locator("input#library-search").fill("marcus");
    await expect(page.locator(".library-list > li")).toHaveCount(0);
    await expect(page.locator(".library-no-matches")).toBeVisible();

    // Clear search and filters resets BOTH: query "" AND tag null.
    await page
      .getByRole("button", { name: "Clear search and filters" })
      .click();

    // The no-matches line is gone…
    await expect(page.locator(".library-no-matches")).toHaveCount(0);
    // …the view's rows are restored (fixtures + both ingested articles)…
    const { fixtures } = await import("../../../src/fixtures");
    await expect(page.locator(".library-list > li")).toHaveCount(
      fixtures.length + 2,
    );
    // …the search input is empty…
    await expect(page.locator("input#library-search")).toHaveValue("");
    // …and the tag chip is unselected again.
    await expect(stoicChip).toHaveAttribute("aria-pressed", "false");
  });

  test("membership-empty view keeps its EMPTY_COPY state under a query — no no-matches line (D14-26 regression guard)", async ({
    page,
  }) => {
    // NO ingested articles and no locations: the six bundled fixtures are
    // all unread, so #/finished has EMPTY membership. The membership-empty
    // branch owns the region regardless of any query typed.
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await page.evaluate(() => {
      window.location.hash = "#/finished";
    });
    await expect(
      page.getByRole("heading", { name: "Nothing finished yet" }),
    ).toBeVisible();

    // Type a query into the always-mounted search field (LibrarySearch
    // mounts above the membership/no-matches ternary).
    await page.locator("input#library-search").fill("zzzz-not-a-real-query");

    // The membership empty state STILL owns the region (D14-26)…
    await expect(
      page.getByRole("heading", { name: "Nothing finished yet" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /^Finished \(0\)/ })).toBeVisible();
    // …and the filtered-to-zero line never renders for an empty view.
    await expect(page.locator(".library-no-matches")).toHaveCount(0);
  });
});
