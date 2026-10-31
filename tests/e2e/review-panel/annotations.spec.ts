// tests/e2e/review-panel/annotations.spec.ts
// Issue #210 — the cross-library Annotations review surfaces BOTH annotation
// kinds with type filters, search, accurate combined counts, direct article-
// note editing, and explicit article navigation. The acceptance criteria's
// observable seams, at the review-panel suite's established harness (the
// listing.spec discipline: schema-declaring reload after wipeDatabase,
// seed-then-hash-navigate; the article-note-tags.spec raw-store reads for
// persistent outcomes):
//
//   1. The rename + type filter: h1 "Annotations", default All (both kinds
//      render), Highlights / Article notes narrow honestly, per-row labels
//      stay accurate (highlight rows keep their curation cluster; article-
//      note rows carry the explicit Open article + Edit article note pair),
//      the combined count line + the article picker's counts are labeled
//      "annotations".
//   2. Search: article-note text, annotation tags on BOTH kinds, and stored
//      quotes match; the query AND-composes with the type filter; a miss is
//      the filtered-miss copy, never the no-content state.
//   3. Sorting consistency: date interleaves the kinds by createdAt (no
//      promotion); the position-voiced sorts trail article notes after the
//      positioned highlights.
//   4. Direct editing: the shared plain-text editor opens INLINE (the URL
//      never leaves #/annotations — no navigation, no reading position),
//      always-visible tags commit with Enter, Escape peels one layer per
//      press (suggestion list → uncommitted text → close), Done returns
//      focus to the opening control, and the edit survives a full reload
//      (raw store read).
//   5. Open article: the explicit action lands on #/article/<id> at the
//      saved canonical reading position (the restoration marker + its
//      polite announcement) — never a fabricated passage destination.
//   6. Deletion from review: the editor's confirm path announces honestly,
//      the row leaves without staleness, and the store read proves the
//      outcome persistent.
//   7. The reader header's count stays highlight-only (the combined count
//      is the review's, not the reader's).
//   8. Narrow screen + the 320px reflow proxy: the editor and its always-
//      visible tag field wrap/stack, everything reachable, no horizontal
//      overflow.
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { BASE, wipeDatabase } from "../annotations/_fixtures";
import {
  articleNoteRow,
  confidentHighlightOn,
  highlightRow,
  makeArticle,
  seedRows,
} from "../portability/_portability";
import { LocationRecordSchema } from "../../../src/content/schema";
import { graphemeLength } from "../../../src/content/normalizeText";

const A_ID = "ann-alpha-corpus";
const B_ID = "ann-beta-corpus";
const TITLE_A = "Alpha Annotation Notes";
const TITLE_B = "Beta Annotation Ledger";

const ARTICLE_A = makeArticle({
  id: A_ID,
  title: TITLE_A,
  paragraphs: [
    "The annotation notebook began as a single alphabetic ledger, and the first warden insisted every margin comment be filed under the passage that provoked it.",
    "By the second winter the margins had their own index, and the researchers who inherited the notebook learned to read the weather of the archive in the density of its marks.",
    "The final section of the notebook collects the reflections that never attached to any passage at all — the overarching summaries the wardens wrote at each season's close.",
  ],
  sourceUrl: "https://example.org/alpha-annotations",
});
const ARTICLE_B = makeArticle({
  id: B_ID,
  title: TITLE_B,
  paragraphs: [
    "The beta ledger tracked which annotations were consulted, a quietly competitive count the two reading rooms kept against each other for a decade.",
  ],
});

// A: two highlights with deliberately distinct createdAt (old + new), a
// passage note on the NEW one, and one article note BETWEEN them in time
// (the interleaving knob for the date sort). B: one highlight only.
const anchorAOld = confidentHighlightOn(ARTICLE_A, { start: 8 });
const anchorANew = confidentHighlightOn(ARTICLE_A, { start: 220 });
const anchorB = confidentHighlightOn(ARTICLE_B, { start: 8 });

const QUOTE_A_OLD_TEXT = anchorAOld.quote.exact;
const QUOTE_A_NEW_TEXT = anchorANew.quote.exact;
/** Short display keys — the row renders the full stored span with spaced
 * ellipsis markers BETWEEN block fragments, so locators key on a leading
 * fragment (always contiguous in the display), never the whole exact. */
const QUOTE_A_OLD_KEY = QUOTE_A_OLD_TEXT.slice(0, 24);
const QUOTE_A_NEW_KEY = QUOTE_A_NEW_TEXT.slice(0, 24);

