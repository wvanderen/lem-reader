import { test, expect, type Page } from "@playwright/test";
import { longProseArticle } from "../../fixtures/longProse";
import { articleGraphemeIndex, deriveQuoteSelector } from "../../../src/content/normalizeText";
import { HighlightRecordSchema, LocationRecordSchema } from "../../../src/content/schema";
import { prepareFreshPage, seedRows } from "../portability/_portability";
import { markPaginationEpoch, waitForPaginationSettled, waitForRepagination } from "./_harness";
import { BASE } from "../_base";
import { installFakeSpeech } from "../readaloud/_speech";
import { playAndAwaitProbe } from "../readaloud/_harness";

const article = longProseArticle();
const index = articleGraphemeIndex(article);

async function scope(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __lemPagination: {
            scope: { startBlock: number; endBlock: number };
            currentPageIdx: number;
            pagesLength: number;
          };
        }
      ).__lemPagination,
  );
}

async function open(page: Page, viewport = { width: 360, height: 700 }) {
  await page.setViewportSize(viewport);
  await page.goto(`${BASE}/#/article/${article.id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: article.provenance.title }),
  ).toBeVisible();
  await waitForPaginationSettled(page);
}

test.beforeEach(async ({ page }) => {
  await prepareFreshPage(page);
  await seedRows(page, { articles: [article] });
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  console.log(
    "long-work diagnostics",
    await page.evaluate(() => {
      const w = window as unknown as {
        __lemDiagnosticBus?: { recent: () => unknown[] };
        __lemPagination?: {
          status: string;
          reason: string;
          scope: unknown;
          pagesLength: number;
          currentPageIdx: number;
        };
      };
      const dev = w.__lemPagination;
      return {
        events: w.__lemDiagnosticBus?.recent().slice(-10),
        status: dev?.status,
        reason: dev?.reason,
        scope: dev?.scope,
        pages: dev?.pagesLength,
        page: dev?.currentPageIdx,
      };
    }),
  );
});

test("long prose measures a bounded window and normal page controls cross it in both directions", async ({
  page,
}) => {
  await open(page);
  const first = await scope(page);
  expect(first.scope.startBlock).toBe(0);
  expect(first.scope.endBlock).toBeLessThan(article.blocks.length);
  expect(
    await page.locator(".article-body-measurement [data-block-index]").count(),
  ).toBeLessThanOrEqual(32);
  await expect(page.locator(".page-indicator")).toContainText("in this portion");
  const next = page.getByRole("button", { name: "Next page", exact: true });
  for (let i = 0; i < 80; i++) {
    const before = await scope(page);
    const overflow = await page
      .locator(".page-fragment")
      .evaluate(
        (fragment) =>
          fragment.scrollHeight -
          (document.querySelector(".page-viewport") as HTMLElement).clientHeight,
      );
    expect(overflow).toBeLessThanOrEqual(2);
    if (before.currentPageIdx === before.pagesLength - 1) break;
    await next.click();
    await expect
      .poll(async () => (await scope(page)).currentPageIdx)
      .toBe(before.currentPageIdx + 1);
    await waitForPaginationSettled(page);
  }
  const atBoundary = await scope(page);
  expect(atBoundary.currentPageIdx).toBe(atBoundary.pagesLength - 1);
  await expect(page.getByRole("button", { name: "Mark read and close" })).toHaveCount(0);
  await expect(next).toHaveAttribute("aria-disabled", "false");
  await next.click();
  await expect.poll(async () => (await scope(page)).scope.startBlock).toBe(first.scope.endBlock);
  await waitForPaginationSettled(page);
  const second = await scope(page);
  expect(second.currentPageIdx).toBe(0);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await scope(page)).scope.startBlock).toBe(0);
  await waitForPaginationSettled(page);
  const previous = await scope(page);
  expect(previous.currentPageIdx).toBe(previous.pagesLength - 1);
  await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
});

test("a keyboard turn across single-page windows hands focus to a fresh boundary", async ({
  page,
}) => {
  await seedRows(page, {
    articles: [
      {
        ...article,
        revision: 2,
        blocks: article.blocks.map((block) =>
          block.kind === "paragraph"
            ? { ...block, content: [{ text: "A short passage.", marks: [] }] }
            : block,
        ),
      },
    ],
  });
  await open(page, { width: 1280, height: 3000 });
  expect((await scope(page)).pagesLength).toBe(1);
  const nextStart = (await scope(page)).scope.endBlock;
  const previousBoundary = await page.locator(".page-start-heading").elementHandle();
  await page.locator(".page-start-heading").focus();
  await page.keyboard.press("PageDown");
  await page.keyboard.press("PageDown"); // a held key must not cancel the pending focus handoff
  await expect.poll(async () => (await scope(page)).scope.startBlock).toBe(nextStart);
  await waitForPaginationSettled(page);
  await expect(page.locator(".page-start-heading")).toBeFocused();
  expect(await previousBoundary!.evaluate((node) => node.isConnected)).toBe(false);
  await expect(page.getByRole("button", { name: "Mark read and close" })).toHaveCount(0);
});

test("a late-work saved passage and highlight restore without reidentifying or measuring the whole work", async ({
  page,
}) => {
  const offset = index.blockStartOffsets[500]!;
  const position = { start: offset, end: offset + 12 };
  const highlight = HighlightRecordSchema.parse({
    schemaVersion: 1,
    id: "windowed-saved-highlight",
    articleId: article.id,
    revision: article.revision,
    position,
    quote: deriveQuoteSelector(article, position),
    createdAt: "2026-01-01T00:00:00Z",
  });
  const location = LocationRecordSchema.parse({
    schemaVersion: 1,
    articleId: article.id,
    revision: article.revision,
    graphemeOffset: offset,
    savedAt: "2026-01-01T00:00:00Z",
  });
  await seedRows(page, { highlights: [highlight], locations: [location] });
  await open(page);
  await expect(page.locator('mark[data-highlight-id="windowed-saved-highlight"]')).toBeVisible();
  await waitForPaginationSettled(page);
  const restored = await scope(page);
  expect(restored.scope.startBlock).toBeLessThanOrEqual(500);
  expect(restored.scope.endBlock).toBeGreaterThan(500);
  expect(
    await page.locator(".article-body-measurement [data-block-index]").count(),
  ).toBeLessThanOrEqual(32);
  await page.reload();
  await expect(page.locator('mark[data-highlight-id="windowed-saved-highlight"]')).toBeVisible();
  await waitForPaginationSettled(page);
  await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
});

test("speech follows across a layout window without restarting playback", async ({ page }) => {
  await installFakeSpeech(page, "word");
  await page.reload();
  await seedRows(page, {
    locations: [
      LocationRecordSchema.parse({
        schemaVersion: 1,
        articleId: article.id,
        revision: article.revision,
        graphemeOffset: index.blockStartOffsets[10]! + 650,
        savedAt: "2026-01-01T00:00:00Z",
      }),
    ],
  });
  await open(page);
  const nextStart = (await scope(page)).scope.endBlock;
  await playAndAwaitProbe(page);
  const reached = await page.evaluate((label) => {
    const w = window as unknown as {
      __speechSpoken: { text: string; volume: number; done: boolean; cancelled: boolean }[];
      __speechFire: (event: string) => void;
    };
    // Each terminal event queues the next utterance synchronously. Walk the
    // real queue, then start that utterance; no timer or synthetic offsets.
    for (let i = 0; i < 100; i++) {
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
  }, `Passage ${nextStart}.`);
  expect(reached).toBe(true);
  await expect.poll(async () => (await scope(page)).scope.startBlock).toBe(nextStart);
  await waitForPaginationSettled(page);
  await expect(page.locator("mark.spoken-word")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as { __speechSpoken: { volume: number; cancelled: boolean }[] }
        ).__speechSpoken.filter((r) => r.volume === 1 && r.cancelled).length,
    ),
  ).toBe(0);
});

test("font, viewport, and mode changes preserve a distant passage", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Table of contents" }).click();
  await page.getByRole("link", { name: "Stage 320", exact: true }).click();
  await expect(page.locator('.page-fragment [data-block-index="320"]')).toBeVisible();
  await waitForPaginationSettled(page);
  await markPaginationEpoch(page);
  // Hold the font gate, not a guessed sleep: the visible DOM may reflow
  // before replacement measurements exist. That must not become a fallback.
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
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForFunction(
    () => (window as unknown as { __measurementWaiting: boolean }).__measurementWaiting,
  );
  await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
  await page.evaluate(() =>
    (window as unknown as { __releaseMeasurement: () => void }).__releaseMeasurement(),
  );
  await waitForRepagination(page);
  // A heading can share its page with the tail of the PRECEDING paragraph.
  // Mode restoration preserves that page's passage, not an assumed heading.
  const firstBlock = await page
    .locator(".page-fragment [data-block-index]")
    .first()
    .getAttribute("data-block-index");
  await page.getByRole("button", { name: "Reading mode: paginated" }).click();
  await expect(page.getByRole("button", { name: "Reading mode: scrolling" })).toBeVisible();
  await expect(
    page.locator(`.article-body:not(.paginated-surface) [data-block-index="${firstBlock}"]`),
  ).toBeInViewport();
  await page.getByRole("button", { name: "Reading mode: scrolling" }).click();
  await expect(page.locator('.page-fragment [data-block-index="320"]')).toBeVisible();
  await waitForPaginationSettled(page);
  expect((await scope(page)).scope.startBlock).toBeGreaterThan(0);
  await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
});

test("TOC jumps load a distant window and only the true work end offers completion", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Table of contents" }).click();
  await page.getByRole("link", { name: "Stage 639", exact: true }).click();
  await expect(page.locator('.page-fragment [data-block-index="639"]')).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => document.activeElement?.textContent))
    .toBe("Stage 639");
  await waitForPaginationSettled(page);
  await expect(page.getByRole("button", { name: "Mark read and close" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next page", exact: true })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});
