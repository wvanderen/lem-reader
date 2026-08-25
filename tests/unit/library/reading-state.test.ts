// tests/unit/library/reading-state.test.ts
// Plan 14-01 Task 1 — the LIB-07 policy truth table for readingState.ts
// (D14-20: ONE derivation owned by ONE module). PURE coverage — no React,
// no Dexie; the module owns only algebra over LocationRecord/Book inputs
// (the book-progress.test.ts fixture discipline: schema-parse builders,
// lengthsOf identity lookup, boundary-named cases).
//
// Truth rows pinned here (14-01-PLAN.md must_haves):
//   - D14-18: no location → unread; ANY location (even offset 0) → started.
//   - D14-19: a 39/40-chapter book is honestly in-progress, never finished.
//   - D14-21: a book with a missing chapter row (unknown text length) can
//     never read finished — it stays honestly in-progress.
//   - D14-24: countByState folds BOTH derivations so counts cannot disagree
//     with membership; each book counts exactly once.
import { describe, expect, it } from "vitest";
import {
  articleReadingState,
  bookReadingState,
  countByState,
} from "../../../src/ingestion/library/readingState";
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

describe("articleReadingState (D14-18 — opened = in-progress; unread = never opened)", () => {
  it("no location → unread (D14-18)", () => {
    expect(articleReadingState(undefined, 100)).toBe("unread");
  });

  it("location at offset 0 with total > 0 → in-progress (D14-18 opened = started)", () => {
    expect(
      articleReadingState(loc("art-a", 0, "2026-01-02T00:00:00.000Z"), 100),
    ).toBe("in-progress");
  });

  it("offset = total → finished", () => {
    expect(
      articleReadingState(loc("art-a", 100, "2026-01-02T00:00:00.000Z"), 100),
    ).toBe("finished");
  });

  it("offset exactly at the FINISHED_THRESHOLD boundary (total 100, offset 98) → finished (>= semantics)", () => {
    // 0.98 × 100 = 98 — offset 98 is AT the boundary and finishes.
    expect(
      articleReadingState(loc("art-a", 98, "2026-01-02T00:00:00.000Z"), 100),
    ).toBe("finished");
  });

  it("one below the boundary (total 100, offset 97) → in-progress", () => {
    expect(
      articleReadingState(loc("art-a", 97, "2026-01-02T00:00:00.000Z"), 100),
    ).toBe("in-progress");
  });

  it("opened zero-length article (total 0, positive offset) → finished — byte-stable edge", () => {
    // The formula stays VERBATIM from LibraryRow/strip:
    // Math.min(1, offset / total) = Math.min(1, positive/0) = 1 >= threshold
    // → finished. An opened zero-length article therefore reads Finished on
    // every surface today; the policy module preserves that edge byte-for-byte
    // (any "fix" here would change rendered behavior, which this plan
    // forbids — zero UI change).
    expect(
      articleReadingState(loc("art-a", 5, "2026-01-02T00:00:00.000Z"), 0),
    ).toBe("finished");
  });
});

