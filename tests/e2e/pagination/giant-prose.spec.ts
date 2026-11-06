// Issue #233 — giant-prose bounded continuations in the real reader.
//
// A work whose single paragraph exceeds the whole-document page ceiling
// opens PAGINATED: only a bounded source projection is ever rendered or
// measured (one window at a time), Next/Previous cross continuations in
// both directions, a late saved passage and cross-seam highlight restore
// into their own continuations, speech follows across a seam without
// restarting playback, reflow re-anchors within the same continuation,
// and only the TRUE work end offers completion. A giant atomic block
// (code) keeps its explicit typed failure. Observable readiness only —
// the __lemPagination DEV publication + the shared harness waits — never
// fixed sleeps.
import { test, expect, type Page } from "@playwright/test";
import { giantProseArticle, giantCodeArticle } from "../../fixtures/giantProse";
import { articleGraphemeIndex, deriveQuoteSelector } from "../../../src/content/normalizeText";
import { blockWindowForOffset } from "../../../src/pagination/blockWindow";
import {
  ArticleSchema,
  HighlightRecordSchema,
  LocationRecordSchema,
  ReaderSettingsSchema,
} from "../../../src/content/schema";
import { prepareFreshPage, seedRows, readRow } from "../portability/_portability";
import { waitForPaginationSettled, waitForRepagination, markPaginationEpoch } from "./_harness";
import { BASE } from "../_base";
import { installFakeSpeech } from "../readaloud/_speech";
import { playAndAwaitProbe } from "../readaloud/_harness";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";

const article = giantProseArticle();
const index = articleGraphemeIndex(article);
// The giant block starts after the heading + one separator (pure ASCII).
const GIANT_START = index.blockStartOffsets[1]!;
const SEAM = 7992; // first window's giant-grapheme capacity (8000 - heading 8)

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
  // Tolerate a mid-reload/pre-publication window: wait for the DEV
  // publication to exist, then read it (pollers below keep polling anyway).
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

