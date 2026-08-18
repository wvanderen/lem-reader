// tests/unit/library/book-progress.test.ts
// Plan 12-05 Task 1 — PURE coverage for the book derivations (D12-03
// chapters-finished ratio + D12-07 last-read resume + D12-06 ordinal). No
// React, no Dexie — bookProgress.ts owns only algebra over Book +
// LocationRecord inputs (the library-search.test.ts discipline for pure
// helpers).
import { describe, expect, it } from "vitest";
import {
  deriveBookProgress,
  resolveResumeChapterId,
  chapterOrdinal,
} from "../../../src/ingestion/library/bookProgress";
import { BookSchema, LocationRecordSchema } from "../../../src/content/schema";
import type { Book, LocationRecord } from "../../../src/content/schema";

/** Build a minimal valid Book via the schema (single source of truth). */
function makeBook(chapterIds: string[], skipped = 0): Book {
  return BookSchema.parse({
    id: "epub-book000111",
    title: "The Synthetic Book",
    authors: ["Ada Author", "Bob Builder"],
    language: "en",
    chapterArticleIds: chapterIds,
    skippedChapterCount: skipped,
    source: "epub-upload",
    originalFileHash:
      "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    addedAt: "2026-01-01T00:00:00.000Z",
  });
}

/** Build a minimal valid LocationRecord. */
function loc(
  articleId: string,
  graphemeOffset: number,
  savedAt: string,
  revision = 1,
): LocationRecord {
  return LocationRecordSchema.parse({
    schemaVersion: 1,
    articleId,
    revision,
    graphemeOffset,
    savedAt,
  });
}

/** The identity text-length lookup — lengths[name] ?? undefined. */
function lengthsOf(lengths: Record<string, number>) {
  return (articleId: string): number | undefined => lengths[articleId];
}

describe("deriveBookProgress (D12-03 — chapters-finished ratio)", () => {
  it("counts a chapter finished at EXACTLY the FINISHED_THRESHOLD boundary (>=)", () => {
    // 0.98 x 100 = 98 — offset 98 is AT the boundary and counts.
    const book = makeBook(["epub-book000111-c00"]);
    const progress = deriveBookProgress(book, [loc("epub-book000111-c00", 98, "2026-01-02T00:00:00.000Z")], lengthsOf({ "epub-book000111-c00": 100 }));
    expect(progress).toBe(1);
  });

  it("one below the boundary is unfinished", () => {
    const book = makeBook(["epub-book000111-c00"]);
    const progress = deriveBookProgress(book, [loc("epub-book000111-c00", 97, "2026-01-02T00:00:00.000Z")], lengthsOf({ "epub-book000111-c00": 100 }));
    expect(progress).toBe(0);
  });

  it("a mid-chapter location is unfinished", () => {
    const book = makeBook(["epub-book000111-c00"]);
    const progress = deriveBookProgress(book, [loc("epub-book000111-c00", 50, "2026-01-02T00:00:00.000Z")], lengthsOf({ "epub-book000111-c00": 100 }));
    expect(progress).toBe(0);
  });

  it("returns the finished-count ratio over 3 chapters", () => {
    const ids = [
      "epub-book000111-c00",
      "epub-book000111-c01",
      "epub-book000111-c02",
    ];
    const book = makeBook(ids);
    const locations = [
      loc(ids[0]!, 1000, "2026-01-02T00:00:00.000Z"), // finished (>= 0.98*1000)
      loc(ids[1]!, 500, "2026-01-03T00:00:00.000Z"), // mid-chapter
      // ids[2] never opened
    ];
    const lengths = lengthsOf({
      [ids[0]!]: 1000,
      [ids[1]!]: 1000,
      [ids[2]!]: 1000,
    });
    expect(deriveBookProgress(book, locations, lengths)).toBeCloseTo(1 / 3, 10);
  });

  it("empty locations → 0", () => {
    const book = makeBook(["epub-book000111-c00", "epub-book000111-c01"]);
    expect(deriveBookProgress(book, [], lengthsOf({}))).toBe(0);
  });

  it("missing text length (partial import) → the chapter is unfinished", () => {
    const book = makeBook(["epub-book000111-c00"]);
    // A location exists with a huge offset, but the chapter row is absent —
    // the ratio cannot be known, so the chapter never counts as finished.
    const progress = deriveBookProgress(
      book,
      [loc("epub-book000111-c00", 1_000_000, "2026-01-02T00:00:00.000Z")],
      lengthsOf({}),
    );
    expect(progress).toBe(0);
  });

  it("an empty chapterArticleIds list → 0 (never NaN)", () => {
    expect(deriveBookProgress(makeBook([]), [], lengthsOf({}))).toBe(0);
  });

  it("locations for articles OUTSIDE the book never count", () => {
    const book = makeBook(["epub-book000111-c00"]);
    const locations = [
      loc("some-other-article", 1000, "2026-01-02T00:00:00.000Z"),
    ];
    expect(
      deriveBookProgress(book, locations, lengthsOf({ "some-other-article": 1000 })),
    ).toBe(0);
  });

  it("the LATEST-savedAt record for a chapter wins across revisions", () => {
    const book = makeBook(["epub-book000111-c00"]);
    const locations = [
      // Revision 1 reached the end (finished), but revision 2 — saved
      // LATER — sits mid-chapter: the live truth is unfinished.
      loc("epub-book000111-c00", 1000, "2026-01-02T00:00:00.000Z", 1),
      loc("epub-book000111-c00", 10, "2026-01-03T00:00:00.000Z", 2),
    ];
    expect(
      deriveBookProgress(book, locations, lengthsOf({ "epub-book000111-c00": 1000 })),
    ).toBe(0);
  });
});

