// tests/unit/library/resume-target.test.ts
// Issue #82 (decision #68) — the ONE shared resume-target derivation
// (deriveResumeTargets) that BOTH the Continue-Reading rail and the shell
// Read destination consume. Pinning the algebra here pins every consumer
// at once: rail and nav CANNOT disagree by construction.
//
// Acceptance rows (#82):
//   - unfinished filter — in-progress members only; finished AND
//     never-opened (unread) rows are excluded.
//   - book resume chapter — a book target's articleId IS the D12-07
//     last-read chapter (max savedAt within the book); chapters never
//     emit standalone entries (D12-02).
//   - mark-unread reintroduction — there is no permanent exclusion
//     memory: mark-unread deletes the location rows (setArticleReadState
//     false arm), the row drops out while unread, and it re-enters the
//     moment its next in-progress location lands.
//   - empty → hidden — [] is the "no unfinished target" contract the
//     Read link's visibility rides.
//
// Fixture discipline (reading-state.test.ts / book-progress.test.ts):
// schema-parse builders, the snapshot's ONE precomputed latest-location
// fold via readingPosition.latestLocationByArticle, totals supplied as
// the snapshot's totalsByArticleId map. PURE — no React, no Dexie.
import { describe, expect, it } from "vitest";
import { deriveResumeTargets } from "../../../src/ingestion/library/resumeTarget";
import { latestLocationByArticle } from "../../../src/reader/readingPosition";
import {
  ArticleSchema,
  BookSchema,
  LocationRecordSchema,
} from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/schema";
import type { Book, LocationRecord } from "../../../src/content/schema";
import { EMPTY_LIBRARY_SNAPSHOT } from "../../../src/ingestion/library/librarySnapshot";
import type { LibrarySnapshot } from "../../../src/ingestion/library/librarySnapshot";

/** Build a minimal schema-valid standalone article (id is the only field
 * the derivation reads; the rest satisfies ArticleSchema). */
function makeArticle(id: string, title: string): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      title,
      retrievedAt: "2026-01-01T00:00:00.000Z",
      originalHtmlHash: `sha256:${"3".repeat(64)}`,
    },
    blocks: [
      { kind: "paragraph", content: [{ text: `Body of ${title}.`, marks: [] }] },
    ],
  });
}

