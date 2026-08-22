// tests/e2e/annotations/toolbar-keydownless-focus.spec.ts
// Plan 13-12 (G7 — ACPT-05 Flow C gap closure, decision G7-D1): the
// keydown-less-focus boundary spec that did not exist — the automation gap
// that hid G7's recurrence. NVDA browse mode binds Tab as its own navigation
// gesture and never delivers a Tab keydown to the page — it moves DOM focus
// itself via accessibility APIs (official NVDA user guide, Browse Mode;
// .planning/debug/g7-nvda-tab-bypass-selection-toolbar.md Phase B reproduced
// this exact DOM sequence live in firefox with ZERO keydowns delivered).
//
// CONTRACT PINNED (decision G7-D1 — browse mode is OUT of the toolbar
// reachability contract; focus mode is IN):
//   1. BROWSE-MODE BOUNDARY (Test 1): from a live programmatic selection +
//      mounted toolbar, a keydown-less programmatic focus jump to the
//      Previous page chevron (button.page-turn-previous, aria-label
//      "Previous page" — the exact control NVDA browse mode landed the
//      tester on per the G7 report) delivers ZERO keydowns to the page.
//      firefox + webkit: the selection collapses (Gecko/WebKit collapse
//      synchronously inside focus()) and the toolbar unmounts — the G7
//      observable, now a DOCUMENTED boundary (recoverable per Test 2).
//      chromium: the selection survives and the toolbar stays mounted
//      (engine-matrix completeness only; the SR acceptance pairings are
//      NVDA+Firefox and VoiceOver+Safari).
//   2. FOCUS-MODE RECOVERY (Test 2): after the keydown-less collapse, a
//      fresh selection + ONE REAL Tab (the keydown-reaches-page condition
//      NVDA focus mode produces after NVDA+Space — pinned green by
//      toolbar-tab-path.spec.ts's real-Tab tests) routes focus onto the
//      toolbar's Highlight button with activeElement starting on the
//      chevron INSIDE the article subtree, and Enter creates the mark +
//      the "Highlight saved." announcement: the documented NVDA recovery
//      journey (ACCEPTANCE-PROTOCOL.md Flow C, v1.1).
//
// This is a boundary-PINNING spec, not TDD: decision G7-D1 ships ZERO
// production changes — both tests assert TODAY's diagnosed behavior as the
// documented contract and must be green on the current build.
//
// Selections are made PROGRAMMATICALLY (selectRangeInBlock) exactly as
// toolbar-tab-path.spec.ts does — the collapse is focus-driven, not
// selection-origin-driven. Reuses the _fixtures.ts helpers wholesale
// (wipeDatabase / openArticle / FIXTURES / findFirstBlockWithText /
// selectRangeInBlock / announcementRegion — no forked harness).
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  selectRangeInBlock,
  findFirstBlockWithText,
  announcementRegion,
} from "./_fixtures";

const FIXTURE = FIXTURES[0]!; // essay-long-form — paginated default mode
// (no switchMode): the G7 report is a paginated-surface reproduction.

/**
 * The per-engine keydown-less boundary facts (the G7 diagnosis, live-verified
 * in firefox — .planning/debug/g7-nvda-tab-bypass-selection-toolbar.md
 * Phase B): Gecko/WebKit collapse the document selection synchronously
 * inside focus(), so ArticleView's selectionchange collapsed branch clears
 * the toolbar state and unmounts it (toolbar count 0); chromium keeps the
 * live selection across focus moves, so no dismissal fires and the toolbar
 * stays mounted (count 1 — engine-matrix completeness only; the SR
 * acceptance pairings are NVDA+Firefox and VoiceOver+Safari).
 */
const ENGINE_BOUNDARY: Record<
  string,
  { collapsed: boolean; toolbarCount: number }
> = {
  chromium: { collapsed: false, toolbarCount: 1 },
  firefox: { collapsed: true, toolbarCount: 0 },
  webkit: { collapsed: true, toolbarCount: 0 },
};

/**
 * The keydown-less focus jump itself: focus the Previous page chevron
 * (button.page-turn-previous, rendered by PaginatedSurface with aria-label
 * "Previous page") via a bare el.focus() — NO page.keyboard input, so ZERO
 * keydowns are delivered to the page. This is the exact DOM sequence NVDA
 * browse mode produces for Tab (it moves focus via accessibility APIs
 * without synthesizing a page-visible keydown).
 */
async function keydownlessFocusChevron(page: Page): Promise<void> {
  await page.evaluate(() => {
    const chevron = document.querySelector<HTMLButtonElement>(
      "button.page-turn-previous",
    );
    chevron?.focus();
  });
}

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

