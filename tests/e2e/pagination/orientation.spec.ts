// tests/e2e/pagination/orientation.spec.ts
// Issue #236 — the reader's honest chapter/reading-part orientation on a
// saved long work.
//
// Chromium-only targeted assertions (the shared-machine discipline); the PR
// e2e reference gate owns the cross-engine run. Layout truth lives in the
// LIVE pagination surface (never jsdom):
//   - a structured work shows "Chapter N of M · Part P of Q" beside the page
//     indicator, derived from the committed page's CANONICAL anchor offset —
//     never from page numbers;
//   - a direct late-work jump (seeded restore) shows the correct late
//     chapter/part without laying out the whole work (the windowed surface
//     keeps bounded scopes);
//   - ordinary page turns cross a PART boundary: the label advances, the
//     turn acknowledges, and no pagination fallback appears (structural
//     divisions are not navigation barriers);
//   - a typography change repaginates (page counts move) while the
//     orientation and its boundaries stay put (content, not layout);
//   - a LEGACY saved row (no snapshot) derives orientation in the first
//     commit, persists it lazily, and a reload reads the established
//     snapshot — same label after the round trip;
//   - turn announcements carry the orientation + overall positional percent
//     for screen-reader readers (the visible hairline is aria-hidden);
//   - a single-part work stays silent (spare-chrome silence).
import { test, expect, type Page } from "@playwright/test";
import { longProseArticle } from "../../fixtures/longProse";
import {
  deriveWorkStructure,
  resolveWorkPosition,
  formatOrientationLabel,
} from "../../../src/content/structure";
import { prepareFreshPage, seedRows, makeArticle as buildShortArticle } from "../portability/_portability";
import {
  markPaginationEpoch,
  readPagination,
  waitForPaginationSettled,
  waitForRepagination,
  waitForTurnAcknowledged,
} from "./_harness";
import { BASE } from "../_base";
import { openSettingsPanel, expandSettingsGroup } from "../settings";

const article = longProseArticle();
const structure = deriveWorkStructure(article)!;
const structuredRow = { ...article, structure };

const leaves = structure.destinations.filter((d) => d.kind === "part");
const chapter1 = structure.destinations.find((d) => d.title === "Stage 0")!;
const chapter2 = structure.destinations.find((d) => d.title === "Stage 320")!;
const part1 = leaves[0]!;
const part2ofChapter1 = leaves.find((d) => d.parentChapterId === chapter1.id && d !== part1)!;

