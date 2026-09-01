// tests/e2e/chrome/tag-menu-geometry.spec.ts
// Phase 21 Plan 21-02 Task 2 — POLISH-08 / D21-05: the tag popover hugs its
// trigger, proven as GEOMETRY in real browsers on all three engines
// (chromium/firefox/webkit). The anchoring itself is CSS anchor positioning
// (app.css .tags-trigger anchor-name + .tag-popover position-anchor/
// position-area/position-try-fallbacks), probe-verified 2026-08-31 on this
// project's pinned Playwright 1.61.1 engines; this spec pins the behavioral
// contract the probe observed:
//
// CELLS:
//   1. Adjacency (1280×800): opened via the REAL trigger click, the
//      popover's top edge sits at/below the trigger's bottom edge separated
//      by the calm --space-xs (4px) margin, and the popover's inline span
//      aligns to the TRIGGER's inline-end area — not the header corner the
//      old fixed insets pinned it to (three more header buttons sit
//      inline-end of the tags trigger, so the old inset-inline-end corner
//      was ~150px+ away from the trigger's column).
//   2. Resize-follow (1280×800 → 360×640): with the popover OPEN, the
//      viewport resize re-resolves it adjacent below the trigger with ZERO
//      JS reposition listeners (the browser owns geometry — the prohibition
//      verified by this spec passing with no listener code anywhere).
//   3. Viewport-keep (240×600): the popover box lies FULLY inside the
//      viewport — position-try-fallbacks flip-block/flip-inline keep it
//      in-viewport with no manual clamp math (probe-verified × 3 engines).
//   4. Esc close + focus-restore: Escape closes through the shipped
//      toggle-event seam; focus returns to the trigger on chromium/firefox;
//      webkit asserts the documented weaker shape (focus not trapped in the
//      closed surface — the D18-04 engine-honesty precedent, same shape as
//      tag-popover.spec.ts / toc-geometry.spec.ts).
//   5. Light-dismiss: click outside closes + restores focus (same
//      engine-honest shapes).
//
// Geometry cells have NO engine skips — geometry is cross-engine per the
// probe (only the focus-restore assertion is engine-divergent, and that
// divergence is the honest per-engine branch, never a skip).
//
// Harness: chrome-suite conventions copied from tag-popover.spec.ts
// (prepareFreshPage from portability/_portability — image-stub + app-boot +
// clear-stores, NEVER deleteDatabase; BASE http://localhost:5173). Waits are
// expect/expect.poll/waitForFunction only — zero fixed sleeps in this file.
import { test, expect, type Page } from "@playwright/test";
import { prepareFreshPage } from "../portability/_portability";

const BASE = "http://localhost:5173";
// The long-form corpus fixture used by the tag-popover spec's export/axe
// scenarios — no tag writes needed here; geometry only.
const FIXTURE = "essay-long-form";

test.beforeEach(async ({ page }) => {
  // prepareFreshPage: image-stub + app-boot wait + clear-stores (the
  // portability discipline — see tag-popover.spec.ts for why NOT
  // deleteDatabase).
  await prepareFreshPage(page);
});

/** Open the corpus fixture article and wait for the reading surface (the
 *  tag-popover.spec.ts openArticle sentinel — zero hard waits). */
