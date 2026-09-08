// tests/e2e/scrim-dismiss.spec.ts
// Quick task 260908-o0w — real-browser backdrop-scrim dismissal for the two
// representative close-path semantics (SettingsPanel → onClose, AddDialog →
// onCancel). Browsers do NOT auto-close a native modal <dialog> on
// ::backdrop clicks: each dialog's click listener treats a click whose
// target IS the dialog element itself as the scrim (padding: 0 + the
// *-inner wrapper mean the dialog border box == the visible card) and
// routes it through the same close prop its Cancel/Esc path uses. jsdom
// cannot hit-test ::backdrop, so this spec is the geometry truth; the
// in-flight gate (D16-10) is proven by the AddDialog component tests.
import { test, expect } from "@playwright/test";
import { wipeDatabase } from "./annotations/_fixtures";

const BASE = "http://localhost:5173";

const FIRST_FIXTURE = "essay-long-form";

test.describe("Backdrop scrim dismissal (260908-o0w)", () => {
  test("clicking the dimmed backdrop closes the settings panel (onClose path)", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIRST_FIXTURE}`);

    // Open the panel via its gear trigger (the panel-keyboard locator).
    await page.getByRole("button", { name: "Reading settings" }).click();
    const dlg = page.locator("dialog.settings-panel");
    await expect(dlg).toBeVisible();

    // The settings panel is an inline-end sheet, so the top-left viewport
    // corner is outside it. Assert the chosen point is outside the dialog's
    // box BEFORE clicking so the test is honest about what it hits — a
    // corner that drifted inside would click visible content, not the
    // ::backdrop.
    const box = await dlg.boundingBox();
    expect(box, "settings panel box measurable before scrim click").toBeTruthy();
    const point = { x: 2, y: 2 };
    const outside =
      point.x < box!.x ||
      point.x > box!.x + box!.width ||
      point.y < box!.y ||
      point.y > box!.y + box!.height;
    expect(
      outside,
      "scrim click point must be outside the settings panel box",
    ).toBe(true);

    // The real mouse click on the dimmed ::backdrop dismisses the dialog
    // through the open-prop mirror (parent flips open → dlg.close()).
    await page.mouse.click(point.x, point.y);
    await expect(dlg).toBeHidden();
  });

  test("clicking the dimmed backdrop closes the Add dialog (onCancel path)", async ({
    page,
  }) => {
    await wipeDatabase(page);
    await page.goto(`${BASE}/#/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();

    // Open the Add dialog via the Library header trigger (the established
    // panel-keyboard locator, reused verbatim).
    await page.getByRole("button", { name: "Add to Library" }).click();
    const dlg = page.locator("dialog.add-dialog");
    await expect(dlg).toBeVisible();

    // The Add dialog is centered, so any viewport corner is outside it —
    // same assert-outside-first discipline as the settings panel cell.
    const box = await dlg.boundingBox();
    expect(box, "add dialog box measurable before scrim click").toBeTruthy();
    const point = { x: 2, y: 2 };
    const outside =
      point.x < box!.x ||
      point.x > box!.x + box!.width ||
      point.y < box!.y ||
      point.y > box!.y + box!.height;
    expect(
      outside,
      "scrim click point must be outside the add dialog box",
    ).toBe(true);

    await page.mouse.click(point.x, point.y);
    await expect(dlg).toBeHidden();
  });
});
