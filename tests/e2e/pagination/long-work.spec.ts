import { test, expect, type Page } from "@playwright/test";
import { longProseArticle } from "../../fixtures/longProse";
import { articleGraphemeIndex, deriveQuoteSelector } from "../../../src/content/normalizeText";
import { windowGlobalEnd, windowGlobalStart } from "../../../src/pagination/blockWindow";
import { HighlightRecordSchema, LocationRecordSchema } from "../../../src/content/schema";
import { prepareFreshPage, seedRows } from "../portability/_portability";
import {
  markPaginationEpoch,
  readPagination,
  waitForPaginationSettled,
  waitForRepagination,
  waitForTurnAcknowledged,
} from "./_harness";
import { BASE } from "../_base";
import { installFakeSpeech } from "../readaloud/_speech";
import { playAndAwaitProbe } from "../readaloud/_harness";

const article = longProseArticle();
const index = articleGraphemeIndex(article);

type Dev = NonNullable<Awaited<ReturnType<typeof readPagination>>>;
type WindowedDev = Dev & { scope: NonNullable<Dev["scope"]> };

/** The long-work surface is always windowed; a publication without source
 * bounds here is a contract break, not a shape to work around. */
function windowed(dev: Dev): WindowedDev {
  if (!dev.scope) {
    throw new Error("long-work: publication has no measurement scope — the windowed surface was expected");
  }
  return dev as WindowedDev;
}

async function scope(page: Page): Promise<WindowedDev> {
  const dev = await readPagination(page);
  if (!dev) throw new Error("long-work: no DEV pagination publication — surface not mounted?");
  return windowed(dev);
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
        mode: document.querySelector("[aria-label^='Reading mode']")?.getAttribute("aria-label"),
        banner: !!document.querySelector(".pagination-fallback-banner"),
        fragmentFirstText: document
          .querySelector(".page-fragment p, .page-fragment h2")
          ?.textContent?.slice(0, 60),
        indicator: document.querySelector(".page-indicator")?.textContent,
      };
    }),
  );
});

