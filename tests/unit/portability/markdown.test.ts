// tests/unit/portability/markdown.test.ts
// Plan 09-02 Task 1 (TDD RED → GREEN) — template contract truth for the fixed
// highlights-only Markdown renderer (PORT-03 pure side). Locks BYTE-FOR-BYTE:
//   - the blockquote + citation + Note line shape (D9-08)
//   - the italic *[approx]* / *[orphan]* markers (D9-09 honest inclusion)
//   - the per-article footer + library totals footer count lines (D9-09)
//   - escapeMarkdownLine's leading-run-only escaping (T-9-05 structure
//     injection guard) with mid-text punctuation untouched
//   - Plan 19-02 (D19-12): multi-line quote.exact renders as ONE entry —
//     `> ` continuation lines, per-line escaping, marker on line 1 only,
//     empty fragments never collapsed, full-span round-trip (no truncation)
//   - collectHighlightEntries' live tri-state via the SHIPPED resolver
//     (resolveQuoteSelector re-export — REUSE-DO-NOT-FORK)
//   - orderSectionsByRecency (location savedAt desc, then title asc)
//
// Fixtures mirror the sample-builder style of tests/unit/ingestion-tags.test.ts:
// small inline ArticleSchema/HighlightRecordSchema/NoteRecordSchema.parse
// records. Article A's body is built so the three tri-states are deterministic:
//   - "epsilon zeta eta" appears exactly once  → confident
//   - "alpha beta gamma delta" appears twice (empty prefix/suffix = wildcards
//     that cannot disambiguate)                          → ambiguous
//   - "this passage no longer exists" appears zero times with a prefix that
//     appears zero times (fallback finds no candidates)  → orphan
import { describe, expect, it } from "vitest";
import {
  ArticleSchema,
  HighlightRecordSchema,
  LocationRecordSchema,
  NoteRecordSchema,
} from "../../../src/content/schema";
import type {
  CanonicalArticle,
  HighlightRecord,
  LocationRecord,
  NoteRecord,
} from "../../../src/content/schema";
import type { HighlightEntry } from "../../../src/portability/markdown";
import {
  collectHighlightEntries,
  escapeMarkdownLine,
  orderSectionsByRecency,
  renderArticleHighlights,
  renderLibraryHighlights,
} from "../../../src/portability/markdown";

// ── Fixture builders (inline Zod-parse — the record IS validated) ────────────

function sampleArticle(overrides: Partial<CanonicalArticle> = {}): CanonicalArticle {
  return ArticleSchema.parse({
    id: "article-a",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/article-a",
      title: "Article A",
      author: "An Author",
      retrievedAt: "2026-08-15T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "0".repeat(64),
    },
    blocks: [
      { kind: "heading", level: 2, content: [{ text: "A Heading", marks: [] }] },
      { kind: "paragraph", content: [{ text: "alpha beta gamma delta", marks: [] }] },
      { kind: "paragraph", content: [{ text: "alpha beta gamma delta", marks: [] }] },
      { kind: "paragraph", content: [{ text: "epsilon zeta eta", marks: [] }] },
    ],
    footnotes: [],
    ...overrides,
  });
}

function sampleHighlight(overrides: Partial<HighlightRecord> = {}): HighlightRecord {
  return HighlightRecordSchema.parse({
    schemaVersion: 1,
    id: "hl-1",
    articleId: "article-a",
    revision: 1,
    position: { start: 0, end: 6 },
    quote: { prefix: "", exact: "epsilon zeta eta", suffix: "" },
    createdAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  });
}

function sampleNote(overrides: Partial<NoteRecord> = {}): NoteRecord {
  return NoteRecordSchema.parse({
    schemaVersion: 1,
    id: "note-1",
    highlightId: "hl-1",
    text: "a reader note",
    updatedAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  });
}

function sampleLocation(overrides: Partial<LocationRecord> = {}): LocationRecord {
  return LocationRecordSchema.parse({
    schemaVersion: 1,
    articleId: "article-a",
    revision: 1,
    graphemeOffset: 0,
    savedAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  });
}

