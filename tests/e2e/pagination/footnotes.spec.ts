// Issue #235 — footnote bodies in the windowed paginated path, end to end.
//
// Cross-engine layout/focus truth (unit tests own the pure arithmetic):
//   1. TRAVERSAL — the footnotes region participates in bounded traversal:
//      body-window ends do NOT finish a footnoted work; the note pages do.
//   2. REFERENCE ↔ NOTE — clicking a marker loads the note's source window
//      and lands keyboard/screen-reader focus on the note; the back-link
//      returns to the referring marker without losing the destination.
//   3. RESTORATION — a saved passage inside a note restores into the
//      footnote window using the existing canonical offset.
//   4. OVERSIZED NOTE — a note body past the window capacity crosses
//      repeated continuations without omissions, finishing only at the
//      work's true end.
//   5. SPEECH — read-aloud reaches note text across the window boundary
//      without restarting playback; the spoken word renders on the note.
//   6. SINGLE TREE — exactly one exposed fn-N / fn-ref-N id per document;
//      the hidden measurement projection carries none.
//   7. ELIGIBILITY — note rows render no capture binding: highlights still
//      cannot attach to footnote bodies.
import { test, expect, type Page } from "@playwright/test";
import { footnotedWorkArticle } from "../../fixtures/footnotedWork";
import { articleGraphemeIndex, footnoteRows } from "../../../src/content/normalizeText";
import { blockWindowForOffset, sameWindow } from "../../../src/pagination/blockWindow";
import type { BlockWindow } from "../../../src/pagination/blockWindow";
import { LocationRecordSchema } from "../../../src/content/schema";
import { prepareFreshPage, seedRows } from "../portability/_portability";
import { readPagination, waitForPaginationSettled, waitForTurnAcknowledged } from "./_harness";
import { BASE } from "../_base";
import { installFakeSpeech } from "../readaloud/_speech";
import { playAndAwaitProbe } from "../readaloud/_harness";

const article = footnotedWorkArticle();
const index = articleGraphemeIndex(article);
const rows = footnoteRows(article);
const NORTH_WING_NOTE = "The north-wing ledger, shelf 12, folio 3.";

type Dev = NonNullable<Awaited<ReturnType<typeof readPagination>>>;
type WindowedDev = Dev & { scope: NonNullable<Dev["scope"]> };

function windowed(dev: Dev): WindowedDev {
  if (!dev.scope) {
    throw new Error("footnotes: publication has no measurement scope — windowed surface expected");
  }
  return dev as WindowedDev;
}

