// tests/e2e/annotations/highlight-custom-colors.spec.ts
// Issue #196 — readers choose arbitrary slot colors and preview their
// readable appearance in the active theme. Cells (observable reader behavior
// through the browser seam — the unit layer owns the contrast math):
//   A. The settings editor's Custom choice + native color input write the
//      slot snapshot; the LIVE preview paints the literal mark anatomy with
//      the tint derived for the ACTIVE theme.
//   B. Creating with that slot copies the snapshot onto the record
//      (customColor in Dexie) and the reader's mark paints EXACTLY the
//      preview's tint (preview = render, same document, computed styles).
//   C. The tint survives a reload and is independent of later slot edits:
//      recoloring the slot leaves the historical highlight's paint unchanged.
//   D. Switching the theme re-derives the tint (the mark repaints for the
//      active theme; the preview follows — one derivation, two surfaces).
//   E. The review surface shows the same state: the row's stripe paints the
//      tint, and the color dialog's Custom pill is checked.
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  BASE,
  FIXTURES,
  openArticle,
  selectRangeInBlock,
  findFirstBlockWithText,
  visibleBlock,
} from "./_fixtures";
import { expandSettingsGroup } from "../settings";
import { customHighlightTint, highlightBases } from "../../../src/settings/highlightTint";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";

const FIXTURE = FIXTURES[0]!; // essay-long-form
const CHOSEN = "#7a1f5c"; // a saturated plum — clearly outside the named set

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
async function readHighlightRows(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("highlights", "readonly");
          const getAll = tx.objectStore("highlights").getAll();
          getAll.onsuccess = () => {
            resolve(getAll.result as Array<Record<string, unknown>>);
            db.close();
          };
          getAll.onerror = () => reject(getAll.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
}

/** Poll the persisted settings row for the slot's custom color (the debounced
 * save's landing truth — the reload steps below depend on it). */
async function waitForSlotCustomColor(page: Page, slotIndex: number, hex: string): Promise<void> {
  await expect
    .poll(async () => {
      return page.evaluate(
        async ({ idx, want }) => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const req = indexedDB.open("lem-reader");
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
          const row = await new Promise<Record<string, unknown> | undefined>(
            (resolve, reject) => {
              const tx = db.transaction("settings", "readonly");
              const get = tx.objectStore("settings").get("reader-prefs");
              get.onsuccess = () => resolve(get.result as Record<string, unknown> | undefined);
              get.onerror = () => reject(get.error);
            },
          );
          db.close();
          if (!row?.value) return false;
          const slots = (row.value as Record<string, unknown>).highlightSlots as
            | Array<Record<string, unknown>>
            | undefined;
          return slots?.[idx]?.customColor === want;
        },
        { idx: slotIndex, want: hex },
      );
    })
    .toBe(true);
}

/** Configure slot 2 with the chosen custom color; return the LIVE preview's
 * computed background (the settings dialog stays open while reading it). */
async function configureSlot2AndReadPreview(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Reading settings" }).click();
  const settings = page.locator("dialog.settings-panel");
  await expandSettingsGroup(page, "Highlights");
  const slot2 = settings.getByRole("group", { name: "Slot 2" });
  await slot2.getByRole("radio", { name: "Custom" }).click();
  const input = slot2.getByLabel("Slot 2 custom color");
  // The native color input takes #rrggbb through fill (the value setter).
  await input.fill(CHOSEN);
  const expected = customHighlightTint(CHOSEN, highlightBases(DEFAULT_SETTINGS)) as string;
  // The preview paints the DERIVED tint (converted to the computed rgb form).
  const rgb = await page.evaluate((hex) => {
    const n = Number.parseInt(hex.slice(1), 16);
    return `rgb(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff})`;
  }, expected);
  const previewMark = slot2.locator("mark.highlight");
  await expect(previewMark).toHaveClass(/color-custom/);
  await expect(previewMark).toHaveCSS("background-color", rgb);
  return rgb;
}

