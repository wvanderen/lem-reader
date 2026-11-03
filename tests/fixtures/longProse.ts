import { ArticleSchema } from "../../src/content/schema";

/** Synthetic, network-free book-length prose. Unique passage labels make
 * omissions, jumps, and annotation coordinates observable without shipping
 * somebody else's book in the repository. */
export function longProseArticle() {
  return ArticleSchema.parse({
    id: "windowed-long-prose",
    revision: 1,
    lang: "en",
    provenance: {
      title: "A long reading journey",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: "synthetic-long-prose-v1",
    },
    blocks: Array.from({ length: 640 }, (_, i) =>
      i === 0 || i === 320 || i === 639
        ? { kind: "heading", level: 2, content: [{ text: `Stage ${i}`, marks: [] }] }
        : {
            kind: "paragraph",
            content: [
              {
                text:
                  `Passage ${i}. ` +
                  "The archivist kept a careful record of each journey through the valley. ".repeat(
                    10,
                  ) +
                  `This is the end of passage ${i}.`,
                marks: [],
              },
            ],
          },
    ),
  });
}
