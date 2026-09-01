// tests/e2e/annotations/eligibility-matrix.spec.ts
// ANNO-12 (Phase 19 / D19-01..08) — THE TESTED ELIGIBILITY MATRIX: every
// readable kind as a span endpoint, every crossing class, every interior-gap
// class, and every refusal class, proven with real native selections in real
// browsers. The matrix IS the requirement (Plan 19-05): capture/render
// internals from Plans 19-01..04 are only trustworthy if each cell below is
// green on chromium/firefox/webkit.
//
// CELL INVENTORY (planner-scoped representative cells per 19-RESEARCH
// §Validation Architecture — every KIND, every gap class, every refusal
// class appears at least once; NOT the full cartesian product):
//   ENDPOINT KINDS (scrolling mode; select from inside the kind into the
//   adjacent readable block → ONE record → marks in both blocks):
//     paragraph (essay-long-form; doubles as the cross-two crossing),
//     heading (figure-heavy), quotation-child (essay-long-form blockquote),
//     list-item (list-reference), nested-list-item (nested-list-paths),
//     caption (figure-heavy — the non-empty-alt figure, the Pitfall 1 pair
//     end-to-end), code (technical-post), footnote-reference marker
//     (figure-heavy).
//   CORPUS HONESTY NOTE (verified census at implementation time): the
//   7-fixture corpus's only figures BOTH carry non-empty captions, so the
//   plan's literal "textless figure" gap cell is unreachable without adding
//   a fixture (out of sanctioned scope — a new corpus member would multiply
//   every corpus consumer's cells). The textless-gap MECHANISM (interior
//   text in the D-05 stream renders unmarked) is proven by TWO honest
//   cells: the footnote-reference-marker interior (markers are textless in
//   render) and the unsupported-block interior (zero marks inside the gap
//   element); the figure cell asserts one-identity continuation across the
//   figure with its readable caption marked and ZERO marks on the non-text
//   img portion.
//   CROSSINGS: cross-two (paragraph cell), cross-many (paragraph …
//   blockquote … paragraph, every intermediate marked), item → sibling
//   item, item → following paragraph, quotation-child → paragraph (the
//   quotation cell), caption → paragraph (the caption cell — no fixture
//   places a caption adjacent to code).
//   INTERIOR GAPS (D19-02): footnote-reference markers + unsupported block
//   (textless — render unmarked) and code (READABLE — IS marked, asserted).
//   REFUSALS (D19-05/D19-06): boundary-ineligible (endpoint inside
//   unsupported content — the ONE new string, verbatim), ineligible
//   (endpoint inside a footnote BODY — Pitfall 6), overlap (D19-07,
//   existing string). Cross-page/measurement-body refusal stays green in
//   capture-rejects.spec.ts — not duplicated here.
//   D19-14: a highlight starting at a list item's FIRST character covers
//   text only (never the ::marker chrome) — locator textContent comparison.
//   BACKWARDS DRAG: the same span composed end→start via
//   selection.setBaseAndExtent — same ONE record, same marks.
//   D19-11: the review row for a multi-block span shows NO block-count
//   badge and the first-fragment excerpt with the SINGLE ellipsis character.
//
// No skipped or fixme tests — the plan's anti-pattern guard: a red suite
// must stay red; never silently skip a failing spec to make a gate green.
// 3-engine expectation: chromium/firefox/webkit run every spec via
// playwright.config.ts projects (no engine filtering).
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  wipeDatabase,
  openArticle,
  switchMode,
  visibleBlock,
  countHighlightsInDexie,
  announcementRegion,
} from "./_fixtures";

// The corpus members the cells address (FIXTURES order-independent — cells
// name their fixture explicitly; ids verified against fixtures-matrix.ts).
const ESSAY = "essay-long-form";
const FIGURES = "figure-heavy";
const LISTS = "list-reference";
const NESTED = "nested-list-paths";
const TECH = "technical-post";
const UNSUPPORTED = "unsupported-case";

test.beforeEach(async ({ page }) => {
  await wipeDatabase(page);
});

/** One span endpoint: the top-level block index (data-block-index), a
 * CHARACTER offset into the endpoint scope's concatenated text nodes, and
 * an optional list-item selector (`blockEl.querySelectorAll("li")[li]` in
 * document order — covers nested items at every depth) when the endpoint
 * must sit inside a specific item rather than at the list's own text
 * offset. The production capture path resolves the block ancestor +
 * computes the raw offset from the BLOCK element, so item scoping here only
 * places the DOM caret — never forks offset math. */
