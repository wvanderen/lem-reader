import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ArticleBody } from "../../../src/content/render/BlockRenderer";
import { PageFragmentView } from "../../../src/pagination/fragmentRenderer";
import { splittingGraphemeLength } from "../../../src/pagination/splitBlock";
import type { PageFragment } from "../../../src/pagination/types";
import {
  ALL_HIGHLIGHTS,
  HARD_ARTICLE,
  HIGHLIGHT_SETS,
  hl,
  makeArticle,
  run,
  wholeEntry,
} from "./fixtures";
import { SpikeArticleBody, SpikePageFragmentView } from "./legacyFreeze";

function frag(
  pageIndex: number,
  blocks: PageFragment["blocks"],
): PageFragment {
  return { schemaVersion: 1, pageIndex, blocks };
}

const QUOTE_LEN = splittingGraphemeLength(HARD_ARTICLE.blocks[3]!, "en");
const PARA1_LEN = splittingGraphemeLength(HARD_ARTICLE.blocks[1]!, "en");
const LIST_LEN = splittingGraphemeLength(HARD_ARTICLE.blocks[4]!, "en");

const FRAGMENTS: { name: string; fragment: PageFragment }[] = [
  {
    name: "multi-entry-whole-blocks",
    fragment: frag(0, [wholeEntry(HARD_ARTICLE, 0), wholeEntry(HARD_ARTICLE, 1)]),
  },
  {
    name: "para-split-head",
    fragment: frag(0, [{ blockIndex: 1, startGrapheme: 0, endGrapheme: 12 }]),
  },
  {
    name: "para-split-tail-plus-linked",
    fragment: frag(1, [
      { blockIndex: 1, startGrapheme: 12, endGrapheme: PARA1_LEN },
      wholeEntry(HARD_ARTICLE, 2),
    ]),
  },
  {
    name: "quote-split-inside-child1",
    fragment: frag(0, [{ blockIndex: 3, startGrapheme: 0, endGrapheme: 10 }]),
  },
  {
    name: "quote-split-at-atomic-child",
    fragment: frag(1, [{ blockIndex: 3, startGrapheme: 0, endGrapheme: 21 }]),
  },
  {
    name: "quote-tail",
    fragment: frag(2, [{ blockIndex: 3, startGrapheme: 21, endGrapheme: QUOTE_LEN }]),
  },
  {
    name: "list-head",
    fragment: frag(0, [{ blockIndex: 4, startGrapheme: 0, endGrapheme: 17 }]),
  },
  {
    name: "list-tail",
    fragment: frag(1, [{ blockIndex: 4, startGrapheme: 17, endGrapheme: LIST_LEN }]),
  },
  {
    name: "atomic-code-figure",
    fragment: frag(0, [wholeEntry(HARD_ARTICLE, 5), wholeEntry(HARD_ARTICLE, 6)]),
  },
  {
    name: "figure-no-alt-plus-closing",
    fragment: frag(0, [wholeEntry(HARD_ARTICLE, 7), wholeEntry(HARD_ARTICLE, 8)]),
  },
];

const HIGHLIGHT_CASES: { name: string; highlights: typeof ALL_HIGHLIGHTS }[] = [
  ...Object.entries(HIGHLIGHT_SETS).map(([name, highlights]) => ({
    name,
    highlights,
  })),
  { name: "ALL", highlights: ALL_HIGHLIGHTS },
  { name: "none", highlights: [] },
];

describe("spike: scrolling renderer byte-identity (ArticleBody vs unified slicer)", () => {
  for (const { name, highlights } of HIGHLIGHT_CASES) {
    it(`byte-identical markup: ${name}`, () => {
      const production = renderToStaticMarkup(
        <ArticleBody article={HARD_ARTICLE} highlights={highlights} />,
      );
      const unified = renderToStaticMarkup(
        <SpikeArticleBody article={HARD_ARTICLE} highlights={highlights} />,
      );
      expect(unified).toBe(production);
    });
  }
});

