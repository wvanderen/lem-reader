// Issue #234 — giant list/quotation bounded continuations in the real reader.
//
// Works whose single list or quotation exceeds the window capacity open
// PAGINATED: only a bounded source projection is ever rendered or measured
// (one window at a time), page turns cross continuations in both directions
// with ordered-list numbering CONTINUING across every seam, quotations keep
// their semantics and nested blocks, a single enormous list item paginates
// INSIDE the item, highlights and saved positions keep their original
// coordinates, reflow stays paginated, and the pre-#234 short structures
// render unchanged. Observable readiness only — the __lemPagination DEV
// publication + the shared harness waits — never fixed sleeps.
import { test, expect, type Page } from "@playwright/test";
import {
  giantListArticle,
  giantListItemArticle,
  giantQuoteArticle,
  shortListQuoteArticle,
} from "../../fixtures/giantContainers";
import {
  articleGraphemeIndex,
  blockNormalizedText,
  deriveQuoteSelector,
  graphemeClusters,
} from "../../../src/content/normalizeText";
import { blockWindowForOffset } from "../../../src/pagination/blockWindow";
import { HighlightRecordSchema, LocationRecordSchema } from "../../../src/content/schema";
import { prepareFreshPage, seedRows } from "../portability/_portability";
import { waitForPaginationSettled, waitForRepagination, markPaginationEpoch } from "./_harness";
import { BASE } from "../_base";

const article = giantListArticle();
const index = articleGraphemeIndex(article);
const LIST_START = index.blockStartOffsets[1]!; // heading (11) + one separator

// Continuation walks cover dozens of page turns plus measured window flips;
// the default 30s budget is a walk-of-one-window budget, not this.
test.setTimeout(120_000);

interface Scope {
  startBlock: number;
  endBlock: number;
  startGrapheme?: number;
  endGrapheme?: number;
  currentPageIdx: number;
  pagesLength: number;
}

async function scope(page: Page): Promise<Scope> {
  await page.waitForFunction(
    () => (window as unknown as { __lemPagination?: unknown }).__lemPagination !== undefined,
    undefined,
    { timeout: 20_000 },
  );
  return page.evaluate(() => {
    const dev = (
      window as unknown as {
        __lemPagination: { scope?: Omit<Scope, "currentPageIdx" | "pagesLength"> } & {
          currentPageIdx: number;
          pagesLength: number;
        };
      }
    ).__lemPagination;
    return {
      startBlock: dev.scope?.startBlock ?? 0,
      endBlock: dev.scope?.endBlock ?? 0,
      startGrapheme: dev.scope?.startGrapheme,
      endGrapheme: dev.scope?.endGrapheme,
      currentPageIdx: dev.currentPageIdx,
      pagesLength: dev.pagesLength,
    };
  });
}

async function open(
  page: Page,
  work: { id: string; provenance: { title: string } } = article,
  viewport = { width: 360, height: 700 },
): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto(`${BASE}/#/article/${work.id}`);
  await expect(page.getByRole("heading", { level: 1, name: work.provenance.title })).toBeVisible();
  await waitForPaginationSettled(page);
}

/** Overflow (px) of the mounted page fragment beyond its viewport. */
async function pageOverflow(page: Page): Promise<number> {
  return page
    .locator(".page-fragment")
    .evaluate(
      (fragment) =>
        fragment.scrollHeight -
        (document.querySelector(".page-viewport") as HTMLElement).clientHeight,
    );
}

/** The visible page's ordered-list state: the <ol start> ordinal and the
 * "Item NNNN" labels of every rendered item, in DOM order. A page whose
 * first <li> was amputated by a slice boundary (its label cut off) omits
 * that label — callers tolerate start === labels[0] there. */
