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
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
// Plan 21-06 (D21-14) — the destination-cell machinery below composes the
// shipped seeding/navigation helpers (REUSE-DO-NOT-FORK): the two-context
// portability seeding primitives + the shared Add-dialog driver.
import { openAddDialog } from "./library/add-dialog";
import {
  confidentHighlightOn,
  highlightRow,
  makeArticle,
  seedRows,
} from "./portability/_portability";

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

// ───────────────────────────────────────────────────────────────────────
// Plan 21-06 (D21-14 / ACPT-08): the four-destination matrix arms.
//
// assertEdgeInvariant above stays the READER cell owner — its (a) clause
// (full content reachable via keyboard in BOTH reading modes) is article-
// scoped by construction. The NON-reader destinations (Library, Highlights,
// Add dialog) get assertDestinationInvariant below, which asserts the
// destination-NEUTRAL clauses of the same D6-09 bar:
//   (b) required functions reachable — each destination's canonical
//       controls are present and visible (all are native focusable
//       controls; deep keyboard traversal is exercised by
//       panel-keyboard.spec.ts + focused-add.spec.ts);
//   (c) no layout overflow clips or overlaps content — body + main#main
//       (the non-reader content container; the .article-body variant is
//       reader-scoped inside assertEdgeInvariant).
// Research Open Question 2 (21-RESEARCH.md, adopted): one destination-
// agnostic wrapper asserting (b)+(c) at every destination, (a) stays
// reader-scoped — least new surface, strengthen-only trivially satisfied.
// ONE helper file owns the invariant — extended, never forked (D6-09).

/** The non-reader destinations every edge spec's destination cells cover. */
export type EdgeDestination = "library" | "highlights" | "add-dialog";

/** The destination list edge specs iterate for their destination cells. */
export const DESTINATIONS: readonly EdgeDestination[] = [
  "library",
  "highlights",
  "add-dialog",
];

/**
 * Navigate to a non-reader destination through the REAL UI and settle it,
 * seeding through the existing harness discipline (wipeDatabase ran in the
 * spec's beforeEach; the reload re-mounts so Dexie re-declares its schema
 * against the just-deleted DB before seeding — the 10-03 fix, mirrored from
 * the forced-colors/reduced-motion RECV-01.i cells).
 *
 *  - "library": the #/ surface with one seeded TAGGED article, so the
 *    destination genuinely covers list + views/filters (the tag-filter
 *    chips render only when tags exist — TagFilter returns null on an
 *    empty tag set).
 *  - "highlights": one seeded confident highlight (article + row), then the
 *    shell-nav "Highlights" link (the real navigation path — never a bare
 *    deep link).
 *  - "add-dialog": the library surface, then the "Add to Library" trigger
 *    via the shared idempotent openAddDialog helper (16-03).
 */
export async function openEdgeDestination(
  page: Page,
  destination: EdgeDestination,
): Promise<void> {
  // wipeDatabase's own goto left the app mounted against the deleted DB —
  // reload so Dexie re-declares the schema before any seeding (10-03).
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Saved articles" }),
  ).toBeVisible();
  // Library readiness gate before seeding (the RECV-01.i discipline): the
  // composite list must have actually loaded its rows — the first bundled
  // fixture's title is the deterministic sentinel.
  await expect(
    page.getByText("The looting of science fiction").first(),
  ).toBeVisible();

  if (destination === "library") {
    const article = makeArticle({
      id: "edge-dest-library",
      title: "The Harbor Master's Ledger",
      paragraphs: [
        "The harbor master kept one ledger for the boats and one for the weather, and the pilots' favorite game was guessing which column a fog would be filed under.",
        "She maintained the game was rigged: the weather never signed anything, so every entry in its column was hearsay, and hearsay does not sink.",
      ],
    });
    await seedRows(page, {
      articles: [{ ...article, tags: ["edge-matrix"] }],
    });
    // LibraryView's load effect runs ONCE per mount — reload so the seeded
    // row joins the composite list (the 08-05 openLibrary discipline:
    // page.reload() forces the remount after a Dexie seed).
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
    ).toBeVisible();
    await expect(
      page.getByText("The Harbor Master's Ledger").first(),
    ).toBeVisible();
    return;
  }

  if (destination === "highlights") {
    const article = makeArticle({
      id: "edge-dest-review",
      title: "The Night Cartographer's Notes",
      paragraphs: [
        "The night cartographer drew only what she could hear, which is why the eastern districts are a series of small confident circles and the harbor is one long unbroken shrug.",
        "Her notes explain that bells map themselves, that dogs are unreliable landmarks, and that a streetlamp argues with its neighbors in a dialect of flickers no daylight surveyor has ever recorded.",
      ],
    });
    const anchor = confidentHighlightOn(article);
    await seedRows(page, {
      articles: [article],
      highlights: [
        highlightRow("edge-dest-review", anchor, "hl-edge-dest-review-1"),
      ],
    });
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Highlights" })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Highlights" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Go to highlight:/ }).first(),
    ).toBeVisible();
    return;
  }

  // "add-dialog" — the shared idempotent trigger click (16-03); the dialog
  // always opens on Web address (D16-08).
  await openAddDialog(page);
}

