// tests/e2e/annotations/held-number-selection.spec.ts
// Issue #197/#220 — create highlights through number-held selection. Cells
// (observable reader behavior through real browser interactions + the
// persisted seams):
//   A. Holding a slot number (1–5) while a REAL pointer drag selection
//      completes creates immediately with THAT slot's color (+ tags), does
//      not open the annotation panel, auto-dismisses the toolbar and arms
//      the undo grace (Escape deletes exactly it), leaves focus alone, and
//      never changes the saved default slot. Run in paginated AND scrolling
//      modes.
//   B. The digit and the pointer release in EITHER order: an early digit
//      release still creates on the pointer release (the arm survives the
//      gesture). Escape during the hold still cancels and leaves the native
//      selection available (nothing persisted).
//   C. Ordinary keyboard selections never auto-create highlights.
//   D. Number-held gestures cannot bypass overlap rejection across rapid
//      repeated attempts (the shared capture boundary refuses; the hint
//      explains).
//   E. Editable fields (settings slot-name input) and modified shortcuts
//      (Cmd/Ctrl + digit) never arm the gesture; a tagged slot's tags ride
//      the gesture through the established creation path; a Shifted digit
//      release ends the hold (neither this nor the next gesture creates).
//   F. Every supported slot color creates through the gesture (shipped
//      slots 1–5, one fresh session per slot).
import { test, expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  switchMode,
  modeToggle,
  selectRangeInBlock,
  findFirstBlockWithText,
  findFirstBlockWithTextAsync,
  visibleBlock,
  countHighlightsInDexie,
} from "./_fixtures";
import { expandSettingsGroup } from "../settings";

const FIXTURE = FIXTURES[0]!; // essay-long-form
const OVERLAP_HINT = "This overlaps an existing highlight.";

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
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

/** The persisted explicit default slot (null until the first settings write). */
async function readDefaultSlot(page: Page): Promise<number | null> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      const row = await new Promise<{ value?: { defaultHighlightSlot?: number } } | undefined>(
        (resolve, reject) => {
          const tx = db.transaction("settings", "readonly");
          const getReq = tx.objectStore("settings").get("reader-prefs");
          getReq.onsuccess = () => resolve(getReq.result);
          getReq.onerror = () => reject(getReq.error);
        },
      );
      return row?.value?.defaultHighlightSlot ?? null;
    } finally {
      db.close();
    }
  });
}

/** A real pointer drag across a block's mid line (mouse down → move with
 * steps → up), like a reader shaping a selection. The block is centered in
 * the viewport first — `scrollIntoViewIfNeeded` can park it behind the
 * sticky header, putting the drag path on chrome instead of text. */
async function dragAcrossBlock(
  page: Page,
  block: Locator,
  fromFrac = 0.04,
  toFrac = 0.7,
  digit?: string,
): Promise<void> {
  await block.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
  await page.waitForTimeout(250);
  const box = await block.boundingBox();
  if (!box) throw new Error("block not visible for dragging");
  const y = box.y + box.height / 2;
  if (digit) await page.keyboard.down(digit);
  await page.mouse.move(box.x + box.width * fromFrac, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * toFrac, y, { steps: 8 });
  await page.mouse.up();
}

/** The gesture: the digit goes down before the press and stays down through
 * the selection's release (mouse.up happens inside the drag). */
async function heldDrag(page: Page, block: Locator, digit: string): Promise<void> {
  // Finish scrolling and layout before holding the key: surface transitions
  // deliberately clear in-progress holds.
  await dragAcrossBlock(page, block, 0.04, 0.7, digit);
  await page.keyboard.up(digit);
}

async function ensureMode(page: Page, mode: "paginated" | "scrolling"): Promise<void> {
  if (!(await modeToggle(page).getAttribute("aria-label"))?.includes(`Reading mode: ${mode}`)) {
    await switchMode(page);
  }
  await expect(modeToggle(page)).toHaveAttribute(
    "aria-label",
    new RegExp(`^Reading mode: ${mode}`),
  );
}

