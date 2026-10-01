// tests/e2e/review-panel/highlight-tags.spec.ts
// Issue #117 — annotation tags in Highlights review. The panel exposes TWO
// clearly named single-select tag dimensions (Article tag / Highlight tag)
// that AND-compose with the article scope, anchor confidence, and sort, and
// every row — ambiguous/orphaned included — edits its tags in place through
// the ReviewTagsDialog without implying the anchor was repaired:
//
//   1. Both named chip rows render (visible legends) over a corpus carrying
//      article tags AND highlight tags.
//   2. Article tag "essay" returns the pre-#117 matches — the tagged
//      article's rows only; orphans and untagged-article rows stay out,
//      even when a HIGHLIGHT carries a tag of the same name.
//   3. Highlight tag matches the highlight's OWN tags — every tri-state,
//      and an orphan can still match its own annotation tag.
//   4. The two tag dimensions + confidence AND-compose.
//   5. Edit tags in place on the ORPHAN row (no article needed): picker
//      focus, write-through, honest "Tags saved." announcement, the new
//      tag surfaces as a Highlight-tag chip (snapshot invalidation), and
//      the write survives a reload.
//   6. Edit tags on the AMBIGUOUS row: same affordance, no gate, and no
//      copy implies the anchor was repaired (the row keeps its badge).
//   7. Narrow layout: both filter rows wrap without horizontal overflow,
//      chips stay operable, and the dialog opens at 375px.
//
// Corpus (built ENTIRELY through the _portability.ts seeding helpers —
// REUSE-DO-NOT-FORK):
//   - Article A "Tern Lightkeeper Logbook" (id review-tags-a, ARTICLE tag
//     "essay"), paragraphs carrying a duplicated AMBIG_SENTENCE:
//       * hl confident (highlight tag "margin")
//       * hl ambiguous (highlight tag "margin") — the unresolved-edit knob
//   - Article B "Zeta Harbor Ledger" (id review-tags-b, NO article tags):
//       * hl confident (highlight tag "essay" — same NAME as A's article
//         tag: the dimension-independence knob)
//   - ORPHAN highlight (articleId "ghost-article", highlight tag "margin")
//     — the own-annotation-tag knob.
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

const A_ID = "review-tags-a";
const B_ID = "review-tags-b";
const TITLE_A = "Tern Lightkeeper Logbook";
const TITLE_B = "Zeta Harbor Ledger";
const GHOST_ARTICLE_ID = "ghost-article";

const ARTICLE_TAG = "essay"; // on article A's row
const HL_TAG = "margin"; // on highlights (confident/ambiguous/orphan)

// ≤ 60 chars so the row aria-labels (`Edit tags: <excerpt>` cap at 60)
// carry the full sentence — duplicated verbatim in paragraphs 1 and 3.
const AMBIG_SENTENCE = "The tide keeps its own minutes.";

const PARAGRAPHS_A = [
  `The tern light station logged three arrivals before breakfast: a coal barge riding low, a mail packet flying the company pennant, and a single rowing boat whose occupant refused the harbor line. ${AMBIG_SENTENCE} The keeper wrote the observation down anyway, because the commissioners liked complete sentences.`,
  "By noon the fog had climbed the tower stairs and settled into the lamp room, where it condensed on the cold glass and ran down in parallels like slow rain falling upward. The keeper wiped the glass once an hour and let the fog win the half-hours between.",
  `The mail packet left at the turn of the tide without landing its second bag. ${AMBIG_SENTENCE} The keeper noted the refusal, the hour, and the direction of the wind, and made no further remark, which was itself a kind of remark the commissioners had learned to read.`,
  "In the evening the logbook closed with the day's totals: one refusal, one fog, one repeated sentence, and no incidents the commissioners would need to pretend had not happened.",
];

