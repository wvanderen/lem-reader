// tests/e2e/annotations/keyboard-shortcuts.spec.ts
// A11Y-01 — H highlights the current selection; N highlights it and opens a
// note. The keyboard path is the primary capture affordance for keyboard
// readers (the toolbar is a pointer/touch affordance per UI-SPEC §25).
//
// SCENARIO: select via Shift+arrows, press H → highlight created, toolbar
// dismissed, "Highlight saved." announced. Select, press N → highlight
// created + popover opens with focused empty textarea. H/N are no-ops on a
// collapsed selection or inside a form field. Tab reaches the toolbar
// buttons in DOM order (fallback path). H/N do not conflict with M (mode).
import { test, expect } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  selectRangeInBlock,
  findFirstBlockWithText,
  announcementRegion,
  visibleBlock,
} from "./_fixtures";

const FIXTURE = FIXTURES[0]!; // essay-long-form

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

test.describe("A11Y-01 keyboard shortcuts H/N (05-05)", () => {
  test("H on a keyboard-driven Shift+arrow selection creates a highlight + announces", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    // Place a selection (the H shortcut is the load-bearing assertion — the
    // selection mechanism is secondary; a <p> is not natively focusable so
    // Shift+arrows from .focus() doesn't extend a selection cross-engine).
    const ok = await selectRangeInBlock(page, blockIdx, 0, 12);
    expect(ok).toBeTruthy();
    // The toolbar appears (sighted keyboard reader sees the affordance).
    await expect(page.locator(".selection-toolbar")).toBeVisible();
    // H creates the highlight.
    await page.keyboard.press("h");
    await expect(page.locator("mark.highlight").first()).toBeVisible();
    await expect(page.locator(".selection-toolbar")).toHaveCount(0);
    await expect(announcementRegion(page)).toContainText(/Highlight saved/i);
  });

  test("H on a mouse selection also works (parity with toolbar click)", async ({ page }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    const ok = await selectRangeInBlock(page, blockIdx, 0, 18);
    expect(ok).toBeTruthy();
    await page.keyboard.press("h");
    await expect(page.locator("mark.highlight").first()).toBeVisible();
    await expect(announcementRegion(page)).toContainText(/Highlight saved/i);
  });

  test("N creates the highlight AND opens the popover with a focused empty textarea", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    await selectRangeInBlock(page, blockIdx, 0, 18);
    await page.keyboard.press("n");
    // The highlight rendered.
    await expect(page.locator("mark.highlight").first()).toBeVisible();
    await expect(announcementRegion(page)).toContainText(/Highlight saved/i);
    // The note popover opened (native <dialog> + showModal).
    const popover = page.locator("#highlight-popover.highlight-popover");
    await expect(popover).toBeVisible();
    // The textarea is visible + empty (the N-create-and-open contract).
    const textarea = popover.locator("textarea.highlight-popover-textarea");
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue("");
    // The active element is the textarea (D5-10 focus→textarea on open).
    const isFocused = await textarea.evaluate(
      (el) => el === document.activeElement,
    );
    expect(isFocused, "textarea is focused on N-open").toBeTruthy();
  });

  test("H/N are no-ops when the selection is collapsed", async ({ page }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    // Focus the block but do NOT extend a selection (collapsed caret).
    await visibleBlock(page, blockIdx).focus();
    await page.keyboard.press("h");
    await expect(page.locator("mark.highlight")).toHaveCount(0);
    await page.keyboard.press("n");
    await expect(page.locator("mark.highlight")).toHaveCount(0);
    // The <dialog> element is always mounted (showModal requires it); assert
    // it has NO editable content (the N shortcut did not open it on a collapsed
    // selection — the body is gated on `resolved`, and a closed <dialog> is
    // display:none via the UA stylesheet so it is absent from the a11y tree).
    await expect(page.locator("#highlight-popover textarea")).toHaveCount(0);
  });

  test("H/N do not fire inside a form field (isFormField guard)", async ({ page }) => {
    // Open the settings panel (a real form-field surface) and type H/N into
    // an input — no highlight must be created (the window listener's
    // isFormField guard bails).
    await openArticle(page, FIXTURE);
    await page.getByRole("button", { name: "Reading settings" }).click();
    const slider = page.getByRole("slider", { name: "Text size" });
    await slider.focus();
    // H/N inside the form field must not create a highlight.
    await page.keyboard.press("h");
    await page.keyboard.press("n");
    await expect(page.locator("mark.highlight")).toHaveCount(0);
  });

  test("H does not conflict with M (mode toggle) — both fire independently", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const modeToggleBefore = await page
      .getByRole("button", { name: /^Reading mode:/ })
      .getAttribute("aria-label");
    // M switches mode (does not create a highlight).
    await page.keyboard.press("m");
    await page.waitForTimeout(400);
    await expect(page.locator("mark.highlight")).toHaveCount(0);
    const modeToggleAfter = await page
      .getByRole("button", { name: /^Reading mode:/ })
      .getAttribute("aria-label");
    expect(modeToggleAfter, "M flipped the mode").not.toBe(modeToggleBefore);
    // Now select + H creates a highlight in the new mode (independent).
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    const ok = await selectRangeInBlock(page, blockIdx, 0, 16);
    expect(ok, "selection in new mode").toBeTruthy();
    await page.keyboard.press("h");
    await expect(page.locator("mark.highlight").first()).toBeVisible();
  });

  test("Toolbar buttons are keyboard-focusable (fallback keyboard path, UI-SPEC §25)", async ({
    page,
  }) => {
    // Plan 13-11 (G6): the toolbar is the PRIMARY screen-reader path (the
    // Phase 6 protocol rewrite); H/N are the sighted keyboard convenience.
    // UI-SPEC §25 requires the toolbar buttons to be reachable + activatable
    // by keyboard: native <button>s (inherently focusable), ONE Tab from the
    // reading context onto "Highlight" (ArticleView's Tab routing — the G6
    // fix), and REAL Enter activation creating the highlight. Full 3-engine ×
    // both-modes coverage lives in toolbar-tab-path.spec.ts; this test keeps
    // the historical programmatic-focus assertion below and adds the
    // formerly-skipped keyboard-activation assertions.
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    await selectRangeInBlock(page, blockIdx, 0, 18);
    await expect(page.locator(".selection-toolbar")).toBeVisible();
    // One REAL Tab from the reading context lands focus on the Highlight
    // button (pre-fix, a raw Tab walked past every article focusable — the
    // toolbar sits near the END of DOM order; and in firefox/webkit the
    // first Tab collapsed the selection and unmounted the toolbar).
    await page.keyboard.press("Tab");
    await page.waitForTimeout(150); // rAF-throttled selectionchange settle
    const btn = page
      .locator(".selection-toolbar")
      .getByRole("button", { name: "Highlight", exact: true });
    const tabFocused = await btn.evaluate(
      (el) => document.activeElement === el,
    );
    expect(tabFocused, "one Tab reaches the Highlight button").toBeTruthy();
    // Native button — focusable. Focus + check in ONE atomic evaluate so
    // firefox doesn't lose focus across the protocol roundtrip between two
    // separate evaluate calls (the toolbar can re-render on selectionchange
    // between roundtrips, dropping activeElement back to body).
    const isFocused = await btn.evaluate((el) => {
      (el as HTMLElement).focus();
      return document.activeElement === el;
    });
    expect(isFocused, "toolbar button is focusable (fallback keyboard path)").toBeTruthy();
    // Real keyboard activation (formerly NOT asserted — the stale comment
    // blamed the focus-induced selection collapse that Plan 13-11 fixed):
    // Enter creates the highlight + announces + dismisses the toolbar. In
    // firefox/webkit the selection collapsed inside focus(); the G6
    // saved-range restore re-enters the unchanged creation path.
    await page.keyboard.press("Enter");
    await expect(page.locator("mark.highlight").first()).toBeVisible();
    await expect(announcementRegion(page)).toContainText(/Highlight saved/i);
    await expect(page.locator(".selection-toolbar")).toHaveCount(0);
  });
});