test.describe("held-number selection (issue #197/#220)", () => {
  for (const mode of ["paginated", "scrolling"] as const) {
    test(`${mode}: held digit creates with that slot immediately, auto-dismisses, keeps the default, never opens the panel`, async ({
      page,
    }) => {
      await openArticle(page, FIXTURE);
      await ensureMode(page, mode);
      const toolbar = page.getByRole("toolbar", { name: "Highlight actions" });

      // Make the settings row observable (the debounced save must have
      // landed) so a rogue default write during the gesture cannot hide.
      if ((await readDefaultSlot(page)) === null) {
        await switchMode(page);
        await switchMode(page);
      }

      // Hold "3" (Green) through a real drag selection.
      const blockIdx = await findFirstBlockWithText(page, 24);
      await heldDrag(page, visibleBlock(page, blockIdx), "3");

      // Immediate creation with slot 3's color — no annotation panel, the
      // toolbar auto-dismisses (issue #220), focus never moved.
      await expect(page.locator("mark.highlight").first()).toHaveClass(/color-green/);
      await expect(toolbar).toHaveCount(0);
      await expect(page.locator("#highlight-popover")).not.toBeVisible();
      expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);

      // Persisted outcome: the slot's color + tags copied onto the record.
      await expect.poll(async () => readHighlightRows(page)).toHaveLength(1);
      const rows = await readHighlightRows(page);
      expect(rows[0]?.color).toBe("green");
      expect(rows[0]?.tags ?? []).toEqual([]);

      // The temporary choice did NOT become the saved default (slot 1).
      await expect.poll(async () => readDefaultSlot(page)).toBe(0);

      // The undo grace: Escape deletes exactly it.
      await page.keyboard.press("Escape");
      await expect.poll(async () => countHighlightsInDexie(page, FIXTURE)).toBe(0);
      await expect(page.locator("mark.highlight")).toHaveCount(0);
    });
  }

  for (const mode of ["paginated", "scrolling"] as const) {
    test(`${mode}: releasing the number before the pointer STILL creates (release order does not matter)`, async ({
      page,
    }) => {
      await openArticle(page, FIXTURE);
      await ensureMode(page, mode);
      const toolbar = page.getByRole("toolbar", { name: "Highlight actions" });
      const blockIdx = await findFirstBlockWithText(page, 24);
      const block = visibleBlock(page, blockIdx);
      await block.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
      await page.waitForTimeout(250);
      const box = (await block.boundingBox())!;
      const y = box.y + box.height / 2;

      await page.keyboard.down("2");
      await page.mouse.move(box.x + box.width * 0.04, y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.7, y, { steps: 8 });
      // Mid-drag the toolbar is suppressed (issue #220: pointer-up mount
      // only) — the sweep is never blocked by floating chrome.
      await expect(toolbar).toHaveCount(0);
      await page.keyboard.up("2"); // released early — before the selection ends
      await page.mouse.up();

      // Issue #220 — release order does not matter: the arm survived the
      // early digit release, so the pointer release creates with slot 2.
      await expect(page.locator("mark.highlight").first()).toHaveClass(/color-yellow/);
      await expect.poll(async () => countHighlightsInDexie(page, FIXTURE)).toBe(1);
      const rows = await readHighlightRows(page);
      expect(rows[0]?.color).toBe("yellow");
      await expect(toolbar).toHaveCount(0); // auto-dismissed on the creation
    });

    test(`${mode}: Escape during the hold cancels creation, leaves the selection, and the release shows the toolbar`, async ({
      page,
    }) => {
      await openArticle(page, FIXTURE);
      await ensureMode(page, mode);
      const toolbar = page.getByRole("toolbar", { name: "Highlight actions" });
      const blockIdx = await findFirstBlockWithText(page, 24);
      const block = visibleBlock(page, blockIdx);
      await block.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
      await page.waitForTimeout(250);
      const box = (await block.boundingBox())!;
      const y = box.y + box.height / 2;

      await page.keyboard.down("4");
      await page.mouse.move(box.x + box.width * 0.04, y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.7, y, { steps: 8 });
      await page.keyboard.press("Escape"); // cancel while the digit is still held
      await page.mouse.up();
      await page.keyboard.up("4");

      await expect(page.locator("mark.highlight")).toHaveCount(0);
      await expect.poll(async () => countHighlightsInDexie(page, FIXTURE)).toBe(0);
      const live = await page.evaluate(() => {
        const sel = window.getSelection();
        return sel !== null && !sel.isCollapsed && sel.rangeCount > 0;
      });
      expect(live).toBe(true);
      // The keyboard/touch alternative stays intact: the visible slot row
      // tracks the surviving selection.
      await expect(toolbar.getByRole("button", { name: "Highlight", exact: true })).toBeVisible();
      await expect(toolbar.getByRole("button", { name: "Slot 4: Blue" })).toBeVisible();
    });
  }

  for (const mode of ["paginated", "scrolling"] as const) {
    test(`${mode}: ordinary pointer selection stays native`, async ({ page }) => {
      await openArticle(page, FIXTURE);
      await ensureMode(page, mode);
      const index = await findFirstBlockWithText(page, 24);
      await dragAcrossBlock(page, visibleBlock(page, index));
      await expect(page.getByRole("button", { name: "Highlight", exact: true })).toBeVisible();
      expect(await page.evaluate(() => window.getSelection()?.toString().length)).toBeGreaterThan(
        0,
      );
      expect(await readHighlightRows(page)).toEqual([]);
    });

    test(`${mode}: shifted digit release cancels and does not stick`, async ({ page }) => {
      await openArticle(page, FIXTURE);
      await ensureMode(page, mode);
      const index = await findFirstBlockWithText(page, 24);
      const block = visibleBlock(page, index);
      await block.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
      const box = (await block.boundingBox())!;
      const y = box.y + box.height / 2;
      await page.keyboard.down("2");
      await page.mouse.move(box.x + box.width * 0.04, y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.7, y, { steps: 8 });
      await page.keyboard.down("Shift");
      await page.keyboard.up("2");
      await page.keyboard.up("Shift");
      await page.mouse.up();
      await expect(page.getByRole("button", { name: "Highlight", exact: true })).toBeVisible();
      expect(await readHighlightRows(page)).toEqual([]);
      // Select fresh text so the surviving selection toolbar cannot cover the drag.
      const nextIndex = await findFirstBlockWithTextAsync(page, [index], 24);
      await dragAcrossBlock(page, visibleBlock(page, nextIndex));
      await expect(page.getByRole("button", { name: "Highlight", exact: true })).toBeVisible();
      expect(await readHighlightRows(page)).toEqual([]);
      expect(await page.evaluate(() => window.getSelection()?.toString().length)).toBeGreaterThan(
        0,
      );
    });
  }

  test("ordinary keyboard selections never auto-create highlights", async ({ page }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    // Seed a caret, then shape the selection with REAL Shift+arrows (the
    // AT/keyboard path — a focused <p> alone is engine-divergent; see the
    // keyboard-shortcuts.spec.ts header).
    expect(await selectRangeInBlock(page, blockIdx, 0, 16)).toBeTruthy();
    const seeded = await page.evaluate(() => {
      const sel = window.getSelection();
      return sel !== null && !sel.isCollapsed && sel.rangeCount > 0;
    });
    expect(seeded).toBe(true);
    for (let i = 0; i < 8; i++) await page.keyboard.press("Shift+ArrowRight");
    // A settle beat: no creation ever arrives for a plain keyboard
    // selection — the visible picker / H stay the creation routes.
    await page.waitForTimeout(300);
    await expect(page.locator("mark.highlight")).toHaveCount(0);
    await expect.poll(async () => countHighlightsInDexie(page, FIXTURE)).toBe(0);
  });

  test("rapid repeated held-digit attempts cannot bypass overlap rejection", async ({ page }) => {
    await openArticle(page, FIXTURE);
    const toolbar = page.getByRole("toolbar", { name: "Highlight actions" });
    const blockIdx = await findFirstBlockWithText(page, 24);
    const block = visibleBlock(page, blockIdx);

    // First held double-click creates with slot 3 — the toolbar
    // auto-dismisses, so nothing floats over the next gesture.
    await page.keyboard.down("3");
    await block.dblclick();
    await expect(page.locator("mark.highlight")).toHaveCount(1);
    await expect(toolbar).toHaveCount(0);

    // Rapid second attempt over the SAME passage: refused through the shared
    // capture boundary — one record, the accessible hint explains. (A second
    // quick drag, not a double-click: the mark re-render can leave the
    // double-click's caret placement engine-divergent.)
    await dragAcrossBlock(page, block);
    await expect(toolbar.getByText(OVERLAP_HINT)).toBeVisible();
    await expect(page.locator("mark.highlight")).toHaveCount(1);
    await expect.poll(async () => countHighlightsInDexie(page, FIXTURE)).toBe(1);
    await page.keyboard.up("3");
  });

  test("editable fields and modified shortcuts never arm the gesture; a tagged slot's tags ride it", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);

    // Give shipped slot 4 (Blue) a tag — the gesture must copy color + tags.
    await page.getByRole("button", { name: "Reading settings" }).click();
    const settings = page.locator("dialog.settings-panel");
    await expandSettingsGroup(page, "Highlights");
    const slot4 = settings.getByRole("group", { name: "Slot 4" });
    await slot4.locator("input#slot-tags-input-3").fill("key-idea");
    await slot4.locator("input#slot-tags-input-3").press("Enter");

    // Editable-field exclusion: keydown "3" lands INSIDE the slot-name
    // input — the hold must stay clean, so the next drag stays ordinary.
    await settings.getByRole("textbox", { name: "Slot 3 name" }).focus();
    await page.keyboard.down("3");
    await page.keyboard.up("3");
    await settings.getByRole("button", { name: "Close reading settings" }).click();

    // Modified shortcut exclusion: Cmd/Ctrl + digit is another app's
    // shortcut — the drag stays ordinary too.
    const blockIdx = await findFirstBlockWithText(page, 24);
    const block = visibleBlock(page, blockIdx);
    await page.keyboard.down("Meta");
    await page.keyboard.down("3");
    await dragAcrossBlock(page, block);
    await page.keyboard.up("3");
    await page.keyboard.up("Meta");
    await expect(page.locator("mark.highlight")).toHaveCount(0);
    expect(await readHighlightRows(page)).toEqual([]);

    // The tagged slot rides the gesture: hold "4" over a fresh block.
    const blockIdx2 = await findFirstBlockWithTextAsync(page, [blockIdx], 24);
    await heldDrag(page, visibleBlock(page, blockIdx2), "4");
    // Only the held-digit gesture creates a mark.
    await expect(page.locator("mark.highlight").first()).toHaveClass(/color-blue/);
    await expect
      .poll(async () => (await readHighlightRows(page)).some((r) => r.color === "blue"))
      .toBe(true);
    const blue = (await readHighlightRows(page)).find((r) => r.color === "blue");
    expect(blue?.tags ?? []).toEqual(["key-idea"]);
    await expect(page.locator("#highlight-popover")).not.toBeVisible();
  });

  // AC: works with all supported slot colors through the existing slot
  // interface. One fresh session per slot — the same single-gesture shape
  // the other cells prove — so no test-local state shadows the gesture.
  for (const [slotIndex, color] of ["default", "yellow", "green", "blue", "pink"].entries()) {
    test(`slot ${slotIndex + 1} (${color}) creates through the gesture with its own color`, async ({
      page,
    }) => {
      await openArticle(page, FIXTURE);
      const blockIdx = await findFirstBlockWithText(page, 24);
      await heldDrag(page, visibleBlock(page, blockIdx), String(slotIndex + 1));
      const mark = page.locator("mark.highlight").first();
      if (color === "default") {
        await expect(mark).not.toHaveClass(/color-/);
      } else {
        await expect(mark).toHaveClass(new RegExp(`color-${color}`));
      }
      await expect.poll(async () => (await readHighlightRows(page))[0]?.color).toBe(color);
      // Issue #220 — the toolbar auto-dismisses on the creation.
      await expect(page.getByRole("toolbar", { name: "Highlight actions" })).toHaveCount(0);
    });
  }
});
