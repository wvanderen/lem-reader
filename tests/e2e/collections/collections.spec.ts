// tests/e2e/collections/collections.spec.ts
// Issue #242 — the browser seam for collections (the acceptance-criteria
// surface the unit suites cannot see):
//
//   - DISC-242-01 — discoverability + the honest no-content state: the
//     Library header row carries the Collections entry; a cold
//     #/collections shows "No collections yet." (title + one sentence).
//   - DISC-242-02 — the keyboard create flow + persistence across reload:
//     type a name, Enter submits, the card appears with an announcement;
//     a reload keeps it (local-first persistence, AC "persists across
//     reloads").
//   - DISC-242-03 — the keyboard rename flow: the dialog opens with the
//     INPUT focused (a rename is typing, not a destruction), Enter
//     commits, the rename survives reload.
//   - DISC-242-04 — ordered membership + the whole-readings gate +
//     duplicate refusal + many-to-many: seeded article + book join in
//     ADD ORDER (the ordered-list marker is the order); book CHAPTERS are
//     never offered (chapter targets are issue #244); an added row flips
//     to the non-interactive "Added" mark (the store's per-collection
//     duplicate refusal's UI face — the refusal logic itself is pinned at
//     the unit seam); the SAME reading joins a SECOND collection while
//     the library keeps exactly one copy (no cloning).
//   - DISC-242-05 — opening entries uses the SHARED saved location: an
//     article entry restores the seeded reading position (the same resume
//     the library uses — ADR 0001); a book entry opens the D12-07 resume
//     chapter (its latest savedAt), never plan-specific state.
//   - DISC-242-06 — reload + offline behavior: a deep link into a
//     collection detail renders after reload; the surfaces render with
//     the browser offline (local-first — no network fetch behind them).
//
// Harness (REUSE-DO-NOT-FORK): BASE + wipeDatabase (annotations/_fixtures)
// + seedStoreRows (library) + restoredScrollY (location-readiness). The
// Node-side rows are ArticleSchema.parse-built (schema-valid by
// construction — the seeded rows must survive the store-seam Zod read).
import { test, expect, type Locator, type Page } from "@playwright/test";
import { ArticleSchema, BookSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/schema";
import { normalizeText, graphemeClusters } from "../../../src/content/normalizeText";
import { BASE } from "../_base";
import { focusWalkStart } from "../_keyboard";
import { wipeDatabase } from "../annotations/_fixtures";
import { seedStoreRows } from "../library/seedStoreRows";
import { restoredScrollY } from "../location-readiness";

// ── Node-side corpus builders (shipped schemas only) ────────────────────────

const ARTICLE_PROSE = [
  "The harbor essays open on a morning the chroniclers all described differently, and the archivists now consider that disagreement the most honest thing about the whole collection.",
  "Each following section walks the keepers through a season of small repairs, careful logs, and one incident involving a lantern, a rowboat, and a sentence nobody has finished agreeing on since.",
  "The closing pages simply list what was saved, and the reader who reaches them tends to sit quietly for a moment before starting whatever the collection holds next.",
].join(" ");

function makeArticle(id: string, title: string): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      title,
      retrievedAt: "2026-10-01T00:00:00.000Z",
      originalHtmlHash: `sha256:${"b".repeat(64)}`,
    },
    blocks: [
      { kind: "paragraph", content: [{ text: ARTICLE_PROSE, marks: [] }] },
      { kind: "paragraph", content: [{ text: ARTICLE_PROSE, marks: [] }] },
      { kind: "paragraph", content: [{ text: ARTICLE_PROSE, marks: [] }] },
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
}

function makeChapter(id: string, bookId: string, index: number): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      title: `Chapter ${index + 1}`,
      retrievedAt: "2026-10-01T00:00:00.000Z",
      originalHtmlHash: `sha256:${"c".repeat(64)}`,
    },
    blocks: [{ kind: "paragraph", content: [{ text: ARTICLE_PROSE, marks: [] }] }],
    ingestionMeta: {
      source: "epub-chapter",
      origin: "upload",
      bookId,
      chapterIndex: index,
      originalHtmlHash: `sha256:${"c".repeat(64)}`,
      ingestedAt: "2026-10-01T00:00:00.000Z",
      extractionConfidence: "high",
    },
    addedAt: "2026-10-01T00:00:00.000Z",
  });
}

