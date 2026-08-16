// tests/e2e/review-panel/curate.spec.ts
// Plan 10-05 Task 3 — the REAL curation assertions (RECV-01.f / SC#4),
// replacing the 10-01 Wave-0 sentinel in place (strengthen-only rewrite:
// the file + describe base name carry forward).
//
// Verification-map rows owned by this file (10-VALIDATION.md):
//   - RECV-01.f — curate in place (edit note incl. orphans, empty-text note
//     delete, Esc-close commit, delete w/ confirm + cascade copy + safe
//     focus default, .status announcements, refreshKey re-derivation)
//
// Corpus (built ENTIRELY through the _portability.ts seeding helpers —
// REUSE-DO-NOT-FORK):
//   - one article with a CONFIDENT highlight carrying a seeded NoteRecord
//     (the edit-in-place + empty-text + delete-cascade subject);
//   - one ORPHAN highlight (articleId "ghost-article" — no such article
//     row), note-less (the D10-11 edge: adding a note needs NO article).
//
// The six behaviors (10-05-PLAN must_haves):
//   1. Edit note in place → new preview text WITHOUT reload (refreshKey
//      re-derivation) + persistence proof via one final reload.
//   2. Add a note to the note-less ORPHAN row (D10-11).
//   3. Empty-text commit deletes the NoteRecord (D5-10) — preview gone
//      without reload.
//   4. Escape commits too (Pitfall 7 — every close path routes through the
//      ONE commit; no keystrokes lost).
//   5. Remove confirm: cascade-honest copy, initial focus on the
//      NON-destructive button (Pitfall 8), Cancel keeps the row.
//   6. Proceed: row + note gone without reload, "Highlight removed."
//      announced in the role=status region, Dexie truth via reload.
//
// Harness discipline (the two 10-03 e2e-harness fixes, reused): the
// schema-declaring reload after wipeDatabase (Dexie re-declares v4 before
// seedRows' raw indexedDB.open) + seed-then-hash-navigate. page.reload()
// appears ONLY as the trailing persistence double-check — never as the
// mechanism for seeing an update (the re-derivation assertions all pass
// without it).
//
// Selector discipline: dialogs via getByRole("alertdialog") /
// getByRole("dialog"); buttons by accessible name (the row affordances'
// names carry the excerpt prefix — "Edit note: <excerpt>" /
// "Remove highlight: <excerpt>" — so rows are distinguishable); the
// announcement via the role="status" region.
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

const ARTICLE_ID = "review-curate-corpus";
const TITLE = "Curate Bellringer Register";
const GHOST_ARTICLE_ID = "ghost-article";

const HL_NOTED_ID = "hl-curate-noted";
const HL_ORPHAN_ID = "hl-curate-orphan";

const ORIGINAL_NOTE = "Seeded marginalia comparing the two tower clocks.";
const REVISED_NOTE = "Revised after the foundry's reply arrived.";
const ESC_NOTE = "Committed by Escape, as the close path promises.";
const ORPHAN_NOTE = "A note kept alive without its article.";
const EMPTY = "";

const PARAGRAPHS = [
  "The bellringer's register recorded every peal, every cracked clapper, and every apology the parish council demanded for noise made after the permitted hour. Its keeper maintained that bells, like children, behave better when their misdeeds are written down.",
  "Two tower clocks disagreed by four minutes for most of a century, and the register tracked the disagreement with the seriousness other archives reserve for treaties. The foundry's letters, filed between the peal records, insisted both clocks were right and the valley simply had two noons.",
  "On festival weeks the register grew by a page a day: names of visiting ringers, the pitches they preferred, the ropes they frayed, and once, memorably, a formal complaint from a bat colony that the tenor bell disturbed its roost in the louvre.",
  "The current keeper digitized nothing and trusted the ink. A bell's duty, the register's final page says, is to be heard and then to be quiet, and a record's duty is the same: speak once, clearly, and let the silence afterward hold the meaning.",
];

const ARTICLE = makeArticle({
  id: ARTICLE_ID,
  title: TITLE,
  paragraphs: PARAGRAPHS,
});

// Confident anchors derived + verified through the SHIPPED selector
// machinery at seed time, at deliberately different depths so the two rows
// are always distinguishable by excerpt.
const ANCHOR_NOTED = confidentHighlightOn(ARTICLE, { start: 8 });
const ANCHOR_ORPHAN = confidentHighlightOn(ARTICLE, { start: 190 });
const EXCERPT_NOTED = ANCHOR_NOTED.quote.exact;
const EXCERPT_ORPHAN = ANCHOR_ORPHAN.quote.exact;