interface SpanEndpoint {
  block: number;
  offset: number;
  li?: number;
}

/**
 * Select a cross-block span via a native DOM selection (the
 * selectRangeInBlock discipline, generalized to two endpoints in different
 * blocks). The Range the capture path reads normalizes to document order
 * regardless of anchor/focus direction; `backwards` composes the SAME span
 * with the anchors swapped (selection.setBaseAndExtent — the D19/Pitfall 9
 * backwards-drag cell). Returns false when an endpoint could not be placed
 * (the caller treats that as test setup failure, never a skip).
 */
async function selectSpan(
  page: Page,
  a: SpanEndpoint,
  b: SpanEndpoint,
  backwards = false,
): Promise<boolean> {
  return page.evaluate(
    ({ a, b, backwards }) => {
      const visibleBlockFor = (idx: number): HTMLElement | null => {
        const candidates = Array.from(
          document.querySelectorAll(`[data-block-index="${idx}"]`),
        );
        const el = candidates.find(
          (c) => (c as HTMLElement).closest(".article-body-measurement") === null,
        );
        return (el as HTMLElement) ?? null;
      };
      // The endpoint scope for an endpoint spec (block element, optionally
      // narrowed to its li[ep.li] descendant in document order).
      const scopeFor = (
        ep: { block: number; li?: number },
      ): HTMLElement | null => {
        const blockEl = visibleBlockFor(ep.block);
        if (!blockEl) return null;
        if (ep.li !== undefined) {
          const li = blockEl.querySelectorAll("li")[ep.li];
          if (!li) return null;
          return li as HTMLElement;
        }
        return blockEl;
      };
      // Scroll BOTH endpoint scopes into view BEFORE selecting: the toolbar
      // is position:fixed, computed from the selection's viewport rect, and
      // a selection below the fold mounts the toolbar outside the viewport
      // (unclickable). Scrolling first keeps every mid/late-article cell's
      // toolbar reachable.
      const scopeA = scopeFor(a);
      const scopeB = scopeFor(b);
      if (!scopeA || !scopeB) return false;
      scopeA.scrollIntoView({ block: "center" });
      scopeB.scrollIntoView({ block: "center" });
      const resolvePoint = (
        scope: HTMLElement,
        ep: { offset: number },
      ): { node: Text; offset: number } | null => {
        const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
        const texts: { node: Text; start: number; end: number }[] = [];
        let cursor = 0;
        let n = walker.nextNode() as Text | null;
        while (n) {
          const len = n.nodeValue?.length ?? 0;
          texts.push({ node: n, start: cursor, end: cursor + len });
          cursor += len;
          n = walker.nextNode() as Text | null;
        }
        if (texts.length === 0) return null;
        const hit =
          texts.find((t) => ep.offset >= t.start && ep.offset < t.end) ??
          texts[texts.length - 1]!;
        const local = Math.max(0, Math.min(ep.offset - hit.start, hit.end - hit.start));
        return { node: hit.node, offset: local };
      };
      const pa = resolvePoint(scopeA, a);
      const pb = resolvePoint(scopeB, b);
      if (!pa || !pb) return false;
      const sel = window.getSelection();
      if (!sel) return false;
      if (backwards) {
        sel.setBaseAndExtent(pb.node, pb.offset, pa.node, pa.offset);
      } else {
        sel.setBaseAndExtent(pa.node, pa.offset, pb.node, pb.offset);
      }
      return sel.rangeCount > 0 && !sel.isCollapsed;
    },
    { a, b, backwards },
  );
}

/** Open the fixture in SCROLLING mode (the whole article body mounts —
 * every block is addressable without page walks). */
async function openScrolling(page: Page, fixtureId: string): Promise<void> {
  await openArticle(page, fixtureId);
  await switchMode(page);
}

/** Click the toolbar Highlight action + return the created highlight id. */
async function createSpanViaToolbar(page: Page): Promise<string> {
  const toolbar = page.locator(".selection-toolbar");
  await expect(toolbar).toBeVisible();
  await toolbar
    .getByRole("button", { name: "Highlight", exact: true })
    .click();
  await expect(announcementRegion(page)).toContainText(/Highlight saved/i);
  const id = await page
    .locator("mark.highlight")
    .first()
    .getAttribute("data-highlight-id");
  expect(id, "created mark carries data-highlight-id").toBeTruthy();
  return id!;
}

/** Assert the span mark renders inside the given block under one id.
 * `.first()` — a span crossing a container block (list/blockquote) renders
 * one mark PER readable child, all sharing the id (D5-16 discipline). */