function entry(
  highlight: HighlightRecord,
  status: HighlightEntry["status"],
  note?: NoteRecord,
): HighlightEntry {
  return note ? { highlight, status, note } : { highlight, status };
}

// The three deterministic tri-state highlights against sampleArticle().
const confidentHighlight = sampleHighlight(); // exact appears once
const ambiguousHighlight = sampleHighlight({
  id: "hl-amb",
  quote: { prefix: "", exact: "alpha beta gamma delta", suffix: "" },
});
const orphanInArticleHighlight = sampleHighlight({
  id: "hl-orph",
  quote: { prefix: "qqq ", exact: "this passage no longer exists", suffix: " rrr" },
});
// A highlight whose articleId maps to NO provided article.
const absentArticleHighlight = sampleHighlight({
  id: "hl-absent",
  articleId: "article-x",
  quote: { prefix: "", exact: "quote from a vanished article", suffix: "" },
});

// ── renderArticleHighlights — the locked per-article template ───────────────

describe("renderArticleHighlights (D9-08 template, byte-for-byte)", () => {
  it("renders a confident entry: heading, quote line, citation line with source, Note line, footer", () => {
    const article = sampleArticle();
    const out = renderArticleHighlights(article, [
      entry(confidentHighlight, "confident", sampleNote()),
    ]);
    expect(out).toBe(
      [
        "# Highlights — Article A",
        "",
        "> epsilon zeta eta",
        "> — An Author, *Article A* ([source](https://example.com/article-a))",
        "> Note: a reader note",
        "",
        "_1 highlights · 0 ambiguous · 0 orphan_",
      ].join("\n"),
    );
  });

  it("omits the author and comma when provenance.author is absent; omits the source suffix when sourceUrl is absent", () => {
    const article = sampleArticle({
      provenance: {
        sourceUrl: undefined,
        title: "Paste Piece",
        retrievedAt: "2026-08-15T00:00:00.000Z",
        originalHtmlHash: "sha256:" + "0".repeat(64),
      },
    });
    const out = renderArticleHighlights(article, [entry(confidentHighlight, "confident")]);
    expect(out).toContain("> — *Paste Piece*\n");
    expect(out).not.toContain("An Author");
    expect(out).not.toContain("([source]");
  });

  it("prefixes the ambiguous quote line with the italic approx marker", () => {
    const out = renderArticleHighlights(sampleArticle(), [entry(ambiguousHighlight, "ambiguous")]);
    expect(out).toContain("\n> *[approx]* alpha beta gamma delta\n");
  });

  it("prefixes the orphan quote line with the orphan marker", () => {
    const out = renderArticleHighlights(sampleArticle(), [
      entry(orphanInArticleHighlight, "orphan"),
    ]);
    expect(out).toContain("\n> *[orphan]* this passage no longer exists\n");
  });

  it("D9-09 never-drop: an orphan entry (article absent from the provided articles) still renders BOTH its stored quote line and its Note line", () => {
    // End-to-end form: collect with NO articles → orphan; render from stored
    // highlight.quote.exact. Both lines must survive.
    const [collected] = collectHighlightEntries(
      [],
      [absentArticleHighlight],
      [
        sampleNote({
          highlightId: "hl-absent",
          text: "Keep my note even though the article is gone.",
        }),
      ],
    );
    expect(collected?.status).toBe("orphan");
    expect(collected?.note?.text).toBe("Keep my note even though the article is gone.");

    const out = renderArticleHighlights(sampleArticle(), [
      entry(
        absentArticleHighlight,
        "orphan",
        sampleNote({
          highlightId: "hl-absent",
          text: "Keep my note even though the article is gone.",
        }),
      ),
    ]);
    expect(out).toContain("> *[orphan]* quote from a vanished article");
    expect(out).toContain("> Note: Keep my note even though the article is gone.");
  });

  it("emits the exact-counts footer for a mixed set of three entries", () => {
    const out = renderArticleHighlights(sampleArticle(), [
      entry(confidentHighlight, "confident"),
      entry(ambiguousHighlight, "ambiguous"),
      entry(orphanInArticleHighlight, "orphan"),
    ]);
    expect(out).toContain("\n_3 highlights · 1 ambiguous · 1 orphan_");
  });
});

