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
});