async function expectMarkInBlock(
  page: Page,
  id: string,
  blockIndex: number,
  message: string,
): Promise<void> {
  await expect(
    visibleBlock(page, blockIndex)
      .locator(`mark.highlight[data-highlight-id="${id}"]`)
      .first(),
    message,
  ).toBeVisible();
}

test.describe("ANNO-12 eligibility matrix — endpoint kinds (D19-01)", () => {
  test("endpoint kind paragraph: span paragraph → next paragraph captures ONE record + marks BOTH blocks (cross-two)", async ({
    page,
  }) => {
    await openScrolling(page, ESSAY);
    const ok = await selectSpan(
      page,
      { block: 0, offset: 5 },
      { block: 1, offset: 14 },
    );
    expect(ok, "paragraph → paragraph selection placed").toBeTruthy();
    const id = await createSpanViaToolbar(page);
    expect(await countHighlightsInDexie(page, ESSAY)).toBe(1);
    await expectMarkInBlock(page, id, 0, "mark in the START paragraph");
    await expectMarkInBlock(page, id, 1, "mark in the END paragraph");
  });

  test("endpoint kind heading: span heading → following paragraph captures ONE record + marks BOTH blocks", async ({
    page,
  }) => {
    // figure-heavy block 7 = h2 "Morphology"; block 8 = body paragraph.
    await openScrolling(page, FIGURES);
    const ok = await selectSpan(
      page,
      { block: 7, offset: 3 },
      { block: 8, offset: 12 },
    );
    expect(ok, "heading → paragraph selection placed").toBeTruthy();
    const id = await createSpanViaToolbar(page);
    expect(await countHighlightsInDexie(page, FIGURES)).toBe(1);
    await expectMarkInBlock(page, id, 7, "mark in the heading");
    await expectMarkInBlock(page, id, 8, "mark in the following paragraph");
  });

  test("endpoint kind quotation-child: span blockquote child → paragraph captures ONE record + marks BOTH blocks", async ({
    page,
  }) => {
    // essay-long-form block 3 = the corpus's blockquote (verified census —
    // the blockquote-bearing fixture); block 4 = the following paragraph.
    await openScrolling(page, ESSAY);
    const ok = await selectSpan(
      page,
      { block: 3, offset: 4 },
      { block: 4, offset: 12 },
    );
    expect(ok, "quotation-child → paragraph selection placed").toBeTruthy();
    const id = await createSpanViaToolbar(page);
    expect(await countHighlightsInDexie(page, ESSAY)).toBe(1);
    await expectMarkInBlock(page, id, 3, "mark in the blockquote child");
    await expectMarkInBlock(page, id, 4, "mark in the paragraph");
  });

  test("endpoint kind list-item: span numbered-list item → preceding paragraph captures ONE record + marks BOTH blocks", async ({
    page,
  }) => {
    // list-reference block 3 = numbered-list (item 0 = "Association: …");
    // the adjacent paragraph is block 2 (before the list — endpoint
    // composition is direction-symmetric; the backwards cell proves it).
    await openScrolling(page, LISTS);
    const ok = await selectSpan(
      page,
      { block: 2, offset: 10 },
      { block: 3, offset: 6, li: 0 },
    );
    expect(ok, "paragraph → list-item selection placed").toBeTruthy();
    const id = await createSpanViaToolbar(page);
    expect(await countHighlightsInDexie(page, LISTS)).toBe(1);
    await expectMarkInBlock(page, id, 2, "mark in the paragraph");
    await expectMarkInBlock(page, id, 3, "mark in the list item");
  });

  test("endpoint kind nested-list-item: span a NESTED item → following paragraph captures ONE record + marks BOTH blocks", async ({
    page,
    }) => {
    // nested-list-paths block 2 = the 3-level bulleted list.
    // querySelectorAll("li") document order: [2] = the first NESTED item
    // ("The first nested item, which itself opens a numbered sequence:").
    // Block 3 = "Reading-order guarantees…" paragraph.
    await openScrolling(page, NESTED);
    const ok = await selectSpan(
      page,
      { block: 2, offset: 8, li: 2 },
      { block: 3, offset: 12 },
    );
    expect(ok, "nested-item → paragraph selection placed").toBeTruthy();
    const id = await createSpanViaToolbar(page);
    expect(await countHighlightsInDexie(page, NESTED)).toBe(1);
    await expectMarkInBlock(page, id, 2, "mark in the nested list item");
    await expectMarkInBlock(page, id, 3, "mark in the paragraph");
  });

  test("endpoint kind caption: span figcaption → following paragraph captures ONE record + marks BOTH blocks (Pitfall 1 pair)", async ({
    page,
  }) => {
    // figure-heavy block 4 = the NON-EMPTY-alt figure (alt + caption both
    // present — the alignment-fix pair proven end-to-end); block 5 = the
    // following paragraph.
    await openScrolling(page, FIGURES);
    const ok = await selectSpan(
      page,
      { block: 4, offset: 5 },
      { block: 5, offset: 12 },
    );
    expect(ok, "figcaption → paragraph selection placed").toBeTruthy();
    const id = await createSpanViaToolbar(page);
    expect(await countHighlightsInDexie(page, FIGURES)).toBe(1);
    // The caption endpoint's mark renders INSIDE the figcaption.
    await expect(
      visibleBlock(page, 4)
        .locator("figcaption")
        .locator(`mark.highlight[data-highlight-id="${id}"]`),
      "mark inside the figcaption",
    ).toBeVisible();
    await expectMarkInBlock(page, id, 5, "mark in the paragraph");
  });

  test("endpoint kind code: span code block → preceding paragraph captures ONE record + marks BOTH blocks", async ({
    page,
  }) => {
    // technical-post block 8 = code-block; the adjacent paragraph is block
    // 7 (before it). The code mark renders inside the <pre><code>.
    await openScrolling(page, TECH);
    const ok = await selectSpan(
      page,
      { block: 7, offset: 10 },
      { block: 8, offset: 12 },
    );
    expect(ok, "paragraph → code selection placed").toBeTruthy();
    const id = await createSpanViaToolbar(page);
    expect(await countHighlightsInDexie(page, TECH)).toBe(1);
    await expectMarkInBlock(page, id, 7, "mark in the paragraph");
    await expect(
      visibleBlock(page, 8)
        .locator("code")
        .locator(`mark.highlight[data-highlight-id="${id}"]`),
      "mark inside the code block",
    ).toBeVisible();
  });

  test("endpoint kind footnote-reference marker: span marker → paragraph captures ONE record; the marker itself renders unmarked", async ({
    page,
  }) => {
    // figure-heavy block 1 = the "[1]" footnote-REFERENCE marker (the
    // eligible "footnote" kind per D5-07/Pitfall 6); block 0 = the
    // preceding paragraph. 19-03's shipped render coverage keeps reference
    // markers unmarked (they are 3-grapheme chrome; the readable footnote
    // destination is the body, which is an ineligible BOUNDARY) — so the
    // honest assertion set is: ONE record + mark in the paragraph + ZERO
    // marks inside the marker element.
    await openScrolling(page, FIGURES);
    const ok = await selectSpan(
      page,
      { block: 0, offset: 10 },
      { block: 1, offset: 1 },
    );
    expect(ok, "paragraph → footnote-reference selection placed").toBeTruthy();
    const id = await createSpanViaToolbar(page);
    expect(await countHighlightsInDexie(page, FIGURES)).toBe(1);
    await expectMarkInBlock(page, id, 0, "mark in the paragraph");
    await expect(
      visibleBlock(page, 1).locator("mark.highlight"),
      "footnote-reference marker renders NO mark (19-03 coverage boundary)",
    ).toHaveCount(0);
  });
});

