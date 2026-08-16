// tests/e2e/review-panel/listing.spec.ts
// Plan 10-04 Task 1 — the REAL listing assertions (RECV-01.b plus the e2e
// smoke of RECV-01.d), replacing the 10-01 Wave-0 sentinel in place
// (strengthen-only rewrite: the file + describe base name carry forward).
//
// Verification-map rows owned by this file (10-VALIDATION.md):
//   - RECV-01.b — cross-article listing w/ article/date/position metadata
//   - RECV-01.d — filter AND-composition + the three sorts (e2e smoke over
//     the 10-01 unit-proven derivation core)
//
// Corpus (built ENTIRELY through the _portability.ts seeding helpers —
// REUSE-DO-NOT-FORK, no forked seed machinery):
//   - Article A "Alpha Grafton Field Notes" (id review-alpha-corpus, tag
//     "essay", seeded FIRST in library order): 2 confident highlights at
//     different positions with deliberately crossed createdAt — the
//     EARLIER-position highlight is OLDER, the LATER-position highlight is
//     NEWER — so within-section date order ≠ position order. The
//     later-position highlight carries a NoteRecord.
//   - Article B "Zeta Harbor Ledger" (id review-zeta-corpus, alpha-later
//     title, no tags, seeded SECOND): 1 confident highlight whose createdAt
//     is the corpus-newest.
//
// Why the corpus proves each sort DISTINCTLY (D10-08):
//   - Date (default): sections by newest entry → B before A. B's title is
//     alpha-LATER, so this is the OPPOSITE of alpha order.
//   - Article: title localeCompare → A before B (the flip).
//   - Position: sections in the input articles-array order → A first, B
//     second (ingested rows come back from Dexie toArray() in primary-key
//     order and review-alpha-corpus < review-zeta-corpus). A-first differs
//     from the Date ordering, so a Date-fallback regression fails HERE.
//   - Within A: date sort renders newest-first (A2 before A1) while
//     position sort renders position-ascending (A1 before A2) — the
//     position-order assertion lives ONLY under the Position sort, and the
//     date-order assertion ONLY under the default Date sort.
//
// Harness discipline (the two 10-03 e2e-harness fixes, reused):
//   - schema-declaring reload: wipeDatabase leaves the page live against a
//     deleted DB, so the seed helper FULLY reloads the app once (Dexie
//     re-declares the v4 schema) before seedRows — otherwise seedRows'
//     raw indexedDB.open recreates a store-less v1 DB whose open connection
//     blocks Dexie's upgrade forever.
//   - Rows seed AFTER the reload and BEFORE the hash-only #/review goto
//     (same-document navigation mounts ReviewView, whose load effect reads
//     the seeded rows — the proven 10-03 shape).
//
// Selector discipline (STATE 08-05 .library-list > li lesson): rows are
// located via the review-specific .review-row anatomy and quote text —
// NEVER a generic li count (the TagFilter fieldset could otherwise
// over-count). Order is asserted only where ordering IS the assertion
// target (the sort test).
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { BASE, wipeDatabase } from "../annotations/_fixtures";
import {
  confidentHighlightOn,
  highlightRow,
  makeArticle,
  seedRows,
  type SeedRows,
} from "../portability/_portability";
import { graphemeLength } from "../../../src/content/normalizeText";

const A_ID = "review-alpha-corpus";
const B_ID = "review-zeta-corpus";
const TITLE_A = "Alpha Grafton Field Notes";
const TITLE_B = "Zeta Harbor Ledger";
const TAG_A = "essay";
const NOTE_TEXT =
  "Cross-check this figure against the sensors before the warden's evening review.";

