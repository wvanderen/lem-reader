// Issue #234 — the shared container projection seam (unit seams).
//
// resolveBlockSlice resolves ONE block at an intra-block D-05 range for
// EVERY consumer: the paginated fragment renderer's page entries, the
// windowed measurement projection's boundary blocks, and (through them)
// every ordered continuation of a giant list or quotation. The seam pins
// what a continuation slice must preserve: block semantics (blockquote /
// list kinds), nested markup, links/emphasis, and — the #234 rule —
// ORDERED-LIST NUMBERING that continues across cuts, because a continuation
// window opening mid-list renders its first item at its original ordinal.
//
// The companion raw-prefix walker (blockRawPrefixUtf16) mirrors the SAME
// slicing: it reports exactly the raw UTF-16 text a projection renders away
// for a slice origin, so the pagination engine can rebase slice-local line
// boxes onto whole-block coordinates (the #233 rebase rule, generalized to
// containers). ASCII fixtures keep graphemes == characters so expectations
// are string arithmetic, never a re-run of the implementation under test.
// Expected item ordinals come from the canonical normalization walker
// (blockNormalizedText + graphemeClusters) — the D-05 substrate itself.
import { describe, expect, it } from "vitest";
import type { Block } from "../../../src/content/types";
import { ArticleSchema } from "../../../src/content/schema";
import {
  articleGraphemeIndex,
  blockNormalizedText,
  graphemeClusters,
  inlineText,
} from "../../../src/content/normalizeText";
import {
  blockRawPrefixUtf16,
  blockRawText,
  resolveBlockSlice,
} from "../../../src/pagination/splitBlock";
import { giantListArticle, giantQuoteArticle } from "../../fixtures/giantContainers";

const LANG = "en";
const SEPARATOR = 1; // BLOCK_SEPARATOR graphemes between adjacent children

/** Cumulative D-05 lengths of a container's items/children, derived ONLY
 * from the canonical normalization walker — the shared expected-value
 * source for every cut arithmetic in this file. */
function childLengths(blocks: Block[]): number[] {
  return blocks.map((child) => graphemeClusters(blockNormalizedText(child), LANG).length);
}

/** The index of the first item/child whose extent reaches past `offset`. */
function childAt(offsets: number[], offset: number): number {
  let consumed = 0;
  for (let i = 0; i < offsets.length; i++) {
    if (offset < consumed + offsets[i]!) return i;
    consumed += offsets[i]! + SEPARATOR;
  }
  return offsets.length - 1;
}

function numberedFixture() {
  return ArticleSchema.parse({
    id: "numbered-projection",
    revision: 1,
    lang: LANG,
    provenance: {
      title: "Numbered projection",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: "numbered-projection-v1",
    },
    blocks: [
      {
        kind: "numbered-list",
        start: 5,
        items: Array.from({ length: 8 }, (_, n) => ({
          content: [
            {
              kind: "paragraph",
              content: [{ text: `Point ${n} of the ordered argument. `, marks: [] }],
            },
          ],
        })),
      },
    ],
  }) as { blocks: Block[] };
}

function nestedQuoteFixture() {
  return ArticleSchema.parse({
    id: "nested-quote-projection",
    revision: 1,
    lang: LANG,
    provenance: {
      title: "Nested quote projection",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: "nested-quote-projection-v1",
    },
    blocks: [
      {
        kind: "blockquote",
        children: [
          { kind: "paragraph", content: [{ text: "Outer opening passage. ", marks: [] }] },
          {
            kind: "blockquote",
            children: [
              {
                kind: "paragraph",
                content: [{ text: "Inner witness passage. ", marks: [{ type: "strong" }] }],
              },
            ],
          },
          { kind: "paragraph", content: [{ text: "Outer closing passage. ", marks: [] }] },
        ],
      },
    ],
  }) as { blocks: Block[] };
}

