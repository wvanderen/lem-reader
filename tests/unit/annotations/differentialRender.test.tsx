// tests/unit/annotations/differentialRender.test.tsx
// Spike 0007 promotion acceptance gate (issue #36): renders the PRODUCTION
// renderers (both now driven by the unified highlight slicer) against the
// FROZEN pre-promotion twin walks (legacyFreeze.tsx) with react-dom/server
// and asserts renderToStaticMarkup strings are byte-identical — everywhere
// the old two-coordinate system already agreed (F2-clean content). On the
// divergent fixture it pins the ONE intentional behavior change: the F2
// reconciliation, after which BOTH production twins mark the same text.
//
// Matrix:
//   - Scrolling: ArticleBody vs LegacyArticleBody across 15 highlight
//     scenarios (cross-block spans, link-run middles, quote-child
//     boundaries, nested-list spans, code interiors, captions with/without
//     alt, block-boundary-exact ends, union, none).
//   - Paginated: PageFragmentView vs LegacyPageFragmentView across
//     10 fragment geometries × 15 highlight scenarios.
//   - Corpus: every bundled fixture — byte-identity against the frozen
//     twins where the fixture is F2-clean, and (all fixtures) the
//     cross-mode invariant: the scrolling and paginated paths mark the
//     same (id, text) sequence — the reconciliation property that makes
//     slicing stable across wrap and reflow.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ArticleBody } from "../../../src/content/render/BlockRenderer";
import { PageFragmentView } from "../../../src/pagination/fragmentRenderer";
import { blockGraphemeLength } from "../../../src/pagination/anchor";
import { articleGraphemeIndex } from "../../../src/content/normalizeText";
import type { PageFragment } from "../../../src/pagination/types";
import type { CanonicalArticle } from "../../../src/content/types";
import { bundledFixtures } from "../../../src/fixtures";
import {
  ALL_HIGHLIGHTS,
  HARD_ARTICLE,
  HIGHLIGHT_SETS,
  hl,
  makeArticle,
  run,
  wholeEntry,
} from "./spikeFixtures";
import {
  LegacyArticleBody,
  LegacyPageFragmentView,
  legacySplittingGraphemeLength,
} from "./legacyFreeze";

function frag(pageIndex: number, blocks: PageFragment["blocks"]): PageFragment {
  return { schemaVersion: 1, pageIndex, blocks };
}

const QUOTE_LEN = blockGraphemeLength(HARD_ARTICLE.blocks[3]!, "en");
const PARA1_LEN = blockGraphemeLength(HARD_ARTICLE.blocks[1]!, "en");
const LIST_LEN = blockGraphemeLength(HARD_ARTICLE.blocks[4]!, "en");

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

describe("scrolling renderer byte-identity (ArticleBody vs frozen legacy walk)", () => {
  for (const { name, highlights } of HIGHLIGHT_CASES) {
    it(`byte-identical markup: ${name}`, () => {
      const production = renderToStaticMarkup(
        <ArticleBody article={HARD_ARTICLE} highlights={highlights} />,
      );
      const legacy = renderToStaticMarkup(
        <LegacyArticleBody article={HARD_ARTICLE} highlights={highlights} />,
      );
      expect(production).toBe(legacy);
    });
  }
});

describe("F2 reconciliation regression: the twins now agree on divergent content", () => {
  // One grapheme of D-05/splitting drift across a multi-run blockquote
  // child ("See"+"docs" → D-05 "See docs" = 8 vs raw "Seedocs" = 7) used to
  // make the paginated twin mark "ai" where the stored D-05 selector says
  // "Ta". The reconciliation removed the second coordinate; both twins must
  // now mark exactly what the stored selector addresses.
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
    blocks: [{ blockIndex: 1, startGrapheme: 0, endGrapheme: 12 }],
  };

  it("scrolling and paginated production twins mark the SAME text ('Ta')", () => {
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
    expect(paginated).toContain("Ta</mark>");
  });

  it("documents the fixed drift: the frozen paginated twin marked 'ai'", () => {
    const legacyPaginated = renderToStaticMarkup(
      <LegacyPageFragmentView
        fragment={divergentFragment}
        pageIndex={0}
        article={DIVERGENT_ARTICLE}
        lang="en"
        highlights={[divergentHl]}
      />,
    );
    expect(legacyPaginated).toContain("ai</mark>");
    expect(legacyPaginated).not.toContain("Ta</mark>");
  });
});