test("slot custom color: preview = mark, snapshot on the record, reload-stable, slot-edit independent", async ({
  page,
}) => {
  await openArticle(page, FIXTURE);

  // A. Configure + read the live preview tint.
  const previewRgb = await configureSlot2AndReadPreview(page);
  await waitForSlotCustomColor(page, 1, CHOSEN);
  await page.getByRole("button", { name: "Close reading settings" }).click();

  // B. Create with slot 2 (keyboard activation — immediate, no panel) and
  //    compare the reader mark's paint against the preview byte-for-byte.
  const blockIdx = await findFirstBlockWithText(page, 24);
  await selectRangeInBlock(page, blockIdx, 0, 12);
  const toolbar = page.getByRole("toolbar", { name: "Highlight actions" });
  await toolbar.getByRole("button", { name: "Slot 2: Yellow" }).focus();
  await page.keyboard.press("Enter");
  const mark = page.locator("article mark.highlight").first();
  await expect(mark).toHaveClass(/color-custom/);
  await expect(mark).toHaveCSS("background-color", previewRgb);
  await expect(page.locator("#highlight-popover")).not.toBeVisible();
  const rows = await readHighlightRows(page);
  expect(rows).toHaveLength(1);
  expect(rows[0]?.customColor).toBe(CHOSEN);
  // The named fallback stays the slot's named choice; the snapshot rides
  // beside it and wins at every render site.
  expect(rows[0]?.color).toBe("yellow");

  // C. Reload: the snapshot survives (customColor on the row), and the mark
  //    paints the same tint — a slot is configuration, the record is fact.
  await waitForSlotCustomColor(page, 1, CHOSEN);
  await page.reload();
  await openArticle(page, FIXTURE);
  await expect(page.locator("article mark.highlight").first()).toHaveClass(/color-custom/);
  await expect(page.locator("article mark.highlight").first()).toHaveCSS("background-color", previewRgb);

  // Editing the slot never recolors historical annotations: set a different
  // custom color; the existing mark's paint is UNCHANGED (and the toolbar's
  // slot swatch follows the new choice for FUTURE highlights).
  const REPLACEMENT = "#1234ab";
  await page.getByRole("button", { name: "Reading settings" }).click();
  const settings = page.locator("dialog.settings-panel");
  await expandSettingsGroup(page, "Highlights");
  const slot2 = settings.getByRole("group", { name: "Slot 2" });
  await slot2.getByLabel("Slot 2 custom color").fill(REPLACEMENT);
  await waitForSlotCustomColor(page, 1, REPLACEMENT);
  await page.getByRole("button", { name: "Close reading settings" }).click();
  await expect(page.locator("article mark.highlight").first()).toHaveCSS(
    "background-color",
    previewRgb,
  );

  // D. Theme switch re-derives the tint (readable in the ACTIVE theme): the
  //    mark repaints with the dark derivation of its OWN stored snapshot
  //    (CHOSEN — the record is independent of the slot's current config),
  //    while the slot editor's live preview shows the dark derivation of the
  //    slot's CURRENT choice (REPLACEMENT — future highlights).
  await page.getByRole("button", { name: "Reading settings" }).click();
  const settingsReopened = page.locator("dialog.settings-panel");
  await expandSettingsGroup(page, "Appearance");
  await settingsReopened.getByRole("radio", { name: "Night", exact: true }).click();
  await waitForSlotCustomColor(page, 1, REPLACEMENT);
  const darkBases = highlightBases({ ...DEFAULT_SETTINGS, theme: "dark" });
  const toRgb = (hex: string) =>
    page.evaluate((h) => {
      const n = Number.parseInt(h.slice(1), 16);
      return `rgb(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff})`;
    }, hex);
  const darkMarkRgb = await toRgb(customHighlightTint(CHOSEN, darkBases) as string);
  const darkPreviewRgb = await toRgb(customHighlightTint(REPLACEMENT, darkBases) as string);
  const previewMarkDark = settingsReopened
    .getByRole("group", { name: "Slot 2" })
    .locator("mark.highlight");
  await expect(previewMarkDark).toHaveCSS("background-color", darkPreviewRgb);
  await page.getByRole("button", { name: "Close reading settings" }).click();
  // The reader mark repaints with the SAME dark derivation of its snapshot.
  await expect(page.locator("article mark.highlight").first()).toHaveCSS(
    "background-color",
    darkMarkRgb,
  );
});

test("the review surface carries the custom state: the stripe paints the tint and the dialog's Custom pill is checked", async ({
  page,
}) => {
  await openArticle(page, FIXTURE);

  const previewRgb = await configureSlot2AndReadPreview(page);
  await page.getByRole("button", { name: "Close reading settings" }).click();
  const blockIdx = await findFirstBlockWithText(page, 24);
  await visibleBlock(page, blockIdx).dispatchEvent("pointerdown");
  await selectRangeInBlock(page, blockIdx, 0, 12);
  await visibleBlock(page, blockIdx).dispatchEvent("pointerup");
  const toolbar = page.getByRole("toolbar", { name: "Highlight actions" });
  await expect(toolbar.getByRole("button", { name: "Undo" })).toBeVisible();
  // The default slot created — apply the custom slot 2 from the saved state
  // (the panel-free apply path) so the record carries the snapshot.
  await toolbar.getByRole("button", { name: "Slot 2: Yellow" }).click();
  await expect
    .poll(async () => (await readHighlightRows(page))[0]?.customColor)
    .toBe(CHOSEN);

  // The review panel: the row's stripe paints the SAME derived tint (the
  // one-seam discipline across surfaces)…
  await page.goto(`${BASE}/#/highlights`);
  const stripe = page.locator("li.review-item").first();
  await expect(stripe).toBeVisible();
  await expect(stripe).toHaveCSS("border-inline-start-color", previewRgb);

  // …and the color dialog names the state: Custom checked, named pills not.
  await stripe.getByRole("button", { name: /Change color, currently Custom/ }).click();
  const dialog = page.locator("dialog.review-color-dialog");
  await expect(dialog).toBeVisible();
  const customRadio = dialog.getByRole("radio", { name: "Custom" });
  await expect(customRadio).toBeChecked();
  await expect(dialog.getByRole("radio", { name: "Green" })).not.toBeChecked();
});