describe("container projection — ordered-list numbering across cuts", () => {
  it("continues ordered numbering for a slice opening mid-list", () => {
    const fixture = numberedFixture();
    const list = fixture.blocks[0]! as Extract<Block, { kind: "numbered-list" }>;
    const offsets = childLengths(
      list.items.map((item) => ({ kind: "blockquote" as const, children: item.content })),
    );
    const afterTwoItems = 2 * (offsets[0]! + SEPARATOR); // item 2 opens exactly here
    const sliced = resolveBlockSlice(list, afterTwoItems, 8 * offsets[0]! + 7 * SEPARATOR, LANG);
    expect(sliced.kind).toBe("numbered-list");
    if (sliced.kind !== "numbered-list") throw new Error("expected numbered-list");
    // The slice's first rendered item is the ORIGINAL third one: it must
    // open at its original ordinal (start 5 + two skipped items = 7).
    expect(sliced.start).toBe(7);
    expect(sliced.items).toHaveLength(6);
    const first = sliced.items[0]!.content[0] as Extract<Block, { kind: "paragraph" }>;
    expect(inlineText(first.content)).toContain("Point 2");
  });

  it("keeps the original start for a slice covering the list head", () => {
    const fixture = numberedFixture();
    const list = fixture.blocks[0]! as Extract<Block, { kind: "numbered-list" }>;
    const offsets = childLengths(
      list.items.map((item) => ({ kind: "blockquote" as const, children: item.content })),
    );
    const throughThreeItems = 3 * (offsets[0]! + SEPARATOR);
    const sliced = resolveBlockSlice(list, 0, throughThreeItems, LANG) as Extract<
      Block,
      { kind: "numbered-list" }
    >;
    expect(sliced.start).toBe(5);
    expect(sliced.items).toHaveLength(3);
    const last = sliced.items[2]!.content[0] as Extract<Block, { kind: "paragraph" }>;
    expect(inlineText(last.content)).toContain("Point 2");
  });

  it("continues numbering into a continuation tail of the giant list", () => {
    const article = giantListArticle();
    const list = article.blocks[1]! as Extract<Block, { kind: "numbered-list" }>;
    const lengths = articleGraphemeIndex(article).perBlockLengths;
    const offsets = childLengths(
      list.items.map((item) => ({ kind: "blockquote" as const, children: item.content })),
    );
    // A window continuation opens one capacity in — mid-list, mid-item.
    const cut = 8000;
    const firstIncluded = childAt(offsets, cut);
    const sliced = resolveBlockSlice(list, cut, lengths[1]!, LANG) as Extract<
      Block,
      { kind: "numbered-list" }
    >;
    expect(sliced.start).toBe(list.start + firstIncluded);
    expect(sliced.items.length).toBe(list.items.length - firstIncluded);
    // The first rendered item IS item `firstIncluded` — for a mid-item cut
    // its rendered text is a source slice of that original item's text.
    const first = sliced.items[0]!.content[0] as Extract<Block, { kind: "paragraph" }>;
    const original = list.items[firstIncluded]!.content[0] as Extract<Block, { kind: "paragraph" }>;
    expect(blockRawText(original)).toContain(blockRawText(first));
  });
});

