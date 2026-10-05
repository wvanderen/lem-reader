import { expandSettingsGroup } from "../settings";
// tests/e2e/annotations/highlight-colors.spec.ts
// Issue #118 — named highlight colors in the reader. The picker rides the
// highlight's popover (the reader-details editor); the marks render the
// chosen color in BOTH reading modes; the choice persists; every control
// carries its text label. Cells:
//   1. Create (Default) → pick Green in the popover → the Dexie row carries
//      "green", the mark renders .color-green in paginated AND scrolling
//      modes, and the full reload re-renders it from the persisted record
//      (AC: creation, editing, both reading modes, persistence).
//   2. Keyboard/screen-reader path: the focused mark opens the popover with
//      Enter; the NATIVE radio group arrows through the labelled choices;
//      the mark's aria-label announces the named color (AC: keyboard +
//      screen-reader access; color never the sole identifier).
//   3. An older (pre-#118) highlight — the row's color field stripped via
//      raw IndexedDB — renders the Default fill until the reader changes
//      it (AC: older highlights use Default until explicitly changed).
//   4. Theme contrast: with the Dark preset AND a Custom theme active, the
//      mark's computed fill equals the theme's --highlight-green token (the
//      unit suite pins ink-on-fill ≥ 4.5:1 for every theme; this cell
//      proves the token swap reaches the mark).
//   5. Zoom/reflow (the high-zoom.spec discipline): at the WCAG 1.4.10
//      320px reflow target the colored mark + the picker survive (class +
//      labels + operability), and the 400% CSS-zoom secondary pass asserts
//      survival only.
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  BASE,
  FIXTURES,
  openArticle,
  selectRangeInBlock,
  findFirstBlockWithText,
  switchMode,
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
  color?: string;
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
            resolve(c ? (c.value as { id: string; color?: string }) : null);
            db.close();
          };
          cursor.onerror = () => reject(cursor.error);
        };
        req.onerror = () => reject(req.error);
      }),
    undefined,
  );
}

