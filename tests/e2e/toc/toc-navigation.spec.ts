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
// 21-08 (UAT Test 7): also await the panel's OPEN-FOCUS settle — visibility
// alone races TocPanel's open effect (TocPanel.tsx L168-184): one rAF after
// open it focuses the aria-current entry (deterministically "Top of
// article" in paginated mode — the section spy lags via MutationObserver +
// 250ms debounce). Under a starved renderer that rAF can fire AFTER the
// caller's entry.focus(), yanking focus to "Top of article"; Enter then
// activates the WRONG entry (h1 focus, page 1, poll null — the exact
// .planning/debug/webkit-e2e-timeouts-toc-null.md reproduction). Awaiting
// the settle here means the caller's focus can never be yanked afterward:
// the (d)/(m) Enter-activation cells close the race by construction
// instead of by frame-timing luck. Click cells re-target focus with an
// actual click and settle harmlessly.
async function openToc(page: Page): Promise<void> {
  await tocTrigger(page).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Contents" }),
  ).toBeVisible();
  await expect(page.locator(".toc-panel")).toBeVisible();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const panel = document.querySelector(".toc-panel");
          const el = document.activeElement;
          return !!(panel && el && el.tagName === "A" && panel.contains(el));
        }),
      { timeout: 3_000 },
    )
    .toBe(true);
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

// ═══════════════════════════════════════════════════════════════════════════
// Phase 18 Plan 18-04 Task 1 — the CORPUS EXTENSION (strengthen-only: every
// cell above is byte-stable; everything below is additive). The seeded TOC
// corpus (_corpus.ts) closes the RESEARCH Wave-0 gap — NO shipped fixture
// contains h4/h5/h6, skipped levels, or duplicate headings. Cells prove the
// full ORNT-04 honesty matrix plus D18-12 aria-current in BOTH geometries:
//   (g) skips: the h4 under an h2 renders inside a deeper nested ul with NO
//       intermediate li (list-structure depth, not visual indent — D18-10)
//   (h) duplicates: two identical accessible names, both navigable, each
//       landing on its OWN heading (position disambiguates — D18-11)
//   (i) levels: h5/h6 entries exist and the rendered article preserves the
//       heading level (an h5 jump focuses a real <h5> — ORNT-04)
//   (j) chapter: the EPUB chapter row gets the identical trigger + panel
//       machinery from its own heading hierarchy (D18-14)
//   (k) headingless: on the SHIPPED headingless fixture (essay-long-form)
//       the panel shows Top + the honest note; the trigger never peekaboos
//       (D18-13)
//   (l) aria-current follows scroll (scrolling) and page turns (paginated);
//       above the first heading the Top entry carries it (D18-12)
//   (m) Enter activation on a CORPUS entry jumps without re-routing
//       (hash unchanged, article not remounted — Pitfall 4)
//   (n) both-modes equivalence on the skip corpus: the same entry focuses
//       the same heading text across a mode toggle (ORNT-03)
// ═══════════════════════════════════════════════════════════════════════════
import {
  seedTocCorpus,
  SKIP_ARTICLE,
  DUPLICATE_ARTICLE,
  DUPLICATE_TEXT,
  DEEP_ARTICLE,
  CHAPTER_ARTICLE,
} from "./_corpus";