const PARAGRAPHS_A = [
  "The grafton field station kept its ledgers in alphabetical order, a habit begun by the first warden and never questioned since. Every morning the surveyors copied the overnight readings into the alpha book, and every evening the warden checked their arithmetic by candlelight, correcting mistakes with a steady hand and an unhurried frown.",
  "The station's younger researchers preferred digital instruments and argued for them at every monthly meeting, but the warden held that a pencil line in a paper ledger outlives any format yet invented. He was fond of saying that the archive had already survived two floods, one fire, and three changes of government, while the server in the basement had not yet survived a single power cut.",
  "Autumn brought the migration counts, and with them the long silent hours in the hide at the north edge of the marsh. The birds arrived in squadrons, settled briefly on the grey water, and departed without ceremony, and the surveyors learned to read the weather in the angle of their departure rather than in any instrument the station owned.",
  "In the last week of October the warden assembled the season's figures and found, to his quiet satisfaction, that the alpha book agreed with the digital sensors to within a margin no honest observer could dispute. He recorded the agreement in both records, noted the date, and locked the ledgers in the iron cabinet as he had done for thirty-one winters before.",
  "The station survives him now, and the ledgers survive the station's budget, which is perhaps the surest argument either record could make. New surveyors still copy the overnight readings into the alpha book each morning, less from superstition than from the accumulated evidence that some habits carry their own justification forward.",
];

const PARAGRAPHS_B = [
  "The harbor ledger began as a single stubborn column in a ship chandler's account book, the zeta column, reserved for debts the chandler expected never to collect. Over four decades the column grew into its own volume, then into a shelf of volumes, recording every small promise made across the quays of the aging port.",
  "Collectors who came after the chandler found that the zeta ledger read less like accounts and more like a social history of the waterfront. Each entry carried a name, a boat, a sum, and a sentence of context, and the sentences together traced forty years of storms, weddings, bankruptcies, and reconciliations better than any official chronicle bothered to.",
  "The port authority digitized the ledger last spring and discovered that the chandler's doubtful column balanced to within a shilling. No one could explain it. The archivists' best theory is that the debts he expected never to collect were, more often than not, quietly repaid by people who wanted their sentence in the ledger to end well.",
];

// Articles built through makeArticle (ArticleSchema.parse at construction).
// The tags field is a schema-valid addition on A's row (ArticleSchema.tags —
// the only tag in the corpus, so the panel renders exactly one chip).
const ARTICLE_A_BASE = makeArticle({
  id: A_ID,
  title: TITLE_A,
  paragraphs: PARAGRAPHS_A,
});
const ARTICLE_B = makeArticle({
  id: B_ID,
  title: TITLE_B,
  paragraphs: PARAGRAPHS_B,
});
const ARTICLE_A = { ...ARTICLE_A_BASE, tags: [TAG_A] };

// Confident anchors derived + verified through the SHIPPED selector
// machinery at seed time (confidentHighlightOn), at deliberately different
// depths: A1 near the top, A2 past the halfway point.
const ANCHOR_A1 = confidentHighlightOn(ARTICLE_A_BASE, { start: 8 });
const ANCHOR_A2 = confidentHighlightOn(ARTICLE_A_BASE, {
  start: Math.floor(graphemeLength(ARTICLE_A_BASE) * 0.55),
});
const ANCHOR_B1 = confidentHighlightOn(ARTICLE_B, { start: 8 });

// Corpus-construction invariants (fail at import time, before any browser
// work, if the prose ever changes such that the sort proofs lose their
// discriminating power).
if (ANCHOR_A1.position.start >= ANCHOR_A2.position.start) {
  throw new Error(
    `corpus invariant: A1 (start ${ANCHOR_A1.position.start}) must precede A2 (start ${ANCHOR_A2.position.start})`,
  );
}
if (ANCHOR_A1.quote.exact === ANCHOR_A2.quote.exact) {
  throw new Error("corpus invariant: A1/A2 excerpts must be distinct");
}

const EXCERPT_A1 = ANCHOR_A1.quote.exact;
const EXCERPT_A2 = ANCHOR_A2.quote.exact;
const EXCERPT_B1 = ANCHOR_B1.quote.exact;