test("long prose measures a bounded window and normal page controls cross it in both directions", async ({
  page,
}) => {
  // ── The turn contract this walk pins (issue #254) ─────────────────────────
  //
  // Each turn is judged by TWO independent observables, both from the shared
  // readiness harness (_harness.ts):
  //
  //   1. ACKNOWLEDGMENT — waitForTurnAcknowledged(page, before) resolves only
  //      when a NEW publication (publicationSeq strictly greater than the
  //      pre-turn read) committed "ok" and finished its overflow guard. A
  //      stale settled state cannot satisfy it (the sequence is unchanged);
  //      an unchanged page index cannot satisfy it (the index is not
  //      consulted); a disabled turn handler publishes nothing and times out
  //      at the budget. Guard corrections publish their own higher sequence,
  //      so the acknowledged publication is the post-correction settled
  //      state — legitimate overflow correction and mid-turn reflow stay
  //      supported (the "font, viewport, and mode changes preserve a distant
  //      passage" cell below is the controlled-reflow green).
  //   2. CANONICAL MOVEMENT — the reader's anchor (anchorOffset, the
  //      article-global D-05 coordinate incl. the end-pin rule) must move
  //      FORWARD for Next and BACKWARD for Previous. Page numbers may wobble
  //      when a correction re-anchors within the same passage; the anchor is
  //      the passage. A no-op and a regression both fail here.
  //
  // MUTATION PROTOCOL (run 2026-11-04 on this branch; restore immediately —
  // the final tree carries no mutation):
  //   - RED: in src/reader/PaginatedSurface.tsx commitTurn, force
  //     `const moved = false;` (disables the shared turn path: chevrons,
  //     keyboard bundle, imperative handle). The walk's FIRST
  //     waitForTurnAcknowledged times out at its budget — no publication,
  //     no anchor movement. With the OLD >= page-index poll this mutation
  //     passed silently: the already-settled publication satisfied the poll
  //     immediately.
  //   - GREEN: restore `moved`; the walk passes again (acknowledgment +
  //     strict canonical advance per turn).
  //   - REFLOW GREEN: the "font, viewport, and mode changes preserve a
  //     distant passage" cell — a controlled legitimate reflow through the
  //     SAME helpers — stays green with and without the mutation's source
  //     restored (reflow publications acknowledge without page movement).
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
    // Turn via the shared keyboard path (PageTurnControls' window bundle →
    // the SAME imperative turn the chevrons use). Two earlier activation
    // strategies stalled here: pointer clicks lost to layout commits
    // landing between down and up, and synthetic Enter on a focused button
    // — WebKit does not run a button's default activation from an
    // untrusted keydown, so the activation silently never fired. The
    // bundle listener receives synthetic keys reliably in every engine.
    await page.keyboard.press("ArrowRight");
    // WITHIN-WINDOW: acknowledged + the canonical passage advanced.
    const after = await waitForTurnAcknowledged(page, before, "next");
    expect(after.anchorOffset).toBeGreaterThan(before.anchorOffset!);
  }
  const atBoundary = await scope(page);
  expect(atBoundary.currentPageIdx).toBe(atBoundary.pagesLength - 1);
  await expect(page.getByRole("button", { name: "Mark read and close" })).toHaveCount(0);
  await expect(next).toHaveAttribute("aria-disabled", "false");
  // WINDOW BOUNDARY — pointer modality: the chevron crosses to the next
  // continuation. Canonical movement holds in the original coordinate (the
  // next window starts strictly after this window's last page anchor), and
  // the source bounds prove the crossing without consulting page numbers.
  const beforeCross = await scope(page);
  await next.click();
  const afterCross = await waitForTurnAcknowledged(page, beforeCross, "next");
  expect(windowed(afterCross).scope.startBlock).toBe(first.scope.endBlock);
  expect(afterCross.anchorOffset).toBeGreaterThan(beforeCross.anchorOffset!);
  const second = await scope(page);
  expect(second.currentPageIdx).toBe(0);
  await page.keyboard.press("ArrowLeft");
  const afterBack = await waitForTurnAcknowledged(page, second, "previous");
  // WINDOW BOUNDARY — keyboard modality: Previous crosses BACK to the first
  // window's final page; the canonical anchor moves backward and the source
  // bounds return to the work's origin.
  expect(afterBack.anchorOffset).toBeLessThan(second.anchorOffset!);
  expect(windowed(afterBack).scope.startBlock).toBe(0);
  expect(afterBack.currentPageIdx).toBe(afterBack.pagesLength - 1);
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
  // CONTROLLED LEGITIMATE REFLOW (issue #254): the acknowledgment contract
  // must stay green for a reflow — the reflow publishes a NEW acknowledged
  // publication (a strictly greater sequence than this pre-reflow read)
  // while the canonical passage is PRESERVED (PAGE-06/D4-11): page numbers
  // and page boundaries may move; the window keeps covering the passage.
  // This is the reflow-green leg of the mutation protocol documented in the
  // walk cell above.
  const beforeReflow = await scope(page);
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
  // The reflow's own acknowledgment + canonical preservation (issue #254):
  // a NEW publication committed, and the passage's source window is
  // unchanged — asserted on the scope's bounds and the anchor coordinate,
  // never on a page number.
  const afterReflow = await scope(page);
  expect(afterReflow.publicationSeq).toBeGreaterThan(beforeReflow.publicationSeq!);
  expect(afterReflow.scope.startBlock).toBe(beforeReflow.scope.startBlock);
  expect(afterReflow.scope.endBlock).toBe(beforeReflow.scope.endBlock);
  // The canonical anchor still names a passage INSIDE the same source
  // window (the anchor is the page's start offset; page boundaries moved,
  // the window bounds did not). The window range uses the SHARED coordinate
  // definitions (windowGlobalStart/End — REUSE, never a fork of the
  // arithmetic).
  const windowStart = windowGlobalStart(article, afterReflow.scope);
  const windowEnd = windowGlobalEnd(article, afterReflow.scope);
  expect(afterReflow.anchorOffset).toBeGreaterThanOrEqual(windowStart);
  expect(afterReflow.anchorOffset).toBeLessThan(windowEnd);
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