async function open(page: Page, viewport = { width: 360, height: 700 }): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto(`${BASE}/#/article/${article.id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: article.provenance.title }),
  ).toBeVisible();
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

test.beforeEach(async ({ page }) => {
  await prepareFreshPage(page);
  await seedRows(page, { articles: [article] });
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  console.log(
    "giant-prose diagnostics",
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

test("a giant paragraph opens paginated under a bounded projection", async ({ page }) => {
  await open(page);
  // The whole-document path would fall back (the work exceeds the page
  // ceiling); the windowed path stays paginated with an honest portion label.
  await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
  await expect(page.locator(".page-indicator")).toContainText("in this portion");
  // Bounded projection: the hidden measurement body holds only the current
  // window's blocks (heading + the projected giant chunk — never the work).
  const measured = await page
    .locator(".article-body-measurement [data-block-index]")
    .evaluateAll((els) => els.map((el) => Number(el.getAttribute("data-block-index"))));
  expect(measured.length).toBeLessThanOrEqual(2);
  expect(measured).toContain(0);
  // The visible page renders giant-prose text with the projected slice's
  // origin recorded (issue #233's window head/tail projection contract).
  await expect(page.locator(".page-fragment p").first()).toContainText("Segment 0000");
});

test("turning pages crosses continuations with strict advance, no clipping, and a working way back", async ({
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
  const seen = new Set<string>();
  let previousCursor = cursorKey(await scope(page));
  let crossedSeams = 0;
  for (let turn = 0; turn < 90 && crossedSeams < 3; turn++) {
    const before = await scope(page);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(2);
    const key = cursorKey(before);
    if (key !== previousCursor) {
      // A window flip must strictly ADVANCE the source cursor — never
      // revisit an earlier continuation.
      expect(earlierThan(previousCursor, key)).toBe(true);
      crossedSeams += 1;
      seen.add(key);
      previousCursor = key;
    }
    const beforeKey = `${key}:${before.currentPageIdx}`;
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(
        async () => {
          const s = await scope(page);
          return `${cursorKey(s)}:${s.currentPageIdx}`;
        },
        { timeout: 15_000 },
      )
      .not.toBe(beforeKey);
    await waitForPaginationSettled(page);
  }
  expect(crossedSeams).toBeGreaterThanOrEqual(3);
  expect(seen.size).toBeGreaterThanOrEqual(3);
  // Previous crosses back across the last seam: walk to the continuation's
  // head page first, then one more turn lands the EARLIER continuation's
  // FINAL page (its last page, not page 1).
  let s = await scope(page);
  let guard = 0;
  while (s.currentPageIdx > 0 && guard++ < 16) {
    await page.keyboard.press("ArrowLeft");
    await expect
      .poll(async () => (await scope(page)).currentPageIdx, { timeout: 15_000 })
      .toBeLessThan(s.currentPageIdx + 1);
    await waitForPaginationSettled(page);
    s = await scope(page);
  }
  const beforeBack = `${s.startBlock}:${s.startGrapheme ?? 0}`;
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(
      async () => {
        const cur = await scope(page);
        return `${cur.startBlock}:${cur.startGrapheme ?? 0}`;
      },
      { timeout: 15_000 },
    )
    .not.toBe(beforeBack);
  await waitForPaginationSettled(page);
  const back = await scope(page);
  // The back-turn lands the EARLIER continuation's FINAL page (the walk
  // stopped three seams deep, so the previous continuation opens at 15992).
  expect(back.startGrapheme ?? 0).toBe(15992);
  expect(back.currentPageIdx).toBe(back.pagesLength - 1);
  await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
});

test("a late saved passage and a cross-seam highlight restore in their continuations", async ({
  page,
}) => {
  // Just past a mid-work seam (47992 = 7992 + 5×8000): the restore must
  // land in the continuation AFTER it; the seeded highlight SPANS the seam.
  const seam = SEAM + 5 * 8000;
  const offset = GIANT_START + seam + 108;
  const highlightStart = GIANT_START + seam - 1000;
  const position = { start: highlightStart, end: highlightStart + 2000 };
  const highlight = HighlightRecordSchema.parse({
    schemaVersion: 1,
    id: "giant-cross-seam-highlight",
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
        graphemeOffset: offset,
        savedAt: "2026-01-01T00:00:00Z",
      }),
    ],
  });
  await open(page);
  // The restore flips to a DIFFERENT continuation than the opening one —
  // wait for THAT publication (never a single post-open read).
  const expected = blockWindowForOffset(article, offset);
  await expect
    .poll(async () => scope(page), { timeout: 20_000 })
    .toMatchObject({
      startBlock: expected.startBlock,
      startGrapheme: expected.startGrapheme ?? 0,
    });
  const restored = await scope(page);
  expect(restored.startGrapheme).toBe(seam); // the continuation AFTER the seam
  expect(await pageOverflow(page)).toBeLessThanOrEqual(2);
  // The after-seam slice of the highlight renders here.
  await expect(page.locator('mark[data-highlight-id="giant-cross-seam-highlight"]')).toBeVisible();
  // Previous crosses BACK over the seam: the before-seam slice re-renders
  // there (D5-16 — no silent gap at a continuation boundary), still mapped
  // to the original coordinates, with the article identity untouched.
  let guard = 0;
  let s = await scope(page);
  while (s.currentPageIdx > 0 && guard++ < 16) {
    const beforeIdx = s.currentPageIdx;
    await page.keyboard.press("ArrowLeft");
    await expect
      .poll(async () => (await scope(page)).currentPageIdx, { timeout: 15_000 })
      .toBeLessThan(beforeIdx);
    await waitForPaginationSettled(page);
    s = await scope(page);
  }
  const beforeBack = `${s.startBlock}:${s.startGrapheme ?? 0}`;
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(
      async () => {
        const cur = await scope(page);
        return `${cur.startBlock}:${cur.startGrapheme ?? 0}`;
      },
      { timeout: 15_000 },
    )
    .not.toBe(beforeBack);
  await waitForPaginationSettled(page);
  const back = await scope(page);
  expect(back.startGrapheme ?? 0).toBeLessThan(seam); // the BEFORE-seam continuation
  await expect(page.locator('mark[data-highlight-id="giant-cross-seam-highlight"]')).toBeVisible();
  // The back-walk advanced the reader's saved location. Wait for the
  // persisted row to carry the walked continuation (the observable truth
  // about what a fresh boot will restore), THEN reload and prove the same
  // continuation restores.
  const walkedStart = GIANT_START + (back.startGrapheme ?? 0);
  const walkedEnd = GIANT_START + seam;
  await expect
    .poll(
      async () => {
        const row = await readRow(page, "location", [article.id, article.revision]);
        const offset = typeof row?.graphemeOffset === "number" ? row.graphemeOffset : -1;
        return offset >= walkedStart && offset < walkedEnd;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  await page.reload();
  await expect
    .poll(async () => scope(page), { timeout: 20_000 })
    .toMatchObject({ startGrapheme: back.startGrapheme ?? 0 });
  await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
});

test("annotation creation on a continuation page stores original global coordinates", async ({
  page,
}) => {
  await open(page);
  // The first page already projects the giant block's head slice (heading +
  // the first chunk share window 0). Select the first 24 characters of the
  // PROJECTED slice: capture must offset by the slice origin
  // (data-block-grapheme-start) so the stored position addresses the
  // ORIGINAL stream, not the projection.
  const ok = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.page-fragment [data-block-index="1"]');
    if (!el) return false;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode() as Text | null;
    if (!first || (first.nodeValue?.length ?? 0) < 24) return false;
    const range = document.createRange();
    range.setStart(first, 0);
    range.setEnd(first, 24);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return true;
  });
  expect(ok).toBe(true);
  const toolbar = page.locator(".selection-toolbar");
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole("button", { name: "Slot 1: Default" }).click();
  const mark = page.locator("mark[data-highlight-id]");
  await expect(mark.first()).toBeVisible();
  // The mark's text is the selected slice text — the projected slice of the
  // ORIGINAL segment 0000 stream (never shifted by the window origin).
  await expect(mark.first()).toContainText("Segment 0000 of the e");
  // A fresh document restores the SAME passage in the SAME continuation —
  // coordinates round-tripped through the original D-05 substrate.
  await page.reload();
  await waitForPaginationSettled(page);
  const restored = await scope(page);
  expect(restored.startBlock).toBeLessThanOrEqual(1);
  await expect(page.locator("mark[data-highlight-id]")).toBeVisible();
  await expect(page.locator("mark[data-highlight-id]")).toContainText("Segment 0000 of the e");
});

test("speech follows across a continuation seam without restarting playback", async ({ page }) => {
  await installFakeSpeech(page, "word");
  await prepareFreshPage(page);
  // The seeded offset opens segment 0210's sentence (segment 210's start,
  // inside window 0's final page — a pure-stride region of the fixture).
  const startOffset = GIANT_START + 210 * 37;
  await seedRows(page, {
    articles: [article],
    locations: [
      LocationRecordSchema.parse({
        schemaVersion: 1,
        articleId: article.id,
        revision: article.revision,
        graphemeOffset: startOffset,
        savedAt: "2026-01-01T00:00:00Z",
      }),
    ],
  });
  await open(page);
  // The restore must have landed on the seeded passage BEFORE playback —
  // wait for the visible page to show it (observable readiness, not sleep).
  await expect
    .poll(
      async () =>
        page
          .locator(".page-fragment p")
          .first()
          .evaluate((el) => el.textContent ?? ""),
      { timeout: 20_000 },
    )
    .toContain("Segment 0210");
  await playAndAwaitProbe(page);
  // Segment 0216's sentence begins exactly at the first seam (7992).
  const reached = await page.evaluate((label) => {
    const w = window as unknown as {
      __speechSpoken: { text: string; volume: number; done: boolean; cancelled: boolean }[];
      __speechFire: (event: string) => void;
    };
    for (let i = 0; i < 300; i++) {
      const live = [...w.__speechSpoken]
        .reverse()
        .find((r) => r.volume === 1 && !r.done && !r.cancelled);
      if (!live) return false;
      if (live.text.startsWith(label)) {
        w.__speechFire("start");
        return true;
      }
      w.__speechFire("end");
    }
    return false;
  }, "Segment 0216 "); // the sentence continues "…of the enormous record."
  expect(reached).toBe(true);
  // The follower dragged the window across the seam: the scope cursor now
  // sits in the second continuation (giant graphemes 7992…).
  await expect.poll(async () => (await scope(page)).startGrapheme, { timeout: 15_000 }).toBe(SEAM);
  await waitForPaginationSettled(page);
  await expect(page.locator("mark.spoken-word")).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as { __speechSpoken: { volume: number; cancelled: boolean }[] }
        ).__speechSpoken.filter((r) => r.volume === 1 && r.cancelled).length,
    ),
  ).toBe(0);
  // "Jump to spoken position" (issue #42 control) must resolve the reader
  // back to the SPOKEN passage's continuation (issue #233 — correct global
  // passage across continuations): pause, wander off to the FIRST window,
  // then jump.
  await page.getByRole("button", { name: "Pause" }).click();
  let wander = 0;
  while ((await scope(page)).startGrapheme !== undefined && wander++ < 30) {
    const before = await scope(page);
    const beforeKey = `${before.startGrapheme ?? 0}:${before.currentPageIdx}`;
    await page.keyboard.press("ArrowLeft");
    await expect
      .poll(
        async () => {
          const s = await scope(page);
          return `${s.startGrapheme ?? 0}:${s.currentPageIdx}`;
        },
        { timeout: 15_000 },
      )
      .not.toBe(beforeKey);
    await waitForPaginationSettled(page);
  }
  expect((await scope(page)).startGrapheme).toBeUndefined(); // genuinely far from speech
  await expect(page.locator("mark.spoken-word")).toHaveCount(0);
  await page.getByRole("button", { name: "Jump to spoken position" }).click();
  await expect.poll(async () => (await scope(page)).startGrapheme, { timeout: 15_000 }).toBe(SEAM);
  await waitForPaginationSettled(page);
  await expect(page.locator("mark.spoken-word")).toBeVisible();
});

test("text-size reflow re-anchors inside the same continuation without fallback", async ({
  page,
}) => {
  const offset = GIANT_START + 48100;
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
  // Wait for the restore's continuation flip to publish before the trigger.
  const expected = blockWindowForOffset(article, offset);
  await expect
    .poll(async () => scope(page), { timeout: 20_000 })
    .toMatchObject({ startBlock: expected.startBlock, startGrapheme: expected.startGrapheme ?? 0 });
  const before = await scope(page);
  await markPaginationEpoch(page);
  // Hold the font gate so the reflow is observable through readiness, not sleep.
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
  // continuation holds the reader's passage through the reflow.
  const after = await scope(page);
  expect(after.startBlock).toBe(before.startBlock);
  expect(after.startGrapheme ?? 0).toBe(before.startGrapheme ?? 0);
  expect(await pageOverflow(page)).toBeLessThanOrEqual(2);
});

test("only the true work end offers completion — a window end never does", async ({ page }) => {
  await open(page);
  // Walk to the FIRST window's final page: still no completion gesture.
  let s = await scope(page);
  let guard = 0;
  while (s.currentPageIdx < s.pagesLength - 1 && guard++ < 20) {
    const beforeKey = `${s.currentPageIdx}`;
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(async () => (await scope(page)).currentPageIdx, { timeout: 15_000 })
      .not.toBe(beforeKey);
    await waitForPaginationSettled(page);
    s = await scope(page);
  }
  expect(s.currentPageIdx).toBe(s.pagesLength - 1);
  await expect(page.getByRole("button", { name: "Mark read and close" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next page", exact: true })).toHaveAttribute(
    "aria-disabled",
    "false",
  );
  // A saved offset inside the LAST continuation opens at the true end.
  const total = index.totalGraphemes;
  await seedRows(page, {
    locations: [
      LocationRecordSchema.parse({
        schemaVersion: 1,
        articleId: article.id,
        revision: article.revision,
        graphemeOffset: total - 10,
        savedAt: "2026-01-02T00:00:00Z",
      }),
    ],
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: article.provenance.title }),
  ).toBeVisible();
  // The restore flips to the last continuation and anchors its final page —
  // poll for the completion gesture (the observable at-end truth).
  await expect
    .poll(async () => page.getByRole("button", { name: "Mark read and close" }).count(), {
      timeout: 20_000,
    })
    .toBe(1);
  await waitForPaginationSettled(page);
  const last = await scope(page);
  expect(last.currentPageIdx).toBe(last.pagesLength - 1);
  await expect(page.getByRole("button", { name: "Next page", exact: true })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

test("a late headingless continuation has no article-start metadata or reserve", async ({
  page,
}) => {
  const headingless = ArticleSchema.parse({
    ...article,
    id: "headingless-giant-prose",
    provenance: {
      ...article.provenance,
      title: "A headingless giant paragraph",
      author: "Fixture author",
    },
    blocks: article.blocks.slice(1),
  });
  await seedRows(page, {
    articles: [headingless],
    locations: [
      LocationRecordSchema.parse({
        schemaVersion: 1,
        articleId: headingless.id,
        revision: 1,
        graphemeOffset: 8_050,
        savedAt: "2026-01-01T00:00:00Z",
      }),
    ],
  });
  await page.setViewportSize({ width: 360, height: 700 });
  await page.goto(`${BASE}/#/article/${headingless.id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: headingless.provenance.title }),
  ).toBeVisible();
  await expect
    .poll(async () => scope(page))
    .toMatchObject({ startBlock: 0, startGrapheme: 8_000, currentPageIdx: 0 });
  await waitForPaginationSettled(page);
  await expect(page.locator(".page-viewport .article-top-meta")).toHaveCount(0);
  await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
  expect(
    await page.locator(".page-fragment").evaluate((el) => el.getAttribute("style") ?? ""),
  ).not.toContain("calc(");
  expect(await pageOverflow(page)).toBeLessThanOrEqual(2);
});

