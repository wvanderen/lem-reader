// tests/e2e/review-panel/color.spec.ts
// Issue #119 — highlight colors in the Highlights review panel. The review
// surface must show and edit the SAME named color (+ Default state) as the
// reader, including when the text anchor is ambiguous or orphaned. Cells:
//   1. Confident row: shows "Default" first; "Change color" opens the
//      reader's picker (labelled radios + the excerpt context); picking
//      Green re-derives the row WITHOUT a reload, announces "Color
//      saved." politely, the READER mark re-renders .color-green (reader
//      and review share one record — sync), and a full reload proves
//      persistence.
//   2. Ambiguous + orphan rows: recolor freely — the D10-07 badge
//      vocabulary, the disabled jump, and the attached note are untouched
//      by the field-scoped color write; both colors persist across a
//      reload.
//
// Corpus (built ENTIRELY through the _portability.ts seeding helpers —
// REUSE-DO-NOT-FORK, the tri-state.spec.ts shape): one article whose
// duplicated sentence makes the ambiguous anchor N>1-unresolvable, one
// confident anchor on unique text, one ghost-article orphan carrying a
// seeded note.
//
// Harness discipline (the two 10-03 e2e-harness fixes, reused): the
// schema-declaring reload after wipeDatabase + seed-then-hash-navigate.
// page.reload() appears ONLY as the trailing persistence double-check —
// never as the mechanism for seeing an update.
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { BASE, wipeDatabase } from "../annotations/_fixtures";
import {
  confidentHighlightOn,
  highlightRow,
  makeArticle,
  openSettings,
  readBundleJson,
  seedRows,
  type SeedRows,
} from "../portability/_portability";
import { resolveQuoteSelector } from "../../../src/content/normalizeText";

const ARTICLE_ID = "review-color-corpus";
const TITLE = "Signal Lamp Ledger";
const GHOST_ARTICLE_ID = "ghost-article";

const HL_CONFIDENT_ID = "hl-color-confident";
const HL_AMBIG_ID = "hl-color-ambiguous";
const HL_ORPHAN_ID = "hl-color-orphan";

// A sentence that appears VERBATIM in paragraphs 2 and 4 (nothing else in
// the corpus repeats it) — the ambiguity trigger (tri-state.spec.ts knob).
const AMBIG_SENTENCE = "The lamp room logged two flashes where the keeper saw one.";

const PARAGRAPHS = [
  "The signal ledger recorded every lamp on the point: the harbor light, the stubby pier beacon, and the little lantern the ferryman swore by more than the chart.",
  `Fog weeks doubled the work. ${AMBIG_SENTENCE} The duplicate went into the book uncorrected, because the commissioners preferred two honest lines to one tidy one.`,
  "Between fronts the keeper polished the brass, trimmed the wicks, and argued by post with the foundry about glass thickness, in that order, every week the same.",
  `The ferryman read the ledger aloud each landing. ${AMBIG_SENTENCE} His passengers learned the rhythm of it: flash, flash, write, argue, sail.`,
];

const ARTICLE = makeArticle({
  id: ARTICLE_ID,
  title: TITLE,
  paragraphs: PARAGRAPHS,
});

// CONFIDENT anchor on unique text (derived + verified at seed time).
const ANCHOR_CONFIDENT = confidentHighlightOn(ARTICLE, { start: 8 });
const EXCERPT_CONFIDENT = ANCHOR_CONFIDENT.quote.exact;

// AMBIGUOUS anchor: the duplicated sentence with wildcard (empty) context —
// seed-time verification through the SHIPPED resolver (guards prose drift).
const AMBIG_QUOTE = { prefix: "", exact: AMBIG_SENTENCE, suffix: "" };
const AMBIG_POSITION = {
  start: 24,
  end: 24 + AMBIG_SENTENCE.length,
};
if (resolveQuoteSelector(ARTICLE, AMBIG_QUOTE, AMBIG_POSITION) !== "ambiguous") {
  throw new Error("corpus invariant: the duplicated sentence must resolve ambiguous");
}
const ANCHOR_AMBIG = { position: AMBIG_POSITION, quote: AMBIG_QUOTE };

