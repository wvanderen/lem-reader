// tests/e2e/collections/completion.spec.ts
// Issue #246 — the browser seam for SHARED work/chapter completion (the
// acceptance surface the unit suites cannot see — real page turns, real
// scroll geometry, real speech, and cross-route truth):
//
//   - DISC-246-01 — ordinary whole-work paginated reading that TURNS PAST a
//     chapter's end completes that chapter: the TOC marks it Finished, the
//     collection referencing it shows the Finished row + honest progress,
//     and the record survives a reload (shared across ordinary reading and
//     collections; never page-weighted).
//   - DISC-246-02 — reading a chapter ASSIGNMENT to its true end completes
//     that chapter for EVERY collection referencing it (cross-collection
//     sharing, no re-read), and the shared saved position stays the
//     assignment's page (never the work's end-pin — completion is not a
//     position write).
//   - DISC-246-03 — a ONE-PAGE assignment does not complete on open (the
//     end card shows immediately, the entry stays unfinished); the explicit
//     Mark-finished correction completes it WITHOUT moving the saved
//     passage position, and the correction survives a reload.
//   - DISC-246-04 — jumping/visiting a LATER chapter fabricates nothing:
//     after a TOC jump the completion store holds no records for the
//     skipped chapters; the explicit correction then completes exactly the
//     named target, position untouched.
//   - DISC-246-05 — an ALREADY-FINISHED target (an end-pinned location from
//     ordinary reading) counts the moment a collection references it (the
//     existing canonical-location contract is the derivation).
//   - DISC-246-06 — BOOK targets aggregate their declared chapters (a book
//     entry is unfinished while any chapter is unread), and a book-level
//     correction overrides — writing exactly ONE record, touching no
//     chapter location.
//   - DISC-246-07 — finishing a chapter assignment BY EAR completes that
//     chapter through the same seam (listening is reading, ADR 0001); the
//     saved position is the chapter's end, never the work's end-pin.
//   - DISC-246-08 — an instant LEAP to the bottom (one scroll event spanning
//     every chapter end) credits only the chapter the reader was in: no
//     bulk-fabricated coverage from a single event.
//   - DISC-246-09 — an UNCOLLECTED work is correctable from ordinary
//     reading: the TOC's per-chapter Mark finished/unfinished control
//     writes the same ONE shared record (and survives a reload).
//
// Harness (REUSE-DO-NOT-FORK): BASE + wipeDatabase (annotations/_fixtures)
// + seedStoreRows (library) + the pagination DEV-harness readiness waits +
// the controllable-fake speechSynthesis (readaloud/_speech). Node-side
// offsets compute through the SAME pure modules the app runs
// (deriveWorkStructure/articleGraphemeIndex/chunkArticleForSpeech) — never
// hand-counted literals.
import { test, expect, type Page } from "@playwright/test";
import { ArticleSchema, BookSchema, CollectionSchema } from "../../../src/content/schema";
import type { CanonicalArticle, Book, CollectionEntryTarget } from "../../../src/content/schema";
import {
  normalizeText,
  graphemeClusters,
  articleGraphemeIndex,
} from "../../../src/content/normalizeText";
import { deriveWorkStructure } from "../../../src/content/structure";
import { chunkArticleForSpeech } from "../../../src/readaloud/chunks";
import { BASE } from "../_base";
import { wipeDatabase } from "../annotations/_fixtures";
import { seedStoreRows } from "../library/seedStoreRows";
import {
  readPagination,
  waitForPaginationSettled,
  waitForPageSettled,
} from "../pagination/_harness";
import { installFakeSpeech } from "../readaloud/_speech";
import { playAndAwaitProbe, readLocationOffset } from "../readaloud/_harness";

// ── Node-side corpus builders (the chapter-assignments corpus shape) ────────

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

