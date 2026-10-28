import { expandSettingsGroup } from "../settings";
// tests/e2e/chrome/reading-control-contrast.spec.ts
// Issue #192 — the reading-control contrast contract, proven in the real
// browser (jsdom owns no layout/color truth — the pride-themes.spec PT
// discipline). The unit layer (tests/unit/settings/readingControlContrast.test.ts)
// polices the palette pairs + the rule source; THIS spec closes the loop:
//
//   RC-01 — the highlight-count badge and the mode toggle RESOLVE to the
//           board-voice tokens in every preset room (computed styles), the
//           toggle's pressed state is the lit brass, and the flip to
//           scrolling keeps the state multi-encoded (aria-pressed + label,
//           never color alone).
//   RC-02 — keyboard operation + the visible :focus-visible ring (a real
//           Tab-originated focus — the a11y.spec discipline).
//   RC-03 — reflow: both controls hold their boxes inside the band at the
//           360×640 narrow-phone reference cell (the CSS-pixel-zoom proxy —
//           browser zoom scales the same layout; WCAG 1.4.10).
//
// Badge truth rides the REAL persistence seam: a Dexie-seeded article +
// highlight (the portability helpers — makeArticle/confidentHighlightOn/
// highlightRow/seedRows), the same seam the forced-colors review-panel cell
// proves addressable by URL.
import { test, expect, type Page } from "@playwright/test";
import {
  wipeDatabase,
  openArticle,
  drawerTrigger,
  modeToggle,
  BASE,
} from "../annotations/_fixtures";
import {
  makeArticle,
  confidentHighlightOn,
  highlightRow,
  seedRows,
} from "../portability/_portability";

const PARAGRAPH =
  "The lighthouse keeper kept a double ledger: one column for the ships that passed, one for the birds, and the trustees never quite worked out which column the weather belonged to.";

/** A y-coordinate safely below the 48px band — the pointer parking spot when
 * a resting (unhovered) control color must be observed. */
const headerClearY = 200;

/** The seven radio-reachable preset rooms; :root Daylight rides the same
 * literals as the stored "light" default. Computed colors as rgb() — the
 * serialized form getComputedStyle returns in every engine. */
const ROOMS = [
  {
    name: "Daylight",
    literal: "light",
    boardSoft: "rgb(185, 198, 189)", // #b9c6bd
    boardText: "rgb(242, 244, 241)", // #f2f4f1
    brassBright: "rgb(201, 162, 78)", // #c9a24e
  },
  {
    name: "Warm paper",
    literal: "sepia",
    boardSoft: "rgb(194, 203, 191)", // #c2cbbf
    boardText: "rgb(242, 244, 241)", // #f2f4f1
    brassBright: "rgb(184, 147, 63)", // #b8933f
  },
  {
    name: "Night",
    literal: "dark",
    boardSoft: "rgb(159, 176, 162)", // #9fb0a2
    boardText: "rgb(238, 241, 236)", // #eef1ec
    brassBright: "rgb(217, 180, 94)", // #d9b45e
  },
  {
    name: "Trans pride",
    literal: "trans-light",
    boardSoft: "rgb(169, 198, 214)", // #a9c6d6
    boardText: "rgb(241, 247, 250)", // #f1f7fa
    brassBright: "rgb(238, 146, 180)", // #ee92b4
  },
  {
    name: "Bi pride",
    literal: "bi-dark",
    boardSoft: "rgb(165, 150, 194)", // #a596c2
    boardText: "rgb(240, 236, 246)", // #f0ecf6
    brassBright: "rgb(211, 179, 238)", // #d3b3ee
  },
  {
    name: "In Defense of Marxism",
    literal: "marxism-light",
    boardSoft: "rgb(207, 165, 162)", // #cfa5a2
    boardText: "rgb(248, 239, 236)", // #f8efec
    brassBright: "rgb(208, 128, 120)", // #d08078
  },
  {
    name: "In Defense of Marxism (Night)",
    literal: "marxism-dark",
    boardSoft: "rgb(230, 195, 191)", // #e6c3bf
    boardText: "rgb(248, 239, 236)", // #f8efec
    brassBright: "rgb(232, 164, 155)", // #e8a49b
  },
] as const;

/** Re-mount the wiped DB, then seed one article + one highlight through the
 * real store (the 10-03 fix: the app must re-declare the schema after the
 * wipe before raw rows can be written). */
async function seedLedger(page: Page, literal: string): Promise<string> {
  await page.goto(`${BASE}/#/`);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible();
  const id = `rc-${literal}`;
  const article = makeArticle({
    id,
    title: "Ledger of the Reading Room",
    paragraphs: [PARAGRAPH],
  });
  const anchor = confidentHighlightOn(article);
  await seedRows(page, {
    articles: [article],
    highlights: [highlightRow(id, anchor, `hl-${id}`)],
  });
  return id;
}