async function renderedList(page: Page): Promise<{ start: number; labels: number[] }> {
  return page.locator(".page-fragment").evaluate((fragment) => {
    const list = fragment.querySelector("ol");
    const start = list ? Number(list.getAttribute("start") ?? "1") : -1;
    const labels: number[] = [];
    for (const li of Array.from(fragment.querySelectorAll("ol > li"))) {
      const match = (li.textContent ?? "").match(/Item (\d{4})/);
      if (match) labels.push(Number(match[1]));
    }
    return { start, labels };
  });
}

/** Forward walk one page turn (keyboard), waiting for observable change. */
async function turnForward(page: Page): Promise<void> {
  const before = await scope(page);
  const beforeKey = `${before.startBlock}:${before.startGrapheme ?? 0}:${before.currentPageIdx}`;
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(
      async () => {
        const s = await scope(page);
        return `${s.startBlock}:${s.startGrapheme ?? 0}:${s.currentPageIdx}`;
      },
      { timeout: 15_000 },
    )
    .not.toBe(beforeKey);
  await waitForPaginationSettled(page);
}

/** Cumulative D-05 start offset of each item of a list block (canonical
 * normalization arithmetic — the shared expected-value source). */
function itemStarts(work: ReturnType<typeof giantListArticle>, listIndex: number): number[] {
  const list = work.blocks[listIndex]! as Extract<
    (typeof work.blocks)[number],
    { kind: "numbered-list" }
  >;
  const starts: number[] = [];
  let consumed = 0;
  for (const item of list.items) {
    starts.push(consumed);
    const length = item.content.reduce(
      (sum, child) => sum + graphemeClusters(blockNormalizedText(child), work.lang).length,
      0,
    );
    consumed += length + 1; // BLOCK_SEPARATOR between items
  }
  return starts;
}

/** "Item NNNN" label of ordinal n. */
test.beforeEach(async ({ page }) => {
  await prepareFreshPage(page);
  await seedRows(page, { articles: [article] });
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  console.log(
    "giant-containers diagnostics",
    await page.evaluate(() => {
      const w = window as unknown as {
        __lemDiagnosticBus?: { recent: () => unknown[] };
        __lemPagination?: { status: string; reason?: string; scope: unknown; pagesLength: number };
      };
      const dev = w.__lemPagination;
      return {
        events: w.__lemDiagnosticBus?.recent().slice(-8),
        status: dev?.status,
        reason: dev?.reason,
        scope: dev?.scope,
        pages: dev?.pagesLength,
        banner: !!document.querySelector(".pagination-fallback-banner"),
      };
    }),
  );
});

test("a giant numbered list opens paginated under a bounded projection", async ({ page }) => {
  await open(page);
  await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
  await expect(page.locator(".page-indicator")).toContainText("in this portion");
  // Bounded projection: the hidden measurement body holds only the current
  // window's blocks (heading + the projected list chunk — never the work).
  const measured = await page
    .locator(".article-body-measurement [data-block-index]")
    .evaluateAll((els) => els.map((el) => Number(el.getAttribute("data-block-index"))));
  expect(measured.length).toBeLessThanOrEqual(2);
  expect(measured).toContain(0);
  // The visible page renders the list with its original semantics and
  // numbering (item 0000 opens the work at ordinal 1).
  const list = await renderedList(page);
  expect(list.start).toBe(1);
  expect(list.labels[0]).toBe(0);
  await expect(page.locator(".page-fragment ol > li").first()).toContainText("Item 0000");
});