// Highlight rows with explicitly seeded createdAt: A1 older than A2, A2
// older than B1 (highlightRow's default createdAt is overridden via spread —
// the row shape itself comes from the shared helper).
const ROW_A1 = {
  ...highlightRow(A_ID, ANCHOR_A1, "hl-review-a1"),
  createdAt: "2026-08-11T09:00:00.000Z",
};
const ROW_A2 = {
  ...highlightRow(A_ID, ANCHOR_A2, "hl-review-a2"),
  createdAt: "2026-08-12T15:00:00.000Z",
};
const ROW_B1 = {
  ...highlightRow(B_ID, ANCHOR_B1, "hl-review-b1"),
  createdAt: "2026-08-13T10:00:00.000Z",
};
// The NoteRecord row (NoteRecordSchema shape, seeded 1:1 via highlightId).
const NOTE_A2 = {
  schemaVersion: 1,
  id: "note-review-a2",
  highlightId: "hl-review-a2",
  text: NOTE_TEXT,
  updatedAt: "2026-08-12T15:01:00.000Z",
};

// Seeded in this library order: article A first, article B second (Dexie
// returns the rows in primary-key order, and review-alpha-corpus sorts
// before review-zeta-corpus — the Position-sort expectation).
const CORPUS_ROWS: SeedRows = {
  articles: [ARTICLE_A, ARTICLE_B],
  highlights: [ROW_A1, ROW_A2, ROW_B1],
  notes: [NOTE_A2],
};

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

/** Reload-boot the app so Dexie re-declares the v4 schema after the wipe
 * (the 10-03 schema-declaring reload), seed the corpus, then open #/review
 * and wait for the panel h1. */
async function seedCorpusAndOpenReview(
  page: Page,
  rows: SeedRows = CORPUS_ROWS,
): Promise<void> {
  await page.goto(`${BASE}/#/`);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Saved articles" }),
  ).toBeVisible();
  // A fixture row renders only once listArticles() has completed — the
  // deterministic "Dexie is open + schema declared" signal (the library is
  // a fixtures ∪ ingested union, so it is never empty).
  await expect(
    page.getByText("The looting of science fiction").first(),
  ).toBeVisible();
  await seedRows(page, rows);
  await page.goto(`${BASE}/#/review`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Review highlights" }),
  ).toBeVisible();
}

/** The grouped section for one article title (h2 = provenance.title; these
 * corpus articles carry no sourceUrl so the heading text is exactly the
 * title — no host suffix). */
function sectionByTitle(page: Page, title: string) {
  return page.locator("section.review-section", {
    has: page.getByRole("heading", { level: 2, name: title, exact: true }),
  });
}

/** In-DOM order of every section heading (article sections + any orphan
 * tail — this corpus has no orphans). */
async function sectionHeadingTexts(page: Page): Promise<string[]> {
  return (await page.locator("section.review-section > h2").allTextContents())
    .map((t) => t.trim());
}

/** In-DOM order of the row quote excerpts within one article's section. */
async function quoteTextsInSection(
  page: Page,
  title: string,
): Promise<string[]> {
  return (await sectionByTitle(page, title).locator(".review-quote").allTextContents())
    .map((t) => t.trim());
}