/** The structured web work: a multi-page opener, a ONE-PAGE interlude, a
 * long middle, and a short close — every completion shape the AC names. */
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
    ...makeParagraphs(8, "Chapter one."),
    heading("A Brief Interlude"),
    ...makeParagraphs(1, "Interlude."),
    heading("The Long Middle"),
    ...makeParagraphs(70, "Chapter three."),
    heading("The Short Close"),
    ...makeParagraphs(2, "Chapter four."),
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

/** A chapterless essay — the whole-article derived-completion shape. */
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

// The chapter destinations come from the SAME derivation the app runs.
const WORK_STRUCTURE = deriveWorkStructure(WORK)!;
const WORK_CHAPTERS = WORK_STRUCTURE.destinations.filter((d) => d.kind === "chapter");
const [CH_ONE, CH_INTERLUDE, CH_LONG] = WORK_CHAPTERS;
const WORK_TOTAL = articleGraphemeIndex(WORK).totalGraphemes;
const ESSAY_TOTAL = graphemeClusters(normalizeText(ESSAY), ESSAY.lang).length;

// ── The EPUB book (the whole-article chapter targets) ───────────────────────

const BOOK_ID = "epub-bca244aa";
function makeBookChapter(id: string, index: number, seed: string): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      title: `Book Chapter ${index + 1}`,
      retrievedAt: "2026-10-01T00:00:00.000Z",
      originalHtmlHash: `sha256:${"c".repeat(64)}`,
    },
    blocks: makeParagraphs(3, seed),
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
const BOOK_CHAPTER_IDS = ["bca244-c01", "bca244-c02"];
const BOOK_CHAPTERS = BOOK_CHAPTER_IDS.map((id, i) =>
  makeBookChapter(id, i, `Book chapter ${i + 1}.`),
);
const BOOK: Book = BookSchema.parse({
  id: BOOK_ID,
  title: "The Harbor Almanac",
  authors: ["A. Keeper"],
  language: "en",
  chapterArticleIds: BOOK_CHAPTER_IDS,
  skippedChapterCount: 0,
  source: "epub-upload",
  originalFileHash: `sha256:${"d".repeat(64)}`,
  addedAt: "2026-10-01T00:00:00.000Z",
});

// ── Seeders + helpers ───────────────────────────────────────────────────────

async function seedCorpus(page: Page): Promise<void> {
  await seedStoreRows(page, "articles", [WORK, ESSAY, ...BOOK_CHAPTERS]);
  await seedStoreRows(page, "books", [BOOK]);
}

async function seedLocation(page: Page, articleId: string, offset: number, savedAt: string) {
  await seedStoreRows(page, "location", [
    { schemaVersion: 1, articleId, revision: 1, graphemeOffset: offset, savedAt },
  ]);
}

/** Read every completion row back (the transition assertions' ground truth
 * — what PERSISTED, not what a view renders). */
async function readCompletions(page: Page): Promise<{ targetKey: string; finished: boolean }[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows = await new Promise<{ targetKey: string; finished: boolean }[]>(
      (resolve, reject) => {
        const tx = db.transaction("completions", "readonly");
        const req = tx.objectStore("completions").getAll();
        req.onsuccess = () => resolve(req.result as { targetKey: string; finished: boolean }[]);
        req.onerror = () => reject(req.error);
      },
    );
    db.close();
    // Strip to the identity + truth (the rows carry schema/target/source/
    // updatedAt the assertions don't pin).
    return rows.map((r) => ({ targetKey: r.targetKey, finished: r.finished }));
  });
}

/** Raw collection-row seed with typed entries (the UI can only add
 * VALIDATED targets — these tests plant the rows directly to compose the
 * exact reference shapes under test). Returns the collection id. */
async function seedCollection(
  page: Page,
  name: string,
  id: string,
  targets: CollectionEntryTarget[],
): Promise<string> {
  const now = "2026-10-01T00:00:00.000Z";
  const row = CollectionSchema.parse({
    schemaVersion: 1,
    id,
    name,
    entries: targets.map((target, i) => ({
      id: `${id}-entry-${i}`,
      target,
      addedAt: now,
    })),
    createdAt: now,
    updatedAt: now,
  });
  await page.evaluate((raw) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("lem-reader");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("collections", "readwrite");
        tx.objectStore("collections").put(raw);
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
  }, row);
  return id;
}

