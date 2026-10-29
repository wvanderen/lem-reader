// tests/e2e/annotations/highlight-slots.spec.ts
// Issue #195 — the five named highlight slots. Cells (observable reader
// behavior through the browser seam):
//   A. Keyboard selection → the toolbar's VISIBLE slot row carries the five
//      numbered + named slots (color never the sole identifier); activating
//      one creates IMMEDIATELY with that slot's color — no annotation panel
//      opens — and offers Undo; Undo deletes exactly that highlight. A
//      pointer (touch-register) slot activation applies from the saved
//      state. Run in paginated AND scrolling modes.
//   B. The settings editor reaches the toolbar: renaming/recoloring/tagging
//      slot 2 + moving the EXPLICIT default to it survives a reload; the
//      ordinary route (H) creates with the saved default (color + tags
//      copy); activating another slot never changes the default (the next H
//      still uses slot 2).
//   C. Applying a slot to an EXISTING highlight changes color and ADDS the
//      slot's tags without removing existing ones; direct color editing
//      changes ONLY color; after an application the stale creation-Undo is
//      retired — Escape never deletes the edited highlight.
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  BASE,
  FIXTURES,
  openArticle,
  switchMode,
  selectRangeInBlock,
  findFirstBlockWithText,
  findFirstBlockWithTextAsync,
  visibleBlock,
  countHighlightsInDexie,
  openHighlightControls,
  highlightControls,
} from "./_fixtures";
import { expandSettingsGroup } from "../settings";

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

/** Read every highlight row straight from Dexie (raw IndexedDB). */
async function readHighlightRows(
  page: Page,
): Promise<Array<{ id: string; color?: string; tags?: string[] }>> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("highlights", "readonly");
          const getAll = tx.objectStore("highlights").getAll();
          getAll.onsuccess = () => {
            resolve(getAll.result as Array<{ id: string; color?: string; tags?: string[] }>);
            db.close();
          };
          getAll.onerror = () => reject(getAll.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
}

/** Poll the persisted settings row (the debounced save's landing truth). */
async function waitForSettingsSlot(page: Page, slotIndex: number, name: string): Promise<void> {
  await expect
    .poll(async () => {
      return page.evaluate(async (idx) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open("lem-reader");
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        try {
          const row = await new Promise<
            { value?: { highlightSlots?: { name?: string }[] } } | undefined
          >((resolve, reject) => {
            const tx = db.transaction("settings", "readonly");
            const getReq = tx.objectStore("settings").get("reader-prefs");
            getReq.onsuccess = () => resolve(getReq.result);
            getReq.onerror = () => reject(getReq.error);
          });
          return row?.value?.highlightSlots?.[idx]?.name ?? null;
        } finally {
          db.close();
        }
      }, slotIndex);
    })
    .toBe(name);
}

