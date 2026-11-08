// tests/e2e/collections/delete-referenced-works.spec.ts
// Issue #245 — deleting a library work that collections reference (ADR 0011:
// deleting the work explicitly confirms affected collections and removes
// their references):
//
//   - DWC-245-01 — the destructive confirm IDENTIFIES the affected
//     collections (the disclosure lists them) with the cancel path on
//     predictable focus (Pitfall 8 — data-initial-focus on Keep), and
//     cancelling changes NOTHING (entries stay, the work stays).
//   - DWC-245-02 — confirming an ARTICLE delete strips its whole-work AND
//     work-chapter (in-article chapter target) references: survivors keep
//     their relative order, a collection emptied by the strip survives as
//     an empty collection, and unaffected collections/entries are untouched.
//   - DWC-245-03 — the same contract for a BOOK: whole-book + EPUB
//     book-chapter references go (by bookId or chapter-article id), the
//     book and its chapters leave the library, an unrelated article entry
//     in the same collection survives in place, and an unaffected
//     collection is byte-untouched (its updatedAt stamp included).
//
// The CONVERSE guarantees (removing membership or deleting a collection
// never deletes the underlying reading — never invokes the owning cascade)
// are pinned by the issue #242/#243 specs (DISC-243-04's "It stays in your
// library." + delete-collection unit proofs) and are not re-proved here.
//
// Harness (REUSE-DO-NOT-FORK): wipeDatabase + seedStoreRows (library) +
// raw collection-row seeds (the stale-destination precedent — the UI can
// only add VALIDATED targets, and these tests own the DELETE side, so the
// membership surface is seeded directly). The Node-side corpus is
// ArticleSchema.parse-built (schema-valid by construction).
import { test, expect, type Page } from "@playwright/test";
import { ArticleSchema, BookSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/schema";
import { deriveWorkStructure } from "../../../src/content/structure";
import { BASE } from "../_base";
import { seedStoreRows } from "../library/seedStoreRows";

// ── Node-side corpus builders (the chapter-assignments discipline) ─────────

const SENTENCE =
  "The keeper counts another steady entry of the harbor's small weather, and the tide ledger holds the line long enough to wrap across several composed lines at the reading geometry.";

function makeParagraphs(
  n: number,
  seed: string,
): { kind: "paragraph"; content: [{ text: string; marks: [] }] }[] {
  return Array.from({ length: n }, (_, i) => ({
    kind: "paragraph" as const,
    content: [{ text: `${seed} Entry ${i + 1}: ${SENTENCE}`, marks: [] as [] }],
  }));
}

function heading(text: string) {
  return { kind: "heading" as const, level: 2 as const, content: [{ text, marks: [] as [] }] };
}

/** The structured web work: two h2 chapters (stable in-article targets). */
const WORK = ArticleSchema.parse({
  id: "tide-work",
  revision: 1,
  lang: "en",
  provenance: {
    title: "The Tide Ledger",
    retrievedAt: "2026-10-01T00:00:00.000Z",
    originalHtmlHash: `sha256:${"b".repeat(64)}`,
  },
  blocks: [
    heading("Opening Arguments"),
    ...makeParagraphs(6, "Chapter one."),
    heading("The Long Middle"),
    ...makeParagraphs(30, "Chapter two."),
  ],
  ingestionMeta: {
    source: "paste",
    origin: "paste",
    originalHtmlHash: `sha256:${"b".repeat(64)}`,
    ingestedAt: "2026-10-01T00:00:00.000Z",
    extractionConfidence: "high",
  },
  addedAt: "2026-10-01T00:00:00.000Z",
});

/** A chapterless essay — the unaffected reading. */
const ESSAY = ArticleSchema.parse({
  id: "tide-essay",
  revision: 1,
  lang: "en",
  provenance: {
    title: "A Chapterless Essay",
    retrievedAt: "2026-10-01T00:00:00.000Z",
    originalHtmlHash: `sha256:${"e".repeat(64)}`,
  },
  blocks: makeParagraphs(3, "Essay."),
  ingestionMeta: {
    source: "paste",
    origin: "paste",
    originalHtmlHash: `sha256:${"e".repeat(64)}`,
    ingestedAt: "2026-10-01T00:00:00.000Z",
    extractionConfidence: "high",
  },
  addedAt: "2026-10-01T00:00:00.000Z",
});

// The work's chapter destinations come from the SAME derivation the app runs.
const WORK_STRUCTURE = deriveWorkStructure(WORK)!;
const WORK_CHAPTERS = WORK_STRUCTURE.destinations.filter((d) => d.kind === "chapter");
const WORK_FIRST_CHAPTER_ID = WORK_CHAPTERS[0]!.id;

// ── The EPUB book (existing chapter articles) ───────────────────────────────

const BOOK_ID = "epub-tidebook0000";
const CHAPTER_IDS = ["tide-epub-c01", "tide-epub-c02"];

function makeBookChapter(id: string, index: number): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      title: `Chapter ${index}`,
      retrievedAt: "2026-10-01T00:00:00.000Z",
      originalHtmlHash: `sha256:${"c".repeat(64)}`,
    },
    blocks: makeParagraphs(2, `Chapter ${index}.`),
    ingestionMeta: {
      source: "epub-chapter",
      origin: "upload",
      bookId: BOOK_ID,
      chapterIndex: index,
      originalHtmlHash: `sha256:${"c".repeat(64)}`,
      ingestedAt: "2026-10-01T00:00:00.000Z",
      extractionConfidence: "high",
    },
    addedAt: "2026-10-01T00:00:00.000Z",
  });
}

