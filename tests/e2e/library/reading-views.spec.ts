// tests/e2e/library/reading-views.spec.ts
// Plan 14-04 Task 1 — the 3-engine views/counts/empty/membership agreement
// matrix (LIB-07 + LIB-08 browser truth; plain test() blocks inherit the
// chromium/firefox/webkit matrix by default).
//
// Agreement is STRUCTURAL (D14-20/D14-23/D14-24): expected membership and
// counts are computed in Node from the SAME policy module the app renders —
// articleReadingState/bookReadingState/countByState imported from
// src/ingestion/library/readingState (never a forked ratio) — over the seed
// corpus PLUS the six bundled fixture articles, with per-article totals
// computed through normalizeText + graphemeClusters (textLengthOf parity
// with the app's totalsById fold).
//
// Harness (cloned from progress-recent.spec.ts — REUSE-DO-NOT-FORK):
//   - BASE URL:       http://localhost:5173
//   - beforeEach:     image stub + goto BASE + "Saved articles" h1 wait +
//                     raw IndexedDB clear-rows — NOW INCLUDING the v5
//                     "books" store (the cloned list predates it). Clear-
//                     rows, never deleteDatabase (the webkit race).
//   - seedLocation:   cloned verbatim (raw put into the location store).
//   - seedBook:       NEW — BookSchema.parse in Node, raw put into "books".
//   - seedArticleRows: NEW — ArticleSchema.parse in Node; chapter rows carry
//                     BOTH ingestionMeta.bookId AND the denormalized
//                     top-level bookId (the 12-03 v5 index contract — the
//                     booksStore.saveBook write shape). Schema-building in
//                     Node guarantees the store-seam Zod read never drops a
//                     seeded row.
//
// Seeding discipline: seed BEFORE openView (the progress-recent openLibrary
// comment — the LibraryView load effect runs once per mount; openView's
// goto+reload remounts it against the freshly seeded rows).
//
// The 0.98 integer-truncation trap (14-RESEARCH Pitfall 6, documented at
// progress-recent.spec.ts L238-241): every FINISHED seed uses graphemeOffset
// = the article's FULL grapheme total — Math.floor(total * 0.98) yields
// ratio ≈ 0.9798 < 0.98 and would silently read in-progress. Floor-ratios
// appear ONLY for in-progress states. No 0.98 literal exists in this file.
//
// Threat register (14-04 PLAN): T-14-09 (Tampering, seed rows) → every seed
// row is built through the shipped Zod schemas in Node (test-local raw
// IndexedDB writes, cleared per-test; no production code path touched).
import { test, expect, type Page } from "@playwright/test";
import { fixtures } from "../../../src/fixtures";
import {
  normalizeText,
  graphemeClusters,
} from "../../../src/content/normalizeText";
import {
  ArticleSchema,
  BookSchema,
  LocationRecordSchema,
} from "../../../src/content/schema";
import type {
  Book,
  CanonicalArticle,
  LocationRecord,
} from "../../../src/content/schema";
import {
  articleReadingState,
  bookReadingState,
  countByState,
} from "../../../src/ingestion/library/readingState";
// Plan 14-04 Task 2 — the DEEP LINK case reuses the jump-bidirectional
// seeding machinery (REUSE-DO-NOT-FORK): makeArticle/confidentHighlightOn/
// highlightRow/seedRows build the article + confident anchor through the
// SHIPPED schemas + selector resolver, so the seeded row re-resolves
// confident in the app.
import {
  confidentHighlightOn,
  highlightRow,
  makeArticle,
  seedRows,
} from "../portability/_portability";

const BASE = "http://localhost:5173";

// ── Node-side corpus builders (shipped schemas only — never hand-built rows) ──

/** The grapheme total of an article — the SAME substrate the app's
 * totalsById fold uses (textLengthOf parity). */
function totalOf(article: CanonicalArticle): number {
  return graphemeClusters(normalizeText(article), article.lang).length;
}

/** Build an ArticleSchema-valid standalone article from plain paragraphs. */
function makeStandalone(
  id: string,
  title: string,
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
  });
}

/** Build an ArticleSchema-valid epub-chapter article bound to a book
 * (ingestionMeta.bookId is the CANONICAL FK the library partitions on;
 * seedArticleRows additionally denormalizes the top-level bookId below). */
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

/** Build a BookSchema-valid book row (the tests/unit/library/book-progress
 * makeBook discipline). */
