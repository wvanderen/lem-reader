// tests/e2e/library/library-restore.spec.ts
// Plan 15-03 Task 1 — the NAV-03 return-context restore matrix harness
// (D15-11..14 browser truth; plain test() blocks inherit the chromium/
// firefox/webkit matrix by default — the 3-engine run lands at Plan 15-04).
//
// Harness (cloned from reading-views.spec.ts — REUSE-DO-NOT-FORK):
//   - BASE URL:       http://localhost:5173
//   - beforeEach:     image stub + goto BASE + "Saved articles" h1 wait +
//                     raw IndexedDB clear-rows over ["articles","settings",
//                     "location","highlights","notes","books"]. Clear-rows,
//                     NEVER deleteDatabase (the webkit deleteDatabase race).
//   - seedArticleRows: ArticleSchema.parse in Node; raw put into "articles".
//                     Schema-building in Node guarantees the store-seam Zod
//                     read never drops a seeded row.
//   - openView:       goto hash + reload + h1 "Saved articles" + /^All (\d+)/
//                     readiness wait (counts render only at status ready —
//                     present even on empty views).
//
// Seeding discipline: seed BEFORE openView (the LibraryView load effect
// runs once per mount; openView's goto+reload remounts it against the
// freshly seeded rows).
//
// Corpus: 12 standalone articles (≥10 per the plan — enough rows for
// meaningful scroll offsets) with alternating titles/tags so query and tag
// filters have deterministic subsets, plus the six bundled fixture
// articles which are always present (unread) on a cleared location store.
//
// Threat register (15-03 PLAN): T-15-07/T-15-08 (Tampering — snapshot/
// selector) → row lookups use the constant-template selector over ids
// from schema-validated seeded records only; T-15-09 (DoS — restore on
// unready DOM) → every restore assertion waits for the ready signal
// (parenthetical All count) before touching scroll/focus.
import { test, expect, type Page } from "@playwright/test";
import { fixtures } from "../../../src/fixtures";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/schema";

const BASE = "http://localhost:5173";

// ── Node-side corpus builders (shipped schemas only — never hand-built rows) ──

/** Build an ArticleSchema-valid standalone article from plain paragraphs.
 * Tagged alternately (salt/ember) so the tag filter has a deterministic
 * half-corpus; titles alternate Lantern/Harbor so the query filter does
 * too (the restore asserts the reader's OWN filter text returns). */
function makeStandalone(
  id: string,
  title: string,
  tag: string,
  paragraphs: string[],
): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      title,
      retrievedAt: "2026-08-20T00:00:00.000Z",
      originalHtmlHash: `sha256:${"2".repeat(64)}`,
    },
    blocks: paragraphs.map((text) => ({
      kind: "paragraph",
      content: [{ text, marks: [] }],
    })),
    tags: [tag],
  });
}

/** Prose shared by the corpus builders — varied long-form sentences (no
 * lorem) so the ING round-trip substrate stays honest even though these
 * rows bypass ingestion (raw schema puts). */
function prose(i: number, mood: string): string[] {
  return [
    `Volume ${i} of the ${mood} series opens on a morning the harbor chroniclers all described differently, which the archivists now consider the most honest thing about it.`,
    `The middle chapters follow the keepers through a season of small repairs, careful logs, and one incident involving a lantern, a rowboat, and a sentence no one has finished agreeing on since.`,
    `The closing page simply lists what was saved, and the reader who reaches it tends to sit quietly for a moment before starting the next volume.`,
  ];
}

/** The 12-article restore corpus — ids are ORDER-STABLE (composite-library
 * order is insertion order for raw puts; a00 first, a11 last). */
const CORPUS: CanonicalArticle[] = Array.from({ length: 12 }, (_, i) => {
  const n = String(i).padStart(2, "0");
  const even = i % 2 === 0;
  return makeStandalone(
    `lr-restore-a${n}`,
    even ? `Lantern Ledger Volume ${i}` : `Harbor Notebook Volume ${i}`,
    even ? "salt" : "ember",
    prose(i, even ? "lantern ledger" : "harbor notebook"),
  );
});

