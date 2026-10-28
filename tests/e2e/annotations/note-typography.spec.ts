// tests/e2e/annotations/note-typography.spec.ts
// Issue #193 — note typography is INDEPENDENT of article typography. The
// note editor (reader annotation panel + review dialog share the
// .highlight-popover-textarea rule) uses system sans-serif at 14px,
// matching the sibling excerpt’s interface text size —
// never the article stack (--font-body) and never a fixed oversized value.
// Changing the article Font or Text size settings must leave the editor's
// computed typography byte-unchanged, and the editor must stay usable at the
// 320px WCAG reflow target in BOTH reading modes.
//
// Zoom coverage note: the 400% body-zoom survival cell (editor stays open,
// reachable, and saves) already lives in note-placement.spec.ts for PAGINATED
// mode; this spec owns the reflow proxy (320 CSS px viewport, the
// high-zoom.spec load-bearing bar) in both modes, the typography-independence
// cells, and the scrolling-mode zoom twin. Computed style is asserted in a
// real engine — jsdom cannot prove cascaded computed style (the 02-04
// typography-live-apply precedent).
import { test, expect } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  selectRangeInBlock,
  findFirstBlockWithText,
  findFirstBlockWithTextAsync,
  announcementRegion,
  switchMode,
  openNoteEditorViaControls,
  noteTextarea,
} from "./_fixtures";

const FIXTURE = FIXTURES[0]!; // essay-long-form

interface ComputedType {
  fontFamily: string;
  fontSize: string;
}

async function computedType(page: import("@playwright/test").Page): Promise<ComputedType> {
  return page.evaluate(() => {
    const ta = document.querySelector<HTMLElement>("textarea.highlight-popover-textarea");
    if (!ta) throw new Error("note textarea not mounted");
    const cs = getComputedStyle(ta);
    return { fontFamily: cs.fontFamily, fontSize: cs.fontSize };
  });
}

/** Collapse CSS-formatting whitespace and unify family-name quoting (WebKit
 * computes unquoted multi-word families; the declared token keeps quotes) so
 * the computed stack compares equal to the declared custom property. */
