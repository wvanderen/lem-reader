// tests/e2e/annotations/toolbar-tab-path.spec.ts
// Plan 13-11 (G6 — ACPT-05 Flow C2/C3 gap closure): the Tab-walk spec that
// did not exist — the automation gap that hid the G6 defect. The ACPT-05
// NVDA+Firefox run failed Flow C ("can't get to that selection toolbar")
// because Gecko — and WebKit — collapse the document text selection
// SYNCHRONOUSLY whenever DOM focus moves (verified inside the focus() call
// itself), and the toolbar lifecycle (ArticleView's selectionchange
// listener, collapsed branch) unmounted the toolbar before focus could
// arrive. Diagnosis + 3-engine experiments:
// .planning/debug/flowc-selection-toolbar-nvda.md.
//
// CONTRACT LOCKED (ACCEPTANCE-PROTOCOL Flow C2 + C3, BOTH reading modes):
//   1. After a text selection exists in the reader, ONE Tab press from the
//      reading context moves focus onto the toolbar's "Highlight" button —
//      in chromium, firefox, AND webkit. (Pre-fix, a raw Tab walked past
//      every article focusable — the toolbar sits near the END of DOM
//      order; chromium needed Tab #10 — and in firefox/webkit the FIRST
//      Tab collapsed the selection and unmounted the toolbar.)
//   2. The toolbar SURVIVES the focus move: the focus-containment hold
//      keeps it mounted while it contains document.activeElement (the
//      Gecko/WebKit collapse regression assertion — pre-fix the toolbar
//      unmounted here, dumping focus back to body one frame later).
//   3. Enter on the focused "Highlight" button creates
//      mark.highlight[data-highlight-id] + the "Highlight saved."
//      role=status announcement, then dismisses the toolbar.
//   4. Tabbing PAST the toolbar's last button dismisses it (focus-exit
//      containment release — no wedged toolbar).
//
// Selections are made PROGRAMMATICALLY (selectRangeInBlock): the collapse
// is focus-driven, not selection-origin-driven, so programmatic selections
// reproduce it exactly (validated by the debug session's tabwalk
// experiments). REAL Tab presses are the point of this spec — never
// selectViaKeyboard here (real-arrow selection from a focused block is
// engine-divergent; see keyboard-shortcuts.spec.ts's header).
// G7 (Plan 13-12) refined what the real Tab here models: it is the
// keydown-reaches-page condition (sighted keyboard or NVDA focus mode) —
// NVDA browse mode delivers NO Tab keydown (pinned by the sibling
// toolbar-keydownless-focus.spec.ts).
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  selectRangeInBlock,
  findFirstBlockWithText,
  announcementRegion,
  switchMode,
} from "./_fixtures";

const FIXTURE = FIXTURES[0]!; // essay-long-form

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

/**
 * The Flow C2 + C3 sequence: with a live selection + mounted toolbar, one
 * REAL Tab lands focus on the "Highlight" button AND the toolbar survives
 * the focus move; Enter then creates the highlight, announces it, and
 * dismisses the toolbar. Shared by the paginated + scrolling mode tests
 * (the G6 constraint covers BOTH reading modes).
 */
async function assertTabReachAndEnterActivate(page: Page): Promise<void> {
  const toolbar = page.locator(".selection-toolbar");
  await expect(toolbar).toBeVisible();
  await expect(
    page.getByRole("toolbar", { name: "Highlight actions" }),
  ).toBeVisible();
  const highlightBtn = toolbar.getByRole("button", {
    name: "Highlight",
    exact: true,
  });
  // REAL Tab — models the condition where a keydown actually reaches the
  // page: the sighted keyboard, or NVDA focus mode (NVDA+Space), which
  // passes keys through. NVDA browse mode consumes Tab as its own gesture
  // and moves focus itself with zero page keydowns — that keydown-less
  // boundary is pinned by the sibling toolbar-keydownless-focus.spec.ts
  // (G7; see .planning/debug/g7-nvda-tab-bypass-selection-toolbar.md).
  await page.keyboard.press("Tab");
  // Let the rAF-throttled selectionchange listener settle (the Gecko/WebKit
  // collapse fires inside focus(); the containment decision happens on the
  // next animation frame).
  await page.waitForTimeout(150);
  // ONE atomic evaluate against the button locator (firefox can drop/move
  // state across protocol roundtrips between separate evaluate calls):
  // focus landed on the Highlight button AND the toolbar is still connected
  // to the DOM — the Gecko/WebKit collapse regression assertion.
  const state = await highlightBtn.evaluate((el) => ({
    isFocus: document.activeElement === el,
    connected:
      el.closest(".selection-toolbar")?.isConnected === true,
  }));
  expect(
    state.isFocus,
    "one Tab lands focus on the toolbar's Highlight button",
  ).toBe(true);
  expect(
    state.connected,
    "toolbar survives the focus move (Gecko/WebKit collapse regression)",
  ).toBe(true);
  // Flow C3: Enter on the focused button creates the highlight + announces
  // via the existing role=status region + dismisses the toolbar. In
  // firefox/webkit the selection collapsed inside focus(); the saved-range
  // restore re-enters the unchanged creation path.
  await page.keyboard.press("Enter");
  await expect(
    page.locator("mark.highlight[data-highlight-id]").first(),
  ).toBeVisible();
  await expect(announcementRegion(page)).toContainText(/Highlight saved/i);
  await expect(page.locator(".selection-toolbar")).toHaveCount(0);
}

test.describe("G6 toolbar Tab path (Flow C2/C3 — Plan 13-11)", () => {
  test("Tab reaches the toolbar and Enter creates a highlight (paginated mode)", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE); // paginated is the default mode
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    const ok = await selectRangeInBlock(page, blockIdx, 0, 18);
    expect(ok).toBeTruthy();
    await assertTabReachAndEnterActivate(page);
  });

  test("Tab reaches the toolbar and Enter creates a highlight (scrolling mode)", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    // Flip to scrolling via the M shortcut (switchMode asserts the toggle
    // committed), then re-find a visible block on the new surface.
    await switchMode(page);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    const ok = await selectRangeInBlock(page, blockIdx, 0, 18);
    expect(ok).toBeTruthy();
    await assertTabReachAndEnterActivate(page);
  });

  test("Tabbing past the toolbar dismisses it (focus-exit containment release)", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE);
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    const ok = await selectRangeInBlock(page, blockIdx, 0, 18);
    expect(ok).toBeTruthy();
    await expect(page.locator(".selection-toolbar")).toBeVisible();
    // Tab #1: routed onto the first button ("Highlight").
    await page.keyboard.press("Tab");
    // Tab #2 + #3: "Highlight" → "Highlight + note" → OUT of the toolbar.
    // The last move fires the toolbar's focusout with the incoming focus
    // target outside the root → the focus-exit dismissal unmounts it.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    // The dismissal is React state → settle one frame before asserting.
    await page.waitForTimeout(150);
    await expect(page.locator(".selection-toolbar")).toHaveCount(0);
    const activeInsideToolbar = await page.evaluate(() => {
      const active = document.activeElement;
      return (
        active instanceof Element &&
        active.closest(".selection-toolbar") !== null
      );
    });
    expect(
      activeInsideToolbar,
      "focus escaped the toolbar (containment released — no wedged toolbar)",
    ).toBe(false);
  });
});