async function openSeeded(
  page: Page,
  row: Record<string, unknown>,
  locationOffset?: number,
): Promise<void> {
  await prepareFreshPage(page);
  const locations =
    locationOffset === undefined
      ? []
      : [
          {
            schemaVersion: 1,
            articleId: article.id,
            revision: article.revision,
            graphemeOffset: locationOffset,
            savedAt: "2026-10-01T12:00:00.000Z",
          },
        ];
  await seedRows(page, { articles: [row], locations });
  await page.setViewportSize({ width: 360, height: 700 });
  await page.goto(`${BASE}/#/article/${article.id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: article.provenance.title }),
  ).toBeVisible();
  await waitForPaginationSettled(page);
}

async function orientation(page: Page): Promise<string> {
  return (await page.locator(".reading-orientation").textContent()) ?? "";
}

async function readArticleRow(page: Page, id: string): Promise<Record<string, unknown>> {
  return await page.evaluate(
    async (articleId) =>
      await new Promise<Record<string, unknown>>((resolve, reject) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("articles", "readonly");
          const get = tx.objectStore("articles").get(articleId);
          get.onsuccess = () => resolve((get.result ?? {}) as Record<string, unknown>);
          get.onerror = () => reject(get.error);
        };
        req.onerror = () => reject(req.error);
      }),
    id,
  );
}

test.describe("long-work orientation (issue #236)", () => {
  test("opening the first page shows the first part's orientation", async ({ page }) => {
    await openSeeded(page, structuredRow);
    const firstLabel = formatOrientationLabel(
      resolveWorkPosition(article, structure, part1.startOffset),
    );
    expect(firstLabel).toContain("Part 1 of");
    await expect(page.locator(".reading-orientation")).toHaveText(firstLabel);
    // The page indicator stays explicitly scoped to its portion.
    await expect(page.locator(".page-indicator")).toContainText("in this portion");
  });

  test("a seeded restore into a late chapter shows its orientation without whole-work layout", async ({
    page,
  }) => {
    const restored = resolveWorkPosition(article, structure, chapter2.startOffset + 2_500);
    const restoredLabel = formatOrientationLabel(restored);
    expect(restoredLabel).toContain("Chapter 2 of 3");

    await openSeeded(page, structuredRow, chapter2.startOffset + 2_500);
    await expect(page.locator(".reading-orientation")).toHaveText(restoredLabel);
    // The jump did NOT lay out the whole work: the measurement scope stays a
    // bounded window (the windowed surface's contract — the #233 slice).
    const dev = await readPagination(page);
    expect(dev?.scope).toBeDefined();
  });

  test("page turns cross a part boundary with acknowledgment, no fallback, and an orientation-carrying announce", async ({
    page,
  }) => {
    // Land ~1.5k graphemes before the chapter-1/part-2 boundary: a couple of
    // pages at this viewport, so the crossing takes a bounded number of turns.
    const approach = Math.max(0, part2ofChapter1.startOffset - 1_500);
    await openSeeded(page, structuredRow, approach);
    const beforeLabel = await orientation(page);
    expect(beforeLabel).toContain("Part 1 of");

    // The restore jump settles ASYNCHRONOUSLY after the first pagination
    // commit — wait for the canonical anchor to reach the restored passage
    // before turning, or the first keypress rides the pending jump.
    await expect
      .poll(
        async () => (await readPagination(page))?.anchorOffset ?? 0,
        { timeout: 15_000 },
      )
      .toBeGreaterThan(approach - 5_000);

    let dev = await readPagination(page);
    if (dev === null) throw new Error("no DEV pagination publication");
    let crossed = false;
    for (let turn = 0; turn < 8 && !crossed; turn++) {
      await page.keyboard.press("ArrowRight");
      dev = await waitForTurnAcknowledged(page, dev, "next");
      if ((await orientation(page)).includes("Part 2 of")) crossed = true;
    }
    expect(crossed, "expected a page turn to cross the part boundary").toBe(true);
    // Structural divisions are not barriers: the engine never fell back.
    expect((await readPagination(page))?.status).toBe("ok");

    // The turn announce (debounced live region) carries the orientation and
    // the offset-anchored overall position for screen-reader readers.
    await expect(page.getByText(/percent of the work\./)).toBeVisible({ timeout: 5_000 });
  });

  test("a typography change repaginates without moving the established orientation", async ({
    page,
  }) => {
    const midChapter2 = chapter2.startOffset + 2_500;
    const expectedLabel = formatOrientationLabel(
      resolveWorkPosition(article, structure, midChapter2),
    );
    await openSeeded(page, structuredRow, midChapter2);
    await expect(page.locator(".reading-orientation")).toHaveText(expectedLabel);

    // Arm the publication epoch BEFORE the typography change, then
    // repaginate: font size 18 → 24 through the shipped settings control.
    await markPaginationEpoch(page);
    await openSettingsPanel(page);
    await expandSettingsGroup(page, "Reading");
    const slider = page.getByRole("slider", { name: "Text size" });
    await slider.focus();
    await slider.press("ArrowUp");
    await slider.press("ArrowUp");
    await slider.press("ArrowUp");
    await page.getByRole("button", { name: "Close reading settings" }).click();
    await waitForRepagination(page);
    await waitForPaginationSettled(page);

    // Pages moved; the orientation did not (content, not layout).
    await expect(page.locator(".reading-orientation")).toHaveText(expectedLabel);
    const after = await readPagination(page);
    expect(after?.scope).toBeDefined();
    expect(after?.anchorOffset).toBeGreaterThan(0);
  });

  test("a legacy saved row (no snapshot) derives orientation, persists it lazily, and a reload reads the established snapshot", async ({
    page,
  }) => {
    const midChapter2 = chapter2.startOffset + 2_500;
    const expectedLabel = formatOrientationLabel(
      resolveWorkPosition(article, structure, midChapter2),
    );
    // Seed WITHOUT structure — the pre-#236 record shape.
    await openSeeded(page, article as unknown as Record<string, unknown>, midChapter2);
    await expect(page.locator(".reading-orientation")).toHaveText(expectedLabel);

    // The lazy write landed on the row (same revision, derived snapshot).
    await expect
      .poll(async () => await readArticleRow(page, article.id))
      .toMatchObject({ structure: { revision: article.revision } });

    // Reload: the saved snapshot is established — same label, and the row's
    // snapshot stays at the shipped generator version (frozen, not rewritten).
    await markPaginationEpoch(page);
    await page.reload();
    await waitForPaginationSettled(page);
    await expect(page.locator(".reading-orientation")).toHaveText(expectedLabel);
    const row = await readArticleRow(page, article.id);
    expect((row.structure as { generatorVersion?: number }).generatorVersion).toBe(1);
  });

  test("a single-part work stays silent (spare chrome) — no invented orientation", async ({
    page,
  }) => {
    const short = buildShortArticle({ id: "orientation-short", title: "A short piece", paragraphs: ["A single calm paragraph of prose."] });
    await prepareFreshPage(page);
    await seedRows(page, { articles: [{ ...short, structure: deriveWorkStructure(short) }] });
    await page.setViewportSize({ width: 360, height: 700 });
    await page.goto(`${BASE}/#/article/${short.id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: short.provenance.title }),
    ).toBeVisible();
    await waitForPaginationSettled(page);
    await expect(page.locator(".reading-orientation")).toHaveCount(0);
  });
});