describe("paginated renderer byte-identity (PageFragmentView vs frozen legacy walk)", () => {
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
        const legacy = renderToStaticMarkup(
          <LegacyPageFragmentView
            fragment={fragment}
            pageIndex={fragment.pageIndex}
            article={HARD_ARTICLE}
            lang="en"
            highlights={highlights}
          />,
        );
        expect(production).toBe(legacy);
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
      for (const match of markup.matchAll(/ id="(hl-[a-z]+)"/g)) {
        const id = ` id="${match[1]}"`;
        expect(markup.split(id).length - 1).toBe(1);
      }
    }
  });
});

describe("wrap-sweep: slicing is stable wherever the wrap (page split) lands", () => {
  // The whitespace-neutral coordinate's load-bearing property: highlights
  // address the D-05 text stream, which does not depend on layout — so for
  // EVERY possible page-split offset the union of the two pages' marks must
  // reconstruct exactly the scrolling marks (normalized text; the join
  // separator renders in no run piece). The unit-level wrap axis: real
  // rewrap is exercised live by the pagination corpus + repagination e2e.
  const SWEEP_ARTICLE = makeArticle([
    { kind: "paragraph", content: [run("Intro paragraph text.")] },
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
  ]);
  const sweepHighlights = [
    hl("hl-s0", 4, 30), // crosses the block boundary + the link run head
    hl("hl-s1", 30, 45), // inside the link run
    hl("hl-s2", 45, 62), // link tail + trailing prose
  ];
  const sweepLen = blockGraphemeLength(SWEEP_ARTICLE.blocks[1]!, "en");

  for (let split = 1; split < sweepLen; split++) {
    it(`split at ${split} reconstructs the scrolling marks`, () => {
      const head = renderToStaticMarkup(
        <PageFragmentView
          fragment={frag(0, [
            wholeEntry(SWEEP_ARTICLE, 0),
            { blockIndex: 1, startGrapheme: 0, endGrapheme: split },
          ])}
          pageIndex={0}
          article={SWEEP_ARTICLE}
          lang="en"
          highlights={sweepHighlights}
        />,
      );
      const tail = renderToStaticMarkup(
        <PageFragmentView
          fragment={frag(1, [{ blockIndex: 1, startGrapheme: split, endGrapheme: sweepLen }])}
          pageIndex={1}
          article={SWEEP_ARTICLE}
          lang="en"
          highlights={sweepHighlights}
        />,
      );
      // Per-highlight reconstruction: a split highlight renders one
      // mark-slice per page (D5-16 — same data-highlight-id on both), so
      // the invariant is that each id's page-ordered mark texts concatenate
      // to exactly the scrolling mark text — no drift at any split offset.
      // Comparison strips ASCII whitespace (the D-05 notion of sameness):
      // when a page seam falls on the run-join separator, that whitespace
      // cluster renders on the after page as an UNMARKED gap piece (the raw
      // ride-along), so it appears in neither page's mark text — while the
      // scrolling mark legitimately contains it. Whitespace mark membership
      // at a page seam is not part of the coordinate contract; real-grapheme
      // coverage is exact, which this assertion pins.
      const perId = (markup: string) => {
        const joined = new Map<string, string>();
        for (const [id, text] of markSequence(markup)) {
          joined.set(id, (joined.get(id) ?? "") + text);
        }
        return [...joined.entries()].map(([id, text]) => [id, text.replace(/[\t\n\f\r ]+/g, "")]);
      };
      expect(perId(head + tail)).toEqual(
        perId(
          renderToStaticMarkup(
            <ArticleBody article={SWEEP_ARTICLE} highlights={sweepHighlights} />,
          ),
        ),
      );
      // Not vacuous: the sweep marks real text.
      expect(markSequence(head + tail).length).toBeGreaterThan(0);
    });
  }
});

// ── Corpus differentials ─────────────────────────────────────────────────────

/** True when the old splitting coordinate and the D-05 coordinate agree on EVERY block — the preconditions under which the frozen twins are expected to be byte-identical with production. */
function f2Clean(article: CanonicalArticle): boolean {
  return article.blocks.every(
    (b) => legacySplittingGraphemeLength(b, article.lang) === blockGraphemeLength(b, article.lang),
  );
}