test.describe("ANNO-12 eligibility matrix — crossings (D19-01/D19-03)", () => {
  test("crossing cross-many: paragraph … blockquote … paragraph marks EVERY intermediate block with ONE identity", async ({
    page,
  }) => {
    // essay-long-form blocks 2 → 4 cross the blockquote at 3: the
    // intermediate blockquote child renders a mark sharing the span id.
    await openScrolling(page, ESSAY);
    const ok = await selectSpan(
      page,
      { block: 2, offset: 8 },
      { block: 4, offset: 10 },
    );
    expect(ok, "cross-many selection placed").toBeTruthy();
    const id = await createSpanViaToolbar(page);
    expect(await countHighlightsInDexie(page, ESSAY)).toBe(1);
    await expectMarkInBlock(page, id, 2, "mark in the start paragraph");
    await expectMarkInBlock(page, id, 3, "INTERMEDIATE blockquote marked");
    await expectMarkInBlock(page, id, 4, "mark in the end paragraph");
  });

  test("crossing item → sibling item: span between two items of ONE list captures ONE record + marks both items", async ({
    page,
  }) => {
    // nested-list-paths block 2: outer li [0] ("Flat items with a link
    // mid-item…") → outer li [1] ("A second item that opens a nested…").
    await openScrolling(page, NESTED);
    const ok = await selectSpan(
      page,
      { block: 2, offset: 6, li: 0 },
      { block: 2, offset: 8, li: 1 },
    );
    expect(ok, "item → sibling item selection placed").toBeTruthy();
    const id = await createSpanViaToolbar(page);
    expect(await countHighlightsInDexie(page, NESTED)).toBe(1);
    const placement = await visibleBlock(page, 2).evaluate(
      (listEl, hlId) => {
        const inLi = (i: number) => {
          // D21-15: the item is extracted to its own line — a member
          // access split across lines trips no-unexpected-multiline.
          const item = listEl.querySelectorAll("li")[i]!;
          return (
            item.querySelector(
              `mark.highlight[data-highlight-id="${hlId}"]`,
            ) !== null
          );
        };
        return { first: inLi(0), sibling: inLi(1) };
      },
      id,
    );
    expect(placement.first, "mark in the first item").toBeTruthy();
    expect(placement.sibling, "mark in the sibling item").toBeTruthy();
  });

  test("crossing item → following paragraph: span top-level item → next paragraph captures ONE record + marks both", async ({
    page,
  }) => {
    await openScrolling(page, NESTED);
    const ok = await selectSpan(
      page,
      { block: 2, offset: 6, li: 0 },
      { block: 3, offset: 12 },
    );
    expect(ok, "item → paragraph selection placed").toBeTruthy();
    const id = await createSpanViaToolbar(page);
    expect(await countHighlightsInDexie(page, NESTED)).toBe(1);
    await expectMarkInBlock(page, id, 2, "mark in the list item");
    await expectMarkInBlock(page, id, 3, "mark in the following paragraph");
  });
});

