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
//   - DISC-242-04 — ordered membership + duplicate refusal + many-to-many:
//     seeded article + book join in ADD ORDER (the ordered-list marker is
//     the order); book CHAPTERS are offered as chapter targets (issue #244
//     widened the picker — the DISC-244-01 spec owns their full behavior);
//     an added row flips to the non-interactive "Added" mark (the store's
//     per-collection duplicate refusal's UI face — the refusal logic itself
//     is pinned at the unit seam); the SAME reading joins a SECOND
//     collection while the library keeps exactly one copy (no cloning).
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
import { wipeDatabase, assertHighlightMark, seedHighlightRecord } from "../annotations/_fixtures";
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
const BOOK_TITLE = "Collected Harbor Works";
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

  test("ordered membership, duplicate refusal, many-to-many (DISC-242-04)", async ({ page }) => {
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

    // THE CHAPTER TARGETS (issue #244 widened the picker): the book's
    // EXISTING chapter articles are offered under the book's row — the
    // seeded chapters are titled "Chapter 1"/"Chapter 2" and a search for
    // "Chapter" matches THEM (the whole-reading rows for the article and
    // the book do not carry that title). Each chapter row names its parent.
    await page.fill("#add-reading-search", "Chapter");
    await expect(
      dialog.getByRole("button", {
        name: "Add Chapter 1 (Chapter · Collected Harbor Works)",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", {
        name: "Add Chapter 2 (Chapter · Collected Harbor Works)",
        exact: true,
      }),
    ).toBeVisible();
    // The seeded standalone article derives no chapter destinations (a
    // headingless short work) — only its whole-reading row matches.
    await page.fill("#add-reading-search", "Harbor Essays");
    await expect(dialog.getByText("Chapter · Harbor Essays")).toHaveCount(0);

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
    await expect(entries.nth(1).getByRole("link", { name: BOOK_TITLE })).toBeVisible();
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
      // The same action stays mounted, keeping keyboard focus and row geometry.
      // Outcomes still announce inside the modal's accessible subtree.
      const added = dialog.getByRole("button", { name: `Added ${title}`, exact: true });
      await expect(added).toBeFocused();
      await expect(added).toHaveAttribute("aria-disabled", "true");
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
    // Issue #247 — the row link carries the /col/ collection context (the
    // parseHash grammar): opening an entry IS reading within the plan.
    await expect(page).toHaveURL(new RegExp(`#/article/${ARTICLE_ID}/col/[a-z0-9-]+/[a-z0-9-]+$`));
    const restored = await restoredScrollY(page);
    expect(restored).toBeGreaterThan(0);

    // The BOOK entry opens the resume chapter — the latest-savedAt one —
    // through the same chapter routes the library book row uses.
    await page.goto(`${BASE}/#/collections`);
    await openCollection(page, "Shared positions");
    await page.locator(".collection-entry-link", { hasText: "Collected Harbor Works" }).click();
    // Issue #247 — the book entry's open carries the /col/ context (the
    // parseHash grammar).
    await expect(page).toHaveURL(
      new RegExp(`#/article/${CHAPTER_IDS[1]}/col/[a-z0-9-]+/[a-z0-9-]+$`),
    );
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

// ── Issue #243 — editing the arrangement: reorder, remove, delete ──────────
//
//   - DISC-243-01 — KEYBOARD reorder: Enter on a row's Move control flips
//     the order, the ONE polite region announces the outcome WITH the new
//     position, focus stays on the same entry's control (the reader can
//     keep pressing), and the flipped order persists across reload. The
//     accessible names carry position ("position 1 of 2") — orientation
//     feedback in the ONE name the screen reader speaks.
//   - DISC-243-02 — POINTER reorder: the same controls by click; the
//     first/last boundaries DISABLE their control visibly (Move up on the
//     first row, Move down on the last).
//   - DISC-243-03 — reorder + membership edits NEVER touch reading state:
//     after a move and a removal the article still opens at its seeded
//     position with its seeded highlight rendering (ADR 0001/0011 — the
//     collection references, never owns).
//   - DISC-243-04 — REMOVE: the announcement names the preservation, focus
//     hands off to the FOLLOWING row's title link (never a destructive
//     control), the entry leaves the one collection while the SECOND
//     collection and the library keep the reading exactly once.
//   - DISC-243-05 — removing the LAST entry leaves the honest empty state
//     with focus on the stable Add affordance; the emptiness persists.
//   - DISC-243-06 — DELETE COLLECTION: cancel (Esc) keeps everything with
//     the trigger-focus restored; confirm deletes ONLY the collection —
//     the other collection and the library keep the reading — announces
//     the preservation, and hands focus to the neighbor card's title link.
//   - DISC-243-07 — deleting the LAST collection lands focus on the New
//     collection input beside the honest no-content state; the reading
//     remains in the library.
//   - DISC-243-08 — TRANSACTION FAILURES end-to-end (the AC's "save
//     failures leave valid persisted state intact and surface a calm next
//     step"): an in-page one-shot IDB abort (the
//     installHighlightDeleteSabotage twin, aimed at the `collections`
//     store) makes a move fail — the honest announcement renders, the
//     order is untouched, and a DISARMED retry succeeds; it makes a delete
//     fail — the dialog stays open with its error line, and canceling
//     leaves the collection card in place.
// The harbor corpus builder repeats one prose string across three blocks
// (above), so EVERY quote over it matches three times — resolvable only to
// "ambiguous". DISC-243-03 needs a CONFIDENT highlight (the preservation
// proof should not ride an ambiguity), so it seeds its own article with
// distinct paragraphs and highlights the one unique sentence.
const KEEPER_ARTICLE_ID = "keeper-ledgers";
const KEEPER_TITLE = "Keeper Ledgers";
const KEEPER_PARAGRAPHS = [
  "The keeper ledgers begin with a tide table copied out by hand, each morning row corrected against the harbor bell.",
  // Distinct filler paragraphs — the article must be several screenfuls
  // deep so the seeded 85% location can only restore scrolled (>0).
  ...Array.from(
    { length: 13 },
    (_, i) =>
      `Ledger season ${i + 2} records the crew's steady work: rope mended, paint renewed, charts corrected, and the harbor bell rehung after every hard blow that rolled through the channel.`,
  ),
].join(" ");

function makeKeeperArticle(): CanonicalArticle {
  return ArticleSchema.parse({
    id: KEEPER_ARTICLE_ID,
    revision: 1,
    lang: "en",
    provenance: {
      title: KEEPER_TITLE,
      retrievedAt: "2026-10-01T00:00:00.000Z",
      originalHtmlHash: `sha256:${"e".repeat(64)}`,
    },
    blocks: [{ kind: "paragraph", content: [{ text: KEEPER_PARAGRAPHS, marks: [] }] }],
    ingestionMeta: {
      source: "paste",
      origin: "paste",
      originalHtmlHash: `sha256:${"e".repeat(64)}`,
      ingestedAt: "2026-10-01T00:00:00.000Z",
      extractionConfidence: "high",
    },
    addedAt: "2026-10-01T00:00:00.000Z",
  });
}

/** The unique needle over KEEPER_PARAGRAPHS plus its canonical offsets —
 * computed over the SAME normalize/grapheme substrate the resolver uses. */
const KEEPER_NEEDLE = "tide table copied out by hand";

test.describe("Collections editing (issue #243)", () => {
  test.beforeEach(async ({ page }) => {
    await wipeDatabase(page);
    await page.route(/\.(png|jpe?g|gif|webp|svg)(\?|$)/, (route) =>
      route.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg/>" }),
    );
    await boot(page);
  });

  /** Seed the article + two-chapter book library the #242 tests use. */
  async function seedLibrary(page: Page): Promise<void> {
    await seedStoreRows(page, "articles", [
      makeArticle(ARTICLE_ID, ARTICLE_TITLE),
      makeChapter(CHAPTER_IDS[0]!, BOOK_ID, 0),
      makeChapter(CHAPTER_IDS[1]!, BOOK_ID, 1),
    ]);
    await seedStoreRows(page, "books", [makeBook()]);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible();
  }

  /** Create a collection and add the named readings via the dialog. */
  async function createCollectionWith(page: Page, name: string, titles: string[]): Promise<void> {
    await createCollection(page, name);
    await openCollection(page, name);
    await page.getByRole("button", { name: "Add readings" }).click();
    const dialog = page.getByRole("dialog");
    for (const title of titles) {
      await page.fill("#add-reading-search", title);
      await dialog.getByRole("button", { name: `Add ${title}` }).click();
    }
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).not.toBeVisible();
  }

  function entryRow(page: Page, title: string): Locator {
    return page.locator(".collection-entry", { hasText: title });
  }

  test("keyboard reorder: Enter moves, the announcement carries the new position, focus stays, reload persists (DISC-243-01)", async ({
    page,
  }) => {
    await seedLibrary(page);
    await createCollectionWith(page, "Order practice", [ARTICLE_TITLE, BOOK_TITLE]);

    // Seeded add order: article first, book second.
    const entries = page.locator(".collection-entry");
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0).getByRole("link", { name: ARTICLE_TITLE })).toBeVisible();

    // The accessible names carry the position — orientation feedback in
    // the ONE name the screen reader speaks.
    const moveDown = entryRow(page, ARTICLE_TITLE).getByRole("button", {
      name: `Move ${ARTICLE_TITLE} down — position 1 of 2`,
    });
    await expect(
      entryRow(page, ARTICLE_TITLE).getByRole("button", {
        name: `Move ${ARTICLE_TITLE} up — position 1 of 2`,
      }),
    ).toBeDisabled();
    await expect(
      entryRow(page, BOOK_TITLE).getByRole("button", {
        name: `Move ${BOOK_TITLE} down — position 2 of 2`,
      }),
    ).toBeDisabled();

    // KEYBOARD: focus the first row's Move down control, press Enter.
    await moveDown.focus();
    await page.keyboard.press("Enter");

    // The ONE polite region announces the outcome WITH the new position.
    await expect(
      page.getByText(`Moved down — “${ARTICLE_TITLE}” is now position 2 of 2.`),
    ).toBeVisible();
    // The order flipped.
    await expect(entries.nth(0).getByRole("link", { name: BOOK_TITLE })).toBeVisible();
    await expect(entries.nth(1).getByRole("link", { name: ARTICLE_TITLE })).toBeVisible();
    // FOCUS STAYS on the moved entry — the entry landed LAST so its Move
    // down disabled itself (Chromium blurs a freshly-disabled control),
    // and the handoff lands its OPPOSITE control: the enabled Move up.
    const movedRow = entryRow(page, ARTICLE_TITLE);
    await expect(
      movedRow.getByRole("button", { name: `Move ${ARTICLE_TITLE} up — position 2 of 2` }),
    ).toBeFocused();
    await expect(
      movedRow.getByRole("button", { name: `Move ${ARTICLE_TITLE} down — position 2 of 2` }),
    ).toBeDisabled();
    // PERSISTENCE: the flipped order survives a reload.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Order practice" })).toBeVisible();
    await expect(page.locator(".collection-entry")).toHaveCount(2);
    await expect(
      page.locator(".collection-entry").nth(0).getByRole("link", { name: BOOK_TITLE }),
    ).toBeVisible();
    await expect(
      page.locator(".collection-entry").nth(1).getByRole("link", { name: ARTICLE_TITLE }),
    ).toBeVisible();
  });

  test("pointer reorder: click moves the last entry up; boundary controls stay disabled (DISC-243-02)", async ({
    page,
  }) => {
    await seedLibrary(page);
    await createCollectionWith(page, "Click order", [ARTICLE_TITLE, BOOK_TITLE]);
    const entries = page.locator(".collection-entry");

    // POINTER: click the SECOND (last) row's Move up control.
    await entryRow(page, BOOK_TITLE)
      .getByRole("button", { name: `Move ${BOOK_TITLE} up — position 2 of 2` })
      .click();

    await expect(
      page.getByText(`Moved up — “${BOOK_TITLE}” is now position 1 of 2.`),
    ).toBeVisible();
    await expect(entries.nth(0).getByRole("link", { name: BOOK_TITLE })).toBeVisible();
    // The same control now sits at position 1 with Move up disabled (the
    // first-row boundary), and the article's Move up re-enabled.
    await expect(
      entryRow(page, BOOK_TITLE).getByRole("button", {
        name: "Move Collected Harbor Works up — position 1 of 2",
      }),
    ).toBeDisabled();
    await expect(
      entryRow(page, ARTICLE_TITLE).getByRole("button", {
        name: `Move ${ARTICLE_TITLE} up — position 2 of 2`,
      }),
    ).toBeEnabled();
  });

  test("reorder and removal never touch reading state: position restores, highlight renders (DISC-243-03)", async ({
    page,
  }) => {
    // The keeper article's canonical offsets (the resolver's substrate —
    // normalizeText → graphemeClusters — never a hand-counted literal).
    const keeper = makeKeeperArticle();
    const keeperText = normalizeText(keeper);
    const needleStart = keeperText.indexOf(KEEPER_NEEDLE);
    const needleEnd = needleStart + graphemeClusters(KEEPER_NEEDLE, "en").length;
    const keeperTotal = graphemeClusters(keeperText, "en").length;
    // Deep enough that the restore MUST move the viewport (the article is
    // several screenfuls; a mid-article offset can never land at top).
    const deepOffset = Math.floor(keeperTotal * 0.85);

    await seedScrollingMode(page);
    await seedLibrary(page);
    await seedStoreRows(page, "articles", [keeper]);
    // The reading was read INTO and carries a CONFIDENT highlight (the
    // annotation membership edits must never touch).
    await seedLocation(page, KEEPER_ARTICLE_ID, deepOffset, "2026-10-02T08:00:00.000Z");
    await seedHighlightRecord(page, {
      id: "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c",
      articleId: KEEPER_ARTICLE_ID,
      revision: 1,
      position: { start: needleStart, end: needleEnd },
      quote: { prefix: "", exact: KEEPER_NEEDLE, suffix: "" },
      createdAt: "2026-10-01T00:00:00.000Z",
    });
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible();

    // The keeper reading sits in TWO collections; one gets reordered + the
    // entry removed. Neither edit may touch the reading's position or mark.
    await createCollectionWith(page, "Edit target", [KEEPER_TITLE]);
    await createCollectionWith(page, "Keeper", [KEEPER_TITLE]);
    await page.goto(`${BASE}/#/collections`);
    await openCollection(page, "Edit target");
    // Reorder needs a second entry (a sole entry's controls are boundary-
    // disabled): add the book, move the keeper reading down, remove it.
    await page.getByRole("button", { name: "Add readings" }).click();
    const dialog = page.getByRole("dialog");
    await page.fill("#add-reading-search", BOOK_TITLE);
    await dialog.getByRole("button", { name: `Add ${BOOK_TITLE}` }).click();
    await dialog.getByRole("button", { name: "Done" }).click();
    await entryRow(page, KEEPER_TITLE)
      .getByRole("button", { name: new RegExp(`Move ${KEEPER_TITLE} down — position 1 of 2`) })
      .click();
    await expect(
      page.getByText(`Moved down — “${KEEPER_TITLE}” is now position 2 of 2.`),
    ).toBeVisible();
    // REMOVE the keeper entry from this collection.
    await entryRow(page, KEEPER_TITLE)
      .getByRole("button", { name: `Remove ${KEEPER_TITLE} from this collection` })
      .click();
    await expect(
      page.getByText(`Removed “${KEEPER_TITLE}” from this collection. It stays in your library.`),
    ).toBeVisible();
    await expect(page.locator(".collection-entry")).toHaveCount(1);

    // The OTHER collection still holds the reading — open it from there:
    // the shared saved position restores and the highlight still renders
    // CONFIDENTLY (the annotation survived every membership edit).
    await page.goto(`${BASE}/#/collections`);
    await openCollection(page, "Keeper");
    await page.locator(".collection-entry-link", { hasText: KEEPER_TITLE }).click();
    await expect(page).toHaveURL(
      new RegExp(`#/article/${KEEPER_ARTICLE_ID}/col/[a-z0-9-]+/[a-z0-9-]+$`),
    );
    const restored = await restoredScrollY(page);
    expect(restored).toBeGreaterThan(0);
    await assertHighlightMark(page, { excerptSubstring: KEEPER_NEEDLE });
    await expect(page.locator("mark.highlight.unresolved")).toHaveCount(0);
  });

  test("remove entry: preservation announcement, focus hands to the following row's link, other collection keeps the reading (DISC-243-04)", async ({
    page,
  }) => {
    await seedLibrary(page);
    await createCollectionWith(page, "Trim me", [ARTICLE_TITLE, BOOK_TITLE]);
    await createCollectionWith(page, "Shared keeper", [ARTICLE_TITLE]);
    await page.goto(`${BASE}/#/collections`);
    await openCollection(page, "Trim me");
    // REMOVE the first entry (the article) — pointer path.
    await entryRow(page, ARTICLE_TITLE)
      .getByRole("button", { name: `Remove ${ARTICLE_TITLE} from this collection` })
      .click();

    // The announcement names the preservation honestly.
    await expect(
      page.getByText(`Removed “${ARTICLE_TITLE}” from this collection. It stays in your library.`),
    ).toBeVisible();
    // FOCUS HANDOFF: the FOLLOWING row's title link (re-orientation —
    // never a destructive control). The book entry is now first.
    await expect(entryRow(page, BOOK_TITLE).getByRole("link")).toBeFocused();
    // The entry left THIS collection.
    await expect(page.locator(".collection-entry")).toHaveCount(1);

    // MANY-TO-MANY preservation: the second collection still lists the
    // article, and the library still lists it exactly once.
    await page.goto(`${BASE}/#/collections`);
    await openCollection(page, "Shared keeper");
    await expect(page.locator(".collection-entry")).toHaveCount(1);
    await expect(
      entryRow(page, ARTICLE_TITLE).getByRole("link", { name: ARTICLE_TITLE }),
    ).toBeVisible();
    await page.goto(`${BASE}/#/`);
    await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(ARTICLE_TITLE) })).toHaveCount(1);
  });

  test("removing the last entry leaves the honest empty state with focus on the Add affordance (DISC-243-05)", async ({
    page,
  }) => {
    await seedLibrary(page);
    await createCollectionWith(page, "One and only", [ARTICLE_TITLE]);

    await entryRow(page, ARTICLE_TITLE)
      .getByRole("button", { name: `Remove ${ARTICLE_TITLE} from this collection` })
      .click();
    await expect(
      page.getByText(`Removed “${ARTICLE_TITLE}” from this collection. It stays in your library.`),
    ).toBeVisible();
    // The honest empty state + focus on the stable Add affordance (the
    // collection remains an honest usable surface — AC).
    await expect(
      page.getByRole("heading", { level: 2, name: "No readings in this collection yet." }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Add readings" })).toBeFocused();
    // The emptiness persists.
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 2, name: "No readings in this collection yet." }),
    ).toBeVisible();
  });

  test("delete collection: Esc cancels with trigger focus restored; confirm deletes only the collection (DISC-243-06)", async ({
    page,
  }) => {
    await seedLibrary(page);
    // Doomed plan gets its entry added BEFORE the survivor is created, so
    // the recency sort lists Survivor plan FIRST and Doomed plan LAST —
    // the deleted card has a preceding neighbor to hand focus to.
    await createCollectionWith(page, "Doomed plan", [ARTICLE_TITLE]);
    await createCollectionWith(page, "Survivor plan", [ARTICLE_TITLE]);
    await page.goto(`${BASE}/#/collections`);
    const doomedCard = page.locator("li.collection-card", { hasText: "Doomed plan" });
    await expect(doomedCard).toBeVisible();

    // CANCEL: the confirm opens focused on the SAFE action (Keep
    // collection — Pitfall 8); Esc keeps everything.
    await doomedCard.getByRole("button", { name: "Delete", exact: true }).click();
    // role="alertdialog" — the destructive-confirm ARIA role (the
    // BookRemoveConfirm discipline; getByRole("dialog") must not match).
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Keep collection" })).toBeFocused();
    await expect(
      dialog.getByText(
        `Delete Doomed plan? Its 1 reading stays in your library, with its highlights, notes, and progress.`,
      ),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(doomedCard).toBeVisible();
    await expect(page.locator("li.collection-card")).toHaveCount(2);

    // CONFIRM: the destructive button is the ONLY deleteCollection call
    // site (Pitfall 8); deleting the collection preserves the reading.
    await doomedCard.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("button", { name: "Delete collection", exact: true }).click();
    // The announcement names the preservation; the list reloaded without
    // the doomed card.
    await expect(
      page.getByText(`Deleted “Doomed plan”. Its readings stay in your library.`),
    ).toBeVisible();
    await expect(page.locator("li.collection-card")).toHaveCount(1);
    // FOCUS HANDOFF: the preceding neighbor card's title link.
    await expect(page.getByRole("link", { name: "Survivor plan" })).toBeFocused();
    // And the deletion persists.
    await page.reload();
    await expect(page.getByRole("link", { name: "Doomed plan" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Survivor plan" })).toBeVisible();
  });

  test("deleting the last collection lands focus on the New collection input beside the honest no-content state (DISC-243-07)", async ({
    page,
  }) => {
    await seedLibrary(page);
    await createCollectionWith(page, "Last plan", [ARTICLE_TITLE]);
    await page.goto(`${BASE}/#/collections`);

    await page
      .locator("li.collection-card", { hasText: "Last plan" })
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await page.getByRole("button", { name: "Delete collection", exact: true }).click();
    await expect(
      page.getByText(`Deleted “Last plan”. Its readings stay in your library.`),
    ).toBeVisible();
    // The honest no-content state returns, and focus lands on the always-
    // visible first action (never a dead focus, never a destructive
    // control).
    await expect(
      page.getByRole("heading", { level: 2, name: "No collections yet." }),
    ).toBeVisible();
    await expect(page.getByLabel("New collection")).toBeFocused();
    // THE PRESERVATION LINE the whole issue rides on: the reading remains
    // in the library after its every collection is gone.
    await page.goto(`${BASE}/#/`);
    await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(ARTICLE_TITLE) })).toHaveCount(1);
  });

  test("transaction failures: honest announcements, intact state, working retry (DISC-243-08)", async ({
    page,
  }) => {
    await seedLibrary(page);
    await createCollectionWith(page, "Fragile plan", [ARTICLE_TITLE, BOOK_TITLE]);

    // Install the ONE-SHOT sabotage (the installHighlightDeleteSabotage
    // twin aimed at the `collections` store): patch IDBObjectStore.put /
    // .delete so an ARMED next write on that store aborts its transaction
    // in a microtask. Everything above the final IDB write runs
    // UNMODIFIED — the real Dexie transaction rejects, the real seam
    // propagates, the view's honest-failure path renders end-to-end.
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      if (w.__armCollectionsPutFailure !== undefined) return;
      const state = { putArmed: false, deleteArmed: false };
      w.__armCollectionsPutFailure = () => {
        state.putArmed = true;
      };
      w.__armCollectionsDeleteFailure = () => {
        state.deleteArmed = true;
      };
      const originalPut = IDBObjectStore.prototype.put;
      const originalDelete = IDBObjectStore.prototype.delete;
      IDBObjectStore.prototype.put = function (...keys: unknown[]) {
        const request = originalPut.apply(this, keys as Parameters<typeof originalPut>);
        if (state.putArmed && this.name === "collections") {
          state.putArmed = false;
          const tx = this.transaction;
          void Promise.resolve().then(() => {
            try {
              tx.abort();
            } catch {
              /* already settled — nothing to sabotage */
            }
          });
        }
        return request;
      };
      IDBObjectStore.prototype.delete = function (...keys: unknown[]) {
        const request = originalDelete.apply(this, keys as Parameters<typeof originalDelete>);
        if (state.deleteArmed && this.name === "collections") {
          state.deleteArmed = false;
          const tx = this.transaction;
          void Promise.resolve().then(() => {
            try {
              tx.abort();
            } catch {
              /* already settled — nothing to sabotage */
            }
          });
        }
        return request;
      };
    });
    const armPut = () =>
      page.evaluate(() => {
        (
          window as unknown as { __armCollectionsPutFailure?: () => void }
        ).__armCollectionsPutFailure?.();
      });
    const armDelete = () =>
      page.evaluate(() => {
        (
          window as unknown as { __armCollectionsDeleteFailure?: () => void }
        ).__armCollectionsDeleteFailure?.();
      });

    const entries = page.locator(".collection-entry");

    // MOVE failure: the abort rolls the reorder back — the announcement is
    // the honest error, the seeded order is untouched, and the pressed
    // control keeps focus for retry.
    await armPut();
    const retryMove = entryRow(page, BOOK_TITLE).getByRole("button", {
      name: `Move ${BOOK_TITLE} up — position 2 of 2`,
    });
    await retryMove.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(`Couldn't move “${BOOK_TITLE}”. Try again.`)).toBeVisible();
    await expect(retryMove).toBeFocused();
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0).getByRole("link", { name: ARTICLE_TITLE })).toBeVisible();

    // The calm next step WORKS without finding the control again.
    await page.keyboard.press("Enter");
    await expect(
      page.getByText(`Moved up — “${BOOK_TITLE}” is now position 1 of 2.`),
    ).toBeVisible();

    // REMOVE failure: the abort leaves the entry in place, honestly named.
    await armPut();
    const retryRemove = entryRow(page, ARTICLE_TITLE).getByRole("button", {
      name: `Remove ${ARTICLE_TITLE} from this collection`,
    });
    await retryRemove.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(`Couldn't remove “${ARTICLE_TITLE}”. Try again.`)).toBeVisible();
    await expect(retryRemove).toBeFocused();
    await expect(entries).toHaveCount(2);

    // DELETE failure: the confirm dialog STAYS OPEN with its error line —
    // never a success lie (issue #98); canceling then leaves the
    // collection card in place.
    await page.goto(`${BASE}/#/collections`);
    await page
      .locator("li.collection-card", { hasText: "Fragile plan" })
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    const alert = page.getByRole("alertdialog");
    await expect(alert).toBeVisible();
    await armDelete();
    await page.getByRole("button", { name: "Delete collection", exact: true }).click();
    await expect(alert.getByText("Couldn't delete this collection. Try again.")).toBeVisible();
    await expect(alert).toBeVisible(); // open — the reader can retry or cancel
    await page.keyboard.press("Escape");
    await expect(alert).not.toBeVisible();
    await expect(page.locator("li.collection-card", { hasText: "Fragile plan" })).toBeVisible();
  });

  test("release gate: pointer create + rename, keyboard remove + delete — the input-method matrix closes (REL-250)", async ({
    page,
  }) => {
    // The acceptance gate names SIX operations demonstrated with pointer
    // AND keyboard. The shipped cells cover: create ⌨ (DISC-242-02),
    // rename ⌨ (DISC-242-03), populate pointer+⌨ (DISC-242-04 + the
    // focus-walk adds), reorder pointer+⌨ (DISC-243-01/02), remove
    // pointer (DISC-243-04/05), delete pointer + Esc ⌨ (DISC-243-06/07).
    // This cell closes the remaining four quadrants: POINTER create,
    // POINTER rename (the forms' submit buttons), and KEYBOARD remove,
    // KEYBOARD delete-confirm (Enter on the focused native controls — the
    // same path a screen-reader user takes).
    await seedLibrary(page);

    // POINTER create: fill the input, CLICK the form's Create button —
    // the same prevented-submit path Enter takes, announced identically.
    await page.goto(`${BASE}/#/collections`);
    await expect(page.getByRole("heading", { level: 1, name: "Collections" })).toBeVisible();
    await page.fill("#collections-new-name", "Pointer plan");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByRole("link", { name: "Pointer plan" })).toBeVisible();
    await expect(page.getByText("Created “Pointer plan”.", { exact: true })).toBeVisible();

    // POINTER rename: click the card's Rename, edit, CLICK the dialog's
    // Save button — the form's submit path with the pointer, not Enter.
    await page
      .locator("li.collection-card", { hasText: "Pointer plan" })
      .getByRole("button", { name: "Rename", exact: true })
      .click();
    const renameDialog = page.getByRole("dialog");
    await expect(renameDialog).toBeVisible();
    const nameInput = page.getByRole("textbox", { name: "Name", exact: true });
    await expect(nameInput).toBeFocused();
    await expect(nameInput).toHaveValue("Pointer plan");
    await nameInput.fill("Pointer plan, renamed");
    await renameDialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(renameDialog).not.toBeVisible();
    await expect(page.getByRole("link", { name: "Pointer plan, renamed" })).toBeVisible();
    await expect(
      page.getByText("Renamed to “Pointer plan, renamed”.", { exact: true }),
    ).toBeVisible();

    // KEYBOARD remove: open Add readings with a proven keyboard focus so
    // every engine captures the same opener (Safari does not focus clicked
    // buttons). Dialog invisibility alone precedes the queued close event;
    // restored opener focus observes that the close listener has finished
    // before we focus Remove and press Enter.
    await createCollection(page, "Keyboard exit");
    await openCollection(page, "Keyboard exit");
    const addReadings = page.getByRole("button", { name: "Add readings" });
    await focusWalkStart(page, addReadings);
    await addReadings.press("Enter");
    const addDialog = page.getByRole("dialog");
    await expect(addDialog).toBeVisible();
    await page.fill("#add-reading-search", ARTICLE_TITLE);
    await addDialog.getByRole("button", { name: `Add ${ARTICLE_TITLE}` }).click();
    await addDialog.getByRole("button", { name: "Done" }).click();
    await expect(addDialog).not.toBeVisible();
    await expect(addReadings).toBeFocused();
    await entryRow(page, ARTICLE_TITLE)
      .getByRole("button", { name: `Remove ${ARTICLE_TITLE} from this collection` })
      .press("Enter");
    await expect(
      page.getByText(`Removed “${ARTICLE_TITLE}” from this collection. It stays in your library.`),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "No readings in this collection yet." }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Add readings" })).toBeFocused();

    // KEYBOARD delete: focus the card's Delete trigger, press Enter, and
    // confirm the alertdialog's destructive action the same way. The
    // survivor card remains, so focus lands on ITS title link — the same
    // re-orientation handoff DISC-243-06 documents, now proven under
    // keyboard activation — and the reading itself stays in the library.
    await page.goto(`${BASE}/#/collections`);
    await expect(page.getByRole("heading", { level: 1, name: "Collections" })).toBeVisible();
    await page
      .locator("li.collection-card", { hasText: "Keyboard exit" })
      .getByRole("button", { name: "Delete", exact: true })
      .press("Enter");
    const alert = page.getByRole("alertdialog");
    await expect(alert).toBeVisible();
    await expect(alert.getByRole("button", { name: "Keep collection" })).toBeFocused();
    await alert.getByRole("button", { name: "Delete collection", exact: true }).press("Enter");
    await expect(
      page.getByText(`Deleted “Keyboard exit”. Its readings stay in your library.`),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Keyboard exit" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Pointer plan, renamed" })).toBeFocused();
    await page.goto(`${BASE}/#/`);
    await expect(page.getByRole("link", { name: new RegExp(ARTICLE_TITLE) })).toHaveCount(1);
  });
});