const ARTICLE_A_BASE = makeArticle({
  id: A_ID,
  title: TITLE_A,
  paragraphs: PARAGRAPHS_A,
});
const ARTICLE_B = makeArticle({
  id: B_ID,
  title: TITLE_B,
  paragraphs: [
    "The harbor ledger began as a single stubborn column in a ship chandler's account book, the zeta column, reserved for debts the chandler expected never to collect. Over four decades the column grew into its own volume, then into a shelf of volumes, recording every small promise made across the quays of the aging port.",
    "Collectors who came after the chandler found that the zeta ledger read less like accounts and more like a social history of the waterfront. Each entry carried a name, a boat, a sum, and a sentence of context, and the sentences together traced forty years of storms, weddings, bankruptcies, and reconciliations better than any official chronicle bothered to.",
  ],
});
// The one ARTICLE tag in the corpus rides A's row (spread — the helper
// builds the schema shape; tags are a valid additive field).
const ARTICLE_A = { ...ARTICLE_A_BASE, tags: [ARTICLE_TAG] };

const ANCHOR_CONFIDENT = confidentHighlightOn(ARTICLE_A_BASE, { start: 8 });
const EXCERPT_CONFIDENT = ANCHOR_CONFIDENT.quote.exact;

// The ambiguous anchor: the duplicated sentence, wildcard (empty) context —
// seed-time verification through the SHIPPED resolver (guards prose drift).
const AMBIG_QUOTE = { prefix: "", exact: AMBIG_SENTENCE, suffix: "" };
const AMBIG_POSITION = { start: 24, end: 24 + AMBIG_SENTENCE.length };
if (resolveQuoteSelector(ARTICLE_A_BASE, AMBIG_QUOTE, AMBIG_POSITION) !== "ambiguous") {
  throw new Error("corpus invariant: the duplicated sentence must resolve ambiguous");
}
const ANCHOR_AMBIG = { position: AMBIG_POSITION, quote: AMBIG_QUOTE };

const ANCHOR_B = confidentHighlightOn(ARTICLE_B, { start: 8 });
const EXCERPT_B = ANCHOR_B.quote.exact;

// The orphan: a valid row whose articleId joins nothing. Its quote is
// chosen from A's unique text (any valid shape works — nothing resolves).
const ANCHOR_ORPHAN = confidentHighlightOn(ARTICLE_A_BASE, { start: 96 });
const EXCERPT_ORPHAN = ANCHOR_ORPHAN.quote.exact;

const CORPUS_ROWS: SeedRows = {
  articles: [ARTICLE_A, ARTICLE_B],
  highlights: [
    { ...highlightRow(A_ID, ANCHOR_CONFIDENT, "hl-tags-confident"), tags: [HL_TAG] },
    { ...highlightRow(A_ID, ANCHOR_AMBIG, "hl-tags-ambiguous"), tags: [HL_TAG] },
    { ...highlightRow(B_ID, ANCHOR_B, "hl-tags-b"), tags: [ARTICLE_TAG] },
    { ...highlightRow(GHOST_ARTICLE_ID, ANCHOR_ORPHAN, "hl-tags-orphan"), tags: [HL_TAG] },
  ],
};

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

/** The listing.spec.ts seed shape: schema-declaring reload after the wipe,
 * seed the corpus, then hash-navigate to #/highlights and wait for the h1. */
async function seedAndOpenReview(page: Page): Promise<void> {
  await page.goto(`${BASE}/#/`);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible();
  await expect(page.getByText("Getting started with Lem Reader").first()).toBeVisible();
  await seedRows(page, CORPUS_ROWS);
  await page.goto(`${BASE}/#/highlights`);
  await expect(page.getByRole("heading", { level: 1, name: "Highlights" })).toBeVisible();
}

/** The orphan tail section ("Highlights without an article"). */
function orphanSection(page: Page) {
  return page.locator("section.review-section-orphan");
}

