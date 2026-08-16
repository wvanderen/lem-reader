// tests/unit/review-filter.test.ts
// Plan 10-01 Task 1 — pure-derivation coverage for the annotation review
// panel listing (RECV-01.d unit side + RECV-01.e unit side). Locked decisions:
//   - D10-05: never-drop — an absent article means status "orphan", the row is
//     KEPT (lands in orphanEntries, never silently filtered away).
//   - D10-08: filters AND-composed (tag + articleId + confidence); confidence
//     "all" includes ambiguous AND orphan rows.
//   - D10-13: tri-state re-derivation runs through resolveQuoteSelectorInText
//     with per-article memoized clusters (the Phase 9 conflicts pattern).
//   - Sorts: date = newest entry createdAt (ISO-8601 lexicographic) with
//     entries newest-first; article = title localeCompare with entries by
//     position.start; position = input articles-array order with entries by
//     position.start.
//
// Plain-Node fixture style mirroring tests/unit/library-search.test.ts: every
// article/highlight/note is constructed through the shipped Zod schemas, and
// the anchors derive through the shipped deriveQuoteSelector/
// findAllOccurrences machinery — NO Dexie, NO React, NO IO (reviewFilter.ts is
// a pure module; Node is authoritative for pure logic).
import { describe, expect, it } from "vitest";
import {
  deriveReviewSections,
  type ReviewFilters,
} from "../../src/routes/review/reviewFilter";
import {
  ArticleSchema,
  HighlightRecordSchema,
  NoteRecordSchema,
} from "../../src/content/schema";
import type {
  CanonicalArticle,
  HighlightRecord,
} from "../../src/content/schema";
import {
  deriveQuoteSelector,
  graphemeClusters,
  normalizeText,
} from "../../src/content/normalizeText";
import type {
  TextPositionSelector,
  TextQuoteSelector,
} from "../../src/content/normalizeText";
import { findAllOccurrences } from "../../src/annotations/resolution";

// ── Fixture construction (schema-validated, single source of truth) ──────────

function makeArticle(opts: {
  id: string;
  title: string;
  paragraphs: string[];
  tags?: string[];
}): CanonicalArticle {
  return ArticleSchema.parse({
    id: opts.id,
    revision: 1,
    lang: "en",
    provenance: {
      title: opts.title,
      retrievedAt: "2026-01-01T00:00:00.000Z",
      originalHtmlHash: "0".repeat(64),
    },
    blocks: opts.paragraphs.map((text) => ({
      kind: "paragraph",
      content: [{ text }],
    })),
    ...(opts.tags !== undefined ? { tags: opts.tags } : {}),
  });
}

/**
 * Derive a position+quote pair for a passage that appears EXACTLY ONCE in the
 * article's normalized text (the confident-anchor knob). Throws when the
 * passage is absent or duplicated so fixture drift can never silently weaken
 * a tri-state case. Reuses the shipped findAllOccurrences + deriveQuoteSelector
 * — never a forked offset computation.
 */
function uniqueAnchor(
  article: CanonicalArticle,
  exact: string,
): { position: TextPositionSelector; quote: TextQuoteSelector } {
  const clusters = graphemeClusters(normalizeText(article), article.lang);
  const exactClusters = graphemeClusters(exact, article.lang);
  const positions = findAllOccurrences(clusters, exactClusters);
  if (positions.length !== 1) {
    throw new Error(
      `fixture drift: expected "${exact}" exactly once in ${article.id}, got ${positions.length}`,
    );
  }
  const start = positions[0]!;
  const position = { start, end: start + exactClusters.length };
  return { position, quote: deriveQuoteSelector(article, position) };
}

/** A hand-built selector with NO disambiguating context (the duplicated-text
 * knob the e2e specs reuse: exact present N>1 times + empty prefix/suffix →
 * "ambiguous"; exact absent + empty prefix/suffix → "orphan"). */
function contextFreeAnchor(exact: string): {
  position: TextPositionSelector;
  quote: TextQuoteSelector;
} {
  return {
    position: { start: 0, end: graphemeClusters(exact, "en").length },
    quote: { prefix: "", exact, suffix: "" },
  };
}

function makeHighlight(opts: {
  id: string;
  articleId: string;
  anchor: { position: TextPositionSelector; quote: TextQuoteSelector };
  createdAt: string;
}): HighlightRecord {
  return HighlightRecordSchema.parse({
    schemaVersion: 1,
    id: opts.id,
    articleId: opts.articleId,
    revision: 1,
    position: opts.anchor.position,
    quote: opts.anchor.quote,
    createdAt: opts.createdAt,
  });
}