describe("container projection — semantics and nested markup", () => {
  it("preserves blockquote semantics and slices boundary children recursively", () => {
    const fixture = nestedQuoteFixture();
    const quote = fixture.blocks[0]! as Extract<Block, { kind: "blockquote" }>;
    const offsets = childLengths(quote.children);
    const total = offsets.reduce((sum, len) => sum + len + SEPARATOR, 0) - SEPARATOR;
    // Cut INSIDE the middle (nested) child so both boundary sides slice.
    const mid = offsets[0]! + SEPARATOR + Math.floor(offsets[1]! / 2);
    const sliced = resolveBlockSlice(quote, mid, total, LANG);
    expect(sliced.kind).toBe("blockquote");
    if (sliced.kind !== "blockquote") throw new Error("expected blockquote");
    // The nested quotation survives as a blockquote child with its own text.
    const nested = sliced.children.filter((c) => c.kind === "blockquote");
    expect(nested).toHaveLength(1);
    // No source text outside the range renders: the first outer child is gone.
    expect(blockRawText(sliced)).not.toContain("Outer opening");
    expect(blockRawText(sliced)).toBe(blockRawText(quote).slice(mid));
  });

  it("returns the SOURCE block unchanged for whole-range projections", () => {
    const quoteFixture = nestedQuoteFixture();
    const quote = quoteFixture.blocks[0]!;
    const quoteOffsets = childLengths((quote as Extract<Block, { kind: "blockquote" }>).children);
    const quoteTotal = quoteOffsets.reduce((s, len) => s + len + SEPARATOR, 0) - SEPARATOR;
    expect(resolveBlockSlice(quote, 0, quoteTotal, LANG)).toBe(quote);
    const listFixture = numberedFixture();
    const list = listFixture.blocks[0]!;
    const itemOffsets = childLengths(
      (list as Extract<Block, { kind: "numbered-list" }>).items.map((item) => ({
        kind: "blockquote" as const,
        children: item.content,
      })),
    );
    const listTotal = itemOffsets.reduce((s, len) => s + len + SEPARATOR, 0) - SEPARATOR;
    expect(resolveBlockSlice(list, 0, listTotal, LANG)).toBe(list);
  });

  it("renders an atomic child whole rather than partially (defensive D4-02)", () => {
    const article = ArticleSchema.parse({
      ...numberedFixture(),
      blocks: [
        {
          kind: "numbered-list",
          start: 1,
          items: [
            {
              content: [
                { kind: "paragraph", content: [{ text: "Before the plate. ", marks: [] }] },
              ],
            },
            {
              content: [
                { kind: "paragraph", content: [{ text: "Captioned entry. ", marks: [] }] },
                {
                  kind: "figure",
                  alt: "The plate",
                  src: "https://example.com/plate.png",
                  caption: [{ text: "Plate caption text.", marks: [] }],
                },
              ],
            },
            {
              content: [{ kind: "paragraph", content: [{ text: "After the plate. ", marks: [] }] }],
            },
          ],
        },
      ],
    }) as { blocks: Block[] };
    const list = article.blocks[0]! as Extract<Block, { kind: "numbered-list" }>;
    // Cut INSIDE the figure's D-05 contribution (alt + caption): the atomic
    // child must render whole — alt and caption intact, never clipped.
    const perItem = childLengths(
      list.items.map((item) => ({ kind: "blockquote" as const, children: item.content })),
    );
    const figureContribution = graphemeClusters(
      blockNormalizedText(list.items[1]!.content[1]!),
      LANG,
    ).length;
    const figureStart = perItem[0]! + SEPARATOR + (perItem[1]! - figureContribution) + SEPARATOR;
    const sliced = resolveBlockSlice(
      list,
      figureStart + 5,
      perItem[0]! + perItem[1]! + perItem[2]! + 2 * SEPARATOR,
      LANG,
    ) as Extract<Block, { kind: "numbered-list" }>;
    const item = sliced.items.find((candidate) =>
      candidate.content.some((c) => c.kind === "figure"),
    );
    expect(item).toBeDefined();
    const figure = item!.content.find((c) => c.kind === "figure") as Extract<
      Block,
      { kind: "figure" }
    >;
    expect(figure.alt).toBe("The plate");
    expect(inlineText(figure.caption)).toContain("Plate caption text.");
  });
});

describe("container projection — raw-prefix rebase", () => {
  it("reports exactly the raw text each slice origin renders away", () => {
    const article = giantQuoteArticle();
    const quote = article.blocks[1]!;
    const rawConcat = blockRawText(quote);
    const quoteLength = articleGraphemeIndex(article).perBlockLengths[1]!;
    // Every cut across the quote — including cuts deep inside the giant
    // quoted passage, the nested witness, and the inner list — omits
    // exactly the raw prefix the projected slice lacks.
    for (let start = 1; start <= quoteLength; start += 37) {
      const sliced = resolveBlockSlice(quote, start, quoteLength, LANG);
      const prefix = blockRawPrefixUtf16(quote, start, LANG);
      expect(blockRawText(sliced), `cut ${start}`).toBe(rawConcat.slice(prefix));
    }
  });

  it("mirrors the rendered omission across a giant list, nested cuts included", () => {
    const article = giantListArticle(120);
    const list = article.blocks[1]!;
    const rawConcat = blockRawText(list);
    const listLength = articleGraphemeIndex(article).perBlockLengths[1]!;
    for (const start of [1, 20, 40, 41, 80, 117, listLength - 1]) {
      const sliced = resolveBlockSlice(list, start, listLength, LANG);
      const prefix = blockRawPrefixUtf16(list, start, LANG);
      expect(blockRawText(sliced), `cut ${start}`).toBe(rawConcat.slice(prefix));
    }
  });

  it("reports zero for whole and atomic projections", () => {
    const article = giantListArticle(20);
    const list = article.blocks[1]!;
    expect(blockRawPrefixUtf16(list, 0, LANG)).toBe(0);
    const heading = article.blocks[0]!;
    expect(blockRawPrefixUtf16(heading, 4, LANG)).toBe(0);
  });
});