test.describe("highlight slots in the reader (issue #195)", () => {
  test("keyboard + touch slot activation creates immediately without the panel and offers safe Undo (both modes)", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);

    // Keyboard selection → the toolbar's visible slot row.
    const blockIdx = await findFirstBlockWithText(page, 24);
    await selectRangeInBlock(page, blockIdx, 0, 12);
    const toolbar = page.getByRole("toolbar", { name: "Highlight actions" });
    await expect(toolbar.getByRole("group", { name: "Highlight slots" })).toBeVisible();
    // Number + name on every slot (color is never the sole identifier).
    for (const label of [
      "Slot 1: Default",
      "Slot 2: Yellow",
      "Slot 3: Green",
      "Slot 4: Blue",
      "Slot 5: Pink",
    ]) {
      await expect(toolbar.getByRole("button", { name: label })).toBeVisible();
    }

    // Keyboard activation: focus + Enter on slot 3 — immediate creation,
    // NO annotation panel, the row carries slot 3's color.
    await page.screenshot({ path: test.info().outputPath("desktop-slot-toolbar.png") });
    const slot3 = toolbar.getByRole("button", { name: "Slot 3: Green" });
    await slot3.focus();
    await page.keyboard.press("Enter");
    const editor = page.locator("#highlight-popover");
    await expect(editor).not.toBeVisible();
    await expect(toolbar.getByRole("button", { name: "Undo" })).toBeVisible();
    await expect(page.locator("mark.highlight").first()).toHaveClass(/color-green/);
    await expect.poll(async () => readHighlightRows(page)).toHaveLength(1);
    expect((await readHighlightRows(page))[0]?.color).toBe("green");

    // Creation Undo: Escape deletes exactly the untouched new highlight.
    await page.keyboard.press("Escape");
    await expect.poll(async () => countHighlightsInDexie(page, FIXTURE)).toBe(0);
    await expect(page.locator("mark.highlight")).toHaveCount(0);

    // Touch register: pointer-driven selection → the default slot creates on
    // release; a slot tap from the saved state applies to that highlight.
    const blockIdx2 = await findFirstBlockWithText(page, 24);
    await visibleBlock(page, blockIdx2).dispatchEvent("pointerdown");
    await selectRangeInBlock(page, blockIdx2, 0, 12);
    await visibleBlock(page, blockIdx2).dispatchEvent("pointerup");
    await expect.poll(async () => readHighlightRows(page)).toHaveLength(1);
    const savedToolbar = page.getByRole("toolbar", { name: "Highlight actions" });
    await expect(savedToolbar.getByRole("button", { name: "Undo" })).toBeVisible();
    // The shipped default slot is slot 1 ("Default") — no color modifier.
    await expect(page.locator("mark.highlight").first()).not.toHaveClass(/color-/);
    // Applying slot 5 from the saved state recolors the just-created mark.
    await savedToolbar.getByRole("button", { name: "Slot 5: Pink" }).click();
    await expect(page.locator("mark.highlight").first()).toHaveClass(/color-pink/);
    await expect.poll(async () => (await readHighlightRows(page))[0]?.color).toBe("pink");

    // The same slot flow in scrolling mode (both reading modes supported).
    // The selection target must not overlap the persisted pink highlight —
    // the next free block (overlap creation is refused with the hint).
    await switchMode(page);
    const blockIdx3 = await findFirstBlockWithTextAsync(page, [blockIdx2], 24);
    await selectRangeInBlock(page, blockIdx3, 0, 12);
    const scrollToolbar = page.getByRole("toolbar", { name: "Highlight actions" });
    await expect(scrollToolbar.getByRole("button", { name: "Slot 4: Blue" })).toBeVisible();
    await scrollToolbar.getByRole("button", { name: "Slot 4: Blue" }).click();
    await expect(scrollToolbar.getByRole("button", { name: "Undo" })).toBeVisible();
    await expect
      .poll(async () => (await readHighlightRows(page)).some((r) => r.color === "blue"))
      .toBe(true);
  });

  test("ordinary H and Highlight creation both offer persisted Undo in both modes", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const toolbar = page.getByRole("toolbar", { name: "Highlight actions" });
    for (const mode of ["paginated", "scrolling"] as const) {
      if (mode === "scrolling") await switchMode(page);
      for (const route of ["H", "button"] as const) {
        const blockIdx = await findFirstBlockWithTextAsync(page, [], 24);
        await selectRangeInBlock(page, blockIdx, 0, 12);
        await expect(toolbar.getByRole("button", { name: "Highlight", exact: true })).toBeVisible();
        if (route === "H") await page.keyboard.press("h");
        else await toolbar.getByRole("button", { name: "Highlight", exact: true }).click();
        await expect(toolbar.getByRole("button", { name: "Undo" })).toBeVisible();
        await expect(page.locator("#highlight-popover")).not.toBeVisible();
        await expect.poll(() => countHighlightsInDexie(page, FIXTURE)).toBe(1);
        await toolbar.getByRole("button", { name: "Undo" }).click();
        await expect.poll(() => countHighlightsInDexie(page, FIXTURE)).toBe(0);
      }
    }
  });

  test("settings edits reach the toolbar; the explicit default drives ordinary creation and survives one-off slots", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);

    // Configure slot 2 ("Important": Blue + key-idea tag) and make it the
    // EXPLICIT default for new highlights.
    await page.getByRole("button", { name: "Reading settings" }).click();
    const settings = page.locator("dialog.settings-panel");
    await expandSettingsGroup(page, "Highlights");
    const slot2 = settings.getByRole("group", { name: "Slot 2" });
    await slot2.getByRole("textbox", { name: "Slot 2 name" }).fill("Important");
    await slot2.getByRole("radio", { name: "Blue" }).click();
    await slot2.locator("input#slot-tags-input-1").fill("key-idea");
    await slot2.locator("input#slot-tags-input-1").press("Enter");
    await slot2.getByRole("radio", { name: "Default for new highlights" }).click();
    await expect(slot2.getByRole("radio", { name: "Default for new highlights" })).toBeChecked();
    await settings.getByRole("button", { name: "Close reading settings" }).click();
    // The debounced settings write must land before the reload below.
    await waitForSettingsSlot(page, 1, "Important");

    // Reload: the slot configuration is saved locally and drives the toolbar.
    await page.reload();
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    await selectRangeInBlock(page, blockIdx, 0, 12);
    const toolbar = page.getByRole("toolbar", { name: "Highlight actions" });
    await expect(toolbar.getByRole("button", { name: "Slot 2: Important" })).toBeVisible();

    // The ORDINARY route (H) uses the saved default slot: color + tags copy.
    await page.keyboard.press("h");
    await expect.poll(async () => (await readHighlightRows(page))[0]?.color).toBe("blue");
    let rows = await readHighlightRows(page);
    expect(rows[0]?.tags).toEqual(["key-idea"]);
    // The editor never opened; the ordinary route is quick creation.
    await expect(page.locator("#highlight-popover")).not.toBeVisible();

    // A one-off choice: activate slot 5 (Pink) on a second selection…
    const blockIdx2 = await findFirstBlockWithText(page, 24);
    await visibleBlock(page, blockIdx2).dispatchEvent("pointerdown");
    await selectRangeInBlock(page, blockIdx2, 20, 40);
    await toolbar.getByRole("button", { name: "Slot 5: Pink" }).click();
    await expect
      .poll(async () => (await readHighlightRows(page)).some((r) => r.color === "pink"))
      .toBe(true);
    rows = await readHighlightRows(page);
    expect(rows.find((r) => r.color === "pink")?.tags ?? []).toEqual([]);
    // …and the default is UNCHANGED: the next ordinary creation still uses
    // slot 2 (blue + key-idea), never the one-off pink. The pointerdown
    // clears the saved feedback first (the real reader gesture — a new
    // selection starts with a press), then the synthetic selection + H.
    const blockIdx3 = await findFirstBlockWithText(page, 24);
    await visibleBlock(page, blockIdx3).dispatchEvent("pointerdown");
    await selectRangeInBlock(page, blockIdx3, 44, 64);
    await page.keyboard.press("h");
    await expect
      .poll(async () => (await readHighlightRows(page)).filter((r) => r.color === "blue"))
      .toHaveLength(2);
    rows = await readHighlightRows(page);
    for (const blue of rows.filter((r) => r.color === "blue")) {
      expect(blue.tags).toEqual(["key-idea"]);
    }
  });

  test("applying a slot to an existing highlight adds tags without removing; direct color edits only color; editing retires the stale Undo", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);

    // Give shipped slot 2 a tag first (still Yellow): its application must
    // ADD that tag to an existing highlight.
    await page.getByRole("button", { name: "Reading settings" }).click();
    const settings = page.locator("dialog.settings-panel");
    await expandSettingsGroup(page, "Highlights");
    const slot2 = settings.getByRole("group", { name: "Slot 2" });
    await slot2.locator("input#slot-tags-input-1").fill("key-idea");
    await slot2.locator("input#slot-tags-input-1").press("Enter");
    await settings.getByRole("button", { name: "Close reading settings" }).click();
    await waitForSettingsSlot(page, 1, "Yellow");
    await page.keyboard.press("Escape"); // close the settings sheet

    // Pointer selection → the default slot creates immediately → the saved
    // toolbar offers Undo.
    const blockIdx = await findFirstBlockWithText(page, 24);
    await selectRangeInBlock(page, blockIdx, 0, 16);
    await visibleBlock(page, blockIdx).dispatchEvent("pointerup");
    const savedToolbar = page.getByRole("toolbar", { name: "Highlight actions" });
    await expect(savedToolbar.getByRole("button", { name: "Undo" })).toBeVisible();

    // Apply slot 3 from the saved state — an EDIT: the toolbar dismisses and
    // the creation-Undo retires (Escape can no longer delete).
    await savedToolbar.getByRole("button", { name: "Slot 3: Green" }).click();
    await expect(highlightControls(page)).not.toBeVisible();
    await expect.poll(async () => (await readHighlightRows(page))[0]?.color).toBe("green");
    await page.keyboard.press("Escape");
    await expect.poll(async () => countHighlightsInDexie(page, FIXTURE)).toBe(1);

    // Give the highlight a hand-added tag, then apply the tagged slot from
    // the panel: the slot tag JOINS, the hand-added tag SURVIVES.
    const controls = await openHighlightControls(page);
    await controls.getByRole("button", { name: "Tags" }).click();
    await controls.locator("input#highlight-tags-input").fill("manual");
    await controls.locator("input#highlight-tags-input").press("Enter");
    await expect(controls.getByText("manual", { exact: true })).toBeVisible();
    const slotEntry = controls.getByRole("group", { name: "Apply slot" });
    await slotEntry.getByRole("button", { name: "Apply slot 2: Yellow" }).click();
    await expect(slotEntry.getByText("Slot applied.")).toBeVisible();
    await expect.poll(async () => (await readHighlightRows(page))[0]?.color).toBe("yellow");
    await expect.poll(async () => ((await readHighlightRows(page))[0]?.tags ?? []).length).toBe(2);
    let rowTags = ((await readHighlightRows(page))[0]?.tags ?? []).map((t) => t.toLowerCase());
    expect(rowTags.sort()).toEqual(["key-idea", "manual"]);

    // Direct color editing changes ONLY the color — tags untouched.
    await controls.getByRole("radio", { name: "Pink" }).click();
    await expect.poll(async () => (await readHighlightRows(page))[0]?.color).toBe("pink");
    rowTags = ((await readHighlightRows(page))[0]?.tags ?? []).map((t) => t.toLowerCase());
    expect(rowTags.sort()).toEqual(["key-idea", "manual"]);
  });

  test("zoom/reflow: the slot row wraps and stays operable at the 320px reflow target", async ({
    page,
  }) => {
    // The WCAG 1.4.10 reflow target (the high-zoom.spec load-bearing bar):
    // the visible slot row must reflow (flex-wrap) and every slot button
    // must stay visible + operable — no clipped control, no horizontal scroll.
    await page.setViewportSize({ width: 320, height: 800 });
    await openArticle(page, FIXTURE);
    const longName = "W".repeat(40);
    await page.getByRole("button", { name: "Reading settings" }).click();
    const settings = page.getByRole("dialog", { name: "Reading settings" });
    await expandSettingsGroup(page, "Highlights");
    await settings.getByRole("textbox", { name: "Slot 4 name" }).fill(longName);
    await settings.getByRole("button", { name: "Close reading settings" }).click();
    const blockIdx = await findFirstBlockWithText(page, 24);
    await selectRangeInBlock(page, blockIdx, 0, 12);
    const toolbar = page.getByRole("toolbar", { name: "Highlight actions" });
    await expect(toolbar.getByRole("group", { name: "Highlight slots" })).toBeVisible();
    for (const label of [
      "Slot 1: Default",
      "Slot 2: Yellow",
      "Slot 3: Green",
      `Slot 4: ${longName}`,
      "Slot 5: Pink",
    ]) {
      await expect(toolbar.getByRole("button", { name: label })).toBeVisible();
    }
    const longButton = toolbar.getByRole("button", { name: `Slot 4: ${longName}` });
    const box = await longButton.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    // No horizontal overflow: the toolbar stays inside the viewport.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath("phone-slot-toolbar.png") });
    // Activation still creates (keyboard focus + Enter — the toolbar path).
    await longButton.focus();
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await readHighlightRows(page))[0]?.color).toBe("blue");
    await expect(toolbar.getByRole("button", { name: "Undo" })).toBeVisible();
    await page.keyboard.press("Tab"); // leave saved feedback before opening the panel
    const controls = await openHighlightControls(page);
    await controls.getByRole("button", { name: "Tags" }).click();
    const applyButton = controls.getByRole("button", { name: `Apply slot 4: ${longName}` });
    const applyBox = await applyButton.boundingBox();
    expect(applyBox).not.toBeNull();
    expect(applyBox!.x).toBeGreaterThanOrEqual(0);
    expect(applyBox!.x + applyBox!.width).toBeLessThanOrEqual(320);
    await applyButton.focus();
    await page.screenshot({ path: test.info().outputPath("phone-slot-panel.png") });
    await page.keyboard.press("Enter");
    await expect(controls.getByText("Slot applied.")).toBeVisible();
  });
});