test.describe("G7 keydown-less focus boundary (NVDA browse mode — Plan 13-12)", () => {
  test("browse-mode emulation pins the per-engine keydown-less boundary", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE); // paginated is the default mode
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    const ok = await selectRangeInBlock(page, blockIdx, 0, 18);
    expect(ok).toBeTruthy();
    await expect(page.locator(".selection-toolbar")).toBeVisible();
    await expect(
      page.getByRole("toolbar", { name: "Highlight actions" }),
    ).toBeVisible();

    // ONE evaluate: install the window-scoped keydown counter — AFTER all
    // setup activity so it starts at 0 (capture phase on window so nothing
    // can slip past a stopped bubble chain).
    await page.evaluate(() => {
      (window as unknown as { __g7Keydowns: number }).__g7Keydowns = 0;
      window.addEventListener(
        "keydown",
        () => {
          (window as unknown as { __g7Keydowns: number }).__g7Keydowns += 1;
        },
        { capture: true },
      );
    });

    // SECOND evaluate — still ZERO keyboard input: the keydown-less chevron
    // focus (the browse-mode emulation). NO page.keyboard call may occur
    // between the counter install and the final assertion — that
    // keydown-less-ness IS the G7 signature.
    await keydownlessFocusChevron(page);

    // Let the rAF-throttled selectionchange listener + the React unmount
    // settle (mirrors the debug session's 300ms post-focus settle).
    await page.waitForTimeout(300);

    // ONE atomic evaluate returning the four-fact boundary state (separate
    // evaluates could observe different frames of the collapse/unmount).
    const state = await page.evaluate(() => {
      const chevron = document.querySelector("button.page-turn-previous");
      const active = document.activeElement;
      return {
        keydowns: (window as unknown as { __g7Keydowns: number })
          .__g7Keydowns,
        focusOnChevron: chevron !== null && active === chevron,
        collapsed: window.getSelection()?.isCollapsed ?? true,
        toolbarCount: document.querySelectorAll(".selection-toolbar").length,
      };
    });

    expect(
      state.keydowns,
      "the keydown-less focus jump delivers ZERO keydowns to the page",
    ).toBe(0);
    expect(
      state.focusOnChevron,
      "focus sits on the Previous page chevron (the G7 report's landing spot)",
    ).toBe(true);

    const boundary = ENGINE_BOUNDARY[test.info().project.name]!;
    expect(
      state.collapsed,
      `engine boundary — ${test.info().project.name}: selection collapse`,
    ).toBe(boundary.collapsed);
    expect(
      state.toolbarCount,
      `engine boundary — ${test.info().project.name}: toolbar count ` +
        `(the G7 observable on Gecko/WebKit — the documented browse-mode ` +
        `boundary per G7-D1; chromium is engine-matrix completeness only)`,
    ).toBe(boundary.toolbarCount);
  });

  test("recovery: the documented focus-mode path works after a browse-mode collapse", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE); // paginated is the default mode
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);
    const ok = await selectRangeInBlock(page, blockIdx, 0, 18);
    expect(ok).toBeTruthy();
    await expect(page.locator(".selection-toolbar")).toBeVisible();

    // The browse-mode mistake: the identical keydown-less chevron focus
    // (browse mode consumes the Tab, moves focus itself — zero keydowns).
    await keydownlessFocusChevron(page);
    await page.waitForTimeout(300);

    // The G7 observable as it binds per engine (Test 1's boundary facts):
    // firefox/webkit — the selection collapsed and the toolbar is UNMOUNTED
    // (count 0); chromium — the selection is alive and the toolbar is still
    // mounted (count 1). The recovery journey below has NO engine split.
    const collapsed = await page.evaluate(() => ({
      collapsed: window.getSelection()?.isCollapsed ?? true,
      toolbarCount: document.querySelectorAll(".selection-toolbar").length,
    }));
    const boundary = ENGINE_BOUNDARY[test.info().project.name]!;
    expect(
      collapsed.collapsed,
      "the browse-mode mistake reproduced (engine-keyed collapse fact)",
    ).toBe(boundary.collapsed);
    expect(
      collapsed.toolbarCount,
      "the browse-mode mistake reproduced (engine-keyed toolbar fact)",
    ).toBe(boundary.toolbarCount);

    // C1 again: a fresh selection re-mounts the toolbar. Focus STAYS on the
    // chevron — selection changes never move focus — so activeElement
    // remains the chevron INSIDE the article subtree, and the 13-11 routing
    // guard's articleNode.contains clause is the engaging branch (the real
    // NVDA recovery pre-state: browse mode parked focus on the chevron,
    // NVDA+Space switched the mode, the reader re-selects).
    const ok2 = await selectRangeInBlock(page, blockIdx, 0, 18);
    expect(ok2).toBeTruthy();
    await expect(page.locator(".selection-toolbar")).toBeVisible();

    // ONE REAL Tab — models NVDA focus mode after NVDA+Space (the
    // keydown-reaches-page condition). toolbar-tab-path.spec.ts pins this
    // same path with activeElement starting on body; the chevron pre-state
    // is the only delta.
    await page.keyboard.press("Tab");
    await page.waitForTimeout(150);

    // The SAME atomic evaluate toolbar-tab-path.spec.ts uses (firefox can
    // drop/move state across protocol roundtrips between separate
    // evaluates): focus landed on the Highlight button AND the toolbar is
    // still connected to the DOM — the containment-hold survival across
    // the Gecko/WebKit collapse the focus() move triggers.
    const highlightBtn = page
      .locator(".selection-toolbar")
      .getByRole("button", { name: "Highlight", exact: true });
    const focusState = await highlightBtn.evaluate((el) => ({
      isFocus: document.activeElement === el,
      connected: el.closest(".selection-toolbar")?.isConnected === true,
    }));
    expect(
      focusState.isFocus,
      "one real Tab from the chevron lands focus on the toolbar's Highlight button",
    ).toBe(true);
    expect(
      focusState.connected,
      "toolbar survives the focus move (containment hold)",
    ).toBe(true);

    // Flow C3: Enter on the focused button creates the highlight + announces
    // via the role=status region + dismisses the toolbar.
    await page.keyboard.press("Enter");
    await expect(
      page.locator("mark.highlight[data-highlight-id]").first(),
    ).toBeVisible();
    await expect(announcementRegion(page)).toContainText(/Highlight saved/i);
    await expect(page.locator(".selection-toolbar")).toHaveCount(0);
  });
});
