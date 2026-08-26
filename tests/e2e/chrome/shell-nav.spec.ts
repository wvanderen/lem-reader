// tests/e2e/chrome/shell-nav.spec.ts
// Plan 15-02 — the persistent application shell (D15-01/D15-02): a
// nav.shell-nav[aria-label="Primary"] with exactly two text links (Library →
// #/, Highlights → #/highlights — D15-08) inside the existing 48px
// app-header on ALL three destinations, the brand link home (D15-05), the
// ModeToggle joining the articleMounted gate (D15-15), and the ≤639px
// wordmark collapse + narrow tuning (D15-17).
//
// Requirements owned by this file:
//   - NAV-01 — direct Library ↔ Highlights navigation through the shell
//   - NAV-02 — brand as the predictable home (#/ All view)
//   - NAV-05 — reading-only controls gated, global prefs (gear) everywhere
//
// Task 3 (this revision): the six real test groups extending the Wave-0
// sentinel (which stays as the harness proof — the 04-02 precedent: a REAL
// passing sentinel, NOT test.todo). Plain test() blocks inherit the
// 3-engine matrix (chromium/firefox/webkit) from playwright.config.ts; the
// 3-engine run lands at Plan 15-04's matrix task.
//
// Harness reuse (REUSE-DO-NOT-FORK): BASE + wipeDatabase + FIXTURES from
// ../annotations/_fixtures (the shared e2e discipline — deterministic
// first-run state + image stub; the fixture corpus is app-bundled, so
// #/article/FIXTURES[0] opens without seeding — the back-nav precedent).
//
// Selector discipline: query by role/name (getByRole) — never by CSS class
// for identity assertions. Two sanctioned exceptions, both mirroring existing
// precedent: the geometry group reads .app-header measurements via
// page.evaluate (header-geometry.spec.ts evaluate-geometry style — layout
// truth is not role-queryable), and the collapse-safety Tab walk matches the
// active element by its rendered text "Lem Reader" (the brand's accessible
// name IS its text — D15-10) plus its href, never a class hook.
import { test, expect, type Page } from "@playwright/test";
import { BASE, wipeDatabase, FIXTURES } from "../annotations/_fixtures";

/** The persistent shell destination nav (the a11y landmark contract). */
function primaryNav(page: Page) {
  return page.getByRole("navigation", { name: "Primary" });
}

/** The shell Highlights link scoped inside the Primary nav (role + name +
 *  landmark scoping — unambiguous against any content link). */
function shellHighlightsLink(page: Page) {
  return primaryNav(page).getByRole("link", { name: "Highlights" });
}

/**
 * The brand link. exact:true pins the accessible name to the FULL string
 * "Lem Reader" (D15-10 — no aria-label, no "home" suffix); resolving at all
 * in strict mode IS the exact-name assertion.
 */
function brandLink(page: Page) {
  return page.getByRole("link", { name: "Lem Reader", exact: true });
}

/** The 320×640 narrow-phone cell (POLISH-07 / the D13-13 reference family). */
const NARROW = { width: 320, height: 640 } as const;

/**
 * Engine-honest Tab-walk gate (the back-nav.spec.ts 09-06 precedent):
 * chromium + firefox follow DOM order in sequential navigation. WebKit's
 * default sequential navigation skips links (Safari form-controls-only), so
 * the collapse-safety claim degrades to programmatic focusability + Enter
 * activation there (asserted in the same test).
 */
function tabOrderFollowsDom(): boolean {
  return test.info().project.name !== "webkit";
}

/**
 * Press Tab up to maxPresses times until the active element is the brand
 * link — matched by href "#/" AND rendered text "Lem Reader" (the Library
 * link shares the href but not the name). Returns true when the walk landed.
 */
async function tabWalkToBrand(
  page: Page,
  maxPresses: number,
): Promise<boolean> {
  for (let i = 0; i < maxPresses; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(60);
    const matched = await page.evaluate(() => {
      const el = document.activeElement;
      return (
        el instanceof HTMLAnchorElement &&
        el.getAttribute("href") === "#/" &&
        el.textContent?.trim() === "Lem Reader"
      );
    });
    if (matched) return true;
  }
  return false;
}

