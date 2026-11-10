import { ArticleSchema } from "../../src/content/schema";

/**
 * Synthetic, network-free footnoted long work (issue #235). A book-length
 * body (over the 72k whole-publication bound) carrying footnote references,
 * a handful of ordinary note bodies, and
 * ONE oversized note body past the window capacity (~17.5k graphemes —
 * several repeated continuations). Unique labels in body and notes make
 * omissions, jumps, and completion observable without shipping somebody
 * else's book.
 */
export function footnotedWorkArticle() {
  const blocks: Array<
    | { kind: "heading"; level: number; content: { text: string; marks: never[] }[] }
    | { kind: "paragraph"; content: { text: string; marks: never[] }[] }
    | { kind: "footnote-reference"; footnoteId: string; marker: string }
  > = [];
  for (let i = 0; i < 80; i++) {
    if (i === 0 || i === 40 || i === 79) {
      blocks.push({
        kind: "heading",
        level: 2,
        content: [{ text: `Part ${i}`, marks: [] }],
      });
      continue;
    }
    const cites =
      i === 5
        ? " The ledger cites the north wing.[1]"
        : i === 45
          ? " The second claim follows.[2]"
          : "";
    blocks.push({
      kind: "paragraph",
      content: [
        {
          text:
            `Passage ${i}. ` +
            "The archivist kept a careful record of each journey through the valley. ".repeat(15) +
            `This is the end of passage ${i}.` +
            cites,
          marks: [],
        },
      ],
    });
  }
  blocks.splice(6, 0, { kind: "footnote-reference", footnoteId: "fn-1", marker: "[1]" });
  blocks.splice(46, 0, { kind: "footnote-reference", footnoteId: "fn-2", marker: "[2]" });
  const giantNote = Array.from(
    { length: 340 },
    (_, n) => `Note ${String(n).padStart(3, "0")} of the enormous ledger record. `,
  ).join("");
  return ArticleSchema.parse({
    id: "footnoted-long-work",
    revision: 1,
    lang: "en",
    provenance: {
      title: "A footnoted reading journey",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: "synthetic-footnoted-work-v1",
    },
    blocks,
    footnotes: [
      { id: "fn-1", content: [{ text: "The north-wing ledger, shelf 12, folio 3.", marks: [] }] },
      {
        id: "fn-2",
        content: [{ text: "The second ledger confirms the claim in full.", marks: [] }],
      },
      { id: "fn-3", content: [{ text: giantNote, marks: [] }] },
    ],
  });
}