/** A persisted chapter row carries the TOP-LEVEL bookId the saveBook stamp
 * writes (the indexed FK that grouping reads + the live-truth union use). */
function makeBookChapterRow(id: string, index: number): CanonicalArticle & { bookId: string } {
  return { ...makeBookChapter(id, index), bookId: BOOK_ID };
}

function makeBook(): import("../../../src/content/schema").Book {
  return BookSchema.parse({
    id: BOOK_ID,
    title: "The Tide Book",
    authors: ["A. Keeper"],
    language: "en",
    chapterArticleIds: CHAPTER_IDS,
    skippedChapterCount: 0,
    source: "epub-upload",
    originalFileHash: `sha256:${"d".repeat(64)}`,
    addedAt: "2026-10-01T00:00:00.000Z",
  });
}

// ── Collection-row seed (raw IndexedDB — the delete side owns this spec) ────

interface SeededEntry {
  id: string;
  target: Record<string, string>;
}

function makeCollectionRow(
  id: string,
  name: string,
  entries: SeededEntry[],
  updatedAt: string,
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id,
    name,
    entries: entries.map((entry) => ({ ...entry, addedAt: "2026-10-01T00:00:00.000Z" })),
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt,
  };
}

async function seedCollectionRows(page: Page, rows: unknown[]): Promise<void> {
  await page.evaluate((seed) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("lem-reader");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("collections", "readwrite");
        for (const row of seed) tx.objectStore("collections").put(row);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      };
    });
  }, rows);
}

type CollectionRowSnapshot = {
  entries: { id: string; target: Record<string, string> }[];
  updatedAt: string;
} | null;

/** Read one collection row back (physical proof — not just rendered state). */
async function readCollectionRow(page: Page, id: string): Promise<CollectionRowSnapshot> {
  return page.evaluate((rowId): Promise<CollectionRowSnapshot> => {
    return new Promise<CollectionRowSnapshot>((resolve) => {
      const req = indexedDB.open("lem-reader");
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("collections", "readonly");
        const getReq = tx.objectStore("collections").get(rowId);
        getReq.onsuccess = () => resolve((getReq.result ?? null) as CollectionRowSnapshot);
        getReq.onerror = () => resolve(null);
      };
    });
  }, id);
}

// ── Shared corpus surface ────────────────────────────────────────────────────

const MORNING_ID = "coll-morning0000";
const EVENING_ID = "coll-evening0000";
const UNTOUCHED_ID = "coll-untouched00";

/** Three collections covering every reference shape against the corpus:
 *   - Morning plans: whole-work WORK entry + the ESSAY (survivor).
 *   - Evening essays: the work's FIRST chapter destination + WORK — both go,
 *     leaving the collection EMPTY (it must survive empty).
 *   - Untouched: only the ESSAY — byte-identical through every deletion. */
