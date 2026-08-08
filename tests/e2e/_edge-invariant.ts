// tests/e2e/_edge-invariant.ts
// Phase 6 Plan 06-01 — the D6-09 shared edge-condition invariant helper.
//
// D6-09 (06-CONTEXT.md) locks ONE invariant applied to EVERY edge condition
// (zoom, reflow, forced colors, reduced motion, touch, font-failure):
//   (a) every fixture's full content is reachable via keyboard in BOTH reading
//       modes;
//   (b) no required function is unreachable (read, mode-switch, settings,
//       annotation shortcuts);
//   (c) no layout overflow clips or overlaps content.
//
// This helper encodes that invariant as a single exported async function that
// every ACPT-03 edge spec calls uniformly — the NEW gap specs in Plan 06-01
// (high-zoom.spec.ts + font-failure.spec.ts) and the AUDITED existing specs
// in Plan 06-05 (forced-colors / reduced-motion / reflow / touch-targets).
//
// Module shape mirrors tests/e2e/annotations/_fixtures.ts (the established
// cross-spec helper-module pattern):
//   - Leading-underscore filename + NO `.spec`/`.test` suffix → Playwright's
//     testDir glob (testMatch `**/*.@(spec|test).?(c|m)[jt]s?(x)`) does NOT
//     pick it up as a spec. Belt-and-suspenders alongside _fixtures.ts.
//   - Type-only import for Page (no value-cycle into the helper).
//   - Re-exports the reusable harness selectors/functions so every edge spec
//     imports from ONE place.
//
// (c) overflow assertion lifted VERBATIM from reflow.spec.ts L24-49 (the WCAG
// 1.4.10 contract: body + article-body scrollWidth ≤ clientWidth + 1px sub-
// pixel tolerance). reflow.spec.ts is the ORIGIN of the (c) clause; Plan 06-05
// points reflow.spec.ts at this helper so it consumes (a)/(b) too.
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

// Re-export the reusable harness so every edge spec imports from ONE place
// (mirrors annotations/_fixtures.ts re-exporting FIXTURES). These are the
// selectors + helpers the edge specs share: openArticle (h1 sentinel + DEV-
// hook settle), switchMode (M shortcut), modeToggle/drawerTrigger (accessible-
// name selectors), announcementRegion (A11Y-08 status), wipeDatabase
// (deterministic first-run state), FIXTURES (the 6-fixture corpus).
export {
  FIXTURES,
  BASE,
  PIXEL_SVG,
  wipeDatabase,
  openArticle,
  switchMode,
  modeToggle,
  drawerTrigger,
  announcementRegion,
  visibleReadingSurface,
  visibleBlock,
} from "./annotations/_fixtures";

/** Arguments to {@link assertEdgeInvariant}. */
export interface EdgeInvariantOptions {
  /** The fixture id under test (used in assertion messages). */
  fixture: string;
  /** The edge-condition label, e.g. "high-zoom-400" (used in messages). */
  condition: string;
}

/**
 * The CSS selector for a block on the VISIBLE reading surface, excluding the
 * always-mounted hidden measurement body (Plan 04-08). Mirrors the
 * `:not(.article-body-measurement ...)` filter used by `visibleBlock` in
 * annotations/_fixtures.ts so the invariant asserts on what a reader actually
 * sees + can reach by keyboard — never the aria-hidden measurement clone.
 */
const VISIBLE_BLOCK_SELECTOR =
  "[data-block-index]:not(.article-body-measurement [data-block-index])";

/**
 * Assert the shared D6-09 edge-condition invariant on the current page.
 *
 * MUST be called AFTER the article has mounted + settled (the caller drives
 * navigation + any viewport/emulation/font setup). Asserts all three clauses:
 *
 *  (a) Full content reachable via keyboard in BOTH reading modes — article
 *      role visible, visible blocks rendered ([data-block-index] count > 0),
 *      and a sample block carries text that survives a mode toggle.
 *  (b) Required functions reachable — the settings button + the mode-toggle
 *      control are present and visible (focusable buttons; deep keyboard
 *      traversal is exercised by panel-keyboard.spec.ts).
 *  (c) No layout overflow clips or overlaps content — body + article-body
 *      scrollWidth ≤ clientWidth + 1px (WCAG 1.4.10; lifted from reflow.spec.ts).
 *
 * Drives the M shortcut to toggle mode (D4-06 keyboard bundle) and re-asserts
 * (a) in the other mode so the invariant holds in BOTH paginated and
 * scrolling (the ACPT-03 contract — "the reader loses nothing" either way).
 */
