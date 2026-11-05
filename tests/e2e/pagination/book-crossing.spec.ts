// tests/e2e/pagination/book-crossing.spec.ts
// Issue #238 — whole-book Next/Previous across EXISTING EPUB chapter
// articles, seeded as raw Dexie rows (the reading-views.spec corpus
// discipline — schema-valid rows built in Node through the SHIPPED schemas;
// no ingestion pipeline in the loop, so layout truth stays deterministic).
//
// The acceptance surface proven here, in one real browser per engine:
//   - the ordinary turn (ArrowRight/ArrowLeft) at a chapter's TRUE end/start
//     crosses to the neighboring existing chapter in book order — forward
//     lands at the chapter start (anchor 0), backward at its final page
//     (the end-pin) — and the departing chapter's real position flushes
//     BEFORE the route changes (the location row is read straight from
//     Dexie);
//   - internal layout-window boundaries are NOT chapter boundaries: the
//     oversized prose chapter crosses its windows internally (URL
//     unchanged), stays bounded, and never pagination-falls back for
//     length — its true end is the whole-book end;
//   - first/last chapter dead ends stay bounded (no crossing, chevrons
//     honestly disabled);
//   - a one-page chapter crosses in both directions and its end affordance
//     is the crossing, never a mid-book "Mark read and close";
//   - reload/resume: the handoff-saved boundary position is the resume
//     truth (the restoration marker mounts; the final page re-lands);
//   - annotations: a seeded highlight re-anchors on the arriving chapter's
//     page (canonical article ids and selectors untouched);
//   - cancellation: a rapid direction change inside the handoff's
//     deferral window cancels the crossing entirely (same-task synthetic
//     keydowns — the deterministic form of the rapid Next→Left press);
//   - scrolling availability: scrolling mode keeps its explicit chapter
//     links and never crosses on scroll.
import { test, expect, type Page } from "@playwright/test";
import { ArticleSchema, BookSchema } from "../../../src/content/schema";
import type { CanonicalArticle, Book } from "../../../src/content/schema";
import { normalizeText, graphemeClusters } from "../../../src/content/normalizeText";
import { seedStoreRows } from "../library/seedStoreRows";
import {
  confidentHighlightOn,
  highlightRow,
  prepareFreshPage,
  seedRows,
} from "../portability/_portability";
import {
  markPaginationEpoch,
  readPagination,
  waitForPaginationSettled,
  waitForRepagination,
  waitForTurnAcknowledged,
} from "./_harness";
import { BASE } from "../_base";

// ── Node-side corpus builders (shipped schemas only — never hand-built rows) ──

function totalOf(article: CanonicalArticle): number {
  return graphemeClusters(normalizeText(article), article.lang).length;
}

function makeChapter(
  id: string,
  title: string,
  chapterIndex: number,
  paragraphs: string[],
): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      title,
      retrievedAt: "2026-08-20T00:00:00.000Z",
      originalHtmlHash: `sha256:${"0".repeat(64)}`,
    },
    blocks: paragraphs.map((text) => ({
      kind: "paragraph",
      content: [{ text, marks: [] }],
    })),
    ingestionMeta: {
      source: "epub-chapter",
      origin: "upload",
      originalHtmlHash: `sha256:${"0".repeat(64)}`,
      extractionConfidence: "high",
      extractionWarnings: [],
      bookId: BOOK_ID,
      chapterIndex,
    },
  });
}

/** N distinct paragraphs of steady length (~180 chars) — deterministic
 * pagination shape at the 360×640 geometry (~3 pages for 8 paragraphs,
 * the epub-intake precedent). */
function paragraphs(n: number, seed: string): string[] {
  return Array.from({ length: n }, (_, i) =>
    `${seed} Passage ${i + 1} keeps a steady count of the harbor's small weather, and the ${i + 1}${["st", "nd", "rd", "th"][i % 4] ?? "th"} entry runs long enough to wrap across several composed lines at the narrow geometry, the way a patient ledger fills a page without hurrying. The tide table beneath it stays honest, and the keeper signs each entry with the same unhurried flourish, so the chapter reads at an even cadence from beginning to end.`,
  );
}