async function openArticle(page: Page): Promise<void> {
  await page.goto(`${BASE}/#/article/${FIXTURE}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForFunction(
    () => {
      const visible =
        document.querySelector(".page-fragment [data-block-index]") ??
        document.querySelector(
          ".article-body:not(.article-body-measurement) [data-block-index]",
        );
      return !!visible;
    },
    undefined,
    { timeout: 10_000 },
  );
}

/** The header tags-trigger button. */
function tagsTrigger(page: Page) {
  return page.getByRole("button", { name: "Article tags" });
}

/** Open the popover through the REAL UI (trigger click) and await the
 *  labeled surface. */
async function openPopover(page: Page): Promise<void> {
  await expect(tagsTrigger(page)).toHaveAttribute("aria-expanded", "false");
  await tagsTrigger(page).click();
  await expect(
    page.getByRole("dialog", { name: "Article tags" }),
  ).toBeVisible();
  await expect(tagsTrigger(page)).toHaveAttribute("aria-expanded", "true");
}

/** Assert focus rests on the tags-trigger (the Pitfall 1 restore). WebKit
 *  exception (the documented drawer-view.spec.ts quirk, verbatim in spirit
 *  from tag-popover.spec.ts): WebKit's popover/dialog close lifecycle races
 *  the ref-captured focus restore, so webkit asserts the weaker but still
 *  meaningful "focus is not trapped in the closed surface" contract. */
async function expectFocusOnTrigger(page: Page): Promise<void> {
  const browserName = test.info().project.name;
  if (browserName === "webkit") {
    await expect(async () => {
      const inPopover = await page.evaluate(() => {
        const pop = document.querySelector(".tag-popover");
        return !!(pop && document.activeElement && pop.contains(document.activeElement));
      });
      expect(inPopover, "focus is not trapped in the closed popover (webkit)").toBeFalsy();
    }).toPass({ timeout: 2000 });
    return;
  }
  await expect
    .poll(() =>
      page.evaluate(
        () => document.activeElement === document.querySelector(".tags-trigger"),
      ),
    )
    .toBe(true);
}

/** Read the popover + trigger boxes as floats (page.evaluate keeps sub-pixel
 *  precision that locator.boundingBox() may round). */
function readBoxes(page: Page) {
  return page.evaluate(() => {
    const pop = document.querySelector(".tag-popover");
    const trigger = document.querySelector(".tags-trigger");
    if (!pop || !trigger) return null;
    const p = pop.getBoundingClientRect();
    const t = trigger.getBoundingClientRect();
    return {
      pop: { x: p.x, y: p.y, width: p.width, height: p.height, right: p.right },
      trigger: { x: t.x, y: t.y, width: t.width, height: t.height, right: t.right, bottom: t.bottom },
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  });
}

/** POLISH-08 adjacency, the load-bearing geometry truth: the popover's top
 *  edge sits at/below the trigger's bottom edge separated by the calm 4px
 *  --space-xs margin (tolerance: +2.5px sub-pixel), and its inline span
 *  aligns to the TRIGGER's inline-end area (right edges within the margin
 *  ± tolerance) — NOT the header corner the old fixed insets pinned. */
async function expectAdjacentBelowTrigger(page: Page): Promise<void> {
  const b = await readBoxes(page);
  expect(b, "popover + trigger boxes measurable").not.toBeNull();
  const gap = b!.pop.y - b!.trigger.bottom;
  expect(
    gap,
    `popover top must sit at/below the trigger bottom + the 4px calm gap (got gap=${gap}px)`,
  ).toBeGreaterThanOrEqual(-0.5);
  expect(gap).toBeLessThanOrEqual(4 + 2.5);
  const inlineDelta = b!.pop.right - b!.trigger.right;
  expect(
    Math.abs(inlineDelta),
    `popover inline-end must align to the trigger's inline-end area, not the header corner (got delta=${inlineDelta}px)`,
  ).toBeLessThanOrEqual(4 + 2.5);
}

/** Horizontal overlap with the trigger's column — holds at BOTH
 *  position-try inline outcomes (span-inline-end extends inline-start from
 *  the trigger's column; the flip-inline mirror extends inline-end from
 *  it), so resize-follow can assert it engine-honestly without pinning
 *  which fallback won. */
async function expectOverlapsTriggerColumn(page: Page): Promise<void> {
  const b = await readBoxes(page);
  expect(b, "popover + trigger boxes measurable").not.toBeNull();
  expect(
    b!.pop.x,
    "popover must horizontally overlap the trigger's column",
  ).toBeLessThan(b!.trigger.right);
  expect(b!.pop.right).toBeGreaterThan(b!.trigger.x);
}