test.describe("shell nav (15-02 — NAV-01/NAV-02/NAV-05)", () => {
  test.beforeEach(async ({ page }) => {
    await wipeDatabase(page);
  });

  test("sentinel: harness wires up (library h1 renders)", async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
  });

  // (1) Persistent shell — D15-02: one shell, one rule. The Primary nav and
  // its two text links render on every destination, and the nav holds
  // EXACTLY two links (no Add destination — D15-08; destination links are
  // text links at every width — D15-17).
  test("(1) Primary nav renders Library + Highlights (exactly 2 links) on all three destinations", async ({
    page,
  }) => {
    for (const url of [
      `${BASE}/`,
      `${BASE}/#/highlights`,
      `${BASE}/#/article/${FIXTURES[0]}`,
    ]) {
      await page.goto(url);
      const nav = primaryNav(page);
      await expect(nav).toBeVisible();
      await expect(nav.getByRole("link", { name: "Library" })).toBeVisible();
      await expect(
        nav.getByRole("link", { name: "Highlights" }),
      ).toBeVisible();
      await expect(
        nav.getByRole("link"),
        "D15-08 — exactly two destination links (no Add)",
      ).toHaveCount(2);
    }
  });

  // (2) aria-current discipline — D15-09: exactly one shell-nav link carries
  // aria-current="page", matching the ACTIVE destination. ANY list view is
  // the Library destination (#/ AND #/unread); #/highlights reverses the
  // polarity; the Reader carries neither. The brand link NEVER carries the
  // attribute — its semantic role is app-home, not a destination.
  test("(2) aria-current follows the destination; the brand never carries it", async ({
    page,
  }) => {
    const library = primaryNav(page).getByRole("link", { name: "Library" });
    const highlights = shellHighlightsLink(page);

    // ANY list view = the Library destination.
    for (const url of [`${BASE}/`, `${BASE}/#/unread`]) {
      await page.goto(url);
      await expect(
        page.getByRole("heading", { level: 1, name: "Saved articles" }),
      ).toBeVisible();
      await expect(library).toHaveAttribute("aria-current", "page");
      expect(await highlights.getAttribute("aria-current")).toBeNull();
    }

    // The Highlights destination reverses the polarity.
    await page.goto(`${BASE}/#/highlights`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Highlights" }),
    ).toBeVisible();
    await expect(highlights).toHaveAttribute("aria-current", "page");
    expect(await library.getAttribute("aria-current")).toBeNull();

    // In the Reader NEITHER destination link is current.
    await page.goto(`${BASE}/#/article/${FIXTURES[0]}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await library.getAttribute("aria-current")).toBeNull();
    expect(await highlights.getAttribute("aria-current")).toBeNull();

    // D15-09 — the brand link carries no aria-current on ANY destination.
    const brand = brandLink(page);
    for (const url of [
      `${BASE}/`,
      `${BASE}/#/highlights`,
      `${BASE}/#/article/${FIXTURES[0]}`,
    ]) {
      await page.goto(url);
      expect(await brand.getAttribute("aria-current")).toBeNull();
    }
  });

  // (3) Brand home — NAV-02/D15-05: the brand link's href is the FIXED
  // literal #/ (never view-tracking), so activation from the reader lands
  // the All view. Resolving the exact:true locator IS the D15-10 exact-name
  // assertion ("Lem Reader", no "home" suffix).
  test("(3) brand link 'Lem Reader' returns to the #/ All view from the reader", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIXTURES[0]}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await brandLink(page).click();

    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
  });

  // (4) Gating — NAV-05/D15-15/D15-16: the mode toggle renders ONLY when an
  // article is mounted; the gear renders on every destination. Count-zero +
  // contrast-leg pattern (the route-entry (e) discipline): each count-zero
  // is gated on the destination h1 first (never a pre-mount false zero),
  // and the SAME name regex matches in the reader to prove the selector.
  test("(4) mode toggle renders only in the reader; the gear renders on every destination", async ({
    page,
  }) => {
    const modeToggle = page.getByRole("button", { name: /Reading mode:/ });
    const gear = page.getByRole("button", { name: "Reading settings" });

    // Count-zero on Library + Highlights, h1-gated (articleMounted gate).
    await page.goto(`${BASE}/`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await expect(modeToggle).toHaveCount(0);
    await expect(gear).toBeVisible();

    await page.goto(`${BASE}/#/highlights`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Highlights" }),
    ).toBeVisible();
    await expect(modeToggle).toHaveCount(0);
    await expect(gear).toBeVisible();

    // Contrast leg: the regex matches in the reader — the zero-counts above
    // pin the gating, not a bad selector. The gear stays visible (D15-16).
    await page.goto(`${BASE}/#/article/${FIXTURES[0]}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(modeToggle).toBeVisible();
    await expect(gear).toBeVisible();
  });

  // (5) 320×640 geometry — POLISH-07 assist / Pitfall 1: on the article
  // view (the WORST case — [brand][nav] + [tags][annotations][mode][gear]
  // compete for one row) the header neither wraps nor overflows. The 48px
  // min-height is byte-stable regression surface; this asserts the row
  // holds via scrollHeight/scrollWidth (the header-geometry evaluate style).
  //
  // Plan 15-04 strengthening (strengthen-only — the audit's adjacent
  // geometry, the 15-02 silent-overlap lesson): scrollWidth cannot see a
  // deficit that manifests as the two flex groups OVERLAPPING each other
  // (the 14.2px 15-02 trap — .header-start's min-width: 0 let it shrink
  // below content). Pin the row's spatial truth directly: .header-controls
  // fits within the row's content box, and the two groups never overlap
  // (start's right edge ≤ controls' left edge). Measured slack at the
  // tightest cell: 10px between groups on all three engines (15-04).
  test("(5) 320×640 reader header: one row — no wrap, no horizontal overflow", async ({
    page,
  }) => {
    await page.goto(`${BASE}/#/article/${FIXTURES[0]}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.setViewportSize({ width: NARROW.width, height: NARROW.height });

    const geom = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>(".app-header");
      const start = document.querySelector<HTMLElement>(".header-start");
      const controls = document.querySelector<HTMLElement>(".header-controls");
      if (!header || !start || !controls) return null;
      return {
        scrollHeight: header.scrollHeight,
        clientHeight: header.clientHeight,
        scrollWidth: header.scrollWidth,
        clientWidth: header.clientWidth,
        rowLeft: header.getBoundingClientRect().left,
        rowRight: header.getBoundingClientRect().right,
        startRight: start.getBoundingClientRect().right,
        controlsLeft: controls.getBoundingClientRect().left,
        controlsRight: controls.getBoundingClientRect().right,
      };
    });
    expect(geom, ".app-header must be mounted").not.toBeNull();
    expect(
      geom!.scrollHeight,
      `header must not wrap at 320×640 (scrollHeight ${geom!.scrollHeight} vs clientHeight ${geom!.clientHeight})`,
    ).toBeLessThanOrEqual(geom!.clientHeight + 1);
    expect(
      geom!.scrollWidth,
      `header must not overflow horizontally at 320×640 (scrollWidth ${geom!.scrollWidth} vs clientWidth ${geom!.clientWidth})`,
    ).toBeLessThanOrEqual(geom!.clientWidth + 1);
    // Strengthened (15-04): the control cluster fits inside the row's
    // content box — a deficit can no longer hide as silent overlap.
    expect(
      geom!.controlsRight,
      `.header-controls must fit within the row at 320×640 (right ${geom!.controlsRight} vs row ${geom!.rowRight})`,
    ).toBeLessThanOrEqual(geom!.rowRight + 0.5);
    expect(
      geom!.controlsLeft,
      `.header-controls must start inside the row at 320×640 (left ${geom!.controlsLeft} vs row ${geom!.rowLeft})`,
    ).toBeGreaterThanOrEqual(geom!.rowLeft - 0.5);
    // Strengthened (15-04): the two flex groups never overlap (the 15-02
    // silent-overlap trap — flex-shrink: 0 makes a deficit overflow visibly;
    // this pins the spatial separation directly).
    expect(
      geom!.startRight,
      `.header-start must not overlap .header-controls at 320×640 (start right ${geom!.startRight} vs controls left ${geom!.controlsLeft})`,
    ).toBeLessThanOrEqual(geom!.controlsLeft + 0.5);
  });

  // (6) Collapse safety — Pitfall 9: the ≤639px wordmark is visually hidden
  // via the shipped .visually-hidden CLIP treatment, which keeps it in the
  // accessibility tree AND the tab order. A bounded Tab walk from the
  // document start must reach the collapsed link (display:none /
  // visibility:hidden would remove it — the exact failure mode this pins).
  test("(6) collapsed wordmark stays keyboard reachable at 320×640", async ({
    page,
  }) => {
    await page.setViewportSize({ width: NARROW.width, height: NARROW.height });
    await page.goto(`${BASE}/#/article/${FIXTURES[0]}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    if (tabOrderFollowsDom()) {
      // The skip link is the first focusable in DOM order, the brand the
      // second — a short bounded walk must land on it as activeElement.
      expect(
        await tabWalkToBrand(page, 8),
        "Tab from the document start must reach the collapsed 'Lem Reader' link",
      ).toBe(true);
    } else {
      // webkit sequential-nav divergence (the back-nav (d) 09-06 precedent):
      // programmatic focusability + Enter activation carry the claim —
      // focus lands on the collapsed link and activation navigates home.
      const brand = brandLink(page);
      await brand.focus();
      await expect(brand).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/#\/$/);
      await expect(
        page.getByRole("heading", { level: 1, name: "Saved articles" }),
      ).toBeVisible();
    }
  });
});
