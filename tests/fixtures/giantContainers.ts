import { ArticleSchema } from "../../src/content/schema";
import type { Block } from "../../src/content/types";

// Issue #234 — deterministic, network-free oversized list/quotation works.
// Each fixture names its items/passages ("Item 0000 …", "Quoted passage 0000
// …") so omissions, seams, and numbering continuations are observable, and
// stays pure ASCII so graphemes == UTF-16 units == characters and tests can
// compute offsets arithmetically without re-running segmentation.
//
// Coordinates stay in the ORIGINAL D-05 substrate everywhere: continuations
// are windows (src/pagination/blockWindow.ts), never rewritten blocks.

/** "Item 0000 of the enormous enumeration. " — 40 ASCII chars per item run;
 * normalizeRunText trims the trailing space, so each plain item contributes
 * 39 D-05 graphemes (plus the BLOCK_SEPARATOR between items). */
const ITEM_SEGMENT_LENGTH = "Item 0000 of the enormous enumeration. ".length;
export const ITEM_GRAPHEMES = ITEM_SEGMENT_LENGTH - 1;

/** "Quoted passage 0000 of the enormous citation. " — 47 ASCII chars per
 * quoted run; the trailing-space trim leaves 46 D-05 graphemes per passage. */
const QUOTE_SEGMENT_LENGTH = "Quoted passage 0000 of the enormous citation. ".length;
export const QUOTE_GRAPHEMES = QUOTE_SEGMENT_LENGTH - 1;

function itemText(n: number): string {
  return `Item ${String(n).padStart(4, "0")} of the enormous enumeration. `;
}

function quoteText(n: number): string {
  return `Quoted passage ${String(n).padStart(4, "0")} of the enormous citation. `;
}

/** One numbered item's content blocks: the labeled paragraph, with markup or
 * a nested bulleted sub-list at fixed positions so splits crossing nested
 * markup stay observable wherever the continuations cut. */
function numberedItemContent(n: number): Block[] {
  if (n === 100) {
    return [
      {
        kind: "paragraph",
        content: [
          { text: itemText(n), marks: [] },
          { text: "The nested aside belongs to this item. ", marks: [{ type: "strong" }] },
        ],
      },
      {
        kind: "bulleted-list",
        items: [
          {
            content: [{ kind: "paragraph", content: [{ text: "Inner bullet alpha.", marks: [] }] }],
          },
          {
            content: [{ kind: "paragraph", content: [{ text: "Inner bullet beta.", marks: [] }] }],
          },
        ],
      },
    ];
  }
  if (n % 50 === 0) {
    return [
      {
        kind: "paragraph",
        content: [
          { text: itemText(n), marks: [{ type: "link", href: "https://example.com/entry" }] },
        ],
      },
    ];
  }
  if (n % 25 === 0) {
    return [
      {
        kind: "paragraph",
        content: [
          { text: "Emphasized lead. ", marks: [{ type: "em" }] },
          { text: itemText(n), marks: [] },
        ],
      },
    ];
  }
  return [{ kind: "paragraph", content: [{ text: itemText(n), marks: [] }] }];
}

/** A giant numbered list (`count` plain-equivalent items ≈ count × 39
 * graphemes + separators). 600 items ≈ 23.5k graphemes — three window
 * continuations at the 8k capacity, each paginating across many pages. */
export function giantListArticle(count = 600) {
  return ArticleSchema.parse({
    id: "giant-list-work",
    revision: 1,
    lang: "en",
    provenance: {
      title: "The enormous enumeration",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: "synthetic-giant-list-work-v1",
    },
    blocks: [
      { kind: "heading", level: 2, content: [{ text: "Enumeration", marks: [] }] },
      {
        kind: "numbered-list",
        items: Array.from({ length: count }, (_, n) => ({ content: numberedItemContent(n) })),
        start: 1,
      },
      { kind: "heading", level: 2, content: [{ text: "After the enumeration", marks: [] }] },
      { kind: "paragraph", content: [{ text: "A calm closing passage.", marks: [] }] },
    ],
  });
}

/** A giant quotation with multiple nested blocks: an enormous quoted
 * paragraph (splits INSIDE one quoted passage), a nested blockquote, an
 * inner numbered list, and marked prose — the whole quote exceeds the
 * window capacity several times over. */