// Corpus-construction invariant (fail at import time, before any browser
// work): the two rows must remain distinguishable by their quotes.
if (EXCERPT_NOTED === EXCERPT_ORPHAN) {
  throw new Error("corpus invariant: noted/orphan excerpts must be distinct");
}

const NOTE_NOTED = {
  schemaVersion: 1,
  id: "note-curate-noted",
  highlightId: HL_NOTED_ID,
  text: ORIGINAL_NOTE,
  updatedAt: "2026-08-14T09:00:00.000Z",
};

const CORPUS_ROWS: SeedRows = {
  articles: [ARTICLE],
  highlights: [
    highlightRow(ARTICLE_ID, ANCHOR_NOTED, HL_NOTED_ID),
    highlightRow(GHOST_ARTICLE_ID, ANCHOR_ORPHAN, HL_ORPHAN_ID),
  ],
  notes: [NOTE_NOTED],
};

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

/** The listing.spec.ts seed shape: schema-declaring reload after the wipe,
 * seed the corpus, then hash-navigate to #/review and wait for the h1. */
async function seedAndOpenReview(page: Page): Promise<void> {
  await page.goto(`${BASE}/#/`);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Saved articles" }),
  ).toBeVisible();
  await expect(
    page.getByText("The looting of science fiction").first(),
  ).toBeVisible();
  await seedRows(page, CORPUS_ROWS);
  await page.goto(`${BASE}/#/review`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Review highlights" }),
  ).toBeVisible();
}

/** The <li> carrying one highlight's row (body + curation cluster). */
function rowByExcerpt(page: Page, excerpt: string) {
  return page.locator("li.review-item").filter({ hasText: excerpt });
}

/** The note dialog's textarea (visually-hidden <label for> association). */
function noteTextarea(page: Page) {
  return page
    .getByRole("dialog")
    .getByLabel("Note", { exact: true });
}

