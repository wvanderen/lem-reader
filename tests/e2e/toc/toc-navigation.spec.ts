// tests/e2e/toc/toc-navigation.spec.ts
// Phase 18 Plan 18-02 — the reader-facing TOC core navigation contract,
// end to end (ORNT-01 open + jump, ORNT-03 canonical destinations in BOTH
// reading modes, ORNT-04 semantic list/link semantics, ORNT-05 open/close
// changes nothing logical).
//
// CORE CELLS (this spec — the corpus/geometry extension lands in Plan
// 18-04's toc-geometry.spec; strengthen-only there):
//   (a) the header trigger opens the labeled panel — h2 "Contents" + nav
//       aria-label "Table of contents" visible, trigger aria-expanded true
//   (b) Esc closes and focus returns to the trigger (chromium/firefox poll
//       activeElement; webkit asserts the documented weaker
//       not-trapped-in-closed-surface exception — the tag-popover quirk)
//   (c) entry click closes the panel, jumps, and focus lands on the
//       destination heading — in BOTH reading modes (mode toggled between)
//   (d) Enter activation jumps WITHOUT re-routing (hash unchanged, article
//       did not remount — Pitfall 4)
//   (e) the same entry lands on the same heading in both modes (ORNT-03
//       equivalence — the focused heading's text matches across toggles)
//   (f) open-close-open leaves the logical location unchanged: scroll
//       offset (scrolling) / current page (paginated) — ORNT-05
//
// Harness: the tag-popover.spec.ts conventions wholesale — prepareFreshPage
// (image-stub + app-boot + clear-stores, NEVER deleteDatabase), Node-side
// ArticleSchema.parse seeding through seedRows, the waitForFunction
// readiness sentinel over .page-fragment / .article-body:not(
// .article-body-measurement) [data-block-index], and ZERO fixed sleeps
// (expect/expect.poll only).
import { test, expect, type Page } from "@playwright/test";
import { makeArticle, prepareFreshPage, seedRows } from "../portability/_portability";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/types";

const BASE = "http://localhost:5173";

// ── Seeded corpus ────────────────────────────────────────────────────────────

const para = (text: string) => ({ kind: "paragraph", content: [{ text, marks: [] }] });
const heading = (level: 2 | 3, text: string) => ({
  kind: "heading",
  level,
  content: [{ text, marks: [] }],
});

// Paragraph filler long enough that (a) the scrolling surface has real
// scroll room and (b) paginated mode derives multiple pages, so a jump is a
// genuine location change in both modes.
const filler = (n: number) =>
  para(
    `Filler paragraph ${n} carries enough distinctive prose to fill the reading ` +
      `surface comfortably in either mode, so section destinations sit well below ` +
      `the opening viewport and every jump moves the reader's logical location. ` +
      `The corpus keeps headings sparse and unambiguous for the core cells; the ` +
      `skips/duplicates/h5-h6 corpus extension lands with Plan 18-04.`,
  );

const TOC_ARTICLE: CanonicalArticle = ArticleSchema.parse({
  id: "toc-nav-demo",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.org/toc-nav-demo",
    title: "TOC Navigation Demo",
    author: "Demo Author",
    retrievedAt: "2026-08-30T00:00:00.000Z",
    originalHtmlHash: `sha256:${"0".repeat(64)}`,
  },
  blocks: [
    heading(2, "Alpha section"),
    filler(1),
    filler(2),
    filler(3),
    heading(2, "Beta section"),
    filler(4),
    filler(5),
    filler(6),
    heading(3, "Nested under beta"),
    filler(7),
    filler(8),
    heading(2, "Gamma section"),
    filler(9),
    filler(10),
    filler(11),
  ],
});

// A headingless article (D18-13): the trigger never plays peekaboo — the
// panel opens with the Top entry + the honest note.
const HEADINGLESS_ARTICLE = makeArticle({
  id: "toc-nav-headingless",
  title: "Headingless Demo",
  sourceUrl: "https://example.org/toc-nav-headingless",
  paragraphs: [
    "A single unstructured paragraph — no headings anywhere in the body.",
    "A second paragraph so the article renders with real scroll content.",
  ],
});

// ── Helpers (tag-popover.spec.ts conventions) ────────────────────────────────

test.beforeEach(async ({ page }) => {
  await prepareFreshPage(page);
  await seedRows(page, {
    articles: [TOC_ARTICLE as unknown as Record<string, unknown>, HEADINGLESS_ARTICLE as unknown as Record<string, unknown>],
  });
});

/** Open the seeded article directly and wait for a VISIBLE reading-surface
 *  block in EITHER mode (the tag-popover readiness sentinel, strengthened
 *  with the _edge-invariant.ts visible-block selector — the hidden
 *  .article-body-measurement clone must never satisfy the sentinel). No
 *  fixed sleeps. */