// ── Sample corpus ─────────────────────────────────────────────────────────────
// Three articles engineered so the THREE section sorts disagree (date order ≠
// title order ≠ input order) and the two entry sorts disagree within the zebra
// section (date: h-late newest first; position: h-early lowest start first).

const zebra = makeArticle({
  id: "zebra-piece",
  title: "Zebra piece",
  paragraphs: [
    "The quiet harbor opens before dawn and the fishing boats rest.",
    "Later the market fills with voices bargaining over the morning catch.",
    "By evening the lanterns glow along the seawall and the tide recedes.",
  ],
  tags: ["essay", "stoic"],
});

const alpha = makeArticle({
  id: "alpha-piece",
  title: "Alpha piece",
  paragraphs: [
    "A cartographer of clouds maps the weather nobody else records.",
    "Her notebooks hold a decade of storms drawn in pencil.",
  ],
  tags: ["essay"],
});

const AMBIGUOUS_SENTENCE = "The repeated refrain echoes once";
const twin = makeArticle({
  id: "twin-piece",
  title: "Twin piece",
  paragraphs: [
    `${AMBIGUOUS_SENTENCE} at the opening.`,
    "Something unique happens between the echoes here.",
    `${AMBIGUOUS_SENTENCE} again at the close.`,
  ],
  tags: [],
});

const hlEarly = makeHighlight({
  id: "hl-zebra-early",
  articleId: "zebra-piece",
  anchor: uniqueAnchor(zebra, "quiet harbor opens"),
  createdAt: "2026-01-20T10:00:00.000Z", // OLDER entry, LOWER position.start
});
const hlLate = makeHighlight({
  id: "hl-zebra-late",
  articleId: "zebra-piece",
  anchor: uniqueAnchor(zebra, "lanterns glow along"),
  createdAt: "2026-02-01T10:00:00.000Z", // NEWEST zebra entry, HIGHER start
});
const hlAlpha = makeHighlight({
  id: "hl-alpha",
  articleId: "alpha-piece",
  anchor: uniqueAnchor(alpha, "cartographer of clouds"),
  createdAt: "2026-03-01T10:00:00.000Z", // newest in the whole corpus
});
const hlAmbiguous = makeHighlight({
  id: "hl-twin-ambiguous",
  articleId: "twin-piece",
  anchor: contextFreeAnchor(AMBIGUOUS_SENTENCE),
  createdAt: "2026-01-15T10:00:00.000Z",
});
const hlGhost = makeHighlight({
  id: "hl-ghost",
  articleId: "ghost-article", // absent article — the D10-05 orphan knob
  anchor: uniqueAnchor(zebra, "market fills with voices"),
  createdAt: "2026-01-10T10:00:00.000Z",
});

const noteOnAlpha = NoteRecordSchema.parse({
  schemaVersion: 1,
  id: "note-alpha",
  highlightId: "hl-alpha",
  text: "Remember this passage",
  updatedAt: "2026-03-01T11:00:00.000Z",
});

const sampleArticles = [twin, zebra, alpha]; // input order ≠ date ≠ title order
const sampleHighlights = [hlEarly, hlLate, hlAlpha, hlAmbiguous, hlGhost];
const sampleNotes = [noteOnAlpha];

const noFilters: ReviewFilters = {
  tag: null,
  articleId: null,
  confidence: "all",
};

// ── Join + tri-state classification (D10-05 / D10-13) ────────────────────────