test.describe("TOC navigation (18-04 — corpus extension)", () => {
  test.beforeEach(async ({ page }) => {
    // The outer beforeEach already ran prepareFreshPage (clear-stores) and
    // seeded the base articles; the corpus rows join them in the SAME
    // stores (distinct ids — no interference with the core cells' corpus).
    await seedTocCorpus(page);
  });

  test("(g) skipped levels nest deeper with NO intermediate li (D18-10)", async ({
    page,
  }) => {
    await openArticle(page, SKIP_ARTICLE.id);

    await openToc(page);
    const nav = page.getByRole("navigation", { name: "Table of contents" });

    // The h4 entry exists and its li carries depth 2 (parent.depth + 2 —
    // one extra nesting level for the skipped level 3). Scoped to the
    // depth-2 li so the hasText filter cannot match the wrapping ancestor.
    const h4Li = nav
      .locator('li[data-depth="2"]')
      .filter({ hasText: "Sunken cathedral" });
    await expect(h4Li).toHaveCount(1);

    // LIST-STRUCTURE depth (never visual indent): the h4's li lives inside
    // a ul nested TWO ul levels deep within the panel's nav…
    const nested = await h4Li.evaluate((el) => {
      const ownUl = el.closest("ul");
      const parentLi = ownUl?.closest("li");
      const grandUl = parentLi?.closest("ul");
      return {
        insideNestedUl: grandUl !== null && grandUl !== ownUl,
        parentLiText: parentLi?.textContent ?? "",
      };
    });
    expect(nested.insideNestedUl, "the h4 li must sit in a ul-in-ul").toBe(true);
    expect(nested.parentLiText).toContain("Open waters");

    // …and NO intermediate entry was invented: this article's only depths
    // are 0 (Top, the two h2s) and 2 (the h4) — a depth-1 li would BE an
    // invented intermediate (D18-10's exact prohibition).
    await expect(nav.locator('li[data-depth="1"]')).toHaveCount(0);
  });

  test("(h) duplicate heading texts render AS-IS and each lands on its own heading (D18-11)", async ({
    page,
  }) => {
    await openArticle(page, DUPLICATE_ARTICLE.id);

    // Two entries with the IDENTICAL accessible name — no "(2 of 2)" suffix,
    // no parent prefix (D18-11). getByRole needs the panel OPEN (closed =
    // UA popover display:none, outside the a11y tree).
    await openToc(page);
    const entries = page
      .getByRole("navigation", { name: "Table of contents" })
      .getByRole("link", { name: DUPLICATE_TEXT });
    await expect(entries).toHaveCount(2);

    // The jump's destination focus lands via the D4-07 rAF/120ms guard —
    // poll until the focused element carries a block index, then read it.
    const readLandingBlockIndex = () =>
      page.evaluate(() => {
        const el = document.activeElement;
        return el && el.getAttribute("data-block-index") !== null
          ? Number(el.getAttribute("data-block-index"))
          : null;
      });

    // First entry → the FIRST heading in the article (position disambiguates).
    await entries.first().click();
    await expect(page.locator(".toc-panel")).toBeHidden();
    await expect
      .poll(readLandingBlockIndex, { timeout: 5_000 })
      .not.toBeNull();
    const firstLanding = await readLandingBlockIndex();

    // Second entry → the SECOND heading (a strictly later block).
    await openToc(page);
    await entries.nth(1).click();
    await expect(page.locator(".toc-panel")).toBeHidden();
    await expect
      .poll(readLandingBlockIndex, { timeout: 5_000 })
      .not.toBeNull();
    const secondLanding = await readLandingBlockIndex();

    expect(firstLanding).not.toBeNull();
    expect(secondLanding).not.toBeNull();
    expect(
      secondLanding!,
      "the duplicate entry must land on ITS OWN heading (a later block)",
    ).toBeGreaterThan(firstLanding!);
  });

  test("(i) h5/h6 entries exist and the rendered article preserves the heading level (ORNT-04)", async ({
    page,
  }) => {
    await openArticle(page, DEEP_ARTICLE.id);

    // The panel carries h5 + h6 entries with their texts AS-IS.
    await openToc(page);
    const nav = page.getByRole("navigation", { name: "Table of contents" });
    await expect(nav.getByRole("link", { name: "Quiet depths" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Floor" })).toBeVisible();

    // And the ARTICLE renders the true levels: jump to the h5 entry in
    // scrolling mode and the focused destination IS an <h5> (never coerced
    // to h2/h3 for styling convenience). Close the panel BEFORE the mode
    // toggle — the ≥640px rail is a persistent companion (no outside
    // dismiss), and a second trigger click would TOGGLE it closed.
    await page.keyboard.press("Escape");
    await expect(page.locator(".toc-panel")).toBeHidden();
    await toggleMode(page); // default paginated → scrolling
    await openToc(page);
    await nav.getByRole("link", { name: "Quiet depths" }).click();
    await expect(page.locator(".toc-panel")).toBeHidden();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const el = document.activeElement;
          return el && el.getAttribute("data-block-index") !== null
            ? el.tagName.toLowerCase()
            : null;
        }),
      )
      .toBe("h5");
  });

  test("(j) an EPUB chapter gets the identical trigger + panel machinery (D18-14)", async ({
    page,
  }) => {
    // The chapter row carries the denormalized top-level bookId (the
    // booksStore.saveBook write shape) — chapters ARE articles; zero extra
    // machinery is the contract being proven.
    await openArticle(page, CHAPTER_ARTICLE.id);

    await expect(tocTrigger(page)).toHaveAttribute("aria-expanded", "false");
    await openToc(page);
    const nav = page.getByRole("navigation", { name: "Table of contents" });
    await expect(
      nav.getByRole("link", { name: "Top of article" }),
    ).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Moorings" }),
    ).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "The ferry at dawn" }),
    ).toBeVisible();

    // The jump machinery is identical too: activation closes the panel and
    // focuses the chapter's own destination heading.
    await nav.getByRole("link", { name: "The ferry at dawn" }).click();
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
      .toContain("The ferry at dawn");
  });

  test("(k) the headingless FIXTURE opens the panel with Top + the honest note (D18-13)", async ({
    page,
  }) => {
    // essay-long-form is the shipped headingless corpus fixture (RESEARCH
    // §Wave 0) — distinct from the core cells' seeded headingless article,
    // this proves the contract on the real fixture set.
    await openArticle(page, "essay-long-form");

    // The trigger never plays peekaboo…
    await expect(tocTrigger(page)).toBeVisible();
    await tocTrigger(page).click();
    // …and the panel shows the Top entry + the calm note (same chrome).
    await expect(
      page.getByText("This article has no headings."),
    ).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Table of contents" });
    await expect(
      nav.getByRole("link", { name: "Top of article" }),
    ).toBeVisible();
    // Top is the ONLY entry — nothing was invented (D18-13 + D18-10).
    await expect(nav.getByRole("link")).toHaveCount(1);
  });

  test("(l) aria-current follows scroll and page turns; Top carries it above the first heading (D18-12)", async ({
    page,
  }) => {
    const currentEntryText = () =>
      page
        .getByRole("navigation", { name: "Table of contents" })
        .locator('[aria-current="true"]')
        .textContent();

    // ── SCROLLING half ─────────────────────────────────────────────────────
    await openArticle(page, TOC_ARTICLE.id);
    await expect(page.locator(".page-fragment").first()).toBeVisible();
    await toggleMode(page); // → scrolling

    // Above the first heading: the Top entry carries aria-current.
    await openToc(page);
    await expect
      .poll(currentEntryText, { timeout: 3_000 })
      .toContain("Top of article");

    // Scroll down past "Beta section": the current entry FOLLOWS the spy
    // (the panel stays open — the rail is a persistent companion at this
    // viewport, so the change is observable live). Block-start alignment
    // puts the heading ABOVE the 48px sentinel the spy measures against.
    const beta = articleHeading(page, "Beta section");
    await beta.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await expect
      .poll(currentEntryText, { timeout: 3_000 })
      .toContain("Beta section");
    await page.keyboard.press("Escape");
    await expect(page.locator(".toc-panel")).toBeHidden();

    // ── PAGINATED half ─────────────────────────────────────────────────────
    // Page turns move the current entry to the section the reader opened
    // onto (the first heading on the newly-turned page — the pinned surface
    // never scrolls, so the spy's page-turn rule applies). Toggle back on
    // the SAME article (handleToggleMode persists the preference — a fresh
    // reload would hydrate scrolling again) and wait for the surface swap.
    // One turn per step with a bounded poll between turns (the spy's chain
    // is turn → fragment commit → MutationObserver → 250ms debounce →
    // render; a poll WITHOUT settle could skip past Gamma's page before
    // the debounce lands).
    await toggleMode(page); // scrolling → paginated
    await expect(page.locator(".page-fragment").first()).toBeVisible({
      timeout: 10_000,
    });
    await openToc(page);

    let reachedGamma = false;
    for (let turn = 0; turn < 12 && !reachedGamma; turn++) {
      await page.keyboard.press("ArrowRight");
      const matched = await expect
        .poll(currentEntryText, { timeout: 1_500 })
        .toContain("Gamma section")
        .then(
          () => true,
          () => false,
        );
      reachedGamma = matched;
    }
    expect(
      reachedGamma,
      "aria-current must follow page turns onto the Gamma section page (D18-12)",
    ).toBe(true);
  });

  test("(m) Enter activation on a corpus entry jumps without re-routing (Pitfall 4)", async ({
    page,
  }) => {
    await openArticle(page, SKIP_ARTICLE.id);
    await expect(page.locator(".page-fragment").first()).toBeVisible();

    const h1 = page.getByRole("heading", { level: 1 }).first();
    await h1.evaluate((el) => {
      el.setAttribute("data-toc-probe", "alive");
    });
    const hashBefore = await page.evaluate(() => window.location.hash);

    await openToc(page);
    const entry = page
      .getByRole("navigation", { name: "Table of contents" })
      .getByRole("link", { name: "Sunken cathedral" });
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
      .toContain("Sunken cathedral");
    const hashAfter = await page.evaluate(() => window.location.hash);
    expect(hashAfter).toBe(hashBefore);
    await expect(h1).toHaveAttribute("data-toc-probe", "alive");
  });

  test("(n) the same corpus entry lands on the same heading in both modes (ORNT-03)", async ({
    page,
  }) => {
    await openArticle(page, SKIP_ARTICLE.id);
    await expect(page.locator(".page-fragment").first()).toBeVisible();

    const focusedHeadingText = () =>
      page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el.getAttribute("data-block-index") === null) return null;
        return { text: (el as HTMLElement).textContent, tag: el.tagName.toLowerCase() };
      });

    // PAGINATED jump to the skipped-level h4 first.
    await openToc(page);
    await page
      .getByRole("navigation", { name: "Table of contents" })
      .getByRole("link", { name: "Sunken cathedral" })
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
      .getByRole("link", { name: "Sunken cathedral" })
      .click();
    await expect(page.locator(".toc-panel")).toBeHidden();
    await expect
      .poll(focusedHeadingText, { timeout: 5_000 })
      .not.toBeNull();
    const scrollingLanding = await focusedHeadingText();

    expect(scrollingLanding).toEqual(paginatedLanding);
    expect(paginatedLanding!.tag).toBe("h4");
  });
});