async function scope(page: Page): Promise<WindowedDev> {
  const dev = await readPagination(page);
  if (!dev) throw new Error("footnotes: no DEV pagination publication");
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

const refBlockIndex = article.blocks.findIndex(
  (block) => block.kind === "footnote-reference" && block.footnoteId === "fn-1",
);

/** Seed a saved passage and open AT it. Restoration loads the passage's
 * SOURCE WINDOW asynchronously — the settled publication must be the window
 * containing the seeded offset (the canonical landing fact, not a page
 * number). */
async function openAtOffset(page: Page, offset: number, viewport = { width: 360, height: 700 }) {
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
  await open(page, viewport);
  const expected: BlockWindow = blockWindowForOffset(article, offset);
  await expect
    .poll(
      async () => {
        const dev = await readPagination(page);
        const s = dev?.scope;
        if (!s) return false;
        return sameWindow(
          {
            startBlock: s.startBlock,
            endBlock: s.endBlock,
            ...(s.startGrapheme !== undefined ? { startGrapheme: s.startGrapheme } : {}),
            ...(s.endGrapheme !== undefined ? { endGrapheme: s.endGrapheme } : {}),
            ...(s.startFootnote !== undefined ? { startFootnote: s.startFootnote } : {}),
            ...(s.endFootnote !== undefined ? { endFootnote: s.endFootnote } : {}),
            ...(s.startFootnoteGrapheme !== undefined
              ? { startFootnoteGrapheme: s.startFootnoteGrapheme }
              : {}),
            ...(s.endFootnoteGrapheme !== undefined
              ? { endFootnoteGrapheme: s.endFootnoteGrapheme }
              : {}),
          },
          expected,
        );
      },
      { timeout: 15_000 },
    )
    .toBe(true);
}

test.beforeEach(async ({ page }) => {
  await prepareFreshPage(page);
  await seedRows(page, { articles: [article] });
});

test("a reference loads its note's window and focus lands on the note", async ({ page }) => {
  // The marker block sits in an early body window; its note lives in the
  // footnotes region — a different source window.
  await openAtOffset(page, index.blockStartOffsets[refBlockIndex]!);
  await expect(page.locator("#fn-ref-1")).toBeVisible();
  const before = await scope(page);
  expect(before.scope.startFootnote).toBeUndefined();
  await page.locator("#fn-ref-1").click();
  // The note's window loads; the note body renders with its scrolling
  // anatomy, and focus lands ON the note (keyboard/screen-reader landing).
  const li = page.locator("#fn-1");
  await expect(li).toBeVisible();
  await expect(li).toBeFocused();
  await expect(li).toContainText(NORTH_WING_NOTE);
  const after = await scope(page);
  expect(after.scope.startFootnote).toBeDefined();
  // The canonical anchor moved into the footnotes region.
  expect(after.anchorOffset).toBeGreaterThanOrEqual(rows[0]!.start);
  // One exposed identifier per document, and none in the hidden tree.
  expect(await page.locator('[id="fn-1"]').count()).toBe(1);
  expect(await page.locator('[id="fn-ref-1"]').count()).toBe(0);
  expect(await page.locator('.article-body-measurement [id^="fn-"]').count()).toBe(0);
});

test("the back-link returns to the referring marker without losing the destination", async ({
  page,
}) => {
  await openAtOffset(page, index.blockStartOffsets[refBlockIndex]!);
  await page.locator("#fn-ref-1").click();
  const li = page.locator("#fn-1");
  await expect(li).toBeVisible();
  await li.locator('a[aria-label="Return to reference 1"]').click();
  // The referring window loads; the marker is visible and focused.
  const ref = page.locator("#fn-ref-1");
  await expect(ref).toBeVisible();
  await expect(ref).toBeFocused();
  const back = await scope(page);
  expect(back.scope.startFootnote).toBeUndefined();
  expect(back.anchorOffset).toBeLessThan(rows[0]!.start);
  // The note's identifier left the document with its page — still exactly
  // one exposed id when present, zero here.
  expect(await page.locator('[id="fn-1"]').count()).toBe(0);
  expect(await page.locator('[id="fn-ref-1"]').count()).toBe(1);
});

test("body-window ends do not finish the work; the note pages do", async ({ page }) => {
  // Restore into the FINAL body window so the end-of-body flow is short.
  await openAtOffset(page, index.blockStartOffsets[78]!);
  const restored = await scope(page);
  expect(restored.scope.startFootnote).toBeUndefined();
  // Turn to the last BODY page.
  let dev = await scope(page);
  for (let i = 0; i < 12; i++) {
    if (dev.currentPageIdx === dev.pagesLength - 1) break;
    const before = dev;
    await page.keyboard.press("ArrowRight");
    dev = windowed(await waitForTurnAcknowledged(page, before, "next"));
  }
  expect(dev.currentPageIdx).toBe(dev.pagesLength - 1);
  expect(dev.scope.startFootnote).toBeUndefined();
  // Body end: the work is NOT finished — no completion gesture yet.
  await expect(page.getByRole("button", { name: "Mark read and close" })).toHaveCount(0);
  // Next crosses into the footnotes region.
  const beforeCross = await scope(page);
  await page.keyboard.press("ArrowRight");
  const crossed = windowed(await waitForTurnAcknowledged(page, beforeCross, "next"));
  expect(crossed.scope.startFootnote).toBeDefined();
  const notes = page.locator('.page-fragment section[aria-label="Footnotes"]');
  await expect(notes).toBeVisible();
  // Walk the note pages across EVERY remaining window to the work's true end.
  let noteDev = crossed;
  for (let i = 0; i < 60; i++) {
    if ((await page.getByRole("button", { name: "Mark read and close" }).count()) > 0) break;
    const before = noteDev;
    await page.keyboard.press("ArrowRight");
    noteDev = windowed(await waitForTurnAcknowledged(page, before, "next"));
  }
  expect(noteDev.anchorOffset).toBe(index.totalGraphemes);
  await expect(page.getByRole("button", { name: "Mark read and close" })).toBeVisible();
});

test("a saved passage inside a note restores into the footnote window", async ({ page }) => {
  await openAtOffset(page, rows[1]!.start + 5);
  const restored = await scope(page);
  expect(restored.scope.startFootnote).toBeDefined();
  await expect(page.locator("#fn-2")).toBeVisible();
  await expect(page.locator("#fn-2")).toContainText("The second ledger confirms the claim");
  // A cold reload keeps the same canonical landing (restoration loads the
  // note's source window again — poll for the window, not the first publish).
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect
    .poll(async () => (await readPagination(page))?.scope?.startFootnote !== undefined, {
      timeout: 15_000,
    })
    .toBe(true);
  await expect(page.locator("#fn-2")).toBeVisible();
  await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
});

test("an oversized note crosses repeated continuations without omissions", async ({ page }) => {
  await openAtOffset(page, rows[2]!.start);
  // The giant note (fn-3) opens at its head slice.
  await expect(page.locator("#fn-3")).toBeVisible();
  await expect(page.locator("#fn-3")).toContainText("Note 000 of the enormous ledger record.");
  const seen = new Set<number>();
  let dev = await scope(page);
  let labelHits = 0;
  for (let i = 0; i < 60; i++) {
    const text = (await page.locator("#fn-3").textContent()) ?? "";
    for (const n of [0, 80, 160, 240, 339]) {
      if (text.includes(`Note ${String(n).padStart(3, "0")} of the enormous ledger record.`)) {
        seen.add(n);
      }
    }
    if ((await page.getByRole("button", { name: "Mark read and close" }).count()) > 0) break;
    const before = dev;
    await page.keyboard.press("ArrowRight");
    dev = windowed(await waitForTurnAcknowledged(page, before, "next"));
    labelHits++;
  }
  // Every sampled label of the note was rendered exactly along the walk —
  // the continuation covered the row without omitting or restarting text.
  expect([...seen].sort((a, b) => a - b)).toEqual([0, 80, 160, 240, 339]);
  expect(labelHits).toBeGreaterThan(0);
  // The work finished exactly once, at the true end.
  expect(dev.anchorOffset).toBe(index.totalGraphemes);
  expect(await page.locator('[id="fn-3"]').count()).toBe(1);
});

test("speech reaches the note body across the window boundary without restarting", async ({
  page,
}) => {
  await installFakeSpeech(page, "word");
  await page.reload();
  // Seed near the body's end and wait for the restore to land BEFORE the
  // voice starts, so the note utterance is a few chunks past the boundary.
  await openAtOffset(page, index.blockStartOffsets[78]!);
  await playAndAwaitProbe(page);
  // Walk the real speech queue until the note body's utterance starts.
  const reached = await page.evaluate((label) => {
    const w = window as unknown as {
      __speechSpoken: { text: string; volume: number; done: boolean; cancelled: boolean }[];
      __speechFire: (event: string) => void;
    };
    for (let i = 0; i < 400; i++) {
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
  }, NORTH_WING_NOTE);
  expect(reached).toBe(true);
  // The follower loaded the note's window; the spoken word renders inside it.
  await expect
    .poll(async () => (await scope(page)).scope.startFootnote !== undefined, {
      timeout: 10_000,
    })
    .toBe(true);
  await waitForPaginationSettled(page);
  await expect(page.locator("#fn-1 mark.spoken-word")).toBeVisible();
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

test("note rows carry no capture binding — eligibility is unchanged", async ({ page }) => {
  await openAtOffset(page, rows[0]!.start);
  await expect(page.locator("#fn-1")).toBeVisible();
  // The structural ineligibility fact: no data-block-index on the note row
  // (capture's findBlockAncestor terminates → "ineligible", exactly as in
  // scrolling mode), and no marks render inside the notes region.
  expect(await page.locator("#fn-1[data-block-index]").count()).toBe(0);
  expect(await page.locator("#fn-1 mark.highlight").count()).toBe(0);
});