/** Arguments to {@link assertDestinationInvariant}. */
export interface DestinationInvariantOptions {
  /** The non-reader destination under test (used in assertion messages). */
  destination: EdgeDestination;
  /** The edge-condition label, e.g. "forced-colors" (used in messages). */
  condition: string;
}

/**
 * Assert the destination-neutral clauses of the shared D6-09 invariant on
 * the current page (Plan 21-06, D21-14): (b) the destination's canonical
 * required functions are reachable + (c) no layout overflow clips content.
 *
 * MUST be called AFTER openEdgeDestination (or equivalent real-UI
 * navigation) settled the destination. Clause (a) — full article content
 * reachable in both reading modes — is reader-scoped and stays owned by
 * assertEdgeInvariant; it is deliberately NOT asserted here.
 */
export async function assertDestinationInvariant(
  page: Page,
  { destination, condition }: DestinationInvariantOptions,
): Promise<void> {
  const label = `${condition} ${destination}`;

  // Destination identity sentinel — prove the wrapper is asserting on the
  // intended destination before clause (b) means anything.
  const required: Array<{ desc: string; locator: Locator }> = [];
  if (destination === "library") {
    await expect(
      page.getByRole("heading", { level: 1, name: "Saved articles" }),
      `${label}: library h1 missing`,
    ).toBeVisible();
    required.push(
      {
        desc: "Add to Library trigger",
        locator: page.getByRole("button", { name: "Add to Library" }),
      },
      {
        desc: "Library views navigation",
        locator: page.getByRole("navigation", { name: "Library views" }),
      },
      {
        desc: "All view link",
        // The view-switcher links carry live counts ("All (9)") — match by
        // counted-name regex, never exact strings (the 21-05 lesson).
        locator: page.getByRole("link", { name: /^All \(\d+\)$/ }),
      },
      {
        desc: "library searchbox",
        locator: page.getByRole("searchbox", {
          name: "Search your library",
        }),
      },
      {
        desc: "tag filter chip",
        locator: page.locator(".tag-filter .tag-chip").first(),
      },
      {
        desc: "shell-nav Highlights link",
        locator: page
          .getByRole("navigation", { name: "Primary" })
          .getByRole("link", { name: "Highlights" }),
      },
    );
  } else if (destination === "highlights") {
    await expect(
      page.getByRole("heading", { level: 1, name: "Highlights" }),
      `${label}: highlights h1 missing`,
    ).toBeVisible();
    required.push(
      {
        desc: "article filter combobox",
        locator: page.getByRole("combobox", { name: "Article" }),
      },
      {
        desc: "anchor-confidence filter combobox",
        locator: page.getByRole("combobox", { name: "Anchor confidence" }),
      },
      {
        desc: "sort select",
        locator: page.getByRole("combobox", { name: "Sort" }),
      },
      {
        desc: "row jump button",
        locator: page
          .getByRole("button", { name: /^Go to highlight:/ })
          .first(),
      },
      {
        desc: "shell-nav Library link",
        locator: page
          .getByRole("navigation", { name: "Primary" })
          .getByRole("link", { name: "Library" }),
      },
    );
  } else {
    const dlg = page.locator("dialog.add-dialog");
    await expect(dlg, `${label}: add dialog not open`).toBeVisible();
    required.push(
      {
        desc: "Web address radio",
        locator: page.getByRole("radio", { name: "Web address" }),
      },
      {
        desc: "Paste text radio",
        locator: page.getByRole("radio", { name: "Paste text" }),
      },
      {
        desc: "Upload file radio",
        locator: page.getByRole("radio", { name: "Upload file" }),
      },
      {
        desc: "Cancel button",
        locator: page.getByRole("button", { name: "Cancel", exact: true }),
      },
    );
  }

  // (b) Required functions reachable — every canonical control is present
  // and visible (native focusable controls; A11Y-01/02 substrate).
  for (const { desc, locator } of required) {
    await expect(
      locator,
      `${label}: required function unreachable — ${desc}`,
    ).toBeVisible();
  }

  // (c) No layout overflow clips or overlaps content — the WCAG 1.4.10
  // contract lifted from the reader clause, scoped to the destination's
  // content containers: body + main#main (the .article-body variant is
  // reader-scoped inside assertEdgeInvariant). Null-tolerant on main the
  // same way the reader clause is on article.
  const overflow = await page.evaluate(() => {
    const main = document.querySelector("main#main");
    return {
      body: {
        scrollW: document.body.scrollWidth,
        clientW: document.body.clientWidth,
      },
      main: main
        ? { scrollW: main.scrollWidth, clientW: main.clientWidth }
        : null,
    };
  });
  expect(
    overflow.body.scrollW,
    `${label}: body horizontal overflow (scrollW ${overflow.body.scrollW} > clientW ${overflow.body.clientW})`,
  ).toBeLessThanOrEqual(overflow.body.clientW + 1);
  if (overflow.main) {
    expect(
      overflow.main.scrollW,
      `${label}: main#main horizontal overflow (scrollW ${overflow.main.scrollW} > clientW ${overflow.main.clientW})`,
    ).toBeLessThanOrEqual(overflow.main.clientW + 1);
  }
}
