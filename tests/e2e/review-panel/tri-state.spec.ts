// tests/e2e/review-panel/tri-state.spec.ts
// Plan 10-04 Task 2 — the REAL tri-state assertions (RECV-01.e), replacing
// the 10-01 Wave-0 sentinel in place (strengthen-only rewrite: the file +
// describe base name carry forward).
//
// Verification-map rows owned by this file (10-VALIDATION.md):
//   - RECV-01.e — tri-state honest (ambiguous/orphan badges, orphan tail)
//
// Corpus (one article + a ghost):
//   - a CONFIDENT highlight on unique text (confidentHighlightOn — derived
//     and verified through the SHIPPED selector machinery at seed time);
//   - an AMBIGUOUS highlight whose quote sentence appears VERBATIM TWICE in
//     the article body (two different paragraphs), with empty prefix/suffix
//     context — empty context is a wildcard, so N>1 exact occurrences can
//     never disambiguate and resolveQuoteSelector returns "ambiguous". The
//     spec re-verifies this through the SHIPPED resolver at module load
//     (seed-time verification, the confidentHighlightOn philosophy).
//   - an ORPHAN highlightRow pointing at articleId "ghost-article" (no such
//     article row — the join fails, the row lands in the never-drop tail).
//
// Asserts the SC#4 "never silently hidden" guarantee end-to-end (T-10-04a):
// confidence=All (the default) shows unresolved rows; Orphan/Ambiguous
// narrow TO them; badges mark them; the ambiguous jump control is disabled
// and the orphan row carries no jump affordance at all.
//
// Harness discipline: identical to listing.spec.ts (the two 10-03 e2e-harness
// fixes — schema-declaring reload after wipeDatabase, seed-then-hash-navigate).
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
import { resolveQuoteSelector } from "../../../src/content/normalizeText";
// The SHIPPED excerpt derivation — the aria-label excerpt is asserted
// through the same pure helper the row renders with (REUSE-DO-NOT-FORK).
import { firstFragmentExcerpt } from "../../../src/annotations/excerpt";

const ARTICLE_ID = "review-tri-state-corpus";
const TITLE = "Tern Lightkeeper Logbook";
const GHOST_ARTICLE_ID = "ghost-article";

// A sentence that appears VERBATIM in paragraphs 2 and 4 (nothing else in
// the corpus repeats it) — the ambiguity trigger.
const AMBIG_SENTENCE = "The tide keeps its own minutes, and the ferry waits for none of them.";

const PARAGRAPHS = [
  "The tern light station logged three arrivals before breakfast: a coal barge riding low, a mail packet flying the company pennant, and a single rowing boat whose occupant refused the harbor line and beached himself with great ceremony on the shingle below the tower.",
  `The keeper watched the rowing boat with particular attention. ${AMBIG_SENTENCE} He wrote the observation in the logbook anyway, because the commissioners liked complete sentences and disliked explanations, and a keeper learns early which of the two signs the orders.`,
  "By noon the fog had climbed the tower stairs and settled into the lamp room, where it condensed on the cold glass and ran down in parallels like slow rain falling upward. The keeper wiped the glass once an hour and let the fog win the half-hours between.",
  `The mail packet left at the turn of the tide without landing its second bag. ${AMBIG_SENTENCE} The keeper noted the refusal, the hour, and the direction of the wind, and made no further remark, which was itself a kind of remark the commissioners had learned to read.`,
];

const ARTICLE = makeArticle({
  id: ARTICLE_ID,
  title: TITLE,
  paragraphs: PARAGRAPHS,
});

// CONFIDENT anchor on unique text (verified at seed time by the helper).
const ANCHOR_CONFIDENT = confidentHighlightOn(ARTICLE, { start: 8 });
const EXCERPT_CONFIDENT = ANCHOR_CONFIDENT.quote.exact;