test.describe("ANNO-12 eligibility matrix — interior gaps (D19-02)", () => {
  test("interior gap textless: footnote-reference markers between paragraphs render UNMARKED; marks on both sides, ONE record", async ({
    page,
  }) => {
    // figure-heavy blocks 0 → 3 cross the "[1]" + "[2]" markers (blocks
    // 1–2). The markers' text participates in the D-05 stream (interior to
    // the global range) but reference markers render no marks — the
    // genuine textless-gap mechanism, no captioned-figure caveat.
    await openScrolling(page, FIGURES);
    const ok = await selectSpan(
      page,
      { block: 0, offset: 10 },
      { block: 3, offset: 12 },
    );
    expect(ok, "paragraph → paragraph across markers selection placed").toBeTruthy();
    const id = await createSpanViaToolbar(page);
    expect(await countHighlightsInDexie(page, FIGURES)).toBe(1);
    await expectMarkInBlock(page, id, 0, "mark on the near side of the gap");
    await expectMarkInBlock(page, id, 3, "mark on the far side of the gap");
    await expect(
      visibleBlock(page, 1).locator("mark.highlight"),
      "zero marks inside the first marker",
    ).toHaveCount(0);
    await expect(
      visibleBlock(page, 2).locator("mark.highlight"),
      "zero marks inside the second marker",
    ).toHaveCount(0);
  });

  test("interior gap figure: paragraph → paragraph across a figure continues ONE identity; caption marks; ZERO marks on the non-text img portion", async ({
    page,
  }) => {
    // figure-heavy blocks 3 → 5 cross figure 4. Corpus honesty (census
    // verified): both corpus figures carry captions, so the literal
    // "textless figure" cell is unreachable; this cell proves the figure
    // gap contract instead — one identity across the gap, the READABLE
    // interior (caption) marks per D19-01 render coverage, and the
    // non-text portion (img/alt surface) never carries a mark.
    await openScrolling(page, FIGURES);
    const ok = await selectSpan(
      page,
      { block: 3, offset: 8 },
      { block: 5, offset: 12 },
    );
    expect(ok, "paragraph → paragraph across figure selection placed").toBeTruthy();
    const id = await createSpanViaToolbar(page);
    expect(await countHighlightsInDexie(page, FIGURES)).toBe(1);
    await expectMarkInBlock(page, id, 3, "mark on the near side of the figure");
    await expectMarkInBlock(page, id, 5, "mark on the far side of the figure");
    const figureEl = visibleBlock(page, 4);
    await expect(
      figureEl.locator(`mark.highlight[data-highlight-id="${id}"]`),
      "the readable caption interior marks",
    ).toBeVisible();
    // Every mark inside the figure lives in the figcaption — the img
    // (alt) surface renders zero marks ever (D19-02 gap by construction).
    const marksInFigure = await figureEl.locator("mark.highlight").count();
    const marksInCaption = await figureEl
      .locator("figcaption mark.highlight")
      .count();
    expect(marksInFigure).toBe(marksInCaption);
    expect(marksInCaption).toBeGreaterThan(0);
  });

  test("interior gap unsupported: paragraph → paragraph across an unsupported block renders the gap UNMARKED; readable intermediates marked", async ({
    page,
  }) => {
    // unsupported-case blocks 3 → 8 cross the unsupported table (4), a
    // code block (5), a heading (6), and a numbered list (7). D19-02: the
    // span continues across the gap as ONE identity; the unsupported
    // element renders ZERO marks; the readable intermediates DO mark.
    await openScrolling(page, UNSUPPORTED);
    const ok = await selectSpan(
      page,
      { block: 3, offset: 8 },
      { block: 8, offset: 12 },
    );
    expect(ok, "paragraph → paragraph across unsupported selection placed").toBeTruthy();
    const id = await createSpanViaToolbar(page);
    expect(await countHighlightsInDexie(page, UNSUPPORTED)).toBe(1);
    await expectMarkInBlock(page, id, 3, "mark on the near side of the gap");
    await expectMarkInBlock(page, id, 8, "mark on the far side of the gap");
    await expect(
      visibleBlock(page, 4).locator("mark.highlight"),
      "zero marks inside the unsupported element",
    ).toHaveCount(0);
    await expectMarkInBlock(page, id, 5, "readable intermediate code block marked");
    await expectMarkInBlock(page, id, 6, "readable intermediate heading marked");
    await expectMarkInBlock(page, id, 7, "readable intermediate list marked");
  });

  test("interior gap code IS marked: paragraph → paragraph across a code block asserts the code mark (distinct from textless gaps)", async ({
    page,
  }) => {
    // technical-post blocks 7 → 10 cross code 8 + heading 9. Code is
    // READABLE text — its interior marks (D19-01), unlike textless gaps.
    await openScrolling(page, TECH);
    const ok = await selectSpan(
      page,
      { block: 7, offset: 10 },
      { block: 10, offset: 12 },
    );
    expect(ok, "paragraph → paragraph across code selection placed").toBeTruthy();
    const id = await createSpanViaToolbar(page);
    expect(await countHighlightsInDexie(page, TECH)).toBe(1);
    await expectMarkInBlock(page, id, 7, "mark on the near side of the code");
    await expect(
      visibleBlock(page, 8)
        .locator("code")
        .locator(`mark.highlight[data-highlight-id="${id}"]`),
      "the CODE interior IS marked (readable gap)",
    ).toBeVisible();
    await expectMarkInBlock(page, id, 10, "mark on the far side of the code");
  });
});

