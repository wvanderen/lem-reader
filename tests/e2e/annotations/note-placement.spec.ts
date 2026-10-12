// tests/e2e/annotations/note-placement.spec.ts
// Issue #176 — the note editor opens BESIDE the passage without layout
// shifts. The placement ladder (notePlacement.ts, chosen on open):
//
//   1. GUTTER (desktop preferred) — beside the article column in the empty
//      margin, vertically near the passage: the passage stays fully
//      readable and no article text is covered at all.
//   2. ABOVE / BELOW — entirely above or below the passage, never
//      obscuring it.
//   3. SHEET — docked to the viewport bottom when neither vertical side
//      fits (small viewports, screen-filling selections).
//   4. CENTER — fallback when no visible anchor (drawer paths on
//      scrolled-away passages).
//
// What these specs prove in REAL layout (jsdom cannot):
//   - The anchored dialog carries data-placement + sits where the ladder
//     says (paginated AND scrolling, desktop + narrow viewports).
//   - Placement is STABLE WHILE TYPING (no movement as the note grows).
//   - A viewport change repositions (and keeps the box inside the viewport).
//   - The delete-confirm view shares the editor's footprint (same
//     placement mode, left edge, width).
//   - Opening, typing, confirming, and closing never shift article content
//     or change pagination (the core invariant of the issue).
//   - 400% body zoom leaves the editor usable (the no-content-lost
//     register — exact zoom geometry is engine-variable, high-zoom.spec
//     discipline), and reduced motion sees no transitions.
//
// VoiceOver textarea reachability (the modal AX context) stays owned by
// note-popover-focus.spec.ts — placement does not touch the dialog's
// semantics; the human VO checkpoint is unchanged.
import { test, expect, type Page } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  selectRangeInBlock,
  selectRangeBetweenBlocks,
  findFirstBlockWithText,
  switchMode,
  openHighlightControls,
  highlightControls,
  noteTextarea,
  announcementRegion,
  drawerTrigger,
  totalPages,
  currentPageIdx,
} from "./_fixtures";

const FIXTURE = FIXTURES[0]!; // essay-long-form

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

/** A box in viewport coordinates. */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Read the dialog's geometry, its placement mode, the anchor mark's rect,
 *  the visible article column rect, and the viewport — ONE evaluate, one
 *  layout flush (the measurement-clone discipline: the visible surface
 *  only, never .article-body-measurement). */
function readGeometry(page: Page) {
  return page.evaluate(() => {
    const dlg = document.querySelector<HTMLElement>("dialog#highlight-popover");
    const mark = Array.from(
      document.querySelectorAll<HTMLElement>("mark.highlight[data-highlight-id]"),
    ).find((el) => el.closest(".article-body-measurement") === null);
    const col = Array.from(document.querySelectorAll<HTMLElement>(".article-body")).find(
      (el) => el.closest(".article-body-measurement") === null,
    );
    const boxOf = (el: HTMLElement | null | undefined) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    };
    return {
      box: boxOf(dlg),
      mode: dlg?.getAttribute("data-placement") ?? null,
      mark: boxOf(mark),
      col: boxOf(col),
      vw: window.innerWidth,
      vh: window.innerHeight,
      scrollY: window.scrollY,
    };
  });
}

function overlap(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width - 0.5 &&
    a.x + a.width > b.x + 0.5 &&
    a.y < b.y + b.height - 0.5 &&
    a.y + a.height > b.y + 0.5
  );
}

/** Create a highlight + open the editor through the proven create path
 *  (selection → N), then close via Done so the highlight survives for the
 *  controls-based reopening the placement specs use. */
async function createHighlight(page: Page): Promise<void> {
  const blockIdx = await findFirstBlockWithText(page, 24);
  expect(blockIdx).not.toBe(-1);
  await selectRangeInBlock(page, blockIdx, 0, 18);
  await page.keyboard.press("n");
  await expect(page.locator("dialog#highlight-popover")).toBeVisible();
  await noteTextarea(page).fill("Placement probe note.");
  await page.locator("#highlight-popover .highlight-popover-done").click();
  await expect(page.locator("dialog#highlight-popover")).not.toBeVisible();
}