/** Deterministic disjoint chunk highlights covering the article's stream. */
function chunkHighlights(article: CanonicalArticle, chunks: number) {
  const total = articleGraphemeIndex(article).totalGraphemes;
  if (total === 0) return [];
  const size = Math.max(1, Math.floor(total / chunks));
  const out: ReturnType<typeof hl>[] = [];
  for (let i = 0; i < chunks; i++) {
    const start = i * size;
    const end = Math.min(total, start + size);
    if (end > start) out.push(hl(`hl-c${i}`, start, end));
  }
  return out;
}

function wholeEntries(article: CanonicalArticle): PageFragment {
  return frag(
    0,
    article.blocks.map((_, i) => wholeEntry(article, i)),
  );
}

/** The ordered (highlightId, markedText) sequence a markup string carries. */
function markSequence(markup: string): [string, string][] {
  return [
    ...markup.matchAll(/<mark [^>]*data-highlight-id="([^"]*)"[^>]*>([\s\S]*?)<\/mark>/g),
  ].map((m) => [m[1]!, m[2]!.replace(/<[^>]+>/g, "").replace(/<!-- -->/g, "")]);
}

describe("corpus differentials over the bundled fixtures", () => {
  for (const article of bundledFixtures) {
    const highlights = chunkHighlights(article, 6);

    it(`${article.id}: cross-mode invariant — scrolling and paginated mark the same (id, text) sequence`, () => {
      const scrolling = renderToStaticMarkup(
        <ArticleBody article={article} highlights={highlights} />,
      );
      const paginated = renderToStaticMarkup(
        <PageFragmentView
          fragment={wholeEntries(article)}
          pageIndex={0}
          article={article}
          lang={article.lang}
          highlights={highlights}
        />,
      );
      expect(markSequence(scrolling)).toEqual(markSequence(paginated));
      // Not vacuous: a chunked corpus render carries marks.
      expect(markSequence(scrolling).length).toBeGreaterThan(0);
    });

    if (f2Clean(article)) {
      it(`${article.id}: byte-identical with the frozen legacy twins (scrolling + paginated)`, () => {
        const scrolling = renderToStaticMarkup(
          <ArticleBody article={article} highlights={highlights} />,
        );
        const legacyScrolling = renderToStaticMarkup(
          <LegacyArticleBody article={article} highlights={highlights} />,
        );
        expect(scrolling).toBe(legacyScrolling);

        const fragment = wholeEntries(article);
        const paginated = renderToStaticMarkup(
          <PageFragmentView
            fragment={fragment}
            pageIndex={0}
            article={article}
            lang={article.lang}
            highlights={highlights}
          />,
        );
        const legacyPaginated = renderToStaticMarkup(
          <LegacyPageFragmentView
            fragment={fragment}
            pageIndex={0}
            article={article}
            lang={article.lang}
            highlights={highlights}
          />,
        );
        expect(paginated).toBe(legacyPaginated);
      });

      it(`${article.id}: split-paragraph geometry stays byte-identical with the frozen paginated twin`, () => {
        const splitIdx = article.blocks.findIndex(
          (b) =>
            (b.kind === "paragraph" || b.kind === "blockquote") &&
            blockGraphemeLength(b, article.lang) >= 8,
        );
        if (splitIdx < 0) return;
        const len = blockGraphemeLength(article.blocks[splitIdx]!, article.lang);
        const fragment = frag(0, [
          { blockIndex: splitIdx, startGrapheme: 0, endGrapheme: Math.floor(len / 2) },
          {
            blockIndex: splitIdx,
            startGrapheme: Math.floor(len / 2),
            endGrapheme: len,
          },
        ]);
        const paginated = renderToStaticMarkup(
          <PageFragmentView
            fragment={fragment}
            pageIndex={0}
            article={article}
            lang={article.lang}
            highlights={highlights}
          />,
        );
        const legacyPaginated = renderToStaticMarkup(
          <LegacyPageFragmentView
            fragment={fragment}
            pageIndex={0}
            article={article}
            lang={article.lang}
            highlights={highlights}
          />,
        );
        expect(paginated).toBe(legacyPaginated);
      });
    }
  }
});
