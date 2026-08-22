// tests/e2e/annotations/toolbar-mount-selection-gated.spec.ts
// Plan 13-13 (G8 — ACPT-05 Flow C gap closure, decision G8-D1): the
// selection-gated mount/announce boundary spec — the automation hole the G8
// diagnosis exposed: the "Highlight actions available." announce-on-appear
// cue, the confirmation signal ACCEPTANCE-PROTOCOL.md Flow C makes
// load-bearing at C1, was asserted by ZERO automation (repo-wide, the string
// existed only in SelectionToolbar.tsx and the protocol document).
//
// G8 PROVENANCE (.planning/debug/g8-toolbar-never-mounts-nvda.md, UAT gap
// G8): with NVDA Native Selection Mode OFF — the default on EVERY NVDA since
// the 2024.1 per-document toggle, including 2026.3's persistent-setting
// release where the setting is ALSO disabled by default — browse-mode
// Shift+arrows selects only within NVDA's virtual buffer and never touches
// the Firefox document selection ("not within the application itself...
// not visible on screen" — official NVDA User Guide §Native Selection Mode;
// NVDA source gecko_ia2.py pushes the selection to the document only under
// _nativeAppSelectionMode). The DOM never changes, so the selection-driven
// toolbar lifecycle (ArticleView selectionchange listener →
// selectionRect/captureResult → SelectionToolbar render) is unreachable BY
// CONSTRUCTION: silence is CORRECT page behavior, not a defect.
//
// CONTRACT PINNED (both sides of the G8 platform boundary, at the
// page-observable layer — the only layer automation can see; the NVDA
// virtual buffer is not emulatable in Playwright, so the buffer-only delta
// itself cannot be reproduced here):
//   1. SELECTION ⇒ MOUNT + CUE (Test 1 — the native-selection-ON condition,
//      i.e. the page-visible document selection NVDA's Native Selection Mode
//      produces): a programmatic in-block selection mounts the toolbar AND
//      the toolbar-INTERNAL polite status region announces the cue text
//      "Highlight actions available." — while ArticleView's separate CRUD
//      announcement region stays silent (region separation).
//   2. NO SELECTION ⇒ STRUCTURAL SILENCE (Test 2 — the native-selection-OFF
//      condition): with NO selection ever made, a keydown-less programmatic
//      focus to the Previous page chevron (the G7-proven browse-mode Tab
//      consequence, still possible with native selection off) plus a settle
//      window leaves the page structurally silent on EVERY engine: document
//      selection collapsed, ZERO keydowns delivered, toolbar count 0, cue
//      text absent from the DOM. This pins WHY the v1.2 protocol fix is a
//      gesture instruction and not a product change — focus moves and settle
//      time can never manufacture a selection-driven mount. A future silent
//      NVDA re-run points at the NVDA layer / protocol adherence (was Native
//      Selection Mode enabled?), NOT at another page-side diagnosis cascade.
//
// This is a boundary-PINNING spec, not TDD: decision G8-D1 ships ZERO
// production changes — BOTH tests must be GREEN on the current build
// immediately; they assert today's diagnosed behavior as the documented
// contract. If any assertion fails on the current build, the G8 diagnosis
// itself is contradicted: stop and surface as Rule 4 (do NOT weaken
// assertions to force green).
//
// CRITICAL LOCATOR FACT (Test 1): the cue's region is the visually-hidden
// <p role="status" aria-live="polite"> rendered INSIDE SelectionToolbar
// (SelectionToolbar.tsx L222-224) — do NOT use the announcementRegion
// helper for the cue; that helper targets ArticleView's separate D5-12 CRUD
// announce region ("Highlight saved." etc. on actions only).
//
// Reuses the _fixtures.ts helpers wholesale (wipeDatabase / openArticle /
// FIXTURES / findFirstBlockWithText / selectRangeInBlock /
// announcementRegion — no forked harness), exactly as
// toolbar-keydownless-focus.spec.ts does (the 13-12 discipline). FIXTURE =
// FIXTURES[0] (essay-long-form), paginated default mode, no switchMode.
// The gesture fix itself lives in ACCEPTANCE-PROTOCOL.md Flow C v1.2.
import { test, expect } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  selectRangeInBlock,
  findFirstBlockWithText,
  announcementRegion,
} from "./_fixtures";

const FIXTURE = FIXTURES[0]!; // essay-long-form — paginated default mode
// (no switchMode): the G8 report is a paginated-surface reproduction.

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

