// tests/e2e/annotations/highlight-tags.spec.ts
// Issue #116 + #175 — annotation tags in the reader. The tags editor is a
// SEPARATE compact dialog opened from the lightweight highlight controls
// ("Tags"), no longer a section inside the note editor:
//   1. A tag picked in the tags editor lands on the highlight's Dexie row and
//      re-renders when the editor reopens after a full reload; closing the
//      tags editor returns to the controls (focused on the highlight).
//   2. Tags stay EDITABLE on an unresolved (orphan) highlight — seeded via
//      raw IndexedDB — while the note textarea keeps its disabled state.
//      (AC: tags remain editable after the anchor becomes ambiguous/orphaned;
//      older highlights hydrate with no tags — the seeded row omits nothing,
//      so the hydration case is the unit suite's job.)
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  BASE,
  FIXTURES,
  openArticle,
  selectRangeInBlock,
  findFirstBlockWithText,
  openHighlightControls,
  highlightControls,
} from "./_fixtures";

const FIXTURE = FIXTURES[0]!; // essay-long-form

test.beforeEach(async ({ page }) => {
  await page.goto(`${BASE}/`);
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("lem-reader");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
});

/** Read the first highlight row straight from Dexie (raw IndexedDB). */
async function readFirstHighlightRow(page: Page): Promise<{
  id: string;
  tags?: string[];
} | null> {
  return await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("highlights", "readonly");
          const cursor = tx.objectStore("highlights").openCursor();
          cursor.onsuccess = () => {
            const c = cursor.result;
            resolve(c ? (c.value as { id: string; tags?: string[] }) : null);
            db.close();
          };
          cursor.onerror = () => reject(cursor.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
}

/** Write a highlight row directly (the ambiguous-orphan-surface seeding). */
async function seedHighlight(
  page: Page,
  rec: {
    id: string;
    quote: { prefix: string; exact: string; suffix: string };
    tags?: string[];
  },
): Promise<void> {
  await page.evaluate(async (r) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction("highlights", "readwrite");
    tx.objectStore("highlights").put({
      schemaVersion: 1,
      id: r.id,
      articleId: "essay-long-form",
      revision: 1,
      position: { start: 5, end: 15 },
      quote: r.quote,
      createdAt: new Date().toISOString(),
      ...(r.tags !== undefined ? { tags: r.tags } : {}),
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, rec);
}

/** Open the compact tags editor from the lightweight controls. */
async function openTagsEditor(page: Page) {
  const controls = await openHighlightControls(page);
  await controls.getByRole("button", { name: "Tags" }).click();
  const dialog = page.locator("dialog.highlight-tags-dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("highlight tags in the reader (issue #116 + #175)", () => {
  test("a picked tag lands on the Dexie row + renders after reopen and reload; Done returns to the controls", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    await selectRangeInBlock(page, blockIdx, 0, 18);
    await page.keyboard.press("n");
    // The writing-only editor has NO tag field anymore (issue #175).
    const editor = page.locator("#highlight-popover");
    await expect(editor).toBeVisible();
    await expect(editor.locator("input#highlight-tags-input")).toHaveCount(0);
    await editor.locator(".highlight-popover-done").click();
    await expect(editor).not.toBeVisible();

    // Controls → Tags → the compact dialog.
    const dialog = await openTagsEditor(page);
    const tagInput = dialog.locator("input#highlight-tags-input");
    await expect(tagInput).toBeVisible();

    // Type + Enter picks (the shared combobox keyboard path).
    await tagInput.fill("essays");
    await tagInput.press("Enter");
    await expect(dialog.locator(".tag-picker-pill-text")).toHaveText("essays");

    // Done closes; the row carries the tag; focus is back on the highlight.
    await dialog.locator(".highlight-popover-done").click();
    await expect(dialog).not.toBeVisible();
    await expect(highlightControls(page)).toBeVisible();
    await expect(page.locator("mark.highlight").first()).toBeFocused();
    await expect.poll(async () => (await readFirstHighlightRow(page))?.tags).toEqual(["essays"]);

    // Full reload → activate the <mark> → Tags → the tag chip renders from
    // the persisted record (AC: tags remain editable after reopening).
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const mark = page.locator("mark.highlight").first();
    await expect(mark).toBeVisible();
    const reopened = await openTagsEditor(page);
    await expect(reopened.locator(".tag-picker-pill-text")).toHaveText("essays");
    // The field is editable again — add a second tag.
    await reopened.locator("input#highlight-tags-input").fill("to-revisit");
    await reopened.locator("input#highlight-tags-input").press("Enter");
    await reopened.locator(".highlight-popover-done").click();
    await expect
      .poll(async () => (await readFirstHighlightRow(page))?.tags)
      .toEqual(["essays", "to-revisit"]);
  });

  test("tags stay editable on an orphaned highlight; the note textarea does not", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    // Seed an ORPHAN (quote.exact absent from the article) carrying a tag.
    await seedHighlight(page, {
      id: "seed-orphan-tags",
      quote: { prefix: "zzq ", exact: "ZZQORPHANPASSAGENOTPRESENT", suffix: " qqz" },
      tags: ["legacy-tag"],
    });
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(800);

    const orphanMark = page.locator(
      'mark.highlight.unresolved[data-highlight-id="seed-orphan-tags"]',
    );
    await expect(orphanMark).toBeVisible();
    await orphanMark.click();

    // Tags first: the compact dialog hosts the hydrating chip + a live field.
    const controls = highlightControls(page);
    await expect(controls).toBeVisible();
    await controls.getByRole("button", { name: "Tags" }).click();
    const dialog = page.locator("dialog.highlight-tags-dialog");
    await expect(dialog).toBeVisible();
    // The hydrating tag chip renders from the seeded row.
    await expect(dialog.locator(".tag-picker-pill-text")).toHaveText("legacy-tag");
    // The tag field stays editable and commits.
    const tagInput = dialog.locator("input#highlight-tags-input");
    await expect(tagInput).toBeEnabled();
    await tagInput.fill("kept-anyway");
    await tagInput.press("Enter");
    await expect(dialog.locator(".tag-picker-pill-text")).toHaveText(["legacy-tag", "kept-anyway"]);
    await dialog.locator(".highlight-popover-done").click();
    await expect
      .poll(async () => (await readFirstHighlightRow(page))?.tags)
      .toEqual(["legacy-tag", "kept-anyway"]);

    // …while the note textarea keeps its D5-04 disabled state (the orphan's
    // anchor is uncertain — the writing editor stays read-only for it).
    await controls.getByRole("button", { name: "Add note" }).click();
    const editor = page.locator("#highlight-popover");
    await expect(editor.locator("textarea.highlight-popover-textarea")).toBeDisabled();
    await editor.locator(".highlight-popover-done").click();
  });
});