test("a highlight created deep into a giant paragraph retains original passage coordinates", async ({
  page,
}) => {
  const target = GIANT_START + 320_100;
  await seedRows(page, {
    locations: [
      LocationRecordSchema.parse({
        schemaVersion: 1,
        articleId: article.id,
        revision: 1,
        graphemeOffset: target,
        savedAt: "2026-01-01T00:00:00Z",
      }),
    ],
  });
  await open(page);
  const expected = blockWindowForOffset(article, target);
  await expect
    .poll(async () => scope(page), { timeout: 20_000 })
    .toMatchObject({ startGrapheme: expected.startGrapheme });
  await waitForPaginationSettled(page);
  const selected = await page.evaluate(() => {
    const block = document.querySelector('.page-fragment [data-block-index="1"]');
    if (!block) throw new Error("missing projected paragraph");
    const node = document.createTreeWalker(block, NodeFilter.SHOW_TEXT).nextNode() as Text;
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, 24);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return range.toString().trim();
  });
  await page.locator(".selection-toolbar").getByRole("button", { name: "Slot 1: Default" }).click();
  const mark = page.locator("mark[data-highlight-id]").first();
  await expect(mark).toBeVisible();
  const id = await mark.getAttribute("data-highlight-id");
  expect(id).not.toBeNull();
  const row = HighlightRecordSchema.parse(await readRow(page, "highlights", id!));
  expect(row.position.start).toBeGreaterThanOrEqual(GIANT_START + expected.startGrapheme!);
  expect(row.quote.exact).toBe(selected);
  expect(deriveQuoteSelector(article, row.position)).toEqual(row.quote);
  await page.reload();
  await expect
    .poll(async () => scope(page), { timeout: 20_000 })
    .toMatchObject({ startGrapheme: expected.startGrapheme });
  await waitForPaginationSettled(page);
  await expect(page.locator(`mark[data-highlight-id="${id}"]`)).toHaveText(selected);
});