describe("deriveReviewSections — join + tri-state classification", () => {
  it("absent article → status 'orphan', row KEPT, lands in orphanEntries not sections (D10-05)", () => {
    const derivation = deriveReviewSections(
      sampleArticles,
      sampleHighlights,
      sampleNotes,
      noFilters,
      "date",
    );
    expect(derivation.orphanEntries).toHaveLength(1);
    expect(derivation.orphanEntries[0]!.highlight.id).toBe("hl-ghost");
    expect(derivation.orphanEntries[0]!.status).toBe("orphan");
    expect(derivation.orphanEntries[0]!.article).toBeUndefined();
    // Every highlight is accounted for exactly once — never dropped.
    const sectionEntryCount = derivation.sections.reduce(
      (n, s) => n + s.entries.length,
      0,
    );
    expect(sectionEntryCount).toBe(4); // hl-early, hl-late, hl-alpha, hl-ambiguous
    expect(
      derivation.sections.some((s) => s.key === "ghost-article"),
    ).toBe(false);
  });

  it("quote matching the article body exactly once → status 'confident'", () => {
    const derivation = deriveReviewSections(
      sampleArticles,
      sampleHighlights,
      sampleNotes,
      noFilters,
      "date",
    );
    const alphaSection = derivation.sections.find(
      (s) => s.article.id === "alpha-piece",
    );
    const entry = alphaSection?.entries.find(
      (e) => e.highlight.id === "hl-alpha",
    );
    expect(entry?.status).toBe("confident");
  });

  it("quote text duplicated inside one article body → status 'ambiguous'", () => {
    const derivation = deriveReviewSections(
      sampleArticles,
      sampleHighlights,
      sampleNotes,
      noFilters,
      "date",
    );
    const twinSection = derivation.sections.find(
      (s) => s.article.id === "twin-piece",
    );
    const entry = twinSection?.entries.find(
      (e) => e.highlight.id === "hl-twin-ambiguous",
    );
    expect(entry?.status).toBe("ambiguous");
  });

  it("article present but quote unresolvable → status 'orphan', row kept in its section", () => {
    const drifted = makeHighlight({
      id: "hl-drifted",
      articleId: "zebra-piece",
      anchor: contextFreeAnchor(
        "this passage was edited away from the article body entirely",
      ),
      createdAt: "2026-01-05T10:00:00.000Z",
    });
    const derivation = deriveReviewSections(
      [zebra],
      [drifted],
      [],
      noFilters,
      "date",
    );
    expect(derivation.sections).toHaveLength(1);
    expect(derivation.sections[0]!.entries).toHaveLength(1);
    expect(derivation.sections[0]!.entries[0]!.status).toBe("orphan");
    expect(derivation.orphanEntries).toHaveLength(0); // article exists — not the tail
  });

  it("multiple highlights on one article each classify through the shared per-article clusters (D10-13 memoized path)", () => {
    const derivation = deriveReviewSections(
      [zebra],
      [hlEarly, hlLate],
      [],
      noFilters,
      "date",
    );
    const statuses = derivation.sections[0]!.entries.map((e) => e.status);
    expect(statuses).toEqual(["confident", "confident"]);
  });

  it("note join — a highlight with a matching NoteRecord carries note on its entry; others have none", () => {
    const derivation = deriveReviewSections(
      sampleArticles,
      sampleHighlights,
      sampleNotes,
      noFilters,
      "date",
    );
    const alphaSection = derivation.sections.find(
      (s) => s.article.id === "alpha-piece",
    );
    const withNote = alphaSection?.entries.find(
      (e) => e.highlight.id === "hl-alpha",
    );
    expect(withNote?.note?.text).toBe("Remember this passage");
    const zebraSection = derivation.sections.find(
      (s) => s.article.id === "zebra-piece",
    );
    for (const entry of zebraSection?.entries ?? []) {
      expect(entry.note).toBeUndefined();
    }
  });
});

// ── Filters (D10-08 — AND-composed; "all" never silently filters tri-state) ──

describe("deriveReviewSections — filters", () => {
  it("confidence 'all' includes confident AND ambiguous AND orphan rows", () => {
    const derivation = deriveReviewSections(
      sampleArticles,
      sampleHighlights,
      sampleNotes,
      { tag: null, articleId: null, confidence: "all" },
      "date",
    );
    const statuses = derivation.sections
      .flatMap((s) => s.entries.map((e) => e.status))
      .sort();
    expect(statuses).toEqual(["ambiguous", "confident", "confident", "confident"]);
    expect(derivation.orphanEntries.map((e) => e.status)).toEqual(["orphan"]);
  });

  it("confidence 'orphan' returns only orphan rows (here: the orphanEntries tail)", () => {
    const derivation = deriveReviewSections(
      sampleArticles,
      sampleHighlights,
      sampleNotes,
      { tag: null, articleId: null, confidence: "orphan" },
      "date",
    );
    expect(derivation.sections).toEqual([]); // no article-backed orphan in this corpus
    expect(derivation.orphanEntries).toHaveLength(1);
    expect(derivation.orphanEntries[0]!.highlight.id).toBe("hl-ghost");
  });

  it("tag filter keeps only highlights whose article carries the tag; orphans (no article) are excluded while a tag filter is active", () => {
    const derivation = deriveReviewSections(
      sampleArticles,
      sampleHighlights,
      sampleNotes,
      { tag: "stoic", articleId: null, confidence: "all" },
      "date",
    );
    expect(derivation.sections).toHaveLength(1);
    expect(derivation.sections[0]!.article.id).toBe("zebra-piece");
    expect(derivation.sections[0]!.entries.map((e) => e.highlight.id)).toEqual([
      "hl-zebra-late",
      "hl-zebra-early",
    ]);
    expect(derivation.orphanEntries).toEqual([]); // ghost has no article to carry the tag
  });

  it("articleId filter keeps only that article's highlights", () => {
    const derivation = deriveReviewSections(
      sampleArticles,
      sampleHighlights,
      sampleNotes,
      { tag: null, articleId: "alpha-piece", confidence: "all" },
      "date",
    );
    expect(derivation.sections).toHaveLength(1);
    expect(derivation.sections[0]!.entries.map((e) => e.highlight.id)).toEqual([
      "hl-alpha",
    ]);
    expect(derivation.orphanEntries).toEqual([]);
  });

  it("tag + articleId + confidence AND together (empty when incompatible)", () => {
    const impossible = deriveReviewSections(
      sampleArticles,
      sampleHighlights,
      sampleNotes,
      { tag: "stoic", articleId: "alpha-piece", confidence: "all" },
      "date",
    );
    expect(impossible.sections).toEqual([]);
    expect(impossible.orphanEntries).toEqual([]);

    const compatible = deriveReviewSections(
      sampleArticles,
      sampleHighlights,
      sampleNotes,
      { tag: "essay", articleId: "zebra-piece", confidence: "confident" },
      "date",
    );
    expect(compatible.sections).toHaveLength(1);
    expect(compatible.sections[0]!.entries.map((e) => e.highlight.id)).toEqual([
      "hl-zebra-late",
      "hl-zebra-early",
    ]);
  });
});

