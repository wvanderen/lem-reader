// Issue #303 — cold-mount chunking for oversized whole-article windows.
//
// PR #301 raised the whole-article admission bound from the derived
// MAX_GRAPHEMES × floor(PAGINATION_PAGE_CEILING / MAX_BLOCKS) = 72,000
// graphemes to a flat 256,000, keeping continuous whole-work numbering for
// moderate readings. The side effect: the hidden measurement projection for
// a 72k–256k work mounts its ENTIRE DOM in one synchronous React pass, and
// that cold-open task doubled the longtask baseline (~141ms → 237–291ms,
// breaching the 250ms tripwire).
//
// The fix keeps the single whole-article scope (numbering is a #301
// reader-facing win) but restores the 260820 slicing invariant at the mount:
// above the pre-#301 bound the projection mounts in COOPERATIVE CHUNKS, one
// task each. The chunk walk is pure domain logic over the window schema —
// these tests pin its contract:
//   - block-aligned body chunks (never mid-block: the engine's scope
//     alignment counts rows, and a sliced block would change the row count),
//   - bounded per-chunk capacity (the tiled-window bounds),
//   - exact once-only coverage of the window's body blocks,
//   - row-aligned footnote chunks covering the window's canonical rows,
//   - the window's own boundary intra-block/intra-row cursors ride the
//     boundary chunks (a refined/assignment window keeps its slice bounds),
//   - windows at or under the bound mount whole (null — byte-identical
//     rendering path for every pre-existing scope).
import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../../src/content/schema";
import { articleGraphemeIndex, footnoteRows } from "../../../src/content/normalizeText";
import { PAGINATION_PAGE_CEILING } from "../../../src/pagination/capacity";
import {
  BlockWindowSchema,
  MAX_BLOCKS,
  MAX_GRAPHEMES,
  WHOLE_ARTICLE_MOUNT_BOUND_GRAPHEMES,
  blockWindows,
  coldMountChunks,
  readingWindows,
} from "../../../src/pagination/blockWindow";

function baseArticle(blocks: unknown[], footnotes: unknown[] = []) {
  return ArticleSchema.parse({
    id: "cold-chunk-fixture",
    revision: 1,
    lang: "en",
    provenance: {
      title: "Cold chunk fixture",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: "cold-chunk-fixture",
    },
    blocks,
    footnotes,
  });
}

/** ~`chars`-grapheme paragraphs (ASCII — one grapheme per character). */
function paragraphs(count: number, chars: number): unknown[] {
  return Array.from({ length: count }, (_, i) => ({
    kind: "paragraph",
    content: [{ text: `P${i}: ${"a".repeat(chars)}`, marks: [] }],
  }));
}

/** Footnotes with ~`chars`-grapheme bodies. */
function notes(count: number, chars: number): unknown[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `fn-${i}`,
    content: [{ text: `N${i}: ${"b".repeat(chars)}`, marks: [] }],
  }));
}

/** Body-only span of a body window, in per-block grapheme lengths. */
function bodyGraphemes(
  article: ReturnType<typeof baseArticle>,
  chunk: { startBlock: number; endBlock: number },
) {
  const lens = articleGraphemeIndex(article).perBlockLengths;
  return lens.slice(chunk.startBlock, chunk.endBlock).reduce((sum, len) => sum + len, 0);
}