const CORPUS_ROWS = {
  articles: [
    { ...ARTICLE_A, tags: ["essay"] },
    { ...ARTICLE_B, tags: ["philosophy"] },
  ],
  highlights: [
    // Deliberately distinct createdAt values (the sort-order corpus):
    // OLD highlight (01-10) — ARTICLE NOTE (02-15, between) — NEW highlight
    // (03-01). The note interleaves under date and trails under position.
    { ...highlightRow(A_ID, anchorAOld, "hl-ann-a-old"), createdAt: "2026-01-10T10:00:00.000Z" },
    { ...highlightRow(A_ID, anchorANew, "hl-ann-a-new"), createdAt: "2026-03-01T10:00:00.000Z" },
    { ...highlightRow(B_ID, anchorB, "hl-ann-b"), createdAt: "2026-01-20T10:00:00.000Z" },
  ],
  notes: [
    {
      schemaVersion: 1,
      id: "note-ann-a-new",
      highlightId: "hl-ann-a-new",
      text: "Cross-check the margin index against the season summaries.",
      updatedAt: "2026-03-02T10:00:00.000Z",
    },
  ],
  // The article note sits BETWEEN the two highlights' createdAt values.
  articleNotes: [
    articleNoteRow(A_ID, "an-ann-alpha", {
      text: "An overarching reflection on the notebook's seasonal arc",
      tags: ["theme"],
      createdAt: "2026-02-15T10:00:00.000Z",
    }),
  ],
};

/** The listing.spec harness: wipe → goto+reload (schema re-declared) →
 * seed → hash-navigate. Returns after the review is interactive. */
async function seedAndOpenReview(page: Page, rows: typeof CORPUS_ROWS): Promise<void> {
  await page.goto(`${BASE}/#/`);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible();
  await expect(page.getByText("Getting started with Lem Reader").first()).toBeVisible();
  await seedRows(page, rows);
  await page.goto(`${BASE}/#/annotations`);
  await expect(page.getByRole("heading", { level: 1, name: "Annotations" })).toBeVisible();
}

/** The visible quote/note lines in DOM order — the row-order probe (the
 * listing.spec selector discipline: never a generic li count). */
async function rowTexts(page: Page): Promise<string[]> {
  return await page.locator(".review-section-list .review-quote").allTextContents();
}

// ── 1. The rename + type filter + counts ─────────────────────────────────────

test("default All shows both kinds; counts are labeled annotations; the picker counts follow", async ({
  page,
}) => {
  await wipeDatabase(page);
  await seedAndOpenReview(page, CORPUS_ROWS);

  // The combined count line: 3 highlights + 1 article note.
  await expect(page.locator(".review-count")).toHaveText("4 annotations");

  // Article A's section renders the note row (badge + explicit actions)
  // alongside the highlight rows.
  const sectionA = page.locator("section.review-section", { hasText: TITLE_A });
  await expect(sectionA.locator(".review-badge-note")).toHaveText("Article note");
  const noteRow = sectionA.locator("li", { hasText: "overarching reflection" });
  await expect(noteRow.getByRole("link", { name: /^Open article:/ })).toBeVisible();
  await expect(noteRow.getByRole("button", { name: /^Edit article note:/ })).toBeVisible();

  // The highlight rows keep their genuinely highlight-specific cluster.
  const highlightRowA = sectionA.locator("li", { hasText: QUOTE_A_NEW_KEY });
  // A11Y-05 — the accessible name carries the CURRENT color after the
  // prefix ("Change color, currently Default: …").
  await expect(highlightRowA.getByRole("button", { name: /^Change color,/ })).toBeVisible();
  await expect(highlightRowA.getByRole("button", { name: /^Remove highlight:/ })).toBeVisible();

  // The article picker's browse counts are annotations (combined fold).
  const picker = page.locator("#review-article-filter");
  await picker.click();
  // The option's accessible name joins title + count with a space (the
  // accname contents computation) — match on the noun, the pinned contract.
  await expect(
    page.getByRole("option", { name: new RegExp(`${TITLE_A}\\s*3 annotations`) }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: new RegExp(`${TITLE_B}\\s*1 annotation`) }),
  ).toBeVisible();
  await picker.press("Escape");

  // Highlights filter hides the note rows; Article notes shows only them.
  // (Row counting rides the li level — both row kinds share the .review-row
  // body class; the li carries the kind-specific review-item-note hook.)
  await page.getByLabel("Type", { exact: true }).selectOption("highlights");
  await expect(page.locator(".review-badge-note")).toHaveCount(0);
  await expect(page.locator(".review-section-list > li")).toHaveCount(3);
  await page.getByLabel("Type", { exact: true }).selectOption("article-notes");
  await expect(page.locator(".review-badge-note")).toHaveCount(1);
  await expect(page.locator(".review-section-list > li")).toHaveCount(1);
  await expect(page.locator(".review-section-list > li:not(.review-item-note)")).toHaveCount(0);
  // Back to All — the default that never hides a kind.
  await page.getByLabel("Type", { exact: true }).selectOption("all");
  await expect(page.locator(".review-badge-note")).toHaveCount(1);
});