test.describe("ANNO-12 eligibility matrix — refusals (D19-05/D19-06/D19-07)", () => {
  test("refusal boundary-ineligible: an endpoint inside unsupported content refuses the WHOLE selection with the exact hint + NO record", async ({
    page,
  }) => {
    await openScrolling(page, UNSUPPORTED);
    // Endpoint INSIDE the unsupported block (4) → paragraph 8.
    let ok = await selectSpan(
      page,
      { block: 4, offset: 12 },
      { block: 8, offset: 12 },
    );
    expect(ok, "unsupported → paragraph selection placed").toBeTruthy();
    const toolbar = page.locator(".selection-toolbar");
    await expect(toolbar).toBeVisible();
    // The ONE new reader-facing string, VERBATIM (19-UI-SPEC
    // §Copywriting — the e2e anchor).
    await expect(toolbar).toContainText(
      "This selection includes content that can't be highlighted.",
    );
    await expect(
      toolbar.getByRole("button", { name: "Highlight", exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("h");
    await page.waitForTimeout(200);
    expect(
      await countHighlightsInDexie(page, UNSUPPORTED),
      "no record created on boundary-ineligible refusal",
    ).toBe(0);
    // Either endpoint suffices — paragraph → unsupported refuses identically.
    ok = await selectSpan(
      page,
      { block: 3, offset: 8 },
      { block: 4, offset: 12 },
    );
    expect(ok, "paragraph → unsupported selection placed").toBeTruthy();
    await expect(toolbar).toBeVisible();
    await expect(toolbar).toContainText(
      "This selection includes content that can't be highlighted.",
    );
    await expect(
      toolbar.getByRole("button", { name: "Highlight", exact: true }),
    ).toHaveCount(0);
    expect(await countHighlightsInDexie(page, UNSUPPORTED)).toBe(0);
  });

  test("refusal ineligible: an endpoint inside a footnote BODY refuses with the existing ineligible hint + NO record (Pitfall 6)", async ({
    page,
  }) => {
    await openScrolling(page, FIGURES);
    // Footnote bodies render as <li id="fn-…"> WITHOUT data-block-index —
    // the ancestor walk terminates at the reading root → "ineligible".
    const tried = await page.evaluate(() => {
      const para = Array.from(
        document.querySelectorAll('[data-block-index="0"]'),
      ).find((el) => el.closest(".article-body-measurement") === null) as
        | HTMLElement
        | undefined;
      const body = document.querySelector(
        'section[aria-label="Footnotes"] li',
      ) as HTMLElement | null;
      if (!para || !body) return false;
      const pWalker = document.createTreeWalker(para, NodeFilter.SHOW_TEXT);
      const pNode = pWalker.nextNode() as Text | null;
      const bWalker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      const bNode = bWalker.nextNode() as Text | null;
      if (!pNode || !bNode) return false;
      // Keep the toolbar (position:fixed off the selection rect) clickable.
      para.scrollIntoView({ block: "center" });
      const sel = window.getSelection();
      if (!sel) return false;
      sel.setBaseAndExtent(pNode, 10, bNode, 6);
      return sel.rangeCount > 0 && !sel.isCollapsed;
    });
    expect(tried, "paragraph → footnote-body selection placed").toBeTruthy();
    const toolbar = page.locator(".selection-toolbar");
    await expect(toolbar).toBeVisible();
    await expect(toolbar).toContainText("Select readable text to highlight it.");
    await expect(
      toolbar.getByRole("button", { name: "Highlight", exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("h");
    await page.waitForTimeout(200);
    expect(
      await countHighlightsInDexie(page, FIGURES),
      "no record created on footnote-body refusal",
    ).toBe(0);
  });

  test("refusal overlap: a span overlapping an existing highlight refuses with the existing overlap hint (D19-07)", async ({
    page,
  }) => {
    await openScrolling(page, ESSAY);
    // An existing single-block highlight on block 5…
    let ok = await selectSpan(
      page,
      { block: 5, offset: 0 },
      { block: 5, offset: 20 },
    );
    expect(ok, "first single-block selection placed").toBeTruthy();
    await createSpanViaToolbar(page);
    expect(await countHighlightsInDexie(page, ESSAY)).toBe(1);
    // …then a span from INSIDE it into the next block — the global ranges
    // intersect, so the whole span refuses (one policy, one string).
    ok = await selectSpan(
      page,
      { block: 5, offset: 10 },
      { block: 6, offset: 12 },
    );
    expect(ok, "overlapping span selection placed").toBeTruthy();
    const toolbar = page.locator(".selection-toolbar");
    await expect(toolbar).toBeVisible();
    await expect(toolbar).toContainText("This overlaps an existing highlight.");
    await expect(
      toolbar.getByRole("button", { name: "Highlight", exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press("h");
    await page.waitForTimeout(200);
    expect(
      await countHighlightsInDexie(page, ESSAY),
      "no second record created on overlapping span",
    ).toBe(1);
  });
});

test.describe("ANNO-12 eligibility matrix — D19-14 marker exclusion", () => {
  test("D19-14: a highlight starting at a list item's FIRST character covers text only — the first marked character is the item's first text character", async ({
    page,
  }) => {
    // list-reference block 3 = NUMBERED list (the strongest marker case —
    // "1." start-attribute chrome). Span from item 0's character 0 INTO
    // item 2 (the span must extend INTO the item — an end endpoint at the
    // item's char 0 composes to the list block's start boundary, which
    // renders nothing): the item-side mark's textContent must equal the
    // item's own textContent (no marker, no leading whitespace).
    await openScrolling(page, LISTS);
    const ok = await selectSpan(
      page,
      { block: 3, offset: 0, li: 0 },
      { block: 3, offset: 10, li: 2 },
    );
    expect(ok, "paragraph → item-character-0 selection placed").toBeTruthy();
    const id = await createSpanViaToolbar(page);
    expect(await countHighlightsInDexie(page, LISTS)).toBe(1);
    const matches = await visibleBlock(page, 3).evaluate(
      (listEl, hlId) => {
        const li = listEl.querySelectorAll("li")[0]!;
        const mark = li.querySelector(
          `mark.highlight[data-highlight-id="${hlId}"]`,
        );
        if (!mark) return { placed: false };
        const markText = mark.textContent ?? "";
        const liText = li.textContent ?? "";
        return {
          placed: true,
          equal: markText === liText,
          startsClean: markText.length > 0 && !/^[\s•‣\-–\d.]/.test(markText),
          firstChars: markText.slice(0, 12),
          liFirstChars: liText.slice(0, 12),
        };
      },
      id,
    );
    expect(matches.placed, "mark placed inside the first item").toBeTruthy();
    expect(
      matches.equal,
      `mark text === item text (mark="${matches.firstChars}" li="${matches.liFirstChars}")`,
    ).toBeTruthy();
    expect(
      matches.startsClean,
      "the first marked character is the item's first TEXT character (D19-14)",
    ).toBeTruthy();
  });
});

test.describe("ANNO-12 eligibility matrix — backwards drag (Pitfall 9)", () => {
  test("backwards drag: composing the same span end→start (setBaseAndExtent) yields the SAME one record + marks in both blocks", async ({
    page,
  }) => {
    await openScrolling(page, ESSAY);
    const ok = await selectSpan(
      page,
      { block: 0, offset: 6 },
      { block: 1, offset: 14 },
      true, // anchor = the END endpoint, focus = the START endpoint
    );
    expect(ok, "backwards (end→start) selection placed").toBeTruthy();
    const id = await createSpanViaToolbar(page);
    expect(await countHighlightsInDexie(page, ESSAY)).toBe(1);
    await expectMarkInBlock(page, id, 0, "backwards span marks the START block");
    await expectMarkInBlock(page, id, 1, "backwards span marks the END block");
  });
});

test.describe("ANNO-12 eligibility matrix — D19-11 review row shape", () => {
  test("D19-11: the review row for a multi-block span shows NO block-count badge + the first-fragment excerpt with the SINGLE ellipsis", async ({
    page,
  }) => {
    // Two spans in two articles: (a) essay block 0 → 1 (a PROSE span whose
    // first fragment exceeds the 120-char cap — cap + continuation
    // collapse to exactly ONE ellipsis); (b) figure-heavy marker →
    // paragraph (a span whose first fragment "[1]" is WITHIN the cap — the
    // clean continuation ellipsis).
    await openScrolling(page, ESSAY);
    let ok = await selectSpan(
      page,
      { block: 0, offset: 0 },
      { block: 1, offset: 14 },
    );
    expect(ok, "essay prose span placed").toBeTruthy();
    await createSpanViaToolbar(page);
    await openScrolling(page, FIGURES);
    ok = await selectSpan(
      page,
      { block: 1, offset: 0 },
      { block: 3, offset: 12 },
    );
    expect(ok, "figure marker span placed").toBeTruthy();
    await createSpanViaToolbar(page);

    // The Highlights review (#/highlights since 15-01).
    await page.goto("http://localhost:5173/#/highlights");
    await expect(
      page.getByRole("heading", { level: 1, name: "Highlights" }),
    ).toBeVisible();
    const rows = page.locator("button.review-row");
    await expect(rows).toHaveCount(2);
    // D19-11: NO block-count badge — confident rows carry NO badge element
    // and no "×N blocks" vocabulary anywhere.
    await expect(page.locator(".review-badge")).toHaveCount(0);
    await expect(rows.filter({ hasText: /\d+\s+blocks?/i })).toHaveCount(0);
    // The prose row: first-fragment excerpt — starts at the article's
    // opening words, ends with the SINGLE U+2026 (never three dots).
    const proseQuote = page.locator(".review-quote").filter({
      hasText: /In January/,
    });
    await expect(proseQuote).toHaveCount(1);
    const proseText = (await proseQuote.textContent()) ?? "";
    expect(proseText.startsWith("In January")).toBeTruthy();
    expect(proseText.endsWith("\u2026")).toBeTruthy();
    expect(proseText.endsWith("\u2026\u2026")).toBeFalsy();
    expect(proseText.endsWith("...")).toBeFalsy();
    // The marker row: first fragment "[1]" + the single ellipsis, exactly.
    const markerQuote = page.locator(".review-quote").filter({
      hasText: /^\[1\]/,
    });
    await expect(markerQuote).toHaveCount(1);
    expect((await markerQuote.textContent()) ?? "").toBe("[1]\u2026");
    // The jump affordance's accessible name carries the same first-fragment
    // excerpt (aria derives through the ONE helper — 19-02).
    await expect(rows.filter({ hasText: /\[1\]/ })).toHaveCount(1);
    const markerRow = rows.filter({ hasText: /\[1\]/ });
    await expect(markerRow).toHaveAttribute(
      "aria-label",
      /^Go to highlight: \[1\]\u2026/,
    );
  });
});
