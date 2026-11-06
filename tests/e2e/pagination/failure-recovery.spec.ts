// Issue #240: failure recovery keeps the global passage, not just the mode.
import { test, expect } from "@playwright/test";
import { ArticleSchema } from "../../../src/content/schema";
import { articleGraphemeIndex } from "../../../src/content/normalizeText";
import { prepareFreshPage, seedRows, BASE } from "../portability/_portability";
import { waitForPaginationSettled, waitForTurnAcknowledged } from "./_harness";

for (const automatic of [true, false]) {
  test(`${automatic ? "automatic unpageable" : "explicit processing-error"} scrolling escape preserves the passage`, async ({
    page,
  }) => {
    const article = ArticleSchema.parse({
      id: "failure-recovery",
      revision: 1,
      lang: "en",
      provenance: {
        title: "Failure recovery",
        retrievedAt: "2026-01-01T00:00:00Z",
        originalHtmlHash: "failure-recovery-v1",
      },
      blocks: Array.from({ length: 40 }, (_, i) => ({
        kind: "paragraph",
        content: [
          {
            text:
              `Passage ${i}. ` +
              "This is a calm paragraph for testing the reader passage. ".repeat(4),
            marks: [],
          },
        ],
      })),
    });
    await page.setViewportSize({ width: 1024, height: 720 });
    await prepareFreshPage(page);
    await seedRows(page, { articles: [article] });
    await page.goto(`${BASE}/#/article/${article.id}`);
    let dev = await waitForPaginationSettled(page);
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("ArrowRight");
      dev = await waitForTurnAcknowledged(page, dev, "next");
    }
    const before = dev.anchorOffset!;
    expect(before).toBeGreaterThan(0);
    // Scrolling restores the containing BLOCK, whereas pages may begin
    // mid-paragraph (WebKit splits this fixture differently). Compare the
    // canonical block start, not an intra-block page offset.
    const starts = articleGraphemeIndex(article).blockStartOffsets;
    const passageStart = [...starts].reverse().find((offset) => offset <= before)!;
    expect(passageStart).toBeGreaterThan(0);
    await page.evaluate((auto) => {
      (
        window as unknown as { __lemDiagnosticBus: { emit(e: unknown): void } }
      ).__lemDiagnosticBus.emit({
        kind: "dom-fallback",
        reason: auto ? "oversized-block" : "zero-progress",
        ts: new Date().toISOString(),
      });
    }, automatic);
    if (!automatic) await page.getByRole("button", { name: "Read in scrolling" }).click();
    await expect(page.locator("article.article-body")).not.toHaveClass(/paginated-surface/);
    // Read live scrolling geometry: the pagination publication is stale now.
    await expect
      .poll(async () =>
        page.evaluate(async (a) => {
          const moduleUrl = "/src/reader/restoreLocation.ts";
          const { computeTopVisibleOffset, queryBlocks } = await import(
            /* @vite-ignore */ moduleUrl
          );
          return computeTopVisibleOffset(
            a,
            queryBlocks(document.querySelector("article.article-body")),
          );
        }, article),
      )
      .toBe(passageStart);
  });
}