const BOOK_ID = "epub-aaaaaaaaaaaa";
const CHAPTER_IDS = ["harbor-epub-c01", "harbor-epub-c02"];

function makeBook(): import("../../../src/content/schema").Book {
  return BookSchema.parse({
    id: BOOK_ID,
    title: "Collected Harbor Works",
    authors: ["A. Keeper"],
    language: "en",
    chapterArticleIds: CHAPTER_IDS,
    skippedChapterCount: 0,
    source: "epub-upload",
    originalFileHash: `sha256:${"d".repeat(64)}`,
    addedAt: "2026-10-01T00:00:00.000Z",
  });
}

// ── Seeders (raw IndexedDB puts — the seedStoreRows discipline) ─────────────

async function seedLocation(page: Page, articleId: string, offset: number, savedAt: string) {
  await seedStoreRows(page, "location", [
    { schemaVersion: 1, articleId, revision: 1, graphemeOffset: offset, savedAt },
  ]);
}

async function seedScrollingMode(page: Page): Promise<void> {
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("settings")) {
          resolve();
          return;
        }
        const tx = db.transaction("settings", "readwrite");
        tx.objectStore("settings").put({
          key: "reader-prefs",
          value: {
            schemaVersion: 2,
            font: "serif",
            size: 18,
            measure: 64,
            spacing: "comfortable",
            theme: "sepia",
            readingMode: "scrolling",
          },
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    });
  });
}

// ── UI helpers ──────────────────────────────────────────────────────────────

/** Remount after wipeDatabase, then prove the repository read has settled.
 * A hash-only goto can leave the old Library heading mounted after Dexie
 * closes for deletion; raw seeding then recreates a schema-less database
 * (the a11y.spec.ts seeded-panel setup precedent). */
async function boot(page: Page): Promise<void> {
  await page.goto(`${BASE}/#/`);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Getting started with Lem Reader", exact: true }),
  ).toBeVisible();
}

/** Safari on macOS defaults to form-controls-only sequential navigation
 * (a11y.spec.ts's tabOrderFollowsDom contract). Keep actual Tab-order proof
 * elsewhere, including Linux WebKit; on macOS WebKit prove focusability
 * before the SAME Enter activation and post-write/close focus assertions. */