test("ordered numbering and item coverage advance strictly across pages and seams", async ({
  page,
}) => {
  await open(page);
  const cursorKey = (s: Scope) => `${s.startBlock}:${s.startGrapheme ?? 0}`;
  const earlierThan = (a: string, b: string) => {
    const [aBlock, aGrapheme] = a.split(":").map(Number);
    const [bBlock, bGrapheme] = b.split(":").map(Number);
    if (aBlock !== bBlock) return aBlock! < bBlock!;
    return (aGrapheme ?? 0) < (bGrapheme ?? 0);
  };
  let crossedSeams = 0;
  let previousCursor = cursorKey(await scope(page));
  let previousLastLabel = -1;
  let sawNumberingContinue = false;
  for (let turn = 0; turn < 40 && crossedSeams < 1; turn++) {
    const before = await scope(page);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(2);
    if (cursorKey(before) !== previousCursor) {
      // A window flip must strictly ADVANCE the source cursor.
      expect(earlierThan(previousCursor, cursorKey(before))).toBe(true);
      crossedSeams += 1;
      previousCursor = cursorKey(before);
      previousLastLabel = -1; // numbering continues across the seam too
    }
    // Every page renders a CONTIGUOUS ascending slice of the fixture's
    // items, and the <ol start> equals the first rendered item's original
    // ordinal (one past the previous item; an amputated slice head makes
    // start equal the first FOUND label).
    const list = await renderedList(page);
    expect(list.labels.length).toBeGreaterThan(0);
    for (let k = 1; k < list.labels.length; k++) {
      expect(list.labels[k]).toBe(list.labels[k - 1]! + 1);
    }
    expect([list.labels[0]!, list.labels[0]! + 1]).toContain(list.start);
    // No item repeats across pages: each page's first label is strictly
    // newer than the previous page's last label.
    expect(list.labels[0]!).toBeGreaterThan(previousLastLabel);
    if (list.start > 1) sawNumberingContinue = true;
    previousLastLabel = list.labels.at(-1)!;
    await turnForward(page);
  }
  expect(crossedSeams).toBeGreaterThanOrEqual(1);
  // The walk proved numbering continuation on real continuation pages.
  expect(sawNumberingContinue).toBe(true);
  // Backward across the LAST seam: the earlier continuation's final page
  // re-renders with its own numbering and item slice — nothing is lost or
  // duplicated by the way back.
  let s = await scope(page);
  let guard = 0;
  while (s.currentPageIdx > 0 && guard++ < 16) {
    const beforeIdx = s.currentPageIdx;
    await page.keyboard.press("ArrowLeft");
    await expect
      .poll(async () => (await scope(page)).currentPageIdx, { timeout: 15_000 })
      .toBeLessThan(beforeIdx + 1);
    await waitForPaginationSettled(page);
    s = await scope(page);
  }
  const backBefore = cursorKey(s);
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(async () => cursorKey(await scope(page)), { timeout: 15_000 })
    .not.toBe(backBefore);
  await waitForPaginationSettled(page);
  const back = await scope(page);
  expect(back.startGrapheme ?? 0).toBeLessThan(7989); // the BEFORE-seam continuation
  const backList = await renderedList(page);
  expect(backList.labels.length).toBeGreaterThan(0);
  expect(backList.start).toBeGreaterThan(1); // the continuation's tail items
  expect([backList.labels[0]!, backList.labels[0]! + 1]).toContain(backList.start);
  await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
});

test("a quotation with nested blocks paginates across pages, keeping semantics", async ({
  page,
}) => {
  const quote = giantQuoteArticle();
  await seedRows(page, { articles: [quote] });
  await open(page, quote);
  await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
  // Quotation semantics survive the projection: blockquote elements render.
  await expect(page.locator(".page-fragment blockquote").first()).toBeVisible();
  // Quoted-passage labels advance strictly page over page — source order,
  // every passage extracted at most once.
  let previousLabel = -1;
  for (let turn = 0; turn < 8; turn++) {
    expect(await pageOverflow(page)).toBeLessThanOrEqual(2);
    const labels = await page.locator(".page-fragment").evaluate((fragment) => {
      const out: number[] = [];
      for (const node of Array.from(fragment.querySelectorAll("p"))) {
        const match = (node.textContent ?? "").match(/Quoted passage (\d{4})/);
        if (match) out.push(Number(match[1]));
      }
      return out;
    });
    for (const label of labels) {
      expect(label).toBeGreaterThan(previousLabel);
      previousLabel = label;
    }
    await turnForward(page);
  }
  expect(previousLabel).toBeGreaterThan(-1);
  // Close/resume at a saved position at the nested witness (the giant child
  // contributes 22999 D-05 graphemes; the separator precedes the witness):
  // the restored page renders the INNER blockquote — multiple nested blocks
  // stay reachable and semantic across continuations.
  const quoteIndex = articleGraphemeIndex(quote);
  const quoteStart = quoteIndex.blockStartOffsets[1]!;
  await markPaginationEpoch(page);
  await seedRows(page, {
    locations: [
      LocationRecordSchema.parse({
        schemaVersion: 1,
        articleId: quote.id,
        revision: quote.revision,
        graphemeOffset: quoteStart + 23000,
        savedAt: "2026-01-02T00:00:00Z",
      }),
    ],
  });
  await page.reload();
  await waitForPaginationSettled(page);
  await expect(page.locator(".page-fragment blockquote blockquote")).toBeVisible();
  await expect(page.locator(".page-fragment")).toContainText("witness within the witness");
  await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
});