describe("coldMountChunks — the oversized-scope cold-mount walk (#303)", () => {
  it("the bound is the pre-#301 derived admission bound (72,000 graphemes)", () => {
    expect(WHOLE_ARTICLE_MOUNT_BOUND_GRAPHEMES).toBe(72_000);
    // The derivation #301 replaced (see the #303 root-cause comment): the
    // tiled-tile size times the whole-article page ceiling in tiles.
    expect(WHOLE_ARTICLE_MOUNT_BOUND_GRAPHEMES).toBe(
      MAX_GRAPHEMES * Math.floor(PAGINATION_PAGE_CEILING / MAX_BLOCKS),
    );
  });

  it("a whole-article window at or under the bound mounts whole (null)", () => {
    const article = baseArticle(paragraphs(200, 300)); // ≈61k graphemes < 72k
    const windows = readingWindows(article);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.includeFootnotes).toBe(true);
    expect(coldMountChunks(article, windows[0]!)).toBeNull();
  });

  it("an oversized whole-article window chunks block-aligned with exact coverage", () => {
    const article = baseArticle(paragraphs(600, 300)); // ≈183k graphemes
    const windows = readingWindows(article);
    expect(windows).toHaveLength(1); // admitted whole by #301's 256k bound
    const chunks = coldMountChunks(article, windows[0]!);
    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(1);

    // Every chunk is a schema-valid BODY window (no note fields here, no
    // includeFootnotes — the notes, when present, are their own chunks).
    for (const chunk of chunks!) expect(() => BlockWindowSchema.parse(chunk)).not.toThrow();
    expect(chunks!.every((c) => c.startFootnote === undefined)).toBe(true);
    expect(chunks!.every((c) => c.includeFootnotes !== true)).toBe(true);

    // Exactly-once, in-order, block-aligned coverage of the whole body.
    expect(chunks![0]!.startBlock).toBe(0);
    expect(chunks!.at(-1)!.endBlock).toBe(article.blocks.length);
    for (let i = 1; i < chunks!.length; i++) {
      expect(chunks![i]!.startBlock).toBe(chunks![i - 1]!.endBlock);
    }

    // No chunk cuts a block: the row set the engine must count is exactly
    // article.blocks, and each chunk respects the tiled capacity bounds.
    expect(chunks!.every((c) => c.startGrapheme === undefined && c.endGrapheme === undefined)).toBe(
      true,
    );
    for (const chunk of chunks!) {
      expect(chunk.endBlock - chunk.startBlock).toBeGreaterThan(0);
      expect(chunk.endBlock - chunk.startBlock).toBeLessThanOrEqual(MAX_BLOCKS);
      const span = bodyGraphemes(article, chunk);
      if (span > MAX_GRAPHEMES) {
        // A chunk may exceed grapheme capacity only as a single giant block.
        expect(chunk.endBlock - chunk.startBlock).toBe(1);
      }
    }
  });

  it("a single giant block keeps row integrity — never sliced mid-block", () => {
    // One 80k-grapheme paragraph between ordinary blocks: oversized overall,
    // but the giant row must mount WHOLE (a mid-block cut would change the
    // row count the engine's scope alignment counts).
    const article = baseArticle([
      ...paragraphs(3, 300),
      { kind: "paragraph", content: [{ text: "g".repeat(80_000), marks: [] }] },
      ...paragraphs(3, 300),
    ]);
    const window = readingWindows(article)[0]!;
    const chunks = coldMountChunks(article, window);
    expect(chunks).not.toBeNull();
    for (const chunk of chunks!) {
      expect(chunk.startGrapheme).toBeUndefined();
      expect(chunk.endGrapheme).toBeUndefined();
    }
    // The giant block's chunk is exactly that one block, over capacity.
    const giant = chunks!.find((c) => c.startBlock === 3 && c.endBlock === 4);
    expect(giant).toBeDefined();
  });

  it("an oversized whole window with notes appends row-aligned footnote chunks", () => {
    const article = baseArticle(paragraphs(600, 300), notes(80, 300)); // notes ≈24k
    const window = readingWindows(article)[0]!;
    expect(window.includeFootnotes).toBe(true);
    const chunks = coldMountChunks(article, window)!;
    expect(chunks.length).toBeGreaterThan(1);

    const bodyChunks = chunks.filter((c) => c.startFootnote === undefined);
    const noteChunks = chunks.filter((c) => c.startFootnote !== undefined);
    expect(bodyChunks.length).toBeGreaterThan(1);
    expect(noteChunks.length).toBeGreaterThanOrEqual(1);
    // Body chunks cover the body exactly once…
    expect(bodyChunks[0]!.startBlock).toBe(0);
    expect(bodyChunks.at(-1)!.endBlock).toBe(article.blocks.length);
    for (let i = 1; i < bodyChunks.length; i++) {
      expect(bodyChunks[i]!.startBlock).toBe(bodyChunks[i - 1]!.endBlock);
    }
    // …and footnote chunks cover every canonical row exactly once, in order,
    // as homogeneous windows over the past-body sentinel (never a body range).
    const rows = footnoteRows(article);
    expect(noteChunks[0]!.startFootnote).toBe(rows[0]!.index);
    expect(noteChunks.at(-1)!.endFootnote).toBe(rows.at(-1)!.index + 1);
    for (const chunk of noteChunks) {
      expect(chunk.startBlock).toBe(article.blocks.length);
      expect(chunk.endBlock).toBe(article.blocks.length);
      expect(() => BlockWindowSchema.parse(chunk)).not.toThrow();
    }
    for (let i = 1; i < noteChunks.length; i++) {
      expect(noteChunks[i]!.startFootnote).toBe(noteChunks[i - 1]!.endFootnote);
    }
  });

  it("an oversized footnote-only window chunks at row boundaries and preserves cursors", () => {
    const article = baseArticle(paragraphs(2, 100), notes(120, 700)); // rows ≈84k
    const rows = footnoteRows(article);
    const window = BlockWindowSchema.parse({
      startBlock: article.blocks.length,
      endBlock: article.blocks.length,
      startFootnote: rows[0]!.index,
      endFootnote: rows.at(-1)!.index + 1,
      startFootnoteGrapheme: 2,
      endFootnoteGrapheme: 100,
    });
    const chunks = coldMountChunks(article, window)!;
    expect(chunks.length).toBeGreaterThan(1);
    // The boundary cursors ride the boundary chunks only.
    expect(chunks[0]!.startFootnoteGrapheme).toBe(2);
    expect(chunks.at(-1)!.endFootnoteGrapheme).toBe(100);
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.endFootnoteGrapheme).toBeUndefined();
    }
    for (const chunk of chunks.slice(1)) {
      expect(chunk.startFootnoteGrapheme).toBeUndefined();
    }
    // Row-aligned coverage, sentinel body range, schema-valid throughout.
    expect(chunks[0]!.startFootnote).toBe(rows[0]!.index);
    expect(chunks.at(-1)!.endFootnote).toBe(rows.at(-1)!.index + 1);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.startFootnote).toBe(chunks[i - 1]!.endFootnote);
    }
    for (const chunk of chunks) {
      expect(chunk.startBlock).toBe(article.blocks.length);
      expect(chunk.endBlock).toBe(article.blocks.length);
      expect(() => BlockWindowSchema.parse(chunk)).not.toThrow();
    }
  });

  it("the window's boundary intra-block cursors ride the boundary chunks", () => {
    // A refined/assignment-style body window with slice bounds: chunking must
    // never widen or narrow the scope — the first chunk keeps the head cursor,
    // the last keeps the tail cursor, interior chunks are whole-block.
    const article = baseArticle(paragraphs(600, 300));
    const window = BlockWindowSchema.parse({
      startBlock: 2,
      endBlock: article.blocks.length,
      startGrapheme: 5,
      endGrapheme: 50,
    });
    const chunks = coldMountChunks(article, window)!;
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.startBlock).toBe(2);
    expect(chunks[0]!.startGrapheme).toBe(5);
    expect(chunks.at(-1)!.endBlock).toBe(article.blocks.length);
    expect(chunks.at(-1)!.endGrapheme).toBe(50);
    for (const chunk of chunks.slice(1, -1)) {
      expect(chunk.startGrapheme).toBeUndefined();
      expect(chunk.endGrapheme).toBeUndefined();
    }
  });

  it("tiled windows (the pre-#301 oversized path) stay null — they mount whole", () => {
    const article = baseArticle(paragraphs(1_500, 300)); // ≈456k → tiled
    const windows = readingWindows(article);
    expect(windows).toEqual(blockWindows(article)); // tiled, not whole
    for (const window of windows) {
      expect(coldMountChunks(article, window)).toBeNull();
    }
  });
});
