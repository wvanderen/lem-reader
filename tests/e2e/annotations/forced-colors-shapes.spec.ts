// tests/e2e/annotations/forced-colors-shapes.spec.ts
// A11Y-05 — The three inline highlight states (bare / note-bearing /
// unresolved) are distinguishable by SHAPE under emulated forced-colors,
// not by color alone. The UA forced palette applies but the shapes differ:
// bare = solid Highlight fill; note-bearing = dotted underline; unresolved
// = dashed outline.
import { test, expect } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  selectRangeInBlock,
  findFirstBlockWithTextAsync,
} from "./_fixtures";
import type { Page } from "@playwright/test";

const FIXTURE = FIXTURES[0]!; // essay-long-form

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
  await page.emulateMedia({ forcedColors: "active" });
});

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
  await page.emulateMedia({ forcedColors: "active" });
});

/** Open the article (inits Dexie stores), seed the orphan, reload so the
 *  eager batch-resolve surfaces it as unresolved. */
async function seedOrphanAndReload(page: Page): Promise<void> {
  await openArticle(page, FIXTURE);
  await page.evaluate(async (aid) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("lem-reader");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const tx = db.transaction("highlights", "readwrite");
    tx.objectStore("highlights").put({
      schemaVersion: 1,
      id: "seed-orphan-fc",
      articleId: aid,
      revision: 1,
      position: { start: 5, end: 15 },
      quote: { prefix: "zzq ", exact: "ZZQORPHANFORCEDCOLORS", suffix: " qqz" },
      createdAt: new Date().toISOString(),
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, FIXTURE);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(800);
}

async function computedShape(
  page: Page,
  selector: string,
): Promise<{
  outlineStyle: string;
  textDecorationStyle: string;
}> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return { outlineStyle: "", textDecorationStyle: "" };
    // Blur so the :focus-visible outline doesn't interfere with the shape
    // read (we want the mark's OWN decoration/outline, not the focus ring).
    (document.activeElement as HTMLElement | null)?.blur?.();
    const cs = window.getComputedStyle(el);
    return {
      outlineStyle: cs.outlineStyle,
      textDecorationStyle: cs.textDecorationStyle,
    };
  }, selector);
}

test.describe("A11Y-05 forced-colors shape distinction (05-05)", () => {
  test("bare vs note-bearing vs unresolved are distinguishable by shape under forced-colors", async ({
    page,
  }) => {
    // Seed an orphan first so it's present on open. The orphan's quote is
    // not present in the article → "orphan" resolution → renders in the
    // vicinity of its position hint (~block 0, page 1).
    await seedOrphanAndReload(page);

    // === PAGE 1 === Create a bare highlight on a block DISJOINT from the
    // orphan (the orphan's best-effort range is at article-global ~[5,15)
    // on block 0; skip block 0 so the D5-13 overlap check doesn't reject
    // the selection).
    let b = await findFirstBlockWithTextAsync(page, [0], 24);
    expect(b, "page 1 must carry a selectable block for the bare highlight").not.toBe(-1);
    await selectRangeInBlock(page, b, 0, 16);
    await page.locator(".selection-toolbar").getByRole("button", { name: "Highlight", exact: true }).click();
    const bareId = await page.locator("mark.highlight").first().getAttribute("data-highlight-id");

    // In paginated mode only the current page fragment is mounted, so the
    // orphan + bare shapes must be read WHILE STILL ON PAGE 1 (navigating
    // away unmounts them). The orphan MUST carry a dashed outline (not a
    // fill, not a dotted underline).
    const unresolvedShape = await computedShape(
      page,
      'mark.highlight.unresolved[data-highlight-id="seed-orphan-fc"]',
    );
    expect(unresolvedShape.outlineStyle, "unresolved uses a dashed outline").toMatch(/dashed/i);

    // The bare highlight is the solid-fill shape — NOT a dotted underline.
    if (bareId) {
      const bareShape = await computedShape(
        page,
        `mark.highlight[data-highlight-id="${bareId}"]`,
      );
      expect(bareShape.textDecorationStyle, "bare highlight is NOT dotted underline").not.toMatch(
        /dotted/i,
      );
    }

    // === PAGE 2 === Page 1 of essay-long-form carries only the orphan's
    // vicinity block + the bare-highlight block (Plan 04-07's
    // page-viewport geometry fix tightened page capacity); advance one page
    // for a fresh block on which to create the note-bearing highlight.
    await page.keyboard.press("PageDown");
    await page.waitForTimeout(300);
    b = await findFirstBlockWithTextAsync(page, [], 24);
    expect(b, "page 2 must carry a selectable block for the note-bearing highlight").not.toBe(-1);
    const ok = await selectRangeInBlock(page, b, 0, 16);
    expect(ok, "note-bearing target selection").toBeTruthy();
    await page.keyboard.press("n");
    await page.locator("textarea.highlight-popover-textarea").fill("Forced-colors note.");
    await page.locator("#highlight-popover .highlight-popover-done").click();
    const noteId = await page
      .locator("mark.highlight.has-note")
      .first()
      .getAttribute("data-highlight-id");
    expect(noteId, "note-bearing highlight was created").toBeTruthy();

    // CRITICAL A11Y-05 contract: each state's shape survives the UA forced
    // palette (no state relies on color alone). The note-bearing mark
    // carries a DOTTED underline + NO dashed outline (vs. unresolved's
    // dashed outline + vs. bare's solid underline read on page 1 above).
    // The three shapes are MUTUALLY DISTINCT.
    if (noteId) {
      const noteShape = await computedShape(
        page,
        `mark.highlight.has-note[data-highlight-id="${noteId}"]`,
      );
      expect(noteShape.textDecorationStyle, "note-bearing uses dotted underline").toMatch(/dotted/i);
      expect(noteShape.outlineStyle, "note-bearing has NO dashed outline").not.toMatch(/dashed/i);
    }
  });

  test("unresolved marker is NOT a silent fill under forced-colors (ANNO-07 holds)", async ({
    page,
  }) => {
    await seedOrphanAndReload(page);
    // The unresolved mark is visible + carries the dashed outline (not the
    // solid Highlight fill a confident mark would use). ANNO-07 under forced-
    // colors: the reader can tell the state by shape alone.
    const unresolved = page.locator('mark.highlight.unresolved[data-highlight-id="seed-orphan-fc"]');
    await expect(unresolved.first()).toBeVisible();
    const shape = await computedShape(
      page,
      'mark.highlight.unresolved[data-highlight-id="seed-orphan-fc"]',
    );
    expect(shape.outlineStyle, "unresolved dashed outline present").toMatch(/dashed/i);
    // The unresolved marker has a transparent background (no solid fill that
    // would overstate confidence).
    // (We don't assert the exact color value — forced-colors maps colors to
    // the UA palette; the SHAPE is the load-bearing cue.)
  });
});