// ORPHAN anchor: valid row shape whose articleId joins nothing (the tail).
const ANCHOR_ORPHAN = confidentHighlightOn(ARTICLE, { start: 96 });
const EXCERPT_ORPHAN = ANCHOR_ORPHAN.quote.exact;

const NOTE_ORPHAN = {
  schemaVersion: 1,
  id: "note-color-orphan",
  highlightId: HL_ORPHAN_ID,
  text: "A note kept alive without its article.",
  updatedAt: "2026-08-22T09:00:00.000Z",
};

const CORPUS_ROWS: SeedRows = {
  articles: [ARTICLE],
  highlights: [
    highlightRow(ARTICLE_ID, ANCHOR_CONFIDENT, HL_CONFIDENT_ID),
    highlightRow(ARTICLE_ID, ANCHOR_AMBIG, HL_AMBIG_ID),
    highlightRow(GHOST_ARTICLE_ID, ANCHOR_ORPHAN, HL_ORPHAN_ID),
  ],
  notes: [NOTE_ORPHAN],
};

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

/** The curate.spec.ts seed shape: schema-declaring reload after the wipe,
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

/** The <li> carrying one highlight's row (body + curation cluster). */
function rowByExcerpt(page: Page, excerpt: string) {
  return page.locator("li.review-item").filter({ hasText: excerpt });
}