/** Build a minimal valid Book via the schema. */
function makeBook(id: string, chapterIds: string[], title = "The Synthetic Book"): Book {
  return BookSchema.parse({
    id,
    title,
    authors: ["Ada Author"],
    language: "en",
    chapterArticleIds: chapterIds,
    skippedChapterCount: 0,
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
): LocationRecord {
  return LocationRecordSchema.parse({
    schemaVersion: 1,
    articleId,
    revision: 1,
    graphemeOffset,
    savedAt,
  });
}

/** Assemble a LibrarySnapshot from the pieces a derivation reads. */
function snapshot(over: {
  standaloneArticles?: CanonicalArticle[];
  books?: Book[];
  locations?: LocationRecord[];
  totals?: Record<string, number>;
}): LibrarySnapshot {
  return {
    ...EMPTY_LIBRARY_SNAPSHOT,
    standaloneArticles: over.standaloneArticles ?? [],
    books: over.books ?? [],
    locations: over.locations ?? [],
    latestLocationByArticleId: latestLocationByArticle(over.locations ?? []),
    totalsByArticleId: new Map(Object.entries(over.totals ?? {})),
  };
}

describe("deriveResumeTargets (#82 — the ONE derivation behind the rail and the Read nav)", () => {
  it("empty snapshot → [] (no unfinished target — the Read link hides, the rail renders nothing)", () => {
    expect(deriveResumeTargets(snapshot({}))).toEqual([]);
  });

  it("unfinished filter: in-progress included; finished AND never-opened excluded", () => {
    const a = makeArticle("art-a", "In Progress Piece");
    const b = makeArticle("art-b", "Finished Piece");
    const c = makeArticle("art-c", "Never Opened Piece");
    const result = deriveResumeTargets(
      snapshot({
        standaloneArticles: [a, b, c],
        locations: [
          loc("art-a", 40, "2026-01-02T00:00:00.000Z"),
          loc("art-b", 100, "2026-01-03T00:00:00.000Z"),
        ],
        totals: { "art-a": 100, "art-b": 100, "art-c": 100 },
      }),
    );
    expect(result.map((e) => e.articleId)).toEqual(["art-a"]);
    expect(result[0]).toMatchObject({ kind: "article", progress: 0.4 });
  });

  it("most-recently-opened first: savedAt descending across standalone articles (D8-10)", () => {
    const a = makeArticle("art-a", "Older Read");
    const b = makeArticle("art-b", "Newer Read");
    const result = deriveResumeTargets(
      snapshot({
        standaloneArticles: [a, b],
        locations: [
          loc("art-a", 30, "2026-01-02T00:00:00.000Z"),
          loc("art-b", 20, "2026-02-02T00:00:00.000Z"),
        ],
        totals: { "art-a": 100, "art-b": 100 },
      }),
    );
    expect(result.map((e) => e.articleId)).toEqual(["art-b", "art-a"]);
  });

  it("book-aware pointer: the book entry's articleId IS the D12-07 resume chapter (max savedAt), and chapters never emit standalone entries", () => {
    const book = makeBook("book-1", ["ch-1", "ch-2", "ch-3"]);
    const result = deriveResumeTargets(
      snapshot({
        standaloneArticles: [],
        books: [book],
        // ch-1 read LONGER ago but further; ch-2 re-skimmed most recently —
        // last-read wins (D12-07), even mid-book or backwards.
        locations: [
          loc("ch-1", 80, "2026-01-02T00:00:00.000Z"),
          loc("ch-2", 10, "2026-03-02T00:00:00.000Z"),
        ],
        totals: { "ch-1": 100, "ch-2": 100, "ch-3": 100 },
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "book",
      articleId: "ch-2",
      resumeChapterId: "ch-2",
      ordinal: 2,
      total: 3,
      lastOpenedAt: "2026-03-02T00:00:00.000Z",
    });
  });

  it("a finished book is excluded; a partially-finished book stays honestly in-progress (D14-19)", () => {
    const done = makeBook("book-done", ["dch-1", "dch-2"]);
    const underway = makeBook("book-underway", ["uch-1", "uch-2"]);
    const result = deriveResumeTargets(
      snapshot({
        books: [done, underway],
        locations: [
          loc("dch-1", 100, "2026-01-02T00:00:00.000Z"),
          loc("dch-2", 100, "2026-01-03T00:00:00.000Z"),
          loc("uch-1", 100, "2026-02-02T00:00:00.000Z"),
          loc("uch-2", 25, "2026-02-03T00:00:00.000Z"),
        ],
        totals: {
          "dch-1": 100,
          "dch-2": 100,
          "uch-1": 100,
          "uch-2": 100,
        },
      }),
    );
    expect(result.map((e) => e.articleId)).toEqual(["uch-2"]);
    expect(result[0]).toMatchObject({ kind: "book", progress: 0.5 });
  });

  it("mark-unread reintroduction: no permanent exclusion memory — unread drops out, the next in-progress save re-enters", () => {
    const a = makeArticle("art-a", "Read Then Reopened");
    const finished = snapshot({
      standaloneArticles: [a],
      locations: [loc("art-a", 100, "2026-01-02T00:00:00.000Z")],
      totals: { "art-a": 100 },
    });
    expect(deriveResumeTargets(finished).map((e) => e.articleId)).toEqual([]);

    // setArticleReadState(a, false) deletes the location rows — the
    // article is unread, and while unread it is NOT a target.
    const markedUnread = snapshot({
      standaloneArticles: [a],
      locations: [],
      totals: { "art-a": 100 },
    });
    expect(
      deriveResumeTargets(markedUnread).map((e) => e.articleId),
    ).toEqual([]);

    // The reader opens it again; its first in-progress save reintroduces
    // the article as a target — eligibility was never permanently lost.
    const reopened = snapshot({
      standaloneArticles: [a],
      locations: [loc("art-a", 10, "2026-01-05T00:00:00.000Z")],
      totals: { "art-a": 100 },
    });
    expect(deriveResumeTargets(reopened).map((e) => e.articleId)).toEqual([
      "art-a",
    ]);
  });

  it("books and articles interleave by genuine recency: a book's sort key is its resume chapter's savedAt (D8-10)", () => {
    const a = makeArticle("art-a", "Midlist Article");
    const book = makeBook("book-1", ["ch-1", "ch-2"]);
    const result = deriveResumeTargets(
      snapshot({
        standaloneArticles: [a],
        books: [book],
        locations: [
          // article read most recently → first overall
          loc("art-a", 50, "2026-04-01T00:00:00.000Z"),
          // book's resume chapter → middle
          loc("ch-2", 20, "2026-03-01T00:00:00.000Z"),
          // book's other chapter, older — feeds progress, not ordering
          loc("ch-1", 100, "2026-02-01T00:00:00.000Z"),
        ],
        totals: { "art-a": 100, "ch-1": 100, "ch-2": 100 },
      }),
    );
    expect(result.map((e) => e.articleId)).toEqual(["art-a", "ch-2"]);
    expect(result[1]).toMatchObject({ kind: "book", ordinal: 2, total: 2 });
  });
});
