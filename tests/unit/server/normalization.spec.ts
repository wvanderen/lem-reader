// tests/unit/server/normalization.spec.ts
// Plan 07-05 Task 2 — the SC#1 phase-exit gate suite (reshaped by ADR-0003:
// the round-trip anchor GATE is now a PROBE — a detector, not a veto).
// Exercises the SHIPPED selector machinery (Pitfall 2 — no fork) on:
//   - v1.0 fixtures (real CanonicalArticle shape)
//   - extracted samples (real publisher HTML → ingest → round-trip)
//   - a repetition case (extreme repetition → "ambiguous" → admitted FLAGGED,
//     never refused — readable text is never refused)
//   - a duplicated-opening regression (the marxist.com trotsky shape — the
//     article that motivated ADR-0003)
//   - the full pipeline end-to-end (ingest({html}) → ok=true)
//   - a zero-extraction refusal (ingest("<p>short</p>") → ok=false — nothing
//     reliable to show)
import { describe, expect, it } from "vitest";
import { ingest, probeRoundTripAnchor } from "../../../server/ingest";
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

describe("normalization / round-trip anchor probe (SC#1, ADR-0003)", () => {
  it("v1.0 fixture round-trips to confident (real CanonicalArticle shape)", () => {
    // Three v1.0 fixtures spanning the corpus: an essay, a technical post, and
    // an academic article with footnotes. Each has substantial prose → unique
    // 20-grapheme windows at every sampled offset.
    const fixtures = [essayLongFormJson, technicalPostJson, footnoteAcademicJson].map(
      parseArticle,
    );
    for (const fixture of fixtures) {
      expect(probeRoundTripAnchor(fixture)).toBe("pass");
    }
  });

  it("extracted sample round-trips to confident (real publisher HTML through the pipeline)", async () => {
    const html = readFileSync(join(SOURCE_HTML_DIR, "essay-long-form.html"), "utf-8");
    const result = await ingest({ html });
    // If extraction succeeded, the probe MUST pass on the extracted article
    // (the probe already ran inside ingest; this re-asserts it on the returned
    // article for defense-in-depth). Two ok-variants since Phase 12 — narrow
    // on the article key.
    if (result.ok && "article" in result) {
      expect(probeRoundTripAnchor(result.article)).toBe("pass");
    }
  });

  it("extreme repetition probes ambiguous — flagged, not refused (ADR-0003)", () => {
    // A single repeated character produces N>1 exact matches for every sampled
    // window; prefix/suffix disambiguation fails because the surrounding text
    // is the SAME pattern at every candidate → resolveQuoteSelector returns
    // "ambiguous" → the probe REPORTS it; the text stays readable, so the
    // article is admitted with annotationsDegraded (asserted at the pipeline
    // level in the duplicated-opening test below).
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
    expect(probeRoundTripAnchor(article)).toBe("ambiguous");
  });

  it("duplicated opening phrase admits the article flagged (marxist.com regression, ADR-0003)", async () => {
    // The production case that motivated ADR-0003: marxist.com's "Trotsky's
    // struggle to rejuvenate the Bolshevik party" extracted perfectly (84
    // blocks, confidence high) but was refused because the 20-grapheme sample
    // at offset 0 — "After Lenin had been" — appears twice (the opening is
    // repeated verbatim in a later summary block). Duplicated-phrase articles
    // must now enter the library flagged with annotationsDegraded.
    const filler =
      "The party apparatus had grown bureaucratic in the years of retreat, and " +
      "the struggle against this degeneration consumed the final decade of his " +
      "political life. Each faction fight sharpened the questions of programme, " +
      "organisation, and the historical destiny of the revolution. ";
    const opening = `After Lenin had been silenced by illness, the question of the party's future ${
      filler + filler + filler
    }`;
    const html = `<!DOCTYPE html><html><head><title>Trotsky</title></head><body><article>
      <h1>Trotsky's struggle to rejuvenate the Bolshevik party</h1>
      <p>${opening}</p>
      <p>${filler}The summary below repeats the opening for readers in a hurry.</p>
      <blockquote><p>After Lenin had been silenced by illness, the question of the party's future ${filler}${filler}</p></blockquote>
      <p>${filler}${filler}That is the lesson the article draws.</p>
    </article></body></html>`;
    const result = await ingest({ html });
    expect(result.ok).toBe(true);
    if (result.ok && "article" in result) {
      expect(result.article.ingestionMeta?.annotationsDegraded).toBe(true);
      expect(result.article.blocks.length).toBeGreaterThan(0);
    }
  });

  it("an article with unsupported embeds carries the count-first partial-content warning (ADR-0003)", async () => {
    // Two unsupported parts (two tables — Readability+DOMPurify strip
    // iframe/embed entirely, tables survive as unsupported blocks) → the
    // article-level extractionWarnings line "2 parts of the original could
    // not be displayed" rides the article (the note region renders it with
    // the "See the original." link); the inline <details> disclosures mark
    // WHERE they fell. Never silent.
    const filler =
      "The party apparatus had grown bureaucratic in the years of retreat, and " +
      "the struggle against this degeneration consumed the final decade of his " +
      "political life. Each faction fight sharpened the questions of programme. ";
    const html = `<!DOCTYPE html><html><head><title>Tables</title></head><body><article>
      <h1>An article with tables</h1>
      <p>${filler + filler + filler}</p>
      <table><tr><th>Year</th><th>Event</th></tr><tr><td>1923</td><td>The turning point</td></tr></table>
      <p>${filler + filler}A middle paragraph carries the argument forward.</p>
      <table><tr><th>Metric</th><th>Value</th></tr><tr><td>Members</td><td>Thousands</td></tr></table>
      <p>${filler + filler}A closing paragraph lands the point.</p>
    </article></body></html>`;
    const result = await ingest({ html });
    expect(result.ok).toBe(true);
    if (result.ok && "article" in result) {
      expect(result.article.ingestionMeta?.extractionWarnings).toContain(
        "2 parts of the original could not be displayed",
      );
    }
  });

  it("ingest({ html }) on a v1.0 fixture's source HTML returns ok=true", async () => {
    const html = readFileSync(join(SOURCE_HTML_DIR, "technical-post.html"), "utf-8");
    const result = await ingest({ html });
    expect(result.ok).toBe(true);
    if (result.ok && "article" in result) {
      expect(result.article.blocks.length).toBeGreaterThan(0);
      expect(result.confidence.state === "confident" || result.confidence.state === "low").toBe(true);
    }
  });

  it("ingest({ html: '<p>short</p>' }) admits flagged — thin text is still text (ADR-0003)", async () => {
    // The old three-state model refused this (isProbablyReaderable=false →
    // extraction-unsupported). Reading-first: "short" is readable, so it
    // enters the library flagged low — the reader sees the fidelity note.
    const result = await ingest({ html: "<p>short</p>" });
    expect(result.ok).toBe(true);
    if (result.ok && "article" in result) {
      expect(result.article.ingestionMeta?.extractionConfidence).toBe("low");
      expect(result.confidence.state).toBe("low");
    }
  });

  it("ingest({ html }) on an empty shell refuses — zero blocks, nothing reliable to show", async () => {
    // Readability parses null here → zero blocks → the one honest content
    // refusal left on the web path (ADR-0003).
    const result = await ingest({
      html: "<!DOCTYPE html><html><head><title>Empty</title></head><body><div></div></body></html>",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("extraction-unsupported");
    }
  });
});
