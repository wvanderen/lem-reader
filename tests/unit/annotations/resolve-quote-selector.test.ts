// tests/unit/annotations/resolve-quote-selector.test.ts
// ANNO-07 tri-state proof for resolveQuoteSelector (D5-02 algorithm). Mirrors
// tests/unit/selectors.test.ts conventions: parseArticle helper, baseArticle
// fixture, jsdom-safe pure-logic assertions.
//
// Covers the four resolution branches:
//   - unique exact          → confident (positionHint IGNORED — the text IS the anchor)
//   - N>1 exact after prefix/suffix disambiguation → "ambiguous"
//   - zero exact, no fallback → "orphan"
//   - zero exact, exactly one prefix/suffix fallback → confident (low-certainty)
//
// Cross-revision scenarios are simulated by deriving a selector against one
// article and resolving against an EDITED article (the canonical ANNO-07
// reachability path per D5-01).
import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../../src/content/schema";
import {
  BLOCK_SEPARATOR,
  deriveQuoteSelector,
  graphemeLength,
  normalizeText,
  resolveQuoteSelector,
} from "../../../src/content/normalizeText";
import type { CanonicalArticle } from "../../../src/content/types";
import type {
  TextPositionSelector,
  TextQuoteSelector,
} from "../../../src/content/normalizeText";

function parseArticle(raw: unknown): CanonicalArticle {
  return ArticleSchema.parse(raw);
}

const baseArticle = {
  id: "resolve-test",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/resolve",
    title: "Resolve Test",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "sha256:resolve",
  },
};

/** Build a single-paragraph article whose body text is `text`. */
function singleParagraphArticle(text: string): CanonicalArticle {
  return parseArticle({
    ...baseArticle,
    blocks: [{ kind: "paragraph", content: [{ text }] }],
  });
}

/**
 * Derive a quote selector for a substring of `text`, then return both the
 * selector and the original position. `needle` must appear exactly once in
 * `text` (so the derived selector resolves uniquely on the original article).
 */
function deriveForUniqueSubstring(
  text: string,
  needle: string,
): { selector: TextQuoteSelector; position: TextPositionSelector } {
  const charStart = text.indexOf(needle);
  if (charStart < 0) throw new Error(`needle not found: ${needle}`);
  // For ASCII text, char offset === grapheme offset. The articles below are
  // ASCII so this is exact.
  const position: TextPositionSelector = {
    start: charStart,
    end: charStart + needle.length,
  };
  const article = singleParagraphArticle(text);
  const selector = deriveQuoteSelector(article, position);
  return { selector, position };
}

// ── Step 2: unique exact → confident (positionHint ignored) ──────────────────

describe("resolveQuoteSelector — unique exact → confident", () => {
  it("returns the original TextPositionSelector when exact matches uniquely", () => {
    const text = "the quick brown fox jumps over the lazy dog";
    const { selector, position } = deriveForUniqueSubstring(text, "brown");
    const article = singleParagraphArticle(text);
    const resolved = resolveQuoteSelector(article, selector, position);
    expect(resolved).not.toBe("ambiguous");
    expect(resolved).not.toBe("orphan");
    expect(resolved as TextPositionSelector).toEqual(position);
  });

  it("ignores the positionHint when exact matches uniquely (ANNO-07 — never silently re-attach)", () => {
    const text = "the quick brown fox jumps over the lazy dog";
    const { selector } = deriveForUniqueSubstring(text, "brown");
    const article = singleParagraphArticle(text);
    // Pass a misleading hint pointing far away — unique exact must still win.
    const misleadingHint: TextPositionSelector = { start: 0, end: 5 };
    const resolved = resolveQuoteSelector(article, selector, misleadingHint);
    expect(resolved as TextPositionSelector).toEqual({ start: 10, end: 15 });
  });
});

// ── Step 3: N>1 exact after prefix/suffix disambiguation → "ambiguous" ───────

