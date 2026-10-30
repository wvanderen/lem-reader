// tests/e2e/annotations/highlight-tags.spec.ts
// Issue #207 — the highlight's annotation-tag field is ALWAYS VISIBLE inside
// the annotation panel (the expandable entry is gone). Targeted coverage:
//   1. Commitment + persistence: the field mounts with the panel (no toggle),
//      Enter commits through the shared TagEntry seam, the Dexie row carries
//      the tag across a full reload, and Done returns focus to the highlight
//      without moving reading position.
//   2. The explicit Add action (the picker's "Add …" create option) commits;
//      blur never silently creates a tag; layered Escape dismisses the
//      suggestion list, then clears uncommitted draft text, then closes the
//      panel through the guarded save.
//   3. Tags stay EDITABLE on an unresolved (orphan) highlight — seeded via
//      raw IndexedDB — while the note textarea keeps its disabled state.
//   4. Both reading modes commit; narrow screens and 400% zoom/reflow keep
//      the field and the actions usable without horizontal compression.
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
  switchMode,
  announcementRegion,
  waitForReadingSurface,
} from "./_fixtures";
import { makeArticle, seedRows } from "../portability/_portability";

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
  return (await readAllHighlightRows(page))[0] ?? null;
}

/** Read every highlight row straight from Dexie (raw IndexedDB). */
async function readAllHighlightRows(page: Page): Promise<Array<{ id: string; tags?: string[] }>> {
  return await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("highlights", "readonly");
          const rows: Array<{ id: string; tags?: string[] }> = [];
          const cursor = tx.objectStore("highlights").openCursor();
          cursor.onsuccess = () => {
            const c = cursor.result;
            if (c) {
              rows.push(c.value as { id: string; tags?: string[] });
              c.continue();
            } else {
              resolve(rows);
              db.close();
            }
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
    position: { start: number; end: number };
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
      position: r.position,
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

/** Open the annotation panel — the tag field is visible without any
 *  expansion step (issue #207). */
async function openTagEditor(page: Page) {
  const dialog = await openHighlightControls(page);
  const tagInput = dialog.locator("input#highlight-tags-input");
  await expect(tagInput).toBeVisible();
  return { dialog, tagInput };
}

test.describe("highlight tags in the reader (issue #207)", () => {
  test("the field mounts with the panel; Enter commits; the tag persists across reload; Done returns focus to the highlight", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    await selectRangeInBlock(page, blockIdx, 0, 18);
    await page.keyboard.press("n");
    // The editor mounts the field directly — no toggle, no expansion state.
    const editor = page.locator("#highlight-popover");
    await expect(editor).toBeVisible();
    const tagInput = editor.locator("input#highlight-tags-input");
    await expect(tagInput).toBeVisible();
    expect(await editor.getByRole("button", { name: "Tags", exact: true }).count()).toBe(0);

    // Type + Enter picks (the shared combobox keyboard path).
    await tagInput.fill("essays");
    await tagInput.press("Enter");
    await expect(editor.locator(".tag-picker-pill-text")).toHaveText("essays");

    // Done closes; the row carries the tag; focus is back on the highlight
    // (reading position unchanged — the passage is still on screen).
    await editor.locator(".highlight-popover-done").click();
    await expect(editor).not.toBeVisible();
    await expect(highlightControls(page)).not.toBeVisible();
    await expect(page.locator("mark.highlight").first()).toBeFocused();
    await expect.poll(async () => (await readFirstHighlightRow(page))?.tags).toEqual(["essays"]);

    // Full reload → activate the <mark> → the tag chip renders from the
    // persisted record and the field is editable again — add a second tag.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const mark = page.locator("mark.highlight").first();
    await expect(mark).toBeVisible();
    const reopened = await openTagEditor(page);
    await expect(reopened.dialog.locator(".tag-picker-pill-text")).toHaveText("essays");
    await reopened.tagInput.fill("to-revisit");
    await reopened.tagInput.press("Enter");
    await reopened.dialog.locator(".highlight-popover-done").click();
    await expect
      .poll(async () => (await readFirstHighlightRow(page))?.tags)
      .toEqual(["essays", "to-revisit"]);
  });

  test("the explicit Add action commits; blur never silently creates a tag", async ({ page }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    await selectRangeInBlock(page, blockIdx, 0, 14);
    await page.keyboard.press("n");
    const editor = page.locator("#highlight-popover");
    const tagInput = editor.locator("input#highlight-tags-input");

    // The explicit Add path: a draft with no match offers the "Add …"
    // create option; picking it commits (blur does NOT).
    await tagInput.fill("brand-new-tag");
    const createOption = editor.getByRole("option", { name: /Add “brand-new-tag”/ });
    await expect(createOption).toBeVisible();
    // Blur first: moving focus away must not create the tag…
    await editor.locator("textarea.highlight-popover-textarea").focus();
    await expect(editor.locator(".tag-picker-pill-text")).toHaveCount(0);
    // …then the explicit Add action commits it.
    await tagInput.fill("brand-new-tag");
    await editor.getByRole("option", { name: /Add “brand-new-tag”/ }).click();
    await expect(editor.locator(".tag-picker-pill-text")).toHaveText("brand-new-tag");
    await expect
      .poll(async () => (await readFirstHighlightRow(page))?.tags)
      .toEqual(["brand-new-tag"]);
  });

  test("layered Escape: suggestions, then uncommitted draft text, then the guarded close", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    await selectRangeInBlock(page, blockIdx, 0, 14);
    await page.keyboard.press("n");
    const editor = page.locator("#highlight-popover");
    const tagInput = editor.locator("input#highlight-tags-input");

    // The draft text survives layer 1; the panel survives layer 2.
    await tagInput.fill("to-revisit");
    await expect(editor.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape"); // layer 1 — dismiss the list
    await expect(editor.getByRole("listbox")).not.toBeVisible();
    await expect(tagInput).toHaveValue("to-revisit");
    await expect(editor).toBeVisible();
    await page.keyboard.press("Escape"); // layer 2 — clear the draft
    await expect(tagInput).toHaveValue("");
    await expect(editor).toBeVisible();

    // Layer 3 — the guarded dismissal saves and closes; focus returns to
    // the opening control (the anchor mark).
    await page.keyboard.press("Escape");
    await expect(editor).not.toBeVisible();
    await expect(page.locator("mark.highlight").first()).toBeFocused();
    await expect.poll(async () => (await readFirstHighlightRow(page))?.tags).toEqual([]);
  });

  test("tags stay editable on an orphaned highlight; the note textarea does not", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    // Seed an ORPHAN (quote.exact absent from the article) carrying a tag.
    await seedHighlight(page, {
      id: "seed-orphan-tags",
      position: { start: 5, end: 15 },
      quote: { prefix: "zzq ", exact: "ZZQORPHANPASSAGENOTPRESENT", suffix: " qqz" },
      tags: ["legacy-tag"],
    });
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Hydration is signaled by the relocation announcement (the seeded
    // orphan resolves as unresolved); the mark follows under load.
    await expect(announcementRegion(page)).toContainText(/couldn't be relocated/);
    await waitForReadingSurface(page);

    const orphanMark = page.locator(
      'mark.highlight.unresolved[data-highlight-id="seed-orphan-tags"]',
    );
    await expect(orphanMark).toBeVisible({ timeout: 15_000 });
    await orphanMark.click();

    // The panel hosts the hydrating chip + a live field with no expansion.
    const dialog = highlightControls(page);
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
    await orphanMark.click();
    await highlightControls(page).getByRole("button", { name: "Add note" }).click();
    const editor = page.locator("#highlight-popover");
    await expect(editor.locator("textarea.highlight-popover-textarea")).toBeDisabled();
    await editor.locator(".highlight-popover-done").click();
  });

  for (const mode of ["paginated", "scrolling"] as const) {
    test(`${mode}: keyboard suggestion pick commits without moving reading position`, async ({
      page,
    }) => {
      await openArticle(page, FIXTURE);
      // The highlight-tag suggestions read the LIBRARY vocabulary
      // (loadTagStats folds Dexie article rows) — bundled fixtures carry no
      // Dexie row, so seed one tagged row as the suggestion universe.
      await seedRows(page, {
        articles: [
          {
            ...makeArticle({
              id: "vocab-seed",
              title: "Vocabulary",
              paragraphs: ["Seed vocabulary row."],
            }),
            tags: ["philosophy"],
          },
        ],
      });
      if (mode === "scrolling") await switchMode(page);
      const blockIdx = await findFirstBlockWithText(page, 24);
      await selectRangeInBlock(page, blockIdx, 0, 16);
      await page.keyboard.press("n");
      const editor = page.locator("#highlight-popover");
      const markBefore = await page.locator("mark.highlight").first().boundingBox();

      // Type-to-filter over the seeded vocabulary, arrow through the list,
      // pick with Enter — the stored casing routes back ("phi" →
      // "philosophy"). No pointer.
      const tagInput = editor.locator("input#highlight-tags-input");
      await tagInput.click();
      await tagInput.fill("phi");
      await expect(editor.getByRole("option", { name: "philosophy" })).toBeVisible();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("Enter");
      await expect(editor.locator(".tag-picker-pill-text")).toHaveText("philosophy");

      await editor.locator(".highlight-popover-done").click();
      await expect(page.locator("mark.highlight").first()).toBeFocused();
      const markAfter = await page.locator("mark.highlight").first().boundingBox();
      expect(markAfter).toEqual(markBefore);
      await expect
        .poll(async () => (await readFirstHighlightRow(page))?.tags)
        .toEqual(["philosophy"]);
    });
  }

  test("narrow screen: the organization fields wrap/stack, the editor and actions stay usable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    await selectRangeInBlock(page, blockIdx, 0, 14);
    await page.keyboard.press("n");
    const editor = page.locator("#highlight-popover");
    await expect(editor).toBeVisible();
    const tagInput = editor.locator("input#highlight-tags-input");
    await tagInput.fill("phone-tag");
    await tagInput.press("Enter");
    await expect(editor.locator(".tag-picker-pill-text")).toHaveText("phone-tag");

    // Everything the reader needs stays inside the viewport — the fields
    // wrapped/stacked rather than compressing the editor or the actions:
    // the writing surface keeps its 88px min-height, and every footer
    // action keeps its 44px touch target (--touch — measured, not implied).
    const viewport = page.viewportSize()!;
    const noteBox = await editor.locator("textarea.highlight-popover-textarea").boundingBox();
    expect(noteBox!.height).toBeGreaterThanOrEqual(88);
    const doneBox = await editor.locator(".highlight-popover-done").boundingBox();
    expect(doneBox!.height).toBeGreaterThanOrEqual(44);
    for (const locator of [
      editor.locator(".annotation-panel-organization"),
      editor.locator(".highlight-color-entry"),
      editor.locator(".annotation-panel-footer"),
    ]) {
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    }
    await expect(editor.locator(".highlight-popover-done")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("400% zoom/reflow: the field stays keyboard-operable and the tag saves (no content lost)", async ({
    page,
  }) => {
    // Keyboard-only on purpose (the note-placement zoom discipline): exact
    // zoom geometry is engine-variable — this cell proves FUNCTION
    // reachability at the 400% code path, not pixel positions.
    await openArticle(page, FIXTURE);
    await page.evaluate(() => {
      document.body.style.zoom = "4";
    });
    const blockIdx = await findFirstBlockWithText(page, 24);
    await selectRangeInBlock(page, blockIdx, 0, 14);
    await page.keyboard.press("n");
    const editor = page.locator("#highlight-popover");
    await expect(editor).toBeVisible();
    const tagInput = editor.locator("input#highlight-tags-input");
    await tagInput.click();
    await tagInput.fill("zoomed");
    await page.keyboard.press("Enter");
    await expect(editor.locator(".tag-picker-pill-text")).toHaveText("zoomed");
    // After a commit the picker resets (no open list, no draft), so Escape
    // reaches layer 3: the guarded close saves the tag and returns focus to
    // the passage — the zoomed session's function proof.
    await page.keyboard.press("Escape");
    await expect(editor).not.toBeVisible();
    await expect(page.locator("mark.highlight").first()).toBeFocused();
    await expect.poll(async () => (await readFirstHighlightRow(page))?.tags).toEqual(["zoomed"]);
  });
});