const BOOK_ID = "bc-book";
const C0 = makeChapter("bc-c0", "Chapter 2. The Ledger of Tides", 1, paragraphs(8, "Chapter two."));
const C1 = makeChapter("bc-c1", "Chapter 3. The Bell Founders", 2, paragraphs(8, "Chapter three."));
const ONE = makeChapter(
  "bc-one",
  "Chapter 4. The One-Page Almanac",
  3,
  ["The one-page almanac fits a single composed page at the narrow geometry: one short paragraph, entirely readable in one glance, with room to spare beneath it."],
);
const GIANT = makeChapter("bc-giant", "Chapter 1. The Cataract", 0, paragraphs(110, "Chapter four."));
const BOOK: Book = BookSchema.parse({
  id: BOOK_ID,
  title: "The Boundary Almanac",
  authors: ["Ada Author"],
  language: "en",
  // The oversized chapter leads (its first-window crossing is the
  // boundedness proof); the one-pager closes the book (a whole-book end
  // whose true end is a single composed page).
  chapterArticleIds: [GIANT.id, C0.id, C1.id, ONE.id],
  skippedChapterCount: 0,
  source: "epub-upload",
  originalFileHash: `sha256:${"1".repeat(64)}`,
  tags: [],
  addedAt: "2026-08-20T00:00:00.000Z",
});
const CHAPTERS = [C0, C1, ONE, GIANT];
const END_PIN: Record<string, number> = Object.fromEntries(
  CHAPTERS.map((c) => [c.id, totalOf(c)]),
);

// ── Browser helpers ──────────────────────────────────────────────────────────

async function seedCorpus(page: Page): Promise<void> {
  await seedStoreRows(page, "books", [BOOK]);
  // Chapter rows carry the denormalized top-level bookId used by the
  // articles index (the reading-views seeding discipline).
  await seedStoreRows(
    page,
    "articles",
    CHAPTERS.map((article) => ({
      ...article,
      ...(article.ingestionMeta?.bookId ? { bookId: article.ingestionMeta.bookId } : {}),
    })),
  );
}

