import { seedStoreRows } from "./seedStoreRows";
// tests/e2e/library/sort-control.spec.ts
// Issue #115 — the library sort control (Recently added / Title / Recently
// opened) in real browsers, across the 3-engine matrix:
//   - the control renders in the toolbar band, defaults to Recently added,
//     and is keyboard-reachable (a native select — one Tab stop);
//   - Title orders mixed articles + books by READER-VISIBLE titles;
//   - Recently opened orders by latest activity (article location / book's
//     latest chapter location); an offset-ZERO location counts as opened
//     (D14-18 Unread parity); never-opened items follow in Recently-added
//     order;
//   - the choice works on every reading-state view and composes with search
//     and tag filtering (filters narrow, never reorder);
//   - the choice persists across a reload (SettingsContext → Dexie);
//   - high-zoom: at the 320 CSS px reflow target the control introduces no
//     horizontal overflow and stays operable; 400% CSS zoom survives (the
//     high-zoom.spec.ts load-bearing/secondary discipline).
//
// Harness (cloned from reading-views.spec.ts — REUSE-DO-NOT-FORK): the seed
// corpus is built in Node through the shipped Zod schemas, raw-put into
// IndexedDB BEFORE the view opens, and the expected orderings are computed
// in Node through the SAME policy modules the app renders
// (orderLibraryEntries + the reading-state membership + the filters) —
// structural agreement, never a hand-written expectation.
import { test, expect, type Page } from "@playwright/test";
import { fixtures } from "../../../src/fixtures";
import { normalizeText, graphemeClusters } from "../../../src/content/normalizeText";
import { ArticleSchema, BookSchema, LocationRecordSchema } from "../../../src/content/schema";
import type { Book, CanonicalArticle, LocationRecord } from "../../../src/content/schema";
import { effectiveTitle } from "../../../src/ingestion/library/effectiveMetadata";
import {
  orderLibraryEntries,
  type LibrarySortKind,
} from "../../../src/ingestion/library/libraryOrder";
import { filterBooks, filterLibrary } from "../../../src/ingestion/library/libraryFilter";
import { articleReadingState, bookReadingState } from "../../../src/ingestion/library/readingState";
import { latestLocationByArticle } from "../../../src/reader/readingPosition";
import { BASE } from "../_base";

// ── Node-side corpus builders (shipped schemas only — never hand-built rows) ──

/** The grapheme total of an article — the SAME substrate the app's
 * totalsById fold uses (textLengthOf parity). */
function totalOf(article: CanonicalArticle): number {
  return graphemeClusters(normalizeText(article), article.lang).length;
}

/** Build an ArticleSchema-valid standalone article with an addedAt stamp. */
function makeStandalone(
  id: string,
  title: string,
  addedAt: string,
  tags: string[],
  paragraphs: string[],
): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      title,
      retrievedAt: "2026-08-20T00:00:00.000Z",
      originalHtmlHash: `sha256:${"0".repeat(64)}`,
    },
    blocks: paragraphs.map((text) => ({
      kind: "paragraph",
      content: [{ text, marks: [] }],
    })),
    tags,
    addedAt,
  });
}

/** Build an ArticleSchema-valid epub-chapter article bound to a book. */
function makeChapter(
  id: string,
  title: string,
  bookId: string,
  chapterIndex: number,
  paragraphs: string[],
): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      title,
      retrievedAt: "2026-08-20T00:00:00.000Z",
      originalHtmlHash: `sha256:${"0".repeat(64)}`,
    },
    blocks: paragraphs.map((text) => ({
      kind: "paragraph",
      content: [{ text, marks: [] }],
    })),
    ingestionMeta: {
      source: "epub-chapter",
      origin: "upload",
      originalHtmlHash: `sha256:${"0".repeat(64)}`,
      extractionConfidence: "high",
      extractionWarnings: [],
      bookId,
      chapterIndex,
    },
  });
}

/** Build a BookSchema-valid book row. */
function makeBook(id: string, title: string, addedAt: string, chapterArticleIds: string[]): Book {
  return BookSchema.parse({
    id,
    title,
    authors: ["Ada Author"],
    language: "en",
    chapterArticleIds,
    publishedDate: "2026-01-01",
    skippedChapterCount: 0,
    source: "epub-upload",
    originalFileHash: `sha256:${"1".repeat(64)}`,
    tags: [],
    addedAt,
  });
}

