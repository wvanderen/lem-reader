import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { ArticleSchema } from "../../../src/content/schema";
import { deriveWorkStructure } from "../../../src/content/structure";
import { prepareFreshPage, seedRows, readRow } from "../portability/_portability";
import { BASE } from "../_base";

const path = "tests/fixtures/pdf/synthetic-single-column.pdf";

for (const withConsequences of [false, true])
  test(`a reader previews, applies, and recovers PDF structure ${withConsequences ? "with explicit chapter consent" : "with safe mappings"}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(
      withConsequences ? { width: 390, height: 740 } : { width: 1280, height: 800 },
    );
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
        n === index ? { ...block, kind: "heading", level: withConsequences ? 2 : 3 } : block,
      ),
      structure: undefined,
    });
    legacy.structure = deriveWorkStructure({ ...legacy, provenanceTitle: legacy.provenance.title });
    const target = { kind: "work-chapter", articleId: legacy.id, destinationId: `ch-${index}.b` };
    const timestamp = "2026-01-01T00:00:00Z";
    const collection = {
      schemaVersion: 1,
      id: "pdf-plan",
      name: "PDF reading plan",
      entries: [{ id: "old-chapter", target, addedAt: timestamp }],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const completion = {
      schemaVersion: 1,
      targetKey: "pdf-chapter-done",
      target,
      finished: true,
      source: "reader",
      updatedAt: timestamp,
    };
    await seedRows(page, {
      articles: [legacy],
      ...(withConsequences ? { collections: [collection], completions: [completion] } : {}),
    });
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
    expect(
      ArticleSchema.parse(await readRow(page, "articles", legacy.id)).blocks[index]!.kind,
    ).toBe("heading");
    await page.screenshot({ path: testInfo.outputPath("pdf-repair-preview.png"), fullPage: true });
    if (withConsequences) {
      await expect(page.getByRole("button", { name: "Apply repair", exact: true })).toBeDisabled();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      expect(await readRow(page, "collections", collection.id)).toEqual(collection);
      expect(await readRow(page, "completions", completion.targetKey)).toEqual(completion);
      await openRepair();
      await page.getByLabel("Original PDF", { exact: true }).setInputFiles(path);
      await page.getByRole("button", { name: "Preview repair", exact: true }).click();
      const checkboxes = page.getByRole("region", { name: "Repair preview" }).getByRole("checkbox");
      await expect(checkboxes).toHaveCount(2);
      for (const checkbox of await checkboxes.all()) await checkbox.check();
    }
    await page.getByRole("button", { name: "Apply repair", exact: true }).click();
    await expect(page.locator("dialog.edit-metadata")).not.toBeVisible();
    expect(
      ArticleSchema.parse(await readRow(page, "articles", legacy.id)).blocks[index]!.kind,
    ).toBe("paragraph");
    await openRepair();
    await page.getByRole("button", { name: "Recover pre-repair version", exact: true }).click();
    await expect(page.locator("dialog.edit-metadata")).not.toBeVisible();
    expect(ArticleSchema.parse(await readRow(page, "articles", legacy.id))).toEqual(legacy);
    if (withConsequences) {
      expect(await readRow(page, "collections", collection.id)).toEqual(collection);
      expect(await readRow(page, "completions", completion.targetKey)).toEqual(completion);
    }
  });