// ── escapeMarkdownLine (T-9-05 — structure-injection guard) ─────────────────

describe("escapeMarkdownLine", () => {
  it("backslash-escapes a leading hash run", () => {
    expect(escapeMarkdownLine("## Not a heading")).toBe("\\#\\# Not a heading");
  });

  it("escapes each of the single-char list/bullet/quote markers at line start", () => {
    expect(escapeMarkdownLine("- dash item")).toBe("\\- dash item");
    expect(escapeMarkdownLine("+ plus item")).toBe("\\+ plus item");
    expect(escapeMarkdownLine("* star item")).toBe("\\* star item");
    expect(escapeMarkdownLine("> quoted")).toBe("\\> quoted");
  });

  it("escapes the period of a leading digit-run-then-period (ordered-list guard) without corrupting the digits", () => {
    // CommonMark backslash escapes apply only before ASCII punctuation —
    // escaping a digit would leak a literal backslash into the text.
    expect(escapeMarkdownLine("1974. Event")).toBe("1974\\. Event");
    expect(escapeMarkdownLine("42. answer")).toBe("42\\. answer");
  });

  it("leaves mid-text punctuation untouched (no over-escaping)", () => {
    const line = "Keep 1. this # mid - text * as > plain + plus";
    expect(escapeMarkdownLine(line)).toBe(line);
  });

  it("leaves plain text with no leading structure run unchanged", () => {
    expect(escapeMarkdownLine("Plain reading text.")).toBe("Plain reading text.");
  });

  it("escapes a leading structure run inside a rendered quote line", () => {
    const h = sampleHighlight({
      id: "hl-hash",
      quote: { prefix: "", exact: "# not a heading inside the quote", suffix: "" },
    });
    const out = renderArticleHighlights(sampleArticle(), [entry(h, "confident")]);
    expect(out).toContain("> \\# not a heading inside the quote");
    expect(out).not.toContain("\n> # ");
  });
});

// ── Plan 19-02 (D19-12): multi-line quote.exact export ───────────────────────