async function openChapter(page: Page, id: string): Promise<CanonicalArticle> {
  const chapter = CHAPTERS.find((c) => c.id === id)!;
  await page.goto(`${BASE}/#/article/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: chapter.provenance.title })).toBeVisible({
    timeout: 10_000,
  });
  await waitForPaginationSettled(page);
  return chapter;
}

/** The true-end terminal affordance: a mid-book chapter end shows the Next
 * chapter link; the whole-book end shows the completion gesture. */
async function atTrueChapterEnd(page: Page): Promise<boolean> {
  return (
    (await page.locator(".chapter-nav-next").isVisible().catch(() => false)) ||
    (await page.locator(".mark-read-close").isVisible().catch(() => false))
  );
}

/** Walk to the chapter's TRUE end with real ArrowRight presses, each turn
 * ACKNOWLEDGED through the shared harness (a newer settled publication + a
 * completed-manual-turn receipt — window crossings are async and reset the
 * window-local page index, so neither stale settled state nor page numbers
 * are honest signals). The terminal AFFORDANCE is the only chapter-end
 * signal. */
async function walkToTrueEnd(page: Page, maxPresses = 80): Promise<void> {
  for (let i = 0; i < maxPresses; i++) {
    if (await atTrueChapterEnd(page)) return;
    const before = await readPagination(page);
    if (!before) continue;
    await page.keyboard.press("ArrowRight");
    await waitForTurnAcknowledged(page, before, "next", 10_000).catch(() => {});
  }
  throw new Error("walkToTrueEnd: the chapter's true end never appeared");
}

async function readLocationOffset(page: Page, articleId: string): Promise<number | null> {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows = await new Promise<{ articleId?: string; graphemeOffset?: number }[]>(
      (resolve, reject) => {
        const tx = db.transaction("location", "readonly");
        const req = tx.objectStore("location").getAll();
        req.onsuccess = () => resolve(req.result as { articleId?: string; graphemeOffset?: number }[]);
        req.onerror = () => reject(req.error);
      },
    );
    db.close();
    const mine = rows.filter((r) => r.articleId === id);
    if (mine.length === 0) return null;
    // Latest savedAt wins (the app's fold) — getAll is key order; take the
    // row the app would take by scanning all and trusting the store's
    // single-row-per-revision shape (revision 1 corpus).
    return mine.at(-1)?.graphemeOffset ?? null;
  }, articleId);
}

test.beforeEach(async ({ page }) => {
  await prepareFreshPage(page);
  await seedCorpus(page);
  await page.setViewportSize({ width: 360, height: 640 });
});

test.describe("whole-book chapter crossing (issue #238)", () => {
  test("the turn at a chapter's true end crosses forward and lands at the next chapter's start", async ({
    page,
  }) => {
    await openChapter(page, C0.id);
    await walkToTrueEnd(page);
    // The mid-book end affordance is the crossing link (never completion).
    await expect(page.locator("a.chapter-next")).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark read and close" })).toHaveCount(0);

    await page.keyboard.press("ArrowRight");

    // The canonical chapter route swapped in place; the book orientation
    // line names the arrived chapter.
    await page.waitForURL(new RegExp(`#/article/${C1.id}$`), { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: C1.provenance.title }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: C1.provenance.title }),
    ).toBeFocused();
    await expect(page.locator("p.book-context")).toContainText("Chapter 3 of 4");
    await waitForPaginationSettled(page);
    // The correct boundary: the chapter's START.
    const dev = await readPagination(page);
    expect(dev?.anchorOffset).toBe(0);
    expect(dev?.currentPageIdx).toBe(0);
    // The departing chapter's REAL position flushed before the handoff:
    // its final-page end-pin is in the location store.
    await expect
      .poll(() => readLocationOffset(page, C0.id), { timeout: 10_000 })
      .toBe(END_PIN[C0.id]);
    // The arrival's boundary position persists too (the debounced commit).
    await expect
      .poll(() => readLocationOffset(page, C1.id), { timeout: 10_000 })
      .toBe(0);
    // A deliberate crossing is not a resume — no restoration marker.
    await expect(page.locator(".restoration-marker")).toHaveCount(0);
  });

  test("the turn at a chapter's true start crosses back and lands at the previous chapter's final page", async ({
    page,
  }) => {
    // A DEEP LINK: the predecessor is uncached — openArticle loads it from
    // Dexie on demand (the acceptance's cold-entry/uncached-predecessor
    // case).
    await openChapter(page, C1.id);
    await markPaginationEpoch(page);
    await page.keyboard.press("ArrowLeft");

    await page.waitForURL(new RegExp(`#/article/${C0.id}$`), { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: C0.provenance.title }),
    ).toBeFocused();
    await waitForRepagination(page);
    // The correct boundary: the previous chapter's END (the final-page
    // anchor reports the end-pin).
    const dev = await readPagination(page);
    expect(dev?.anchorOffset).toBe(END_PIN[C0.id]);
    // The end affordance of a mid-book chapter is the crossing link, and
    // completion is reserved for the whole-book end.
    await expect(page.locator("a.chapter-next")).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark read and close" })).toHaveCount(0);
    await expect(page.locator(".restoration-marker")).toHaveCount(0);
    // The departure (C1 at its start) flushed synchronously.
    await expect.poll(() => readLocationOffset(page, C1.id), { timeout: 10_000 }).toBe(0);
  });

  test("the book's start and end stay bounded dead ends (controls distinguish them)", async ({
    page,
  }) => {
    // The book's FIRST chapter (the oversized one): Previous is honestly
    // disabled and the turn is a bounded dead end (no wrap, no crossing).
    await openChapter(page, GIANT.id);
    await expect(page.locator("button.page-turn-previous")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    const atStart = await readPagination(page);
    await page.keyboard.press("ArrowLeft");
    await waitForPaginationSettled(page);
    await expect(page).toHaveURL(new RegExp(`#/article/${GIANT.id}$`));
    expect((await readPagination(page))?.anchorOffset).toBe(atStart?.anchorOffset);

    // The whole-book END (the last chapter's true end — the one-pager):
    // the completion gesture is the end affordance and Next is honestly
    // disabled.
    await openChapter(page, ONE.id);
    await expect(page.getByRole("button", { name: "Mark read and close" })).toBeVisible();
    await expect(page.locator("button.page-turn-next")).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator("a.chapter-next")).toHaveCount(0);
    const atEnd = await readPagination(page);
    await page.keyboard.press("ArrowRight");
    await waitForPaginationSettled(page);
    await expect(page).toHaveURL(new RegExp(`#/article/${ONE.id}$`));
    expect((await readPagination(page))?.anchorOffset).toBe(atEnd?.anchorOffset);
  });

  test("a one-page chapter receives a forward crossing and crosses out backward", async ({
    page,
  }) => {
    // Enter the one-pager across the preceding chapter's true end.
    await openChapter(page, C1.id);
    await walkToTrueEnd(page);
    // The mid-book end affordance is the crossing link (never completion).
    await expect(page.locator("a.chapter-next")).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark read and close" })).toHaveCount(0);
    await markPaginationEpoch(page);
    await page.keyboard.press("ArrowRight");
    await page.waitForURL(new RegExp(`#/article/${ONE.id}$`), { timeout: 10_000 });
    await waitForRepagination(page);
    // The whole-book end's single page IS the boundary landing (anchor 0 —
    // POLISH-02: a one-page set never pins on landing).
    expect((await readPagination(page))?.pagesLength).toBe(1);
    expect((await readPagination(page))?.anchorOffset).toBe(0);
    // The one-pager is the whole-book end: the completion gesture mounts on
    // its single page and no Next affordance exists.
    await expect(page.getByRole("button", { name: "Mark read and close" })).toBeVisible();
    await expect(page.locator("a.chapter-next")).toHaveCount(0);
    await expect(page.locator("a.chapter-prev")).toBeVisible();

    // Backward out of the one-pager: the turn crosses to the previous
    // chapter's true end (its final page) — never a resume.
    await markPaginationEpoch(page);
    await page.keyboard.press("ArrowLeft");
    await page.waitForURL(new RegExp(`#/article/${C1.id}$`), { timeout: 10_000 });
    await waitForRepagination(page);
    expect((await readPagination(page))?.anchorOffset).toBe(END_PIN[C1.id]);
    await expect(page.locator(".restoration-marker")).toHaveCount(0);
  });

  test("an oversized chapter crosses its layout windows internally, stays bounded, and never falls back", async ({
    page,
  }) => {
    await openChapter(page, GIANT.id);
    // Walk past the FIRST window boundary: the URL must not change (a
    // window end is not a chapter end) and no fallback banner may appear
    // (bounded measurement, no length-based collapse). Each turn is
    // acknowledged (window crossings are async — stale settled state is
    // not a signal).
    const firstScope = (await readPagination(page))?.scope;
    for (let i = 0; i < 30; i++) {
      const before = await readPagination(page);
      if (before?.scope && before.scope.startBlock !== firstScope?.startBlock) break;
      await page.keyboard.press("ArrowRight");
      await waitForTurnAcknowledged(page, before!, "next", 10_000).catch(() => {});
    }
    const crossed = await readPagination(page);
    expect(crossed?.scope?.startBlock).not.toBe(firstScope?.startBlock);
    await expect(page).toHaveURL(new RegExp(`#/article/${GIANT.id}$`));
    await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
    // The book-level orientation rides the windowed surface too.
    await expect(page.locator(".reading-orientation")).toHaveText("Chapter 1 of 4");
    // The chevron stays enabled across internal window ends.
    await expect(page.locator("button.page-turn-next")).toHaveAttribute("aria-disabled", "false");
  });

  test("reload after a crossing resumes at the handoff-saved boundary (restoration marker, final page)", async ({
    page,
  }) => {
    await openChapter(page, C1.id);
    await page.keyboard.press("ArrowLeft");
    await page.waitForURL(new RegExp(`#/article/${C0.id}$`), { timeout: 10_000 });
    await waitForPaginationSettled(page);
    // The backward arrival's debounced final-page save lands.
    await expect
      .poll(() => readLocationOffset(page, C0.id), { timeout: 10_000 })
      .toBe(END_PIN[C0.id]);

    // Reload: the saved boundary position is the resume truth — the reader
    // re-lands on the final page with the passive restoration marker.
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: C0.provenance.title }),
    ).toBeVisible({ timeout: 10_000 });
    await waitForPaginationSettled(page);
    const dev = await readPagination(page);
    expect(dev?.anchorOffset).toBe(END_PIN[C0.id]);
    await expect(page.locator(".restoration-marker")).toHaveCount(1, { timeout: 10_000 });
    await expect(
      page.getByRole("status").filter({ hasText: "Returned to where you left off." }),
    ).toHaveCount(1);
  });

  test("returning to a handoff-arrived chapter via its chapter links resumes the saved position (stand-down is per-arrival)", async ({
    page,
  }) => {
    // Cross forward into C1 (a handoff arrival), walk out through the
    // chapter LINKS (ordinary article swaps — never the turn seam), then
    // link back into C1: the saved boundary position is the resume truth
    // for that arrival (the stand-down holds only for the arrival it
    // claimed, never for later same-id visits).
    await openChapter(page, C0.id);
    await walkToTrueEnd(page);
    await markPaginationEpoch(page);
    await page.keyboard.press("ArrowRight");
    await page.waitForURL(new RegExp(`#/article/${C1.id}$`), { timeout: 10_000 });
    await waitForRepagination(page);
    // The C1 boundary position (offset 0) persists through the arrival.
    await expect.poll(() => readLocationOffset(page, C1.id), { timeout: 10_000 }).toBe(0);

    // Out through the Previous-chapter LINK, then back in through the
    // Next-chapter LINK.
    await page.locator("a.chapter-prev").click();
    await page.waitForURL(new RegExp(`#/article/${C0.id}$`), { timeout: 10_000 });
    await waitForRepagination(page);
    await walkToTrueEnd(page);
    await markPaginationEpoch(page);
    await page.locator("a.chapter-next").click();
    await page.waitForURL(new RegExp(`#/article/${C1.id}$`), { timeout: 10_000 });
    await waitForRepagination(page);
    // The link arrival RESUMES: restoration marker + the saved boundary.
    const dev = await readPagination(page);
    expect(dev?.anchorOffset).toBe(0);
    await expect(page.locator(".restoration-marker")).toHaveCount(1, { timeout: 10_000 });
  });

  test("annotations survive the crossing: a seeded highlight renders on the arriving chapter's page", async ({
    page,
  }) => {
    // Seed a confident anchor inside C1's first paragraph through the
    // shipped resolver (the portability seeding discipline).
    const anchor = confidentHighlightOn(C1, { start: 10 });
    await seedRows(page, { highlights: [highlightRow(C1.id, anchor, "hl-bc-cross")] });

    await openChapter(page, C0.id);
    await walkToTrueEnd(page);
    await page.keyboard.press("ArrowRight");
    await page.waitForURL(new RegExp(`#/article/${C1.id}$`), { timeout: 10_000 });
    await waitForPaginationSettled(page);
    // The canonical chapter id kept its annotations: the mark re-anchors on
    // the arrived chapter's first page (the anchor lives in block 0).
    const mark = page.locator('mark.highlight[data-highlight-id="hl-bc-cross"]');
    await expect(mark.first()).toBeVisible();
  });

  test("a rapid direction change inside the handoff window cancels the crossing", async ({
    page,
  }) => {
    await openChapter(page, C0.id);
    await walkToTrueEnd(page);
    const before = await readPagination(page);

    // Next + Previous dispatched in ONE task: the boundary turn schedules
    // the handoff (route deferred one frame); the real previous turn lands
    // and supersedes it before the frame fires.
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    });
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(new RegExp(`#/article/${C0.id}$`));
    // The reader turned back INTO the departing chapter — no chapter swap,
    // no stale landing.
    const after = await readPagination(page);
    expect(after?.currentPageIdx).toBe((before?.currentPageIdx ?? 1) - 1);
    // And the crossing still works normally afterwards (the seam re-arms):
    // the first press turns back to the final page, the next crosses.
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.waitForURL(new RegExp(`#/article/${C1.id}$`), { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: C1.provenance.title }),
    ).toBeVisible();
  });

  test("scrolling mode keeps its explicit chapter links and never crosses on scroll", async ({
    page,
  }) => {
    await openChapter(page, C1.id);
    await page.getByRole("button", { name: "Reading mode: paginated" }).click();
    await expect(page.getByRole("button", { name: "Reading mode: scrolling" })).toBeVisible();
    // Flow chapter nav: Previous before the body, Next after it.
    await expect(page.locator("nav.chapter-nav-previous a.chapter-prev")).toBeVisible();
    await expect(page.locator("nav.chapter-nav-next a.chapter-next")).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark read and close" })).toHaveCount(0);
    // Scrolling to the absolute bottom never swaps chapters.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(new RegExp(`#/article/${C1.id}$`));
  });
});