/** Build a minimal valid LocationRecord. */
function loc(articleId: string, graphemeOffset: number, savedAt: string): LocationRecord {
  return LocationRecordSchema.parse({
    schemaVersion: 1,
    articleId,
    revision: 1,
    graphemeOffset,
    savedAt,
  });
}

// ── The seed corpus (on top of the six bundled fixtures, always present) ──────
// Titles use clean "Word …" prefixes so every engine's collation agrees, and
// the three orders deliberately DISAGREE with each other and with addedAt:
//
//   entry        title             addedAt   activity (savedAt)
//   ETA_ESSAY    "Eta Essay"       09-01     09-08 (offset = FULL total — finished)
//   GAMMA_ESSAY  "Gamma Essay"     09-02     09-07 (offset 0 — opened, in-progress)
//   BETA_ESSAY   "Beta Essay"      09-03     09-05 (offset 0 — opened, in-progress)
//   ALPHA_ESSAY  "Alpha Essay"     09-04     never (unread)
//   DELTA_BOOK   "Delta Anthology" 09-05     09-06 (chapter c00 at 50% — in-progress)
//   ZETA_BOOK    "Zeta Anthology"  09-06     never (unread)
//
// Recently added: Zeta, Delta, Alpha, Beta, Gamma, Eta, fixtures…
// Recently opened: Eta, Gamma, Delta, Beta, | Zeta, Alpha, fixtures…
// Title: Alpha, Beta, Delta, Eta, Gamma, Zeta, fixtures…

const ETA_ESSAY = makeStandalone(
  "sc-eta-essay",
  "Eta Essay",
  "2026-09-01T00:00:00.000Z",
  [],
  [
    "The eta essay closes the Greek-letter set with a meditation on the stubborn vowel, its long open sound, and the readers who whisper it to themselves as a small private calibration before any difficult page.",
    "Its second paragraph exists so the article carries more than five hundred graphemes of normalized text, which every ingestion gate treats as the floor of a real long-form reading experience.",
  ],
);
const GAMMA_ESSAY = makeStandalone(
  "sc-gamma-essay",
  "Gamma Essay",
  "2026-09-02T00:00:00.000Z",
  ["essay"],
  [
    "The gamma essay argues that third places matter most in reading: not the first page and not the last, but the middle third where a reader decides whether the book is a companion or a chore.",
    "Its second paragraph exists to clear the same honest length floor as its siblings, so every seeded row is a full citizen of the library's reading surfaces.",
  ],
);
const BETA_ESSAY = makeStandalone(
  "sc-beta-essay",
  "Beta Essay",
  "2026-09-03T00:00:00.000Z",
  [],
  [
    "The beta essay celebrates the second draft, the quiet revision in which a writer stops performing and starts listening to the sentence they actually meant to set down the first time.",
    "A second paragraph of honest prose keeps the article comfortably past the ingestion floor and gives the opened-at-offset-zero seed a real body to sit inside.",
  ],
);
const ALPHA_ESSAY = makeStandalone(
  "sc-alpha-essay",
  "Alpha Essay",
  "2026-09-04T00:00:00.000Z",
  ["essay"],
  [
    "The alpha essay opens the set with a defense of beginnings: the first sentence as a handshake, the opening paragraph as a promise that the rest of the text intends to keep.",
    "Its second paragraph, like every sibling's, exists so the normalized text clears the five-hundred-grapheme floor the reading engine treats as a real article.",
  ],
);