describe("Plan 19-02 (D19-12): multi-line quote.exact renders as ONE entry", () => {
  it("renders a two-block span as two `> ` continuation lines in ONE entry, with the status marker on line 1 only", () => {
    const span = sampleHighlight({
      id: "hl-span",
      quote: { prefix: "", exact: "opening paragraph text\nsecond block text", suffix: "" },
    });
    const out = renderArticleHighlights(sampleArticle(), [entry(span, "ambiguous")]);
    expect(out).toContain("\n> *[approx]* opening paragraph text\n> second block text\n");
    // The marker prefixes ONLY the first line — continuation lines are bare
    // blockquote lines (one entry, not one entry per block).
    expect(out).not.toContain("\n> *[approx]* second block text");
    expect(out).not.toContain("\n> *[orphan]* ");
  });

  it("escapes structure-forging continuation lines per line (V5 guard — no unescaped # or list marker can leave the blockquote)", () => {
    const hostile = sampleHighlight({
      id: "hl-hostile",
      quote: {
        prefix: "",
        exact: "innocent opening\n# Forged heading\n1974. Event\n- forged list item",
        suffix: "",
      },
    });
    const out = renderArticleHighlights(sampleArticle(), [entry(hostile, "confident")]);
    // Each continuation line carries escapeMarkdownLine's actual contract:
    // per-char backslash escapes for a leading symbol run, period-only
    // escape for a leading ordered-list marker.
    expect(out).toContain("\n> \\# Forged heading");
    expect(out).toContain("\n> 1974\\. Event");
    expect(out).toContain("\n> \\- forged list item");
    // No unescaped structure-forging exported line exists anywhere.
    expect(out).not.toContain("\n> # ");
    expect(out).not.toContain("\n> 1974. ");
    expect(out).not.toContain("\n> - ");
  });

  it("round-trips a code-block highlight's verbatim multi-line source in full (no truncation)", () => {
    const code = "const a = 1;\nconst b = 2;\nreturn a + b;";
    const codeHighlight = sampleHighlight({
      id: "hl-code",
      quote: { prefix: "", exact: code, suffix: "" },
    });
    const out = renderArticleHighlights(sampleArticle(), [entry(codeHighlight, "confident")]);
    // Export completeness (D19-12): every source line survives as its own
    // `> ` continuation line — the ellipsis is a review-surface behavior
    // only and never appears in export.
    expect(out).toContain("> const a = 1;\n> const b = 2;\n> return a + b;");
    for (const line of code.split("\n")) {
      expect(out).toContain(`> ${line}`);
    }
    expect(out).not.toContain("…");
  });

  it("preserves empty continuation fragments (consecutive block breaks round-trip verbatim — never collapsed)", () => {
    const gapped = sampleHighlight({
      id: "hl-gap",
      quote: { prefix: "", exact: "para one\n\npara three", suffix: "" },
    });
    const out = renderArticleHighlights(sampleArticle(), [entry(gapped, "confident")]);
    // The middle empty fragment yields its own "> " continuation line, so
    // the block-break count is preserved verbatim.
    expect(out).toContain("\n> para one\n> \n> para three\n");
  });

  it("keeps the citation and Note lines after the quote block in their existing single-line shapes and positions", () => {
    const span = sampleHighlight({
      id: "hl-span-note",
      quote: { prefix: "", exact: "first fragment\nsecond fragment", suffix: "" },
    });
    const out = renderArticleHighlights(sampleArticle(), [
      entry(span, "confident", sampleNote()),
    ]);
    expect(out).toContain(
      "\n> first fragment\n> second fragment\n> — An Author, *Article A* ([source](https://example.com/article-a))\n> Note: a reader note\n",
    );
  });
});

// ── collectHighlightEntries — live tri-state via the shipped resolver ───────

describe("collectHighlightEntries", () => {
  it("resolves live status for highlights whose article is provided and maps absent articles to orphan", () => {
    const notes = [sampleNote({ highlightId: "hl-absent", text: "orphan note" })];
    const entries = collectHighlightEntries(
      [sampleArticle()],
      [confidentHighlight, ambiguousHighlight, orphanInArticleHighlight, absentArticleHighlight],
      notes,
    );
    expect(entries.map((e) => e.status)).toEqual(["confident", "ambiguous", "orphan", "orphan"]);
    // The note attached by highlightId rides on the absent-article entry.
    expect(entries[3]?.note?.text).toBe("orphan note");
  });

  it("skips a note with no matching highlight (never-drop applies to notes OF highlights)", () => {
    const entries = collectHighlightEntries(
      [sampleArticle()],
      [confidentHighlight],
      [sampleNote({ highlightId: "no-such-highlight" })],
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.note).toBeUndefined();
  });
});

// ── renderLibraryHighlights — the combined library-wide file ────────────────

