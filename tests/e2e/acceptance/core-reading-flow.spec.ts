// tests/e2e/acceptance/core-reading-flow.spec.ts
// ACPT-01 — consolidated end-to-end core-reading-flow acceptance spec (D6-13).
// A SIBLING of tests/e2e/open-every-fixture.spec.ts (which stays the DOC-01
// mount smoke). Iterates the 6-fixture corpus × 3 engines at ONE representative
// typography (D-07 default serif/18/64/comfortable — RESEARCH Open Question 2;
// typography-stress is PAGE-03's job, NOT this spec's), asserting the COMPLETE
// flow as ONE acceptance contract per fixture × engine:
//
//   OPEN → READ THROUGH → SWITCH MODE → RESTORE → CREATE + NAVIGATE HIGHLIGHT
//
// Reuses the existing annotations/pagination harness wholesale
// (openArticle/switchMode/selectRangeInBlock/findFirstBlockWithText/modeToggle/
// drawerTrigger/announcementRegion/wipeDatabase + FIXTURES) and the
// __lemPagination DEV hook (already awaited inside openArticle). Does NOT
// re-derive selectors or duplicate per-feature isolation logic (Pitfall 6).
// The per-feature PAGE-01/ANNO-01/STATE-01 specs stay authoritative for
// isolation; this spec is the durable "reader completes the whole loop"
// acceptance lens that catches cross-feature regressions the per-feature
// specs cannot.
//
// Per the plan's threat_model T-06-03, iterating all 6 fixtures re-verifies
// the existing V5 (Zod-at-boundary) contract over the full corpus — any
// malformed fixture would surface as a flow failure here.
import { test, expect } from "@playwright/test";
import {
  FIXTURES,
  wipeDatabase,
  openArticle,
  switchMode,
  selectRangeInBlock,
  findFirstBlockWithText,
  modeToggle,
  drawerTrigger,
  announcementRegion,
} from "../annotations/_fixtures";

/**
 * Wipe IndexedDB + stub remote images so each acceptance cell starts from a
 * deterministic first-run state. Mirrors the annotations/pagination/measurement
 * harness discipline (Plan 04-02 corpus-as-single-source-of-truth precedent).
 */
test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

/** Shape of the DEV-only window.__lemPagination debug hook (useMeasurement). */
interface PaginationDev {
  currentPageIdx: number;
  pagesLength: number;
  status: string;
}

async function paginationDev(
  page: import("@playwright/test").Page,
): Promise<PaginationDev> {
  return page.evaluate(
    () =>
      (window as unknown as Record<string, unknown>).__lemPagination as PaginationDev,
  );
}

/**
 * The VISIBLE reading surface block selector. Excludes the always-mounted
 * aria-hidden measurement clone (Plan 04-08) which is user-select:none +
 * not keyboard-reachable (mirrors visibleBlock in _fixtures.ts).
 */
const VISIBLE_BLOCKS =
  '[data-block-index]:not(.article-body-measurement [data-block-index])';