export function giantQuoteArticle() {
  const giantRun = Array.from({ length: 500 }, (_, n) => quoteText(n)).join("");
  return ArticleSchema.parse({
    id: "giant-quote-work",
    revision: 1,
    lang: "en",
    provenance: {
      title: "The enormous citation",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: "synthetic-giant-quote-work-v1",
    },
    blocks: [
      { kind: "heading", level: 2, content: [{ text: "Citation", marks: [] }] },
      {
        kind: "blockquote",
        children: [
          { kind: "paragraph", content: [{ text: giantRun, marks: [] }] },
          {
            kind: "blockquote",
            children: [
              {
                kind: "paragraph",
                content: [
                  { text: "A witness within the witness. ", marks: [{ type: "strong" }] },
                  { text: quoteText(900), marks: [] },
                ],
              },
            ],
          },
          {
            kind: "numbered-list",
            items: [
              {
                content: [{ kind: "paragraph", content: [{ text: "Cited item one.", marks: [] }] }],
              },
              {
                content: [
                  {
                    kind: "paragraph",
                    content: [{ text: "Cited item two.", marks: [{ type: "em" }] }],
                  },
                ],
              },
            ],
            start: 1,
          },
          {
            kind: "paragraph",
            content: [
              {
                text: quoteText(950),
                marks: [{ type: "link", href: "https://example.com/source" }],
              },
            ],
          },
        ],
      },
      { kind: "paragraph", content: [{ text: "A calm closing passage.", marks: [] }] },
    ],
  });
}

/** A mostly-ordinary numbered list whose FOURTH item is itself enormous —
 * one single list item past the whole window capacity. The continuations
 * must cut INSIDE the item (bounded rendering and measurement inside one
 * large list item), not merely between items. */
export function giantListItemArticle() {
  const giantRun = Array.from({ length: 300 }, (_, n) => quoteText(n)).join("");
  const plain = (n: number) => ({
    content: [{ kind: "paragraph", content: [{ text: itemText(n), marks: [] }] }],
  });
  return ArticleSchema.parse({
    id: "giant-item-work",
    revision: 1,
    lang: "en",
    provenance: {
      title: "The enormous entry",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: "synthetic-giant-item-work-v1",
    },
    blocks: [
      { kind: "heading", level: 2, content: [{ text: "Ledger", marks: [] }] },
      {
        kind: "numbered-list",
        items: [
          plain(0),
          plain(1),
          plain(2),
          { content: [{ kind: "paragraph", content: [{ text: giantRun, marks: [] }] }] },
          plain(4),
          plain(5),
        ],
        start: 1,
      },
      { kind: "paragraph", content: [{ text: "A calm closing passage.", marks: [] }] },
    ],
  });
}

/** Mixed descendants at the first capacity seam: the five-line atomic code
 * crosses the old 8k cut, while empty-alt figures have no text extent at all. */
export function mixedContainerArticle(closingRepeats = 300) {
  return ArticleSchema.parse({
    id: "mixed-container-work",
    revision: 1,
    lang: "en",
    provenance: {
      title: "The illustrated citation",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: "synthetic-mixed-container-v1",
    },
    blocks: [
      {
        kind: "blockquote",
        children: [
          { kind: "figure", alt: "", caption: [], width: 100, height: 24 },
          {
            kind: "paragraph",
            content: [
              {
                text: "Opening passage stays in source order. ".repeat(300).slice(0, 7950),
                marks: [],
              },
            ],
          },
          {
            kind: "numbered-list",
            start: 7,
            items: [
              { content: [{ kind: "code-block", source: "// bounded atomic entry\n".repeat(5) }] },
            ],
          },
          {
            kind: "paragraph",
            content: [
              { text: "Closing passage stays in source order. ".repeat(closingRepeats), marks: [] },
            ],
          },
          { kind: "figure", alt: "", caption: [], width: 100, height: 24 },
        ],
      },
    ],
  });
}

/** The unchanged-regression control: ordinary-sized list + quotation shapes
 * that must keep their pre-#234 windows and rendering byte-for-byte. */
export function shortListQuoteArticle() {
  return ArticleSchema.parse({
    id: "short-list-quote-work",
    revision: 1,
    lang: "en",
    provenance: {
      title: "A modest structure",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: "synthetic-short-list-quote-v1",
    },
    blocks: [
      { kind: "heading", level: 2, content: [{ text: "Structure", marks: [] }] },
      {
        kind: "numbered-list",
        items: [
          {
            content: [
              { kind: "paragraph", content: [{ text: "First numbered point.", marks: [] }] },
            ],
          },
          {
            content: [
              { kind: "paragraph", content: [{ text: "Second numbered point.", marks: [] }] },
            ],
          },
          {
            content: [
              { kind: "paragraph", content: [{ text: "Third numbered point.", marks: [] }] },
            ],
          },
        ],
        start: 4,
      },
      {
        kind: "blockquote",
        children: [
          { kind: "paragraph", content: [{ text: "A short quoted line.", marks: [] }] },
          {
            kind: "paragraph",
            content: [{ text: "Another quoted line.", marks: [{ type: "em" }] }],
          },
        ],
      },
      { kind: "paragraph", content: [{ text: "A calm closing passage.", marks: [] }] },
    ],
  });
}
