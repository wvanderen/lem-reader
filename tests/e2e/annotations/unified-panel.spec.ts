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

test("one session keeps color and tags available; one Escape saves and returns to the passage", async ({
  page,
}) => {
  await create(page);
  const panel = highlightControls(page);
  await noteTextarea(page).fill("Writing beside highlight controls.");
  await panel.getByRole("radio", { name: "Green", exact: true }).check();
  await expect(noteTextarea(page)).toHaveValue("Writing beside highlight controls.");
  await panel.getByRole("button", { name: "Tags", exact: true }).click();
  const tags = panel.getByRole("combobox");
  await expect(tags).toBeFocused();
  await tags.fill("thoughts");
  await page.keyboard.press("Enter");
  await expect(panel.getByRole("button", { name: "Remove tag thoughts" })).toBeVisible();
  await expect(noteTextarea(page)).toBeVisible();
  await panel.getByRole("button", { name: "Tags", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Tags", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
  await expect(page.locator("mark.highlight").first()).toBeFocused();
  await openHighlightControls(page);
  await expect(noteTextarea(page)).toHaveValue("Writing beside highlight controls.");
  await expect(panel.getByRole("radio", { name: "Green", exact: true })).toBeChecked();
  await expect(panel.getByRole("button", { name: "Tags", exact: true })).toBeFocused();
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

test("Escape closes suggestions first and then closes the whole panel", async ({ page }) => {
  await create(page);
  const panel = highlightControls(page);
  await panel.getByRole("button", { name: "Tags", exact: true }).click();
  await panel.getByRole("combobox").fill("new tag");
  await expect(panel.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel.getByRole("listbox")).not.toBeVisible();
  await expect(panel).toBeVisible();
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
    await panel.getByRole("button", { name: "Tags", exact: true }).click();
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
  await expect(panel.getByRole("radio", { name: "Green", exact: true })).toBeVisible();
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

test("the compact bar expands its note upward while keeping the bottom controls in place", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await create(page);
  await highlightControls(page).getByRole("button", { name: "Done" }).click();
  const panel = await openHighlightControls(page);
  const compact = await panel.boundingBox();
  const footerBefore = await panel.locator(".annotation-panel-footer").boundingBox();
  expect(compact!.height).toBeLessThan(120);
  if (testInfo.project.name === "chromium")
    await page.screenshot({ path: "/private/tmp/annotation-compact.png" });
  await panel.getByRole("button", { name: "Add note" }).click();
  await expect(noteTextarea(page)).toBeFocused();
  await expect(panel.getByRole("button", { name: /Add note|Edit note/ })).toHaveCount(0);
  const expanded = await panel.boundingBox();
  const footerAfter = await panel.locator(".annotation-panel-footer").boundingBox();
  const note = await noteTextarea(page).boundingBox();
  expect(expanded!.height).toBeLessThan(260);
  expect(expanded!.y).toBeLessThan(compact!.y);
  expect(footerAfter!.y).toBeCloseTo(footerBefore!.y, 0);
  expect(note!.y + note!.height).toBeLessThanOrEqual(footerAfter!.y);
  if (testInfo.project.name === "chromium")
    await page.screenshot({ path: "/private/tmp/annotation-note.png" });
});