async function openArticle(page: Page, id: string): Promise<void> {
  await page.goto(`${BASE}/#/article/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForFunction(
    () =>
      !!document.querySelector(
        "[data-block-index]:not(.article-body-measurement [data-block-index])",
      ),
    undefined,
    { timeout: 10_000 },
  );
}

/** The header TOC trigger button. */
function tocTrigger(page: Page) {
  return page.getByRole("button", { name: "Table of contents" });
}

/** Open the TOC panel from the header and await the labeled surface. */
async function openToc(page: Page): Promise<void> {
  await tocTrigger(page).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Contents" }),
  ).toBeVisible();
  await expect(page.locator(".toc-panel")).toBeVisible();
}

/** Assert focus rests on the toc-trigger (the toggle-seam restore).
 *  WebKit exception (the documented tag-popover quirk): webkit's popover
 *  close lifecycle races the ref-captured focus restore, so webkit asserts
 *  the weaker "focus is not trapped in the closed surface". */
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
        () =>
          document.activeElement ===
          document.querySelector(".toc-trigger"),
      ),
    )
    .toBe(true);
}

/** Toggle the reading mode via the header ModeToggle (the one toggle path —
 *  the D4-10 anchor preserves the passage). Resolves once the swapped
 *  surface has committed a visible block AND the mode-swap re-anchor's
 *  deferred scroll has landed (double-rAF — deterministic, not a fixed
 *  sleep: the anchor effect runs one frame after the swap commit, and a
 *  test that positions the page before it lands would capture a stale
 *  offset). */
async function toggleMode(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Reading mode:/ }).click();
  await page.waitForFunction(
    () =>
      !!document.querySelector(
        "[data-block-index]:not(.article-body-measurement [data-block-index])",
      ),
    undefined,
    { timeout: 10_000 },
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

/** The article-side heading with the given text on the VISIBLE surface
 *  (the _edge-invariant.ts visible-block selector — the hidden measurement
 *  clone carries the same [data-block-index] set and must never match). */
function articleHeading(page: Page, text: string) {
  return page
    .locator(
      "[data-block-index]:not(.article-body-measurement [data-block-index])",
    )
    .filter({ hasText: text })
    .first();
}

test.describe("TOC navigation (18-02 — core cells)", () => {
  test("(a) trigger opens the labeled panel on any article — headingless included (ORNT-01, D18-13)", async ({
    page,
  }) => {
    await openArticle(page, TOC_ARTICLE.id);
    await expect(tocTrigger(page)).toHaveAttribute("aria-expanded", "false");

    await tocTrigger(page).click();
    await expect(
      page.getByRole("heading", { level: 2, name: "Contents" }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Table of contents" }),
    ).toBeVisible();
    await expect(tocTrigger(page)).toHaveAttribute("aria-expanded", "true");

    // Entries render as links: the synthetic Top entry first, then the
    // article's headings as-is (ORNT-04).
    const nav = page.getByRole("navigation", { name: "Table of contents" });
    await expect(
      nav.getByRole("link", { name: "Top of article" }),
    ).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Alpha section" }),
    ).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Nested under beta" }),
    ).toBeVisible();

    // The headingless article: the trigger is still there and the panel
    // opens with the honest note (the trigger never plays peekaboo).
    await openArticle(page, HEADINGLESS_ARTICLE.id);
    await tocTrigger(page).click();
    await expect(
      page.getByText("This article has no headings."),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Table of contents" }).getByRole(
        "link",
        { name: "Top of article" },
      ),
    ).toBeVisible();
    await expect(tocTrigger(page)).toHaveAttribute("aria-expanded", "true");
  });

  test("(b) Esc closes the panel and focus returns to the trigger", async ({
    page,
  }) => {
    await openArticle(page, TOC_ARTICLE.id);
    await openToc(page);

    await page.keyboard.press("Escape");
    await expect(page.locator(".toc-panel")).toBeHidden();
    await expect(tocTrigger(page)).toHaveAttribute("aria-expanded", "false");
    await expectFocusOnTrigger(page);
  });

  test("(c) entry click closes the panel, jumps, and focuses the destination heading — paginated mode (default)", async ({
    page,
  }) => {
    await openArticle(page, TOC_ARTICLE.id);
    // Default reading mode is paginated; wait for the first page commit.
    await expect(page.locator(".page-fragment").first()).toBeVisible();

    await openToc(page);
    await page
      .getByRole("navigation", { name: "Table of contents" })
      .getByRole("link", { name: "Beta section" })
      .click();

    // The panel closed through the seam…
    await expect(page.locator(".toc-panel")).toBeHidden();
    await expect(tocTrigger(page)).toHaveAttribute("aria-expanded", "false");
    // …and focus landed on the destination heading on the VISIBLE surface.
    const destination = articleHeading(page, "Beta section");
    await expect(destination).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const el = document.activeElement;
          return !!el && el.getAttribute("data-block-index") !== null
            ? (el as HTMLElement).textContent
            : null;
        }),
      )
      .toContain("Beta section");
  });

  test("(c-cont) entry click jumps and focuses the destination heading — scrolling mode", async ({
    page,
  }) => {
    await openArticle(page, TOC_ARTICLE.id);
    await expect(page.locator(".page-fragment").first()).toBeVisible();
    await toggleMode(page); // paginated → scrolling

    await openToc(page);
    await page
      .getByRole("navigation", { name: "Table of contents" })
      .getByRole("link", { name: "Gamma section" })
      .click();

    await expect(page.locator(".toc-panel")).toBeHidden();
    const destination = articleHeading(page, "Gamma section");
    await expect(destination).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const el = document.activeElement;
          return el && el.getAttribute("data-block-index") !== null
            ? (el as HTMLElement).textContent
            : null;
        }),
      )
      .toContain("Gamma section");
  });

  test("(d) Enter activation jumps without re-routing (hash unchanged, article did not remount)", async ({
    page,
  }) => {
    await openArticle(page, TOC_ARTICLE.id);
    await expect(page.locator(".page-fragment").first()).toBeVisible();

    // Tag the h1 so a remount (React re-mounting the article tree) is
    // detectable: a remounted element loses the probe attribute.
    const h1 = page.getByRole("heading", { level: 1 }).first();
    await h1.evaluate((el) => {
      el.setAttribute("data-toc-probe", "alive");
    });
    const hashBefore = await page.evaluate(() => window.location.hash);

    await openToc(page);
    const entry = page
      .getByRole("navigation", { name: "Table of contents" })
      .getByRole("link", { name: "Nested under beta" });
    await entry.focus();
    await page.keyboard.press("Enter");

    await expect(page.locator(".toc-panel")).toBeHidden();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const el = document.activeElement;
          return el && el.getAttribute("data-block-index") !== null
            ? (el as HTMLElement).textContent
            : null;
        }),
      )
      .toContain("Nested under beta");
    // The hash router NEVER re-parsed (Pitfall 4)…
    const hashAfter = await page.evaluate(() => window.location.hash);
    expect(hashAfter).toBe(hashBefore);
    // …and the article did not remount.
    await expect(h1).toHaveAttribute("data-toc-probe", "alive");
  });

  test("(e) the same entry lands on the same heading in both modes (ORNT-03)", async ({
    page,
  }) => {
    await openArticle(page, TOC_ARTICLE.id);
    await expect(page.locator(".page-fragment").first()).toBeVisible();

    const focusedHeadingText = () =>
      page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el.getAttribute("data-block-index") === null) return null;
        return {
          text: (el as HTMLElement).textContent,
          tag: el.tagName.toLowerCase(),
        };
      });

    // PAGINATED jump first.
    await openToc(page);
    await page
      .getByRole("navigation", { name: "Table of contents" })
      .getByRole("link", { name: "Beta section" })
      .click();
    await expect(page.locator(".toc-panel")).toBeHidden();
    await expect
      .poll(focusedHeadingText, { timeout: 5_000 })
      .not.toBeNull();
    const paginatedLanding = await focusedHeadingText();

    // Toggle to scrolling and jump through the SAME entry.
    await toggleMode(page);
    await openToc(page);
    await page
      .getByRole("navigation", { name: "Table of contents" })
      .getByRole("link", { name: "Beta section" })
      .click();
    await expect(page.locator(".toc-panel")).toBeHidden();
    await expect
      .poll(focusedHeadingText, { timeout: 5_000 })
      .not.toBeNull();
    const scrollingLanding = await focusedHeadingText();

    // Same structural destination: same heading text, same heading tag —
    // canonical-offset equivalence across modes (ORNT-03).
    expect(scrollingLanding).toEqual(paginatedLanding);
    expect(paginatedLanding!.tag).toMatch(/^h[2-6]$/);
  });

  test("(f) open-close-open leaves the logical location unchanged (ORNT-05)", async ({
    page,
  }) => {
    await openArticle(page, TOC_ARTICLE.id);
    await expect(page.locator(".page-fragment").first()).toBeVisible();

    // ── Paginated half: move off page 1, then open/close/open twice.
    await page.keyboard.press("ArrowRight"); // PageTurnControls next turn
    const pageBefore = await page
      .locator(".page-indicator")
      .textContent();
    expect(pageBefore, "page indicator present in paginated mode").toBeTruthy();

    await openToc(page);
    await page.keyboard.press("Escape");
    await openToc(page);
    await page.keyboard.press("Escape");
    await expect(page.locator(".toc-panel")).toBeHidden();

    const pageAfter = await page
      .locator(".page-indicator")
      .textContent();
    expect(pageAfter).toBe(pageBefore);

    // ── Scrolling half: establish a scroll offset, then open/close/open.
    await toggleMode(page);
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(300);
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
});
