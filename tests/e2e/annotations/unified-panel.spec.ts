import { test, expect } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  findFirstBlockWithText,
  selectRangeInBlock,
  openHighlightControls,
  highlightControls,
  noteTextarea,
  installNoteSaveSabotage,
  failNextNoteSave,
  drawerTrigger,
} from "./_fixtures";

async function create(page: import("@playwright/test").Page) {
  await openArticle(page, FIXTURES[0]!);
  const block = await findFirstBlockWithText(page, 24);
  await selectRangeInBlock(page, block, 0, 18);
  await page.keyboard.press("n");
  await expect(noteTextarea(page)).toBeFocused();
}

test.beforeEach(async ({ page }) => {
  await installNoteSaveSabotage(page);
  await wipeDatabase(page);
});

test("one session keeps color and the always-visible tag field available; one Escape saves and returns to the passage", async ({
  page,
}) => {
  await create(page);
  const panel = highlightControls(page);
  await noteTextarea(page).fill("Writing beside highlight controls.");
  await panel.getByRole("button", { name: "Apply slot 3: Green" }).click();
  await expect(noteTextarea(page)).toHaveValue("Writing beside highlight controls.");
  // Issue #207 — the tag field is always visible; no toggle to expand it.
  const tags = panel.getByRole("combobox");
  await expect(tags).toBeVisible();
  await tags.click();
  await tags.fill("thoughts");
  await page.keyboard.press("Enter");
  await expect(panel.getByRole("button", { name: "Remove tag thoughts" })).toBeVisible();
  await expect(noteTextarea(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
  await expect(page.locator("mark.highlight").first()).toBeFocused();
  await openHighlightControls(page);
  await expect(noteTextarea(page)).toHaveValue("Writing beside highlight controls.");
  await expect(panel.getByRole("button", { name: "Apply slot 3: Green" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Remove tag thoughts" })).toBeVisible();
});

test("clearing a note keeps the editor expanded until the next session", async ({ page }) => {
  await create(page);
  await noteTextarea(page).fill("A note");
  await noteTextarea(page).fill("");
  await expect(noteTextarea(page)).toBeVisible();
  await page.keyboard.press("Escape");
  // Escape saves asynchronously; finish closing this session before the
  // reopen helper checks whether an already-open panel needs activation.
  await expect(highlightControls(page)).not.toBeVisible();
  const panel = await openHighlightControls(page);
  await expect(noteTextarea(page)).not.toBeVisible();
  await panel.getByRole("button", { name: "Add note" }).click();
  await expect(noteTextarea(page)).toBeFocused();
});

test("delete confirms unsaved writing and Keep restores it within the same panel", async ({
  page,
}) => {
  await create(page);
  const panel = highlightControls(page);
  await noteTextarea(page).fill("Keep this draft intact.");
  const before = await panel.boundingBox();
  await panel.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(panel.getByText("Delete this highlight?")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Keep", exact: true })).toBeFocused();
  const after = await panel.boundingBox();
  expect(after!.height).toBeCloseTo(before!.height, 0);
  await panel.getByRole("button", { name: "Keep", exact: true }).click();
  await expect(noteTextarea(page)).toHaveValue("Keep this draft intact.");
  await expect(panel.getByRole("button", { name: "Delete", exact: true })).toBeFocused();
  await panel.getByRole("button", { name: "Delete", exact: true }).click();
  await panel.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(panel).not.toBeVisible();
  await expect(page.locator("mark.highlight")).toHaveCount(0);
  await page.waitForTimeout(900); // past the note debounce: deletion must not resurrect its note
  expect(
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open("lem-reader");
        request.onsuccess = () => resolve(request.result);
      });
      return new Promise<number>((resolve) => {
        const request = db.transaction("notes").objectStore("notes").count();
        request.onsuccess = () => {
          resolve(request.result);
          db.close();
        };
      });
    }),
  ).toBe(0);
});

test("Escape peels one layer at a time: suggestions, then draft text, then the panel", async ({
  page,
}) => {
  await create(page);
  const panel = highlightControls(page);
  const tags = panel.getByRole("combobox");
  await tags.click();
  await tags.fill("new tag");
  await expect(panel.getByRole("listbox")).toBeVisible();
  // Layer 1 — dismiss the suggestion list; the draft text survives.
  await page.keyboard.press("Escape");
  await expect(panel.getByRole("listbox")).not.toBeVisible();
  await expect(tags).toHaveValue("new tag");
  await expect(panel).toBeVisible();
  // Layer 2 — clear the uncommitted draft; the panel stays open.
  await page.keyboard.press("Escape");
  await expect(tags).toHaveValue("");
  await expect(panel).toBeVisible();
  // Layer 3 — the panel closes through the guarded save.
  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
});

for (const mobile of [false, true]) {
  test(`${mobile ? "mobile sheet" : "desktop gutter"}: controls and writing fit without moving article content`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1600, height: 1000 },
    );
    await create(page);
    const panel = highlightControls(page);
    await noteTextarea(page).fill("A thought about this passage.");
    const placement = await panel.getAttribute("data-placement");
    expect(placement).toBe(mobile ? "sheet" : "gutter");
    const articleBefore = await page.locator("mark.highlight").first().boundingBox();
    // Issue #207 — the tag field is part of the panel; the bounds assertion
    // now covers the always-visible organization area.
    const bounds = await panel.boundingBox();
    const viewport = page.viewportSize()!;
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.locator("mark.highlight").first().boundingBox()).toEqual(articleBefore);
    if (testInfo.project.name === "chromium") {
      await page.screenshot({
        path: `/private/tmp/annotation-${mobile ? "mobile" : "desktop"}.png`,
      });
    }
  });
}