/** Open a collection's detail view and wait for the ready rows. */
async function openCollection(page: Page, id: string, name: string): Promise<void> {
  await page.goto(`${BASE}/#/collections/${id}`);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.locator(".collection-entry-link").first()).toBeVisible();
}

/** The completion correction control for one reading (the accessible name
 * carries the entry title — the ONE name the screen reader speaks). */
function completionButton(page: Page, label: string, title: string) {
  return page.getByRole("button", { name: `${label}: ${title}` });
}

/** Seed scrolling-mode prefs (the chapter-assignments shape) — the
 * scroll-leap legs read in scrolling mode. */
async function seedScrollingMode(page: Page): Promise<void> {
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("settings")) {
          db.close();
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
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
      };
      req.onerror = () => resolve();
    });
  });
}

/** Wait for the debounced location save to land (1200ms debounce — poll,
 * never sleep). */
async function expectSavedLocation(page: Page, articleId: string): Promise<number> {
  await expect.poll(() => readLocationOffset(page, articleId), { timeout: 15_000 }).not.toBeNull();
  return (await readLocationOffset(page, articleId))!;
}

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
  // Remount AFTER the wipe so the app recreates the Dexie schema (raw
  // seeding into a wiped browser context would build a schema-less
  // database — the chapter-assignments precedent).
  await page.goto(`${BASE}/#/`);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible();
  await seedCorpus(page);
});

