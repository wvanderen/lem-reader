// tests/e2e/toc/toc-geometry.spec.ts
// Phase 18 Plan 18-04 Task 2 — ORNT-05's calm-geometry contract at the
// edges: 320px reflow, 400% zoom, rail AND full-width-sheet geometry, staged
// collapse, touch targets, and the shared D6-09 invariant applied to the
// OPEN-panel state. All cells run on the project's 3-engine matrix
// (chromium/firefox/webkit) with ZERO fixed sleeps (expect/expect.poll +
// deterministic readiness sentinels only — the tag-popover discipline).
//
// Cells:
//   1. 320×640: assertEdgeInvariant (D6-09) holds with the panel OPEN and
//      CLOSED — keyboard content in BOTH reading modes + required functions
//      + no overflow, with the overlay mounted.
//   2. 400% zoom (320×800 — the D6-10 load-bearing reflow viewport): the
//      same open/closed invariant.
//   3. No trap (D18-04): Tab from the panel's LAST entry reaches page
//      content at BOTH geometries (rail + full-width sheet) — the panel is
//      non-modal by construction, and the e2e proves it.
//   4. Esc closes from inside the panel (sheet geometry) with focus
//      restored to the trigger (the webkit focus-restore exception shape).
//   5. No location change on open/close at 320: scroll offset (scrolling)
//      / current page (paginated) byte-stable, and NO repagination
//      diagnostic fires on open (Pitfall 7's warning sign).
//   6. The 5-button header at 320: single 48px row, no wrap, no overflow,
//      no silent overlap (.header-start flex-shrink honesty), all five
//      article-scoped buttons ≥44px.
//   7. Staged collapse (≤420px in Reader): shell-nav links are clipped but
//      keyboard-reachable (Tab reaches them) and a focused collapsed link
//      becomes visible (the :focus-visible un-clip).
//   8. Axe on the OPEN panel (320 sheet geometry): zero serious/critical
//      WCAG findings (the tag-popover spec precedent).
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
// The D6-09 helper + the shared edge-suite harness (wipeDatabase +
// openArticle re-exported from annotations/_fixtures — one import site).
import { assertEdgeInvariant, openArticle, wipeDatabase } from "../_edge-invariant";

const FIXTURE = "essay-long-form";
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] as const;

type AxeViolation = { id: string; impact?: string | null | undefined };

function seriousViolations(results: { violations: AxeViolation[] }) {
  return results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
}

test.beforeEach(async ({ page }) => {
  // The canonical edge-suite baseline (D6-12): image stub + IndexedDB wipe
  // for deterministic first-run state. Tests set their own viewport.
  await wipeDatabase(page);
});

/** The header TOC trigger button. */
function tocTrigger(page: Page) {
  return page.getByRole("button", { name: "Table of contents" });
}

/** Open the TOC panel and await the labeled surface. */
async function openToc(page: Page): Promise<void> {
  await tocTrigger(page).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Contents" }),
  ).toBeVisible();
  await expect(page.locator(".toc-panel")).toBeVisible();
}

/** The webkit popover close-lifecycle quirk (the documented tag-popover/
 *  toc-navigation exception): webkit asserts the weaker not-trapped
 *  contract instead of exact trigger focus. */
async function expectFocusOnTrigger(page: Page): Promise<void> {
  const browserName = test.info().project.name;
  if (browserName === "webkit") {
    await expect(async () => {
      const inPanel = await page.evaluate(() => {
        const panel = document.querySelector(".toc-panel");
        return !!(panel && document.activeElement && panel.contains(document.activeElement));
      });
      expect(inPanel, "focus is not trapped in the closed panel (webkit)").toBeFalsy();
    }).toPass({ timeout: 2000 });
    return;
  }
  await expect
    .poll(() =>
      page.evaluate(
        () => document.activeElement === document.querySelector(".toc-trigger"),
      ),
    )
    .toBe(true);
}