const DELTA_C0 = makeChapter("sc-delta-c00", "Chapter 1. The Delta Marsh", "sc-delta-book", 0, [
  "The delta marsh keeps its channels in permanent negotiation, and the ferryman who reads them daily says the map is a rumor the water has already voted against.",
]);
const DELTA_C1 = makeChapter("sc-delta-c01", "Chapter 2. The Delta Ferry", "sc-delta-book", 1, [
  "The ferry crosses at dawn because the morning water tells the truth; by afternoon the wind edits it and every crossing becomes a negotiation with a moving manuscript.",
]);
const DELTA_BOOK = makeBook("sc-delta-book", "Delta Anthology", "2026-09-05T00:00:00.000Z", [
  DELTA_C0.id,
  DELTA_C1.id,
]);
const ZETA_BOOK = makeBook("sc-zeta-book", "Zeta Anthology", "2026-09-06T00:00:00.000Z", [
  "sc-zeta-c00",
  "sc-zeta-c01",
]);

const CORPUS_STANDALONE = [ETA_ESSAY, GAMMA_ESSAY, BETA_ESSAY, ALPHA_ESSAY];
const CORPUS_ARTICLES: CanonicalArticle[] = [...CORPUS_STANDALONE, DELTA_C0, DELTA_C1];
const CORPUS_BOOKS: Book[] = [DELTA_BOOK, ZETA_BOOK];

const CORPUS_LOCATIONS: LocationRecord[] = [
  // finished — offset equals the article's FULL grapheme total (never a
  // floored threshold multiple; the integer-truncation trap).
  loc(ETA_ESSAY.id, totalOf(ETA_ESSAY), "2026-09-08T10:00:00.000Z"),
  // opened at offset ZERO — counts as opened (the D14-18 Unread parity).
  loc(GAMMA_ESSAY.id, 0, "2026-09-07T10:00:00.000Z"),
  loc(BETA_ESSAY.id, 0, "2026-09-05T10:00:00.000Z"),
  // the book's activity = its latest chapter location (max savedAt).
  loc(DELTA_C0.id, Math.floor(totalOf(DELTA_C0) * 0.5), "2026-09-06T10:00:00.000Z"),
];

const LATEST_BY_ARTICLE = latestLocationByArticle(CORPUS_LOCATIONS);

// ── Expected values — the SAME policy modules the app renders ─────────────────

/** Every standalone row the All view shows (seeded + the bundled fixtures). */
const ALL_STANDALONE = [...CORPUS_STANDALONE, ...fixtures];

const TOTALS_BY_ID = new Map<string, number>();
for (const f of fixtures) TOTALS_BY_ID.set(f.id, totalOf(f));
for (const a of CORPUS_ARTICLES) TOTALS_BY_ID.set(a.id, totalOf(a));
const textLengthOf = (articleId: string): number | undefined => TOTALS_BY_ID.get(articleId);

/** The In-progress view's membership — the same two derivations the render
 * body uses (state → filters → order). */
const IN_PROGRESS_ARTICLES = ALL_STANDALONE.filter(
  (a) =>
    articleReadingState(LATEST_BY_ARTICLE.get(a.id), textLengthOf(a.id) ?? 0) === "in-progress",
);
const IN_PROGRESS_BOOKS = CORPUS_BOOKS.filter(
  (b) => bookReadingState(b, LATEST_BY_ARTICLE, textLengthOf) === "in-progress",
);

function expectedTitles(
  sort: LibrarySortKind,
  articles: readonly CanonicalArticle[],
  books: readonly Book[],
): string[] {
  return orderLibraryEntries(articles, books, sort, {
    latestLocationByArticleId: LATEST_BY_ARTICLE,
  }).map((entry) => (entry.kind === "article" ? effectiveTitle(entry.article) : entry.book.title));
}

const SEARCH_QUERY = "essay";
const visibleEssays = filterLibrary(ALL_STANDALONE, { query: SEARCH_QUERY, activeTag: null });
const TAG = "essay";
const taggedEssays = filterLibrary(ALL_STANDALONE, { query: "", activeTag: TAG });

async function seedCorpus(page: Page): Promise<void> {
  await seedStoreRows(page, "books", CORPUS_BOOKS);
  // Chapter rows carry the denormalized bookId used by the articles index.
  await seedStoreRows(
    page,
    "articles",
    CORPUS_ARTICLES.map((article) => ({
      ...article,
      ...(article.ingestionMeta?.bookId ? { bookId: article.ingestionMeta.bookId } : {}),
    })),
  );
  await seedStoreRows(page, "location", CORPUS_LOCATIONS);
}