test("failed Escape retains writing; Retry saves and closes the whole panel", async ({ page }) => {
  await create(page);
  const panel = highlightControls(page);
  await noteTextarea(page).fill("Keep writing through a storage failure.");
  await failNextNoteSave(page);
  await page.keyboard.press("Escape");
  await expect(panel.getByRole("button", { name: "Retry" })).toBeFocused();
  await expect(noteTextarea(page)).toHaveValue("Keep writing through a storage failure.");
  await expect(panel.getByRole("button", { name: "Apply slot 3: Green" })).toBeVisible();
  await panel.getByRole("button", { name: "Retry" }).click();
  await expect(panel).not.toBeVisible();
  await expect(page.locator("mark.highlight").first()).toBeFocused();
});

test("drawer entry restores its action and deletion focuses the neighboring item", async ({
  page,
}) => {
  await create(page);
  await noteTextarea(page).fill("First note");
  await highlightControls(page).getByRole("button", { name: "Done" }).click();
  const block = await findFirstBlockWithText(page, 48);
  await selectRangeInBlock(page, block, 24, 42);
  await page.keyboard.press("n");
  await noteTextarea(page).fill("Second note");
  await highlightControls(page).getByRole("button", { name: "Done" }).click();
  await drawerTrigger(page).click();
  const drawer = page.locator("dialog.annotations-drawer");
  const edit = drawer.locator(".drawer-item").first().getByRole("button", { name: "Edit note" });
  await edit.click();
  await expect(noteTextarea(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(edit).toBeFocused();
  await edit.click();
  await highlightControls(page).getByRole("button", { name: "Delete", exact: true }).click();
  await highlightControls(page).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(drawer.locator(".drawer-item")).toHaveCount(1);
  await expect(drawer.locator(".drawer-entry")).toBeFocused();
});

test("the panel expands its note upward while keeping the bottom controls in place", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openArticle(page, FIXTURES[0]!);
  // Issue #207 — the note-hidden panel now carries the always-visible
  // organization area (tag field + the slot-pill color row, issue #222) so
  // the compact footprint is correspondingly taller. Anchor the mark at the
  // LAST substantial block on the page (mid/lower viewport) so the
  // expansion has upward headroom — the retention floors at the viewport
  // top when space is constrained (the spec's bounds-take-precedence
  // clause).
  const blockIdx = await page.evaluate(() => {
    const eligible = Array.from(
      document.querySelectorAll(
        "[data-block-index]:not(.article-body-measurement [data-block-index])",
      ),
    ).filter((el) => (el.textContent?.length ?? 0) >= 250);
    const el = eligible[eligible.length - 1];
    return el ? Number(el.getAttribute("data-block-index")) : -1;
  });
  expect(blockIdx).not.toBe(-1);
  expect(await selectRangeInBlock(page, blockIdx, 100, 118)).toBe(true);
  await page.keyboard.press("n");
  await expect(noteTextarea(page)).toBeFocused();
  await highlightControls(page).getByRole("button", { name: "Done" }).click();
  const panel = await openHighlightControls(page);
  const compact = await panel.boundingBox();
  const footerBefore = await panel.locator(".annotation-panel-footer").boundingBox();
  expect(compact!.height).toBeLessThan(360);
  expect(compact!.y).toBeGreaterThan(200); // headroom exists for the growth
  if (testInfo.project.name === "chromium")
    await page.screenshot({ path: "/private/tmp/annotation-compact.png" });
  await panel.getByRole("button", { name: "Add note" }).click();
  await expect(noteTextarea(page)).toBeFocused();
  await expect(panel.getByRole("button", { name: /Add note|Edit note/ })).toHaveCount(0);
  const expanded = await panel.boundingBox();
  const footerAfter = await panel.locator(".annotation-panel-footer").boundingBox();
  const note = await noteTextarea(page).boundingBox();
  expect(expanded!.height).toBeLessThan(480);
  expect(expanded!.y).toBeLessThan(compact!.y);
  expect(footerAfter!.y).toBeCloseTo(footerBefore!.y, 0);
  expect(note!.y + note!.height).toBeLessThanOrEqual(footerAfter!.y);
  if (testInfo.project.name === "chromium")
    await page.screenshot({ path: "/private/tmp/annotation-note.png" });
});