test.describe("issue #119 review-panel highlight colors", () => {
  // The 15-04 honest-gate budget (curate.spec.ts discipline).
  test.setTimeout(60_000);

  test("confident row: Default → Green re-derives without reload, announces, the reader mark matches, reload persists", async ({
    page,
  }) => {
    await seedAndOpenReview(page);

    // The row shows the reader's Default state as visible text.
    const row = rowByExcerpt(page, EXCERPT_CONFIDENT);
    await expect(row.locator(".review-row-color")).toHaveText("Default");

    // The labeled way to change it.
    await page.getByRole("button", { name: `Change color: ${EXCERPT_CONFIDENT}` }).click();
    const dialog = page.getByRole("dialog", { name: "Change color" });
    await expect(dialog).toBeVisible();
    // Which highlight is being recolored (the excerpt context).
    await expect(dialog).toContainText(EXCERPT_CONFIDENT);
    // The reader's own picker: Default + the four named choices, labelled.
    for (const label of ["Default", "Yellow", "Green", "Blue", "Pink"]) {
      await expect(dialog.getByRole("radio", { name: label })).toBeAttached();
      await expect(dialog.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(dialog.getByRole("radio", { name: "Default" })).toBeChecked();

    // Pick Green — commit-per-pick; the dialog stays open and the checked
    // state re-matches the persisted row after the write lands.
    await dialog.getByRole("radio", { name: "Green" }).click();
    await expect(dialog.getByRole("radio", { name: "Green" })).toBeChecked();

    // The row re-derives WITHOUT any reload (snapshot invalidation) and the
    // dialog's status region announces the landed write politely.
    await expect(row.locator(".review-row-color")).toHaveText("Green");
    await expect(dialog.getByRole("status")).toContainText("Color saved.");
    // Dismiss the picker before leaving the row (the modal scope otherwise
    // keeps the background inert).
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toBeHidden();

    // Reader/review sync: the same record drives the reader's mark. Jump
    // through the row (the accessible name now carries the named color) —
    // the reader renders .color-green on the mark.
    await page.getByRole("button", { name: `Go to Green highlight: ${EXCERPT_CONFIDENT}` }).click();
    const mark = page.locator("mark.highlight").first();
    await expect(mark).toHaveClass(/color-green/);

    // Persistence proof (the sanctioned reload double-check): review still
    // shows Green from the persisted record.
    await page.goto(`${BASE}/#/highlights`);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Highlights" })).toBeVisible();
    await expect(rowByExcerpt(page, EXCERPT_CONFIDENT).locator(".review-row-color")).toHaveText(
      "Green",
    );

    // Export/import sync: the review edit rides the REAL UI bundle export —
    // the exported highlight row carries the color the panel wrote (the #118
    // roundtrip unit test proves the pipeline itself; this proves a review
    // edit feeds it).
    const panel = await openSettings(page);
    const downloadPromise = page.waitForEvent("download", { timeout: 20_000 });
    await panel.getByRole("button", { name: "Export library bundle" }).click();
    const download = await downloadPromise;
    const { bundle: bundleJson } = readBundleJson((await download.path())!);
    const exported = (bundleJson.highlights as Array<Record<string, unknown>>).find(
      (h) => h.id === HL_CONFIDENT_ID,
    );
    expect(exported?.color).toBe("green");
  });

  test("ambiguous + orphan rows recolor without anchor-status or note changes; reload persists both", async ({
    page,
  }) => {
    await seedAndOpenReview(page);

    const orphanRow = rowByExcerpt(page, EXCERPT_ORPHAN);
    const ambigRow = rowByExcerpt(page, AMBIG_SENTENCE);
    await expect(orphanRow.locator(".review-row-color")).toHaveText("Default");
    await expect(ambigRow.locator(".review-row-color")).toHaveText("Default");

    // ── Orphan row → Pink ──────────────────────────────────────────────
    await page.getByRole("button", { name: `Change color: ${EXCERPT_ORPHAN}` }).click();
    const dialog = page.getByRole("dialog", { name: "Change color" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("radio", { name: "Pink" }).click();
    await expect(dialog.getByRole("radio", { name: "Pink" })).toBeChecked();
    await expect(orphanRow.locator(".review-row-color")).toHaveText("Pink");
    // The landed write is announced politely here too (the same honest
    // announcement contract the confident row's cell pins).
    await expect(dialog.getByRole("status")).toContainText("Color saved.");
    // Anchor status untouched: the badge vocabulary survives byte-stable,
    // as does the attached note (the write is field-scoped to color).
    await expect(orphanRow.locator(".review-badge-orphan")).toHaveText("Article missing");
    await expect(orphanRow.locator(".review-note-preview")).toHaveText(NOTE_ORPHAN.text);
    await page
      .getByRole("dialog", { name: "Change color" })
      .getByRole("button", { name: "Done" })
      .click();
    await expect(page.getByRole("dialog", { name: "Change color" })).toBeHidden();

    // ── Ambiguous row → Yellow ─────────────────────────────────────────
    await page.getByRole("button", { name: `Change color: ${AMBIG_SENTENCE}` }).click();
    const ambigDialog = page.getByRole("dialog", { name: "Change color" });
    await expect(ambigDialog).toBeVisible();
    await ambigDialog.getByRole("radio", { name: "Yellow" }).click();
    await expect(ambigRow.locator(".review-row-color")).toHaveText("Yellow");
    await expect(ambigRow.locator(".review-badge-ambiguous")).toHaveText("Uncertain anchor");
    // The disabled jump keeps its honest name (now color-prefixed) — the
    // anchor status is derived, never stored, so recoloring cannot move it.
    await expect(
      page.getByRole("button", {
        name: `Go to Yellow highlight: ${AMBIG_SENTENCE}. This highlight can't be located, so jumping is disabled.`,
      }),
    ).toBeDisabled();

    // Persistence proof for BOTH unresolved rows.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Highlights" })).toBeVisible();
    await expect(rowByExcerpt(page, EXCERPT_ORPHAN).locator(".review-row-color")).toHaveText(
      "Pink",
    );
    await expect(rowByExcerpt(page, AMBIG_SENTENCE).locator(".review-row-color")).toHaveText(
      "Yellow",
    );
    await expect(rowByExcerpt(page, EXCERPT_ORPHAN).locator(".review-note-preview")).toHaveText(
      NOTE_ORPHAN.text,
    );
    await expect(rowByExcerpt(page, AMBIG_SENTENCE).locator(".review-badge-ambiguous")).toHaveText(
      "Uncertain anchor",
    );
  });
});
