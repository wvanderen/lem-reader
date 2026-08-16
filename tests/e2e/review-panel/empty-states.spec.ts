// tests/e2e/review-panel/empty-states.spec.ts
// Plan 10-04 Task 2 — the REAL empty-state assertions (RECV-01.g),
// replacing the 10-01 Wave-0 sentinel in place (strengthen-only rewrite:
// the file + describe base name carry forward).
//
// Verification-map rows owned by this file (10-VALIDATION.md):
//   - RECV-01.g — empty states (no highlights vs filters-zero)
//
// The two D10-10 branches are DISTINCT copies inside the .status live
// region (role="status" — SR announcement parity):
//   1. "No highlights yet. Highlights you make while reading appear here."
//      — the library genuinely has zero highlight rows.
//   2. "No highlights match these filters." — a non-empty library filtered
//      to zero rows (proven against a visible section BEFORE filtering).
//
// Harness discipline: identical to listing.spec.ts (the two 10-03
// e2e-harness fixes — schema-declaring reload after wipeDatabase,
// seed-then-hash-navigate).
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

const A_ID = "review-empty-alpha";
const B_ID = "review-empty-zeta";
const TITLE_A = "Alpha Almshouse Accounts";
const TITLE_B = "Zeta Weir Measurements";

const ARTICLE_A = makeArticle({
  id: A_ID,
  title: TITLE_A,
  paragraphs: [
    "The almshouse accounts were kept alphabetically by tenant, which the trustees considered orderly and the tenants considered public. Each week the warden read the entries aloud at the gate so that anyone could object to a charge, and the objections were entered alphabetically too, beneath the charge they disputed.",
    "The ledger's margins filled over the years with small annotations in three distinct hands: the warden's upright copperplate, a trustee's impatient scrawl, and one unattributed pencil that drew tiny weather symbols beside the entries and was never once mentioned in the minutes.",
  ],
});
const ARTICLE_B = makeArticle({
  id: B_ID,
  title: TITLE_B,
  paragraphs: [
    "The weir gauge read lowest on Thursdays, a pattern the hydrologist attributed to upstream abstraction and the farmer attributed to the moon. Their correspondence on the matter ran to forty letters and settled nothing except a lasting mutual respect and a shared suspicion of averages.",
    "Every measurement was written twice, once in the field book and once on the slate by the lock gate, and the two records disagreed on exactly three occasions in eleven years, none of which either party could explain afterward to anyone's satisfaction.",
  ],
});

const ANCHOR_A1 = confidentHighlightOn(ARTICLE_A, { start: 8 });
const ANCHOR_B1 = confidentHighlightOn(ARTICLE_B, { start: 8 });

const CORPUS_ROWS: SeedRows = {
  articles: [ARTICLE_A, ARTICLE_B],
  highlights: [
    highlightRow(A_ID, ANCHOR_A1, "hl-empty-a1"),
    highlightRow(B_ID, ANCHOR_B1, "hl-empty-b1"),
  ],
};

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

/** The listing.spec.ts seed shape: schema-declaring reload after the wipe,
 * seed (articles only, or the full corpus), then hash-navigate #/review. */
async function seedAndOpenReview(
  page: Page,
  rows: SeedRows,
): Promise<void> {
  await page.goto(`${BASE}/#/`);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Saved articles" }),
  ).toBeVisible();
  await expect(
    page.getByText("The looting of science fiction").first(),
  ).toBeVisible();
  await seedRows(page, rows);
  await page.goto(`${BASE}/#/review`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Review highlights" }),
  ).toBeVisible();
}

test.describe("RECV-01.g review-panel empty states (10-04 both branches)", () => {
  test("no highlights at all: the no-highlights-yet copy in the live region", async ({
    page,
  }) => {
    // Articles seeded, ZERO highlight rows — the library exists but no
    // reader has highlighted anything yet.
    await seedAndOpenReview(page, { articles: [ARTICLE_A, ARTICLE_B] });

    await expect(page.locator(".review-row")).toHaveCount(0);
    await expect(page.locator("main [role='status']")).toHaveText(
      "No highlights yet. Highlights you make while reading appear here.",
    );
  });

  test("filters matching nothing: the no-match copy against a non-empty library", async ({
    page,
  }) => {
    await seedAndOpenReview(page, CORPUS_ROWS);

    // The library is demonstrably NON-empty before filtering: a corpus
    // section heading is visible.
    await expect(
      page.getByRole("heading", { level: 2, name: TITLE_A, exact: true }),
    ).toBeVisible();

    // Article B has no orphan rows, so article=B ∧ confidence=Orphan
    // matches nothing.
    await page
      .getByLabel("Article", { exact: true })
      .selectOption({ label: TITLE_B });
    await page
      .getByLabel("Anchor confidence", { exact: true })
      .selectOption("orphan");

    await expect(page.locator(".review-row")).toHaveCount(0);
    await expect(page.locator("main [role='status']")).toContainText(
      "No highlights match these filters.",
    );
    // The copy is DISTINCT from the no-highlights branch.
    await expect(page.locator("main [role='status']")).not.toContainText(
      "No highlights yet",
    );
  });

  test("live-region parity: the empty copy renders inside role=status as state changes", async ({
    page,
  }) => {
    await seedAndOpenReview(page, CORPUS_ROWS);

    // The carrier is the polite, atomic live region — the SAME .status
    // region that carried the no-highlights-yet copy in the first test,
    // proving both D10-10 copies announce from one role=status element.
    const status = page.locator("main [role='status']");
    await expect(status).toHaveCount(1);
    await expect(status).toHaveAttribute("aria-live", "polite");
    await expect(status).toHaveAttribute("aria-atomic", "true");

    // Before filtering the copy is absent; the transition INTO the no-match
    // copy happens inside the live region itself (this corpus has no
    // orphan rows, so confidence=Orphan alone matches nothing).
    await expect(status).not.toContainText("No highlights match");
    await page
      .getByLabel("Anchor confidence", { exact: true })
      .selectOption("orphan");
    await expect(status).toContainText("No highlights match these filters.");
  });
});
