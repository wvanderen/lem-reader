import { expect, test } from "@playwright/test";

const BASE = "http://localhost:5173";
const FIXTURE = "essay-long-form";

interface PaginationSnapshot {
  currentPageIdx: number;
  pagesLength: number;
  blockCounts: number[];
  currentEntries: Array<{ blockIndex: number; startGrapheme: number; endGrapheme: number }>;
  visibleTextLength: number;
  fragmentHeight: number;
  childHeights: number[];
}

async function snapshot(page: import("@playwright/test").Page): Promise<PaginationSnapshot> {
  return page.evaluate(() => {
    const state = (window as unknown as Record<string, unknown>).__lemPagination as {
      currentPageIdx: number;
      pagesLength: number;
      pages: Array<{
        blocks: Array<{ blockIndex: number; startGrapheme: number; endGrapheme: number }>;
      }>;
    };
    const fragment = document.querySelector<HTMLElement>(".page-fragment");
    return {
      currentPageIdx: state.currentPageIdx,
      pagesLength: state.pagesLength,
      blockCounts: state.pages.map((fragment) => fragment.blocks.length),
      currentEntries: state.pages[state.currentPageIdx]?.blocks ?? [],
      visibleTextLength: fragment?.innerText.length ?? 0,
      fragmentHeight: fragment?.scrollHeight ?? 0,
      childHeights: fragment
        ? Array.from(fragment.children).map(
            (child) => (child as HTMLElement).getBoundingClientRect().height,
          )
        : [],
    };
  });
}

test("turning pages stays stable and non-final pages use the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto(`${BASE}/#/article/${FIXTURE}`);
  const firstPublication = await page.evaluate(() =>
    new Promise<{ pagesLength: number; blockCounts: number[] }>((resolve) => {
      const tick = () => {
        const state = (window as unknown as Record<string, unknown>).__lemPagination as
          | { pagesLength: number; pages: Array<{ blocks: unknown[] }> }
          | undefined;
        if (state) {
          resolve({
            pagesLength: state.pagesLength,
            blockCounts: state.pages.map((fragment) => fragment.blocks.length),
          });
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }),
  );
  await expect(page.locator(".page-fragment")).toBeVisible();
  await page.waitForTimeout(1_000);

  const initial = await snapshot(page);
  const observations: PaginationSnapshot[] = [initial];

  expect(firstPublication).toEqual({
    pagesLength: initial.pagesLength,
    blockCounts: initial.blockCounts,
  });

  for (let turn = 0; turn < Math.min(4, initial.pagesLength - 1); turn += 1) {
    await page.getByRole("button", { name: "Next page" }).click();
    await page.waitForTimeout(250);
    observations.push(await snapshot(page));
  }

  expect(
    observations.map(({ pagesLength }) => pagesLength),
    `page count changed during navigation: ${JSON.stringify(observations)}`,
  ).toEqual(observations.map(() => initial.pagesLength));
  expect(
    observations.map(({ currentPageIdx }) => currentPageIdx),
    `page index did not advance exactly once per turn: ${JSON.stringify(observations)}`,
  ).toEqual(observations.map((_, index) => index));
  expect(
    observations.slice(0, -1).every(({ visibleTextLength }) => visibleTextLength > 500),
    `an intermediate page was sparsely filled: ${JSON.stringify(observations)}`,
  ).toBe(true);
});