describe("resolveQuoteSelector — N>1 exact → ambiguous", () => {
  it("returns 'ambiguous' when the exact text appears multiple times with identical context", () => {
    // "repeat repeat" — the word "repeat" appears twice with the SAME context
    // (the surrounding text is symmetric so prefix/suffix cannot distinguish).
    const text = "alpha repeat beta repeat gamma";
    const { position } = deriveForUniqueSubstring(text, "repeat");
    // The derived selector was captured at the FIRST "repeat"; resolving again
    // finds BOTH occurrences. Prefix for the first is "alpha ", for the second
    // is "beta " — these differ, so disambiguation SHOULD narrow to one.
    // To force ambiguous, build a selector whose prefix/suffix match BOTH.
    const article = singleParagraphArticle(text);
    const ambiguousSelector: TextQuoteSelector = {
      prefix: "",
      exact: "repeat",
      suffix: " ",
    };
    const resolved = resolveQuoteSelector(article, ambiguousSelector, position);
    expect(resolved).toBe("ambiguous");
  });

  it("disambiguates by prefix/suffix when only one candidate matches the context", () => {
    const text = "alpha unique beta duplicate gamma duplicate delta";
    // "duplicate" appears twice but with different surrounding context.
    const firstIdx = text.indexOf("duplicate");
    const position: TextPositionSelector = {
      start: firstIdx,
      end: firstIdx + "duplicate".length,
    };
    const article = singleParagraphArticle(text);
    const selector = deriveQuoteSelector(article, position);
    // First "duplicate" has prefix "beta " + suffix " gamma"; second has
    // prefix "gamma " + suffix " delta". The derived selector's prefix/suffix
    // match only the first → confident.
    const resolved = resolveQuoteSelector(article, selector, position);
    expect(resolved as TextPositionSelector).toEqual(position);
  });
});

// ── Step 4: zero exact → orphan ──────────────────────────────────────────────

describe("resolveQuoteSelector — zero exact → orphan", () => {
  it("returns 'orphan' when the exact text is absent and no prefix/suffix fallback matches", () => {
    const originalText = "the original passage that will disappear";
    const { selector, position } = deriveForUniqueSubstring(
      originalText,
      "original passage",
    );
    // Edited article: the passage is completely gone, and the prefix/suffix
    // context does not co-occur anywhere.
    const editedText = "a totally different set of words with no overlap";
    const editedArticle = singleParagraphArticle(editedText);
    const resolved = resolveQuoteSelector(editedArticle, selector, position);
    expect(resolved).toBe("orphan");
  });

  it("returns 'orphan' when the exact text is absent and prefix/suffix context is empty (capture at text start)", () => {
    // A selector captured at the very beginning has prefix="" — no fallback
    // substrate to search. With the exact text gone, it must orphan.
    const originalText = "headline that will be edited away";
    const article = singleParagraphArticle(originalText);
    const position: TextPositionSelector = { start: 0, end: 8 };
    const selector = deriveQuoteSelector(article, position);
    expect(selector.prefix).toBe(""); // sanity: captured at start

    const editedArticle = singleParagraphArticle("totally different content here");
    const resolved = resolveQuoteSelector(editedArticle, selector, position);
    expect(resolved).toBe("orphan");
  });
});

// ── Step 4: zero exact → prefix/suffix unique → confident (low-certainty) ────

describe("resolveQuoteSelector — zero exact + unique prefix/suffix → confident", () => {
  it("returns a confident position when the exact text changed but prefix+suffix uniquely co-occur", () => {
    // Original: prefix="alpha " exact="middle" suffix=" omega"
    const originalText = "alpha middle omega rest of article";
    const { selector, position } = deriveForUniqueSubstring(
      originalText,
      "middle",
    );
    // Edited: "middle" → "CHANGED", but "alpha " still precedes and " omega"
    // still follows. Exactly one prefix+suffix candidate → confident.
    const editedText = "alpha CHANGED omega rest of article";
    const editedArticle = singleParagraphArticle(editedText);
    const resolved = resolveQuoteSelector(editedArticle, selector, position);
    expect(resolved).not.toBe("ambiguous");
    expect(resolved).not.toBe("orphan");
    const pos = resolved as TextPositionSelector;
    // The candidate starts right after "alpha " (offset 6) and ends where
    // " omega" begins (offset 6 + 7 = 13).
    expect(pos.start).toBe(6);
    expect(pos.end).toBe(13);
  });
});

// ── Same-revision fast path (the common case) ────────────────────────────────

describe("resolveQuoteSelector — same-revision resolves at the original offset", () => {
  it("an offset round-trips through derive → resolve on the same article", () => {
    const text =
      "a sufficiently long passage so the context radius captures meaningful surrounding text here";
    const { selector, position } = deriveForUniqueSubstring(text, "passage");
    const article = singleParagraphArticle(text);
    const resolved = resolveQuoteSelector(article, selector, position);
    expect(resolved as TextPositionSelector).toEqual(position);
  });

  it("uses the full normalizeText(article) including multi-block separators", () => {
    const article = parseArticle({
      ...baseArticle,
      blocks: [
        { kind: "heading", level: 2, content: [{ text: "Section Title" }] },
        { kind: "paragraph", content: [{ text: "First body passage here." }] },
        { kind: "paragraph", content: [{ text: "Second body passage here." }] },
      ],
    });
    const normalized = normalizeText(article);
    const needle = "Second body passage";
    const start = normalized.indexOf(needle);
    const position: TextPositionSelector = {
      start,
      end: start + needle.length,
    };
    const selector = deriveQuoteSelector(article, position);
    const resolved = resolveQuoteSelector(article, selector, position);
    expect(resolved as TextPositionSelector).toEqual(position);
  });
});