export async function assertEdgeInvariant(
  page: Page,
  { fixture, condition }: EdgeInvariantOptions,
): Promise<void> {
  const label = `${condition} ${fixture}`;

  // (a) Full content reachable via keyboard — article role present + visible
  // blocks rendered. The 1:1 [data-block-index] ↔ article.blocks mapping
  // (Plan 04-06) means a visible-block count > 0 proves the reading surface
  // mounted its blocks. We scope to the VISIBLE surface (excludes the
  // aria-hidden measurement body — Plan 04-08 — which is user-select:none +
  // pointer-events:none and therefore NOT keyboard-reachable).
  const article = page.getByRole("article");
  await expect(article, `${label}: article role missing`).toBeVisible();

  const visibleBlocks = page.locator(VISIBLE_BLOCK_SELECTOR);
  await expect(
    visibleBlocks,
    `${label}: no visible blocks rendered`,
  ).not.toHaveCount(0);

  // Capture a sample block's text so we can prove content survives the mode
  // toggle below (the "content remains present" signal — deep keyboard
  // traversal is panel-keyboard.spec.ts's job; here we assert the content is
  // mounted + addressable).
  const sampleBefore = await visibleBlocks.first().textContent();
  expect(
    (sampleBefore ?? "").length,
    `${label}: first visible block carries no text`,
  ).toBeGreaterThan(0);

  // (b) Required functions reachable — settings button + mode toggle are
  // present and visible (both are focusable <button>s; A11Y-01/02 substrate).
  // The H/N annotation shortcuts are exercised interactively in the ACPT-01
  // consolidated spec; here we assert the controls exist + are operable.
  await expect(
    page.getByRole("button", { name: /^Reading settings$/ }),
    `${label}: settings button missing`,
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Reading mode:/ }),
    `${label}: mode-toggle button missing`,
  ).toBeVisible();

  // (c) No layout overflow clips or overlaps content — lifted verbatim from
  // reflow.spec.ts L24-49 (the WCAG 1.4.10 contract). The `.article-body`
  // query matches the <article class="article-body"> element in BOTH modes
  // (scrolling: the live article; paginated: the pinned paginated-surface
  // article). The hidden measurement body is class `.article-body-measurement`
  // — a DISTINCT class — so it is never matched here.
  const overflow = await page.evaluate(() => {
    return {
      body: {
        scrollW: document.body.scrollWidth,
        clientW: document.body.clientWidth,
      },
      article: (() => {
        const el = document.querySelector(".article-body");
        if (!el) return null;
        return {
          scrollW: el.scrollWidth,
          clientW: el.clientWidth,
        };
      })(),
    };
  });
  expect(
    overflow.body.scrollW,
    `${label}: body horizontal overflow (scrollW ${overflow.body.scrollW} > clientW ${overflow.body.clientW})`,
  ).toBeLessThanOrEqual(overflow.body.clientW + 1);
  if (overflow.article) {
    expect(
      overflow.article.scrollW,
      `${label}: article-body horizontal overflow`,
    ).toBeLessThanOrEqual(overflow.article.clientW + 1);
  }

  // (a) continued — toggle reading mode via the M shortcut + re-assert the
  // article + visible blocks are present in the OTHER mode (the invariant
  // holds in BOTH paginated and scrolling per D6-09). Mirrors switchMode from
  // annotations/_fixtures.ts (the D4-06 keyboard-bundle path) but inlined
  // without the aria-label change assertion so the helper stays self-
  // contained + robust to the session-mode-override fallback label.
  await page.keyboard.press("m");
  // Settle the mode swap (mirrors mode-switch-anchor.spec.ts 400ms).
  await page.waitForTimeout(400);

  await expect(
    article,
    `${label}: article missing after mode toggle`,
  ).toBeVisible();
  const visibleBlocksAfter = page.locator(VISIBLE_BLOCK_SELECTOR);
  await expect(
    visibleBlocksAfter,
    `${label}: no visible blocks after mode toggle`,
  ).not.toHaveCount(0);
  const sampleAfter = await visibleBlocksAfter.first().textContent();
  expect(
    (sampleAfter ?? "").length,
    `${label}: first visible block lost text after mode toggle`,
  ).toBeGreaterThan(0);
}