test.describe("Issue #176 — note editor placement beside the passage", () => {
  for (const mode of ["paginated", "scrolling"] as const) {
    test(`desktop viewport: the editor opens in the gutter beside the passage (${mode})`, async ({
      page,
    }) => {
      await openArticle(page, FIXTURE);
      if (mode === "scrolling") await switchMode(page);
      await createHighlight(page);

      await openHighlightControls(page);
      await highlightControls(page)
        .getByRole("button", { name: /(Add|Edit) note/ })
        .click();
      const dlg = page.locator("dialog#highlight-popover");
      await expect(dlg).toBeVisible();
      await expect(noteTextarea(page)).toBeFocused();

      const geo = await readGeometry(page);
      expect(geo.box, "editor box measurable").not.toBeNull();
      expect(geo.mode, "the ladder chose the gutter placement").toBe("gutter");
      expect(geo.mark, "anchor mark measurable").not.toBeNull();
      expect(geo.col, "article column measurable").not.toBeNull();

      // Inside the viewport with the edge margin.
      expect(geo.box!.x).toBeGreaterThanOrEqual(7);
      expect(geo.box!.x + geo.box!.width).toBeLessThanOrEqual(geo.vw - 7);
      expect(geo.box!.y).toBeGreaterThanOrEqual(7);
      expect(geo.box!.y + geo.box!.height).toBeLessThanOrEqual(geo.vh - 7);
      // The passage stays fully readable — no overlap with the mark.
      expect(overlap(geo.box!, geo.mark!), "editor must not cover the passage").toBe(false);
      // The gutter is EMPTY article space: no horizontal overlap with the
      // column (the editor covers no article content at all).
      const coversColumn =
        geo.box!.x < geo.col!.x + geo.col!.width - 0.5 &&
        geo.box!.x + geo.box!.width > geo.col!.x + 0.5;
      expect(coversColumn, "gutter editor must sit beside the column").toBe(false);
    });
  }

  test("placement is stable while typing a long note", async ({ page }) => {
    await openArticle(page, FIXTURE);
    await createHighlight(page);
    await openHighlightControls(page);
    await highlightControls(page)
      .getByRole("button", { name: /(Add|Edit) note/ })
      .click();
    await expect(noteTextarea(page)).toBeFocused();

    const before = await readGeometry(page);
    expect(before.mode).toBe("gutter");
    await noteTextarea(page).fill("L".repeat(4000));
    const after = await readGeometry(page);

    expect(after.mode).toBe("gutter");
    expect(after.box!.x).toBeCloseTo(before.box!.x, 0);
    expect(after.box!.y).toBeCloseTo(before.box!.y, 0);
    expect(after.box!.width).toBeCloseTo(before.box!.width, 0);
    // Bounded height held: the textarea scrolls internally instead.
    expect(after.box!.height).toBeLessThan(after.vh);
  });

  test("a viewport change repositions and keeps the editor inside the viewport", async ({
    page,
  }) => {
    // Scrolling mode on purpose: a paginated resize repaginates (the mark
    // can legitimately change pages mid-edit); scrolling keeps the anchor
    // resolvable so the reposition is provably anchored to the FRESH
    // passage rect.
    await openArticle(page, FIXTURE);
    await switchMode(page);
    await createHighlight(page);
    await openHighlightControls(page);
    await highlightControls(page)
      .getByRole("button", { name: /(Add|Edit) note/ })
      .click();
    await expect(noteTextarea(page)).toBeFocused();
    expect((await readGeometry(page)).mode).toBe("gutter");

    // Narrow the viewport mid-edit: at 800px the gutters drop below the
    // usable minimum, so the ladder must move the editor above/below (or
    // sheet) — inside the viewport, never covering the passage.
    await page.setViewportSize({ width: 800, height: 600 });
    await expect
      .poll(async () => (await readGeometry(page)).mode, "placement re-runs on resize")
      .not.toBe("gutter");
    const geo = await readGeometry(page);
    expect(geo.mode, "still anchored (visible passage)").not.toBeNull();
    expect(geo.box!.x).toBeGreaterThanOrEqual(7);
    expect(geo.box!.x + geo.box!.width).toBeLessThanOrEqual(geo.vw - 7);
    expect(geo.box!.y).toBeGreaterThanOrEqual(7);
    expect(geo.box!.y + geo.box!.height).toBeLessThanOrEqual(geo.vh - 7);
    expect(overlap(geo.box!, geo.mark!), "repositioned editor must not cover the passage").toBe(
      false,
    );
  });

  test("no room above or below: the editor docks as a bottom sheet", async ({ page }) => {
    // A short scrolling viewport: the passage centered in it leaves less
    // room than the editor's bounded height on either vertical side.
    await page.setViewportSize({ width: 375, height: 320 });
    await openArticle(page, FIXTURE);
    await switchMode(page);
    await createHighlight(page);
    // Center the mark vertically so neither side can fit the editor.
    await page.evaluate(() => {
      const mark = Array.from(
        document.querySelectorAll<HTMLElement>("mark.highlight[data-highlight-id]"),
      ).find((el) => el.closest(".article-body-measurement") === null);
      mark?.scrollIntoView({ block: "center" });
    });
    await openHighlightControls(page);
    await highlightControls(page)
      .getByRole("button", { name: /(Add|Edit) note/ })
      .click();
    await expect(noteTextarea(page)).toBeVisible();

    const geo = await readGeometry(page);
    expect(geo.mode, "the sheet is the only placement that fits").toBe("sheet");
    // Docked to the viewport bottom, fully on screen.
    expect(geo.box!.y).toBeGreaterThanOrEqual(0);
    expect(geo.box!.y + geo.box!.height).toBeCloseTo(geo.vh, 0);
    expect(geo.box!.x).toBeGreaterThanOrEqual(7);
    expect(geo.box!.x + geo.box!.width).toBeLessThanOrEqual(geo.vw - 7);
  });

  test("a multi-block passage uses all visible fragments for placement", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await openArticle(page, FIXTURE);
    await switchMode(page);
    const indices = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>(".article-body [data-block-index]"))
        .filter(
          (el) =>
            !el.closest(".article-body-measurement") &&
            el.tagName === "P" &&
            (el.textContent?.length ?? 0) > 24,
        )
        .slice(0, 2)
        .map((el) => Number(el.dataset.blockIndex)),
    );
    expect(indices).toHaveLength(2);
    expect(
      await selectRangeBetweenBlocks(
        page,
        { blockIndex: indices[0]!, offset: 0 },
        { blockIndex: indices[1]!, offset: 24 },
      ),
    ).toBe(true);
    await page.keyboard.press("n");
    await expect(noteTextarea(page)).toBeVisible();
    const geo = await readGeometry(page);
    const fragments = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("mark.highlight"))
        .filter((el) => !el.closest(".article-body-measurement"))
        .flatMap((el) => Array.from(el.getClientRects()))
        .filter((r) => r.bottom > 0 && r.top < window.innerHeight)
        .map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height })),
    );
    expect(fragments.length).toBeGreaterThan(1);
    expect(geo.mode).not.toBeNull();
    if (geo.mode !== "sheet") {
      for (const fragment of fragments) expect(overlap(geo.box!, fragment)).toBe(false);
    }
  });

  test("vertical shrink and expansion keep the gutter editor inside the viewport", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    await createHighlight(page);
    await openHighlightControls(page);
    await highlightControls(page).getByRole("button", { name: "Edit note" }).click();
    const original = await readGeometry(page);
    await page.setViewportSize({ width: original.vw, height: 150 });
    await expect
      .poll(async () => {
        const { box } = await readGeometry(page);
        return box!.y + box!.height;
      })
      .toBeLessThanOrEqual(150);
    const small = await readGeometry(page);
    expect(small.box!.y + small.box!.height).toBeLessThanOrEqual(150);
    await page.setViewportSize({ width: original.vw, height: original.vh });
    await expect
      .poll(async () => (await readGeometry(page)).box!.height)
      .toBeCloseTo(original.box!.height, 0);
    const restored = await readGeometry(page);
    expect(restored.box!.y).toBeGreaterThanOrEqual(0);
    expect(restored.box!.y + restored.box!.height).toBeLessThanOrEqual(original.vh);
  });

  test("the delete-confirm view shares the editor's footprint", async ({ page }) => {
    await openArticle(page, FIXTURE);
    await createHighlight(page);

    // Session 1: the editor — record its placement + footprint.
    await openHighlightControls(page);
    await highlightControls(page).getByRole("button", { name: "Edit note" }).click();
    await expect(noteTextarea(page)).toBeVisible();
    const editor = await readGeometry(page);
    expect(editor.mode).toBe("gutter");
    await page.locator("#highlight-popover .highlight-popover-done").click();
    await expect(page.locator("dialog#highlight-popover")).not.toBeVisible();

    // Session 2: the confirm view (controls → Delete on a noted highlight).
    await highlightControls(page).getByRole("button", { name: "Delete" }).click();
    const dlg = page.locator("dialog#highlight-popover");
    await expect(dlg.locator(".highlight-popover-confirm")).toBeVisible();
    const confirm = await readGeometry(page);

    // Same placement decision, same left edge, same consistent width.
    expect(confirm.mode).toBe(editor.mode);
    expect(confirm.box!.x).toBeCloseTo(editor.box!.x, 0);
    expect(confirm.box!.width).toBeCloseTo(editor.box!.width, 0);
    expect(confirm.box!.height).toBeCloseTo(editor.box!.height, 0);
    expect(confirm.box!.y).toBeCloseTo(editor.box!.y, 0);
    expect(overlap(confirm.box!, editor.mark!)).toBe(false);
  });

  test("opening, typing, confirming, and closing never shift the article or pagination (paginated)", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    await createHighlight(page);

    const pagesBefore = await totalPages(page);
    const idxBefore = await currentPageIdx(page);
    const before = await readGeometry(page);

    // Open + type (the editor open path).
    await openHighlightControls(page);
    await highlightControls(page)
      .getByRole("button", { name: /(Add|Edit) note/ })
      .click();
    await expect(noteTextarea(page)).toBeFocused();
    await noteTextarea(page).fill("A much longer note that must not move the page underneath.");

    // Confirm path: close to controls, Delete, Keep (confirmation without
    // deletion — the footprint visit).
    await page.locator("#highlight-popover .highlight-popover-done").click();
    await highlightControls(page).getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("#highlight-popover .highlight-popover-confirm")).toBeVisible();
    await page.locator("#highlight-popover [data-initial-focus]").click();
    await expect(page.locator("dialog#highlight-popover")).not.toBeVisible();

    const after = await readGeometry(page);
    expect(await totalPages(page)).toBe(pagesBefore);
    expect(await currentPageIdx(page)).toBe(idxBefore);
    // The passage itself never moved (no scroll, no reflow).
    expect(after.mark!.x).toBeCloseTo(before.mark!.x, 0);
    expect(after.mark!.y).toBeCloseTo(before.mark!.y, 0);
    expect(after.col!.x).toBeCloseTo(before.col!.x, 0);
    expect(after.col!.width).toBeCloseTo(before.col!.width, 0);
    expect(after.scrollY).toBeCloseTo(before.scrollY, 0);
    // The article is interactive again: activating another surface works
    // (the controls reopen from the mark).
    await page.locator("mark.highlight").first().click();
    await expect(highlightControls(page)).toBeVisible();
  });

  test("opening, typing, and closing never shift the article (scrolling)", async ({ page }) => {
    await openArticle(page, FIXTURE);
    await switchMode(page);
    await createHighlight(page);

    const before = await readGeometry(page);
    await openHighlightControls(page);
    await highlightControls(page)
      .getByRole("button", { name: /(Add|Edit) note/ })
      .click();
    await expect(noteTextarea(page)).toBeFocused();
    await noteTextarea(page).fill("Scrolling-mode stability note.");
    await page.locator("#highlight-popover .highlight-popover-done").click();
    await expect(page.locator("dialog#highlight-popover")).not.toBeVisible();

    const after = await readGeometry(page);
    expect(after.scrollY).toBeCloseTo(before.scrollY, 0);
    expect(after.mark!.y).toBeCloseTo(before.mark!.y, 0);
    expect(after.col!.y).toBeCloseTo(before.col!.y, 0);
  });

  test("400% body zoom: the editor stays open, reachable, and saves (no content lost)", async ({
    page,
  }) => {
    // Keyboard-only on purpose: exact zoom geometry (and pointer mapping)
    // is engine-variable (high-zoom.spec discipline) — this cell proves
    // FUNCTION reachability at the 400% code path, not pixel positions.
    await openArticle(page, FIXTURE);
    await page.evaluate(() => {
      document.body.style.zoom = "4";
    });
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    // A programmatic Range (keyboard-shortcuts.spec discipline: Shift+arrows
    // do not extend a selection from a focused <p> cross-engine; the H/N
    // shortcuts read the live selection either way).
    await selectRangeInBlock(page, blockIdx, 0, 12);
    await page.keyboard.press("n");
    const textarea = noteTextarea(page);
    await expect(textarea).toBeVisible();
    await expect(textarea).toBeFocused();
    await textarea.fill("Zoomed note.");
    // Cmd/Ctrl+Enter is the editor's save-and-close shortcut — no pointer
    // needed.
    await page.keyboard.press("Control+Enter");
    await expect(page.locator("dialog#highlight-popover")).not.toBeVisible();
    // The note landed: the mark carries the has-note modifier + the calm
    // saved announce (the zoomed session's function proof).
    await expect(page.locator("mark.highlight").first()).toHaveClass(/has-note/);
    await expect(announcementRegion(page)).toContainText(/Note saved/i);
  });

  test("no visible anchor: the drawer path keeps the UA-centered fallback", async ({ page }) => {
    // Scrolling mode + the passage scrolled out of view (the drawer is the
    // only editor entry point once the lightweight controls are gone): the
    // ladder has no visible anchor, so the dialog keeps the pre-#176
    // UA-centered look — no data-placement, centered on both axes (the
    // dialog-centering register, ±24px).
    await openArticle(page, FIXTURE);
    await switchMode(page);
    await createHighlight(page);
    await page.evaluate(() => {
      const mark = Array.from(
        document.querySelectorAll<HTMLElement>("mark.highlight[data-highlight-id]"),
      ).find((el) => el.closest(".article-body-measurement") === null);
      mark?.scrollIntoView({ block: "start" });
      window.scrollBy(0, window.innerHeight * 2);
    });
    const markOnScreen = await page.evaluate(() => {
      const mark = Array.from(
        document.querySelectorAll<HTMLElement>("mark.highlight[data-highlight-id]"),
      ).find((el) => el.closest(".article-body-measurement") === null);
      if (!mark) return false;
      const r = mark.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight;
    });
    expect(markOnScreen, "the passage must be scrolled out of view").toBe(false);

    await drawerTrigger(page).click();
    const drawer = page.locator("dialog.annotations-drawer");
    await expect(drawer).toBeVisible();
    await drawer.locator(".drawer-entry-action", { hasText: "Edit note" }).click();
    await expect(noteTextarea(page)).toBeVisible();

    const geo = await readGeometry(page);
    expect(geo.mode, "no data-placement in the centered fallback").toBeNull();
    const centerDeltaX = Math.abs(geo.box!.x + geo.box!.width / 2 - geo.vw / 2);
    const centerDeltaY = Math.abs(geo.box!.y + geo.box!.height / 2 - geo.vh / 2);
    expect(centerDeltaX).toBeLessThanOrEqual(24);
    expect(centerDeltaY).toBeLessThanOrEqual(24);
  });

  test("reduced motion: no transition or animation on the editor", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openArticle(page, FIXTURE);
    await createHighlight(page);
    await openHighlightControls(page);
    await highlightControls(page)
      .getByRole("button", { name: /(Add|Edit) note/ })
      .click();
    await expect(noteTextarea(page)).toBeVisible();
    const motion = await page.evaluate(() => {
      const dlg = document.querySelector<HTMLElement>("dialog#highlight-popover");
      if (!dlg) return null;
      const cs = getComputedStyle(dlg);
      return {
        duration: cs.transitionDuration,
        animation: cs.animationName,
      };
    });
    expect(motion, "dialog measurable").not.toBeNull();
    expect(motion!.duration === "0s" || motion!.duration === "").toBe(true);
    expect(motion!.animation === "none" || motion!.animation === "").toBe(true);
  });
});