describe("renderLibraryHighlights", () => {
  it("emits the h1, one h2 section per article with per-section footers, and the totals footer", () => {
    const articleA = sampleArticle();
    const articleB = sampleArticle({
      id: "article-b",
      provenance: {
        sourceUrl: "https://example.com/article-b",
        title: "Article B",
        author: "Another Author",
        retrievedAt: "2026-08-15T00:00:00.000Z",
        originalHtmlHash: "sha256:" + "0".repeat(64),
      },
    });
    const out = renderLibraryHighlights([
      {
        article: articleA,
        entries: [entry(confidentHighlight, "confident"), entry(ambiguousHighlight, "ambiguous")],
      },
      {
        article: articleB,
        entries: [entry(orphanInArticleHighlight, "orphan")],
      },
    ]);
    expect(out).toBe(
      [
        "# Highlights",
        "",
        "## Article A",
        "",
        "> epsilon zeta eta",
        "> — An Author, *Article A* ([source](https://example.com/article-a))",
        "",
        "> *[approx]* alpha beta gamma delta",
        "> — An Author, *Article A* ([source](https://example.com/article-a))",
        "",
        "_2 highlights · 1 ambiguous · 0 orphan_",
        "",
        "## Article B",
        "",
        "> *[orphan]* this passage no longer exists",
        "> — Another Author, *Article B* ([source](https://example.com/article-b))",
        "",
        "_1 highlights · 0 ambiguous · 1 orphan_",
        "",
        "_Totals: 3 highlights · 1 ambiguous · 1 orphan_",
      ].join("\n"),
    );
  });

  it("D9-09 never-drop: unmatched entries render as a trailing citation-less section and count in the totals", () => {
    // Plan 09-06 Rule 2 regression lock: a highlight whose article exists
    // NOWHERE in the export set must still reach the combined file (with its
    // note) instead of being silently dropped by the grouping step.
    const out = renderLibraryHighlights(
      [{ article: sampleArticle(), entries: [entry(confidentHighlight, "confident")] }],
      [
        entry(
          absentArticleHighlight,
          "orphan",
          sampleNote({
            highlightId: "hl-absent",
            text: "Keep my note even though the article is gone.",
          }),
        ),
      ],
    );
    expect(out).toContain("## Highlights without an article");
    expect(out).toContain("> *[orphan]* quote from a vanished article");
    expect(out).toContain("> Note: Keep my note even though the article is gone.");
    // No citation line exists for a vanished article.
    expect(out).not.toContain("vanished article ([source]");
    expect(out).toContain("_1 highlights · 0 ambiguous · 1 orphan_");
    expect(out).toContain("_Totals: 2 highlights · 0 ambiguous · 1 orphan_");
  });

  it("omits the unmatched section entirely when there are no unmatched entries (byte-stable legacy shape)", () => {
    const out = renderLibraryHighlights([
      { article: sampleArticle(), entries: [entry(confidentHighlight, "confident")] },
    ]);
    expect(out).not.toContain("Highlights without an article");
    expect(out).toContain("_Totals: 1 highlights · 0 ambiguous · 0 orphan_");
  });
});

// ── orderSectionsByRecency ──────────────────────────────────────────────────

describe("orderSectionsByRecency", () => {
  const sectionA = { article: sampleArticle(), entries: [] };
  const sectionB = {
    article: sampleArticle({
      id: "article-b",
      provenance: {
        sourceUrl: "https://example.com/article-b",
        title: "Article B",
        retrievedAt: "2026-08-15T00:00:00.000Z",
        originalHtmlHash: "sha256:" + "0".repeat(64),
      },
    }),
    entries: [],
  };
  const sectionCabin = {
    article: sampleArticle({
      id: "article-c",
      provenance: {
        title: "Cabin",
        retrievedAt: "2026-08-15T00:00:00.000Z",
        originalHtmlHash: "sha256:" + "0".repeat(64),
      },
    }),
    entries: [],
  };
  const sectionZebra = {
    article: sampleArticle({
      id: "article-z",
      provenance: {
        title: "Zebra",
        retrievedAt: "2026-08-15T00:00:00.000Z",
        originalHtmlHash: "sha256:" + "0".repeat(64),
      },
    }),
    entries: [],
  };

  it("sorts located sections by savedAt descending first; unlocated follow by title ascending", () => {
    const locations = [
      sampleLocation({ articleId: "article-b", savedAt: "2026-08-10T00:00:00.000Z" }),
      sampleLocation({ articleId: "article-a", savedAt: "2026-08-14T00:00:00.000Z" }),
    ];
    const ordered = orderSectionsByRecency(
      [sectionA, sectionB, sectionCabin, sectionZebra],
      locations,
    );
    expect(ordered.map((s) => s.article.id)).toEqual([
      "article-a", // newest savedAt
      "article-b", // older savedAt
      "article-c", // no location → title asc
      "article-z",
    ]);
  });

  it("uses the LATEST savedAt when an article has location rows across revisions", () => {
    const locations = [
      sampleLocation({ articleId: "article-a", revision: 1, savedAt: "2026-08-01T00:00:00.000Z" }),
      sampleLocation({ articleId: "article-a", revision: 2, savedAt: "2026-08-12T00:00:00.000Z" }),
      sampleLocation({ articleId: "article-b", revision: 1, savedAt: "2026-08-05T00:00:00.000Z" }),
    ];
    const ordered = orderSectionsByRecency([sectionA, sectionB], locations);
    // article-a's latest (08-12) > article-b's (08-05) → a first.
    expect(ordered.map((s) => s.article.id)).toEqual(["article-a", "article-b"]);
  });

  it("returns a copy — the input array is not mutated", () => {
    const input = [sectionZebra, sectionCabin];
    const ordered = orderSectionsByRecency(input, []);
    expect(ordered.map((s) => s.article.id)).toEqual(["article-c", "article-z"]);
    expect(input.map((s) => s.article.id)).toEqual(["article-z", "article-c"]);
  });
});