test.describe("annotation tags in Highlights review (issue #117)", () => {
  // 15-04 honest-gate run precedent: under full-suite parallel load a
  // webkit context's first module fetch can exceed the default budget.
  test.setTimeout(60_000);

  test("both named tag filters render: Article tag and Highlight tag legends + chips", async ({
    page,
  }) => {
    await seedAndOpenReview(page);

    // Visible legends name the two dimensions (clearly named, single-select).
    await expect(page.locator(".tag-filter-legend", { hasText: "Article tag" })).toBeVisible();
    await expect(page.locator(".tag-filter-legend", { hasText: "Highlight tag" })).toBeVisible();

    // Chips: article vocabulary = {essay}; highlight vocabulary = {essay, margin}.
    await expect(
      page.getByRole("button", { name: `Filter by article tag: ${ARTICLE_TAG}` }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Filter by highlight tag: ${HL_TAG}` }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Filter by highlight tag: ${ARTICLE_TAG}` }),
    ).toBeVisible();
    // "margin" is NOT an article-tag chip (no article carries it).
    await expect(
      page.getByRole("button", { name: `Filter by article tag: ${HL_TAG}` }),
    ).toHaveCount(0);
  });

  test("article tag filter keeps the pre-#117 matches — tagged article's rows; orphan and same-named highlight tag stay out", async ({
    page,
  }) => {
    await seedAndOpenReview(page);

    await page.getByRole("button", { name: `Filter by article tag: ${ARTICLE_TAG}` }).click();

    // Article A's two rows (confident + ambiguous)…
    const sectionA = page.locator("section.review-section", {
      has: page.getByRole("heading", { level: 2, name: TITLE_A, exact: true }),
    });
    await expect(sectionA.locator(".review-row")).toHaveCount(2);
    // …B (untagged article — even though its HIGHLIGHT carries "essay") is
    // gone entirely…
    await expect(page.getByRole("heading", { level: 2, name: TITLE_B, exact: true })).toHaveCount(
      0,
    );
    // …and the orphan tail is gone (no article to carry the tag).
    await expect(orphanSection(page)).toHaveCount(0);

    // Clicking the active chip clears the filter (single-select toggle).
    await page
      .getByRole("button", {
        name: `Active article tag filter: ${ARTICLE_TAG}. Activate to clear.`,
      })
      .click();
    await expect(page.locator(".review-row")).toHaveCount(4);
  });

  test("highlight tag filter matches the highlight's OWN tags — every tri-state, orphan included", async ({
    page,
  }) => {
    await seedAndOpenReview(page);

    await page.getByRole("button", { name: `Filter by highlight tag: ${HL_TAG}` }).click();

    // A's confident + ambiguous rows (their highlights carry "margin")…
    const sectionA = page.locator("section.review-section", {
      has: page.getByRole("heading", { level: 2, name: TITLE_A, exact: true }),
    });
    await expect(sectionA.locator(".review-row")).toHaveCount(2);
    // …the orphan row SURVIVES in the tail — its own annotation tag matches
    // (it never needs its article)…
    await expect(orphanSection(page).locator(".review-row")).toHaveCount(1);
    // …and B's row (highlight tag "essay", not "margin") is gone.
    await expect(page.getByRole("heading", { level: 2, name: TITLE_B, exact: true })).toHaveCount(
      0,
    );

    // The dimension is independent: highlight tag "essay" matches ONLY B's
    // highlight — A's rows (whose ARTICLE is tagged "essay") stay out.
    await page
      .getByRole("button", { name: `Active highlight tag filter: ${HL_TAG}. Activate to clear.` })
      .click();
    await page.getByRole("button", { name: `Filter by highlight tag: ${ARTICLE_TAG}` }).click();
    await expect(page.locator(".review-row")).toHaveCount(1);
    await expect(page.locator(".review-row").first()).toContainText(EXCERPT_B);
  });

  test("highlight tag composes with anchor confidence (AND)", async ({ page }) => {
    await seedAndOpenReview(page);

    await page.getByRole("button", { name: `Filter by highlight tag: ${HL_TAG}` }).click();
    const confidence = page.getByLabel("Anchor confidence", { exact: true });

    // "margin" ∧ Ambiguous → only the ambiguous row, still badged.
    await confidence.selectOption({ label: "Ambiguous" });
    await expect(page.locator(".review-row")).toHaveCount(1);
    await expect(page.locator("li.review-item").first()).toContainText("Uncertain anchor");

    // "margin" ∧ Orphan → only the orphan tail row ("Article missing").
    await confidence.selectOption({ label: "Orphan" });
    await expect(page.locator(".review-row")).toHaveCount(1);
    await expect(page.locator("li.review-item").first()).toContainText("Article missing");
  });

  test("edit tags on the ORPHAN row: write-through, honest announcement, chip surfaces, reload persists", async ({
    page,
  }) => {
    await seedAndOpenReview(page);

    // The ghost-article row edits its tags exactly like any other row.
    await page.getByRole("button", { name: `Edit tags: ${EXCERPT_ORPHAN}` }).click();
    const dialog = page.getByRole("dialog", { name: "Edit tags" });
    await expect(dialog).toBeVisible();

    // The picker input is FOCUSED on open (the explicitly-opened-host
    // exception — the RowTagsPopover focusOnMount precedent).
    const input = dialog.locator("#review-tags-input");
    await expect(input).toBeFocused();

    // The seeded tag rides along as a pill; a keyboard pick adds a new one.
    await expect(dialog.getByText(HL_TAG).first()).toBeVisible();
    await input.fill("revisit");
    await input.press("Enter");
    await expect(dialog.locator(".tag-picker-pill-text", { hasText: "revisit" })).toBeVisible();

    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toBeHidden();

    // Honest announcement: "Tags saved." — only after a write that landed.
    await expect(page.locator("main > [role='status']")).toContainText("Tags saved.");

    // The snapshot invalidation re-derived: "revisit" is now a Highlight
    // tag chip, and it matches the orphan's own row.
    await page.getByRole("button", { name: "Filter by highlight tag: revisit" }).click();
    await expect(page.locator(".review-row")).toHaveCount(1);
    await expect(page.locator("li.review-item").first()).toContainText("Article missing");

    // Persistence: the tag survives a full reload (Dexie truth).
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Highlights" })).toBeVisible();
    await page.getByRole("button", { name: "Filter by highlight tag: revisit" }).click();
    await expect(page.locator(".review-row")).toHaveCount(1);
  });

  test("edit tags on the AMBIGUOUS row: no gate, badge kept — nothing implies the anchor was repaired", async ({
    page,
  }) => {
    await seedAndOpenReview(page);

    await page.getByRole("button", { name: `Edit tags: ${AMBIG_SENTENCE}` }).click();
    const dialog = page.getByRole("dialog", { name: "Edit tags" });
    await expect(dialog).toBeVisible();
    // No gate: the picker is enabled for an unresolved anchor (tagging
    // never depends on re-anchoring — the #116 reader rule, review twin).
    const input = dialog.locator("#review-tags-input");
    await expect(input).toBeEnabled();
    await expect(input).toBeFocused();

    await input.fill("revisit");
    await input.press("Enter");
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator("main > [role='status']")).toContainText("Tags saved.");

    // The row is STILL ambiguous — badge intact (on the card's foot line),
    // jump placeholder still disabled. The tag edit changed nothing about
    // the anchor.
    const ambiguousRow = page.locator("li.review-item", {
      hasText: AMBIG_SENTENCE,
    });
    await expect(ambiguousRow).toContainText("Uncertain anchor");
    await expect(
      page.locator("li.review-item", { hasText: AMBIG_SENTENCE }).locator("button.review-jump"),
    ).toBeDisabled();

    // Composition after the edit: highlight tag "revisit" ∧ Ambiguous →
    // exactly this row.
    await page.getByRole("button", { name: "Filter by highlight tag: revisit" }).click();
    await page.getByLabel("Anchor confidence", { exact: true }).selectOption({
      label: "Ambiguous",
    });
    await expect(page.locator(".review-row")).toHaveCount(1);
    await expect(page.locator(".review-row").first()).toContainText(AMBIG_SENTENCE);
  });

  test("highlight tag composes with the article scope AND the sort control", async ({ page }) => {
    await seedAndOpenReview(page);

    // The article slot composes first: picking IS scoping (#107) — the
    // URL scope ANDs with the highlight-tag dimension.
    const input = page.locator("#review-article-filter");
    await input.click();
    await input.fill(TITLE_A);
    await input.press("Enter");
    await expect(page).toHaveURL(new RegExp(`#\\/highlights\\?article=${A_ID}`));

    await page.getByRole("button", { name: `Filter by highlight tag: ${HL_TAG}` }).click();
    // A's section still carries BOTH tagged rows (the scope did not
    // narrow them away); B and the orphan tail are out (scope + tag).
    await expect(page.locator(".review-row")).toHaveCount(2);

    // The sort composes too: Position orders A's rows ascending by
    // position — the confident row (start 8) precedes the ambiguous row
    // (start 24), the mirrored opposite of the Date default.
    await page.getByLabel("Sort", { exact: true }).selectOption("position");
    await expect(page.locator(".review-row .review-quote").first()).toContainText(
      EXCERPT_CONFIDENT,
    );
    await expect(page.locator(".review-row .review-quote").nth(1)).toContainText(AMBIG_SENTENCE);
  });

  test("keyboard: chip + Edit tags + picker via keys; real-browser Escape commits and closes", async ({
    page,
  }) => {
    await seedAndOpenReview(page);

    // Keyboard-operable chips (single-select radio-equivalent via Enter).
    const chip = page.getByRole("button", {
      name: `Filter by highlight tag: ${HL_TAG}`,
    });
    await chip.focus();
    await expect(chip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator(".review-row")).toHaveCount(3);
    await expect(
      page.getByRole("button", {
        name: `Active highlight tag filter: ${HL_TAG}. Activate to clear.`,
      }),
    ).toBeFocused();

    // Keyboard path into the editor: Enter on the focused Edit tags action.
    await page.getByRole("button", { name: `Edit tags: ${EXCERPT_ORPHAN}` }).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Edit tags" });
    await expect(dialog).toBeVisible();

    // The shared picker keyboard path (type + Enter commits).
    const input = dialog.locator("#review-tags-input");
    await expect(input).toBeFocused();
    await input.fill("keyboard-tag");
    await input.press("Enter");
    await expect(
      dialog.locator(".tag-picker-pill-text", { hasText: "keyboard-tag" }),
    ).toBeVisible();

    // A REAL browser Escape closes the modal — and the write-through
    // discipline means the committed tag survives the close (no Done
    // needed; every close path is safe).
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.locator("main > [role='status']")).toContainText("Tags saved.");

    // The Escape-committed tag is filterable immediately (the close-path
    // invalidation re-derived the chip vocabulary).
    await page.getByRole("button", { name: "Filter by highlight tag: keyboard-tag" }).click();
    await expect(page.locator(".review-row")).toHaveCount(1);
    await expect(page.locator("li.review-item").first()).toContainText("Article missing");
  });

  test("narrow layout: both tag filters wrap without overflow; chips + dialog stay operable at 375px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await seedAndOpenReview(page);

    // No horizontal document overflow: every filter group wraps.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // The wrapped action cluster stays at the footer's inline end.
    const geometry = await page.locator(".review-item").first().evaluate(card => {
      const foot = card.querySelector<HTMLElement>(".review-row-foot")!;
      const actions = card.querySelector<HTMLElement>(".review-row-actions")!;
      const meta = card.querySelector<HTMLElement>(".review-row-meta")!;
      return {
        actionsRight: actions.getBoundingClientRect().right,
        contentRight: foot.getBoundingClientRect().right - parseFloat(getComputedStyle(foot).paddingRight),
        actionsTop: actions.getBoundingClientRect().top,
        metaBottom: meta.getBoundingClientRect().bottom,
      };
    });
    expect(geometry.actionsTop).toBeGreaterThanOrEqual(geometry.metaBottom);
    expect(Math.abs(geometry.actionsRight - geometry.contentRight)).toBeLessThanOrEqual(1);

    // Both named legends + their chips remain visible and operable.
    await expect(page.locator(".tag-filter-legend", { hasText: "Article tag" })).toBeVisible();
    await expect(page.locator(".tag-filter-legend", { hasText: "Highlight tag" })).toBeVisible();
    await page.getByRole("button", { name: `Filter by highlight tag: ${HL_TAG}` }).click();
    await expect(page.locator(".review-row")).toHaveCount(3);

    // The dialog opens + commits at this width too.
    await page.getByRole("button", { name: `Edit tags: ${EXCERPT_CONFIDENT}` }).click();
    const dialog = page.getByRole("dialog", { name: "Edit tags" });
    await expect(dialog).toBeVisible();
    const input = dialog.locator("#review-tags-input");
    await expect(input).toBeFocused();
    await input.fill("narrow-check");
    await input.press("Enter");
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(page.locator("main > [role='status']")).toContainText("Tags saved.");
  });
});