async function focusNextCollectionControl(page: Page, target: Locator): Promise<void> {
  if (test.info().project.name === "webkit" && process.platform === "darwin") {
    await focusWalkStart(page, target);
  } else {
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

/** The keyboard create: type the name, Enter submits the form. */
async function createCollection(page: Page, name: string): Promise<void> {
  await page.goto(`${BASE}/#/collections`);
  await expect(page.getByRole("heading", { level: 1, name: "Collections" })).toBeVisible();
  await page.fill("#collections-new-name", name);
  await page.press("#collections-new-name", "Enter");
  await expect(page.getByRole("link", { name })).toBeVisible();
}

async function openCollection(page: Page, name: string): Promise<void> {
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/collections/[a-z0-9-]+$`));
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

const ARTICLE_ID = "harbor-essays";
const ARTICLE_TITLE = "Harbor Essays";
// The offset seed needs the article's canonical grapheme total — compute it
// over the SAME builder output the seeded row carries (normalizeText →
// graphemeClusters, the D-05 substrate), never a hand-counted literal.
const TOTAL_GRAPHEMES = graphemeClusters(
  normalizeText(makeArticle(ARTICLE_ID, ARTICLE_TITLE)),
  "en",
).length;

test.describe("Collections (issue #242)", () => {
  test.beforeEach(async ({ page }) => {
    await wipeDatabase(page);
    // Stub remote images so fixture figures never couple to the network.
    await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
      route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg/>" }),
    );
    await boot(page);
  });

  test("Library carries the Collections entry; a cold list shows the no-content state (DISC-242-01)", async ({
    page,
  }) => {
    // The discoverable entry on the Library destination.
    await expect(page.getByRole("link", { name: "Collections" })).toBeVisible();
    await page.getByRole("link", { name: "Collections" }).click();
    await expect(page).toHaveURL(new RegExp(`#/collections$`));
    await expect(page.getByRole("heading", { level: 1, name: "Collections" })).toBeVisible();
    // The honest no-content state: title + one sentence (never blank).
    await expect(
      page.getByRole("heading", { level: 2, name: "No collections yet." }),
    ).toBeVisible();
    // And the create form is the surface's first action, always visible.
    await expect(page.getByLabel("New collection")).toBeVisible();
  });

  test("keyboard create flow announces, lists, and survives reload (DISC-242-02)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/collections`);
    await page.fill("#collections-new-name", "Morning queue");
    await page.press("#collections-new-name", "Enter");
    // The card appears with its honest zero-membership line...
    const card = page.getByRole("link", { name: "Morning queue" });
    await expect(card).toBeVisible();
    await expect(page.getByText("No readings yet")).toBeVisible();
    // ...and the announcement names the creation (the ONE polite region).
    await expect(page.getByText("Created “Morning queue”.", { exact: true })).toBeVisible();
    // Persistence across reload (local-first, AC).
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Collections" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Morning queue" })).toBeVisible();
  });

  test("keyboard rename flow: dialog focuses the input, Enter commits, reload persists (DISC-242-03)", async ({
    page,
  }) => {
    await createCollection(page, "Working title");
    // Start after create settles. The cleared Create button is disabled;
    // in DOM-order navigation the next stops are the card link and Rename.
    const createInput = page.getByLabel("New collection");
    await expect(createInput).toBeEnabled();
    await focusWalkStart(page, createInput);
    await focusNextCollectionControl(
      page,
      page.getByRole("link", { name: "Working title", exact: true }),
    );
    await focusNextCollectionControl(
      page,
      page.getByRole("button", { name: "Rename", exact: true }),
    );
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const input = page.getByRole("textbox", { name: "Name", exact: true });
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("Working title");
    await input.fill("Reading plan");
    await page.press("#rename-collection-name", "Enter");
    // The list reflects the rename + the announcement names it.
    await expect(page.getByRole("link", { name: "Reading plan" })).toBeVisible();
    await expect(page.getByText("Renamed to “Reading plan”.", { exact: true })).toBeVisible();
    // The rename persists across reload.
    await page.reload();
    await expect(page.getByRole("link", { name: "Reading plan" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Working title" })).toHaveCount(0);
  });

  test("ordered membership, the whole-readings gate, duplicate refusal, many-to-many (DISC-242-04)", async ({
    page,
  }) => {
    // Seed one standalone article + one two-chapter book (raw rows, then a
    // reload so the snapshot re-derives against them).
    await seedStoreRows(page, "articles", [
      makeArticle(ARTICLE_ID, ARTICLE_TITLE),
      makeChapter(CHAPTER_IDS[0]!, BOOK_ID, 0),
      makeChapter(CHAPTER_IDS[1]!, BOOK_ID, 1),
    ]);
    await seedStoreRows(page, "books", [makeBook()]);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible();

    await createCollection(page, "Winter queue");
    await openCollection(page, "Winter queue");
    // The empty-collection no-content state invites the first add.
    await expect(
      page.getByRole("heading", { level: 2, name: "No readings in this collection yet." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Add readings" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // THE WHOLE-READINGS GATE: book chapters are never offered. The seeded
    // chapters are titled "Chapter 1"/"Chapter 2" — a search for "Chapter"
    // matches NOTHING (the honest no-match line), while the book itself
    // matches by its own title.
    await page.fill("#add-reading-search", "Chapter");
    await expect(dialog.getByText(/Nothing in your library matches/)).toBeVisible();

    // Add the article, then the book — they land in ADD ORDER. Each added
    // row flips to the non-interactive "Added" mark (the duplicate
    // refusal's UI face; the store refuses authoritatively).
    await page.fill("#add-reading-search", ARTICLE_TITLE);
    const articleRow = dialog.locator(".add-reading-row", { hasText: ARTICLE_TITLE });
    await articleRow.getByRole("button", { name: `Add ${ARTICLE_TITLE}` }).click();
    await expect(articleRow.getByText("Added", { exact: true })).toBeVisible();
    await page.fill("#add-reading-search", "Collected Harbor Works");
    const bookRow = dialog.locator(".add-reading-row", { hasText: "Collected Harbor Works" });
    await bookRow.getByRole("button", { name: "Add Collected Harbor Works" }).click();
    await expect(bookRow.getByText("Added", { exact: true })).toBeVisible();
    // With the search cleared, BOTH rows carry the mark.
    await page.fill("#add-reading-search", "");
    await expect(dialog.getByText("Added", { exact: true })).toHaveCount(2);
    await dialog.getByRole("button", { name: "Done" }).click();

    // The ordered list renders both entries, article first (add order).
    const entries = page.locator(".collection-entries .collection-entry");
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0).getByRole("link", { name: ARTICLE_TITLE })).toBeVisible();
    await expect(
      entries.nth(1).getByRole("link", { name: "Collected Harbor Works" }),
    ).toBeVisible();
    // The kind lines are honest.
    await expect(entries.nth(0).getByText("Article", { exact: true })).toBeVisible();
    await expect(entries.nth(1).getByText("Book", { exact: true })).toBeVisible();

    // The list itself persists across reload (ordered membership).
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Winter queue" })).toBeVisible();
    await expect(page.locator(".collection-entries .collection-entry")).toHaveCount(2);
    await expect(entries.nth(0).getByRole("link", { name: ARTICLE_TITLE })).toBeVisible();

    // MANY-TO-MANY: the same article joins a second collection...
    await page.goto(`${BASE}/#/collections`);
    await page.fill("#collections-new-name", "Bedtime queue");
    await page.press("#collections-new-name", "Enter");
    await openCollection(page, "Bedtime queue");
    await page.getByRole("button", { name: "Add readings" }).click();
    await page.fill("#add-reading-search", ARTICLE_TITLE);
    await dialog.getByRole("button", { name: `Add ${ARTICLE_TITLE}` }).click();
    await expect(dialog.getByText("Added", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(page.locator(".collection-entries .collection-entry")).toHaveCount(1);
    // ...and the library still lists the article exactly once (membership
    // never clones content).
    await page.goto(`${BASE}/#/`);
    await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(ARTICLE_TITLE) })).toHaveCount(1);
  });

  test("keyboard adds keep modal announcements, edited titles, and a live close-focus target", async ({
    page,
  }) => {
    const editedTitle = "My harbor reading";
    const secondTitle = "Second harbor reading";
    await seedStoreRows(page, "articles", [
      { ...makeArticle(ARTICLE_ID, ARTICLE_TITLE), readerTitle: editedTitle },
      makeArticle("second-harbor-reading", secondTitle),
    ]);
    await createCollection(page, "Keyboard queue");
    await openCollection(page, "Keyboard queue");
    const opener = page.getByRole("button", { name: "Add readings", exact: true });
    await focusWalkStart(page, opener);
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    const search = dialog.getByLabel("Search your readings");
    await expect(search).toBeFocused();
    for (const title of [editedTitle, secondTitle]) {
      await search.fill(title);
      await focusNextCollectionControl(
        page,
        dialog.getByRole("button", { name: `Add ${title}`, exact: true }),
      );
      await page.keyboard.press("Enter");
      // The Add button disappears. Focus must land on a useful live control
      // and the announcement must be INSIDE the modal's accessible subtree.
      await expect(search).toBeFocused();
      await expect(dialog.getByRole("status")).toHaveText(`Added “${title}”.`);
    }
    await focusNextCollectionControl(page, dialog.getByRole("button", { name: "Done" }));
    await page.keyboard.press("Enter");
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
    await expect(page.getByRole("link", { name: editedTitle, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: ARTICLE_TITLE, exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("link", { name: editedTitle, exact: true })).toBeVisible();
  });

  test("opening entries uses the shared saved location — article restore + book resume chapter (DISC-242-05)", async ({
    page,
  }) => {
    const article = makeArticle(ARTICLE_ID, ARTICLE_TITLE);
    const deepOffset = Math.floor(TOTAL_GRAPHEMES * 0.4);
    await seedScrollingMode(page);
    await seedStoreRows(page, "articles", [
      article,
      makeChapter(CHAPTER_IDS[0]!, BOOK_ID, 0),
      makeChapter(CHAPTER_IDS[1]!, BOOK_ID, 1),
    ]);
    await seedStoreRows(page, "books", [makeBook()]);
    // The article was read INTO; the book's chapter 2 was read LATER than
    // chapter 1 — the D12-07 resume pointer must land there.
    await seedLocation(page, ARTICLE_ID, deepOffset, "2026-10-02T08:00:00.000Z");
    await seedLocation(page, CHAPTER_IDS[0]!, 10, "2026-10-01T08:00:00.000Z");
    await seedLocation(page, CHAPTER_IDS[1]!, 20, "2026-10-03T08:00:00.000Z");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible();

    await createCollection(page, "Shared positions");
    await openCollection(page, "Shared positions");
    await page.getByRole("button", { name: "Add readings" }).click();
    const dialog = page.getByRole("dialog");
    await page.fill("#add-reading-search", ARTICLE_TITLE);
    await dialog.getByRole("button", { name: `Add ${ARTICLE_TITLE}` }).click();
    await page.fill("#add-reading-search", "Collected Harbor Works");
    await dialog.getByRole("button", { name: "Add Collected Harbor Works" }).click();
    await dialog.getByRole("button", { name: "Done" }).click();

    // The ARTICLE entry opens at the seeded location (the shared resume —
    // the same restore the library row performs; scrolling mode, so the
    // viewport moves and stabilizes above 0).
    await page.locator(".collection-entry-link", { hasText: ARTICLE_TITLE }).click();
    await expect(page).toHaveURL(new RegExp(`#/article/${ARTICLE_ID}$`));
    const restored = await restoredScrollY(page);
    expect(restored).toBeGreaterThan(0);

    // The BOOK entry opens the resume chapter — the latest-savedAt one —
    // through the same chapter routes the library book row uses.
    await page.goto(`${BASE}/#/collections`);
    await openCollection(page, "Shared positions");
    await page.locator(".collection-entry-link", { hasText: "Collected Harbor Works" }).click();
    await expect(page).toHaveURL(new RegExp(`#/article/${CHAPTER_IDS[1]}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Chapter 2" })).toBeVisible();
  });

  test("deep link + reload + no external network (DISC-242-06)", async ({ page }) => {
    await createCollection(page, "Offline check");
    await openCollection(page, "Offline check");
    // Reload the deep link — the detail view re-derives from the store.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Offline check" })).toBeVisible();
    // OFFLINE BEHAVIOR (local-first): while the reader works these
    // surfaces, NO request may leave the app origin — every byte they
    // render comes from IndexedDB + the loaded bundle. The image stub in
    // beforeEach already fulfills remote images in-file; this assertion
    // proves the collection surfaces themselves issue nothing external.
    const external: string[] = [];
    page.on("request", (req) => {
      if (!req.url().startsWith(BASE)) external.push(req.url());
    });
    await page.goto(`${BASE}/#/collections`);
    await expect(page.getByRole("link", { name: "Offline check" })).toBeVisible();
    await openCollection(page, "Offline check");
    await page.getByRole("button", { name: "Add readings" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    expect(external).toEqual([]);
  });
});
