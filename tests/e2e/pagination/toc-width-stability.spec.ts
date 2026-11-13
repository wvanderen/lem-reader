import { test, expect } from "@playwright/test";
import { ArticleSchema } from "../../../src/content/schema";
import { prepareFreshPage, seedRows } from "../portability/_portability";
import { BASE } from "../_base";

// Synthetic equivalent of a PDF's raw dotted leaders; no private book fixture.
const article = ArticleSchema.parse({
  id: "pdf-toc-width-stability",
  revision: 1,
  lang: "en",
  provenance: {
    title: "Dotted table of contents",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "synthetic-dotted-toc",
  },
  blocks: [
    { kind: "heading", level: 2, content: [{ text: "Table of Contents", marks: [] }] },
    {
      kind: "paragraph",
      content: [
        {
          text: Array.from(
            { length: 27 },
            (_, n) => `Chapter ${n} ${".".repeat(120)} ${n + 10}`,
          ).join(" "),
          marks: [],
        },
      ],
    },
    { kind: "heading", level: 2, content: [{ text: "Preface", marks: [] }] },
    ...Array.from({ length: 12 }, () => ({
      kind: "paragraph",
      content: [{ text: "The following work is ordinary prose. ".repeat(18), marks: [] }],
    })),
  ],
});

test("dotted PDF contents cannot widen the page grid or cause idle page replacement", async ({
  page,
}) => {
  await prepareFreshPage(page);
  await seedRows(page, { articles: [article] });
  await page.setViewportSize({ width: 794, height: 950 });
  await page.goto(`${BASE}/#/article/${article.id}`);
  await expect(page.locator(".page-fragment")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  // Sample the actual fragment, not just the surface: the implicit grid's
  // content-sized track can overflow an otherwise perfectly stable article.
  const samples = await page.evaluate(async () => {
    const result: {
      page: string | null;
      text: string | null;
      width: number;
      surfaceWidth: number;
    }[] = [];
    for (let n = 0; n < 35; n++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const fragment = document.querySelector(".page-fragment")!;
      result.push({
        page: fragment.getAttribute("aria-label"),
        text: fragment.textContent,
        width: fragment.getBoundingClientRect().width,
        surfaceWidth: document.querySelector(".paginated-surface")!.getBoundingClientRect().width,
      });
    }
    return result;
  });
  expect(Math.max(...samples.map((s) => s.width - s.surfaceWidth))).toBeLessThanOrEqual(1);
  const settled = samples.slice(15);
  expect(new Set(settled.map((s) => `${s.page}:${s.text}`)).size).toBe(1);
  await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
});
