import { ArticleSchema } from "../../src/content/schema";

/** Synthetic, network-free giant-prose work (issue #233). One paragraph
 * far larger than the measurement window capacity (~351k graphemes — past
 * the 300-page whole-document ceiling), plus inline markup inside the
 * giant run so slicing through marks stays observable. Unique segment
 * labels make omissions, seams, and annotation coordinates observable
 * without shipping somebody else's book. Pure ASCII: graphemes ==
 * UTF-16 units == characters, so tests can compute offsets arithmetically
 * (each segment contributes 37 graphemes once trailing-space trims land). */
export function giantProseArticle() {
  const segment = (n: number) => `Segment ${String(n).padStart(4, "0")} of the enormous record. `;
  const run = (from: number, to: number) =>
    Array.from({ length: to - from }, (_, i) => segment(from + i)).join("");
  return ArticleSchema.parse({
    id: "giant-prose-work",
    revision: 1,
    lang: "en",
    provenance: {
      title: "The enormous paragraph",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: "synthetic-giant-prose-work-v1",
    },
    blocks: [
      { kind: "heading", level: 2, content: [{ text: "Enormous", marks: [] }] },
      {
        kind: "paragraph",
        content: [
          { text: run(0, 500), marks: [] },
          { text: "The marked interlude stands out. ", marks: [{ type: "strong" }] },
          {
            text: run(500, 520),
            marks: [{ type: "link", href: "https://example.com/archive" }],
          },
          { text: run(520, 9500), marks: [] },
        ],
      },
      { kind: "heading", level: 2, content: [{ text: "After the enormous", marks: [] }] },
      { kind: "paragraph", content: [{ text: "A calm closing passage.", marks: [] }] },
    ],
  });
}

/** The giant-ATOMIC variant (issue #233's honest-failure control): a code
 * block past the window capacity has no intra-block split semantic, so the
 * article keeps the legacy path and its explicit typed fallback. */
export function giantCodeArticle() {
  return ArticleSchema.parse({
    id: "giant-code-work",
    revision: 1,
    lang: "en",
    provenance: {
      title: "The enormous listing",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: "synthetic-giant-code-work-v1",
    },
    blocks: [
      { kind: "heading", level: 2, content: [{ text: "Listing", marks: [] }] },
      {
        kind: "code-block",
        source: Array.from(
          { length: 300 },
          (_, n) => `const value${n} = compute(${n}); // a steady line of source`,
        ).join("\n"),
        lang: "js",
      },
      { kind: "paragraph", content: [{ text: "A calm closing passage.", marks: [] }] },
    ],
  });
}
