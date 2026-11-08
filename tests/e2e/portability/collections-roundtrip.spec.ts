// tests/e2e/portability/collections-roundtrip.spec.ts
// Issue #248 — the browser round-trip gate: collections, their ordered
// entries (whole article / whole book / EPUB book chapter / saved web work
// chapter), shared completion, saved positions, and annotations survive the
// REAL export → import flow between two isolated browser contexts (the
// round-trip.spec.ts two-machine harness).
//
//   machine A: seed the library (raw IndexedDB puts; Node-side builders go
//              through the SHIPPED schemas) → Settings → Export → download
//   Node side: unzip bundle.json — schemaVersion 10, the three always-present
//              collection blocks, entry order + identities byte-intact
//   machine B: import through the preview dialog → status counts collections
//              → raw IndexedDB truth (rows present, order intact, no
//              duplicated readings) → the collections surface renders the
//              restored arrangement, a work-chapter entry opens the correct
//              chapter, the highlight renders, and the finished truth shows
//   plus:      a hand-built bundle with a MISSING target shows the honest
//              unresolved-collection warning and writes nothing; a legacy v9
//              bundle (no collection keys) still imports with zero collection
//              writes.
//
// Failure rollback stays a UNIT proof (tests/unit/portability/
// collections-roundtrip.spec.ts injected-hook test) — a mid-transaction
// failure cannot be triggered honestly through the real UI.
import { test, expect, type Page } from "@playwright/test";
import { ArticleSchema, BookSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/types";
import { deriveWorkStructure } from "../../../src/content/structure";
import {
  BASE,
  buildBundleZip,
  confidentHighlightOn,
  highlightRow,
  makeArticle,
  openSettings,
  prepareFreshPage,
  readAllRows,
  readBundleJson,
  readRow,
  seedRows,
  settingsStatus,
} from "./_portability";

// ── Machine A corpus (Node-side builders — shipped schemas only) ────────────

/** A chaptered web work: two heading-delimited chapters, its structural
 * snapshot derived and attached (the v9 carriage a work-chapter target
 * needs on a fresh library). */
const WORK_ARTICLE: CanonicalArticle = (() => {
  const base = makeArticle({
    id: "work-collect-rt01",
    title: "Round Trip Work",
    sourceUrl: "https://example.org/round-trip-work",
    paragraphs: ["Placeholder"],
  });
  const parsed = ArticleSchema.parse({
    ...JSON.parse(JSON.stringify(base)),
    blocks: [
      { kind: "heading", level: 2, content: [{ text: "Opening", marks: [] }] },
      {
        kind: "paragraph",
        content: [
          {
            text: "The opening chapter carries plain prose for the resolver. Its sentences are unique enough that an anchored passage resolves confidently on every engine.",
            marks: [],
          },
        ],
      },
      { kind: "heading", level: 2, content: [{ text: "Continuation", marks: [] }] },
      {
        kind: "paragraph",
        content: [
          {
            text: "The continuation chapter closes the work. A highlight placed here must render when the collection entry opens this exact chapter on machine B.",
            marks: [],
          },
        ],
      },
    ],
    footnotes: [],
  });
  return { ...JSON.parse(JSON.stringify(parsed)), structure: deriveWorkStructure(parsed) };
})();

const CHAPTERS = WORK_ARTICLE.structure!.destinations.filter((d) => d.kind === "chapter");
const SECOND_CHAPTER = CHAPTERS[1]!;
// A confident highlight INSIDE the second chapter's body — anchored near the
// chapter's END so it sits in paragraph prose (never the heading), and renders
// whenever the chapter scope mounts (paginated chapter scope mounts its own
// range; an opening-chapter anchor could sit outside it).
const CHAPTER_ANCHOR = confidentHighlightOn(WORK_ARTICLE, {
  start: SECOND_CHAPTER.endOffset - 40,
  length: 26,
});

/** The EPUB book: one book row + two chapter articles joined by
 * ingestionMeta.bookId (the canonical FK grouping reads key on). */
const BOOK = BookSchema.parse({
  id: "epub-collect-rt02",
  title: "Round Trip Book",
  authors: ["A. Roundtrip"],
  language: "en",
  chapterArticleIds: ["epub-rt-ch-1", "epub-rt-ch-2"],
  skippedChapterCount: 0,
  source: "epub-upload",
  originalFileHash: `sha256:${"3".repeat(64)}`,
  addedAt: "2026-08-16T00:00:00.000Z",
});
const BOOK_CHAPTER_1 = ArticleSchema.parse({
  id: "epub-rt-ch-1",
  revision: 1,
  lang: "en",
  provenance: {
    title: "Book Chapter One",
    retrievedAt: "2026-08-16T00:00:00.000Z",
    originalHtmlHash: `sha256:${"4".repeat(64)}`,
  },
  blocks: [
    {
      kind: "paragraph",
      content: [{ text: "The first book chapter's own short body text.", marks: [] }],
    },
  ],
  footnotes: [],
  ingestionMeta: {
    source: "epub-chapter",
    originalHtmlHash: `sha256:${"4".repeat(64)}`,
    extractionConfidence: "high",
    bookId: BOOK.id,
    chapterIndex: 0,
  },
});

/** The collection under round trip: all four target kinds, in a deliberate
 * order the restore must preserve byte-for-byte. */
const COLLECTION = {
  schemaVersion: 1,
  id: "coll-browser-rt01",
  name: "Evening plan",
  entries: [
    {
      id: "brow-entry-aaaa",
      target: { kind: "article", articleId: WORK_ARTICLE.id },
      addedAt: "2026-08-16T00:00:00.000Z",
    },
    {
      id: "brow-entry-bbbb",
      target: { kind: "book", bookId: BOOK.id },
      addedAt: "2026-08-16T00:01:00.000Z",
    },
    {
      id: "brow-entry-cccc",
      target: { kind: "book-chapter", bookId: BOOK.id, articleId: BOOK_CHAPTER_1.id },
      addedAt: "2026-08-16T00:02:00.000Z",
    },
    {
      id: "brow-entry-dddd",
      target: {
        kind: "work-chapter",
        articleId: WORK_ARTICLE.id,
        destinationId: SECOND_CHAPTER.id,
      },
      addedAt: "2026-08-16T00:03:00.000Z",
    },
  ],
  createdAt: "2026-08-16T00:00:00.000Z",
  updatedAt: "2026-08-16T00:03:00.000Z",
};
/** The second collection: EMPTY — zero entries is a valid arrangement. */
const EMPTY_COLLECTION = {
  schemaVersion: 1,
  id: "coll-browser-rt02",
  name: "Someday",
  entries: [],
  createdAt: "2026-08-16T00:00:00.000Z",
  updatedAt: "2026-08-16T00:00:00.000Z",
};
/** Shared completion on the work-chapter target (the reader's one truth —
 * machine B's detail view must show the entry as finished). */
const COMPLETION = {
  schemaVersion: 1,
  targetKey: `work-chapter:${WORK_ARTICLE.id}/${SECOND_CHAPTER.id}`,
  target: {
    kind: "work-chapter",
    articleId: WORK_ARTICLE.id,
    destinationId: SECOND_CHAPTER.id,
  },
  finished: true,
  source: "reading",
  updatedAt: "2026-08-17T00:00:00.000Z",
};
/** The collection's remembered active entry (navigation context only). */
const ACTIVE_ENTRY = {
  schemaVersion: 1,
  collectionId: COLLECTION.id,
  entryId: "brow-entry-dddd",
  updatedAt: "2026-08-17T00:00:00.000Z",
};

const SEEDED_PREFS = {
  schemaVersion: 2,
  font: "serif",
  size: 18,
  measure: 64,
  spacing: "comfortable",
  theme: "sepia",
  // Scrolling on PURPOSE: the restoration marker mounts unconditionally on a
  // genuine restore-landing in scrolling mode, so the whole-work entry's
  // open OBSERVABLY resumes at the shared saved position (reader behavior,
  // not just the stored row) — the tiny corpus is one paginated page, where
  // a restore would be indistinguishable from a fresh start.
  readingMode: "scrolling",
};

/** Seed machine A: the whole corpus + the starter-removal choice so machine
 * B's fresh library adopts it on import (the article count stays exact). */
async function seedLibraryA(page: Page): Promise<void> {
  await seedRows(page, {
    articles: [WORK_ARTICLE, BOOK_CHAPTER_1],
    books: [BOOK],
    highlights: [highlightRow(WORK_ARTICLE.id, CHAPTER_ANCHOR, "brow-hl-1")],
    notes: [
      {
        schemaVersion: 1,
        id: "brow-note-1",
        highlightId: "brow-hl-1",
        text: "Note riding the collection round trip.",
        updatedAt: "2026-08-16T00:00:00.000Z",
      },
    ],
    locations: [
      {
        schemaVersion: 1,
        articleId: WORK_ARTICLE.id,
        revision: 1,
        graphemeOffset: 42,
        savedAt: "2026-08-16T00:00:00.000Z",
      },
    ],
    settings: [
      { key: "reader-prefs", value: SEEDED_PREFS },
      { key: "starter-article-removed", value: true },
    ],
    collections: [COLLECTION, EMPTY_COLLECTION],
    completions: [COMPLETION],
    collectionActiveEntries: [ACTIVE_ENTRY],
  });
}

test.describe("Collections round trip (issue #248)", () => {
  test("collections ride export → import with order, completion, positions, and annotations intact", async ({
    browser,
  }) => {
    const machineA = await browser.newContext();
    const machineB = await browser.newContext();
    try {
      // ── Machine A: seed + export through the real UI ────────────────────
      const pageA = await machineA.newPage();
      await prepareFreshPage(pageA);
      await seedLibraryA(pageA);
      const panelA = await openSettings(pageA);
      await expect(panelA.getByRole("button", { name: "Export library bundle" })).toBeEnabled();
      const downloadPromise = pageA.waitForEvent("download", { timeout: 20_000 });
      await panelA.getByRole("button", { name: "Export library bundle" }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe("lem-reader-bundle-v1.zip");
      const bundlePath = await download.path();

      // ── Node side: the envelope carries the collection blocks ───────────
      const { bundle: bundleJson } = readBundleJson(bundlePath!);
      expect(bundleJson.schemaVersion).toBe(10); // #248 moved the writer version
      expect(bundleJson.collections).toEqual([COLLECTION, EMPTY_COLLECTION]);
      expect(bundleJson.completions).toEqual([COMPLETION]);
      expect(bundleJson.collectionActiveEntries).toEqual([ACTIVE_ENTRY]);

      // ── Machine B: fresh library, import through the preview ────────────
      const pageB = await machineB.newPage();
      await prepareFreshPage(pageB);
      const panelB = await openSettings(pageB);
      await panelB.locator('input[type="file"][accept=".zip"]').setInputFiles(bundlePath!);
      const preview = pageB.locator("dialog.import-preview");
      await expect(preview).toBeVisible({ timeout: 15_000 });
      // Two collections ride; neither warning may fire (all targets resolve).
      await expect(preview).toContainText("and 2 collections.");
      await expect(preview).not.toContainText("collections will be skipped");
      await expect(preview).not.toContainText("will be kept as yours");
      await preview.getByRole("button", { name: "Import", exact: true }).click();
      await expect(settingsStatus(pageB)).toContainText(
        "Imported 2 articles, 1 highlight, 1 note, 0 article notes, 1 reading position, and 2 collections.",
        { timeout: 15_000 },
      );

      // ── Machine B: raw IndexedDB truth ───────────────────────────────
      const restoredCollection = await readRow(pageB, "collections", COLLECTION.id);
      expect(restoredCollection).toEqual(COLLECTION); // name + ordered entries byte-intact
      expect(await readRow(pageB, "collections", EMPTY_COLLECTION.id)).toEqual(EMPTY_COLLECTION);
      expect(await readRow(pageB, "completions", COMPLETION.targetKey)).toEqual(COMPLETION);
      expect(await readRow(pageB, "collectionActiveEntries", COLLECTION.id)).toEqual(ACTIVE_ENTRY);
      expect(await readRow(pageB, "location", [WORK_ARTICLE.id, 1])).toMatchObject({
        articleId: WORK_ARTICLE.id,
        revision: 1,
        graphemeOffset: 42, // the saved position, byte-equal
      });
      expect(await readRow(pageB, "highlights", "brow-hl-1")).not.toBeNull();
      expect(await readRow(pageB, "notes", "brow-note-1")).not.toBeNull();
      // NO implicit duplication: exactly the work + one book chapter ride —
      // never collection-owned copies.
      const articleRows = await readAllRows(pageB, "articles");
      expect(articleRows.map((a) => a.id).sort()).toEqual(
        [WORK_ARTICLE.id, BOOK_CHAPTER_1.id].sort(),
      );

      // ── Machine B: the collections surface is usable ────────────────────
      await pageB.keyboard.press("Escape"); // close the settings panel
      await expect(panelB).not.toBeVisible();
      await pageB.goto(`${BASE}/#/collections`);
      await expect(pageB.getByRole("heading", { level: 1, name: "Collections" })).toBeVisible();
      await pageB.getByRole("link", { name: "Evening plan", exact: true }).click();
      await expect(pageB.getByRole("heading", { level: 1, name: "Evening plan" })).toBeVisible();
      // The restored order renders entry by entry (the four target kinds).
      const entries = pageB.locator(".collection-entries .collection-entry");
      await expect(entries).toHaveCount(4);
      await expect(entries.nth(0).getByRole("link", { name: "Round Trip Work" })).toBeVisible();
      await expect(entries.nth(1).getByRole("link", { name: "Round Trip Book" })).toBeVisible();
      await expect(entries.nth(2).getByRole("link", { name: "Book Chapter One" })).toBeVisible();
      await expect(entries.nth(3).getByRole("link", { name: "Continuation" })).toBeVisible();
      // The shared completion truth shows on the finished entry (issue #246
      // semantics carried by the #248 row).
      await expect(entries.nth(3).locator(".collection-entry-finished")).toHaveText("Finished");

      // ── The work-chapter entry opens the CORRECT chapter ────────────────
      await entries.nth(3).getByRole("link", { name: "Continuation" }).click();
      await expect(pageB).toHaveURL(
        new RegExp(
          `#/article/${WORK_ARTICLE.id}/c/${SECOND_CHAPTER.id}/col/${COLLECTION.id}/brow-entry-dddd$`,
        ),
      );
      // The chapter scope mounted (the pagination banner names the portion);
      // the heading name may carry the highlight mark split, so match the
      // chapter title as a fragment.
      await expect(pageB.getByRole("heading", { name: /Continuation/ })).toBeVisible({
        timeout: 15_000,
      });
      // The highlight rides AND renders on this chapter's scope.
      await expect(
        pageB.locator('mark.highlight[data-highlight-id="brow-hl-1"]'),
        "the chapter-scoped highlight must render on machine B",
      ).toBeVisible({ timeout: 15_000 });

      // ── The whole-work entry opens AT THE SHARED SAVED POSITION ───────
      // Back on the restored collection, entry 0 (whole article) resumes the
      // traveled location: the restoration marker mounts on the genuine
      // restore-landing ("Returned to where you left off.") — the AC's
      // "opens at the shared saved position" observed as reader behavior,
      // not only as the stored row asserted above.
      await pageB.goto(`${BASE}/#/collections/${COLLECTION.id}`);
      await expect(pageB.getByRole("heading", { level: 1, name: "Evening plan" })).toBeVisible();
      await pageB
        .locator(".collection-entries .collection-entry")
        .nth(0)
        .getByRole("link", { name: "Round Trip Work" })
        .click();
      await expect(pageB.locator(".restoration-marker")).toBeVisible({ timeout: 15_000 });

      // An empty collection restores as a usable (empty) arrangement.
      await pageB.goto(`${BASE}/#/collections/${EMPTY_COLLECTION.id}`);
      await expect(pageB.getByRole("heading", { level: 1, name: "Someday" })).toBeVisible();
      await expect(
        pageB.getByRole("heading", { level: 2, name: "No readings in this collection yet." }),
      ).toBeVisible();
    } finally {
      await machineA.close();
      await machineB.close();
    }
  });

  test("a collection with a missing target is refused and reported, never partially written", async ({
    browser,
  }) => {
    const machine = await browser.newContext();
    try {
      const page = await machine.newPage();
      await prepareFreshPage(page);
      // Hand-built (Node-side, shipped schemas): the collection's article
      // target names a reading the bundle does NOT carry and the library
      // does not have — the boundary must refuse the WHOLE collection.
      const brokenBundle = {
        schemaVersion: 10,
        exportedAt: "2026-08-18T00:00:00.000Z",
        appVersion: "test",
        articles: [],
        locations: [],
        highlights: [],
        notes: [],
        preferences: SEEDED_PREFS,
        fixtureIds: [],
        books: [],
        assets: [],
        readingSessions: [],
        subscriptions: [],
        articleNotes: [],
        starterRemoved: true,
        collections: [
          {
            ...COLLECTION,
            id: "coll-broken-rt03",
            name: "Broken plan",
            entries: [COLLECTION.entries[0]!], // article target — absent everywhere
          },
        ],
        completions: [],
        collectionActiveEntries: [],
      };
      const zip = await buildBundleZip(brokenBundle);
      const panel = await openSettings(page);
      await panel.locator('input[type="file"][accept=".zip"]').setInputFiles({
        name: "broken.zip",
        mimeType: "application/zip",
        buffer: zip,
      });
      const preview = page.locator("dialog.import-preview");
      await expect(preview).toBeVisible({ timeout: 15_000 });
      await expect(preview).toContainText(
        "1 collection will be skipped because one of its readings isn't available or its entries aren't valid.",
      );
      await preview.getByRole("button", { name: "Import", exact: true }).click();
      await expect(settingsStatus(page)).toContainText("1 item was skipped.", {
        timeout: 15_000,
      });
      // Nothing was written: no collection row, no partial state.
      expect(await readAllRows(page, "collections")).toEqual([]);
    } finally {
      await machine.close();
    }
  });

  test("a legacy v9 bundle imports with zero collection writes (older backups stay importable)", async ({
    browser,
  }) => {
    const machine = await browser.newContext();
    try {
      const page = await machine.newPage();
      await prepareFreshPage(page);
      const legacyBundle = {
        schemaVersion: 9,
        exportedAt: "2026-08-18T00:00:00.000Z",
        appVersion: "test",
        articles: [
          JSON.parse(JSON.stringify({ ...WORK_ARTICLE, structure: WORK_ARTICLE.structure })),
        ],
        locations: [],
        highlights: [],
        notes: [],
        preferences: SEEDED_PREFS,
        fixtureIds: [],
        books: [],
        assets: [],
        readingSessions: [],
        subscriptions: [],
        articleNotes: [],
        starterRemoved: true,
      };
      const zip = await buildBundleZip(legacyBundle);
      const panel = await openSettings(page);
      await panel.locator('input[type="file"][accept=".zip"]').setInputFiles({
        name: "legacy.zip",
        mimeType: "application/zip",
        buffer: zip,
      });
      const preview = page.locator("dialog.import-preview");
      await expect(preview).toBeVisible({ timeout: 15_000 });
      await expect(preview).toContainText("and 0 collections.");
      await preview.getByRole("button", { name: "Import", exact: true }).click();
      await expect(settingsStatus(page)).toContainText("Imported 1 article", { timeout: 15_000 });
      // The article rode; the collection stores stay untouched.
      expect(await readRow(page, "articles", WORK_ARTICLE.id)).not.toBeNull();
      expect(await readAllRows(page, "collections")).toEqual([]);
      expect(await readAllRows(page, "completions")).toEqual([]);
      expect(await readAllRows(page, "collectionActiveEntries")).toEqual([]);
    } finally {
      await machine.close();
    }
  });
});