describe("resolveResumeChapterId (D12-07 — last-read wins)", () => {
  const ids = ["epub-book000111-c00", "epub-book000111-c01"];

  it("picks the chapter whose location has the max savedAt", () => {
    const book = makeBook(ids);
    const locations = [
      loc(ids[0]!, 100, "2026-01-02T00:00:00.000Z"),
      loc(ids[1]!, 100, "2026-01-05T00:00:00.000Z"),
    ];
    expect(resolveResumeChapterId(book, locations)).toBe(ids[1]);
  });

  it("an EARLIER chapter re-skimmed later wins (D12-07)", () => {
    const book = makeBook(ids);
    const locations = [
      loc(ids[0]!, 100, "2026-01-10T00:00:00.000Z"), // c00 re-skimmed LAST
      loc(ids[1]!, 100, "2026-01-05T00:00:00.000Z"),
    ];
    expect(resolveResumeChapterId(book, locations)).toBe(ids[0]);
  });

  it("no locations at all → null", () => {
    expect(resolveResumeChapterId(makeBook(ids), [])).toBeNull();
  });

  it("locations for non-chapter articles are ignored (→ null)", () => {
    const locations = [loc("some-other-article", 5, "2026-01-02T00:00:00.000Z")];
    expect(resolveResumeChapterId(makeBook(ids), locations)).toBeNull();
  });

  it("resumes mid-chapter (any offset qualifies — recency is the only rule)", () => {
    const book = makeBook(ids);
    const locations = [
      loc(ids[0]!, 3, "2026-01-09T00:00:00.000Z"), // barely started, but most recent
      loc(ids[1]!, 900, "2026-01-01T00:00:00.000Z"),
    ];
    expect(resolveResumeChapterId(book, locations)).toBe(ids[0]);
  });
});

describe("chapterOrdinal (D12-06 — the book's own TOC numbering)", () => {
  it("is 1-based over chapterArticleIds order", () => {
    const book = makeBook(["ch-alpha", "ch-beta", "ch-gamma"]);
    expect(chapterOrdinal(book, "ch-alpha")).toBe(1);
    expect(chapterOrdinal(book, "ch-beta")).toBe(2);
    expect(chapterOrdinal(book, "ch-gamma")).toBe(3);
  });

  it("returns 0 for an id outside the record (partial-import tolerance)", () => {
    const book = makeBook(["ch-alpha"]);
    expect(chapterOrdinal(book, "ch-unknown")).toBe(0);
  });
});