function makeBook(id: string, title: string, chapterArticleIds: string[]): Book {
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
    addedAt: "2026-08-20T00:00:00.000Z",
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

// ── The seed corpus (on top of the six bundled fixture articles, which are
//    always present and unread on a cleared location store) ──────────────────
//    standalone — one unread (no location), one in-progress (a mid fraction),
//    one finished (graphemeOffset = the article's FULL total, never a floored
//    threshold multiple — the documented trap).
//    books — every chapter finished; N-1 of N chapters finished (D14-19); no
//    locations (unread); a TOC id with NO seeded article row while all
//    present chapters are finished (D14-21).

const STANDALONE_UNREAD = makeStandalone("rv-standalone-unread", "The Unread Almanac", [
  "The almanac was printed in a winter when the harbor froze so hard that the pilots walked to their boats across the ice, and its tables still record the tide heights they measured through the cracks.",
  "Nobody has opened this copy since it was shelved, which the librarian considers a kind of purity: an almanac of a season that arrived, passed, and was never once consulted.",
]);
const STANDALONE_PROGRESS = makeStandalone(
  "rv-standalone-progress",
  "The Halfway Harbor Log",
  [
    "The harbor log opens on a Monday of small weather, four fishing boats out, one ferry delayed by fog, and a customs officer who signed the page with an enthusiasm the day did not otherwise justify.",
    "The middle of the log is where the ink changes hands, and the reader who stops here stops exactly where the season itself seemed to hesitate before deciding what kind of year to become.",
  ],
);
const STANDALONE_FINISHED = makeStandalone(
  "rv-standalone-finished",
  "The Completed Comet Register",
  [
    "The comet register ends on the last night of visibility, when the tail had thinned to a chalk line and the observers wrote their final coordinates with the reluctance of people closing a good conversation.",
    "Every observation is accounted for, every plate numbered, and the closing page carries a single sentence of summary that three astronomers independently describe as the finest paragraph they ever wrote.",
  ],
);

const DONE_C0 = makeChapter(
  "rv-done-c00",
  "Chapter 1. The Ledger of Tides",
  "rv-book-all-done",
  0,
  [
    "The tide ledger records, in a column of patient numerals, the exact height of every high water for a year, and the keeper who wrote it claimed he could hear the pattern in the numbers before he could see it.",
  ],
);
const DONE_C1 = makeChapter(
  "rv-done-c01",
  "Chapter 2. The Bell Founders",
  "rv-book-all-done",
  1,
  [
    "The bell founders poured their bronze on a cold morning so the mold would not crack, and the bell that came out rang a note they had not planned but recognized at once, the way one recognizes a face in a crowd.",
  ],
);
const BOOK_ALL_DONE = makeBook("rv-book-all-done", "Every Chapter Completed", [
  DONE_C0.id,
  DONE_C1.id,
]);

const PARTIAL_C0 = makeChapter(
  "rv-partial-c00",
  "Chapter 1. The Anchor Watch",
  "rv-book-three-of-four",
  0,
  [
    "The anchor watch kept their eyes on the riding light and their hands in their pockets, and the log they kept that night is almost entirely a record of weather that never arrived.",
  ],
);
const PARTIAL_C1 = makeChapter(
  "rv-partial-c01",
  "Chapter 2. The Chart Corrections",
  "rv-book-three-of-four",
  1,
  [
    "Chart corrections arrived in batches, and the younger officers learned to ink them in with the deliberate calm of people who knew the sea rarely reads its own maps.",
  ],
);
const PARTIAL_C2 = makeChapter(
  "rv-partial-c02",
  "Chapter 3. The Winter Quarantine",
  "rv-book-three-of-four",
  2,
  [
    "The winter quarantine turned the ship into a village, complete with a bakery, a school, and a long-running argument about the correct way to coil rope.",
  ],
);
const PARTIAL_C3 = makeChapter(
  "rv-partial-c03",
  "Chapter 4. The Unread Finish",
  "rv-book-three-of-four",
  3,
  [
    "The final chapter was printed after the rest of the edition had already sailed, and copies that contain it are rarer than the errors it was written to correct.",
  ],
);
const BOOK_PARTIAL = makeBook(
  "rv-book-three-of-four",
  "Three of Four Chapters Done",
  [PARTIAL_C0.id, PARTIAL_C1.id, PARTIAL_C2.id, PARTIAL_C3.id],
);

const ATLAS_C0 = makeChapter(
  "rv-atlas-c00",
  "Chapter 1. The Mercator Preface",
  "rv-book-never-opened",
  0,
  [
    "The preface promises a complete survey of the coast, and the engraver signed it with a flourish that suggests he believed every word.",
  ],
);
const ATLAS_C1 = makeChapter(
  "rv-atlas-c01",
  "Chapter 2. The Blank Western Sheet",
  "rv-book-never-opened",
  1,
  [
    "The western sheet is blank except for a single compass rose and a note that the survey continues, which it has now been doing for two centuries.",
  ],
);
const BOOK_UNREAD = makeBook("rv-book-never-opened", "The Unopened Atlas", [
  ATLAS_C0.id,
  ATLAS_C1.id,
]);

const MISS_C0 = makeChapter(
  "rv-miss-c00",
  "Chapter 1. The Surviving Preface",
  "rv-book-missing-row",
  0,
  [
    "The surviving preface explains that the volume was bound from whatever the fire left, and that the ordering of its pages is an act of hope rather than scholarship.",
  ],
);
const MISS_C1 = makeChapter(
  "rv-miss-c01",
  "Chapter 2. The Surviving Survey",
  "rv-book-missing-row",
  1,
  [
    "The survey that survived describes a coastline that has since moved twice, and its author appends an apology to future readers who will check his work against a shore he could not have known.",
  ],
);
/** Declared in the TOC but NEVER seeded as an article row — the D14-21
 * missing-chapter-row honesty edge (a partial import). */
const MISSING_ROW_ID = "rv-miss-c02-gone";
const BOOK_MISSING_ROW = makeBook("rv-book-missing-row", "The Partial Import Volume", [
  MISS_C0.id,
  MISS_C1.id,
  MISSING_ROW_ID,
]);

const SEEDED_STANDALONE = [STANDALONE_UNREAD, STANDALONE_PROGRESS, STANDALONE_FINISHED];
const CORPUS_ARTICLES: CanonicalArticle[] = [
  ...SEEDED_STANDALONE,
  DONE_C0,
  DONE_C1,
  PARTIAL_C0,
  PARTIAL_C1,
  PARTIAL_C2,
  PARTIAL_C3,
  ATLAS_C0,
  ATLAS_C1,
  MISS_C0,
  MISS_C1,
];
const CORPUS_BOOKS: Book[] = [BOOK_ALL_DONE, BOOK_PARTIAL, BOOK_UNREAD, BOOK_MISSING_ROW];

const CORPUS_LOCATIONS: LocationRecord[] = [
  // in-progress: a MID fraction (floor-ratio — the only legal floor use).
  loc(
    STANDALONE_PROGRESS.id,
    Math.floor(totalOf(STANDALONE_PROGRESS) * 0.5),
    "2026-08-21T10:00:00.000Z",
  ),
  // finished: graphemeOffset = the article's FULL total (ratio exactly 1 —
  // never a floored threshold multiple; the integer-truncation trap).
  loc(STANDALONE_FINISHED.id, totalOf(STANDALONE_FINISHED), "2026-08-21T11:00:00.000Z"),
  // every chapter of the all-done book, each at its OWN full total.
  loc(DONE_C0.id, totalOf(DONE_C0), "2026-08-21T09:00:00.000Z"),
  loc(DONE_C1.id, totalOf(DONE_C1), "2026-08-21T09:30:00.000Z"),
  // 3 of 4 chapters finished; PARTIAL_C3 has NO location (D14-19).
  loc(PARTIAL_C0.id, totalOf(PARTIAL_C0), "2026-08-21T08:00:00.000Z"),
  loc(PARTIAL_C1.id, totalOf(PARTIAL_C1), "2026-08-21T08:30:00.000Z"),
  loc(PARTIAL_C2.id, totalOf(PARTIAL_C2), "2026-08-21T08:45:00.000Z"),
  // every PRESENT chapter of the missing-row book finished (D14-21) — the
  // absent row keeps the book honestly in-progress regardless.
  loc(MISS_C0.id, totalOf(MISS_C0), "2026-08-21T07:00:00.000Z"),
  loc(MISS_C1.id, totalOf(MISS_C1), "2026-08-21T07:30:00.000Z"),
];

// ── Expected values — the SAME policy module the app renders (structural) ────

const TOTALS_BY_ID = new Map<string, number>();
for (const f of fixtures) TOTALS_BY_ID.set(f.id, totalOf(f));
for (const a of CORPUS_ARTICLES) TOTALS_BY_ID.set(a.id, totalOf(a));
const textLengthOf = (articleId: string): number | undefined =>
  TOTALS_BY_ID.get(articleId);

/** The latest-savedAt fold (the app's locationsByArticle discipline — D8-10). */
const LATEST_BY_ARTICLE = new Map<string, LocationRecord>();
for (const l of CORPUS_LOCATIONS) {
  const prev = LATEST_BY_ARTICLE.get(l.articleId);
  if (!prev || l.savedAt > prev.savedAt) LATEST_BY_ARTICLE.set(l.articleId, l);
}

const STANDALONE_ENTRIES = [
  ...SEEDED_STANDALONE.map((a) => ({
    id: a.id,
    location: LATEST_BY_ARTICLE.get(a.id),
    total: TOTALS_BY_ID.get(a.id)!,
  })),
  ...fixtures.map((f) => ({
    id: f.id,
    location: LATEST_BY_ARTICLE.get(f.id),
    total: TOTALS_BY_ID.get(f.id)!,
  })),
];

const EXPECTED_COUNTS = countByState(
  STANDALONE_ENTRIES,
  CORPUS_BOOKS,
  CORPUS_LOCATIONS,
  textLengthOf,
);
const EXPECTED_ALL_COUNT = STANDALONE_ENTRIES.length + CORPUS_BOOKS.length;

/** The zero-seed expectation (bundled fixtures only — all unread). */
const FIXTURE_ENTRIES = fixtures.map((f) => ({
  id: f.id,
  location: undefined,
  total: TOTALS_BY_ID.get(f.id)!,
}));
const EMPTY_COUNTS = countByState(FIXTURE_ENTRIES, [], [], textLengthOf);

type ViewName = "all" | "unread" | "in-progress" | "finished";
const VIEW_HREFS: Record<ViewName, string> = {
  all: "#/",
  unread: "#/unread",
  "in-progress": "#/in-progress",
  finished: "#/finished",
};
const VIEW_LABELS: Record<ViewName, string> = {
  all: "All",
  unread: "Unread",
  "in-progress": "In progress",
  finished: "Finished",
};
const EMPTY_HEADINGS: Record<ViewName, string> = {
  all: "Your library is empty",
  unread: "Nothing unread",
  "in-progress": "Nothing in progress",
  finished: "Nothing finished yet",
};

/** Expected count for a view — countByState (unread), or standalone+books (all). */
function expectedCountFor(view: ViewName): number {
  return view === "all" ? EXPECTED_ALL_COUNT : EXPECTED_COUNTS[view];
}

/** Expected ROWS for a view — membership via the same two derivations the
 * render body uses; cross-checked against expectedCountFor (the structural
 * lock: counts CANNOT disagree with membership — D14-23/D14-24). */
function expectedRowsFor(view: ViewName): number {
  if (view === "all") return EXPECTED_ALL_COUNT;
  const state = view;
  const standaloneRows = STANDALONE_ENTRIES.filter(
    (e) => articleReadingState(e.location, e.total) === state,
  ).length;
  const bookRows = CORPUS_BOOKS.filter(
    (b) => bookReadingState(b, CORPUS_LOCATIONS, textLengthOf) === state,
  ).length;
  if (standaloneRows + bookRows !== EXPECTED_COUNTS[state]) {
    throw new Error(
      `corpus drift: rows (${standaloneRows}+${bookRows}) != counts (${EXPECTED_COUNTS[state]}) for ${state}`,
    );
  }
  return standaloneRows + bookRows;
}

// ── Seeding helpers (raw IndexedDB puts — the seedLocation discipline) ───────

/** seedLocation — cloned VERBATIM from progress-recent.spec.ts (raw put into
 * the location store; the compound key [articleId+revision] is supplied by
 * the row's own articleId + revision fields). */
async function seedLocation(
  page: Page,
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

/** seedBook — write ONE BookSchema-valid row (built in Node) into the v5
 * books store via a raw put. */
async function seedBook(page: Page, book: Book): Promise<void> {
  await page.evaluate(async (row) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("books")) {
          resolve();
          return;
        }
        const tx = db.transaction("books", "readwrite");
        tx.objectStore("books").put(row);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, book);
}

/** seedArticleRows — write ArticleSchema-valid article rows (built in Node)
 * into the articles store. Chapter rows carry BOTH ingestionMeta.bookId AND
 * the denormalized top-level bookId (the booksStore.saveBook write shape —
 * the 12-03 v5 index contract). */
async function seedArticleRows(
  page: Page,
  articles: CanonicalArticle[],
): Promise<void> {
  const rows = articles.map((a) => ({
    ...a,
    ...(a.ingestionMeta?.bookId ? { bookId: a.ingestionMeta.bookId } : {}),
  }));
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
  }, rows);
}