/** The full row count after seeding: corpus + the six bundled fixtures. */
const SEEDED_ROW_COUNT = CORPUS.length + fixtures.length;

// ── Seeding helpers (raw IndexedDB puts — the seedArticleRows discipline) ──

/** seedArticleRows — write ArticleSchema-valid article rows (built in Node)
 * into the articles store via a raw put. */
async function seedArticleRows(
  page: Page,
  articles: CanonicalArticle[],
): Promise<void> {
  await page.evaluate(async (rows) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("articles")) {
          resolve();
          return;
        }
        const tx = db.transaction("articles", "readwrite");
        for (const row of rows) tx.objectStore("articles").put(row);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, articles);
}

/** Seed the full corpus. MUST run BEFORE openView (seed-before-open
 * discipline — the load effect runs once per mount). */
async function seedCorpus(page: Page): Promise<void> {
  await seedArticleRows(page, CORPUS);
}

/** Delete raw article rows by id while the app is elsewhere (the matrix's
 * row-gone / clamp degradations mutate the corpus from inside Reader). */
async function deleteArticleRows(
  page: Page,
  ids: string[],
): Promise<void> {
  await page.evaluate(async (rowIds) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("articles")) {
          resolve();
          return;
        }
        const tx = db.transaction("articles", "readwrite");
        for (const id of rowIds) tx.objectStore("articles").delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, ids);
}

/**
 * Navigate to a view URL and wait for the library to settle. goto + reload
 * forces a full remount so the LibraryView load effect re-runs against the
 * seeded rows (the openLibrary discipline). The readiness signal is the
 * parenthetical All count — counts render ONLY at status ready, and unlike
 * `.library-list > li` it is present even on empty views.
 */
async function openView(page: Page, hash: string): Promise<void> {
  await page.goto(`${BASE}/${hash}`);
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Saved articles" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("link", { name: /^All \(\d+\)/ })).toBeVisible({
    timeout: 10_000,
  });
}

test.beforeEach(async ({ page }) => {
  // Stub remote images so figure-heavy fixtures don't couple to network.
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg/>" }),
  );

  // Mount the SPA so Dexie constructs the lem-reader DB schema, then CLEAR
  // every store's rows for deterministic first-run state (clear-rows, NOT
  // deleteDatabase — the webkit race). Cloned verbatim from
  // reading-views.spec.ts.
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

/** The library search input (D8-06 — filter-on-keystroke, no submit). */
const searchInput = (page: Page) => page.locator("#library-search");

/** Current window.scrollY. */
async function scrollYOf(page: Page): Promise<number> {
  return page.evaluate(() => window.scrollY);
}

/** Scroll to a fixed offset INSTANTLY (no smooth behavior on html — the
 * A11Y-06 zero-scroll-behavior pin) and return the SETTLED value (the
 * document clamps; the tolerance anchors use what actually landed). */
async function scrollToOffset(page: Page, y: number): Promise<number> {
  return page.evaluate((offset) => {
    window.scrollTo(0, offset);
    return window.scrollY;
  }, y);
}

/** The first row link FULLY inside the viewport — a deterministic launch
 * target whose click never auto-scrolls, so the captured departure scroll
 * is exactly the pre-click offset. Throws when none is fully visible
 * (test-setup failure, not a silent skip). */
async function firstVisibleRowLink(page: Page): Promise<string> {
  const href = await page.evaluate(() => {
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        '.library-list a[href^="#/article/"]',
      ),
    );
    const hit = links.find((a) => {
      const r = a.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight;
    });
    if (hit) return hit.getAttribute("href") as string;
    return JSON.stringify({
      count: links.length,
      scrollY: window.scrollY,
      innerHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      rects: links.slice(0, 8).map((a) => {
        const r = a.getBoundingClientRect();
        return [Math.round(r.top), Math.round(r.bottom)];
      }),
    });
  });
  // Success = a constant-template href; the fallback string is the JSON
  // diagnostics blob (surfaced in the throw for geometry debugging).
  if (href.startsWith("#/article/")) return href;
  throw new Error(`no fully-visible row link to launch: ${href}`);
}