/**
 * Cold-load a library view and wait for it to settle. goto + reload forces
 * the full remount so the load effect re-runs against the seeded rows; the
 * readiness signal is the parenthetical All count (status-ready only).
 */
async function openView(page: Page, hash: string): Promise<void> {
  await page.goto(`${BASE}/${hash}`);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole("link", { name: /^All \(\d+\)/ })).toBeVisible({
    timeout: 10_000,
  });
}

/** The row titles in DOM order — the main h2 of each top-level li
 * (articles use h2; book rows use h2 with chapter sub-rows at h3). */
async function renderedTitles(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll(".library-list > li")).map(
      (li) => li.querySelector("h2")?.textContent?.trim() ?? "",
    );
  });
}

async function expectOrder(page: Page, expected: string[]): Promise<void> {
  // expect.poll retries — the settings hydration (mirror → Dexie) can land
  // a frame after first paint, so the order must be settled, not sampled.
  await expect.poll(async () => renderedTitles(page), { timeout: 10_000 }).toEqual(expected);
}

test.beforeEach(async ({ page }) => {
  // Stub remote images so figure-heavy fixtures don't couple to network.
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg/>" }),
  );

  // Mount the SPA so Dexie constructs the lem-reader DB schema, then CLEAR
  // every store's rows for deterministic first-run state (the reading-views
  // harness — clear-rows, NOT deleteDatabase, to avoid the webkit
  // deleteDatabase race). "books" rides the cloned list (the v5 store).
  await page.goto(`${BASE}/`);
  await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible({
    timeout: 10_000,
  });
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
          "readingSessions",
          "assets",
        ];
        const existing = stores.filter((s) => db.objectStoreNames.contains(s));
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
  // The sort choice is PERSISTED (mirror + Dexie) — a previous test's
  // localStorage mirror would leak its librarySort into this test's first
  // paint. Clear it so every test starts from the schema default.
  await page.evaluate(() => window.localStorage.removeItem("lem-settings-mirror-v1"));
});