/** Seed the full corpus (books → chapter/standalone article rows →
 * locations). MUST run BEFORE openView (seed-before-open discipline). */
async function seedCorpus(page: Page): Promise<void> {
  for (const book of CORPUS_BOOKS) {
    await seedBook(page, book);
  }
  await seedArticleRows(page, CORPUS_ARTICLES);
  for (const l of CORPUS_LOCATIONS) {
    await seedLocation(page, l.articleId, l.graphemeOffset, l.savedAt);
  }
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

/** Assert all four switcher accessible names carry the policy-expected
 * counts exactly (D14-23 — structural agreement, every view renders all
 * four labels). */
async function expectSwitcherCounts(page: Page): Promise<void> {
  await expect(
    page.getByRole("link", { name: `All (${EXPECTED_ALL_COUNT})` }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: `Unread (${EXPECTED_COUNTS.unread})` }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: `In progress (${EXPECTED_COUNTS["in-progress"]})` }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: `Finished (${EXPECTED_COUNTS.finished})` }),
  ).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  // Stub remote images so figure-heavy fixtures don't couple to network.
  await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg/>" }),
  );

  // Mount the SPA so Dexie constructs the lem-reader DB schema, then CLEAR
  // every store's rows for deterministic first-run state (mirrors
  // dexie-migration.spec.ts beforeEach — clear-rows, NOT deleteDatabase, to
  // avoid the webkit deleteDatabase race). 14-04: "books" is ADDED to the
  // cloned list — the v5 store the progress-recent list predates.
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