async function seedCorpus(page: Page): Promise<void> {
  const chapters = CHAPTER_IDS.map((id, i) => makeBookChapterRow(id, i + 1));
  await seedStoreRows(page, "articles", [WORK, ESSAY, ...chapters]);
  await seedStoreRows(page, "books", [makeBook()]);
  await seedCollectionRows(page, [
    makeCollectionRow(
      MORNING_ID,
      "Morning plans",
      [
        { id: `${MORNING_ID}-e1`, target: { kind: "article", articleId: WORK.id } },
        { id: `${MORNING_ID}-e2`, target: { kind: "article", articleId: ESSAY.id } },
      ],
      "2026-10-02T00:00:00.000Z",
    ),
    makeCollectionRow(
      EVENING_ID,
      "Evening essays",
      [
        {
          id: `${EVENING_ID}-e1`,
          target: {
            kind: "work-chapter",
            articleId: WORK.id,
            destinationId: WORK_FIRST_CHAPTER_ID,
          },
        },
        { id: `${EVENING_ID}-e2`, target: { kind: "article", articleId: WORK.id } },
      ],
      "2026-10-03T00:00:00.000Z",
    ),
    makeCollectionRow(
      UNTOUCHED_ID,
      "Untouched",
      [{ id: `${UNTOUCHED_ID}-e1`, target: { kind: "article", articleId: ESSAY.id } }],
      "2026-10-04T00:00:00.000Z",
    ),
  ]);
}