test.describe("RECV-01.f review-panel curate (10-05 in-place edit + delete)", () => {
  test("edit note in place: dialog seeds + focuses, Done commits, preview re-derives, reload persists", async ({
    page,
  }) => {
    await seedAndOpenReview(page);

    // The noted row previews the seeded note before the edit.
    await expect(rowByExcerpt(page, EXCERPT_NOTED)).toBeVisible();
    await expect(
      rowByExcerpt(page, EXCERPT_NOTED).locator(".review-note-preview"),
    ).toHaveText(ORIGINAL_NOTE);

    // Open the editor: accessible name carries the excerpt prefix.
    await page
      .getByRole("button", { name: `Edit note: ${EXCERPT_NOTED}` })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // The textarea is SEEDED with the existing text and FOCUSED (D5-10 —
    // focus → textarea on open; explicit focus, the WebKit-safe clone
    // discipline).
    await expect(noteTextarea(page)).toHaveValue(ORIGINAL_NOTE);
    await expect(noteTextarea(page)).toBeFocused();

    // Replace the text and commit via Done.
    await noteTextarea(page).fill(REVISED_NOTE);
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toBeHidden();

    // The row's note preview shows the NEW text WITHOUT any reload — the
    // refreshKey bump re-derived the panel from Dexie (Pitfall 6).
    await expect(
      rowByExcerpt(page, EXCERPT_NOTED).locator(".review-note-preview"),
    ).toHaveText(REVISED_NOTE);

    // Persistence proof (the plan's sanctioned reload double-check — the
    // update itself was already proven above without it).
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Review highlights" }),
    ).toBeVisible();
    await expect(
      rowByExcerpt(page, EXCERPT_NOTED).locator(".review-note-preview"),
    ).toHaveText(REVISED_NOTE);
  });

  test("orphan row gains a note in place (D10-11 — no article needed), reload persists", async ({
    page,
  }) => {
    await seedAndOpenReview(page);

    // The orphan row starts note-less.
    const orphanRow = rowByExcerpt(page, EXCERPT_ORPHAN);
    await expect(orphanRow).toBeVisible();
    await expect(orphanRow.locator(".review-note-preview")).toHaveCount(0);

    // Notes are keyed to highlightId — the ghost-article row edits like any
    // other (the whole reason the panel's editor is a props-driven clone).
    await page
      .getByRole("button", { name: `Edit note: ${EXCERPT_ORPHAN}` })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(noteTextarea(page)).toHaveValue(EMPTY);
    await noteTextarea(page).fill(ORPHAN_NOTE);
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toBeHidden();

    // The orphan row gains the preview WITHOUT reload.
    await expect(
      orphanRow.locator(".review-note-preview"),
    ).toHaveText(ORPHAN_NOTE);

    // Persistence double-check.
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Review highlights" }),
    ).toBeVisible();
    await expect(
      rowByExcerpt(page, EXCERPT_ORPHAN).locator(".review-note-preview"),
    ).toHaveText(ORPHAN_NOTE);
  });

  test("empty-text commit deletes the NoteRecord (D5-10) — preview gone without reload", async ({
    page,
  }) => {
    await seedAndOpenReview(page);

    const notedRow = rowByExcerpt(page, EXCERPT_NOTED);
    await expect(
      notedRow.locator(".review-note-preview"),
    ).toHaveText(ORIGINAL_NOTE);

    // Clear the textarea entirely and commit.
    await page
      .getByRole("button", { name: `Edit note: ${EXCERPT_NOTED}` })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await noteTextarea(page).fill(EMPTY);
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toBeHidden();

    // The empty-text policy lives in the dialog's single commit path: the
    // preview disappears from the row without a reload.
    await expect(notedRow.locator(".review-note-preview")).toHaveCount(0);
    // …while the row itself (the highlight) remains.
    await expect(notedRow).toBeVisible();
  });

  test("Escape commits too (Pitfall 7 — every close path routes through the one commit)", async ({
    page,
  }) => {
    await seedAndOpenReview(page);

    await page
      .getByRole("button", { name: `Edit note: ${EXCERPT_NOTED}` })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await noteTextarea(page).fill(ESC_NOTE);

    // Escape closes the dialog (browser-default) — the close listener must
    // have run the SAME commit, so no keystrokes are lost.
    await noteTextarea(page).press("Escape");
    await expect(dialog).toBeHidden();
    await expect(
      rowByExcerpt(page, EXCERPT_NOTED).locator(".review-note-preview"),
    ).toHaveText(ESC_NOTE);
  });

  test("remove confirm: cascade-honest copy, initial focus on Cancel, Cancel keeps the row", async ({
    page,
  }) => {
    await seedAndOpenReview(page);

    await page
      .getByRole("button", { name: `Remove highlight: ${EXCERPT_NOTED}` })
      .click();
    const alert = page.getByRole("alertdialog");
    await expect(alert).toBeVisible();

    // Cascade-honest copy (D10-12): the note consequence is named.
    await expect(alert).toContainText(
      "The note attached to it will also be removed.",
    );
    // The excerpt context renders inside the dialog (informational copy).
    await expect(alert).toContainText(EXCERPT_NOTED);

    // Pitfall 8 / D10-12: initial focus sits on the NON-destructive button
    // — an accidental Enter cannot delete.
    await expect(
      alert.getByRole("button", { name: "Keep highlight" }),
    ).toBeFocused();

    // Cancel closes only: the row (and its note preview) remain.
    await alert.getByRole("button", { name: "Keep highlight" }).click();
    await expect(alert).toBeHidden();
    const notedRow = rowByExcerpt(page, EXCERPT_NOTED);
    await expect(notedRow).toBeVisible();
    await expect(
      notedRow.locator(".review-note-preview"),
    ).toHaveText(ORIGINAL_NOTE);
    // No announcement fired — nothing was removed.
    await expect(page.locator("main [role='status']")).not.toContainText(
      "Highlight removed.",
    );
  });

  test("remove proceeds: row + note gone without reload, 'Highlight removed.' announced, reload keeps it gone", async ({
    page,
  }) => {
    await seedAndOpenReview(page);

    await page
      .getByRole("button", { name: `Remove highlight: ${EXCERPT_NOTED}` })
      .click();
    const alert = page.getByRole("alertdialog");
    await expect(alert).toBeVisible();

    // The destructive control (exact accessible name — the row affordance
    // carries the excerpt suffix, the dialog button does not).
    await alert
      .getByRole("button", { name: "Remove highlight", exact: true })
      .click();
    await expect(alert).toBeHidden();

    // The row (and its note preview) is gone WITHOUT a reload — the
    // refreshKey bump re-derived from Dexie.
    await expect(rowByExcerpt(page, EXCERPT_NOTED)).toHaveCount(0);
    // The orphan row is untouched by the cascade.
    await expect(rowByExcerpt(page, EXCERPT_ORPHAN)).toBeVisible();

    // D10-12 exact copy, announced through the role=status live region.
    await expect(page.locator("main [role='status']")).toContainText(
      "Highlight removed.",
    );

    // Dexie truth: the row stays gone after a reload.
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Review highlights" }),
    ).toBeVisible();
    await expect(rowByExcerpt(page, EXCERPT_NOTED)).toHaveCount(0);
    await expect(rowByExcerpt(page, EXCERPT_ORPHAN)).toBeVisible();
  });
});
