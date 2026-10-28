// tests/unit/passage-copy.test.ts
// Issue #194 — passagePlainText (the Copy action's clipboard derivation).
//
// The stored quote.exact carries BLOCK_SEPARATOR newlines between block
// fragments AND verbatim code-block line breaks. The copy derivation must
// render verified block separators as paragraph breaks ("\n\n") while code
// line breaks stay single newlines (content, not boundaries) — and unverifiable
// spans pass through verbatim (no guessed rewrite).
import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../src/content/schema";
import { articleGraphemeIndex, normalizeText } from "../../src/content/normalizeText";
import type { TextPositionSelector } from "../../src/content/normalizeText";
import { passagePlainText } from "../../src/annotations/excerpt";
import type { CanonicalArticle } from "../../src/content/types";

const base = {
  id: "copy-test",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/copy",
    title: "Copy Test",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "sha256:cafecafe",
  },
};

function article(): CanonicalArticle {
  return ArticleSchema.parse({
    ...base,
    blocks: [
      { kind: "paragraph", content: [{ text: "Opening paragraph words." }] },
      { kind: "paragraph", content: [{ text: "Middle paragraph words." }] },
      { kind: "code-block", source: "const a = 1;\nconst b = 2;\nconst c = 3;" },
      { kind: "paragraph", content: [{ text: "Final paragraph words." }] },
    ],
  }) as CanonicalArticle;
}

/** A stored-span shape over [startText … endText] with its derived quote. */
function span(
  a: CanonicalArticle,
  startText: string,
  endText: string,
): { position: TextPositionSelector; exact: string } {
  const text = normalizeText(a);
  const start = text.indexOf(startText);
  const end = text.indexOf(endText) + endText.length;
  expect(start).toBeGreaterThanOrEqual(0);
  // Sanity: the derivation gate (exact === grapheme slice) must hold for the
  // positions under test — ASCII text, so cluster ordinals are char offsets.
  const index = articleGraphemeIndex(a);
  expect(index.clusters.slice(start, end).join("")).toBe(text.slice(start, end));
  return { position: { start, end }, exact: text.slice(start, end) };
}

describe("passagePlainText (#194 clipboard derivation)", () => {
  it("returns a single-block passage verbatim — no newlines introduced", () => {
    const a = article();
    const { position, exact } = span(a, "Opening paragraph", "Opening paragraph words.");
    expect(exact).toBe("Opening paragraph words.");
    expect(passagePlainText(exact, a, position)).toBe(exact);
  });

  it("renders a verified multi-block separator as a paragraph break", () => {
    const a = article();
    const { position, exact } = span(a, "Opening paragraph", "Middle paragraph words.");
    expect(exact).toBe("Opening paragraph words.\nMiddle paragraph words.");
    expect(passagePlainText(exact, a, position)).toBe(
      "Opening paragraph words.\n\nMiddle paragraph words.",
    );
  });

  it("keeps code-block line breaks as single newlines inside a code span", () => {
    const a = article();
    const { position, exact } = span(a, "const a", "const c = 3;");
    expect(exact).toBe("const a = 1;\nconst b = 2;\nconst c = 3;");
    expect(passagePlainText(exact, a, position)).toBe(exact);
  });

  it("converts block separators around a code block while keeping its line breaks", () => {
    const a = article();
    const { position, exact } = span(a, "Middle paragraph", "Final paragraph words.");
    expect(passagePlainText(exact, a, position)).toBe(
      "Middle paragraph words.\n\nconst a = 1;\nconst b = 2;\nconst c = 3;\n\nFinal paragraph words.",
    );
  });

  it("passes the stored text through verbatim without an article or position", () => {
    const exact = "Opening paragraph words.\nMiddle paragraph words.";
    expect(passagePlainText(exact)).toBe(exact);
    expect(passagePlainText(exact, article(), undefined)).toBe(exact);
    expect(passagePlainText(exact, article(), null)).toBe(exact);
  });

  it("passes the stored text through verbatim when the position no longer reproduces it", () => {
    const a = article();
    const exact = "Opening paragraph words.\nMiddle paragraph words.";
    // Drifted anchor: the position covers different text than the stored quote.
    const drifted = { start: 0, end: 10 };
    expect(passagePlainText(exact, a, drifted)).toBe(exact);
  });
});