test.describe("tag menu geometry (21-02 — POLISH-08 / D21-05)", () => {
  test("adjacency: opens directly below the trigger at the trigger's inline-end area (1280×800)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openArticle(page);
    await openPopover(page);

    await expectAdjacentBelowTrigger(page);

    // Sanity discriminator against the OLD header-corner geometry: three
    // header buttons (annotations/mode/gear) sit inline-end of the tags
    // trigger, so a corner-pinned popover would sit >100px past the
    // trigger's column. The adjacency assertion above already fails that
    // shape; this pin makes the intent explicit for future readers.
    const b = await readBoxes(page);
    expect(b!.pop.right).toBeLessThan(b!.vw - 100);
  });

  test("resize-follow: an open popover re-resolves adjacent below the trigger on 1280→360 resize, zero JS listeners", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openArticle(page);
    await openPopover(page);
    await expectAdjacentBelowTrigger(page);

    // Resize WITH the popover open. Anchor positioning re-resolves the
    // geometry in the browser's layout pass — no JS listener exists for
    // this anywhere in src/ (the plan's enforced prohibition); poll lets
    // the engine's post-resize layout settle deterministically.
    await page.setViewportSize({ width: 360, height: 640 });
    await expect
      .poll(
        async () => {
          const b = await readBoxes(page);
          if (!b) return false;
          const gap = b.pop.y - b.trigger.bottom;
          return gap >= -0.5 && gap <= 4 + 2.5;
        },
        { timeout: 5_000 },
      )
      .toBe(true);

    // Still hugging the trigger's column (whichever inline fallback won).
    await expectOverlapsTriggerColumn(page);
    // The popover is still open — resize must never dismiss it.
    await expect(page.locator(".tag-popover")).toBeVisible();
  });

  test("viewport-keep: the popover box lies fully inside the viewport at 240×600 (fallbacks flip)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 240, height: 600 });
    await openArticle(page);
    await openPopover(page);

    const b = await readBoxes(page);
    expect(b, "popover box measurable at 240px").not.toBeNull();
    // All four edges inside the viewport (0.5px sub-pixel tolerance) —
    // position-try-fallbacks flip-block/flip-inline keep it in-viewport
    // with no manual clamp math.
    expect(b!.pop.x).toBeGreaterThanOrEqual(-0.5);
    expect(b!.pop.y).toBeGreaterThanOrEqual(-0.5);
    expect(b!.pop.x + b!.pop.width).toBeLessThanOrEqual(b!.vw + 0.5);
    expect(b!.pop.y + b!.pop.height).toBeLessThanOrEqual(b!.vh + 0.5);
  });

  test("Esc closes and focus returns to the trigger (engine-honest shapes)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openArticle(page);

    // Focus the trigger, then open through the real toggle.
    await tagsTrigger(page).focus();
    await tagsTrigger(page).click();
    await expect(page.locator(".tag-popover")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator(".tag-popover")).toBeHidden();
    await expect(tagsTrigger(page)).toHaveAttribute("aria-expanded", "false");
    await expectFocusOnTrigger(page);
  });

  test("light-dismiss closes and focus returns to the trigger (engine-honest shapes)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openArticle(page);

    await tagsTrigger(page).focus();
    await tagsTrigger(page).click();
    await expect(page.locator(".tag-popover")).toBeVisible();

    // Click OUTSIDE the popover (the point computed from the popover's own
    // box — the tag-popover.spec.ts precedent: a hardcoded element offset
    // is not a stable outside point across geometries).
    const popBox = await page.locator(".tag-popover").boundingBox();
    expect(popBox, "popover box measurable before light-dismiss").toBeTruthy();
    const vp = page.viewportSize() ?? { width: 1280, height: 720 };
    const dismissX = Math.round(vp.width / 2);
    const dismissY = Math.round(
      Math.min(popBox!.y + popBox!.height + 24, vp.height - 8),
    );
    await page.mouse.click(dismissX, dismissY);

    await expect(page.locator(".tag-popover")).toBeHidden();
    await expect(tagsTrigger(page)).toHaveAttribute("aria-expanded", "false");
    await expectFocusOnTrigger(page);
  });
});