describe("spike: documented coordinate divergence between the twins today", () => {
  const DIVERGENT_ARTICLE = makeArticle([
    { kind: "paragraph", content: [run("Intro")] },
    {
      kind: "blockquote",
      children: [
        { kind: "paragraph", content: [run("See"), run("docs")] },
        { kind: "paragraph", content: [run("Tail")] },
      ],
    },
    { kind: "paragraph", content: [run("After")] },
  ]);
  const divergentHl = hl("hl-div", 15, 17);
  const divergentFragment: PageFragment = {
    schemaVersion: 1,
    pageIndex: 0,
    blocks: [
      { blockIndex: 1, startGrapheme: 0, endGrapheme: 12 },
    ],
  };

  it("the unified slicer is byte-identical to EACH twin on divergent content (with that twin's measure)", () => {
    expect(
      renderToStaticMarkup(
        <SpikeArticleBody
          article={DIVERGENT_ARTICLE}
          highlights={[divergentHl]}
        />,
      ),
    ).toBe(
      renderToStaticMarkup(
        <ArticleBody article={DIVERGENT_ARTICLE} highlights={[divergentHl]} />,
      ),
    );
    expect(
      renderToStaticMarkup(
        <SpikePageFragmentView
          fragment={divergentFragment}
          pageIndex={0}
          article={DIVERGENT_ARTICLE}
          lang="en"
          highlights={[divergentHl]}
        />,
      ),
    ).toBe(
      renderToStaticMarkup(
        <PageFragmentView
          fragment={divergentFragment}
          pageIndex={0}
          article={DIVERGENT_ARTICLE}
          lang="en"
          highlights={[divergentHl]}
        />,
      ),
    );
  });

  it("the two production twins DISAGREE on the same article + highlight (D-05 vs splitting coordinates)", () => {
    const scrolling = renderToStaticMarkup(
      <ArticleBody article={DIVERGENT_ARTICLE} highlights={[divergentHl]} />,
    );
    const paginated = renderToStaticMarkup(
      <PageFragmentView
        fragment={divergentFragment}
        pageIndex={0}
        article={DIVERGENT_ARTICLE}
        lang="en"
        highlights={[divergentHl]}
      />,
    );
    expect(scrolling).toContain("<mark");
    expect(paginated).toContain("<mark");
    expect(scrolling).toContain("Ta</mark>");
    expect(paginated).toContain("ai</mark>");
  });
});

describe("spike: paginated renderer byte-identity (PageFragmentView vs unified slicer)", () => {
  for (const { name: fragName, fragment } of FRAGMENTS) {
    for (const { name: hlName, highlights } of HIGHLIGHT_CASES) {
      it(`byte-identical markup: ${fragName} × ${hlName}`, () => {
        const production = renderToStaticMarkup(
          <PageFragmentView
            fragment={fragment}
            pageIndex={fragment.pageIndex}
            article={HARD_ARTICLE}
            lang="en"
            highlights={highlights}
          />,
        );
        const unified = renderToStaticMarkup(
          <SpikePageFragmentView
            fragment={fragment}
            pageIndex={fragment.pageIndex}
            article={HARD_ARTICLE}
            lang="en"
            highlights={highlights}
          />,
        );
        expect(unified).toBe(production);
      });
    }
  }

  it("renders marks for the load-bearing highlight sets (sanity: differentials are not vacuous)", () => {
    const markup = renderToStaticMarkup(
      <PageFragmentView
        fragment={FRAGMENTS[0]!.fragment}
        pageIndex={0}
        article={HARD_ARTICLE}
        lang="en"
        highlights={HIGHLIGHT_SETS.crossBlockHead}
      />,
    );
    expect(markup).toContain("<mark");
    const noMarks = renderToStaticMarkup(
      <PageFragmentView
        fragment={FRAGMENTS[0]!.fragment}
        pageIndex={0}
        article={HARD_ARTICLE}
        lang="en"
        highlights={[]}
      />,
    );
    expect(noMarks).not.toContain("<mark");
  });

  it("first-occurrence id claims: exactly one id= per highlight id per mounted page (multi-entry + split-page cases)", () => {
    for (const { fragment } of FRAGMENTS) {
      const markup = renderToStaticMarkup(
        <PageFragmentView
          fragment={fragment}
          pageIndex={0}
          article={HARD_ARTICLE}
          lang="en"
          highlights={ALL_HIGHLIGHTS}
        />,
      );
      const unifiedMarkup = renderToStaticMarkup(
        <SpikePageFragmentView
          fragment={fragment}
          pageIndex={0}
          article={HARD_ARTICLE}
          lang="en"
          highlights={ALL_HIGHLIGHTS}
        />,
      );
      expect(unifiedMarkup).toBe(markup);
      for (const match of unifiedMarkup.matchAll(/ id="(hl-[a-z]+)"/g)) {
        const id = ` id="${match[1]}"`;
        expect(unifiedMarkup.split(id).length - 1).toBe(1);
      }
    }
  });
});
