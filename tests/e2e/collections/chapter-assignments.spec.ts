// tests/e2e/collections/chapter-assignments.spec.ts
// Issue #244 — the browser seam for CHAPTER-ONLY collection assignments
// (the acceptance surface the unit suites cannot see — layout truth, speech
// truth, and focus truth live here):
//
//   - DISC-244-01 — the picker offers VALIDATED chapter targets (the work's
//     chapter destinations; the book's EXISTING chapter articles); a
//     chapterless work offers none; added chapter entries carry the parent
//     in the kind line, open the /c/ routes, and the exact-same-target
//     refusal shows the calm "Added" mark.
//   - DISC-244-02 — the resume gate (web work, scrolling): a saved position
//     OUTSIDE the assigned chapter lands at the chapter's beginning (focus
//     on its opening heading, no restoration marker); a position INSIDE
//     restores normally (the marker claims it, no focus steal). Direct
//     deep-links to the /c/ route pin the URL grammar.
//   - DISC-244-03 — paginated reading STAYS WITHIN the assignment: internal
//     layout-window turns never leave it (the window scope moves inside the
//     chapter), the end card is the assignment's explicit
//     continue-the-work option (never an automatic crossing), the turn past
//     the end is refused, Mark read and close stays off a mid-work chapter,
//     and Continue lands past the chapter with the next chapter's heading
//     focused.
//   - DISC-244-04 — an OVERSIZED assigned chapter (multi-window): the same
//     stay-within guarantee across its internal window crossings.
//   - DISC-244-05 — a ONE-PAGE assigned chapter: the assignment's end is
//     the open itself; the end card shows immediately and the forward turn
//     is refused.
//   - DISC-244-06 — an EPUB book-chapter assignment: the whole-article
//     scope replaces the ordinary Next chapter link with the explicit
//     continue option; the ordinary (unassigned) open keeps it — ordinary
//     whole-work reading unchanged.
//   - DISC-244-07 — the SPEECH boundary (web work): the assignment's
//     session speaks ONLY the assigned chapter's text and finishes through
//     the ONE completion seam; the saved position is the chapter's end,
//     never the work's end-pin (finishing chapter one by ear must not
//     finish the work).
//   - DISC-244-08 — the SPEECH boundary (EPUB): a chapter assignment stops
//     at the chapter's end rather than following the whole-work handoff.
//   - DISC-244-09 — a STALE destination (a re-ingest moved the ranges)
//     renders honestly unlinked — never a silent whole-work open.
//   - DISC-244-10 — annotations are untouched by the assignment scope: a
//     seeded highlight inside the assigned chapter renders, and the
//     annotations badge counts it (no substitute article, no reattachment).
//
// Harness (REUSE-DO-NOT-FORK): BASE + wipeDatabase (annotations/_fixtures)
// + seedStoreRows (library) + the pagination DEV-harness readiness waits +
// the controllable-fake speechSynthesis (readaloud/_speech). Node-side
// offsets compute through the SAME pure modules the app runs
// (deriveWorkStructure/articleGraphemeIndex/chunkArticleForSpeech) — never
// hand-counted literals.
import { test, expect, type Page } from "@playwright/test";
import { ArticleSchema, BookSchema, CollectionSchema } from "../../../src/content/schema";
import type { CanonicalArticle, Book } from "../../../src/content/schema";
import {
  normalizeText,
  graphemeClusters,
  articleGraphemeIndex,
} from "../../../src/content/normalizeText";
import { deriveWorkStructure } from "../../../src/content/structure";
import { chunkArticleForSpeech } from "../../../src/readaloud/chunks";
import { BASE } from "../_base";
import { wipeDatabase, assertHighlightMark, seedHighlightRecord } from "../annotations/_fixtures";
import { seedStoreRows } from "../library/seedStoreRows";
import {
  readPagination,
  waitForPaginationSettled,
  waitForPageSettled,
} from "../pagination/_harness";
import { installFakeSpeech } from "../readaloud/_speech";
import { playAndAwaitProbe, readLocationOffset } from "../readaloud/_harness";

