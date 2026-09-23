// tests/e2e/review-panel/scope.spec.ts
// Issue #76 (decision #72) — the URL-borne per-article review scope:
// #/highlights?article=<id>. The locked surface set, end-to-end:
//
//   (a) drawer entry — the annotations drawer's "Review highlights" anchor
//       (hidden at 0 highlights) navigates to the scoped URL
//   (b) library-row entry — the row cluster's highlights anchor carries the
//       count in its accessible name; rows at 0 highlights carry none
//   (c) scoped UI — the scope chip replaces the article combobox (one slot,
//       two states); the "article" sort option is absent while scoped; only
//       the scoped article's rows render
//   (d) chip clear — the inside-× navigates to the unscoped review (a real
//       history push, so browser-Back returns to the scoped URL)
//   (e) deep link + reload — a scoped URL survives both (addressable state)
//   (f) scope outlives its article — a scoped id absent from the library
//       renders the calm "(deleted article)" chip; its remaining orphan
//       rows still render, badged "Article missing" (never silently dropped)
//   (g) vanished scope, zero rows — the calm empty state with the
//       back-to-all affordance
//
// Harness discipline mirrors listing.spec.ts (the shared seeding helpers,
// the schema-declaring reload, role/name selectors).
import { test, expect, type Page } from "@playwright/test";
import { BASE, wipeDatabase } from "../annotations/_fixtures";
import {
  confidentHighlightOn,
  highlightRow,
  makeArticle,
  seedRows,
  type SeedRows,
} from "../portability/_portability";

const A_ID = "scope-alpha-corpus";
const B_ID = "scope-zeta-corpus";
const TITLE_A = "Alpha Scope Field Notes";
const TITLE_B = "Zeta Scope Ledger";

const ARTICLE_A = makeArticle({
  id: A_ID,
  title: TITLE_A,
  paragraphs: [
    "The scope field station kept its ledgers in alphabetical order, a habit begun by the first warden and never questioned since. Every morning the surveyors copied the overnight readings into the alpha book, and every evening the warden checked their arithmetic by candlelight, correcting mistakes with a steady hand and an unhurried frown. The station survives him now, and the ledgers survive the station's budget, which is perhaps the surest argument either record could make.",
  ],
});
const ARTICLE_B = makeArticle({
  id: B_ID,
  title: TITLE_B,
  paragraphs: [
    "The harbor ledger began as a single stubborn column in a ship chandler's account book, reserved for debts the chandler expected never to collect. Over four decades the column grew into its own volume, recording every small promise made across the quays of the aging port, and the chandler's heirs still consult it on the rare occasions a descendant of a debtor walks in to settle an ancestor's account.",
  ],
});

const ANCHOR_A1 = confidentHighlightOn(ARTICLE_A, { start: 8 });
const ANCHOR_A2 = confidentHighlightOn(ARTICLE_A, { start: 120 });
const ANCHOR_B1 = confidentHighlightOn(ARTICLE_B, { start: 8 });

const CORPUS_ROWS: SeedRows = {
  articles: [ARTICLE_A, ARTICLE_B],
  highlights: [
    highlightRow(A_ID, ANCHOR_A1, "hl-scope-a1"),
    highlightRow(A_ID, ANCHOR_A2, "hl-scope-a2"),
    highlightRow(B_ID, ANCHOR_B1, "hl-scope-b1"),
  ],
};

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

/** Reload-boot the app (the schema-declaring reload), seed the corpus, and
 * leave the browser on the library. */
async function seedCorpus(page: Page, rows: SeedRows = CORPUS_ROWS): Promise<void> {
  await page.goto(`${BASE}/#/`);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Saved articles" }),
  ).toBeVisible();
  await expect(
    page.getByText("Getting started with Lem Reader").first(),
  ).toBeVisible();
  await seedRows(page, rows);
}

