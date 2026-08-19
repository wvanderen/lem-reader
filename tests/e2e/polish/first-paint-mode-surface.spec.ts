// tests/e2e/polish/first-paint-mode-surface.spec.ts
// Plan 13-09 — the strengthened G4 mode-surface contract (13-UAT.md § Gaps
// G4: "opening an article in paginated mode first paints the scrolling
// surface and its progress hairline, then swaps to the paginated surface —
// a visible jump on every paginated first load"). Proves across
// chromium/firefox/webkit, from NAVIGATION START (the only observation
// point that can see a transient wrong-surface paint):
//
//   1. Paginated cold load NEVER paints the scrolling surface. The first
//      stable paint is the paginated frame itself: the article element
//      carries the pinned-surface class from its FIRST insertion, the
//      article-bearing main carries the paginated main class from its
//      first insertion, and ZERO visible (non-measurement) article blocks
//      are inserted before the first page fragment (the G4 must-not — the
//      old code mounted the full scrolling ArticleBody, then swapped).
//      A calm status paragraph sits inside the page viewport during the
//      pending window, the pinned class is never dropped off the article,
//      and the frame is stable across the placeholder→page-1 transition:
//      the header box does not move (≤1px) and the placeholder's viewport
//      height equals the settled fragment's viewport height (≤2px).
//
//   2. Scrolling mode is unregressed: no placeholder paragraph ever
//      appears, the first article insertion carries NO paginated class,
//      and the visible scrolling body paints (blocks outside the
//      measurement clone).
//
// Recorder mechanics (the cold-load-no-snap.spec.ts precedent): a
// MutationObserver installed via page.addInitScript records the insertion
// timeline from navigation start; the about:blank hop forces a true cold
// navigation so init scripts run on the app origin. The recorder body is
// PLAIN JS — a serialized function must not carry TS-only syntax (the
// 13-01 Deviation-2 lesson: casts would SyntaxError at browser evaluation
// and silently kill the whole recorder). The loading state's own status
// region (a DIV, "Opening article…") is distinguished from the pending
// placeholder by tag: the placeholder is a P[role=status] inside the page
// viewport; the loading region is never an article-surface paint.
//
// Harness reuse (REUSE-DO-NOT-FORK): prepareFreshPage/seedRows from
// tests/e2e/portability/_portability.ts; the mirror-key localStorage
// seeding + PERSISTED record shape from cold-load-no-snap.spec.ts; the
// DEV pagination hook wait from first-paint-progress.spec.ts. Every end
// condition is polled (waitForFunction / expect.poll) — zero fixed sleeps
// (Pitfall 8).
import { test, expect, type Page } from "@playwright/test";
import { BASE, prepareFreshPage, seedRows } from "../portability/_portability";

const FIXTURE = "essay-long-form";
const MIRROR_KEY = "lem-settings-mirror-v1";

/** The persisted scrolling record BOTH truths carry (the cold-load-no-snap
 * SC#1 seed shape — readingMode scrolling is the variant under test; the
 * other fields ride along so the record stays the proven shape). */
const PERSISTED = {
  schemaVersion: 2,
  font: "sans",
  size: 22,
  measure: 72,
  spacing: "spacious",
  theme: "dark",
  readingMode: "scrolling",
};

test.beforeEach(async ({ page }) => {
  await prepareFreshPage(page);
});

/**
 * Install the navigation-start recorder via addInitScript. Records, over
 * the WHOLE insertion timeline:
 *   __firstArticleClass          — class attribute of the FIRST inserted
 *                                  .article-body element.
 *   __mainLockedFirst            — whether the main ancestor hosting that
 *                                  first article carries the paginated
 *                                  main class at insertion time.
 *   __preFragmentVisibleBlocks   — count of [data-block-index] insertions
 *                                  OUTSIDE the measurement clone that land
 *                                  BEFORE the first page fragment (the G4
 *                                  must-not counter).
 *   __sawPlaceholder             — a P[role=status] mounted inside the page
 *                                  viewport while no fragment exists yet.
 *   __placeholderViewportHeight  — that placeholder viewport's box height,
 *                                  captured at insertion (sync layout).
 *   __fragmentViewportHeight     — the first page fragment's viewport box
 *                                  height, captured at insertion.
 *   __sawClassDrop               — any article class mutation that STRIPS
 *                                  the pinned-surface class.
 * `seedMirror` true also seeds the settings mirror into localStorage
 * BEFORE the app bundle runs (the persisted-scrolling cold-load path).
 */
