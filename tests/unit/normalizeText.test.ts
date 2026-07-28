import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../src/content/schema";
import {
  BLOCK_SEPARATOR,
  normalizeRunText,
  normalizeText,
} from "../../src/content/normalizeText";
import type { CanonicalArticle } from "../../src/content/types";

/**
 * normalizeText substrate (D-05) — one deterministic string per article revision.
 * Guards Pitfall 2 (whitespace drift), Pitfall 3 (footnote body position),
 * code-block verbatim, and idempotency.
 */

function parseArticle(raw: unknown): CanonicalArticle {
  return ArticleSchema.parse(raw);
}

const baseArticle = {
  id: "norm-test",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/norm",
    title: "Norm Test",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "sha256:deadbeef",
  },
};

// ── Idempotency ──────────────────────────────────────────────────────────────

describe("normalizeRunText idempotency", () => {
  it.each(["hello world", "  multiple   spaces  ", "\t\n tabs and newlines"])(
    "is idempotent on %j",
    (s) => {
      expect(normalizeRunText(normalizeRunText(s))).toBe(normalizeRunText(s));
    },
  );
});

describe("normalizeText idempotency", () => {
  const article = parseArticle({
    ...baseArticle,
    blocks: [{ kind: "paragraph", content: [{ text: "Hello world." }] }],
  });

  it("returns the same string on repeated calls", () => {
    expect(normalizeText(article)).toBe(normalizeText(article));
  });
});

// ── ASCII whitespace collapse (Pitfall 2) ────────────────────────────────────

describe("ASCII whitespace collapse", () => {
  it("collapses runs of ASCII whitespace in inline text to a single space", () => {
    const article = parseArticle({
      ...baseArticle,
      blocks: [
        {
          kind: "paragraph",
          content: [{ text: "  hello   world  " }],
        },
      ],
    });
    expect(normalizeText(article)).toBe("hello world");
  });

  it("does NOT collapse NBSP (\\u00A0)", () => {
    const article = parseArticle({
      ...baseArticle,
      blocks: [
        {
          kind: "paragraph",
          content: [{ text: "a\u00A0b" }],
        },
      ],
    });
    expect(normalizeText(article)).toBe("a\u00A0b");
  });

  it("does NOT collapse ZWJ (\\u200D)", () => {
    const article = parseArticle({
      ...baseArticle,
      blocks: [
        {
          kind: "paragraph",
          content: [{ text: "a\u200Db" }],
        },
      ],
    });
    expect(normalizeText(article)).toBe("a\u200Db");
  });
});

// ── Block separator (exactly one "\n" between blocks) ────────────────────────

describe("block separator", () => {
  it("joins two paragraph blocks with exactly one newline", () => {
    const article = parseArticle({
      ...baseArticle,
      blocks: [
        { kind: "paragraph", content: [{ text: "first" }] },
        { kind: "paragraph", content: [{ text: "second" }] },
      ],
    });
    const text = normalizeText(article);
    // body has blocks.length - 1 = 1 newline between the two paragraphs; no footnotes.
    const newlineCount = (text.match(/\n/g) ?? []).length;
    expect(newlineCount).toBe(1);
    expect(text).toBe("first\nsecond");
  });

  it("exports BLOCK_SEPARATOR as a single newline", () => {
    expect(BLOCK_SEPARATOR).toBe("\n");
  });
});

// ── Code-block verbatim (whitespace NOT collapsed) ───────────────────────────

describe("code-block source is verbatim", () => {
  it("preserves internal whitespace and newlines in code-block source", () => {
    const article = parseArticle({
      ...baseArticle,
      blocks: [{ kind: "code-block", source: "  indented\n  code" }],
    });
    expect(normalizeText(article)).toBe("  indented\n  code");
  });
});

// ── Footnote body position (Pitfall 3) ───────────────────────────────────────

describe("footnote body participates AFTER body blocks (Pitfall 3)", () => {
  it("footnote body text offset > footnote reference marker offset", () => {
    const article = parseArticle({
      ...baseArticle,
      blocks: [
        { kind: "paragraph", content: [{ text: "Body text with a note" }] },
        { kind: "footnote-reference", footnoteId: "fn-1", marker: "[1]" },
      ],
      footnotes: [{ id: "fn-1", content: [{ text: "Footnote body text here" }] }],
    });
    const text = normalizeText(article);
    const refOffset = text.indexOf("[1]");
    const bodyOffset = text.indexOf("Footnote body text here");
    expect(refOffset).toBeGreaterThanOrEqual(0);
    expect(bodyOffset).toBeGreaterThan(refOffset);
  });
});