test("one enormous list item paginates INSIDE the item with honest numbering", async ({ page }) => {
  const work = giantListItemArticle();
  await seedRows(page, { articles: [work] });
  await open(page, work);
  await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
  // The work's first page transition cuts INSIDE the giant fourth item:
  // the second page opens at ordinal 4 (numbering never restarts) with the
  // item's mid-passage tail.
  await turnForward(page);
  const inside = await renderedList(page);
  expect(inside.start).toBe(4);
  expect(inside.labels.every((label) => label < 4)).toBe(true); // still pre-item-4 text
  // Every page inside the item advances the passage labels strictly.
  let previousLabel = -1;
  for (let turn = 0; turn < 5; turn++) {
    const labels = await page.locator(".page-fragment").evaluate((fragment) => {
      const out: number[] = [];
      for (const node of Array.from(fragment.querySelectorAll("p"))) {
        const match = (node.textContent ?? "").match(/Quoted passage (\d{4})/);
        if (match) out.push(Number(match[1]));
      }
      return out;
    });
    for (const label of labels) {
      expect(label).toBeGreaterThan(previousLabel);
      previousLabel = label;
    }
    expect(await pageOverflow(page)).toBeLessThanOrEqual(2);
    await turnForward(page);
  }
  expect(previousLabel).toBeGreaterThan(-1);
  // Eventually the giant item ENDS and the ordinary items 5-6 render with
  // their original ordinals.
  let guard = 0;
  let sawPlainTail = false;
  while (guard++ < 40 && !sawPlainTail) {
    const tail = await renderedList(page);
    if (tail.labels.some((label) => label >= 5)) {
      sawPlainTail = true;
      // The plain tail renders at its ORIGINAL ordinal (6): one past the
      // previous item, or exactly the first FOUND label when the slice head
      // amputated item 5's label.
      expect([tail.labels[0]!, tail.labels[0]! + 1]).toContain(tail.start);
    }
    if (!sawPlainTail) await turnForward(page);
  }
  expect(sawPlainTail).toBe(true);
  await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
});