test.describe("RECV-01.b review-panel listing (10-04 cross-article + filters + sorts)", () => {
  test("completeness + metadata: every highlight under its article h2, note preview, dates, newest-first rows", async ({
    page,
  }) => {
    await seedCorpusAndOpenReview(page);

    // Completeness: an h2 section per article, and EVERY seeded highlight's
    // quote excerpt visible inside its own article's section.
    await expect(sectionByTitle(page, TITLE_A)).toBeVisible();
    await expect(sectionByTitle(page, TITLE_B)).toBeVisible();
    const placements = [
      [TITLE_A, EXCERPT_A1],
      [TITLE_A, EXCERPT_A2],
      [TITLE_B, EXCERPT_B1],
    ] as const;
    for (const [title, excerpt] of placements) {
      await expect(
        sectionByTitle(page, title)
          .locator(".review-row", { hasText: excerpt })
          .first(),
      ).toBeVisible();
    }

    // Metadata: the noted row shows its note preview text.
    await expect(
      sectionByTitle(page, TITLE_A)
        .locator(".review-row", { hasText: NOTE_TEXT })
        .first(),
    ).toBeVisible();

    // Metadata: every row shows a (non-empty) date.
    const dates = await page
      .locator(".review-row .review-date")
      .allTextContents();
    expect(dates, "one .review-date per row").toHaveLength(3);
    for (const d of dates) {
      expect(d.trim().length).toBeGreaterThan(0);
    }

    // DEFAULT Date contract: rows within a section render newest-first —
    // A2 (createdAt 08-12) precedes A1 (08-11). The position-order
    // assertion deliberately does NOT live here; it lives under the
    // Position sort in the sort test, whose contract is position.
    expect(await quoteTextsInSection(page, TITLE_A)).toEqual([
      EXCERPT_A2,
      EXCERPT_A1,
    ]);
  });

  test("tag chip narrows to the tagged article's rows", async ({ page }) => {
    await seedCorpusAndOpenReview(page);

    await page.getByRole("button", { name: `Filter by tag: ${TAG_A}` }).click();

    // Article A's section and both rows remain…
    await expect(sectionByTitle(page, TITLE_A)).toBeVisible();
    await expect(
      sectionByTitle(page, TITLE_A).locator(".review-row"),
    ).toHaveCount(2);
    // …and article B is gone entirely (section heading absent).
    await expect(
      page.getByRole("heading", { level: 2, name: TITLE_B, exact: true }),
    ).toHaveCount(0);
  });

  test("article select narrows to one article (and is populated with both titles)", async ({
    page,
  }) => {
    await seedCorpusAndOpenReview(page);

    const select = page.getByLabel("Article", { exact: true });
    // The select lists every article (fixtures included — the composite
    // library); both corpus titles must be present.
    const optionTexts = await select.locator("option").allTextContents();
    expect(optionTexts).toContain(TITLE_A);
    expect(optionTexts).toContain(TITLE_B);

    await select.selectOption({ label: TITLE_B });

    await expect(sectionByTitle(page, TITLE_B)).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: TITLE_A, exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".review-row")).toHaveCount(1);
  });

  test("confidence filter composes with AND semantics", async ({ page }) => {
    await seedCorpusAndOpenReview(page);

    const confidence = page.getByLabel("Anchor confidence", { exact: true });
    // All corpus rows are confident — "Confident" is a first-class option
    // and keeps every row (documents the option, not just the default).
    await confidence.selectOption({ label: "Confident" });
    await expect(page.locator(".review-row")).toHaveCount(3);

    // Compose: tag "essay" (keeps only A's rows) ∧ confidence "Ambiguous"
    // (keeps only ambiguous rows) — no seeded row satisfies BOTH, so zero
    // rows render (the no-match empty copy is owned by empty-states.spec).
    await page.getByRole("button", { name: `Filter by tag: ${TAG_A}` }).click();
    await confidence.selectOption({ label: "Ambiguous" });
    await expect(page.locator(".review-row")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0);
  });

  test("sort flips: Date default → Article alpha → Position library order + position rows", async ({
    page,
  }) => {
    await seedCorpusAndOpenReview(page);

    const sort = page.getByLabel("Sort", { exact: true });
    // The default is pinned, not assumed.
    await expect(sort).toHaveValue("date");

    // Date (default): sections by newest entry createdAt — B's single
    // corpus-newest highlight puts B first. B's title is alpha-LATER, so
    // this ordering is deliberately NOT alpha order.
    expect(await sectionHeadingTexts(page)).toEqual([TITLE_B, TITLE_A]);

    // Article: title localeCompare — the order flips to alpha.
    await sort.selectOption("article");
    expect(await sectionHeadingTexts(page)).toEqual([TITLE_A, TITLE_B]);

    // Position: sections follow the seeded library order (A first, B
    // second — differs from the Date ordering above, so a Date-fallback
    // regression fails here) and rows within A render position-ascending
    // (A1, the earlier-position excerpt, first — the mirrored opposite of
    // the newest-first DOM order asserted under the default Date sort).
    await sort.selectOption("position");
    expect(await sectionHeadingTexts(page)).toEqual([TITLE_A, TITLE_B]);
    expect(await quoteTextsInSection(page, TITLE_A)).toEqual([
      EXCERPT_A1,
      EXCERPT_A2,
    ]);
  });
});