test.describe("library sort control (issue #115)", () => {
  test("defaults to Recently added; switching to Title orders mixed rows by reader-visible title", async ({
    page,
  }) => {
    await seedCorpus(page);
    await openView(page, "#/");

    const select = page.getByRole("combobox", { name: "Sort library by" });
    await expect(select).toBeVisible();
    await expect(select).toHaveValue("recently-added");

    // Recently added (default): descending addedAt — books first, then the
    // essays, then the undated bundled fixtures in input order.
    await expectOrder(page, expectedTitles("recently-added", ALL_STANDALONE, CORPUS_BOOKS));

    // Title: reader-visible titles ascending across BOTH kinds.
    await select.selectOption({ label: "Title" });
    await expectOrder(page, expectedTitles("title", ALL_STANDALONE, CORPUS_BOOKS));

    // The corpus must genuinely disagree across the three orders — a guard
    // against a vacuous fixture set (Alpha leads by title but sits
    // mid-pack by addedAt; Eta trails by title but leads by activity).
    const byAdded = expectedTitles("recently-added", ALL_STANDALONE, CORPUS_BOOKS);
    const byTitle = expectedTitles("title", ALL_STANDALONE, CORPUS_BOOKS);
    const byOpened = expectedTitles("recently-opened", ALL_STANDALONE, CORPUS_BOOKS);
    expect(new Set([byAdded.join("|"), byTitle.join("|"), byOpened.join("|")]).size).toBe(3);
  });

  test("Recently opened: latest activity first, offset-zero counts as opened, never-opened follow in Recently-added order", async ({
    page,
  }) => {
    await seedCorpus(page);
    await openView(page, "#/");

    const select = page.getByRole("combobox", { name: "Sort library by" });
    await select.selectOption({ label: "Recently opened" });
    await expectOrder(page, expectedTitles("recently-opened", ALL_STANDALONE, CORPUS_BOOKS));

    // The pinned edges, asserted explicitly against the rendered sequence:
    //   1. Eta (finished, 09-08) leads;
    //   2. Gamma (offset 0, 09-07) outranks Delta's book (chapter, 09-06);
    //   3. the never-opened tail rides addedAt (Zeta book 09-06 before
    //      Alpha 09-04), with the undated fixtures last.
    const titles = await renderedTitles(page);
    expect(titles[0]).toBe("Eta Essay");
    expect(titles.indexOf("Gamma Essay")).toBeLessThan(titles.indexOf("Delta Anthology"));
    expect(titles.indexOf("Beta Essay")).toBeLessThan(titles.indexOf("Zeta Anthology"));
    expect(titles.indexOf("Zeta Anthology")).toBeLessThan(titles.indexOf("Alpha Essay"));
    // The offset-zero Gamma essay is NOT in the never-opened tail despite
    // zero progress (the D14-18 parity this order must honor).
    expect(titles.indexOf("Gamma Essay")).toBeLessThan(titles.indexOf("Zeta Anthology"));
  });

  test("composes with search and the tag filter; the choice survives a view switch", async ({
    page,
  }) => {
    await seedCorpus(page);
    await openView(page, "#/");

    const select = page.getByRole("combobox", { name: "Sort library by" });
    await select.selectOption({ label: "Title" });
    // The settings write is debounced (~400ms); let it land before the
    // later reload — the persisted choice is the contract under test (an
    // instant reload inside the debounce window loses ANY pending
    // preference write, the pre-existing SettingsContext race every field
    // shares; not this issue's scope).
    await page.waitForTimeout(700);

    // Search narrows to the essays; the title order among them holds.
    await page.locator("input#library-search").fill(SEARCH_QUERY);
    await expect(page.locator(".library-list > li")).toHaveCount(visibleEssays.length);
    await expectOrder(
      page,
      expectedTitles(
        "title",
        visibleEssays,
        filterBooks(CORPUS_BOOKS, { query: SEARCH_QUERY, activeTag: null }, new Map()),
      ),
    );

    // The tag filter composes on top (Alpha + Gamma carry "essay");
    // clearing the query and activating the chip narrows to two rows,
    // still in title order.
    await page.locator("input#library-search").fill("");
    const essayChip = page.locator(".tag-filter .tag-chip").filter({ hasText: TAG });
    await expect(essayChip).toBeVisible();
    await essayChip.click();
    await expect(essayChip).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".library-list > li")).toHaveCount(taggedEssays.length);
    await expectOrder(
      page,
      expectedTitles(
        "title",
        taggedEssays,
        filterBooks(CORPUS_BOOKS, { query: "", activeTag: TAG }, new Map()),
      ),
    );

    // A reading-state view switch keeps the persisted sort (the choice is
    // global, not per-view). The tag chip resets with the session filters
    // on reload; the in-progress membership renders in title order.
    await page.evaluate(() => {
      window.location.hash = "#/in-progress";
    });
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("link", { name: /^All \(\d+\)/ })).toBeVisible({
      timeout: 10_000,
    });
    await expect(select).toHaveValue("title");
    await expectOrder(page, expectedTitles("title", IN_PROGRESS_ARTICLES, IN_PROGRESS_BOOKS));

    // The remaining two views complete the every-view matrix (the corpus
    // was designed so each reading-state view is non-empty): Unread holds
    // the never-opened essay + book, Finished the finished essay alone —
    // each rendering in the persisted Title order with the control live.
    const UNREAD_ARTICLES = ALL_STANDALONE.filter(
      (a) => articleReadingState(LATEST_BY_ARTICLE.get(a.id), textLengthOf(a.id) ?? 0) === "unread",
    );
    const UNREAD_BOOKS = CORPUS_BOOKS.filter(
      (b) => bookReadingState(b, LATEST_BY_ARTICLE, textLengthOf) === "unread",
    );
    await page.evaluate(() => {
      window.location.hash = "#/unread";
    });
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("link", { name: /^All \(\d+\)/ })).toBeVisible({
      timeout: 10_000,
    });
    await expect(select).toHaveValue("title");
    await expectOrder(page, expectedTitles("title", UNREAD_ARTICLES, UNREAD_BOOKS));

    const FINISHED_ARTICLES = ALL_STANDALONE.filter(
      (a) =>
        articleReadingState(LATEST_BY_ARTICLE.get(a.id), textLengthOf(a.id) ?? 0) === "finished",
    );
    const FINISHED_BOOKS = CORPUS_BOOKS.filter(
      (b) => bookReadingState(b, LATEST_BY_ARTICLE, textLengthOf) === "finished",
    );
    await page.evaluate(() => {
      window.location.hash = "#/finished";
    });
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("link", { name: /^All \(\d+\)/ })).toBeVisible({
      timeout: 10_000,
    });
    await expect(select).toHaveValue("title");
    await expectOrder(page, expectedTitles("title", FINISHED_ARTICLES, FINISHED_BOOKS));
  });

  test("the choice persists across a reload (visits)", async ({ page }) => {
    await seedCorpus(page);
    await openView(page, "#/");

    const select = page.getByRole("combobox", { name: "Sort library by" });
    await select.selectOption({ label: "Title" });
    await expectOrder(page, expectedTitles("title", ALL_STANDALONE, CORPUS_BOOKS));

    // The settings write is debounced (~400ms); let it land before the
    // reload (the pagehide flush is the safety net, not the plan).
    await page.waitForTimeout(700);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("link", { name: /^All \(\d+\)/ })).toBeVisible({
      timeout: 10_000,
    });

    // The restored preference drives the restored order.
    await expect(select).toHaveValue("title");
    await expectOrder(page, expectedTitles("title", ALL_STANDALONE, CORPUS_BOOKS));
  });

  test("keyboard: the control is a reachable single Tab stop and commits the choice", async ({
    page,
  }) => {
    await seedCorpus(page);
    await openView(page, "#/");

    // Native select = one keyboard stop. Walk Tab from the search field
    // until the sort select focuses. Engine divergence (the 09-06
    // panel-keyboard precedent — engine-honest, never weakened): Playwright's
    // WebKit keeps Safari's sequential-focus default where Tab reaches FORM
    // CONTROLS ONLY, so the tag-chip button is skipped there while
    // chromium/firefox walk it. The bounded walk asserts the reachability
    // contract on every engine without hard-coding the per-engine count.
    const search = page.locator("input#library-search");
    await search.focus();
    const select = page.getByRole("combobox", { name: "Sort library by" });
    for (
      let tab = 0;
      tab < 6 && !(await select.evaluate((el) => el === document.activeElement));
      tab++
    ) {
      await page.keyboard.press("Tab");
    }
    await expect(select).toBeFocused();

    // Commit the choice (selectOption models the committed selection; the
    // native popup interaction is UA-owned) — the list reorders in place.
    await select.selectOption({ label: "Title" });
    await expectOrder(page, expectedTitles("title", ALL_STANDALONE, CORPUS_BOOKS));
  });

  test("high zoom: no horizontal overflow at the 320px reflow target; operable; 400% zoom survival", async ({
    page,
  }) => {
    // LOAD-BEARING (the high-zoom.spec.ts discipline): the 320 CSS px
    // reflow condition via setViewportSize.
    await page.setViewportSize({ width: 320, height: 800 });
    await seedCorpus(page);
    await openView(page, "#/");

    const select = page.getByRole("combobox", { name: "Sort library by" });
    await expect(select).toBeVisible();

    const overflow = await page.evaluate(() => ({
      scrollW: document.body.scrollWidth,
      clientW: document.body.clientWidth,
    }));
    expect(
      overflow.scrollW,
      `body scrolls horizontally at 320px (scrollW ${overflow.scrollW} > clientW ${overflow.clientW})`,
    ).toBeLessThanOrEqual(overflow.clientW + 1);

    // Operable at the reflow target: the choice reorders the list.
    await select.selectOption({ label: "Title" });
    await expectOrder(page, expectedTitles("title", ALL_STANDALONE, CORPUS_BOOKS));

    // SECONDARY: 400% CSS zoom — survival only (engine-variable).
    await page.evaluate(() => {
      (document.body.style as unknown as { zoom: string }).zoom = "4";
    });
    await page.waitForTimeout(500);
    await expect(select, "the sort control is lost after 400% zoom").toBeVisible();
    await expect(select).toHaveValue("title");
  });
});