test("highlights span a list seam and a fresh highlight stores original coordinates", async ({
  page,
}) => {
  // Seed a highlight that SPANS the first seam (7989 into the list): both
  // continuations must render their slice of the SAME annotation.
  const seam = LIST_START + 7989;
  const position = { start: seam - 400, end: seam + 400 };
  const highlight = HighlightRecordSchema.parse({
    schemaVersion: 1,
    id: "list-cross-seam-highlight",
    articleId: article.id,
    revision: article.revision,
    position,
    quote: deriveQuoteSelector(article, position),
    createdAt: "2026-01-01T00:00:00Z",
  });
  await seedRows(page, {
    highlights: [highlight],
    locations: [
      LocationRecordSchema.parse({
        schemaVersion: 1,
        articleId: article.id,
        revision: article.revision,
        graphemeOffset: seam + 200,
        savedAt: "2026-01-01T00:00:00Z",
      }),
    ],
  });
  await open(page);
  // Restore lands in the AFTER-seam continuation; its highlight slice shows.
  const expected = blockWindowForOffset(article, seam + 200);
  await expect
    .poll(async () => scope(page), { timeout: 20_000 })
    .toMatchObject({
      startBlock: expected.startBlock,
      startGrapheme: expected.startGrapheme ?? 0,
    });
  await expect(
    page.locator('mark[data-highlight-id="list-cross-seam-highlight"]').first(),
  ).toBeVisible();
  // Previous crosses back over the seam; the BEFORE-seam slice re-renders
  // there (D5-16 — no silent gap at a continuation boundary).
  let guard = 0;
  let s = await scope(page);
  while (s.currentPageIdx > 0 && guard++ < 16) {
    const beforeIdx = s.currentPageIdx;
    await page.keyboard.press("ArrowLeft");
    await expect
      .poll(async () => (await scope(page)).currentPageIdx, { timeout: 15_000 })
      .toBeLessThan(beforeIdx + 1);
    await waitForPaginationSettled(page);
    s = await scope(page);
  }
  await expect(
    page.locator('mark[data-highlight-id="list-cross-seam-highlight"]').first(),
  ).toBeVisible();
  // Walk FORWARD past the seeded highlight's range (global ~7601-8401 =
  // items ~0190-0209) so the fresh selection below lands on clean items:
  // the PAGE'S FIRST rendered item must be past the highlight's end.
  for (let clean = 0; clean < 8; clean++) {
    const labels = (await renderedList(page)).labels;
    if (labels.length > 0 && labels[0]! >= 215) break;
    await turnForward(page);
  }
  // A fresh highlight on a projected list page stores the ORIGINAL stream's
  // coordinates: select the first 24 characters of the first list item —
  // capture must offset by the slice origin so the stored position
  // addresses the canonical substrate, not the projection.
  await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.page-fragment [data-block-index="1"] li p');
    if (!el) throw new Error("no projected list paragraph");
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode() as Text | null;
    if (!first || (first.nodeValue?.length ?? 0) < 24) throw new Error("short text node");
    const range = document.createRange();
    range.setStart(first, 0);
    range.setEnd(first, 24);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  const toolbar = page.locator(".selection-toolbar");
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole("button", { name: "Slot 1: Default" }).click();
  const mark = page.locator("mark[data-highlight-id]").first();
  await expect(mark).toBeVisible();
  // A fresh document restores a highlight whose marks still render — the
  // coordinates round-tripped through the original D-05 substrate.
  await page.reload();
  await waitForPaginationSettled(page);
  await expect(page.locator("mark[data-highlight-id]").first()).toBeVisible();
  await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
});

test("a saved mid-list position and close/resume keep the original continuation", async ({
  page,
}) => {
  // Seed a position deep in the second continuation (list offset 11000).
  const intoList = 8000 + 3000;
  const offset = LIST_START + intoList;
  const starts = itemStarts(article, 1);
  const expectedItem = starts.findIndex(
    (start, k) => intoList >= start && intoList < (starts[k + 1] ?? Number.POSITIVE_INFINITY),
  );
  expect(expectedItem).toBeGreaterThan(0);
  await seedRows(page, {
    locations: [
      LocationRecordSchema.parse({
        schemaVersion: 1,
        articleId: article.id,
        revision: article.revision,
        graphemeOffset: offset,
        savedAt: "2026-01-01T00:00:00Z",
      }),
    ],
  });
  await open(page);
  const expected = blockWindowForOffset(article, offset);
  await expect
    .poll(async () => scope(page), { timeout: 20_000 })
    .toMatchObject({
      startBlock: expected.startBlock,
      startGrapheme: expected.startGrapheme ?? 0,
    });
  const restored = await scope(page);
  expect(await pageOverflow(page)).toBeLessThanOrEqual(2);
  // The restored page contains the item the offset addresses (the page
  // holding the passage; slice amputation may hide its label, never the
  // passage itself).
  const labels = (await renderedList(page)).labels;
  expect(labels.at(-1)!).toBeGreaterThanOrEqual(expectedItem);
  expect(labels[0]!).toBeLessThanOrEqual(expectedItem + 1);
  // Close/resume: a reload restores the same continuation.
  await page.reload();
  await expect
    .poll(async () => scope(page), { timeout: 20_000 })
    .toMatchObject({ startGrapheme: restored.startGrapheme ?? 0 });
  await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
});

