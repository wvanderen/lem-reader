// tests/e2e/annotations/persist-reload.spec.ts
// STATE-03 (focused) — Highlights + notes persist across a full page reload.
// Verifies the Dexie compound-index query + Zod boundary on real reload.
import { test, expect } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  selectRangeInBlock,
  findFirstBlockWithText,
  findFirstBlockWithTextAsync,
} from "./_fixtures";

const FIXTURE = FIXTURES[0]!; // essay-long-form

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

test.describe("STATE-03 persist + reload (05-05)", () => {
  test("2 highlights + 1 note reload from Dexie + render at the same passages", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    // Highlight 1 (bare) on the first eligible block.
    let b1 = await findFirstBlockWithText(page, 24);
    expect(b1).not.toBe(-1);
    let ok = await selectRangeInBlock(page, b1, 0, 16);
    expect(ok).toBeTruthy();
    await page.locator(".selection-toolbar").getByRole("button", { name: "Highlight", exact: true }).click();
    await expect(page.locator("mark.highlight").first()).toBeVisible();
    const id1 = await page.locator("mark.highlight").first().getAttribute("data-highlight-id");

    // Highlight 2 (with note) on a disjoint block.
    const b2 = await findFirstBlockWithTextAsync(page, [b1], 24);
    expect(b2).not.toBe(-1);
    ok = await selectRangeInBlock(page, b2, 0, 16);
    expect(ok).toBeTruthy();
    await page.keyboard.press("n");
    await page.locator("textarea.highlight-popover-textarea").fill("Persistent note across reload.");
    await page.locator("#highlight-popover .highlight-popover-done").click();
    await expect(page.locator("mark.highlight").first()).toBeVisible();
    await expect(page.locator("mark.highlight.has-note").first()).toBeVisible();
    const id2 = await page
      .locator("mark.highlight.has-note")
      .first()
      .getAttribute("data-highlight-id");

    // Reload — full page reload.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(800);

    // Both highlights reload + render.
    await expect(page.locator(`mark.highlight[data-highlight-id="${id1}"]`)).toHaveCount(1);
    await expect(page.locator(`mark.highlight[data-highlight-id="${id2}"]`)).toHaveCount(1);
    // The note-bearing highlight keeps its modifier after reload.
    await expect(page.locator(`mark.highlight[data-highlight-id="${id2}"]`)).toHaveClass(/has-note/);

    // The drawer count + entries match.
    await page.getByRole("button", { name: /^Highlights and notes/ }).click();
    const entries = page.locator("dialog.annotations-drawer .drawer-list li");
    await expect(entries).toHaveCount(2);
  });

  test("reload across engines — Dexie read is engine-stable (chromium/firefox/webkit)", async ({
    page,
  }) => {
    // A single highlight reloads cleanly. This test runs × 3 engines; if any
    // engine's IndexedDB read path diverged, the reload would lose the mark.
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    const ok = await selectRangeInBlock(page, blockIdx, 0, 16);
    expect(ok).toBeTruthy();
    await page.locator(".selection-toolbar").getByRole("button", { name: "Highlight", exact: true }).click();
    const hlId = await page.locator("mark.highlight").first().getAttribute("data-highlight-id");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page.locator(`mark.highlight[data-highlight-id="${hlId}"]`)).toHaveCount(1);
  });
});