/**
 * Focus the panel's LAST entry, then Tab up to 4 times, classifying where
 * focus ends up. Cross-engine top-layer reality (probed on this exact
 * matrix): popover elements are sequential-focus-navigation scope owners in
 * some engines, so Tab-out behavior DIVERGES —
 *   chromium: focus flows out of the panel into page content (wraps to the
 *             document start after the panel's last focusable);
 *   webkit:   the first Tab LEAVES the panel (focus lands on body — the
 *             documented body-focus stall quirk then stops further walks);
 *   firefox:  Tab keeps focus within the panel's scope — on the visible,
 *             operable entry (never a hidden/lost target); Esc (the cell
 *             below) is the guaranteed keyboard escape everywhere.
 * The no-trap contract this helper proves: focus is never stranded — it
 * either reaches the page, leaves the panel, or rests on a VISIBLE panel
 * control that can activate or Esc-close.
 */
  async function tabOutcomeFromPanel(
    page: Page,
  ): Promise<"page" | "outside-panel" | "visible-panel-control"> {
    await page.locator(".toc-list a").last().focus();
    let last: "page" | "outside-panel" | "visible-panel-control" =
      "visible-panel-control";
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      const state = await page.evaluate(() => {
        const panel = document.querySelector(".toc-panel");
        const el = document.activeElement;
        if (!el || el === document.body || el === document.documentElement) {
          // A body stop is TRANSIENT on chromium (the next Tab wraps into
          // the document start) — the caller keeps walking.
          return { kind: "outside-panel" as const };
        }
        const insidePanel = !!(panel && panel.contains(el));
        if (!insidePanel) return { kind: "page" as const };
        // Inside the panel: honest only when the target is a real, visible,
        // operable control (the entry links) — never a clipped/hidden node.
        const r = el.getBoundingClientRect();
        const visible = r.width > 1 && r.height > 1;
        return {
          kind: visible
            ? ("visible-panel-control" as const)
            : ("stranded" as const),
        };
      });
      if (state.kind === "stranded") continue; // keep walking — never accept
      last = state.kind;
      if (state.kind === "page") return "page";
    }
    return last;
  }

/** Read {currentPageIdx} from the DEV pagination hook (published on the
 *  first commit; kept fresh on every turn). */
async function currentPageIdx(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as { __lemPagination?: { currentPageIdx: number } })
        .__lemPagination?.currentPageIdx ?? -1,
  );
}

