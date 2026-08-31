// tests/e2e/annotations/survive-relayout.spec.ts
// ANNO-05 / STATE-03 — Highlights survive repagination (font/viewport
// change), mode switch (M), and article reopen. The canonical anchor is the
// D-05 grapheme offset, NOT the page number or DOM position, so the highlight
// re-renders at the SAME passage after any relayout.
import { test, expect } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  selectRangeInBlock,
  findFirstBlockWithText,
  switchMode,
  selectRangeBetweenBlocks,
  markTextsForHighlight,
  totalPages,
  turnToPage,
} from "./_fixtures";

const FIXTURE = FIXTURES[0]!; // essay-long-form

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

test.describe("ANNO-05 / STATE-03 survive relayout (05-05)", () => {
  test("repagination via typography change keeps the highlight at the same passage", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    const ok = await selectRangeInBlock(page, blockIdx, 0, 24);
    expect(ok).toBeTruthy();
    await page.locator(".selection-toolbar").getByRole("button", { name: "Highlight", exact: true }).click();
    const mark = page.locator("mark.highlight").first();
    await expect(mark).toBeVisible();
    const hlId = await mark.getAttribute("data-highlight-id");
    const excerptBefore = (await mark.textContent())?.slice(0, 16) ?? "";
    expect(excerptBefore.length).toBeGreaterThan(0);

    // Trigger repagination via a typography change (open settings + crank
    // the text size). The engine repaginates; the highlight re-renders at the
    // same passage (D4-11 anchor + D-05 offset is canonical).
    await page.getByRole("button", { name: "Reading settings" }).click();
    const slider = page.getByRole("slider", { name: "Text size" });
    await slider.focus();
    await slider.press("ArrowUp");
    await slider.press("ArrowUp");
    await slider.press("ArrowUp"); // 18 -> 24
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1500);

    // The highlight with the same id still renders + carries the same excerpt
    // (the passage didn't change, only the page layout did).
    const markAfter = page.locator(`mark.highlight[data-highlight-id="${hlId}"]`);
    await expect(markAfter.first()).toBeVisible();
    const excerptAfter = (await markAfter.first().textContent())?.slice(0, 16) ?? "";
    expect(
      excerptAfter.toLowerCase().startsWith(excerptBefore.toLowerCase()),
      `highlight excerpt survives repagination (before="${excerptBefore}" after="${excerptAfter}")`,
    ).toBeTruthy();
  });

  test("mode switch (M) keeps the highlight at the same passage in BOTH directions", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    const ok = await selectRangeInBlock(page, blockIdx, 0, 24);
    expect(ok).toBeTruthy();
    await page.locator(".selection-toolbar").getByRole("button", { name: "Highlight", exact: true }).click();
    const mark = page.locator("mark.highlight").first();
    await expect(mark).toBeVisible();
    const hlId = await mark.getAttribute("data-highlight-id");
    const excerpt = (await mark.textContent())?.slice(0, 16) ?? "";
    expect(excerpt.length).toBeGreaterThan(0);

    // Paginated -> scrolling: highlight survives.
    await switchMode(page);
    const markScrolling = page.locator(`mark.highlight[data-highlight-id="${hlId}"]`);
    await expect(markScrolling.first()).toBeVisible();
    expect((await markScrolling.first().textContent())?.slice(0, 16) ?? "").toMatch(
      new RegExp(excerpt.slice(0, 8).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
    );

    // Scrolling -> paginated: highlight survives.
    await switchMode(page);
    await page.waitForTimeout(500);
    const markPaginated = page.locator(`mark.highlight[data-highlight-id="${hlId}"]`);
    await expect(markPaginated.first()).toBeVisible();
  });

  test("article reopen reloads the highlight + note from Dexie (STATE-03)", async ({ page }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    await selectRangeInBlock(page, blockIdx, 0, 18);
    await page.keyboard.press("n");
    await page.locator("textarea.highlight-popover-textarea").fill("Surviving note.");
    await page.locator("#highlight-popover .highlight-popover-done").click();
    await expect(page.locator("mark.highlight").first()).toBeVisible();
    const hlId = await page.locator("mark.highlight").first().getAttribute("data-highlight-id");
    expect(hlId).toBeTruthy();

    // Reload the page — the highlight + note reload from Dexie.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(800);
    const mark = page.locator(`mark.highlight[data-highlight-id="${hlId}"]`);
    await expect(mark.first()).toBeVisible();
    // The note survives (has-note modifier present after reload).
    await expect(mark.first()).toHaveClass(/has-note/);
  });

  test("Phase 19 span: a multi-block highlight survives typography change + mode switches with the same extents in BOTH modes (ANNO-10)", async ({
    page,
  }) => {
    // Strengthen-only Phase 19 cell: the SPAN variant of the two triggers
    // above — one cross-block highlight, re-derived from the same global
    // range after a typography change (repagination) and after M mode
    // switches, with byte-stable extents in scrolling and one first-slice
    // DOM id per document/mounted page (19-04 per-page pass).
    await openArticle(page, FIXTURE);
    await switchMode(page); // scrolling — the whole body mounts
    const ok = await selectRangeBetweenBlocks(
      page,
      { blockIndex: 0, offset: 5 },
      { blockIndex: 1, offset: 14 },
    );
    expect(ok, "cross-block span selection placed").toBeTruthy();
    await page
      .locator(".selection-toolbar")
      .getByRole("button", { name: "Highlight", exact: true })
      .click();
    const mark = page.locator("mark.highlight").first();
    await expect(mark).toBeVisible();
    const hlId = await mark.getAttribute("data-highlight-id");
    expect(hlId).toBeTruthy();
    const extentsBefore = await markTextsForHighlight(page, hlId!);
    expect(extentsBefore.length, "marks render in BOTH blocks").toBeGreaterThanOrEqual(2);

    // Typography change (this spec's existing trigger shape): the engine
    // repaginates; the span re-derives from the global range.
    await page.getByRole("button", { name: "Reading settings" }).click();
    const slider = page.getByRole("slider", { name: "Text size" });
    await slider.focus();
    await slider.press("ArrowUp");
    await slider.press("ArrowUp");
    await slider.press("ArrowUp"); // 18 -> 24
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1500);

    // Scrolling: same id, same extents, exactly ONE first-slice DOM id.
    await expect(
      page.locator(`mark.highlight[data-highlight-id="${hlId}"]`).first(),
    ).toBeVisible();
    expect(await markTextsForHighlight(page, hlId!)).toEqual(extentsBefore);
    await expect(page.locator(`#hl-${hlId}`)).toHaveCount(1);

    // Paginated: the span re-derives on the mounted pages (walk to the
    // passage — the D13-09 walk-pages precedent) with one #hl- id per
    // mounted page (19-04 first-occurrence pass).
    await switchMode(page);
    await page.waitForTimeout(500);
    let foundPaginated = false;
    const total = await totalPages(page);
    for (let target = 0; target < total; target++) {
      await turnToPage(page, target);
      const count = await page
        .locator(`mark.highlight[data-highlight-id="${hlId}"]`)
        .count();
      if (count > 0) {
        await expect(
          page
            .locator(`mark.highlight[data-highlight-id="${hlId}"]`)
            .first(),
        ).toBeVisible();
        await expect(page.locator(`#hl-${hlId}`)).toHaveCount(1);
        foundPaginated = true;
        break;
      }
    }
    expect(foundPaginated, "span marks re-derive in paginated mode").toBe(true);

    // Back to scrolling: the extents are STILL byte-stable (the round trip
    // through paginated mode never mutated the stored range).
    await switchMode(page);
    await expect(
      page.locator(`mark.highlight[data-highlight-id="${hlId}"]`).first(),
    ).toBeVisible();
    expect(await markTextsForHighlight(page, hlId!)).toEqual(extentsBefore);
    await expect(page.locator(`#hl-${hlId}`)).toHaveCount(1);
  });
});
