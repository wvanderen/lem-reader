// tests/unit/readaloud/chunks-scope.test.ts
// Issue #244 — the chapter assignment's speech clip: chunkArticleForSpeech's
// optional canonical range. A chapter assignment's session speaks ONLY the
// assigned chapter — a chunk straddling the assignment's end would let the
// voice overshoot the boundary by up to one utterance, so the clip happens
// at the speakable-range level (speech physically cannot cross it). The
// pinned guarantees:
//   1. Every chunk lies inside [start, end) — the exclusive end is exact.
//   2. Chunks outside the range contribute nothing (no empty chunks).
//   3. Sentence integrity inside the clip (the same segmentation, a
//      subrange of the unscoped chunks).
//   4. The unscoped call is byte-identical to the shipped behavior (a
//      whole-article assignment passes no scope).

import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/types";
import { chunkArticleForSpeech } from "../../../src/readaloud/chunks";
import {
  articleGraphemeIndex,
  graphemeClusters,
  normalizeText,
} from "../../../src/content/normalizeText";

type ArticleInput = import("zod").input<typeof ArticleSchema>;

const baseArticle = {
  id: "chunks-scope-test",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/chunks-scope",
    title: "Chunks Scope Test",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "sha256:deadbeef",
  },
};

const makeArticle = (blocks: ArticleInput["blocks"]): CanonicalArticle =>
  ArticleSchema.parse({ ...baseArticle, blocks });

const scopedWork = makeArticle([
  { kind: "heading", level: 2, content: [{ text: "First chapter", marks: [] }] },
  {
    kind: "paragraph",
    content: [{ text: "Only first chapter words appear here. A second sentence.", marks: [] }],
  },
  { kind: "heading", level: 2, content: [{ text: "Second chapter", marks: [] }] },
  {
    kind: "paragraph",
    content: [{ text: "Later words that the assignment must never speak.", marks: [] }],
  },
]);

describe("chunkArticleForSpeech — the assignment scope clip (issue #244)", () => {
  it("every chunk lies inside the clipped range — the end is exclusive", () => {
    const { blockStartOffsets } = articleGraphemeIndex(scopedWork);
    // The second chapter starts at its heading block's canonical start.
    const start = blockStartOffsets[2]!;
    const end = articleGraphemeIndex(scopedWork).totalGraphemes;
    const chunks = chunkArticleForSpeech(scopedWork, { start, end });
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.startGrapheme).toBeGreaterThanOrEqual(start);
      expect(chunk.endGrapheme).toBeLessThanOrEqual(end);
    }
    // No chunk speaks the earlier chapter.
    const joined = chunks.map((c) => c.text).join(" ");
    expect(joined).not.toContain("Only first chapter");
  });

  it("a straddling sentence is cut AT the boundary — no overshoot", () => {
    // Clip mid-first-chapter: the end lands inside the paragraph's text.
    const clusters = graphemeClusters(normalizeText(scopedWork), scopedWork.lang);
    const end = 60;
    expect(clusters.slice(0, end).length).toBe(end);
    const chunks = chunkArticleForSpeech(scopedWork, { start: 0, end });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.at(-1)!.endGrapheme).toBeLessThanOrEqual(end);
    // The clip keeps chunk bounds inside the canonical clusters.
    for (const chunk of chunks) {
      expect(chunk.endGrapheme).toBeLessThanOrEqual(clusters.length);
    }
  });

  it("a range wholly outside any speakable text yields no chunks", () => {
    const total = articleGraphemeIndex(scopedWork).totalGraphemes;
    expect(chunkArticleForSpeech(scopedWork, { start: total, end: total })).toEqual([]);
  });

  it("the unscoped call is unchanged — whole-article assignments speak everything", () => {
    const unscoped = chunkArticleForSpeech(scopedWork);
    const total = articleGraphemeIndex(scopedWork).totalGraphemes;
    const fullScope = chunkArticleForSpeech(scopedWork, { start: 0, end: total });
    expect(fullScope).toEqual(unscoped);
    const joined = unscoped.map((c) => c.text).join(" ");
    expect(joined).toContain("Only first chapter");
    expect(joined).toContain("Later words");
  });
});
