import { expect, test } from "@playwright/test";
import { ArticleSchema } from "../../../src/content/schema";
import { articleGraphemeIndex } from "../../../src/content/normalizeText";
import { prepareFreshPage, seedRows, BASE } from "../portability/_portability";
import { waitForPaginationSettled, waitForTurnAcknowledged } from "./_harness";

// Synthetic ordinary publishing: substantial text in modest source rows.
// Deliberately exceeds the former 72k admission limit without user content.
for (const repeats of [30, 60]) {
  for (const width of [1280, 390]) {
    test(`a ${repeats === 30 ? "moderate" : "larger"} reading keeps complete, stable page numbering at ${width}px`, async ({
      page,
    }) => {
      const article = ArticleSchema.parse({
        id: `continuous-${repeats}`,
        revision: 1,
        lang: "en",
        provenance: {
          title: "A continuous reading",
          retrievedAt: "2026-01-01T00:00:00Z",
          originalHtmlHash: "synthetic-continuous",
        },
        blocks: Array.from({ length: 125 }, (_, i) => ({
          kind: "paragraph",
          content: [
            { text: `Passage ${i}. ` + "The reader keeps a stable place. ".repeat(repeats) },
          ],
        })),
      });
      expect(articleGraphemeIndex(article).totalGraphemes).toBeGreaterThan(111_000);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      await prepareFreshPage(page);
      await seedRows(page, { articles: [article] });
      await page.goto(`${BASE}/#/article/${article.id}`);
      let before = await waitForPaginationSettled(page);
      const total = before.pagesLength;
      expect(before.scope).toMatchObject({ startBlock: 0, endBlock: 125 });
      await expect(page.locator(".page-indicator")).toHaveText(`1 of ${total}`);
      for (let n = 0; n < 12; n++) {
        await page.keyboard.press("ArrowRight");
        before = await waitForTurnAcknowledged(page, before, "next");
        expect(before.pagesLength).toBe(total);
        await expect(page.locator(".page-indicator")).toHaveText(
          `${before.currentPageIdx + 1} of ${total}`,
        );
      }
      await page.keyboard.press("ArrowLeft");
      before = await waitForTurnAcknowledged(page, before, "previous");
      expect(before.pagesLength).toBe(total);
      await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
    });
  }
}