function normalize(value: string): string {
  return value.replace(/\s+/g, " ").replace(/"/g, "").trim();
}

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

test.describe("issue #193 note typography independence", () => {
  test("the note editor computes the interface register: system sans-serif at 14px, never the article stack", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    await selectRangeInBlock(page, blockIdx, 0, 18);
    await page.keyboard.press("n");
    const textarea = noteTextarea(page);
    await expect(textarea).toBeVisible();

    const noteType = await computedType(page);
    // A real content block (data-block-index) — the article element also
    // carries chrome (the .article-top-meta byline rides the UI register).
    const articleType = await page.evaluate(() => {
      const p = document.querySelector<HTMLElement>(
        ".article-body p[data-block-index]:not(.article-body-measurement *)",
      );
      if (!p) throw new Error("article paragraph not mounted");
      return getComputedStyle(p).fontFamily;
    });

    // Notes use system fonts, independently of the bundled chrome and article fonts.
    expect(
      normalize(noteType.fontFamily),
      "note editor font-family uses the system sans-serif stack",
    ).toBe("system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif");
    expect(
      normalize(noteType.fontFamily),
      "note editor font-family differs from the article body stack",
    ).not.toBe(normalize(articleType));
    // The interface text size (the dialog register the sibling excerpt
    // renders at) — not the 18px body-role value issue #193 retires.
    expect(noteType.fontSize, "note editor font-size is the 14px interface register").toBe("14px");
  });

  test("changing the article Font and Text size leaves the note editor's computed typography unchanged", async ({
    page,
  }) => {
    // Scrolling mode: a Text size change relayouts paginated pages and can
    // move the mark to another page; the scrolling body mounts the whole
    // article, so the reopened editor is reachable without page walking.
    await openArticle(page, FIXTURE);
    await switchMode(page);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    await selectRangeInBlock(page, blockIdx, 0, 18);
    await page.keyboard.press("n");
    const textarea = noteTextarea(page);
    await expect(textarea).toBeVisible();
    const before = await computedType(page);
    const articleFontBefore = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    // A real note so Done flushes a save (an empty note closes silently).
    await textarea.fill("Independent of the article type.");
    await page.locator("#highlight-popover .highlight-popover-done").click();
    await expect(announcementRegion(page)).toContainText(/Note saved/i);

    // Change the ARTICLE typography through the real controls (live-apply).
    await page.getByRole("button", { name: "Reading settings" }).click();
    await expect(page.getByRole("heading", { name: "Reading settings", level: 2 })).toBeVisible();
    await page.getByRole("radio", { name: "Sans", exact: true }).click();
    const slider = page.getByRole("slider", { name: "Text size" });
    await slider.focus();
    await slider.press("ArrowUp");
    await slider.press("ArrowUp");
    await slider.press("ArrowUp");

    // Positive control: the article body DID take the new typography —
    // the settings reached the page; the editor is what must stay put.
    const bodyType = await page.evaluate(() => {
      const cs = getComputedStyle(document.body);
      return { fontFamily: cs.fontFamily, fontSize: cs.fontSize };
    });
    expect(bodyType.fontSize, "article body took the 24px size").toBe("24px");
    expect(normalize(bodyType.fontFamily), "article body took the sans stack").not.toBe(
      normalize(articleFontBefore),
    );

    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Reading settings", level: 2 })).toBeHidden();

    // Reopen the editor: its computed typography is byte-unchanged.
    await openNoteEditorViaControls(page);
    const after = await computedType(page);
    expect(after.fontFamily, "note editor font-family unchanged by article Font setting").toBe(
      before.fontFamily,
    );
    expect(after.fontSize, "note editor font-size unchanged by article Text size setting").toBe(
      before.fontSize,
    );
    expect(after.fontSize, "note editor still at the 14px interface register").toBe("14px");
  });

  test("reflow: the note editor stays usable at the 320px reflow target in both reading modes", async ({
    page,
  }) => {
    // The WCAG 1.4.10 reflow proxy (the high-zoom.spec load-bearing bar):
    // 320 CSS px viewport. Paginated-mode zoom survival is
    // note-placement.spec.ts's cell; scrolling zoom is this spec's twin cell.
    await page.setViewportSize({ width: 320, height: 800 });

    // Paginated mode: create + write a note through the full flow.
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    await selectRangeInBlock(page, blockIdx, 0, 18);
    await page.keyboard.press("n");
    const textarea = noteTextarea(page);
    await expect(textarea).toBeVisible();
    await textarea.fill("Reflow note, paginated.");
    await page.locator("#highlight-popover .highlight-popover-done").click();
    await expect(announcementRegion(page)).toContainText(/Note saved/i);

    // Scrolling mode: a disjoint block, same usable editor.
    await switchMode(page);
    const secondBlock = await findFirstBlockWithTextAsync(page, [blockIdx], 24);
    expect(secondBlock).not.toBe(-1);
    await selectRangeInBlock(page, secondBlock, 0, 18);
    await page.keyboard.press("n");
    const secondTextarea = noteTextarea(page);
    await expect(secondTextarea).toBeVisible();
    await secondTextarea.fill("Reflow note, scrolling.");
    await page.locator("#highlight-popover .highlight-popover-done").click();
    await expect(announcementRegion(page)).toContainText(/Note saved/i);
  });

  test("400% body zoom: the editor stays usable in scrolling mode (note-placement's cell is paginated)", async ({
    page,
  }) => {
    // AC "browser zoom ... in both reading modes": note-placement.spec.ts
    // proves the 400% code path in PAGINATED mode; this cell is its
    // scrolling twin. Keyboard-only on purpose — exact zoom geometry is
    // engine-variable (the high-zoom.spec survival-only discipline).
    await openArticle(page, FIXTURE);
    await switchMode(page);
    await page.evaluate(() => {
      (document.body.style as unknown as { zoom: string }).zoom = "4";
    });
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    await selectRangeInBlock(page, blockIdx, 0, 12);
    await page.keyboard.press("n");
    const textarea = noteTextarea(page);
    await expect(textarea).toBeVisible();
    await expect(textarea).toBeFocused();
    await textarea.fill("Zoomed scrolling note.");
    // Cmd/Ctrl+Enter saves and closes — no pointer needed at zoom.
    await page.keyboard.press("Control+Enter");
    await expect(page.locator("dialog#highlight-popover")).not.toBeVisible();
    await expect(page.locator("mark.highlight").first()).toHaveClass(/has-note/);
    await expect(announcementRegion(page)).toContainText(/Note saved/i);
  });
});