// ── Node-side corpus builders (shipped schemas only) ────────────────────────

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

/** The structured web work: three h2 chapters — a multi-page opener, an
 * OVERSIZED middle (multi-window at any geometry), and a ONE-PAGE close. */
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

/** A chapterless essay — the picker's honest no-chapter shape. */
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

/** Raw collection-row seed (the stale-destination leg builds its row here —
 * the UI can only add VALIDATED targets, so the stale shape must come in
 * through the same raw-IndexedDB seam the corpus uses). */
async function seedCollectionRow(page: Page, row: unknown): Promise<void> {
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
}

/** Create a collection through the keyboard UI, then add readings through
 * the picker. Returns nothing — the caller drives rows by title. */
async function createCollectionViaUi(page: Page, name: string): Promise<void> {
  await page.goto(`${BASE}/#/collections`);
  await expect(page.getByRole("heading", { level: 1, name: "Collections" })).toBeVisible();
  await page.fill("#collections-new-name", name);
  await page.press("#collections-new-name", "Enter");
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

async function addViaPicker(page: Page, buttonName: string): Promise<void> {
  const opener = page.getByRole("button", { name: "Add readings" });
  const needsOpen = (await opener.count()) > 0;
  if (needsOpen) await opener.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Search by the ROW title (the parenthetical kind suffix never matches).
  const query = buttonName.replace(/^Add /, "").replace(/ \(.*\)$/, "");
  await page.fill("#add-reading-search", query);
  await dialog.getByRole("button", { name: buttonName }).click();
  await expect(dialog.getByText("Added", { exact: true }).first()).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).not.toBeVisible();
}

/** The assignment end card (both placements share the role + line). */
function endCard(page: Page) {
  return page.getByRole("navigation", { name: "End of this chapter" });
}

/** Walk the assignment forward one turn at a time until the last page
 * commits (bounded — the assertion is where it STOPS, never how fast). */
async function turnToEnd(page: Page, cap = 120): Promise<void> {
  for (let i = 0; i < cap; i++) {
    const dev = await readPagination(page);
    if (!dev) return;
    if (dev.currentPageIdx >= dev.pagesLength - 1) return;
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(async () => (await readPagination(page))?.currentPageIdx ?? -1, { timeout: 15_000 })
      .toBe(dev.currentPageIdx + 1);
  }
}

/** Fire the fake speech's utterances (start→end per advance) until the
 * DONE utterance with `goal` text retires — the drain loop runs IN the
 * browser (one round-trip per poll batch; the book-continuation shape). */
async function drainSpeechToDone(page: Page, goal: string, timeout = 60_000): Promise<void> {
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
        }, goal),
      { timeout, intervals: [50] },
    )
    .toBe("done");
}