test.describe("G8 selection-gated mount/announce boundary (NVDA native selection — Plan 13-13)", () => {
  test("a page-visible selection mounts the toolbar and fires the announce cue (the native-selection-ON condition)", async ({
    page,
  }) => {
    await openArticle(page, FIXTURE); // paginated is the default mode
    const blockIdx = await findFirstBlockWithText(page, 24);
    expect(blockIdx).not.toBe(-1);

    // The page-visible condition NVDA's Native Selection Mode produces: a
    // real document selection reflected into window.getSelection(). The
    // programmatic form is the same page-observable event — ArticleView's
    // selectionchange listener has no selection-origin gate (the G8 code
    // read), so ANY non-collapsed in-article range mounts the toolbar.
    // Single-block + non-empty ⇒ captureResult.ok true ⇒ the buttons
    // variant — the only variant that announces.
    const ok = await selectRangeInBlock(page, blockIdx, 0, 18);
    expect(ok).toBeTruthy();

    // The mount: the toolbar appears with its accessible role + name.
    await expect(
      page.getByRole("toolbar", { name: "Highlight actions" }),
    ).toBeVisible();

    // THE CUE (previously asserted by zero automation): the toolbar's own
    // INTERNAL live region — role=status, aria-live=polite, rendered inside
    // the toolbar root (SelectionToolbar.tsx L222-224) — receives
    // "Highlight actions available." on the transition into the buttons
    // variant, one commit after the region mounts empty (the correct
    // pre-exist pattern). toContainText auto-retries across that commit.
    // NOT announcementRegion(page): that is ArticleView's separate D5-12
    // CRUD announce region.
    const cueRegion = page
      .getByRole("toolbar", { name: "Highlight actions" })
      .locator("[role='status']");
    await expect(cueRegion).toContainText(/Highlight actions available/i);

    // REGION SEPARATION: the CRUD announce region announces actions only
    // ("Highlight saved." / "Note saved." / …). No action occurred here, so
    // the cue text must NOT appear in it — the mount cue belongs to the
    // toolbar's region alone.
    await expect(
      announcementRegion(page),
      "the mount cue lives in the toolbar-internal region, NOT ArticleView's CRUD announce region",
    ).not.toContainText(/Highlight actions available/i);
  });

  test("no page-visible selection ⇒ structural silence (the native-selection-OFF condition)", async ({
    page,
  }) => {
    // Fresh open; a selection is NEVER created in this test. This is the
    // page-side state an NVDA browse-mode Shift+arrows selection produces
    // with Native Selection Mode OFF: NVDA speaks its buffer selection
    // while the page's document selection never changes.
    await openArticle(page, FIXTURE); // paginated is the default mode

    // Starting state via ONE evaluate: no selection exists.
    const startCollapsed = await page.evaluate(
      () => window.getSelection()?.isCollapsed ?? true,
    );
    expect(startCollapsed, "no selection exists at start").toBe(true);

    // ONE evaluate: install the window-scoped keydown counter — AFTER all
    // setup activity so it starts at 0 (capture phase on window so nothing
    // can slip past a stopped bubble chain). Mirrors the G7 spec's counter.
    await page.evaluate(() => {
      (window as unknown as { __g8Keydowns: number }).__g8Keydowns = 0;
      window.addEventListener(
        "keydown",
        () => {
          (window as unknown as { __g8Keydowns: number }).__g8Keydowns += 1;
        },
        { capture: true },
      );
    });

    // SECOND evaluate — still ZERO keyboard input: a keydown-less
    // programmatic focus of the Previous page chevron
    // (button.page-turn-previous, aria-label "Previous page"), the exact
    // keydown-less DOM-focus move NVDA browse mode produces for Tab (the
    // G7-proven consequence, still possible with native selection off).
    // NO page.keyboard call may occur anywhere in this test.
    await page.evaluate(() => {
      const chevron = document.querySelector<HTMLButtonElement>(
        "button.page-turn-previous",
      );
      chevron?.focus();
    });

    // Settle window for the rAF-throttled selectionchange machinery (and
    // any debounced toolbar machinery) — if focus moves + settle time could
    // manufacture a mount, this is where it would appear.
    await page.waitForTimeout(300);

    // ONE atomic evaluate returning the three-fact silence state (separate
    // evaluates could observe different frames of any transient activity).
    // Asserted IDENTICALLY on every engine — nothing engine-specific is
    // being asserted (no selection ever existed to collapse or keep).
    const state = await page.evaluate(() => ({
      keydowns: (window as unknown as { __g8Keydowns: number }).__g8Keydowns,
      isCollapsed: window.getSelection()?.isCollapsed ?? true,
      toolbarCount: document.querySelectorAll(".selection-toolbar").length,
    }));

    expect(
      state.keydowns,
      "the keydown-less focus move delivers ZERO keydowns to the page",
    ).toBe(0);
    expect(
      state.isCollapsed,
      "the document selection stays collapsed — focus moves never create one",
    ).toBe(true);
    expect(
      state.toolbarCount,
      "no page-visible selection ⇒ no toolbar, on every engine (silence is the documented G8 boundary, not a bug)",
    ).toBe(0);

    // And the cue text exists NOWHERE in the DOM — the announce live
    // region renders only inside a mounted toolbar.
    await expect(
      page.getByText("Highlight actions available"),
      "the mount cue is structurally absent without a page-visible selection",
    ).toHaveCount(0);
  });
});