function installRecorder(page: Page, seedMirror: boolean): void {
  const script = `(function () {
  var SEED = ${JSON.stringify(seedMirror)};
  var KEY = ${JSON.stringify(MIRROR_KEY)};
  var VALUE = ${JSON.stringify(JSON.stringify(PERSISTED))};
  var W = window;
  if (SEED) {
    try { localStorage.setItem(KEY, VALUE); } catch (e) { /* best-effort (about:blank hop) */ }
  }
  W.__firstArticleClass = null;
  W.__mainLockedFirst = null;
  W.__preFragmentVisibleBlocks = 0;
  W.__sawPlaceholder = false;
  W.__placeholderViewportHeight = null;
  W.__fragmentViewportHeight = null;
  W.__sawClassDrop = false;
  var sawFragment = false;

  function countVisibleBlocks(n) {
    // Self + descendants, each checked against the measurement clone —
    // nested matches (container blocks) must not hide a visible insertion.
    if (n.matches("[data-block-index]") &&
        n.closest(".article-body-measurement") === null) {
      W.__preFragmentVisibleBlocks++;
    }
    var all = n.querySelectorAll("[data-block-index]");
    for (var k = 0; k < all.length; k++) {
      if (all[k].closest(".article-body-measurement") === null) {
        W.__preFragmentVisibleBlocks++;
      }
    }
  }

  function processAddedNode(n) {
    if (!(n instanceof Element)) return;
    // Fragment flag FIRST: blocks sharing an insertion subtree with the
    // first page fragment belong to the settled paginated surface, not the
    // pre-settlement window under test.
    if (!sawFragment) {
      var frag = n.matches(".page-fragment") ? n : n.querySelector(".page-fragment");
      if (frag) {
        sawFragment = true;
        var fv = frag.closest(".page-viewport");
        if (fv) W.__fragmentViewportHeight = fv.getBoundingClientRect().height;
      }
    }
    // First .article-body: its class + the main that hosts it. The loading
    // state renders no article, so the first article IS the surface swap
    // point under test.
    if (W.__firstArticleClass === null) {
      var art = n.matches(".article-body") ? n : n.querySelector(".article-body");
      if (art) {
        W.__firstArticleClass = art.getAttribute("class");
        var mn = art.closest("main#main");
        W.__mainLockedFirst = mn !== null ? mn.classList.contains("paginated-main") : null;
      }
    }
    // The pending placeholder: a status PARAGRAPH inside the page viewport,
    // before any fragment exists. The loading state's status region is a
    // DIV on a different surface and never matches.
    if (!sawFragment && !W.__sawPlaceholder) {
      var ph = n.matches("p[role=status]") ? n : n.querySelector("p[role=status]");
      if (ph && ph.closest(".page-viewport") !== null) {
        W.__sawPlaceholder = true;
        W.__placeholderViewportHeight = ph.closest(".page-viewport").getBoundingClientRect().height;
      }
    }
    // The G4 must-not counter (only meaningful pre-fragment).
    if (!sawFragment) countVisibleBlocks(n);
  }

  new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var added = muts[i].addedNodes;
      for (var j = 0; j < added.length; j++) processAddedNode(added[j]);
    }
  }).observe(document, { childList: true, subtree: true });

  // A class mutation stripping the pinned-surface class off the article
  // element (the frame must never unlock once the mode is paginated; a
  // fallback flip would do exactly this, disclosed by its banner).
  new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (m.type !== "attribute" || m.attributeName !== "class") continue;
      var t = m.target;
      if (!(t instanceof Element) || t.tagName !== "ARTICLE") continue;
      if (m.oldValue !== null &&
          m.oldValue.indexOf("paginated-surface") !== -1 &&
          !t.classList.contains("paginated-surface")) {
        W.__sawClassDrop = true;
      }
    }
  }).observe(document, {
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ["class"],
    subtree: true,
  });
})();`;
  void page.addInitScript({ content: script });
}

/** Force a FULL navigation (a bare hash change from the library view is a
 * same-document navigation — the app never reloads and init scripts never
 * run). Hopping to about:blank first makes the article goto a true cold
 * load. */
async function coldLoad(page: Page, url: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(url);
}

/** The recorder state, read back after the surface under test settled. */
interface RecorderState {
  firstArticleClass: string | null;
  mainLockedFirst: boolean | null;
  preFragmentVisibleBlocks: number;
  sawPlaceholder: boolean;
  placeholderViewportHeight: number | null;
  fragmentViewportHeight: number | null;
  sawClassDrop: boolean;
}

async function readRecorder(page: Page): Promise<RecorderState> {
  return page.evaluate(() => {
    const W = window as unknown as Record<string, unknown>;
    return {
      firstArticleClass: (W.__firstArticleClass as string | null) ?? null,
      mainLockedFirst: (W.__mainLockedFirst as boolean | null) ?? null,
      preFragmentVisibleBlocks: (W.__preFragmentVisibleBlocks as number) ?? 0,
      sawPlaceholder: (W.__sawPlaceholder as boolean) ?? false,
      placeholderViewportHeight: (W.__placeholderViewportHeight as number | null) ?? null,
      fragmentViewportHeight: (W.__fragmentViewportHeight as number | null) ?? null,
      sawClassDrop: (W.__sawClassDrop as boolean) ?? false,
    };
  });
}