// ── 2. Search across kinds ───────────────────────────────────────────────────

test("search matches article-note text, annotation tags, and quotes; composes with type", async ({
  page,
}) => {
  await wipeDatabase(page);
  await seedAndOpenReview(page, CORPUS_ROWS);

  const search = page.getByRole("searchbox", { name: "Search annotations" });

  // Article-note TEXT only matches the note row.
  await search.fill("seasonal arc");
  await expect(page.locator(".review-badge-note")).toHaveCount(1);
  const noteMatches = await rowTexts(page);
  expect(noteMatches).toHaveLength(1);
  expect(noteMatches[0]).toContain("overarching reflection on the notebook");

  // An ANNOTATION TAG on the article note matches.
  await search.fill("theme");
  await expect(page.locator(".review-badge-note")).toHaveCount(1);

  // The ARTICLE tag "essay" matches NOTHING: search reads annotation tags
  // and rendered text, never the article's own tags (separate namespaces).
  await search.fill("essay");
  await expect(page.locator("main > [role='status']")).toContainText(
    "No annotations match these filters.",
  );

  // A stored QUOTE matches its highlight row.
  await search.fill(QUOTE_A_OLD_KEY);
  await expect(page.locator(".review-row")).toHaveCount(1);
  const quoteMatches = await rowTexts(page);
  expect(quoteMatches[0]).toContain(QUOTE_A_OLD_TEXT);

  // The query AND-composes with the type filter: the same quote under the
  // Article-notes filter is an honest filtered miss (not the no-content
  // state — the library demonstrably has annotations).
  await page.getByLabel("Type", { exact: true }).selectOption("article-notes");
  await expect(page.locator("main > [role='status']")).toContainText(
    "No annotations match these filters.",
  );
  await expect(page.locator("main > [role='status']")).not.toContainText("No annotations yet");

  // Search is case-insensitive (the library search discipline).
  await page.getByLabel("Type", { exact: true }).selectOption("all");
  await search.fill(QUOTE_A_OLD_KEY.toUpperCase());
  await expect(page.locator(".review-row")).toHaveCount(1);

  // Clearing the query restores the full set.
  await search.fill("");
  await expect(page.locator(".review-badge-note")).toHaveCount(1);
});

// ── 3. Sorting consistency across kinds ──────────────────────────────────────

test("date sort interleaves the kinds; position/article sorts trail notes (no promotion)", async ({
  page,
}) => {
  await wipeDatabase(page);
  await seedAndOpenReview(page, CORPUS_ROWS);

  // Date (default): within section A the NEWEST entry leads — the new
  // highlight (03-01), then the article note (02-15), then the old
  // highlight (01-10). The note sits BETWEEN highlights: no promotion.
  const sectionA = page.locator("section.review-section", { hasText: TITLE_A });
  await expect(sectionA.locator(".review-quote").first()).toContainText(QUOTE_A_NEW_KEY);
  const aTexts = await sectionA.locator(".review-quote").allTextContents();
  expect(aTexts[1]).toContain("overarching reflection");
  expect(aTexts[2]).toContain(QUOTE_A_OLD_KEY);

  // Position sort: highlights lead in position order; the note trails.
  await page.getByLabel("Sort", { exact: true }).selectOption("position");
  const aPositionTexts = await sectionA.locator(".review-quote").allTextContents();
  expect(aPositionTexts[0]).toContain(QUOTE_A_OLD_KEY);
  expect(aPositionTexts[1]).toContain(QUOTE_A_NEW_KEY);
  expect(aPositionTexts[2]).toContain("overarching reflection");

  // Article sort: sections by title (Alpha before Beta) — the entry order
  // follows the same position voice inside each section.
  await page.getByLabel("Sort", { exact: true }).selectOption("article");
  const sectionTitles = await page.locator("section.review-section h2").allTextContents();
  expect(sectionTitles[0]).toContain(TITLE_A);
});

// ── 4. Direct editing from review ────────────────────────────────────────────