// AMBIGUOUS anchor: the duplicated sentence with wildcard (empty) context.
const AMBIG_QUOTE = { prefix: "", exact: AMBIG_SENTENCE, suffix: "" };
const AMBIG_POSITION = {
  start: 24,
  end: 24 + AMBIG_SENTENCE.length,
};
// Seed-time verification through the SHIPPED resolver — the corpus is only
// usable if this actually classifies ambiguous (guards prose drift).
if (resolveQuoteSelector(ARTICLE, AMBIG_QUOTE, AMBIG_POSITION) !== "ambiguous") {
  throw new Error("corpus invariant: the duplicated sentence must resolve ambiguous");
}
const EXCERPT_AMBIG = AMBIG_SENTENCE;

// ORPHAN anchor: a valid row shape whose articleId joins nothing (the ghost
// article never exists — the quote itself is what the tail row displays,
// D10-03).
const ANCHOR_ORPHAN = confidentHighlightOn(ARTICLE, { start: 96 });
const EXCERPT_ORPHAN = ANCHOR_ORPHAN.quote.exact;

// The ambiguous anchor assembled from the verified quote + hint (the same
// { position, quote } shape confidentHighlightOn returns).
const ANCHOR_AMBIG = { position: AMBIG_POSITION, quote: AMBIG_QUOTE };

const CORPUS_ROWS: SeedRows = {
  articles: [ARTICLE],
  highlights: [
    highlightRow(ARTICLE_ID, ANCHOR_CONFIDENT, "hl-tri-confident"),
    highlightRow(ARTICLE_ID, ANCHOR_AMBIG, "hl-tri-ambiguous"),
    highlightRow(GHOST_ARTICLE_ID, ANCHOR_ORPHAN, "hl-tri-orphan"),
  ],
};

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

/** The listing.spec.ts seed shape: schema-declaring reload after the wipe,
 * seed, then hash-navigate to #/highlights. */
async function seedAndOpenReview(page: Page): Promise<void> {
  await page.goto(`${BASE}/#/`);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible();
  await expect(page.getByText("Getting started with Lem Reader").first()).toBeVisible();
  await seedRows(page, CORPUS_ROWS);
  await page.goto(`${BASE}/#/highlights`);
  await expect(page.getByRole("heading", { level: 1, name: "Highlights" })).toBeVisible();
}