test("ordinary whole-work reading past a chapter's end completes it for the collection too (DISC-246-01)", async ({
  page,
}) => {
  const planId = await seedCollection(page, "Shared plan", "plan-shared", [
    { kind: "work-chapter", articleId: WORK.id, destinationId: CH_ONE!.id },
    { kind: "work-chapter", articleId: WORK.id, destinationId: CH_INTERLUDE!.id },
  ]);

  // Ordinary whole-work reading, paginated: turn until the anchor crosses
  // chapter one's canonical end.
  await page.goto(`${BASE}/#/article/${WORK.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "The Tide Ledger" })).toBeVisible();
  await waitForPaginationSettled(page);
  const crossed = await test.step("turn past the chapter end", async () => {
    for (let i = 0; i < 40; i++) {
      const dev = await readPagination(page);
      if (!dev) break;
      if ((dev.anchorOffset ?? 0) >= CH_ONE!.endOffset) return true;
      await page.keyboard.press("ArrowRight");
      await waitForPageSettled(page, dev.currentPageIdx + 1);
    }
    return false;
  });
  expect(crossed).toBe(true);
  // The debounced position save lands while still mounted (unmount cancels
  // pending debounces — the useScrollSave discipline), and the traversal
  // never end-pins the WORK.
  const savedMid = await expectSavedLocation(page, WORK.id);
  expect(savedMid).toBeLessThan(WORK_TOTAL);

  // The TOC marks the traversed chapter — and ONLY that chapter.
  await page.getByRole("button", { name: "Table of contents" }).click();
  const toc = page.getByRole("navigation", { name: "Table of contents" });
  await expect(toc.locator("a", { hasText: "Opening Arguments" })).toContainText("Finished");
  await expect(toc.locator("a", { hasText: "A Brief Interlude" })).not.toContainText("Finished");
  await page.keyboard.press("Escape");

  // The shared truth reaches the collection referencing that chapter: the
  // Finished row, the honest per-entry control, and the ENTRY-COUNTED
  // progress (never page- or length-weighted).
  await openCollection(page, planId, "Shared plan");
  await expect(page.locator(".collection-entry-finished", { hasText: "Finished" })).toHaveText(
    "Finished",
  );
  await expect(page.locator(".collection-progress")).toHaveText("1 of 2 finished");
  await expect(completionButton(page, "Mark unfinished", "Opening Arguments")).toBeVisible();
  await expect(completionButton(page, "Mark finished", "A Brief Interlude")).toBeVisible();

  // The persisted truth survives a reload (honest persistence, not view
  // state).
  await page.goto(`${BASE}/#/article/${WORK.id}`);
  await page.reload();
  await page.getByRole("button", { name: "Table of contents" }).click();
  await expect(
    page.getByRole("navigation", { name: "Table of contents" }).locator("a", {
      hasText: "Opening Arguments",
    }),
  ).toContainText("Finished");
  const records = await readCompletions(page);
  expect(records).toEqual([{ targetKey: `work-chapter:${WORK.id}/${CH_ONE!.id}`, finished: true }]);
});

test("an assignment read to its true end completes the chapter in EVERY referencing collection (DISC-246-02)", async ({
  page,
}) => {
  const alpha = await seedCollection(page, "Alpha", "plan-alpha", [
    { kind: "work-chapter", articleId: WORK.id, destinationId: CH_ONE!.id },
  ]);
  const beta = await seedCollection(page, "Beta", "plan-beta", [
    { kind: "work-chapter", articleId: WORK.id, destinationId: CH_ONE!.id },
  ]);

  // Open the assignment and walk it to the TRUE end (the end card).
  await page.goto(`${BASE}/#/article/${WORK.id}/c/${CH_ONE!.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "The Tide Ledger" })).toBeVisible();
  await waitForPaginationSettled(page);
  let lastAnchor = 0;
  for (let i = 0; i < 40; i++) {
    const dev = await readPagination(page);
    if (!dev) break;
    lastAnchor = dev.anchorOffset ?? lastAnchor;
    if (dev.currentPageIdx >= dev.pagesLength - 1) break;
    await page.keyboard.press("ArrowRight");
    await waitForPageSettled(page, dev.currentPageIdx + 1);
  }
  await expect(page.getByRole("navigation", { name: "End of this chapter" })).toContainText(
    "End of “Opening Arguments”.",
  );
  // The debounced position save lands while still mounted.
  const saved = await expectSavedLocation(page, WORK.id);
  expect(saved).toBeLessThan(CH_ONE!.endOffset);
  expect(saved).toBeLessThan(WORK_TOTAL);
  expect(lastAnchor).toBeGreaterThan(0);

  // BOTH collections share the one completion — no re-read needed.
  for (const plan of [
    { id: alpha, name: "Alpha" },
    { id: beta, name: "Beta" },
  ]) {
    await openCollection(page, plan.id, plan.name);
    await expect(page.locator(".collection-progress")).toHaveText("1 of 1 finished");
    await expect(page.locator(".collection-entry-finished")).toHaveText("Finished");
  }
});

test("a one-page assignment does not complete on open; the explicit correction completes it without moving the position (DISC-246-03)", async ({
  page,
}) => {
  const planId = await seedCollection(page, "Interlude plan", "plan-interlude", [
    { kind: "work-chapter", articleId: WORK.id, destinationId: CH_INTERLUDE!.id },
  ]);
  // A saved position INSIDE the one-page chapter — the correction must
  // leave it exactly where it is.
  const savedInside = CH_INTERLUDE!.startOffset + 10;
  await seedLocation(page, WORK.id, savedInside, "2026-10-01T09:00:00.000Z");

  // Open the assignment: the end card shows IMMEDIATELY (one page), and
  // nothing completed — opening is not reading.
  await page.goto(`${BASE}/#/article/${WORK.id}/c/${CH_INTERLUDE!.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "The Tide Ledger" })).toBeVisible();
  await waitForPaginationSettled(page);
  await expect(page.getByRole("navigation", { name: "End of this chapter" })).toContainText(
    "End of “A Brief Interlude”.",
  );
  expect(await readCompletions(page)).toEqual([]);

  await openCollection(page, planId, "Interlude plan");
  await expect(page.locator(".collection-progress")).toHaveText("0 of 1 finished");
  await expect(page.locator(".collection-entry-finished")).toHaveCount(0);

  // The explicit correction completes the chapter…
  await completionButton(page, "Mark finished", "A Brief Interlude").click();
  await expect(page.locator(".collection-progress")).toHaveText("1 of 1 finished");
  await expect(page.locator(".collection-entry-finished")).toHaveText("Finished");
  // …announces the landed outcome politely, writes ONE record, and never
  // moves the saved passage position (ADR 0001).
  await expect(page.getByText("Marked “A Brief Interlude” finished.")).toBeVisible();
  expect(await readCompletions(page)).toEqual([
    { targetKey: `work-chapter:${WORK.id}/${CH_INTERLUDE!.id}`, finished: true },
  ]);
  await expect.poll(() => readLocationOffset(page, WORK.id), { timeout: 15_000 }).toBe(savedInside);

  // The correction survives a reload.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Interlude plan" })).toBeVisible();
  await expect(page.locator(".collection-progress")).toHaveText("1 of 1 finished");
});

test("jumping to a later chapter fabricates nothing; the correction names exactly one target (DISC-246-04)", async ({
  page,
}) => {
  const planId = await seedCollection(page, "Skip plan", "plan-skip", [
    { kind: "work-chapter", articleId: WORK.id, destinationId: CH_INTERLUDE!.id },
    { kind: "work-chapter", articleId: WORK.id, destinationId: CH_LONG!.id },
  ]);

  await page.goto(`${BASE}/#/article/${WORK.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "The Tide Ledger" })).toBeVisible();
  await waitForPaginationSettled(page);

  // TOC jump straight to chapter three — chapters one and two were never
  // read, and the jump must not prove otherwise.
  await page.getByRole("button", { name: "Table of contents" }).click();
  const toc = page.getByRole("navigation", { name: "Table of contents" });
  await toc.locator("a", { hasText: "The Long Middle" }).click();
  await expect(
    page
      .locator("[data-block-index]:not(.article-body-measurement *)", {
        hasText: "The Long Middle",
      })
      .first(),
  ).toBeFocused({ timeout: 15_000 });
  expect(await readCompletions(page)).toEqual([]);
  // The landing position saves while still mounted (unmount cancels
  // pending debounces) — the jump's page anchor, never the work's end-pin.
  const jumpLanded = await expectSavedLocation(page, WORK.id);
  expect(jumpLanded).toBeGreaterThan(0);
  expect(jumpLanded).toBeLessThan(WORK_TOTAL);

  // The collection still shows honest zero progress.
  await openCollection(page, planId, "Skip plan");
  await expect(page.locator(".collection-progress")).toHaveText("0 of 2 finished");

  // The explicit correction names exactly ONE target; the skipped sibling
  // stays unfinished and the jump landing position is untouched.
  await completionButton(page, "Mark finished", "A Brief Interlude").click();
  await expect(page.locator(".collection-progress")).toHaveText("1 of 2 finished");
  expect(await readCompletions(page)).toEqual([
    { targetKey: `work-chapter:${WORK.id}/${CH_INTERLUDE!.id}`, finished: true },
  ]);
  // The correction never moved the saved passage position (still the jump
  // landing's page anchor, never re-pinned).
  const savedAfterCorrection = await expectSavedLocation(page, WORK.id);
  expect(savedAfterCorrection).toBe(jumpLanded);
});

test("an already-finished target counts the moment a collection references it (DISC-246-05)", async ({
  page,
}) => {
  // The essay was finished in ORDINARY reading (the canonical end-pin).
  await seedLocation(page, ESSAY.id, ESSAY_TOTAL, "2026-10-01T08:00:00.000Z");
  const planId = await seedCollection(page, "Already read", "plan-already", [
    { kind: "article", articleId: ESSAY.id },
  ]);

  await openCollection(page, planId, "Already read");
  await expect(page.locator(".collection-progress")).toHaveText("1 of 1 finished");
  await expect(page.locator(".collection-entry-finished")).toHaveText("Finished");
  // Derived from the location contract — no completion record was needed.
  expect(await readCompletions(page)).toEqual([]);
});

test("a book entry aggregates its declared chapters; a book correction writes one record (DISC-246-06)", async ({
  page,
}) => {
  // Chapter one read to its end; chapter two untouched.
  const chapterOne = BOOK_CHAPTERS[0]!;
  const chapterOneTotal = graphemeClusters(normalizeText(chapterOne), chapterOne.lang).length;
  await seedLocation(page, BOOK_CHAPTER_IDS[0]!, chapterOneTotal, "2026-10-01T08:00:00.000Z");
  const planId = await seedCollection(page, "Almanac plan", "plan-almanac", [
    { kind: "book", bookId: BOOK.id },
    { kind: "book-chapter", bookId: BOOK.id, articleId: BOOK_CHAPTER_IDS[1]! },
  ]);

  await openCollection(page, planId, "Almanac plan");
  // One of two chapters read: the book entry is honestly unfinished, and
  // the untouched chapter entry (referenced directly) is unfinished too.
  await expect(page.locator(".collection-progress")).toHaveText("0 of 2 finished");
  await expect(page.locator(".collection-entry-finished")).toHaveCount(0);

  // The book-level correction overrides the aggregate for the BOOK entry —
  // one record, and the untouched chapter's entry stays honestly unfinished
  // (the correction names the book, not its chapters).
  await completionButton(page, "Mark finished", "The Harbor Almanac").click();
  await expect(page.locator(".collection-progress")).toHaveText("1 of 2 finished");
  const bookRow = page.locator(".collection-entry", { hasText: "The Harbor Almanac" });
  const chapterRow = page.locator(".collection-entry", { hasText: "Book Chapter 2" });
  await expect(bookRow.locator(".collection-entry-finished")).toHaveText("Finished");
  await expect(chapterRow.locator(".collection-entry-finished")).toHaveCount(0);
  await expect(completionButton(page, "Mark unfinished", "The Harbor Almanac")).toBeVisible();
  expect(await readCompletions(page)).toEqual([{ targetKey: `book:${BOOK.id}`, finished: true }]);
  // The untouched chapter never gained a location (the correction moves
  // nothing).
  expect(await readLocationOffset(page, BOOK_CHAPTER_IDS[1]!)).toBeNull();
});

test("finishing a chapter assignment by ear completes that chapter (DISC-246-07)", async ({
  page,
}) => {
  const planId = await seedCollection(page, "Spoken plan", "plan-spoken", [
    { kind: "work-chapter", articleId: WORK.id, destinationId: CH_ONE!.id },
  ]);
  // The fake must be installed BEFORE the document it speaks in loads —
  // register first, then reload (a hash-only goto would keep the
  // pre-fake document alive — the read-aloud harness's load-bearing note).
  await installFakeSpeech(page, "word");
  await seedLocation(page, WORK.id, 0, "2026-10-01T08:00:00.000Z");
  await page.reload();
  await page.goto(`${BASE}/#/article/${WORK.id}/c/${CH_ONE!.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "The Tide Ledger" })).toBeVisible();
  await playAndAwaitProbe(page);

  // Drain the session to its finish — the chunker is clipped to the chapter.
  const chOneChunks = chunkArticleForSpeech(WORK, {
    start: CH_ONE!.startOffset,
    end: CH_ONE!.endOffset,
  });
  await expect
    .poll(
      () =>
        page.evaluate((target) => {
          const w = window as unknown as {
            __speechAdvance: () => string | null;
            __speechSpoken: { text: string; done: boolean; volume: number }[];
          };
          for (let i = 0; i < 8; i++) {
            if (w.__speechSpoken.some((r) => r.volume === 1 && r.done && r.text === target)) {
              return "done";
            }
            w.__speechAdvance();
          }
          return "draining";
        }, chOneChunks.at(-1)!.text),
      { timeout: 60_000, intervals: [50] },
    )
    .toBe("done");
  await expect(page.getByText("Read aloud finished.")).toBeVisible();

  // The completion landed through the same seam the page-turn finish uses.
  expect(await readCompletions(page)).toEqual([
    { targetKey: `work-chapter:${WORK.id}/${CH_ONE!.id}`, finished: true },
  ]);
  // The saved position is the ASSIGNMENT's end — never the work's end-pin.
  const saved = await expectSavedLocation(page, WORK.id);
  expect(saved).toBe(CH_ONE!.endOffset);
  expect(saved).toBeLessThan(WORK_TOTAL - 1);

  // And the collection referencing the chapter shares it.
  await openCollection(page, planId, "Spoken plan");
  await expect(page.locator(".collection-progress")).toHaveText("1 of 1 finished");
});

test("a navigation leap proves nothing; a genuine scroll traversal does (DISC-246-08)", async ({
  page,
}) => {
  const planId = await seedCollection(page, "Leap plan", "plan-leap", [
    { kind: "work-chapter", articleId: WORK.id, destinationId: CH_ONE!.id },
    { kind: "work-chapter", articleId: WORK.id, destinationId: CH_INTERLUDE!.id },
    { kind: "work-chapter", articleId: WORK.id, destinationId: CH_LONG!.id },
  ]);
  await seedScrollingMode(page);
  await page.reload();
  await page.goto(`${BASE}/#/article/${WORK.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "The Tide Ledger" })).toBeVisible();
  await expect(page.locator(".article-body")).toBeVisible({ timeout: 15_000 });

  // The End key is a NAVIGATION leap to the document end: its animated
  // scroll stream crosses every chapter end, and crediting any of them
  // would fabricate the traversal the AC forbids. Nothing completes.
  await page.keyboard.press("End");
  await page.waitForTimeout(1500); // the animated stream + a debounce window
  expect(await readCompletions(page)).toEqual([]);

  // Home is the same navigation contract in reverse (also nothing).
  await page.keyboard.press("Home");
  await page.waitForTimeout(400);

  // A genuine wheel traversal THROUGH chapter one credits exactly that
  // chapter — the reading move the completion contract exists for.
  for (let i = 0; i < 14; i++) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(120);
    const done = await readCompletions(page);
    if (done.some((r) => r.targetKey === `work-chapter:${WORK.id}/${CH_ONE!.id}`)) break;
  }
  const records = await readCompletions(page);
  expect(records).toEqual([{ targetKey: `work-chapter:${WORK.id}/${CH_ONE!.id}`, finished: true }]);

  // The collection's entry-counted truth agrees: one of three.
  await openCollection(page, planId, "Leap plan");
  await expect(page.locator(".collection-progress")).toHaveText("1 of 3 finished");
});

test("an uncollected work can be corrected from ordinary reading (DISC-246-09)", async ({
  page,
}) => {
  await page.goto(`${BASE}/#/article/${WORK.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "The Tide Ledger" })).toBeVisible();
  await expect(page.locator(".article-body")).toBeVisible({ timeout: 15_000 });

  // The TOC's per-chapter correction: the explicit control in ordinary
  // reading (the same ONE shared record the collection rows write).
  await page.getByRole("button", { name: "Table of contents" }).click();
  const toc = page.getByRole("navigation", { name: "Table of contents" });
  const interludeRow = toc.locator("li", { hasText: "A Brief Interlude" });
  await interludeRow.getByRole("button", { name: "Mark finished: A Brief Interlude" }).click();
  await expect(
    interludeRow.getByRole("button", { name: "Mark unfinished: A Brief Interlude" }),
  ).toBeVisible();
  expect(await readCompletions(page)).toEqual([
    { targetKey: `work-chapter:${WORK.id}/${CH_INTERLUDE!.id}`, finished: true },
  ]);

  // The TOC mark rode the same write, and a reload shows the persisted truth.
  await expect(interludeRow.locator("a")).toContainText("Finished");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "The Tide Ledger" })).toBeVisible();
  await expect(page.locator(".article-body")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Table of contents" }).click();
  await expect(
    page
      .getByRole("navigation", { name: "Table of contents" })
      .locator("li", { hasText: "A Brief Interlude" })
      .getByRole("button", { name: "Mark unfinished: A Brief Interlude" }),
  ).toBeVisible();
});
