import { expect, test } from "@playwright/test";
import { longProseArticle } from "../../fixtures/longProse";
import { prepareFreshPage, seedRows, BASE } from "../portability/_portability";
import { readPagination, waitForPaginationSettled, waitForTurnAcknowledged } from "./_harness";

// Virtual time distinguishes scheduling policy from a machine-specific speed
// budget: a navigation must not depend on the 400 ms resize/settings timer.
test("a window crossing does not wait for a geometry debounce", async ({ page }) => {
  const article = longProseArticle();
  await page.setViewportSize({ width: 1280, height: 800 });
  await prepareFreshPage(page);
  await seedRows(page, { articles: [article] });
  await page.goto(`${BASE}/#/article/${article.id}`);
  let before = await waitForPaginationSettled(page);
  expect(before.scope).toBeDefined();
  while (before.currentPageIdx < before.pagesLength - 1) {
    await page.keyboard.press("ArrowRight");
    before = await waitForTurnAcknowledged(page, before, "next");
  }
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.keyboard.press("ArrowRight");
  await page.clock.runFor(200);
  const after = await readPagination(page);
  expect(after?.turnSeq).toBeGreaterThan(before.turnSeq!);
  expect(after?.anchorOffset).toBeGreaterThan(before.anchorOffset!);
  expect(after?.scope?.startBlock).toBeGreaterThan(before.scope!.startBlock);
  expect(after?.overflowSettled).toBe(true);
});