/** Strip the color field off every highlight row (the pre-#118 row shape). */
async function stripColorFields(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction("highlights", "readwrite");
    const store = tx.objectStore("highlights");
    const rows = store.getAll();
    rows.onsuccess = () => {
      for (const row of rows.result as Record<string, unknown>[]) {
        delete row.color;
        store.put(row);
      }
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
}

/** Create one highlight from the first text-bearing block + open the
 * popover (the N shortcut path). Returns the popover locator. */
async function createHighlightWithPopover(page: Page) {
  const blockIdx = await findFirstBlockWithText(page, 24);
  expect(blockIdx).not.toBe(-1);
  await selectRangeInBlock(page, blockIdx, 0, 18);
  await page.keyboard.press("n");
  const popover = page.locator("#highlight-popover");
  await expect(popover).toBeVisible();
  return popover;
}

test.describe("highlight colors in the reader (issue #118)", () => {
  test("create default → pick Green → persists, renders in both modes, announces in the label", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const popover = await createHighlightWithPopover(page);

    // The picker renders Default + the four named choices, each radio
    // carrying its VISIBLE text label (color never the sole identifier).
    for (const label of ["Default", "Yellow", "Green", "Blue", "Pink"]) {
      await expect(
        popover.getByRole("radio", { name: label }),
        `the ${label} choice is a labelled radio`,
      ).toBeVisible();
    }
    // A fresh highlight is Default — no color modifier on the mark.
    await expect(popover.getByRole("radio", { name: "Default" })).toBeChecked();

    // Pagination geometry baseline: the pick below must not reflow the
    // article (the color fill swap touches no layout property), so the
    // page indicator's "N of M" text is byte-identical across the pick.
    // The load-bearing invariant is the TOTAL M — compared across the pick
    // AND across the reload below.
    const indicator = page.locator(".page-indicator");
    const indicatorBefore = await indicator.textContent();
    const totalBefore = indicatorBefore?.match(/of (.+)$/)?.[1];

    await popover.getByRole("radio", { name: "Green" }).click();
    await popover.locator(".highlight-popover-done").click();
    await expect(popover).not.toBeVisible();

    // The Dexie row carries the named color.
    await expect.poll(async () => (await readFirstHighlightRow(page))?.color).toBe("green");

    // Geometry invariance: same page count after the pick (AC: the color
    // changes no anchors, no reading order, no fragmentation).
    await expect(indicator).toHaveText(indicatorBefore ?? "");

    // Paginated mode: the mark renders the modifier + the announced name.
    const mark = page.locator("mark.highlight").first();
    await expect(mark).toHaveClass(/color-green/);
    await expect(mark).toHaveAttribute("aria-label", /^Green highlight/);

    // Scrolling mode: SAME mark, SAME color, SAME anchor identity.
    await switchMode(page);
    const scrollingMark = page
      .locator(".article-body:not(.article-body-measurement) mark.highlight")
      .first();
    await expect(scrollingMark).toBeVisible();
    await expect(scrollingMark).toHaveClass(/color-green/);
    await expect(scrollingMark).toHaveAttribute("aria-label", /^Green highlight/);

    // Full reload → the persisted record re-renders the color (the reload
    // restores the last-saved mode — possibly scrolling — so return to
    // paginated if needed before reading the indicator).
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const reloaded = page.locator("mark.highlight").first();
    await expect(reloaded).toBeVisible();
    await expect(reloaded).toHaveClass(/color-green/);
    await expect(reloaded).toHaveAttribute("aria-label", /^Green highlight/);
    if (!(await indicator.isVisible())) {
      await switchMode(page);
    }
    // Geometry invariance across the pick AND the reload: same page count.
    await expect(indicator).toContainText(`of ${totalBefore}`);
  });

  test("keyboard path: focused mark + Enter opens the popover; native radio arrows change the color", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const popover = await createHighlightWithPopover(page);
    await popover.locator(".highlight-popover-done").click();
    await expect(popover).not.toBeVisible();

    // Keyboard activation: the mark is tabindex=0; Enter opens the popover.
    const mark = page.locator("mark.highlight").first();
    await mark.focus();
    await expect(mark).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(popover).toBeVisible();

    // The NATIVE radio group: focus the checked Default radio, arrow to the
    // next choice — the change commits (no click needed).
    const defaultRadio = popover.getByRole("radio", { name: "Default" });
    await defaultRadio.focus();
    await expect(defaultRadio).toBeFocused();
    await page.keyboard.press("ArrowRight");
    const yellow = popover.getByRole("radio", { name: "Yellow" });
    await expect(yellow).toBeChecked();
    await popover.locator(".highlight-popover-done").click();

    await expect.poll(async () => (await readFirstHighlightRow(page))?.color).toBe("yellow");
    await expect(page.locator("mark.highlight").first()).toHaveClass(/color-yellow/);
    // The screen-reader label announces the named color (not color alone).
    await expect(page.locator("mark.highlight").first()).toHaveAttribute(
      "aria-label",
      /^Yellow highlight/,
    );
  });

  test("an older highlight without a color field renders Default until changed", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const popover = await createHighlightWithPopover(page);
    await popover.locator(".highlight-popover-done").click();
    await expect(popover).not.toBeVisible();

    // Rewrite the row into the pre-#118 shape (no color key), then reload.
    await stripColorFields(page);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const mark = page.locator("mark.highlight").first();
    await expect(mark).toBeVisible();
    // Default fill — NO color modifier class; the calm unprefixed label.
    await expect(mark).not.toHaveClass(/color-/);
    await expect(mark).toHaveAttribute("aria-label", /^Highlight/);

    // …until the reader explicitly changes it.
    await mark.click();
    await expect(popover).toBeVisible();
    await expect(popover.getByRole("radio", { name: "Default" })).toBeChecked();
    await popover.getByRole("radio", { name: "Blue" }).click();
    await popover.locator(".highlight-popover-done").click();
    await expect.poll(async () => (await readFirstHighlightRow(page))?.color).toBe("blue");
    await expect(page.locator("mark.highlight").first()).toHaveClass(/color-blue/);
  });

  test("theme contrast: the mark's fill follows the theme token (Dark preset + Custom)", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const popover = await createHighlightWithPopover(page);
    await popover.getByRole("radio", { name: "Green" }).click();
    await popover.locator(".highlight-popover-done").click();
    const mark = page.locator("mark.highlight").first();
    await expect(mark).toHaveClass(/color-green/);

    /** The mark's computed fill must equal the live --highlight-green token. */
    const assertFillMatchesToken = async () => {
      const matches = await page.evaluate(() => {
        const markEl = document.querySelector("mark.highlight.color-green");
        if (!markEl) return false;
        const root = getComputedStyle(document.documentElement);
        const token = root.getPropertyValue("--highlight-green").trim();
        if (!/^#[0-9a-fA-F]{6}$/.test(token)) return false;
        const n = Number.parseInt(token.slice(1), 16);
        const [r, g, b] = [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
        return getComputedStyle(markEl).backgroundColor === `rgb(${r}, ${g}, ${b})`;
      });
      expect(matches, "mark fill === the theme's --highlight-green token").toBe(true);
    };

    // Dark preset via the REAL settings dialog (the radio drives applyTheme).
    await page.getByRole("button", { name: "Reading settings" }).click();
    await expandSettingsGroup(page, "Appearance");
    const settings = page.locator("dialog.settings-panel");
    await expect(settings).toBeVisible();
    await settings.getByRole("radio", { name: "Dark", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await assertFillMatchesToken();

    // Custom dark slot (issue #120): the derived palette's inline writes own
    // the tokens.
    await settings.getByRole("radio", { name: "Custom dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "custom-dark");
    await assertFillMatchesToken();
  });

  test("zoom/reflow: the colored mark + picker survive 320px reflow and 400% zoom", async ({
    page,
  }) => {
    // The WCAG 1.4.10 reflow target (the high-zoom.spec load-bearing bar).
    await page.setViewportSize({ width: 320, height: 800 });
    await openArticle(page, FIXTURE);
    const popover = await createHighlightWithPopover(page);
    await popover.getByRole("radio", { name: "Pink" }).click();
    await popover.locator(".highlight-popover-done").click();

    const mark = page.locator("mark.highlight").first();
    await expect(mark).toBeVisible();
    await expect(mark).toHaveClass(/color-pink/);

    // The 400% CSS-zoom SECONDARY pass — survival only (engine-variable;
    // setViewportSize above is the load-bearing reflow assertion).
    await page.evaluate(() => {
      (document.body.style as unknown as { zoom: string }).zoom = "4";
    });
    await page.waitForTimeout(500);
    await expect(mark).toBeVisible();
    await expect(mark).toHaveClass(/color-pink/);
    await expect(mark).toContainText(/./);

    // The picker stays operable under zoom: reopening the popover offers
    // every labelled choice (no content lost).
    await mark.evaluate((el) => (el as HTMLElement).focus());
    await page.keyboard.press("Enter");
    await expect(popover).toBeVisible();
    for (const label of ["Default", "Yellow", "Green", "Blue", "Pink"]) {
      await expect(popover.getByRole("radio", { name: label })).toBeVisible();
    }
  });
});