test.describe("issue #76 — the per-article review scope", () => {
  test("(a) the drawer's Review-highlights entry navigates to the scoped review", async ({
    page,
  }) => {
    await seedCorpus(page);

    // The zero gate: a fixture article stores no highlights — the drawer
    // carries no review entry (hidden at 0, one entry point per surface).
    await page.goto(`${BASE}/#/article/essay-long-form`);
    await page
      .getByRole("button", { name: /^Highlights and notes/ })
      .click({ timeout: 10_000 });
    await expect(page.locator("dialog.annotations-drawer")).toBeVisible();
    await expect(
      page
        .locator("dialog.annotations-drawer")
        .getByRole("link", { name: "Review highlights" }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Close highlights and notes" })
      .click();

    await page.goto(`${BASE}/#/article/${A_ID}`);
    await expect(
      page.getByRole("heading", { level: 1, name: TITLE_A }),
    ).toBeVisible({ timeout: 10_000 });

    // Open the annotations drawer (the header trigger) — the entry lives
    // next to "Export highlights" and is visible at ≥ 1 highlight.
    await page.getByRole("button", { name: /^Highlights and notes/ }).click();
    const reviewEntry = page
      .locator("dialog.annotations-drawer")
      .getByRole("link", { name: "Review highlights" });
    await expect(reviewEntry).toBeVisible();

    await reviewEntry.click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Highlights" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(new RegExp(`#\\/highlights\\?article=${A_ID}$`));
  });

  test("(b) the library-row entry carries the count in its accessible name; zero-highlight rows carry none", async ({
    page,
  }) => {
    await seedCorpus(page);
    // LibraryView loads once per mount — reload so the seeded rows join
    // the composite list (the 08-05 openLibrary discipline).
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Saved articles" }),
    ).toBeVisible();

    const rowA = page.locator(".library-row").filter({ hasText: TITLE_A });
    await expect(
      rowA.getByRole("link", { name: `Review 2 highlights for ${TITLE_A}` }),
    ).toBeVisible();

    // A fixture row stores no highlights — the gate IS the zero state.
    const fixtureRow = page
      .locator(".library-row")
      .filter({ hasText: "Getting started with Lem Reader" });
    await expect(
      fixtureRow.getByRole("link", { name: /Review \d+ highlights? for/ }),
    ).toHaveCount(0);

    await rowA
      .getByRole("link", { name: `Review 2 highlights for ${TITLE_A}` })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Highlights" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(new RegExp(`#\\/highlights\\?article=${A_ID}$`));
  });

  test("(c) scoped: the chip replaces the combobox, the article sort hides, rows narrow", async ({
    page,
  }) => {
    await seedCorpus(page);
    await page.goto(`${BASE}/#/highlights?article=${A_ID}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Highlights" }),
    ).toBeVisible();

    // One slot, two states: the combobox is gone; the chip names the scope.
    await expect(page.locator("#review-article-filter")).toHaveCount(0);
    const chip = page.locator(".review-scope-chip");
    await expect(chip).toContainText(TITLE_A);

    // The "article" sort option is absent while scoped (Date + Position stay).
    const sortTexts = await page.locator("#review-sort option").allTextContents();
    expect(sortTexts).toEqual(["Date", "Position"]);

    // Only the scoped article's rows render (2 of A's, none of B's).
    await expect(page.locator(".review-row")).toHaveCount(2);
    await expect(
      page.getByRole("heading", { level: 2, name: TITLE_B, exact: true }),
    ).toHaveCount(0);
  });

  test("(d) chip clear navigates unscoped; browser-Back returns to the scoped URL", async ({
    page,
  }) => {
    await seedCorpus(page);
    await page.goto(`${BASE}/#/highlights?article=${A_ID}`);
    await expect(page.locator(".review-scope-chip")).toBeVisible();

    await page
      .getByRole("button", { name: "Show highlights from all articles" })
      .click();
    await expect(page).toHaveURL(new RegExp(/#\/highlights$/));
    await expect(page.locator("#review-article-filter")).toBeVisible();
    await expect(page.locator(".review-row")).toHaveCount(3);

    // The clear pushed a history entry — Back lands on the scoped URL.
    await page.goBack();
    await expect(page).toHaveURL(
      new RegExp(`#\\/highlights\\?article=${A_ID}$`),
    );
    await expect(page.locator(".review-scope-chip")).toBeVisible();
  });

  test("(e) a scoped URL survives a reload (addressable state)", async ({
    page,
  }) => {
    await seedCorpus(page);
    await page.goto(`${BASE}/#/highlights?article=${B_ID}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Highlights" }),
    ).toBeVisible();
    await expect(page.locator(".review-scope-chip")).toContainText(TITLE_B);

    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Highlights" }),
    ).toBeVisible();
    await expect(page.locator(".review-scope-chip")).toContainText(TITLE_B);
    await expect(page.locator(".review-row")).toHaveCount(1);
  });

  test("(f) a scope that outlives its article: the deleted chip + kept orphan rows", async ({
    page,
  }) => {
    // Highlights whose articleId was never in the library render as honest
    // orphans; the scoped URL still resolves to them (never dropped).
    await seedCorpus(page, {
      articles: [ARTICLE_A],
      highlights: [
        highlightRow(A_ID, ANCHOR_A1, "hl-scope-a1"),
        highlightRow("ghost-article", ANCHOR_B1, "hl-scope-ghost"),
      ],
    });

    await page.goto(`${BASE}/#/highlights?article=ghost-article`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Highlights" }),
    ).toBeVisible();
    await expect(page.locator(".review-scope-chip")).toContainText(
      "(deleted article)",
    );
    // The orphan row survives in the never-drop tail, badged honestly.
    await expect(page.locator(".review-row")).toHaveCount(1);
    await expect(page.getByText("Article missing")).toBeVisible();
  });

  test("(g) a vanished scope with zero rows: the calm empty state + back-to-all", async ({
    page,
  }) => {
    await seedCorpus(page);

    await page.goto(`${BASE}/#/highlights?article=never-was`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Highlights" }),
    ).toBeVisible();
    await expect(page.locator(".review-scope-chip")).toContainText(
      "(deleted article)",
    );
    await expect(page.locator(".review-row")).toHaveCount(0);
    await expect(page.locator(".review-scope-empty")).toContainText(
      "no highlights remain",
    );

    await page.getByRole("link", { name: "Show all highlights" }).click();
    await expect(page).toHaveURL(new RegExp(/#\/highlights$/));
    await expect(page.locator(".review-row")).toHaveCount(3);
  });
});