// ── Sorts (three key precedents; corpus engineered so they disagree) ─────────

describe("deriveReviewSections — sorts", () => {
  it("sort 'date' — sections by newest entry createdAt descending; entries within a section newest-first", () => {
    const derivation = deriveReviewSections(
      sampleArticles,
      sampleHighlights,
      sampleNotes,
      noFilters,
      "date",
    );
    // Newest per section: alpha 2026-03-01 > zebra 2026-02-01 > twin 2026-01-15.
    expect(derivation.sections.map((s) => s.article.id)).toEqual([
      "alpha-piece",
      "zebra-piece",
      "twin-piece",
    ]);
    const zebraSection = derivation.sections.find(
      (s) => s.article.id === "zebra-piece",
    );
    expect(zebraSection?.entries.map((e) => e.highlight.id)).toEqual([
      "hl-zebra-late", // 2026-02-01 — newest first
      "hl-zebra-early", // 2026-01-20
    ]);
  });

  it("sort 'article' — sections by provenance.title localeCompare; entries ascending by position.start", () => {
    const derivation = deriveReviewSections(
      sampleArticles,
      sampleHighlights,
      sampleNotes,
      noFilters,
      "article",
    );
    expect(derivation.sections.map((s) => s.article.provenance.title)).toEqual([
      "Alpha piece",
      "Twin piece",
      "Zebra piece",
    ]);
    const zebraSection = derivation.sections.find(
      (s) => s.article.id === "zebra-piece",
    );
    expect(zebraSection?.entries.map((e) => e.highlight.id)).toEqual([
      "hl-zebra-early", // lower position.start — reading order
      "hl-zebra-late",
    ]);
  });

  it("sort 'position' — sections in the input articles-array order; entries ascending by position.start", () => {
    const derivation = deriveReviewSections(
      sampleArticles, // [twin, zebra, alpha] — deliberately ≠ date ≠ title order
      sampleHighlights,
      sampleNotes,
      noFilters,
      "position",
    );
    expect(derivation.sections.map((s) => s.article.id)).toEqual([
      "twin-piece",
      "zebra-piece",
      "alpha-piece",
    ]);
    const zebraSection = derivation.sections.find(
      (s) => s.article.id === "zebra-piece",
    );
    expect(zebraSection?.entries.map((e) => e.highlight.id)).toEqual([
      "hl-zebra-early",
      "hl-zebra-late",
    ]);
  });

  it("section key is the article id", () => {
    const derivation = deriveReviewSections(
      sampleArticles,
      sampleHighlights,
      sampleNotes,
      noFilters,
      "date",
    );
    for (const section of derivation.sections) {
      expect(section.key).toBe(section.article.id);
    }
  });
});

// ── Purity ────────────────────────────────────────────────────────────────────

describe("deriveReviewSections — purity", () => {
  it("does not mutate inputs (deep-equal snapshot before/after)", () => {
    const articlesSnapshot = structuredClone(sampleArticles);
    const highlightsSnapshot = structuredClone(sampleHighlights);
    const notesSnapshot = structuredClone(sampleNotes);
    deriveReviewSections(
      sampleArticles,
      sampleHighlights,
      sampleNotes,
      { tag: "essay", articleId: null, confidence: "all" },
      "article",
    );
    expect(sampleArticles).toEqual(articlesSnapshot);
    expect(sampleHighlights).toEqual(highlightsSnapshot);
    expect(sampleNotes).toEqual(notesSnapshot);
  });
});