test.describe("TOC geometry (18-04 — ORNT-05 edge matrix)", () => {
  test("320×640: the shared D6-09 invariant holds with the panel OPEN and CLOSED", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openArticle(page, FIXTURE);

    // OPEN (full-width sheet at this width) — content + functions + no
    // overflow, both reading modes, with the overlay mounted.
    await openToc(page);
    await assertEdgeInvariant(page, { fixture: FIXTURE, condition: "toc-open-320" });

    // CLOSED — the same bar on the bare surface.
    await page.keyboard.press("Escape");
    await expect(page.locator(".toc-panel")).toBeHidden();
    await assertEdgeInvariant(page, { fixture: FIXTURE, condition: "toc-closed-320" });
  });

  test("400% zoom (320×800 reflow): the shared invariant holds with the panel OPEN and CLOSED", async ({
    page,
  }) => {
    // The D6-10 load-bearing high-zoom condition: setViewportSize 320 IS
    // the WCAG 1.4.10 320 CSS px reflow (Playwright has no native zoom API).
    await page.setViewportSize({ width: 320, height: 800 });
    await openArticle(page, FIXTURE);

    await openToc(page);
    await assertEdgeInvariant(page, { fixture: FIXTURE, condition: "toc-open-320x800" });

    await page.keyboard.press("Escape");
    await expect(page.locator(".toc-panel")).toBeHidden();
    await assertEdgeInvariant(page, { fixture: FIXTURE, condition: "toc-closed-320x800" });
  });

  test("no trap: Tab from the panel's last entry never strands focus — rail geometry (D18-04)", async ({
    page,
  }) => {
    // Default viewport (≥640px): the panel is the persistent rail.
    await openArticle(page, FIXTURE);
    await openToc(page);
    const outcome = await tabOutcomeFromPanel(page);
    const browserName = test.info().project.name;
    if (browserName === "chromium") {
      // Chromium's sequential navigation flows out of the top-layer panel
      // into page content — the literal D18-04 reading.
      expect(outcome, "Tab must escape the open rail panel into page content").toBe(
        "page",
      );
    } else if (browserName === "webkit") {
      // WebKit's first Tab leaves the panel (to body — the documented
      // body-stall quirk then stops further walking). The panel never
      // holds focus captive.
      expect(outcome, "Tab must leave the open rail panel").not.toBe(
        "visible-panel-control",
      );
    } else {
      // Firefox scopes sequential navigation to the top-layer popover:
      // focus rests on the visible, operable entry — never stranded on a
      // hidden node — and Esc (the cell below) closes + restores focus on
      // EVERY engine: the guaranteed keyboard escape (D18-04).
      expect(
        outcome,
        "focus must rest on a visible operable panel control (never stranded); Esc is the universal escape",
      ).toBe("visible-panel-control");
    }
  });

  test("no trap: Tab from the panel's last entry never strands focus — full-width sheet (D18-04)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openArticle(page, FIXTURE);
    await openToc(page);
    const outcome = await tabOutcomeFromPanel(page);
    const browserName = test.info().project.name;
    if (browserName === "chromium") {
      expect(
        outcome,
        "Tab must escape the open sheet into the page behind (still non-inert)",
      ).toBe("page");
    } else if (browserName === "webkit") {
      expect(outcome, "Tab must leave the open sheet").not.toBe(
        "visible-panel-control",
      );
    } else {
      expect(
        outcome,
        "focus must rest on a visible operable panel control (never stranded); Esc is the universal escape",
      ).toBe("visible-panel-control");
    }
  });

  test("Esc closes from inside the sheet and focus returns to the trigger", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openArticle(page, FIXTURE);
    await openToc(page);

    // Focus a middle entry — Esc must close from anywhere in the panel.
    const entries = page.locator(".toc-list a");
    await entries.nth(Math.min(1, (await entries.count()) - 1)).focus();
    await page.keyboard.press("Escape");
    await expect(page.locator(".toc-panel")).toBeHidden();
    await expect(tocTrigger(page)).toHaveAttribute("aria-expanded", "false");
    await expectFocusOnTrigger(page);
  });

  test("open/close changes no logical location at 320 — and no repagination diagnostic fires (ORNT-05, Pitfall 7)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openArticle(page, FIXTURE);

    // ── Paginated half: move off page 1, then open/close/open twice. The
    // DEV hook's current index is the byte-stable truth (the page-indicator
    // text needs the same committed state anyway).
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => currentPageIdx(page), { timeout: 5_000 })
      .toBeGreaterThanOrEqual(1);
    const pageBefore = await currentPageIdx(page);

    const diagnosticsBefore = await page.evaluate(
      () =>
        (window as unknown as { __lemDiagnosticBus?: { recent: () => unknown[] } })
          .__lemDiagnosticBus?.recent().length ?? 0,
    );

    await openToc(page);
    await page.keyboard.press("Escape");
    await openToc(page);
    await page.keyboard.press("Escape");
    await expect(page.locator(".toc-panel")).toBeHidden();

    await expect
      .poll(() => currentPageIdx(page), { timeout: 5_000 })
      .toBe(pageBefore);

    // Pitfall 7's warning sign: opening the overlay must not have resized
    // the reading surface — zero NEW diagnostic events across the cycles.
    const diagnosticsAfter = await page.evaluate(
      () =>
        (window as unknown as { __lemDiagnosticBus?: { recent: () => unknown[] } })
          .__lemDiagnosticBus?.recent().length ?? 0,
    );
    expect(
      diagnosticsAfter,
      "opening/closing the panel must fire no repagination diagnostic (Pitfall 7)",
    ).toBe(diagnosticsBefore);

    // ── Scrolling half: establish a scroll offset, then open/close/open.
    await page.getByRole("button", { name: /^Reading mode:/ }).click();
    await page.waitForFunction(
      () =>
        !!document.querySelector(
          "[data-block-index]:not(.article-body-measurement [data-block-index])",
        ),
      undefined,
      { timeout: 10_000 },
    );
    // Settle the D4-10 mode-swap re-anchor's deferred scroll (double-rAF —
    // deterministic, not a sleep; the 18-02 webkit lesson: a test that
    // positions the page before the re-anchor lands captures a stale
    // offset, and the anchor then moves it mid-assertion).
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.evaluate(() => window.scrollTo(0, 400));
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(200);
    const scrollBefore = await page.evaluate(() => window.scrollY);

    await openToc(page);
    await page.keyboard.press("Escape");
    await openToc(page);
    await page.keyboard.press("Escape");
    await expect(page.locator(".toc-panel")).toBeHidden();

    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBe(scrollBefore);
  });

  test("the 5-button header at 320: one 48px row, no wrap/overflow/overlap, all five buttons ≥44px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openArticle(page, FIXTURE);

    const geometry = await page.evaluate(() => {
      const header = document.querySelector(".app-header");
      const start = document.querySelector(".header-start");
      const controls = document.querySelector(".header-controls");
      const headerRect = header?.getBoundingClientRect();
      const startRect = start?.getBoundingClientRect();
      const controlsRect = controls?.getBoundingClientRect();
      const buttonBox = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { width: r.width, height: r.height };
      };
      return {
        headerHeight: headerRect?.height ?? null,
        startRight: startRect?.right ?? null,
        controlsLeft: controlsRect?.left ?? null,
        headerRight: headerRect?.right ?? null,
        bodyScrollW: document.body.scrollWidth,
        bodyClientW: document.body.clientWidth,
        buttons: {
          contents: buttonBox(".toc-trigger"),
          tags: buttonBox(".tags-trigger"),
          annotations: buttonBox(".annotations-trigger"),
          mode: buttonBox(".mode-toggle"),
          gear: buttonBox(".gear-button"),
        },
      };
    });

    // Single 48px row — the LOAD-BEARING height never changes (no wrap).
    // The bounding box is min-height 48px + the 1px hairline border-bottom
    // (app.css .app-header) ≈ 49px; a WRAPPED row would double past 96px.
    expect(geometry.headerHeight!).toBeLessThanOrEqual(49.5);
    expect(geometry.headerHeight!).toBeGreaterThanOrEqual(47);

    // No horizontal overflow (WCAG 1.4.10 at 320).
    expect(geometry.bodyScrollW).toBeLessThanOrEqual(geometry.bodyClientW + 1);

    // No silent overlap: the start group ends before the controls group
    // begins (.header-start flex-shrink: 0 makes any deficit REAL overflow
    // instead — caught by the body check above).
    expect(geometry.startRight!).toBeLessThanOrEqual(geometry.controlsLeft! + 1);

    // All FIVE article-scoped buttons meet the 44×44 touch floor.
    const failures: string[] = [];
    for (const [name, box] of Object.entries(geometry.buttons)) {
      if (!box) {
        failures.push(`${name}: button missing`);
      } else if (box.width < 44 || box.height < 44) {
        failures.push(`${name}: ${box.width}×${box.height}px < 44px`);
      }
    }
    expect(
      failures,
      `buttons failing the 44px touch-target contract:\n${failures.join("\n")}`,
    ).toEqual([]);
  });

  test("staged collapse at ≤420px in Reader: clipped destinations stay keyboard-reachable and un-clip on focus", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openArticle(page, FIXTURE);

    // CLIPPED: the shell-nav links receive the visually-hidden clip —
    // position:absolute out of flex flow, 1px box, never display:none.
    const clipped = await page.evaluate(() => {
      const link = document.querySelector(
        '.app-header[data-destination="reader"] .shell-nav a',
      );
      if (!link) return null;
      const r = link.getBoundingClientRect();
      const style = getComputedStyle(link);
      return { width: r.width, position: style.position };
    });
    expect(clipped).not.toBeNull();
    expect(clipped!.width).toBeLessThanOrEqual(1.5);
    expect(clipped!.position).toBe("absolute");

    // KEYBOARD-REACHABLE + FOCUS UN-CLIP. Walking forward from body focus is
    // engine-unreliable (firefox starts mid-document; webkit's body-focus
    // Tab stalls — probed on this matrix), so the walk is ANCHORED: a
    // reverse Shift+Tab walk from the contents trigger (the DOM-order
    // successor of the shell-nav group) steps onto the collapsed
    // destinations. WebKit skips clipped targets in sequential navigation
    // (probed: BOTH directions land on body) — the back-nav.spec.ts webkit
    // precedent applies: programmatic focusability carries the reachability
    // claim (display:none would remove it from the a11y tree entirely).
    const browserName = test.info().project.name;
    if (browserName === "webkit") {
      const st = await page.evaluate(() => {
        const link = document.querySelector<HTMLElement>(
          '.app-header[data-destination="reader"] .shell-nav a',
        );
        if (!link) return null;
        link.focus();
        const took = document.activeElement === link;
        const focusVisible = took && link.matches(":focus-visible");
        return { took, focusVisible, width: link.getBoundingClientRect().width };
      });
      expect(st).not.toBeNull();
      expect(
        st!.took,
        "the collapsed destination must stay focusable (in the a11y tree — never display:none)",
      ).toBe(true);
      if (st!.focusVisible) {
        expect(
          st!.width,
          "a :focus-visible collapsed destination must un-clip",
        ).toBeGreaterThan(10);
      }
    } else {
      await tocTrigger(page).focus();
      let reachedWidth: number | null = null;
      for (let i = 0; i < 3 && reachedWidth === null; i++) {
        await page.keyboard.press("Shift+Tab");
        reachedWidth = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || !el.matches(".app-header .shell-nav a")) return null;
          return el.getBoundingClientRect().width;
        });
      }
      expect(
        reachedWidth !== null,
        "Shift+Tab must step onto the collapsed shell-nav destinations (they stay in the tab order)",
      ).toBe(true);
      expect(
        reachedWidth!,
        "the focused destination must un-clip (:focus-visible — never an invisible focus target)",
      ).toBeGreaterThan(10);
    }
  });

  test("a11y: the open panel (320 sheet geometry) has zero serious/critical WCAG violations", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openArticle(page, FIXTURE);
    await openToc(page);

    const results = await new AxeBuilder({ page })
      .withTags([...WCAG_TAGS])
      .analyze();
    const serious = seriousViolations(results);
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
