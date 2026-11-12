import { test, expect } from "@playwright/test";
import { ArticleSchema, LocationRecordSchema } from "../../../src/content/schema";
import { prepareFreshPage, seedRows } from "../portability/_portability";
import { waitForPaginationSettled, markPaginationEpoch, waitForRepagination } from "./_harness";
import { BASE } from "../_base";
import { openSettingsPanel, expandSettingsGroup } from "../settings";

const heading = Array.from({ length: 90 }, (_, n) => `Heading segment ${n}. `)
  .join("")
  .trim();
const article = ArticleSchema.parse({
  id: "oversized-saved-heading",
  revision: 1,
  lang: "en",
  provenance: {
    title: "Saved oversized heading",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "oversized-heading-v1",
  },
  blocks: [
    { kind: "heading", level: 2, content: [{ text: heading, marks: [] }] },
    { kind: "heading", level: 2, content: [{ text: "After the long heading", marks: [] }] },
    { kind: "paragraph", content: [{ text: "The calm closing paragraph.", marks: [] }] },
  ],
});

test("an existing oversized heading continues without clipping or losing text and turns back reliably", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await prepareFreshPage(page);
  await seedRows(page, { articles: [article] });
  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto(`${BASE}/#/article/${article.id}`);
  await waitForPaginationSettled(page);
  await expect(page.locator(".pagination-fallback-banner")).toHaveCount(0);
  const pieces: string[] = [];
  let first = "";
  for (let turn = 0; turn < 50; turn++) {
    const fragment = page.locator(".page-fragment");
    const text = await fragment.locator('h2[data-block-index="0"]').allTextContents();
    if (turn === 0) first = text.join("");
    pieces.push(...text);
    expect(
      await fragment.evaluate(
        (el) =>
          el.scrollHeight - (document.querySelector(".page-viewport") as HTMLElement).clientHeight,
      ),
    ).toBeLessThanOrEqual(2);
    if ((await fragment.textContent())?.includes("The calm closing paragraph.")) break;
    const before = await fragment.textContent();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => fragment.textContent()).not.toBe(before);
    await waitForPaginationSettled(page);
  }
  expect(pieces.length).toBeGreaterThan(1);
  expect(pieces.join("")).toBe(heading);
  for (let turn = 0; turn < pieces.length + 1; turn++) {
    if ((await page.locator(".page-fragment h2").allTextContents()).join("") === first) break;
    const before = await page.locator(".page-fragment").textContent();
    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => page.locator(".page-fragment").textContent()).not.toBe(before);
    await waitForPaginationSettled(page);
  }
  await expect(page.locator(".page-fragment h2")).toHaveText(first);
});

test("a saved passage inside a heading restores through reflow, Contents jumps, and scrolling mode", async ({
  page,
}) => {
  await prepareFreshPage(page);
  const offset = heading.indexOf("Heading segment 45.");
  await seedRows(page, {
    articles: [article],
    locations: [
      LocationRecordSchema.parse({
        schemaVersion: 1,
        articleId: article.id,
        revision: 1,
        graphemeOffset: offset,
        savedAt: "2026-01-01T00:00:00Z",
      }),
    ],
  });
  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto(`${BASE}/#/article/${article.id}`);
  await expect(page.locator(".page-fragment")).toContainText("Heading segment 45.");
  await waitForPaginationSettled(page);
  // Repagination anchors the current page's first passage, not the older
  // saved offset somewhere farther down that page.
  const passage = (await page.locator(".page-fragment h2").first().textContent())!.slice(0, 45);
  await markPaginationEpoch(page);
  await page.setViewportSize({ width: 480, height: 800 });
  await waitForRepagination(page);
  await expect(page.locator(".page-fragment")).toContainText(passage);
  const beforeTypography = (await page.locator(".page-fragment h2").first().textContent())!.slice(
    0,
    35,
  );
  const settings = await openSettingsPanel(page);
  await expandSettingsGroup(page, "Reading");
  await markPaginationEpoch(page);
  await settings.getByRole("slider", { name: "Text size", exact: true }).fill("24");
  await page.keyboard.press("Escape");
  await waitForRepagination(page);
  await expect(page.locator(".page-fragment")).toContainText(beforeTypography);
  await page.getByRole("button", { name: "Table of contents" }).click();
  await expect(page.getByRole("link", { name: heading, exact: true })).toHaveCount(1);
  await page.getByRole("link", { name: "After the long heading", exact: true }).click();
  await expect(page.locator(".page-fragment")).toContainText("After the long heading");
  await waitForPaginationSettled(page);
  await page.getByRole("button", { name: "Table of contents" }).click();
  await page.getByRole("link", { name: heading, exact: true }).click();
  await expect(page.locator(".page-fragment")).toContainText("Heading segment 0.");
  await waitForPaginationSettled(page);
  await page.getByRole("button", { name: /^Reading mode:/ }).click();
  await expect(
    page.getByRole("button", { name: "Reading mode: scrolling", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".article-body:not(.article-body-measurement) h2").first()).toHaveText(
    heading,
  );
});