test("edit an article note inline from review: tags, layered Escape, focus return, no navigation", async ({
  page,
}) => {
  await wipeDatabase(page);
  await seedAndOpenReview(page, CORPUS_ROWS);

  // The note li carries the stable review-item-note class; while EDITING,
  // the row body hides the note text, so text-based re-location would die
  // mid-session — the class is the stable anchor.
  const noteItem = page.locator("li.review-item-note");
  const editButton = noteItem.getByRole("button", { name: /^Edit article note:/ });
  await editButton.click();

  // Inline: the URL never left the review; the editor is in the row.
  expect(new URL(page.url()).hash).toBe("#/annotations");
  const text = page.getByRole("textbox", { name: "Article note", exact: true });
  await expect(text).toBeFocused();
  const tagInput = page.locator("input#article-note-tags-input");
  await expect(tagInput).toBeVisible(); // always visible — no expansion action

  // A text edit saves automatically (the honest status in the page region).
  await text.fill("A directly edited reflection from the review surface");
  const status = page.locator("main > [role='status']");
  await expect(status).toHaveText("Saved.");

  // Enter commits a tag (suggestions ride the seeded article-tag vocabulary).
  await tagInput.fill("phil");
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
  await tagInput.press("Enter");
  await expect(noteItem.locator(".tag-picker-pill-text", { hasText: "philosophy" })).toHaveText(
    "philosophy",
  );
  await expect(status).toHaveText("Saved.");

  // Layered Escape, one layer per press.
  await tagInput.fill("phil2");
  await expect(listbox).toBeVisible();
  await page.keyboard.press("Escape"); // layer 1: dismiss the list
  await expect(listbox).not.toBeVisible();
  await expect(tagInput).toHaveValue("phil2");
  await page.keyboard.press("Escape"); // layer 2: clear the uncommitted draft
  await expect(tagInput).toHaveValue("");
  await page.keyboard.press("Escape"); // layer 3: close the editor safely
  await expect(text).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe("#/annotations");

  // Focus returns to the opening control.
  await expect(editButton).toBeFocused();

  // The edit is persistent (raw store read + a full reload re-derives it).
  const rows = await readArticleNoteRows(page);
  expect(rows).toHaveLength(1);
  expect(rows[0]?.text).toBe("A directly edited reflection from the review surface");
  // The seeded "theme" tag survives; the commit lands alongside it.
  expect(rows[0]?.tags).toEqual(["theme", "philosophy"]);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Annotations" })).toBeVisible();
  await expect(page.locator("li", { hasText: "directly edited reflection" })).toBeVisible();
});

// ── 5. Open article at the saved reading position ────────────────────────────

test("Open article navigates to the saved canonical reading position", async ({ page }) => {
  await wipeDatabase(page);
  await page.goto(`${BASE}/#/`);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible();
  await seedRows(page, {
    ...CORPUS_ROWS,
    // A MID-article saved location: the canonical restore owns the arrival.
    locations: [
      LocationRecordSchema.parse({
        schemaVersion: 1,
        articleId: A_ID,
        revision: 1,
        graphemeOffset: Math.floor(graphemeLength(ARTICLE_A) * 0.5),
        savedAt: "2026-08-21T10:00:00.000Z",
      }),
    ],
  });
  await page.goto(`${BASE}/#/annotations`);
  await expect(page.getByRole("heading", { level: 1, name: "Annotations" })).toBeVisible();

  await page.getByRole("link", { name: /^Open article:/ }).click();

  // The plain article destination (never a passage jump hash) restores the
  // saved position: the marker + its polite announcement (D18-06).
  expect(new URL(page.url()).hash).toBe(`#/article/${A_ID}`);
  await expect(page.locator(".restoration-marker")).toHaveCount(1, { timeout: 10_000 });
  await expect(
    page.getByRole("status").filter({ hasText: "Returned to where you left off." }),
  ).toHaveCount(1, { timeout: 10_000 });
});

// ── 6. Deletion from review ──────────────────────────────────────────────────

