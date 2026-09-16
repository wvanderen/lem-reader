import type { Block, CanonicalArticle, InlineRun } from "../../../src/content/types";
import { normalizeText } from "../../../src/content/normalizeText";
import { blockGraphemeLength } from "../../../src/pagination/anchor";
import type { ArticleBodyHighlight } from "../../../src/content/render/BlockRenderer";

export function run(text: string, marks: InlineRun["marks"] = []): InlineRun {
  return { text, marks };
}

export function makeArticle(blocks: Block[]): CanonicalArticle {
  return {
    id: "spike-fixture",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/spike",
      title: "Spike Fixture",
      retrievedAt: "2026-09-13T00:00:00Z",
      originalHtmlHash: "0000000000000000000000000000000000000000000000000000000000000000",
    },
    blocks,
    footnotes: [],
  };
}

export const HARD_ARTICLE: CanonicalArticle = makeArticle([
  { kind: "heading", level: 1, content: [run("Alpha Heading")] },
  { kind: "paragraph", content: [run("First paragraph with plain prose text.")] },
  {
    kind: "paragraph",
    content: [
      run("Linked "),
      {
        text: "anchor text",
        marks: [{ type: "link", href: "https://example.com/docs" }],
      },
      run(" trailing prose."),
    ],
  },
  {
    kind: "blockquote",
    children: [
      { kind: "paragraph", content: [run("Quote child one.")] },
      { kind: "heading", level: 2, content: [run("Quote inner heading")] },
      { kind: "paragraph", content: [run("Quote child three text.")] },
    ],
  },
  {
    kind: "bulleted-list",
    items: [
      { content: [{ kind: "paragraph", content: [run("Item one alpha")] }] },
      {
        content: [
          { kind: "paragraph", content: [run("Item two beta")] },
          {
            kind: "numbered-list",
            start: 3,
            items: [
              { content: [{ kind: "paragraph", content: [run("Nested deep one")] }] },
              { content: [{ kind: "paragraph", content: [run("Nested deep two")] }] },
            ],
          },
        ],
      },
      { content: [{ kind: "paragraph", content: [run("Item three gamma")] }] },
    ],
  },
  {
    kind: "code-block",
    language: "ts",
    source: "const a = 1;\n\nfunction f() {\n  return a;\n}",
  },
  {
    kind: "figure",
    alt: "Alt text",
    width: 4,
    height: 3,
    caption: [run("The caption prose.")],
  },
  { kind: "figure", alt: "", caption: [run("No-alt caption.")] },
  { kind: "paragraph", content: [run("Closing paragraph text.")] },
]);

export function locate(article: CanonicalArticle, needle: string): number {
  const idx = normalizeText(article).indexOf(needle);
  if (idx < 0) throw new Error(`fixture needle not found: ${needle}`);
  return idx;
}

export function hl(
  id: string,
  start: number,
  end: number,
  status: ArticleBodyHighlight["status"] = "confident",
  hasNote = false,
): ArticleBodyHighlight {
  return { id, position: { start, end }, hasNote, status };
}

function at(article: CanonicalArticle, needle: string, offset: number): number {
  return locate(article, needle) + offset;
}

export const HIGHLIGHT_SETS: Record<string, ArticleBodyHighlight[]> = {
  crossBlockHead: [
    hl("hl-a", at(HARD_ARTICLE, "Alpha Heading", 2), at(HARD_ARTICLE, "First paragraph", 6)),
  ],
  plainProse: [hl("hl-b", at(HARD_ARTICLE, "plain prose", 0), at(HARD_ARTICLE, "plain prose", 11))],
  linkRun: [
    hl(
      "hl-c",
      at(HARD_ARTICLE, "anchor text", 0),
      at(HARD_ARTICLE, "anchor text", 11),
      "confident",
      true,
    ),
  ],
  proseToQuoteChild: [
    hl("hl-d", at(HARD_ARTICLE, "trailing", 0), at(HARD_ARTICLE, "Quote child one.", 5)),
  ],
  quoteChildBoundary: [
    hl(
      "hl-e",
      at(HARD_ARTICLE, "inner heading", 2),
      at(HARD_ARTICLE, "Quote child three text.", 6),
      "ambiguous",
    ),
  ],
  listSpan: [
    hl("hl-f", at(HARD_ARTICLE, "Item one alpha", 7), at(HARD_ARTICLE, "Nested deep one", 8)),
  ],
  nestedTail: [hl("hl-g", at(HARD_ARTICLE, "deep two", 0), at(HARD_ARTICLE, "deep two", 8))],
  afterNested: [
    hl("hl-h", at(HARD_ARTICLE, "Item three gamma", 0), at(HARD_ARTICLE, "Item three gamma", 16)),
  ],
  codeHead: [hl("hl-i", at(HARD_ARTICLE, "const a", 0), at(HARD_ARTICLE, "const a", 8))],
  codeMid: [
    hl("hl-j", at(HARD_ARTICLE, "return a", 0), at(HARD_ARTICLE, "return a", 8), "confident", true),
  ],
  captionWithAlt: [
    hl("hl-k", at(HARD_ARTICLE, "caption prose", 0), at(HARD_ARTICLE, "caption prose", 13)),
  ],
  captionNoAltCross: [
    hl("hl-l", at(HARD_ARTICLE, "No-alt", 0), at(HARD_ARTICLE, "Closing paragraph", 8)),
  ],
  endExclusiveAtBlockBoundary: [
    hl("hl-m", at(HARD_ARTICLE, "prose text.", 6), at(HARD_ARTICLE, "Linked anchor", 0)),
  ],
};

export const ALL_HIGHLIGHTS: ArticleBodyHighlight[] = Object.values(HIGHLIGHT_SETS).flat();

export function wholeEntry(
  article: CanonicalArticle,
  blockIndex: number,
): { blockIndex: number; startGrapheme: number; endGrapheme: number } {
  return {
    blockIndex,
    startGrapheme: 0,
    endGrapheme: blockGraphemeLength(article.blocks[blockIndex]!, "en"),
  };
}
