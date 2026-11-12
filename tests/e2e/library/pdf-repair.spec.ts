import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { ArticleSchema } from "../../../src/content/schema";
import { deriveWorkStructure } from "../../../src/content/structure";
import { prepareFreshPage, seedRows, readRow } from "../portability/_portability";
import { BASE } from "../_base";

const path = "tests/fixtures/pdf/synthetic-single-column.pdf";

test("a reader previews, applies, and recovers PDF structure from the original file", async ({
  page,
}) => {
  await prepareFreshPage(page);
  const response = await page.request.post(`${BASE}/api/ingest`, {
    data: { pdf: readFileSync(path).toString("base64"), filename: "Original.pdf" },
  });
  expect(response.ok()).toBe(true);
  const corrected = ArticleSchema.parse((await response.json()).article);
  const index = corrected.blocks.findIndex((block) => block.kind === "paragraph");
  expect(index).toBeGreaterThanOrEqual(0);
  const legacy = ArticleSchema.parse({
    ...corrected,
    blocks: corrected.blocks.map((block, n) =>
      n === index ? { ...block, kind: "heading", level: 3 } : block,
    ),
    structure: undefined,
  });
  legacy.structure = deriveWorkStructure({ ...legacy, provenanceTitle: legacy.provenance.title });
  await seedRows(page, { articles: [legacy] });
  await page.goto(`${BASE}/#/`);
  await page.reload();
  const openRepair = async () => {
    await page
      .getByRole("button", { name: `Edit metadata for ${legacy.provenance.title}`, exact: true })
      .click();
    await page.locator("summary").filter({ hasText: "Repair PDF structure" }).click();
  };
  await openRepair();
  await page.getByLabel("Original PDF", { exact: true }).setInputFiles(path);
  await page.getByRole("button", { name: "Preview repair", exact: true }).click();
  await expect(
    page.getByText("Saved position, highlights, and notes keep their exact text attachments."),
  ).toBeVisible();
  expect(ArticleSchema.parse(await readRow(page, "articles", legacy.id)).blocks[index]!.kind).toBe(
    "heading",
  );
  await page.getByRole("button", { name: "Apply repair", exact: true }).click();
  await expect(page.locator("dialog.edit-metadata")).not.toBeVisible();
  expect(ArticleSchema.parse(await readRow(page, "articles", legacy.id)).blocks[index]!.kind).toBe(
    "paragraph",
  );
  await openRepair();
  await page.getByRole("button", { name: "Recover pre-repair version", exact: true }).click();
  await expect(page.locator("dialog.edit-metadata")).not.toBeVisible();
  expect(ArticleSchema.parse(await readRow(page, "articles", legacy.id))).toEqual(legacy);
});