test.describe("Deleting referenced works (issue #245)", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
      route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg/>" }),
    );
    // Remount AFTER the wipe so the app recreates the Dexie schema (raw
    // seeding into a wiped browser context would build a schema-less
    // database — the a11y.spec seeded-panel precedent).
    await page.goto(`${BASE}/#/`);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible();
    await seedCorpus(page);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible();
  });

  test("the confirm identifies the affected collections; cancelling keeps everything with predictable focus (DWC-245-01)", async ({
    page,
  }) => {
    const workRow = page
      .locator(".library-list > li")
      .filter({ hasText: "The Tide Ledger" })
      .first();
    await expect(workRow).toBeVisible();
    await workRow.getByRole("button", { name: "Remove The Tide Ledger from library" }).click();

    // The disclosure names BOTH affected collections (alphabetical), and the
    // cancel path carries predictable focus (Pitfall 8 — the destructive
    // action is never the initial focus).
    const dialog = page.locator("dialog.library-remove-confirm");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("It appears in these collections:");
    await expect(dialog.getByRole("list")).toContainText("Evening essays");
    await expect(dialog.getByRole("list")).toContainText("Morning plans");
    const cancel = dialog.locator(".library-remove-cancel");
    await expect(cancel).toHaveAttribute("data-initial-focus", "true");
    await expect(cancel).toBeFocused();

    // Cancelling changes NOTHING: the work stays in the library, and both
    // collections keep every entry.
    await cancel.click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.locator(".library-list > li").filter({ hasText: "The Tide Ledger" }),
    ).toHaveCount(1);
    const morning = await readCollectionRow(page, MORNING_ID);
    expect(morning?.entries.map((e) => e.id)).toEqual([`${MORNING_ID}-e1`, `${MORNING_ID}-e2`]);
    const evening = await readCollectionRow(page, EVENING_ID);
    expect(evening?.entries.map((e) => e.id)).toEqual([`${EVENING_ID}-e1`, `${EVENING_ID}-e2`]);
  });

  test("confirming an article delete strips whole-work and chapter references, preserving survivors and emptied collections (DWC-245-02)", async ({
    page,
  }) => {
    const workRow = page
      .locator(".library-list > li")
      .filter({ hasText: "The Tide Ledger" })
      .first();
    await workRow.getByRole("button", { name: "Remove The Tide Ledger from library" }).click();
    const dialog = page.locator("dialog.library-remove-confirm");
    await expect(dialog).toBeVisible();
    await dialog.locator(".library-remove-destructive").click();
    await expect(dialog).not.toBeVisible();

    // The work left the library (row gone from the list).
    await expect(
      page.locator(".library-list > li").filter({ hasText: "The Tide Ledger" }),
    ).toHaveCount(0);

    // Morning plans: the surviving essay keeps its position (order — the
    // work entry did not reshuffle the rest), rendered as the only row.
    await page.goto(`${BASE}/#/collections/${MORNING_ID}`);
    await expect(page.getByRole("heading", { level: 1, name: "Morning plans" })).toBeVisible();
    await expect(page.locator(".collection-entry")).toHaveCount(1);
    await expect(page.locator(`[data-entry-id="${MORNING_ID}-e2"]`)).toBeVisible();

    // Evening essays: emptied by the strip, it SURVIVES as an empty
    // collection with the honest no-content state.
    await page.goto(`${BASE}/#/collections/${EVENING_ID}`);
    await expect(page.getByRole("heading", { level: 1, name: "Evening essays" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "No readings in this collection yet." }),
    ).toBeVisible();

    // Physical proof: references are gone from the rows; the unaffected
    // collection is byte-identical (stamp included — it was never written).
    const morning = await readCollectionRow(page, MORNING_ID);
    expect(morning?.entries.map((e) => e.id)).toEqual([`${MORNING_ID}-e2`]);
    const evening = await readCollectionRow(page, EVENING_ID);
    expect(evening?.entries).toEqual([]);
    const untouched = await readCollectionRow(page, UNTOUCHED_ID);
    expect(untouched?.entries.map((e) => e.id)).toEqual([`${UNTOUCHED_ID}-e1`]);
    expect(untouched?.updatedAt).toBe("2026-10-04T00:00:00.000Z");
    // The collections list still carries all three (nothing was deleted).
    await page.goto(`${BASE}/#/collections`);
    await expect(page.getByRole("link", { name: "Morning plans" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Evening essays" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Untouched" })).toBeVisible();
  });

  test("confirming a book delete strips whole-book and EPUB chapter references, preserving unrelated entries (DWC-245-03)", async ({
    page,
  }) => {
    // A collection holding the book, one of its EPUB chapters, AND an
    // unrelated article — plus the unaffected collection from the shared
    // corpus.
    await seedCollectionRows(page, [
      makeCollectionRow(
        "coll-harbor00000",
        "Harbor plans",
        [
          { id: "coll-harbor00000-e1", target: { kind: "book", bookId: BOOK_ID } },
          {
            id: "coll-harbor00000-e2",
            target: { kind: "book-chapter", bookId: BOOK_ID, articleId: CHAPTER_IDS[0]! },
          },
          {
            id: "coll-harbor00000-e3",
            target: { kind: "book-chapter", bookId: BOOK_ID, articleId: CHAPTER_IDS[1]! },
          },
          { id: "coll-harbor00000-e4", target: { kind: "article", articleId: ESSAY.id } },
        ],
        "2026-10-05T00:00:00.000Z",
      ),
    ]);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible();

    const bookRow = page.locator(".library-list > li").filter({ hasText: "The Tide Book" }).first();
    await expect(bookRow).toBeVisible();
    await bookRow.getByRole("button", { name: "Remove The Tide Book from library" }).click();

    // The disclosure names Harbor plans — the chapter references count.
    const dialog = page.locator("dialog.book-remove-confirm");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("It appears in these collections:");
    await expect(dialog.getByRole("list")).toContainText("Harbor plans");
    // Predictable focus on the cancel path (Pitfall 8).
    await expect(dialog.locator(".book-remove-cancel")).toBeFocused();

    await dialog.locator(".book-remove-destructive").click();
    await expect(dialog).not.toBeVisible();

    // The book and its chapters left the library.
    await expect(
      page.locator(".library-list > li").filter({ hasText: "The Tide Book" }),
    ).toHaveCount(0);

    // Harbor plans keeps exactly the unrelated essay entry, in place; the
    // corpus's Untouched collection stays byte-identical.
    const harbor = await readCollectionRow(page, "coll-harbor00000");
    expect(harbor?.entries.map((e) => e.id)).toEqual(["coll-harbor00000-e4"]);
    const untouched = await readCollectionRow(page, UNTOUCHED_ID);
    expect(untouched?.entries.map((e) => e.id)).toEqual([`${UNTOUCHED_ID}-e1`]);
    expect(untouched?.updatedAt).toBe("2026-10-04T00:00:00.000Z");
  });
});