test.describe("RECV-01.e review-panel tri-state (10-04 honest surfacing)", () => {
  test("honest badges: ambiguous badged, confident badge-less, legend visible", async ({
    page,
  }) => {
    await seedAndOpenReview(page);

    // The ambiguous row renders its badge (exact D10-07 copy; the badge
    // lives on the card's foot line — inside the li.review-item).
    await expect(page.locator(".review-badge-ambiguous")).toHaveText("Uncertain anchor");
    // The confident row renders NO badge at all (scoped to its card).
    const confidentRow = page.locator("section.review-section li.review-item", {
      hasText: EXCERPT_CONFIDENT,
    });
    await expect(confidentRow.first()).toBeVisible();
    await expect(confidentRow.first().locator(".review-badge")).toHaveCount(0);
    // The legend line under the filter row is visible.
    await expect(page.locator(".review-legend")).toHaveText("No badge means anchored confidently.");
  });

  test("orphan tail: 'Highlights without an article' carries the ghost row, no jump affordance", async ({
    page,
  }) => {
    await seedAndOpenReview(page);

    // The trailing section heading is EXACTLY the markdown.ts
    // UNMATCHED_SECTION_HEADING vocabulary (D10-05).
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Highlights without an article",
      }),
    ).toBeVisible();
    const orphanSection = page.locator("section.review-section-orphan");

    // D10-03: the orphan row shows the quote itself, and is badged with the
    // orphan vocabulary (the badge rides the card's foot line — inside the
    // li.review-item).
    const orphanRow = orphanSection.locator("li.review-item", {
      hasText: EXCERPT_ORPHAN,
    });
    await expect(orphanRow).toBeVisible();
    await expect(orphanRow.locator(".review-badge")).toHaveText("Article missing");

    // No JUMP affordance inside the orphan section — the orphan-tail row
    // renders no jump affordance at all (D10-03/D10-05; review-row
    // redesign: the jump lives in the action cluster, so its absence is
    // pinned via .review-jump). The curation affordances (Edit note /
    // Change color / Edit tags / Remove highlight) DO render on orphan
    // rows by design (D10-11).
    await expect(orphanSection.locator(".review-jump")).toHaveCount(0);
    // And the curation affordances are present (D10-11 — orphans are
    // curatable in place even without an article). The actions cluster is
    // a SIBLING of the .review-row body inside the row's <li>. Issues #117 and #119
    // — the cluster carries FOUR icon buttons: Edit note / Change color / Edit
    // tags / Remove highlight (tags are keyed to highlightId, so orphans carry
    // the tags editor too).
    await expect(
      orphanSection
        .locator("li.review-item")
        .filter({
          hasText: EXCERPT_ORPHAN,
        })
        .locator("button.review-row-action"),
    ).toHaveCount(4);
    await expect(
      orphanSection.getByRole("button", {
        name: `Edit tags: ${EXCERPT_ORPHAN}`,
      }),
    ).toBeVisible();
    await expect(
      orphanSection.getByRole("button", {
        name: `Change color, currently Default: ${EXCERPT_ORPHAN}`,
      }),
    ).toBeVisible();
  });

  test("never silently hidden: All shows unresolved rows; Orphan/Ambiguous narrow correctly", async ({
    page,
  }) => {
    await seedAndOpenReview(page);

    const confidence = page.getByLabel("Anchor confidence", { exact: true });
    // The default is "all"…
    await expect(confidence).toHaveValue("all");
    // …and BOTH unresolved rows stay visible under it (SC#4 — never
    // silently filtered away).
    await expect(page.locator(".review-row", { hasText: EXCERPT_AMBIG })).toBeVisible();
    await expect(page.locator(".review-row", { hasText: EXCERPT_ORPHAN })).toBeVisible();

    // Orphan narrows to ONLY the orphan group.
    await confidence.selectOption("orphan");
    await expect(page.locator("section.review-section-orphan")).toBeVisible();
    await expect(page.locator("section.review-section:not(.review-section-orphan)")).toHaveCount(0);
    await expect(page.locator(".review-row", { hasText: EXCERPT_ORPHAN })).toBeVisible();
    await expect(page.locator(".review-row", { hasText: EXCERPT_CONFIDENT })).toHaveCount(0);

    // Ambiguous narrows to ONLY the ambiguous row.
    await confidence.selectOption("ambiguous");
    await expect(page.locator(".review-badge-ambiguous")).toBeVisible();
    await expect(page.locator(".review-row", { hasText: EXCERPT_ORPHAN })).toHaveCount(0);
    await expect(page.locator("section.review-section-orphan")).toHaveCount(0);
  });

  test("ambiguous rows are not jumpable: the jump control renders disabled", async ({ page }) => {
    await seedAndOpenReview(page);

    // ReviewView renders the ambiguous row's jump as a DISABLED placeholder
    // at the action cluster's first position (the LibraryRow disabled-action
    // discipline — geometry stays stable), with the honest "can't be
    // located" copy in its accessible name. Assert the reader cannot
    // activate it.
    const ambiguousJump = page
      .locator("li.review-item", { hasText: EXCERPT_AMBIG })
      .locator("button.review-jump");
    await expect(ambiguousJump).toHaveCount(1);
    await expect(ambiguousJump).toBeDisabled();
    await expect(ambiguousJump).toHaveAttribute(
      "aria-label",
      `Go to highlight: ${firstFragmentExcerpt(EXCERPT_AMBIG, 60)}. This highlight can't be located, so jumping is disabled.`,
    );
  });
});