/** The LAST row link in the list (the clamp case's launch target — the
 * bottom-clamped viewport keeps it visible so the row-found path runs
 * with preventScroll and the clamped offset stays authoritative). */
async function lastRowLink(page: Page): Promise<string> {
  const href = await page.evaluate(() => {
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        '.library-list a[href^="#/article/"]',
      ),
    );
    return links[links.length - 1]?.getAttribute("href") ?? null;
  });
  if (href === null) throw new Error("no row link to launch");
  return href;
}

test.describe("NAV-03 — library return-context restore matrix", () => {
  test("harness sentinel: seeded corpus renders 12 + 6 fixture rows and the list overflows the viewport", async ({
    page,
  }) => {
    await seedCorpus(page);
    await openView(page, "#/");

    // The corpus is present and counted (ready signal already waited for
    // in openView; the row count re-proves it against the rendered list —
    // direct-child selector so nested tag-chip lis never over-count).
    await expect(page.locator(".library-list > li")).toHaveCount(
      SEEDED_ROW_COUNT,
    );

    // Scroll-meaningful: the document overflows the default viewport, so
    // the matrix's scroll captures/restores assert against a real offset.
    const overflows = await page.evaluate(
      () =>
        document.documentElement.scrollHeight > window.innerHeight + 200,
    );
    expect(overflows).toBe(true);
  });

  // ── The matrix (15-03-PLAN Task 3): 3 return paths × match/mismatch ×
  //    degradation. Every case seeds the SAME corpus; every restore
  //    assertion runs after the ready signal (T-15-09).
  const SCROLL_TOLERANCE = 60;

  test("(a) BackToLibrary path, view-match: query + scroll + launched row focus all restore (D15-11/D15-13)", async ({
    page,
  }) => {
    await seedCorpus(page);
    await openView(page, "#/unread");

    // Filters: the query narrows Unread to the 6 lantern rows.
    await searchInput(page).fill("lantern");
    await expect(page.locator(".library-list > li")).toHaveCount(6);

    // A mid-list scroll, then a launch from a fully-visible row (no
    // auto-scroll drift — the captured offset is exactly this settled y0).
    const y0 = await scrollToOffset(page, 1100);
    const launchHref = await firstVisibleRowLink(page);
    await page.locator(`.library-list a[href="${launchHref}"]`).click();
    await expect(
      page.getByRole("heading", { level: 1 }),
    ).not.toHaveText("Saved articles", { timeout: 10_000 });

    // Return path 1: BackToLibrary (history.back → the #/unread entry).
    await page.getByRole("button", { name: "Back to library" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("link", { name: /^All \(\d+\)/ }),
    ).toBeVisible({ timeout: 10_000 });

    // Filters restored (D15-13 — all return paths)…
    await expect(searchInput(page)).toHaveValue("lantern");
    await expect(page.locator(".library-list > li")).toHaveCount(6);
    // …the launched row's Open article link is the focused element
    // (D15-11 — most-specific target; toBeFocused retries past the
    // ready gate)…
    const launchedLink = page.locator(
      `.library-list a[href="${launchHref}"]`,
    );
    await expect(launchedLink).toBeFocused();
    // …and the clamped scroll restore landed within tolerance of y0
    // (asserted AFTER focus — the restore scroll precedes the focus in
    // the same ready-gate tick, so a settled focus implies settled scroll).
    expect(Math.abs((await scrollYOf(page)) - y0)).toBeLessThanOrEqual(
      SCROLL_TOLERANCE,
    );
  });

  test("(b) shell Library link path, view-match (capture from #/): tag + scroll + row focus restore (D15-11/D15-13; D15-05/D15-09 constant #/ target)", async ({
    page,
  }) => {
    await seedCorpus(page);
    await openView(page, "#/");

    // Filters: the salt chip narrows All to the 6 salt-tagged rows.
    await page
      .getByRole("button", { name: "Filter by tag: salt" })
      .click();
    await expect(page.locator(".library-list > li")).toHaveCount(6);

    const y0 = await scrollToOffset(page, 1100);
    const launchHref = await firstVisibleRowLink(page);
    await page.locator(`.library-list a[href="${launchHref}"]`).click();
    await expect(
      page.getByRole("heading", { level: 1 }),
    ).not.toHaveText("Saved articles", { timeout: 10_000 });

    // Return path 2: the header Primary-nav Library link (constant #/ —
    // the capture was taken from the All view, so the landing matches).
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Library" })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("link", { name: /^All \(\d+\)/ }),
    ).toBeVisible({ timeout: 10_000 });

    // Tag filter restored — the chip is still the active single-select…
    const saltChip = page.locator(".tag-filter .tag-chip", {
      hasText: "salt",
    });
    await expect(saltChip).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".library-list > li")).toHaveCount(6);
    // …scroll + launched row focus restored (view-match).
    await expect(
      page.locator(`.library-list a[href="${launchHref}"]`),
    ).toBeFocused();
    expect(Math.abs((await scrollYOf(page)) - y0)).toBeLessThanOrEqual(
      SCROLL_TOLERANCE,
    );
  });

  test("(c) brand path, view-MISMATCH: filters restore, scroll/focus reset fresh — never mismatched scroll (D15-14)", async ({
    page,
  }) => {
    await seedCorpus(page);
    await openView(page, "#/unread");

    // Capture in Unread with a query filter, then launch (any row).
    await searchInput(page).fill("harbor");
    await expect(page.locator(".library-list > li")).toHaveCount(6);
    await scrollToOffset(page, 1100);
    const launchHref = await firstVisibleRowLink(page);
    await page.locator(`.library-list a[href="${launchHref}"]`).click();
    await expect(
      page.getByRole("heading", { level: 1 }),
    ).not.toHaveText("Saved articles", { timeout: 10_000 });

    // Return path 3: the brand link — its constant target is #/ (All),
    // so the landing view MISMATCHES the Unread capture.
    await page.getByRole("link", { name: "Lem Reader" }).click();
    await expect(page).toHaveURL(/#\/$/);
    const libraryH1 = page.getByRole("heading", {
      level: 1,
      name: "Saved articles",
    });
    await expect(libraryH1).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("link", { name: /^All \(\d+\)/ }),
    ).toBeVisible({ timeout: 10_000 });

    // Filters restored on the mismatched landing (D15-13 — filters
    // follow ALL return paths)…
    await expect(searchInput(page)).toHaveValue("harbor");
    await expect(page.locator(".library-list > li")).toHaveCount(6);
    // …the fresh h1 default owns focus (D14-05 via D15-14)…
    await expect(libraryH1).toBeFocused();
    // …and the launched row link is NOT focused (no false restore), with
    // scroll reset to top (the h1 default focus scrolls to content top).
    await expect(
      page.locator(`.library-list a[href="${launchHref}"]`),
    ).not.toBeFocused();
    expect(await scrollYOf(page)).toBeLessThan(40);
  });

  test("(d) Highlights round-trip (null launched row): filters + clamped scroll restore AND h1 focus keeps the scroll (D15-11 §Interaction 8)", async ({
    page,
  }) => {
    await seedCorpus(page);
    await openView(page, "#/");

    // Filters + scroll, but NO article opened this visit — the captured
    // lastArticleId is null (the §Interaction 8 branch).
    await searchInput(page).fill("lantern");
    await expect(page.locator(".library-list > li")).toHaveCount(6);
    const y0 = await scrollToOffset(page, 1100);

    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Highlights" })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Highlights" }),
    ).toBeVisible({ timeout: 10_000 });

    // Back to library from Highlights (history.back → the #/ entry).
    await page.getByRole("button", { name: "Back to library" }).click();
    const libraryH1 = page.getByRole("heading", {
      level: 1,
      name: "Saved articles",
    });
    await expect(libraryH1).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("link", { name: /^All \(\d+\)/ }),
    ).toBeVisible({ timeout: 10_000 });

    // Filters + scroll restored, h1 focused via the null-row branch —
    // preventScroll:true, so the focus does NOT reset the restored scroll
    // (asserted AFTER focus lands, per the plan's (d) contract).
    await expect(searchInput(page)).toHaveValue("lantern");
    await expect(page.locator(".library-list > li")).toHaveCount(6);
    await expect(libraryH1).toBeFocused();
    expect(Math.abs((await scrollYOf(page)) - y0)).toBeLessThanOrEqual(
      SCROLL_TOLERANCE,
    );
  });

  test("(e) row-gone degrade: Back with the launched row deleted → h1 focus, scroll reset to top, no crash, no false row focus (D15-14)", async ({
    page,
  }) => {
    await seedCorpus(page);
    await openView(page, "#/");

    // Launch a corpus row from a mid-list scroll (captured with a real
    // offset, so the reset-to-top below is a deliberate degrade, not a
    // trivially-zero restore).
    await scrollToOffset(page, 400);
    await page
      .locator('.library-list a[href="#/article/lr-restore-a00"]')
      .click();
    await expect(
      page.getByRole("heading", { level: 1 }),
    ).not.toHaveText("Saved articles", { timeout: 10_000 });

    // While in Reader, remove the launched article's row via raw IndexedDB
    // (the corpus changed since capture — no production path touched).
    await deleteArticleRows(page, ["lr-restore-a00"]);

    await page.getByRole("button", { name: "Back to library" }).click();
    const libraryH1 = page.getByRole("heading", {
      level: 1,
      name: "Saved articles",
    });
    await expect(libraryH1).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("link", { name: /^All \(17\)/ }),
    ).toBeVisible({ timeout: 10_000 });

    // The truthful degrade: h1 focused with DEFAULT scroll (reset to
    // top), the row is gone (17 rows — 12 corpus − 1 + 6 fixtures), and
    // nothing false is focused or restored. No crash: the library loaded
    // (the All count rendered) and every assertion below runs against it.
    await expect(
      page.locator('.library-list a[href="#/article/lr-restore-a00"]'),
    ).toHaveCount(0);
    await expect(libraryH1).toBeFocused();
    expect(await scrollYOf(page)).toBeLessThan(40);
  });

  test("(f) clamp sanity: corpus shrank while away → scroll clamps to the new bottom (not reset), launched row still focused (D15-14)", async ({
    page,
  }) => {
    await seedCorpus(page);
    await openView(page, "#/");

    // Deep capture: scroll to the 18-row document bottom, then launch the
    // LAST row (a bundled fixture row — fixtures render after Dexie rows,
    // and they survive the corpus deletion below while staying last).
    await scrollToOffset(page, 1_000_000);
    const launchHref = await lastRowLink(page);
    await page.locator(`.library-list a[href="${launchHref}"]`).click();
    await expect(
      page.getByRole("heading", { level: 1 }),
    ).not.toHaveText("Saved articles", { timeout: 10_000 });

    // While in Reader, delete EVERY corpus row (the launched fixture row
    // stays — the row-found path runs; a row-gone h1 reset would zero
    // scrollY and this clamp case would assert nothing).
    await deleteArticleRows(
      page,
      CORPUS.map((a) => a.id),
    );

    await page.getByRole("button", { name: "Back to library" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("link", { name: /^All \(6\)/ }),
    ).toBeVisible({ timeout: 10_000 });

    // The launched row's link focused FIRST (toBeFocused retries through
    // the ready-gate restore, so a settled focus implies the clamped
    // scrollTo already ran — reading scrollY before this could catch the
    // pre-restore browser-left offset).
    await expect(
      page.locator(`.library-list a[href="${launchHref}"]`),
    ).toBeFocused();

    // Short list (6 fixture rows), captured offset overshoots it → the
    // restore CLAMPS to the new bottom: within tolerance of the live
    // maxScroll AND > 0 (clamped, not reset — the row stays visible at
    // the bottom, so preventScroll keeps the clamp authoritative).
    const y = await scrollYOf(page);
    const maxScroll = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    expect(Math.abs(y - maxScroll)).toBeLessThanOrEqual(40);
    expect(y).toBeGreaterThan(0);
  });
});