/** Pick a preset room through the real settings path on the article page. */
async function pickRoom(page: Page, room: (typeof ROOMS)[number]): Promise<void> {
  await page.getByRole("button", { name: "Reading settings" }).click();
  await expandSettingsGroup(page, "Appearance");
  await expect(page.locator("dialog.settings-panel")).toBeVisible();
  await page.getByRole("radio", { name: room.name, exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", room.literal);
  await page.keyboard.press("Escape"); // close the panel; the dialog never carries state
}

test.describe("reading-control contrast (issue #192)", () => {
  test.beforeEach(async ({ page }) => {
    await wipeDatabase(page);
  });

  for (const room of ROOMS) {
    test(`RC-01 ${room.name} (${room.literal}): badge + toggle resolve to the board voice`, async ({
      page,
    }) => {
      const id = await seedLedger(page, room.literal);
      await openArticle(page, id);
      await pickRoom(page, room);

      // The count badge renders (one seeded highlight) in the secondary
      // board voice — ≥ 4.5:1 on the band in every room (unit-policied pair).
      const badge = page.locator(".annotations-trigger-badge");
      await expect(badge).toBeVisible();
      await expect(badge).toHaveCSS("color", room.boardSoft);

      // Paginated default → the pressed toggle carries the LIT brass.
      const toggle = modeToggle(page);
      await expect(toggle).toHaveAttribute("aria-pressed", "true");
      await expect(toggle).toHaveCSS("color", room.brassBright);

      // Flip to scrolling: the resting board-soft voice, state multi-encoded
      // (aria-pressed + the accessible name — never color alone). The click
      // leaves the pointer over the button, so move it aside before the
      // resting-color assert, then hover to prove the brightened voice.
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-pressed", "false");
      await expect(toggle).toHaveAttribute("aria-label", "Reading mode: scrolling");
      await page.mouse.move(0, headerClearY);
      await expect(toggle).toHaveCSS("color", room.boardSoft);
      await toggle.hover();
      await expect(toggle).toHaveCSS("color", room.boardText);
    });
  }

  test("RC-02 keyboard operation + visible focus ring on the mode toggle", async ({ page }) => {
    const id = await seedLedger(page, "light");
    await openArticle(page, id);
    const toggle = modeToggle(page);

    // Keyboard operation on ALL engines: focus + Enter flips the mode.
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(toggle).toHaveAttribute("aria-label", "Reading mode: scrolling");

    // The visible ring: focus the adjacent trigger, ONE real Tab must land on
    // the toggle, and the Tab-originated focus matches :focus-visible — the
    // computed 2px token ring (chromium + firefox; webkit's sequential-nav
    // divergence is the established a11y.spec tabOrder precedent — its
    // keyboard-operation claim is the focus+Enter path above).
    if (test.info().project.name !== "webkit") {
      await drawerTrigger(page).focus();
      await page.keyboard.press("Tab");
      await expect(toggle).toBeFocused();
      const ring = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return { style: "none", width: "0px" };
        const cs = getComputedStyle(el);
        return { style: cs.outlineStyle, width: cs.outlineWidth };
      });
      expect(ring.style, "the focused toggle lost its :focus-visible ring").not.toBe("none");
      expect(parseFloat(ring.width)).toBeGreaterThanOrEqual(2);
    }
  });

  test("RC-03 reflow: controls stay inside the band at the 360×640 reference cell", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    const id = await seedLedger(page, "light");
    await openArticle(page, id);

    const header = (await page.locator(".app-header").boundingBox())!;
    const toggle = (await modeToggle(page).boundingBox())!;
    const trigger = (await drawerTrigger(page).boundingBox())!;
    const badge = (await page.locator(".annotations-trigger-badge").boundingBox())!;

    // The band's 48px row is load-bearing geometry (the paginated budget) —
    // the controls must sit inside it, not clip or obscure their neighbors
    // (WCAG 1.4.10 reflow at the narrow cell; browser zoom scales the same
    // CSS-pixel layout).
    const inside = (
      box: { x: number; y: number; width: number; height: number },
      label: string,
    ) => {
      expect(box.x, `${label}: clipped at the band's inline start`).toBeGreaterThanOrEqual(
        header.x - 0.5,
      );
      expect(box.y, `${label}: clipped at the band's block start`).toBeGreaterThanOrEqual(
        header.y - 0.5,
      );
      expect(box.x + box.width, `${label}: overflows the band's inline end`).toBeLessThanOrEqual(
        header.x + header.width + 0.5,
      );
      expect(box.y + box.height, `${label}: overflows the band's block end`).toBeLessThanOrEqual(
        header.y + header.height + 0.5,
      );
    };
    inside(toggle, "mode toggle");
    inside(trigger, "annotations trigger");
    // The badge is a superscript INSIDE the 44px trigger — never outside it.
    inside(badge, "count badge");
    expect(badge.x).toBeGreaterThanOrEqual(trigger.x);
    expect(badge.x + badge.width).toBeLessThanOrEqual(trigger.x + trigger.width + 0.5);

    // The touch target survives the narrow cell (A11Y-07).
    expect(Math.min(toggle.width, toggle.height)).toBeGreaterThanOrEqual(44);
    expect(Math.min(trigger.width, trigger.height)).toBeGreaterThanOrEqual(44);
  });
});