test.describe("ACPT-01 core reading flow (06-02)", () => {
  // Iterate all 6 FIXTURES from fixtures-matrix.ts (D3-09 corpus). ONE
  // representative typography — the playwright.config default viewport × the
  // app's D-07 default serif/18/64/comfortable tokens. NO CORPUS_MATRIX
  // iteration (typography-stress is already PAGE-03's job per RESEARCH Open
  // Question 2). 6 fixtures × 3 engines = 18 acceptance cells.
  for (const fixture of FIXTURES) {
    test(`${fixture}: open → read → switch → restore → create + navigate highlight`, async ({
      page,
    }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(String(err)));

      // ── (1) OPEN ──────────────────────────────────────────────────────
      // openArticle navigates the hash route, waits for h1 visible + a
      // selectable block + the __lemPagination DEV hook + 600ms font settle
      // (mirrors mode-switch-anchor.spec.ts waitForPagination).
      await openArticle(page, fixture);

      // ── (2) READ THROUGH ──────────────────────────────────────────────
      // Article + every block present on the visible surface — no content
      // loss (D6-13 "without content loss"). The :not() filter excludes the
      // always-mounted aria-hidden measurement clone (Plan 04-08) which is
      // user-select:none + not keyboard-reachable.
      await expect(page.getByRole("article")).toBeVisible();
      const visibleBlocks = page.locator(VISIBLE_BLOCKS);
      const blocksAtOpen = await visibleBlocks.count();
      expect(blocksAtOpen, `${fixture}: at least one block rendered`).toBeGreaterThan(0);

      // Advance one page via the chevron (D4-07 turn controls; reuses the
      // existing commitTurn path — does NOT re-prove PAGE-02 in isolation).
      // Skip if the fixture fits on a single page at this viewport/typography
      // — the reader sees the whole content on one page, which IS the
      // complete read-through.
      const devAtOpen = await paginationDev(page);
      expect(devAtOpen.status, `${fixture}: engine status ok`).toBe("ok");
      expect(devAtOpen.pagesLength, `${fixture}: pages committed`).toBeGreaterThan(0);
      if (devAtOpen.pagesLength > 1) {
        await page.getByRole("button", { name: "Next page" }).click();
        await page.waitForTimeout(300);
        const devAfterTurn = await paginationDev(page);
        expect(
          devAfterTurn.currentPageIdx,
          `${fixture}: page indicator advanced after Next page`,
        ).toBeGreaterThan(devAtOpen.currentPageIdx);
      }

      // ── (3) SWITCH MODE ───────────────────────────────────────────────
      // M shortcut (D4-06 keyboard bundle) via the reusable switchMode
      // helper; the mode-toggle aria-label flips to "Reading mode:
      // scrolling" (PAGE-01 round-trip). Assert article + blocks survive
      // the swap (D4-10 anchor — same logical passage; no content loss
      // across the mode boundary).
      await switchMode(page);
      await expect(modeToggle(page)).toHaveAttribute(
        "aria-label",
        "Reading mode: scrolling",
      );
      await expect(page.getByRole("article")).toBeVisible();
      const blocksAfterSwitch = await visibleBlocks.count();
      expect(
        blocksAfterSwitch,
        `${fixture}: blocks present in scrolling mode`,
      ).toBeGreaterThan(0);

      // ── (4) RESTORE LOCATION ──────────────────────────────────────────
      // Reload; the article re-mounts without content loss (STATE-01
      // substrate). The pixel-exact scroll restoration is asserted by
      // persistence.spec.ts; this spec asserts the reader's continuity —
      // the article + its blocks are present after reload (the acceptance
      // bar; per-feature specs own the isolation detail).
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      // SettingsProvider hydration + the restore effect (rAF + async
      // loadLocation) need a brief settle (mirrors persistence.spec.ts).
      await page.waitForTimeout(500);
      await expect(page.getByRole("article")).toBeVisible();
      const blocksAfterReload = await visibleBlocks.count();
      expect(
        blocksAfterReload,
        `${fixture}: blocks present after reload (no content loss)`,
      ).toBeGreaterThan(0);

      // ── (5) CREATE + NAVIGATE HIGHLIGHT ───────────────────────────────
      // CREATE (ANNO-01): findFirstBlockWithText → selectRangeInBlock →
      // .selection-toolbar → Highlight button → mark.highlight[data-
      // highlight-id] + announcementRegion /Highlight saved/i. Reuses the
      // verbatim capture-highlight.spec.ts path; the harness is mode-
      // agnostic so it works whether reload landed in paginated or
      // scrolling mode.
      const blockIdx = await findFirstBlockWithText(page, 24);
      expect(blockIdx, `${fixture}: must have a selectable block`).not.toBe(-1);
      const ok = await selectRangeInBlock(page, blockIdx, 0, 18);
      expect(
        ok,
        `${fixture}: selection must be set on block ${blockIdx}`,
      ).toBeTruthy();
      const toolbar = page.locator(".selection-toolbar");
      await expect(toolbar).toBeVisible();
      await toolbar
        .getByRole("button", { name: "Highlight", exact: true })
        .click();
      const mark = page.locator("mark.highlight");
      await expect(mark.first()).toBeVisible();
      await expect(mark.first()).toHaveAttribute("data-highlight-id", /.+/);
      const hlId = await mark.first().getAttribute("data-highlight-id");
      expect(hlId, `${fixture}: highlight id captured`).toBeTruthy();
      await expect(announcementRegion(page)).toContainText(/Highlight saved/i);

      // NAVIGATE (ANNO-04 / D5-11): drawerTrigger → drawer entry → jump →
      // focus lands on the mark. Move off the mark first (scroll to top is
      // a no-op in paginated mode; in scrolling it puts the mark out of
      // view so navigate-back actually navigates). Reuses the verbatim
      // navigate-back.spec.ts assertion shape (rAF-deferred focus retry).
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);
      await drawerTrigger(page).click();
      const entry = page.locator("dialog.annotations-drawer .drawer-list li").first();
      await expect(entry).toBeVisible();
      await entry.locator(".drawer-entry").click();
      await expect(page.locator("dialog.annotations-drawer")).toBeHidden();
      const target = page.locator(
        `mark.highlight[data-highlight-id="${hlId}"]`,
      );
      await expect(target.first()).toBeVisible();
      // Focus is rAF-deferred after the page-turn/scrollIntoView commit
      // (firefox can race a fixed wait — mirrors navigate-back.spec.ts).
      await expect(async () => {
        const focusedId = await page.evaluate(() => {
          const el = document.activeElement;
          return el?.getAttribute?.("data-highlight-id") ?? null;
        });
        expect(
          focusedId,
          `${fixture}: navigate-back focuses the <mark>`,
        ).toBe(hlId);
      }).toPass({ timeout: 3000 });

      // V7 — measurement/annotation never throws to the reader across the
      // whole flow (mirrors stale-drop.spec.ts pageerror guard).
      expect(
        pageErrors,
        `${fixture}: no uncaught errors during the flow`,
      ).toEqual([]);
    });
  }
});