describe("bookReadingState (D14-19/D14-21 — honest book-level states)", () => {
  it("book with no chapter locations → unread", () => {
    const book = makeBook(["epub-book000111-c00", "epub-book000111-c01"]);
    expect(bookReadingState(book, [], lengthsOf({
      "epub-book000111-c00": 100,
      "epub-book000111-c01": 100,
    }))).toBe("unread");
  });

  it("book with some chapters opened, none finished → in-progress", () => {
    const ids = ["epub-book000111-c00", "epub-book000111-c01"];
    const book = makeBook(ids);
    const locations = [
      loc(ids[0]!, 50, "2026-01-02T00:00:00.000Z"), // mid-chapter
      // ids[1] never opened
    ];
    expect(
      bookReadingState(book, locations, lengthsOf({
        [ids[0]!]: 100,
        [ids[1]!]: 100,
      })),
    ).toBe("in-progress");
  });

  it("book 39/40 chapters finished → in-progress (D14-19 — never silently rounded up)", () => {
    const ids = Array.from(
      { length: 40 },
      (_, i) => `epub-book000111-c${String(i).padStart(2, "0")}`,
    );
    const book = makeBook(ids);
    // Chapters 0..38 finished (offset = total); chapter 39 never opened.
    const locations = ids
      .slice(0, 39)
      .map((id, i) => loc(id, 100, `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`));
    const lengths = lengthsOf(Object.fromEntries(ids.map((id) => [id, 100])));
    expect(bookReadingState(book, locations, lengths)).toBe("in-progress");
  });

  it("missing chapter row (textLengthOf undefined) with all present chapters finished → in-progress (D14-21)", () => {
    const ids = ["epub-book000111-c00", "epub-book000111-c01"];
    const book = makeBook(ids);
    // c00 finished; c01's article row is ABSENT (partial import) — even a
    // huge offset cannot make an unknown-length chapter count as finished,
    // so the book stays honestly in-progress at 1/2.
    const locations = [
      loc(ids[0]!, 100, "2026-01-02T00:00:00.000Z"),
      loc(ids[1]!, 1_000_000, "2026-01-03T00:00:00.000Z"),
    ];
    expect(
      bookReadingState(book, locations, lengthsOf({ [ids[0]!]: 100 })),
    ).toBe("in-progress");
  });

  it("book with all chapters individually finished → finished", () => {
    const ids = ["epub-book000111-c00", "epub-book000111-c01", "epub-book000111-c02"];
    const book = makeBook(ids);
    const locations = ids.map((id, i) =>
      loc(id, 100, `2026-01-0${i + 2}T00:00:00.000Z`),
    );
    const lengths = lengthsOf(Object.fromEntries(ids.map((id) => [id, 100])));
    expect(bookReadingState(book, locations, lengths)).toBe("finished");
  });
});

describe("countByState (D14-24 — counts cannot disagree with membership)", () => {
  it("mixed corpus: counts sum to standalone + book totals, one book counting once", () => {
    const chapterIds = ["epub-book000111-c00", "epub-book000111-c01"];
    const inProgressBook = makeBook(chapterIds);
    const finishedBook = makeBook(["epub-book000222-c00"]);
    const unreadBook = makeBook(["epub-book000333-c00"]);

    const locations: LocationRecord[] = [
      // Standalone articles: one unread target never opened, one mid-read,
      // one finished.
      loc("art-mid", 50, "2026-01-02T00:00:00.000Z"),
      loc("art-done", 100, "2026-01-03T00:00:00.000Z"),
      // inProgressBook: c00 finished, c01 mid-chapter → in-progress.
      loc(chapterIds[0]!, 100, "2026-01-04T00:00:00.000Z"),
      loc(chapterIds[1]!, 50, "2026-01-05T00:00:00.000Z"),
      // finishedBook: its single chapter is finished.
      loc("epub-book000222-c00", 100, "2026-01-06T00:00:00.000Z"),
      // unreadBook: no locations at all.
    ];
    const lengths = lengthsOf({
      "art-mid": 100,
      "art-done": 100,
      [chapterIds[0]!]: 100,
      [chapterIds[1]!]: 100,
      "epub-book000222-c00": 100,
      "epub-book000333-c00": 100,
    });

    const counts = countByState(
      [
        { id: "art-fresh", total: 100 }, // no location → unread
        { id: "art-mid", location: locations[0], total: 100 }, // in-progress
        { id: "art-done", location: locations[1], total: 100 }, // finished
      ],
      [inProgressBook, finishedBook, unreadBook],
      locations,
      lengths,
    );

    expect(counts).toEqual({
      unread: 2, // 1 standalone + 1 book — the book counts ONCE
      "in-progress": 2, // 1 standalone + 1 book
      finished: 2, // 1 standalone + 1 book
    });
    // The fold's totals sum to the corpus size (3 standalone + 3 books).
    expect(counts.unread + counts["in-progress"] + counts.finished).toBe(6);
  });
});