test("a small viewport continues a splittable source window past page capacity", async ({
  page,
}) => {
  // CJK wraps at each grapheme. At 24px in this short/narrow viewport,
  // 8,000 graphemes need more than 300 legal two-line pages. Restore into
  // its late tail so capacity must refine the source window, not fall back.
  const dense = ArticleSchema.parse({
    ...article,
    id: "giant-capacity-prose",
    provenance: { ...article.provenance, title: "Capacity continuation" },
    blocks: [{ kind: "paragraph", content: [{ text: "字".repeat(16_001), marks: [] }] }],
  });
  const target = 7_999;
  await seedRows(page, {
    articles: [dense],
    settings: [
      {
        key: "reader-prefs",
        value: ReaderSettingsSchema.parse({ ...DEFAULT_SETTINGS, size: 24, spacing: "spacious" }),
      },
    ],
    locations: [
      LocationRecordSchema.parse({
        schemaVersion: 1,
        articleId: dense.id,
        revision: 1,
        graphemeOffset: target,
        savedAt: "2026-01-01T00:00:00Z",
      }),
    ],
  });
  await page.setViewportSize({ width: 240, height: 330 });
  // A query change forces a fresh document, so SettingsProvider hydrates the
  // seeded preferences rather than retaining the bootstrap page's defaults.
  await page.goto(`${BASE}/?capacity=1#/article/${dense.id}`);
  await expect(page.getByRole("heading", { level: 1, name: dense.provenance.title })).toBeVisible();
  await expect
    .poll(
      async () =>
        page.evaluate((offset) => {
          const dev = (
            window as unknown as {
              __lemPagination?: {
                overflowSettled: boolean;
                scope?: { startGrapheme?: number };
                currentPageIdx: number;
                pages: { blocks: { startGrapheme: number; endGrapheme: number }[] }[];
              };
            }
          ).__lemPagination;
          const entry = dev?.pages[dev.currentPageIdx]?.blocks[0];
          const start = dev?.scope?.startGrapheme ?? 0;
          return (
            !!entry &&
            !!dev?.overflowSettled &&
            start > 0 &&
            start < 8_000 &&
            entry.startGrapheme <= offset &&
            entry.endGrapheme > offset
          );
        }, target),
      { timeout: 90_000 },
    )
    .toBe(true);
  await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
  expect((await scope(page)).pagesLength).toBeLessThanOrEqual(300);
  expect(await pageOverflow(page)).toBeLessThanOrEqual(2);
  await expect(page.getByRole("button", { name: "Mark read and close" })).toHaveCount(0);
});

test("a giant atomic block keeps its explicit typed failure", async ({ page }) => {
  const codeArticle = giantCodeArticle();
  await seedRows(page, { articles: [codeArticle] });
  await page.setViewportSize({ width: 360, height: 700 });
  await page.goto(`${BASE}/#/article/${codeArticle.id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: codeArticle.provenance.title }),
  ).toBeVisible();
  // The oversized code block cannot split — the REAL engine guard emits
  // oversized-block, the classifier names the SPECIFIC content limit, and
  // the disclosed session flip keeps the work readable in scrolling mode
  // (issue #240: typed reasons, never the generic inference).
  await expect(page.locator(".pagination-fallback-banner")).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByText("An element in this article is too large to fit on one page."),
  ).toBeVisible();
  await expect(page.locator(".pagination-fallback-banner")).toContainText(
    "Switched to scrolling so you can keep reading.",
  );
  // The disclosed flip: the effective mode is scrolling (session-scoped;
  // persistence is covered by fallback-banner.spec.ts).
  await expect(page.locator("article.article-body.paginated-surface")).toHaveCount(0);
  await expect(page.locator(".article-body [data-block-index]").first()).toBeAttached();
});