// ── Phase 19 (Plan 19-05 / D19-04): long-span + whole-article honesty ─────────
// No cap exists on span length (D19-04 — trust the reader; overlap is the
// natural limiter). These cells pin the re-anchor honesty at the extremes:
// same-revision round-trips stay on the confident fast path (exact matches
// uniquely at the stored location), while cross-revision drift of a giant
// span degrades to the explicit tri-state — never a silent re-attach
// (D5-02/ANNO-07, 19-RESEARCH Pitfall 8).

describe("resolveQuoteSelector — Phase 19 long spans (D19-04 no cap)", () => {
  /** Multi-paragraph article (ASCII — char offsets === grapheme offsets). */
  function multiParagraphArticle(texts: string[]): CanonicalArticle {
    return parseArticle({
      ...baseArticle,
      blocks: texts.map((text) => ({
        kind: "paragraph",
        content: [{ text }],
      })),
    });
  }

  const paras = [
    "The opening paragraph establishes distinctive prose no other paragraph repeats.",
    "The middle paragraph carries its own unique material for the span to cross.",
    "The closing paragraph ends the article with one final unique sentence.",
  ];

  it("a WHOLE-ARTICLE-length span round-trips confident within the same revision", () => {
    const article = multiParagraphArticle(paras);
    const total = graphemeLength(article);
    const position: TextPositionSelector = { start: 0, end: total };
    const selector = deriveQuoteSelector(article, position);
    // A whole-article span stores empty prefix/suffix (capture at the very
    // start AND end — legal wildcards per matchesContext) + an exact that
    // IS the entire normalized text, block separators included.
    expect(selector.prefix).toBe("");
    expect(selector.suffix).toBe("");
    expect(selector.exact.includes(BLOCK_SEPARATOR)).toBe(true);
    // Same revision: the fast path — unique exact at offset 0, hint IGNORED.
    const resolved = resolveQuoteSelector(article, selector, position);
    expect(resolved as TextPositionSelector).toEqual(position);
  });

  it("a whole-article span degrades to orphan (or ambiguous) after a mid-span edit — never silent re-attach", () => {
    const article = multiParagraphArticle(paras);
    const total = graphemeLength(article);
    const position: TextPositionSelector = { start: 0, end: total };
    const selector = deriveQuoteSelector(article, position);
    // The edited revision replaces the MIDDLE paragraph: the whole-text
    // exact no longer occurs anywhere, and the empty prefix/suffix
    // wildcards leave no fallback substrate — the explicit tri-state.
    const edited = multiParagraphArticle([
      paras[0]!,
      "A completely rewritten middle paragraph that shares no contiguous passage with the original text.",
      paras[2]!,
    ]);
    const resolved = resolveQuoteSelector(edited, selector, position);
    expect(
      typeof resolved === "string",
      `cross-revision giant span must degrade honestly (got ${JSON.stringify(resolved)})`,
    ).toBe(true);
    expect(["ambiguous", "orphan"]).toContain(resolved);
  });

  it("a multi-line exact (block separators inside) resolves confident on the unchanged article", () => {
    const article = multiParagraphArticle(paras);
    const normalized = normalizeText(article);
    // Span from inside paragraph 1 across the first TWO separators into
    // paragraph 3 — exact carries embedded block separators (multi-line).
    const firstSep = normalized.indexOf(BLOCK_SEPARATOR);
    const secondSep = normalized.indexOf(BLOCK_SEPARATOR, firstSep + 1);
    const position: TextPositionSelector = {
      start: 8,
      end: secondSep + 12,
    };
    const selector = deriveQuoteSelector(article, position);
    expect(selector.exact.includes(BLOCK_SEPARATOR)).toBe(true);
    expect(selector.exact.split(BLOCK_SEPARATOR).length).toBe(3);
    const resolved = resolveQuoteSelector(article, selector, position);
    expect(resolved as TextPositionSelector).toEqual(position);
  });
});
