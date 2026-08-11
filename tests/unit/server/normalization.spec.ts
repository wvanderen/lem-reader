// tests/unit/server/normalization.spec.ts
// Plan 07-05 Task 2 — the SC#1 phase-exit gate suite. Replaces the Wave-0
// stub (test.todo placeholders) with the real round-trip anchor gate test
// exercising the SHIPPED selector machinery (Pitfall 2 — no fork) on:
//   - v1.0 fixtures (real CanonicalArticle shape)
//   - extracted samples (real publisher HTML → ingest → round-trip)
//   - a refusal-engineered case (extreme repetition → "ambiguous" → refused)
//   - the full pipeline end-to-end (ingest({html}) → ok=true)
//   - a thin-content refusal (ingest("<p>short</p>") → ok=false)
//
// Source: 07-PATTERNS.md §tests/unit/server/normalization.spec.ts L524-548
// (analog: tests/unit/selectors.test.ts L49-63 — the deriveQuoteSelector
// usage pattern this gate reuses verbatim) + 07-RESEARCH.md §Gate 3 L972-973.
import { describe, expect, it } from "vitest";
import { assertRoundTripAnchor, ingest } from "../../../server/ingest";
import { ArticleSchema, type CanonicalArticle } from "../../../src/content/schema";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import essayLongFormJson from "../../../src/fixtures/articles/essay-long-form.canonical.json" with { type: "json" };
import technicalPostJson from "../../../src/fixtures/articles/technical-post.canonical.json" with { type: "json" };
import footnoteAcademicJson from "../../../src/fixtures/articles/footnote-academic.canonical.json" with { type: "json" };

/** parseArticle — mirror tests/unit/normalizeText.test.ts L16-30 + selectors.test.ts L15-17. */
function parseArticle(raw: unknown): CanonicalArticle {
  return ArticleSchema.parse(raw);
}

const SOURCE_HTML_DIR = join(__dirname, "../../../scripts/source-html");

describe("normalization / round-trip anchor gate (SC#1)", () => {
  it("v1.0 fixture round-trips to confident (real CanonicalArticle shape)", () => {
    // Three v1.0 fixtures spanning the corpus: an essay, a technical post, and
    // an academic article with footnotes. Each has substantial prose → unique
    // 20-grapheme windows at every sampled offset.
    const fixtures = [essayLongFormJson, technicalPostJson, footnoteAcademicJson].map(
      parseArticle,
    );
    for (const fixture of fixtures) {
      expect(() => assertRoundTripAnchor(fixture)).not.toThrow();
    }
  });

  it("extracted sample round-trips to confident (real publisher HTML through the pipeline)", async () => {
    const html = readFileSync(join(SOURCE_HTML_DIR, "essay-long-form.html"), "utf-8");
    const result = await ingest({ html });
    // If extraction succeeded, the round-trip gate MUST pass on the extracted
    // article (the gate already ran inside ingest; this re-asserts it on the
    // returned article for defense-in-depth).
    if (result.ok) {
      expect(() => assertRoundTripAnchor(result.article)).not.toThrow();
    }
  });

  it("article with extreme repetition is refused (round-trip-anchor-failed)", () => {
    // A single repeated character produces N>1 exact matches for every sampled
    // window; prefix/suffix disambiguation fails because the surrounding text
    // is the SAME pattern at every candidate → resolveQuoteSelector returns
    // "ambiguous" → assertRoundTripAnchor throws IngestionError.
    const repeated = "aaaaa ".repeat(50).trim(); // ~299 chars of pure repetition
    const article = parseArticle({
      id: "repeat-test",
      revision: 1,
      lang: "en",
      provenance: {
        title: "Repeat",
        retrievedAt: "2026-01-01T00:00:00Z",
        originalHtmlHash: "sha256:deadbeef",
      },
      blocks: [
        {
          kind: "paragraph",
          content: [{ text: repeated, marks: [] }],
        },
      ],
    });
    expect(() => assertRoundTripAnchor(article)).toThrow("round-trip-anchor-failed");
  });

  it("ingest({ html }) on a v1.0 fixture's source HTML returns ok=true", async () => {
    const html = readFileSync(join(SOURCE_HTML_DIR, "technical-post.html"), "utf-8");
    const result = await ingest({ html });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.article.blocks.length).toBeGreaterThan(0);
      expect(result.confidence.state === "confident" || result.confidence.state === "low").toBe(true);
    }
  });

  it("ingest({ html: '<p>short</p>' }) refuses — thin content does not enter the library", async () => {
    const result = await ingest({ html: "<p>short</p>" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect([
        "extraction-unsupported",
        "extraction-too-low-confidence",
        "round-trip-anchor-failed",
      ]).toContain(result.reason);
    }
  });
});