test("deleting an article note from review confirms, announces, and stays deleted", async ({
  page,
}) => {
  await wipeDatabase(page);
  await seedAndOpenReview(page, CORPUS_ROWS);

  const noteItem = page.locator("li.review-item-note");
  await noteItem.getByRole("button", { name: /^Edit article note:/ }).click();
  const text = page.getByRole("textbox", { name: "Article note", exact: true });
  await expect(text).toBeVisible();

  await page.getByRole("button", { name: "Delete article note" }).click();
  await expect(page.getByText("Delete this article note? This cannot be undone.")).toBeVisible();
  await page.getByRole("button", { name: "Confirm delete article note" }).click();

  // The honest announcement + the row leaves (the snapshot re-derives).
  const status = page.locator("main > [role='status']");
  await expect(status).toContainText("Article note deleted.");
  await expect(page.locator(".review-badge-note")).toHaveCount(0);

  // Focus lands on a stable control (a neighbor row's action or the h1) —
  // never lost to <body>.
  const focusTag = await page.evaluate(() => document.activeElement?.tagName ?? "BODY");
  expect(focusTag).not.toBe("BODY");

  // Persistent outcome: the store row is gone; a reload keeps it gone.
  expect(await readArticleNoteRows(page)).toEqual([]);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Annotations" })).toBeVisible();
  await expect(page.locator(".review-badge-note")).toHaveCount(0);
});

// ── 7. The reader header's count stays highlight-only ───────────────────────

test("the reader header's annotation count stays highlight-only while the review count combines", async ({
  page,
}) => {
  await wipeDatabase(page);
  await seedAndOpenReview(page, CORPUS_ROWS);
  await expect(page.locator(".review-count")).toHaveText("4 annotations");

  // Into the reader through the article destination (plain URL — a cold
  // arrival, no drawer interaction).
  await page.goto(`${BASE}/#/article/${A_ID}`);
  const trigger = page.getByRole("button", { name: /^Highlights and notes/ });
  await expect(trigger).toBeVisible({ timeout: 10_000 });
  // 2 highlights on this article — the article NOTES do not join this count.
  await expect(trigger).toHaveAttribute("aria-label", "Highlights and notes, 2");
});

// ── 8. Narrow screen + reflow proxy ────────────────────────────────────────

test("narrow screen: the inline editor and its tag field wrap without overflow", async ({
  page,
}) => {
  await wipeDatabase(page);
  await seedAndOpenReview(page, CORPUS_ROWS);
  await page.setViewportSize({ width: 390, height: 844 });

  await page
    .locator("li", { hasText: "overarching reflection" })
    .getByRole("button", { name: /^Edit article note:/ })
    .click();
  const text = page.getByRole("textbox", { name: "Article note", exact: true });
  await expect(text).toBeVisible();
  await expect(page.locator("input#article-note-tags-input")).toBeVisible();
  await expect(page.getByRole("button", { name: "Done", exact: true })).toBeVisible();

  // The WCAG 1.4.10 reflow proxy: the review CONTENT (and its editor)
  // reflows without horizontal overflow at 390px. The assertion scopes to
  // main#main — the shell header's own ≤420px staging is reader-scoped
  // chrome outside this issue's surface.
  const overflow = await page.evaluate(() => {
    const main = document.querySelector("main#main")!;
    return main.scrollWidth - main.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
});

test("reflow proxy (320px, the high-zoom bar): the editor reflows, controls reachable", async ({
  page,
}) => {
  await wipeDatabase(page);
  await seedAndOpenReview(page, CORPUS_ROWS);
  await page.setViewportSize({ width: 320, height: 640 });

  await page
    .locator("li", { hasText: "overarching reflection" })
    .getByRole("button", { name: /^Edit article note:/ })
    .click();
  await expect(page.getByRole("textbox", { name: "Article note", exact: true })).toBeVisible();
  await expect(page.locator("input#article-note-tags-input")).toBeVisible();
  const done = page.getByRole("button", { name: "Done", exact: true });
  await expect(done).toBeVisible();
  // Same main#main scope as the 390px cell (the shell header stages only in
  // the reader destination; this issue owns the review surface).
  const overflow = await page.evaluate(() => {
    const main = document.querySelector("main#main")!;
    return main.scrollWidth - main.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
});

// ── raw store read (the article-note-tags.spec pattern) ──────────────────────

interface ArticleNoteRow {
  id: string;
  text: string;
  tags?: string[];
}

async function readArticleNoteRows(page: Page): Promise<ArticleNoteRow[]> {
  return await page.evaluate(
    () =>
      new Promise<ArticleNoteRow[]>((resolve, reject) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("articleNotes", "readonly");
          const rows: ArticleNoteRow[] = [];
          const cursor = tx.objectStore("articleNotes").openCursor();
          cursor.onsuccess = () => {
            const c = cursor.result;
            if (c) {
              rows.push(c.value as ArticleNoteRow);
              c.continue();
            } else {
              resolve(rows);
              db.close();
            }
          };
          cursor.onerror = () => reject(cursor.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
}