// ── Plan 17-03 (META-02 / D17-09) — effective (reader-owned) values in export ─

describe("Plan 17-03: markdown export on effective (reader-owned) metadata", () => {
  it("D17-09 override present: citation + headings carry the override values; the canonical title does NOT appear in the export (one name)", () => {
    const article = sampleArticle({
      readerTitle: "My Renamed Piece",
      readerAuthor: "Reader-Chosen Name",
    });
    const out = renderArticleHighlights(article, [
      entry(confidentHighlight, "confident"),
    ]);
    expect(out).toContain("# Highlights — My Renamed Piece");
    expect(out).toContain(
      "> — Reader-Chosen Name, *My Renamed Piece* ([source](https://example.com/article-a))",
    );
    // The canonical strings are absent entirely — the override is the ONE
    // name/identity the exported artifact carries (D17-09/D17-08).
    expect(out).not.toContain("Article A");
    expect(out).not.toContain("An Author");

    // The library-wide file's `## {article title}` section heading too.
    const combined = renderLibraryHighlights([
      { article, entries: [entry(confidentHighlight, "confident")] },
    ]);
    expect(combined).toContain("## My Renamed Piece");
    expect(combined).not.toContain("## Article A");
  });

  it("regression: an article without overrides renders canonical values exactly as before (byte-stable)", () => {
    const out = renderArticleHighlights(sampleArticle(), [
      entry(confidentHighlight, "confident", sampleNote()),
    ]);
    expect(out).toBe(
      [
        "# Highlights — Article A",
        "",
        "> epsilon zeta eta",
        "> — An Author, *Article A* ([source](https://example.com/article-a))",
        "> Note: a reader note",
        "",
        "_1 highlights · 0 ambiguous · 0 orphan_",
      ].join("\n"),
    );
  });

  it("OQ5/A5 pinned: unlocated sections order by the EFFECTIVE title (sort keys use effective values)", () => {
    // Canonical titles would order article-a ("Article A") BEFORE
    // article-ovr ("Zebra Canonical"). The override "Aardvark Renamed"
    // must pull article-ovr to the FRONT — the sort key is the effective
    // title, not the canonical one.
    const overriddenSection = {
      article: sampleArticle({
        id: "article-ovr",
        provenance: {
          sourceUrl: "https://example.com/article-ovr",
          title: "Zebra Canonical",
          author: "Canonical Author",
          retrievedAt: "2026-08-15T00:00:00.000Z",
          originalHtmlHash: "sha256:" + "1".repeat(64),
        },
        readerTitle: "Aardvark Renamed",
      }),
      entries: [],
    };
    const canonicalSection = { article: sampleArticle(), entries: [] };
    const ordered = orderSectionsByRecency(
      [overriddenSection, canonicalSection],
      [],
    );
    expect(ordered.map((s) => s.article.id)).toEqual([
      "article-ovr", // effective "Aardvark Renamed"
      "article-a", // effective "Article A"
    ]);
  });
});