test("paginated cold load: no scroll-then-swap — placeholder frame is the first stable paint", async ({
  page,
}) => {
  // Default settings: paginated is the shipped default — nothing to seed.
  installRecorder(page, false);
  await coldLoad(page, `${BASE}/#/article/${FIXTURE}`);

  // The engine's DEV pagination hook (first-paint-progress openPaginated
  // wait): PaginatedSurface mounted and its first commit landed.
  await page.waitForFunction(
    () =>
      (window as unknown as Record<string, unknown>).__lemPagination !==
      undefined,
    undefined,
    { timeout: 10_000 },
  );
  // Belt: the settled surface (first fragment) is actually in the DOM.
  await page.waitForFunction(
    () => document.querySelector(".page-fragment") !== null,
    undefined,
    { timeout: 10_000 },
  );

  const state = await readRecorder(page);

  // The first article paint IS the paginated frame — the pinned class was
  // present at the article element's first insertion (no plain-body first
  // paint, no class add after the fact).
  expect(
    state.firstArticleClass?.includes("paginated-surface"),
    `first .article-body class must include the pinned surface class, got ${JSON.stringify(state.firstArticleClass)}`,
  ).toBe(true);
  // The article-bearing main locked its paginated geometry from the same
  // first paint (viewport inset + overflow locks never arrive late).
  expect(state.mainLockedFirst, "the article's main must be paginated-locked at first insertion").toBe(true);
  // THE G4 MUST-NOT: zero visible article-block insertions before the
  // first page fragment — the scrolling surface never painted.
  expect(
    state.preFragmentVisibleBlocks,
    "no [data-block-index] may be inserted outside the measurement clone before the first page fragment",
  ).toBe(0);
  // The calm placeholder was observed inside the page viewport.
  expect(state.sawPlaceholder, "the pending status paragraph must appear before the first fragment").toBe(true);
  // The pinned class was never stripped off the article.
  expect(state.sawClassDrop, "the article must never drop the pinned surface class").toBe(false);

  // Frame stability across the placeholder→page-1 transition: the header
  // box right after the pagination hook fires vs. after one settled rAF.
  const header = page.locator("article.article-body > header");
  const before = await header.boundingBox();
  await page.evaluate(
    () =>
      new Promise<null>((resolve) =>
        requestAnimationFrame(() => resolve(null)),
      ),
  );
  const after = await header.boundingBox();
  if (!before || !after) {
    throw new Error(`article header box unavailable: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  }
  expect(Math.abs(before.x - after.x), "header x must not move").toBeLessThanOrEqual(1);
  expect(Math.abs(before.y - after.y), "header y must not move").toBeLessThanOrEqual(1);
  expect(Math.abs(before.width - after.width), "header width must not change").toBeLessThanOrEqual(1);
  expect(Math.abs(before.height - after.height), "header height must not change").toBeLessThanOrEqual(1);

  // The placeholder's viewport height equals the settled fragment's
  // viewport height — the page row never resized at the swap.
  if (state.placeholderViewportHeight === null || state.fragmentViewportHeight === null) {
    throw new Error(
      `viewport heights not recorded: placeholder=${state.placeholderViewportHeight} fragment=${state.fragmentViewportHeight}`,
    );
  }
  expect(
    Math.abs(state.placeholderViewportHeight - state.fragmentViewportHeight),
    "the placeholder viewport and the fragment viewport must be the same box height",
  ).toBeLessThanOrEqual(2);
});

test("scrolling mode: no placeholder, scrolling body paints first", async ({
  page,
}) => {
  // Persisted scrolling settings in BOTH truths (the cold-load-no-snap seed
  // discipline): the Dexie row hydrates, the mirror drives the first paint.
  await seedRows(page, { settings: [{ key: "reader-prefs", value: PERSISTED }] });
  installRecorder(page, true);
  await coldLoad(page, `${BASE}/#/article/${FIXTURE}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Settle: the visible scrolling body's first block is mounted.
  await page.waitForFunction(
    () =>
      document.querySelector(
        ".article-body:not(.article-body-measurement) [data-block-index]",
      ) !== null,
    undefined,
    { timeout: 10_000 },
  );

  const state = await readRecorder(page);

  // No pending placeholder paragraph ever appeared.
  expect(state.sawPlaceholder, "the paginated pending placeholder must never appear in scrolling mode").toBe(false);
  // The first article paint is the scrolling surface — no pinned class.
  expect(
    state.firstArticleClass?.includes("paginated-surface"),
    `first .article-body class must NOT include the pinned surface class in scrolling mode, got ${JSON.stringify(state.firstArticleClass)}`,
  ).toBe(false);
  // The scrolling body painted: visible blocks exist outside the
  // measurement clone (the positive form of the G4 counter).
  expect(
    state.preFragmentVisibleBlocks,
    "visible scrolling-body blocks must be present outside the measurement clone",
  ).toBeGreaterThan(0);
});