test("text-size reflow re-anchors inside the same list continuation without fallback", async ({
  page,
}) => {
  const offset = LIST_START + 9000;
  await seedRows(page, {
    locations: [
      LocationRecordSchema.parse({
        schemaVersion: 1,
        articleId: article.id,
        revision: article.revision,
        graphemeOffset: offset,
        savedAt: "2026-01-01T00:00:00Z",
      }),
    ],
  });
  await open(page);
  const expected = blockWindowForOffset(article, offset);
  await expect
    .poll(async () => scope(page), { timeout: 20_000 })
    .toMatchObject({ startBlock: expected.startBlock, startGrapheme: expected.startGrapheme ?? 0 });
  const before = await scope(page);
  await markPaginationEpoch(page);
  // Hold the font gate so the reflow is observable through readiness.
  await page.evaluate(() => {
    const ready = document.fonts.ready;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const w = window as unknown as {
      __measurementWaiting?: boolean;
      __releaseMeasurement?: () => void;
    };
    Object.defineProperty(document.fonts, "ready", {
      configurable: true,
      get() {
        w.__measurementWaiting = true;
        return gate.then(() => ready);
      },
    });
    w.__releaseMeasurement = () => {
      Reflect.deleteProperty(document.fonts, "ready");
      release();
    };
  });
  await page.getByRole("button", { name: "Reading settings" }).click();
  const slider = page.getByRole("slider", { name: "Text size" });
  await slider.focus();
  await slider.press("End");
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => (window as unknown as { __measurementWaiting: boolean }).__measurementWaiting,
  );
  await page.evaluate(() =>
    (window as unknown as { __releaseMeasurement: () => void }).__releaseMeasurement(),
  );
  await waitForRepagination(page);
  await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
  // Continuation seams are CONTENT-derived (window capacity), so the same
  // list continuation holds the reader's passage through the reflow.
  const after = await scope(page);
  expect(after.startBlock).toBe(before.startBlock);
  expect(after.startGrapheme ?? 0).toBe(before.startGrapheme ?? 0);
  expect(await pageOverflow(page)).toBeLessThanOrEqual(2);
});

test("short lists and quotations keep their pre-#234 single-window shape", async ({ page }) => {
  const short = shortListQuoteArticle();
  await seedRows(page, { articles: [short] });
  await open(page, short);
  await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
  // Block-aligned windows: no slice bounds anywhere in the published scope.
  const s = await scope(page);
  expect(s.startGrapheme).toBeUndefined();
  expect(s.endGrapheme).toBeUndefined();
  // Rendering is unchanged: the <ol> keeps its authored start (4) and all
  // three items; the quotation renders both of its lines.
  const state = await page.locator(".page-fragment").evaluate((fragment) => ({
    start: Number(fragment.querySelector("ol")?.getAttribute("start") ?? "-1"),
    items: fragment.querySelectorAll("ol > li").length,
    quote: fragment.querySelectorAll("blockquote").length,
    quoteLines: fragment.querySelectorAll("blockquote > p").length,
  }));
  expect(state.start).toBe(4);
  expect(state.items).toBe(3);
  expect(state.quote).toBe(1);
  expect(state.quoteLines).toBe(2);
  expect(await pageOverflow(page)).toBeLessThanOrEqual(2);
});