test.describe("LIB-07/LIB-08 — views/counts/rows/empty agreement (D14-20/23/24)", () => {
  test("corpus sanity: the imported policy derives the designed corpus (the honesty rows are in-progress)", () => {
    // Pure-Node pin over the module-scope expectations — loud, named drift
    // detection for the corpus constants above (never a page test).
    expect(EXPECTED_COUNTS.unread).toBe(8); // 6 fixtures + unread standalone + unread book
    expect(EXPECTED_COUNTS["in-progress"]).toBe(3); // mid standalone + 3-of-4 book + missing-row book
    expect(EXPECTED_COUNTS.finished).toBe(2); // full-total standalone + all-done book
    expect(EXPECTED_ALL_COUNT).toBe(13); // 9 standalone + 4 books (one item per book — D14-24)
    expect(EMPTY_COUNTS["in-progress"]).toBe(0);
    expect(EMPTY_COUNTS.finished).toBe(0);
    // The honesty rows themselves, held out against the seeded raw rows:
    expect(bookReadingState(BOOK_PARTIAL, CORPUS_LOCATIONS, textLengthOf)).toBe(
      "in-progress",
    );
    expect(
      bookReadingState(BOOK_MISSING_ROW, CORPUS_LOCATIONS, textLengthOf),
    ).toBe("in-progress");
  });

  for (const view of ["all", "unread", "in-progress", "finished"] as const) {
    test(`agreement on ${VIEW_HREFS[view]}: count labels, rendered rows, empty state, and aria-current all agree with the imported policy`, async ({
      page,
    }) => {
      await seedCorpus(page);
      await openView(page, VIEW_HREFS[view]);

      // (1) The switcher link's accessible name matches the expected count
      // EXACTLY (all four labels — each is visible on every view).
      await expectSwitcherCounts(page);

      // (2) The active link carries exactly one aria-current="page"
      // (URL↔DOM agreement — D14-22).
      await expect(
        page.getByRole("link", {
          name: `${VIEW_LABELS[view]} (${expectedCountFor(view)})`,
        }),
      ).toHaveAttribute("aria-current", "page");
      await expect(page.locator(".view-switcher a[aria-current='page']")).toHaveCount(1);

      // (3) Rendered rows equal the expected membership for this view
      // (.library-list > li DIRECT children — a book row is ONE li, its
      // nested chapter lis never count top-level — D14-24).
      await expect(page.locator(".library-list > li")).toHaveCount(
        expectedRowsFor(view),
      );

      // (4) The per-view empty-state heading appears EXACTLY when the
      // expected count is zero (D14-26 — membership-driven).
      if (expectedCountFor(view) === 0) {
        await expect(
          page.getByRole("heading", { name: EMPTY_HEADINGS[view] }),
        ).toBeVisible();
      } else {
        await expect(
          page.getByRole("heading", { name: EMPTY_HEADINGS[view] }),
        ).toHaveCount(0);
      }
    });
  }

  test("per-view empty states appear exactly when the view's expected count is zero (D14-26)", async ({
    page,
  }) => {
    // NO seeds — the six bundled fixtures are all unread: in-progress and
    // finished are empty (their calm copy renders INSTEAD of the ul); all
    // and unread are not.
    await openView(page, "#/in-progress");
    await expect(page.getByRole("link", { name: "In progress (0)" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nothing in progress" }),
    ).toBeVisible();
    await expect(page.locator("ul.library-list")).toHaveCount(0);

    await openView(page, "#/finished");
    await expect(page.getByRole("link", { name: "Finished (0)" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nothing finished yet" }),
    ).toBeVisible();

    await openView(page, "#/unread");
    await expect(
      page.getByRole("heading", { name: "Nothing unread" }),
    ).toHaveCount(0);
    await expect(page.locator(".library-list > li")).toHaveCount(fixtures.length);

    await openView(page, "#/");
    await expect(
      page.getByRole("heading", { name: "Your library is empty" }),
    ).toHaveCount(0);
    await expect(page.locator(".library-list > li")).toHaveCount(fixtures.length);
  });

  test("unknown #/ segment falls back to the All view (D14-16)", async ({
    page,
  }) => {
    await seedCorpus(page);
    await openView(page, "#/bogus-view");
    await expect(
      page.getByRole("link", { name: `All (${EXPECTED_ALL_COUNT})` }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".library-list > li")).toHaveCount(EXPECTED_ALL_COUNT);
  });

  test("reload on #/finished stays Finished with aria-current on the Finished link (D14-17)", async ({
    page,
  }) => {
    await seedCorpus(page);
    await openView(page, "#/finished");
    // openView already cold-loaded; the explicit second reload is the
    // D14-17 statement — reload is a cold load: the URL restores the view.
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("link", { name: /^Finished \(\d+\)/ }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("link", { name: `Finished (${EXPECTED_COUNTS.finished})` }),
    ).toBeVisible();
    await expect(page.locator(".library-list > li")).toHaveCount(
      EXPECTED_COUNTS.finished,
    );
  });

  test("honesty rows: the 3-of-4 book and the missing-chapter-row book render In progress, never Finished (D14-19/D14-21)", async ({
    page,
  }) => {
    await seedCorpus(page);

    // Visible under #/in-progress…
    await openView(page, "#/in-progress");
    await expect(
      page.locator(".library-list > li").filter({ hasText: BOOK_PARTIAL.title }),
    ).toBeVisible();
    await expect(
      page
        .locator(".library-list > li")
        .filter({ hasText: BOOK_MISSING_ROW.title }),
    ).toBeVisible();

    // …and absent from #/finished — a 39-of-40-chapter book and a book with
    // a missing chapter row NEVER read Finished (no-silent-garbage; held-out
    // checks against the seeded raw IndexedDB rows, not inferred from unit
    // tests).
    await openView(page, "#/finished");
    await expect(
      page.locator(".library-list > li").filter({ hasText: BOOK_PARTIAL.title }),
    ).toHaveCount(0);
    await expect(
      page
        .locator(".library-list > li")
        .filter({ hasText: BOOK_MISSING_ROW.title }),
    ).toHaveCount(0);
  });
});

// ── Plan 14-04 Task 2 — the NAV-04 focus/title/history matrix ────────────────
// Each case pins one locked decision from 14-CONTEXT (D14-01..D14-17) in a
// real browser; plain test() blocks inherit the 3-engine matrix. toBeFocused
// auto-retries (absorbing engine focus-settle timing); toHaveTitle/toHaveURL
// are the verified Playwright assertions (14-RESEARCH §Code Examples).
const LIBRARY_TITLE = "Saved articles — Lem Reader";

test.describe("NAV-04 — focus/title/history matrix", () => {
  test("cold load on #/finished: view restored, title set, h1 NOT focused (D14-03/D14-17)", async ({
    page,
  }) => {
    await seedCorpus(page);
    // A TRUE cold boot: full document navigation (about:blank → the deep
    // URL) — the app loads with the hash already #/finished, so no
    // hashchange ever fires and hasAppHistory stays false. (openView's
    // same-document goto + reload would warm-switch the already-mounted
    // library first, and Chromium then restores the focused h1 across the
    // reload — browser-native, not an app focus move.)
    await page.goto("about:blank");
    await page.goto(`${BASE}/#/finished`);
    const h1 = page.getByRole("heading", { level: 1, name: "Saved articles" });
    await expect(h1).toBeVisible({ timeout: 10_000 });
    // Readiness: counts render only at status ready.
    await expect(page.getByRole("link", { name: /^All \(\d+\)/ })).toBeVisible({
      timeout: 10_000,
    });
    // D14-03 — cold loads keep natural browser focus (never yank).
    await expect(h1).not.toBeFocused();
    // D14-02/D14-17 — the title + the URL-restored view.
    await expect(page).toHaveTitle(LIBRARY_TITLE);
    await expect(
      page.getByRole("link", { name: `Finished (${EXPECTED_COUNTS.finished})` }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("in-app swap: open article focuses its h1 + sets the article title; Back refocuses the library h1 (D14-01/D14-08)", async ({
    page,
  }) => {
    await seedCorpus(page);
    await openView(page, "#/");

    // fixtures[0] has NO location in this corpus → the fresh-article path:
    // the h1 default is the most specific focus target (D14-05 layering).
    const fixtureTitle = fixtures[0]!.provenance.title;
    await page
      .locator(`.library-list a[href="#/article/${fixtures[0]!.id}"]`)
      .click();
    const articleH1 = page.getByRole("heading", { level: 1, name: fixtureTitle });
    await expect(articleH1).toBeVisible({ timeout: 10_000 });
    await expect(articleH1).toBeFocused();
    await expect(page).toHaveTitle(`${fixtureTitle} — Lem Reader`);

    // Back → the library remounts warm (hashchange) → uniform h1 rule
    // (D14-08/D14-15) + the library title returns.
    await page.goBack();
    const libraryH1 = page.getByRole("heading", {
      level: 1,
      name: "Saved articles",
    });
    await expect(libraryH1).toBeVisible({ timeout: 10_000 });
    await expect(libraryH1).toBeFocused();
    await expect(page).toHaveTitle(LIBRARY_TITLE);
  });

  test("view switch: replaceState URL + aria-current move + library h1 focus + title unchanged (D14-13/D14-15/D14-25)", async ({
    page,
  }) => {
    await seedCorpus(page);
    await openView(page, "#/");
    await expect(page).toHaveTitle(LIBRARY_TITLE);

    // A real reader click on the Unread switcher link.
    await page
      .getByRole("link", { name: `Unread (${EXPECTED_COUNTS.unread})` })
      .click();
    // replaceState semantics: the URL changed in place…
    await expect(page).toHaveURL(/#\/unread$/);
    // …aria-current moved to Unread (exactly one)…
    await expect(
      page.getByRole("link", { name: `Unread (${EXPECTED_COUNTS.unread})` }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".view-switcher a[aria-current='page']")).toHaveCount(1);
    // …the uniform h1 rule fired on the swap (D14-15)…
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeFocused();
    // …and the library title is CONSTANT across views (D14-25).
    await expect(page).toHaveTitle(LIBRARY_TITLE);
  });

  test("history: Back from an article returns to the ORIGINATING view, never an intermediate switch (D14-13/D14-14)", async ({
    page,
    }) => {
    await seedCorpus(page);
    await openView(page, "#/");

    // Two switches — each replaces the library's single history entry, so
    // the entry now reads #/finished (the #/unread switch was never pushed).
    await page
      .getByRole("link", { name: `Unread (${EXPECTED_COUNTS.unread})` })
      .click();
    await expect(page).toHaveURL(/#\/unread$/);
    await page
      .getByRole("link", { name: `Finished (${EXPECTED_COUNTS.finished})` })
      .click();
    await expect(page).toHaveURL(/#\/finished$/);

    // Open an article (a destination PUSH), then go Back.
    await page.locator(".library-list a[href^='#/article/']").first().click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeHidden({ timeout: 10_000 });
    await page.goBack();
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible({ timeout: 10_000 });
    // Back landed on the FINAL (#/finished) view — the intermediate #/unread
    // entry never existed (replaceState — D14-13/D14-14).
    await expect(page).toHaveURL(/#\/finished$/);
    await expect(
      page.getByRole("link", { name: /^Finished \(\d+\)/ }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("deep link: the hl mark is focused and the article h1 is NOT (D14-05)", async ({
    page,
  }) => {
    // The jump-bidirectional seeding, minimized: a standalone article with a
    // derived-and-verified CONFIDENT anchor (re-resolves confident in the
    // app through the shipped resolver — never a forked offset).
    const ARTICLE_ID = "rv-deep-link-corpus";
    const HIGHLIGHT_ID = "hl-rv-deep-link-1";
    const TITLE = "The Lantern Slack Survey";
    const article = makeArticle({
      id: ARTICLE_ID,
      title: TITLE,
      paragraphs: [
        "The lantern survey began as a joke about the harbor's appetite for spare parts and ended as the only complete census of slack wire, spare glass, and unlit wicks ever taken on this coast.",
        "Each keeper recorded the state of the lantern room in a margin notebook, and the margins slowly filled with weather, small repairs, and the occasional confession about a night the light burned fainter than the ledger admitted.",
        "When the survey was finally collated, the inspectors found that the joke had become a mirror: the harbor, it turned out, had been keeping careful track of itself all along, and simply wanted someone to ask.",
      ],
    });
    const anchor = confidentHighlightOn(article);
    await seedRows(page, {
      articles: [article],
      highlights: [highlightRow(ARTICLE_ID, anchor, HIGHLIGHT_ID)],
    });

    // The deep link (in-app hash arrival): the jump pipeline owns focus.
    await page.goto(`${BASE}/#/article/${ARTICLE_ID}/h/${HIGHLIGHT_ID}`);
    await expect(
      page.getByRole("heading", { level: 1, name: TITLE }),
    ).toBeVisible({ timeout: 10_000 });
    const mark = page.locator(
      `mark.highlight[data-highlight-id="${HIGHLIGHT_ID}"]`,
    );
    await expect(mark.first()).toBeVisible({ timeout: 10_000 });
    await expect(mark.first()).toBeFocused();
    // Most-specific target wins — the h1 default never fired (D14-05).
    await expect(
      page.getByRole("heading", { level: 1, name: TITLE }),
    ).not.toBeFocused();
  });

  test("restore beats h1: opening the mid-article standalone shows the resume banner and never focuses the h1 (D14-10)", async ({
    page,
  }) => {
    await seedCorpus(page);
    await openView(page, "#/");

    // STANDALONE_PROGRESS is seeded at a mid fraction — the saved-location
    // restore (scroll + banner) owns the arrival; the h1 default never runs.
    await page
      .locator(`.library-list a[href="#/article/${STANDALONE_PROGRESS.id}"]`)
      .click();
    const articleH1 = page.getByRole("heading", {
      level: 1,
      name: STANDALONE_PROGRESS.provenance.title,
    });
    await expect(articleH1).toBeVisible({ timeout: 10_000 });
    const banner = page.locator(".resume-banner");
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toContainText("You left off here");
    await expect(articleH1).not.toBeFocused();
  });

  test("overlay stability: opening + closing the settings panel never touches the title (D14-11)", async ({
    page,
  }) => {
    await seedCorpus(page);
    await openView(page, "#/");
    await expect(page).toHaveTitle(LIBRARY_TITLE);

    // The header trigger (accessible name "Reading settings" — Header.tsx).
    await page.getByRole("button", { name: "Reading settings" }).click();
    await expect(page.locator("dialog.settings-panel")).toBeVisible();
    await expect(page).toHaveTitle(LIBRARY_TITLE);

    // Native <dialog> Esc close — the title is unchanged after, too.
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.settings-panel")).toBeHidden();
    await expect(page).toHaveTitle(LIBRARY_TITLE);
  });

  test("error parity: a nonexistent article id focuses the error h1 + sets the truthful title (D14-06)", async ({
    page,
  }) => {
    await seedCorpus(page);
    await openView(page, "#/");

    // From an in-app surface: a plain hash assignment (push + hashchange →
    // warm arrival) to an id no row will ever satisfy.
    await page.evaluate(() => {
      window.location.hash = "#/article/rv-article-that-does-not-exist";
    });
    const errorH1 = page.getByRole("heading", {
      level: 1,
      name: "Couldn't open this article.",
    });
    await expect(errorH1).toBeVisible({ timeout: 10_000 });
    await expect(errorH1).toBeFocused();
    await expect(page).toHaveTitle("Couldn't open this article — Lem Reader");
  });

  test("EPUB chapter title: opening a seeded chapter titles the tab Chapter — Book — Lem Reader (D14-07)", async ({
    page,
  }) => {
    await seedCorpus(page);
    await openView(page, "#/");

    // Expand the all-done book row and open its first chapter through the
    // real chapter link (a reader click — push + warm arrival).
    const bookRow = page
      .locator(".library-list > li")
      .filter({ hasText: BOOK_ALL_DONE.title });
    await bookRow.locator(".book-toggle").click();
    await bookRow
      .locator(`.book-chapter-list a[href="#/article/${DONE_C0.id}"]`)
      .click();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: DONE_C0.provenance.title,
      }),
    ).toBeVisible({ timeout: 10_000 });
    // D14-07 — the combined content portion (chapter — book) + the suffix;
    // both titles are short, so no 64-char truncation applies.
    await expect(page).toHaveTitle(
      `${DONE_C0.provenance.title} — ${BOOK_ALL_DONE.title} — Lem Reader`,
    );
  });

  test("review destination: the in-app Highlights button sets the destination title + focuses the h1 (D14-01/D14-02; renamed D15-06)", async ({
    page,
  }) => {
    await seedCorpus(page);
    await openView(page, "#/");

    // The library header's quiet button (LibraryView, "Highlights" since
    // Plan 15-01 / D15-06) — its hash assignment
    // pushes + fires hashchange, so the ReviewView mount is WARM.
    await page.getByRole("button", { name: "Highlights" }).click();
    const reviewH1 = page.getByRole("heading", {
      level: 1,
      name: "Highlights",
    });
    await expect(reviewH1).toBeVisible({ timeout: 10_000 });
    await expect(reviewH1).toBeFocused();
    await expect(page).toHaveTitle("Highlights — Lem Reader");
  });
});