test.describe("Chapter assignments (issue #244)", () => {
  test.beforeEach(async ({ page }) => {
    await wipeDatabase(page);
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

  test("the picker offers validated chapter targets; entries open the /c/ routes (DISC-244-01)", async ({
    page,
  }) => {
    await createCollectionViaUi(page, "Chapter plan");
    await page.getByRole("button", { name: "Add readings" }).click();
    const dialog = page.getByRole("dialog");

    // The work's chapter rows (structure titles) sit under the work's row.
    await page.fill("#add-reading-search", "Opening Arguments");
    await expect(
      dialog.getByRole("button", {
        name: "Add Opening Arguments (Chapter · The Tide Ledger)",
        exact: true,
      }),
    ).toBeVisible();
    // The book's EXISTING chapter articles are offered in TOC order.
    await page.fill("#add-reading-search", "Book Chapter 1");
    await expect(
      dialog.getByRole("button", {
        name: "Add Book Chapter 1 (Chapter · The Harbor Almanac)",
        exact: true,
      }),
    ).toBeVisible();
    // A chapterless work offers NO chapter rows — only the whole reading.
    await page.fill("#add-reading-search", "A Chapterless Essay");
    await expect(dialog.getByText("Chapter · A Chapterless Essay")).toHaveCount(0);
    expect(await dialog.getByRole("button", { name: /Add A Chapterless Essay/ }).count()).toBe(1);

    // Add one chapter of each kind; each flips to the calm "Added" mark,
    // and the STORE refuses the exact same chapter again (the mark is the
    // refusal's UI face — re-searching shows the mark, no second Add).
    await page.fill("#add-reading-search", "Opening Arguments");
    await dialog
      .getByRole("button", {
        name: "Add Opening Arguments (Chapter · The Tide Ledger)",
        exact: true,
      })
      .click();
    await expect(dialog.getByText("Added", { exact: true }).first()).toBeVisible();
    await page.fill("#add-reading-search", "Book Chapter 1");
    await dialog
      .getByRole("button", {
        name: "Add Book Chapter 1 (Chapter · The Harbor Almanac)",
        exact: true,
      })
      .click();
    await expect(dialog.getByText("Added", { exact: true }).first()).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();

    // The entries render with the parent named in the kind line, and their
    // links carry the chapter scope.
    const entries = page.locator(".collection-entries .collection-entry");
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0)).toContainText("Chapter · The Tide Ledger");
    await expect(entries.nth(0).getByRole("link", { name: "Opening Arguments" })).toHaveAttribute(
      "href",
      new RegExp(`/c/${CH_ONE!.id}$`),
    );
    await expect(entries.nth(1)).toContainText("Chapter · The Harbor Almanac");
    await expect(entries.nth(1).getByRole("link", { name: "Book Chapter 1" })).toHaveAttribute(
      "href",
      "#/article/bca244-c01/c/chapter",
    );
  });

  test("the resume gate: outside lands at the chapter's start, inside restores (DISC-244-02)", async ({
    page,
  }) => {
    // The reader last read inside chapter ONE — outside chapter TWO.
    const insideOne = CH_INTERLUDE!.startOffset - 5;
    await seedLocation(page, WORK.id, insideOne, "2026-10-02T08:00:00.000Z");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Saved articles" })).toBeVisible();

    // Direct deep link pins the /c/ URL grammar (no collection detour).
    await page.goto(`${BASE}/#/article/${WORK.id}/c/${CH_INTERLUDE!.id}`);
    await expect(page.getByRole("heading", { level: 1, name: "The Tide Ledger" })).toBeVisible();
    // The boundary landing focuses the chapter's opening heading (the
    // VISIBLE surface's block — the hidden measurement clone carries the
    // same data-block-index but is never focusable).
    // The VISIBLE surface's block: the hidden measurement clone ALSO lives
    // inside .page-viewport and carries the same data-block-index, so the
    // locator must exclude the clone subtree (the resolveTocDestination
    // discipline, expressed as CSS).
    const followingHeading = page
      .locator(".page-viewport [data-block-index]:not(.article-body-measurement *)", {
        hasText: "A Brief Interlude",
      })
      .first();
    await expect(followingHeading).toBeFocused({ timeout: 10_000 });
    // A boundary landing is not a resume: no restoration marker.
    await expect(page.locator(".restoration-marker")).toHaveCount(0);

    // INSIDE: seed a position within the assigned chapter itself and
    // reopen — the shared position restores (the marker claims it) and no
    // heading is focused.
    const insideTwo = CH_INTERLUDE!.startOffset + 5;
    await seedLocation(page, WORK.id, insideTwo, "2026-10-03T08:00:00.000Z");
    await page.reload();
    await page.goto(`${BASE}/#/article/${WORK.id}/c/${CH_INTERLUDE!.id}`);
    await expect(page.getByRole("heading", { level: 1, name: "The Tide Ledger" })).toBeVisible();
    await expect(page.locator(".restoration-marker")).toBeVisible({ timeout: 10_000 });
    await expect(
      page
        .locator(".page-viewport [data-block-index]:not(.article-body-measurement *)", {
          hasText: "A Brief Interlude",
        })
        .first(),
    ).not.toBeFocused();
  });

  test("paginated reading stays within the assignment; the end is the explicit continue (DISC-244-03)", async ({
    page,
  }) => {
    await createCollectionViaUi(page, "Paginated plan");
    await addViaPicker(page, "Add Opening Arguments (Chapter · The Tide Ledger)");
    const entryLink = page.locator(".collection-entry-link", { hasText: "Opening Arguments" });
    await entryLink.click();
    await expect(page).toHaveURL(new RegExp(`/c/${CH_ONE!.id}$`));
    await waitForPaginationSettled(page);

    // The scoped pagination is smaller than the whole work's would be (the
    // chapter is one of three) and starts AT the chapter.
    const scoped = await readPagination(page);
    expect(scoped?.pagesLength ?? 0).toBeGreaterThan(1);

    // Turn through: every internal boundary stays inside the chapter; the
    // end card is the LAST page's honest state, never an early one.
    const total = scoped?.pagesLength ?? 1;
    for (let i = 0; i < total - 1; i++) {
      await page.keyboard.press("ArrowRight");
      await waitForPageSettled(page, i + 1);
      if (i + 1 < total - 1) await expect(endCard(page)).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`/c/${CH_ONE!.id}$`));
    }
    // At the assignment's end: the explicit continue card, NO completion
    // gesture (a mid-work chapter cannot mark the WORK read), and the
    // forward turn refuses without leaving.
    await expect(endCard(page)).toBeVisible();
    await expect(endCard(page)).toContainText("End of “Opening Arguments”.");
    await expect(
      endCard(page).getByRole("button", { name: "Continue reading The Tide Ledger" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Mark read/ })).toHaveCount(0);
    await page.keyboard.press("ArrowRight");
    await waitForPageSettled(page, total - 1);
    await expect(page).toHaveURL(new RegExp(`/c/${CH_ONE!.id}$`));

    // Continue the underlying work: the assignment strips, the reader lands
    // at the next chapter's heading, and the route is the plain one.
    await endCard(page).getByRole("button", { name: "Continue reading The Tide Ledger" }).click();
    await expect(page).toHaveURL(new RegExp(`#/article/${WORK.id}$`));
    const nextHeading = page
      .locator("[data-block-index]:not(.article-body-measurement *)", {
        hasText: "A Brief Interlude",
      })
      .first();
    await expect(nextHeading).toBeFocused({ timeout: 10_000 });
  });

  test("an oversized assigned chapter crosses its internal windows, never the assignment (DISC-244-04)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${WORK.id}/c/${CH_LONG!.id}`);
    await expect(page.getByRole("heading", { level: 1, name: "The Tide Ledger" })).toBeVisible();
    await waitForPaginationSettled(page);

    // Walk the whole assignment: internal layout-window crossings (the DEV
    // scope moves, the page index resets) never surface the end card — a
    // local window boundary is NOT the assignment's end; the walk continues
    // through it and only stops when the end card appears (the assignment's
    // TRUE end) or a turn is refused in place. The URL never changes.
    const scopeStarts = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const dev = await readPagination(page);
      if (!dev) break;
      if (dev.scope) scopeStarts.add(dev.scope.startBlock);
      if (await endCard(page).isVisible()) break;
      await page.keyboard.press("ArrowRight");
      try {
        await expect
          .poll(
            async () => {
              if (await endCard(page).isVisible()) return "end";
              const d = await readPagination(page);
              const moved =
                d!.currentPageIdx !== dev.currentPageIdx ||
                d!.scope?.startBlock !== dev.scope?.startBlock;
              return moved ? "advanced" : "same";
            },
            { timeout: 8_000, intervals: [50] },
          )
          .not.toBe("same");
      } catch {
        // No movement within the window: the turn was refused — the end card
        // must be showing (the loop's break below verifies it).
      }
      if (await endCard(page).isVisible()) break;
      await expect(page).toHaveURL(new RegExp(`/c/${CH_LONG!.id}$`));
      await expect(endCard(page)).toHaveCount(0);
    }
    // The multi-window chapter really crossed several internal scopes.
    expect(scopeStarts.size).toBeGreaterThan(1);
    // The end card waits at the assignment's TRUE end.
    await expect(endCard(page)).toBeVisible();
    await expect(endCard(page)).toContainText("End of “The Long Middle”.");
  });

  test("a one-page assigned chapter ends the assignment at the open itself (DISC-244-05)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${WORK.id}/c/${CH_INTERLUDE!.id}`);
    await expect(page.getByRole("heading", { level: 1, name: "The Tide Ledger" })).toBeVisible();
    await waitForPaginationSettled(page);
    const dev = await readPagination(page);
    expect(dev?.pagesLength).toBe(1);
    // The end card shows immediately (the chapter IS its last page).
    await expect(endCard(page)).toBeVisible();
    await expect(endCard(page)).toContainText("End of “A Brief Interlude”.");
    // The forward turn refuses in place.
    await page.keyboard.press("ArrowRight");
    await waitForPageSettled(page, 0);
    await expect(page).toHaveURL(new RegExp(`/c/${CH_INTERLUDE!.id}$`));
    // Mid-work: the explicit continue option, never the completion gesture.
    await expect(
      endCard(page).getByRole("button", { name: "Continue reading The Tide Ledger" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Mark read/ })).toHaveCount(0);
  });

  test("a SCROLLING assignment marks the chapter's true end in flow and continues explicitly (DISC-244-11)", async ({
    page,
  }) => {
    // Scrolling keeps the reader's continuous mode (no mandatory part-by-
    // part navigation); the assignment's presence there is the boundary
    // card at the chapter's TRUE end — in flow, between the chapter's last
    // block and the next chapter's heading — plus the explicit continue
    // action (never an automatic advancement).
    await seedScrollingMode(page);
    await page.reload();
    await page.goto(`${BASE}/#/article/${WORK.id}/c/${CH_ONE!.id}`);
    await expect(page.getByRole("heading", { level: 1, name: "The Tide Ledger" })).toBeVisible();
    const card = endCard(page);
    await expect(card).toBeVisible();
    await expect(card).toContainText("End of “Opening Arguments”.");
    // In flow: after the chapter's last block (8), before the next
    // chapter's heading (9) — DOM order, evaluated in the page.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const card = document.querySelector(".assignment-end-nav");
            const before = document.querySelector('[data-block-index="8"]');
            const after = document.querySelector('[data-block-index="9"]');
            if (!card || !before || !after) return "missing";
            const following = (a: Element, b: Element): boolean =>
              (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
            return following(before, card) && following(card, after) ? "in-flow" : "misplaced";
          }),
        { timeout: 5_000 },
      )
      .toBe("in-flow");
    // Continue: the assignment strips, the reader lands on the next
    // chapter's heading (the same landing the paginated continue makes).
    await card.getByRole("button", { name: "Continue reading The Tide Ledger" }).click();
    await expect(page).toHaveURL(new RegExp(`#/article/${WORK.id}$`));
    await expect(
      page
        .locator("[data-block-index]:not(.article-body-measurement *)", {
          hasText: "A Brief Interlude",
        })
        .first(),
    ).toBeFocused({ timeout: 10_000 });
  });

  test("an EPUB chapter assignment replaces the crossing link with the explicit continue (DISC-244-06)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${BOOK_CHAPTER_IDS[0]!}/c/chapter`);
    await expect(page.getByRole("heading", { level: 1, name: "Book Chapter 1" })).toBeVisible();
    await waitForPaginationSettled(page);
    await turnToEnd(page);
    // The ordinary "Next chapter" link is REPLACED by the assignment's
    // explicit continue option at the same seam.
    await expect(page.getByRole("link", { name: /Next chapter/ })).toHaveCount(0);
    await expect(endCard(page)).toContainText("End of “Book Chapter 1”.");
    await expect(
      endCard(page).getByRole("button", { name: "Continue reading The Harbor Almanac" }),
    ).toBeVisible();
    // The forward turn refuses in place (never an accidental crossing).
    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(new RegExp(`/c/chapter$`));

    // Continue: the ordinary explicit crossing into chapter two (plain
    // route — the assignment is spent).
    await endCard(page)
      .getByRole("button", { name: "Continue reading The Harbor Almanac" })
      .click();
    await expect(page).toHaveURL(new RegExp(`#/article/${BOOK_CHAPTER_IDS[1]!}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Book Chapter 2" })).toBeVisible();

    // CONTRAST — ordinary whole-work reading keeps the crossing link.
    await page.goto(`${BASE}/#/article/${BOOK_CHAPTER_IDS[0]!}`);
    await expect(page.getByRole("heading", { level: 1, name: "Book Chapter 1" })).toBeVisible();
    await waitForPaginationSettled(page);
    await turnToEnd(page);
    await expect(page.getByRole("link", { name: /Next chapter/ })).toBeVisible();
    await expect(endCard(page)).toHaveCount(0);
  });

  test("the speech boundary: a web-work assignment speaks only its chapter and saves the chapter's end (DISC-244-07)", async ({
    page,
  }) => {
    // The fake must be installed BEFORE the document it speaks in loads —
    // register first, then seed, then RELOAD (a hash-only goto would keep
    // the pre-fake document alive — the _harness.load-bearing note).
    await installFakeSpeech(page, "word");
    await seedLocation(page, WORK.id, 0, "2026-10-01T08:00:00.000Z");
    await page.reload();
    await page.goto(`${BASE}/#/article/${WORK.id}/c/${CH_ONE!.id}`);
    await expect(page.getByRole("heading", { level: 1, name: "The Tide Ledger" })).toBeVisible();
    await playAndAwaitProbe(page);

    // Drain the session to its finish — the chunker is clipped to the
    // chapter, so the finish arrives at the chapter's end.
    const chOneChunks = chunkArticleForSpeech(WORK, {
      start: CH_ONE!.startOffset,
      end: CH_ONE!.endOffset,
    });
    await drainSpeechToDone(page, chOneChunks.at(-1)!.text);
    // The ONE completion seam ran — no continuation, no crossing.
    await expect(page.getByText("Read aloud finished.")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/c/${CH_ONE!.id}$`));
    // No chapter-two text was ever spoken.
    const spokenText = await page.evaluate(() => {
      const w = window as unknown as { __speechSpoken: { text: string; volume: number }[] };
      return w.__speechSpoken
        .filter((r) => r.volume === 1)
        .map((r) => r.text)
        .join("\n");
    });
    expect(spokenText).not.toContain("Chapter two.");
    // The saved position is the ASSIGNMENT's end — not the work's end-pin
    // (finishing chapter one by ear must not finish the work).
    const saved = await readLocationOffset(page, WORK.id);
    expect(saved).toBe(CH_ONE!.endOffset);
    expect(saved).toBeLessThan(WORK_TOTAL - 1);
  });

  test("the speech boundary: an EPUB chapter assignment stops instead of following the book handoff (DISC-244-08)", async ({
    page,
  }) => {
    await installFakeSpeech(page, "word");
    // New document for the fake (see DISC-244-07's order note).
    await page.reload();
    await page.goto(`${BASE}/#/article/${BOOK_CHAPTER_IDS[0]!}/c/chapter`);
    await expect(page.getByRole("heading", { level: 1, name: "Book Chapter 1" })).toBeVisible();
    await playAndAwaitProbe(page);

    // Drain to the finish: NO handoff to Book Chapter 2 — the session ends
    // through the ONE completion seam and the route stays on the chapter.
    const chapter = BOOK_CHAPTERS[0]!;
    const chunks = chunkArticleForSpeech(chapter);
    await drainSpeechToDone(page, chunks.at(-1)!.text);
    await expect(page.getByText("Read aloud finished.")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`#/article/${BOOK_CHAPTER_IDS[0]!}/c/chapter$`));
    await expect(page.getByRole("heading", { level: 1, name: "Book Chapter 2" })).toHaveCount(0);
    // The saved position is the chapter's end-pin (the chapter IS the
    // assignment — the shared position lands at its true end).
    const saved = await readLocationOffset(page, BOOK_CHAPTER_IDS[0]!);
    expect(saved).toBe(graphemeClusters(normalizeText(chapter), chapter.lang).length);
  });

  test("a stale destination renders honestly unlinked (DISC-244-09)", async ({ page }) => {
    const now = "2026-10-01T00:00:00.000Z";
    const row = CollectionSchema.parse({
      schemaVersion: 1,
      id: "stale-plan",
      name: "Stale plan",
      entries: [
        {
          id: "entry-stale",
          target: { kind: "work-chapter", articleId: WORK.id, destinationId: "ch-999.b" },
          addedAt: now,
        },
        {
          id: "entry-fresh",
          target: { kind: "article", articleId: ESSAY.id },
          addedAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    });
    await seedCollectionRow(page, row);
    await page.goto(`${BASE}/#/collections/stale-plan`);
    await expect(page.getByRole("heading", { level: 1, name: "Stale plan" })).toBeVisible();
    const entries = page.locator(".collection-entries .collection-entry");
    await expect(entries).toHaveCount(2);
    // The stale chapter: honestly unlinked with its own line — never a
    // silent whole-work open, never a dead link.
    await expect(entries.nth(0)).toContainText("Chapter no longer matches this reading");
    await expect(entries.nth(0).getByRole("link")).toHaveCount(0);
    // The fresh entry stays linked.
    await expect(entries.nth(1).getByRole("link", { name: "A Chapterless Essay" })).toBeVisible();
  });

  test("annotations are untouched by the assignment scope (DISC-244-10)", async ({ page }) => {
    // A highlight inside the LONG chapter's range, seeded through the
    // shipped record path, plus a saved position inside the chapter (the
    // resume). The excerpt sits INSIDE one paragraph's canonical span (no
    // block separator in it — the quote resolver anchors whole blocks).
    const { blockStartOffsets } = articleGraphemeIndex(WORK);
    const paragraphStart = blockStartOffsets[CH_LONG!.startBlock + 2]!;
    const start = paragraphStart + 6;
    const exact = normalizeText(WORK).slice(start, start + 30);
    await seedHighlightRecord(page, {
      id: "hl-assigned",
      articleId: WORK.id,
      revision: WORK.revision,
      position: { start, end: start + 30 },
      quote: { prefix: "", exact, suffix: "" },
    });
    await seedLocation(page, WORK.id, CH_LONG!.startOffset + 5, "2026-10-02T08:00:00.000Z");
    await page.reload();

    await page.goto(`${BASE}/#/article/${WORK.id}/c/${CH_LONG!.id}`);
    await expect(page.getByRole("heading", { level: 1, name: "The Tide Ledger" })).toBeVisible();
    // The highlight renders inside the assignment open — the canonical
    // text identity holds; no substitute article, no reattachment.
    await assertHighlightMark(page, { excerptSubstring: exact.slice(0, 20) });
    // The annotations drawer counts the same highlight (one badge, one
    // annotation — the assignment introduced no second identity).
    await page.getByRole("button", { name: /Highlights and notes/ }).click();
    const drawer = page.locator("dialog.annotations-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.locator(".drawer-entry")).toHaveCount(1);
    await page.keyboard.press("Escape");
  });
});
