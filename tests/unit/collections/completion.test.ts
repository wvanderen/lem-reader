// Issue #246 — the shared-completion algebra (src/content/completion.ts).
//
// The ONE definition every completion surface shares: the collection detail
// view's entry rows + progress line, the reader's chapter-transition
// recorder, and the TOC finished marks. These tests pin the honesty
// guarantees the acceptance criteria name:
//
//   - ONE target identity: a book-chapter target and its chapter article
//     are the SAME reading (one completion record), a work-chapter target
//     is its own, and whole-work/article/book targets key separately.
//   - Entry completion for whole-article targets derives from the canonical
//     location (the existing isFinishedOffset contract), and an explicit
//     correction overrides it ONLY while it is the newest signal — reading
//     again supersedes the correction, never the reverse silently.
//   - A book entry finishes only when EVERY declared chapter is finished;
//     a book-level correction overrides until a newer chapter signal.
//   - A work-chapter target's completion comes ONLY from its record — no
//     derivation from the containing work's saved position ever fabricates
//     historic chapter coverage (the skipped-chapter rule).
//   - Chapter transitions come from FORWARD READING MOVES crossing a
//     chapter's canonical end — never from a jump backwards, a landing, or
//     an intermediate position at or before the end.
//   - Collection progress counts finished ENTRIES over total entries —
//     never length-, time-, or page-weighted.

import { describe, expect, it } from "vitest";
import type { Block, CanonicalArticle } from "../../../src/content/types";
import type {
  CollectionEntryTarget,
  CompletionRecord,
  LocationRecord,
} from "../../../src/content/schema";
import { deriveWorkStructure } from "../../../src/content/structure";
import { isFinishedOffset } from "../../../src/reader/readingPosition";
import {
  chapterCompletedByMove,
  collectionProgress,
  completionTargetKey,
  entryFinished,
  type EntryCompletionInputs,
} from "../../../src/content/completion";

const paragraph = (text: string): Block => ({
  kind: "paragraph",
  content: [{ text, marks: [] }],
});

const heading = (level: 2 | 3, text: string): Block => ({
  kind: "heading",
  level,
  content: [{ text, marks: [] }],
});

const makeWork = (): CanonicalArticle => ({
  id: "long-work",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/work",
    title: "The Long Work",
    retrievedAt: "2026-08-07T00:00:00Z",
    originalHtmlHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  blocks: [
    heading(2, "First chapter"),
    paragraph("Body one."),
    heading(2, "Second chapter"),
    paragraph("Body two."),
    heading(2, "Third chapter"),
    paragraph("Body three."),
  ],
  footnotes: [],
});

function record(
  target: CollectionEntryTarget,
  finished: boolean,
  updatedAt: string,
): CompletionRecord {
  return {
    schemaVersion: 1,
    targetKey: completionTargetKey(target),
    target,
    finished,
    source: "reader",
    updatedAt,
  };
}

function location(articleId: string, offset: number, savedAt: string): LocationRecord {
  return { schemaVersion: 1, articleId, revision: 1, graphemeOffset: offset, savedAt };
}

/** The base inputs: no records, no locations, every total unknown. */
function inputs(overrides: Partial<EntryCompletionInputs> = {}): EntryCompletionInputs {
  return {
    completionByKey: new Map(),
    latestLocationByArticleId: new Map(),
    textLengthOf: () => undefined,
    chapterArticleIdsOf: () => [],
    ...overrides,
  };
}

describe("completionTargetKey — the ONE target identity", () => {
  it("keys each target kind by its identifying ids", () => {
    expect(completionTargetKey({ kind: "article", articleId: "a-1" })).toBe("article:a-1");
    expect(completionTargetKey({ kind: "book", bookId: "b-1" })).toBe("book:b-1");
    expect(completionTargetKey({ kind: "book-chapter", bookId: "b-1", articleId: "c-2" })).toBe(
      "article:c-2",
    );
    expect(
      completionTargetKey({ kind: "work-chapter", articleId: "w-1", destinationId: "ch-0.b" }),
    ).toBe("work-chapter:w-1/ch-0.b");
  });

  it("normalizes a book chapter and its chapter article to ONE identity", () => {
    // The chapter IS the article (ADR 0011 — one reading, one completion
    // truth); the book membership is context, not a second reading.
    const asChapter: CollectionEntryTarget = {
      kind: "book-chapter",
      bookId: "b-1",
      articleId: "c-2",
    };
    const asArticle: CollectionEntryTarget = { kind: "article", articleId: "c-2" };
    expect(completionTargetKey(asChapter)).toBe(completionTargetKey(asArticle));
  });
});

describe("entryFinished — whole-article targets derive from the canonical location", () => {
  const total = 1000;
  const target: CollectionEntryTarget = { kind: "article", articleId: "a-1" };

  it("is unfinished with no location — never opened", () => {
    expect(entryFinished(target, inputs({ textLengthOf: () => total }))).toBe(false);
  });

  it("derives finished from an end-pin location (the existing threshold contract)", () => {
    expect(
      entryFinished(
        target,
        inputs({
          textLengthOf: () => total,
          latestLocationByArticleId: new Map([
            ["a-1", location("a-1", total, "2026-01-01T00:00:00.000Z")],
          ]),
        }),
      ),
    ).toBe(isFinishedOffset(total, total));
  });

  it("derives in-progress from a mid-work location", () => {
    expect(
      entryFinished(
        target,
        inputs({
          textLengthOf: () => total,
          latestLocationByArticleId: new Map([
            ["a-1", location("a-1", 400, "2026-01-01T00:00:00.000Z")],
          ]),
        }),
      ),
    ).toBe(false);
  });

  it("a NEWER correction overrides the derived state (mark unfinished without moving the position)", () => {
    const finishedInputs = inputs({
      textLengthOf: () => total,
      latestLocationByArticleId: new Map([
        ["a-1", location("a-1", total, "2026-01-01T00:00:00.000Z")],
      ]),
      completionByKey: new Map([
        ["article:a-1", record(target, false, "2026-01-02T00:00:00.000Z")],
      ]),
    });
    expect(entryFinished(target, finishedInputs)).toBe(false);
  });

  it("a newer READING signal supersedes the correction (reading again is newer intent)", () => {
    const corrected = record(
      { kind: "article", articleId: "a-1" },
      false,
      "2026-01-02T00:00:00.000Z",
    );
    const superseded = inputs({
      textLengthOf: () => total,
      latestLocationByArticleId: new Map([
        // A mid-work save at T3 — newer than the T2 correction, unfinished.
        ["a-1", location("a-1", 400, "2026-01-03T00:00:00.000Z")],
      ]),
      completionByKey: new Map([["article:a-1", corrected]]),
    });
    expect(entryFinished(target, superseded)).toBe(false);

    const finishedAgain = inputs({
      textLengthOf: () => total,
      latestLocationByArticleId: new Map([
        // The end-pin re-pinned at T3 — newer than the correction, finished.
        ["a-1", location("a-1", total, "2026-01-03T00:00:00.000Z")],
      ]),
      completionByKey: new Map([["article:a-1", corrected]]),
    });
    expect(entryFinished(target, finishedAgain)).toBe(true);
  });

  it("a correction stands when no location exists (re-ingest dropped the revision row)", () => {
    expect(
      entryFinished(
        target,
        inputs({
          textLengthOf: () => total,
          completionByKey: new Map([
            ["article:a-1", record(target, true, "2026-01-02T00:00:00.000Z")],
          ]),
        }),
      ),
    ).toBe(true);
  });
});

describe("entryFinished — book targets aggregate their declared chapters", () => {
  const book: CollectionEntryTarget = { kind: "book", bookId: "b-1" };
  const chapterIds = ["c-1", "c-2"];
  const base = inputs({
    chapterArticleIdsOf: (bookId) => (bookId === "b-1" ? chapterIds : []),
    textLengthOf: (id) => (chapterIds.includes(id) ? 1000 : undefined),
  });

  it("is unfinished when no chapter has been read", () => {
    expect(entryFinished(book, base)).toBe(false);
  });

  it("is unfinished while ANY declared chapter is unfinished (39/40 discipline)", () => {
    const withInputs: EntryCompletionInputs = {
      ...base,
      latestLocationByArticleId: new Map([
        ["c-1", location("c-1", 1000, "2026-01-01T00:00:00.000Z")],
      ]),
    };
    expect(entryFinished(book, withInputs)).toBe(false);
  });

  it("finishes when EVERY declared chapter is finished", () => {
    const withInputs: EntryCompletionInputs = {
      ...base,
      latestLocationByArticleId: new Map([
        ["c-1", location("c-1", 1000, "2026-01-01T00:00:00.000Z")],
        ["c-2", location("c-2", 1000, "2026-01-02T00:00:00.000Z")],
      ]),
    };
    expect(entryFinished(book, withInputs)).toBe(true);
  });

  it("a chapter corrected UNFINISHED keeps the book honestly unfinished", () => {
    const withInputs: EntryCompletionInputs = {
      ...base,
      latestLocationByArticleId: new Map([
        ["c-1", location("c-1", 1000, "2026-01-01T00:00:00.000Z")],
        ["c-2", location("c-2", 1000, "2026-01-02T00:00:00.000Z")],
      ]),
      completionByKey: new Map([
        [
          "article:c-2",
          record({ kind: "article", articleId: "c-2" }, false, "2026-01-03T00:00:00.000Z"),
        ],
      ]),
    };
    expect(entryFinished(book, withInputs)).toBe(false);
  });

  it("a book-level correction overrides until a newer chapter signal arrives", () => {
    const allRead: EntryCompletionInputs = {
      ...base,
      latestLocationByArticleId: new Map([
        ["c-1", location("c-1", 1000, "2026-01-01T00:00:00.000Z")],
        ["c-2", location("c-2", 1000, "2026-01-02T00:00:00.000Z")],
      ]),
    };
    // Mark the book UNFINISHED at T3 (newer than every chapter signal).
    const corrected = inputs({
      ...allRead,
      completionByKey: new Map([["book:b-1", record(book, false, "2026-01-03T00:00:00.000Z")]]),
    });
    expect(entryFinished(book, corrected)).toBe(false);

    // Reading a chapter again at T4 supersedes the book correction: the
    // derived all-chapters state is the newest signal.
    const superseded: EntryCompletionInputs = {
      ...corrected,
      latestLocationByArticleId: new Map([
        ["c-1", location("c-1", 1000, "2026-01-01T00:00:00.000Z")],
        ["c-2", location("c-2", 1000, "2026-01-04T00:00:00.000Z")],
      ]),
    };
    expect(entryFinished(book, superseded)).toBe(true);

    // A book correction marked FINISHED over an all-read book stays finished.
    const correctedFinished = inputs({
      ...allRead,
      completionByKey: new Map([["book:b-1", record(book, true, "2026-01-03T00:00:00.000Z")]]),
    });
    expect(entryFinished(book, correctedFinished)).toBe(true);
  });

  it("a chapter-level correction NEWER than the book correction recomputes the book", () => {
    const correctedFinished = record(book, true, "2026-01-03T00:00:00.000Z");
    const withInputs: EntryCompletionInputs = {
      ...base,
      latestLocationByArticleId: new Map([
        ["c-1", location("c-1", 1000, "2026-01-01T00:00:00.000Z")],
      ]),
      completionByKey: new Map([
        ["book:b-1", correctedFinished],
        // Chapter 2 corrected unfinished at T4 — newer than the book's T3.
        [
          "article:c-2",
          record({ kind: "article", articleId: "c-2" }, false, "2026-01-04T00:00:00.000Z"),
        ],
      ]),
    };
    expect(entryFinished(book, withInputs)).toBe(false);
  });
});

describe("entryFinished — work-chapter targets come from records ONLY", () => {
  const target: CollectionEntryTarget = {
    kind: "work-chapter",
    articleId: "w-1",
    destinationId: "ch-0.b",
  };

  it("is unfinished with no record — even when the containing work is end-pinned (no fabricated coverage)", () => {
    const finishedWork = inputs({
      textLengthOf: () => 1000,
      latestLocationByArticleId: new Map([
        ["w-1", location("w-1", 1000, "2026-01-01T00:00:00.000Z")],
      ]),
    });
    expect(entryFinished(target, finishedWork)).toBe(false);
  });

  it("reflects its own record (finished and unfinished corrections)", () => {
    const finished = inputs({
      completionByKey: new Map([
        ["work-chapter:w-1/ch-0.b", record(target, true, "2026-01-02T00:00:00.000Z")],
      ]),
    });
    expect(entryFinished(target, finished)).toBe(true);

    const unfinishedTarget: CollectionEntryTarget = {
      kind: "work-chapter",
      articleId: "w-1",
      destinationId: "ch-0.b",
    };
    const unfinished = inputs({
      completionByKey: new Map([
        ["work-chapter:w-1/ch-0.b", record(unfinishedTarget, false, "2026-01-03T00:00:00.000Z")],
      ]),
    });
    expect(entryFinished(target, unfinished)).toBe(false);
  });
});

describe("chapterCompletedByMove — forward reading moves cross one chapter end", () => {
  const work = makeWork();
  const structure = deriveWorkStructure(work)!;
  const chapters = structure.destinations.filter((d) => d.kind === "chapter");

  it("credits the FIRST crossed end — one chapter per move", () => {
    const [, second, third] = chapters;
    const secondEnd = second!.endOffset;
    const thirdEnd = third!.endOffset;
    // A move spanning TWO ends (an instant leap) credits only the chapter
    // the reader was in — never the skipped one (the AC's anti-fabrication
    // rule; under-completion is correctable, fabrication is not).
    expect(chapterCompletedByMove(secondEnd - 5, thirdEnd + 1, chapters)).toBe(second!.id);
    // A move crossing exactly one end credits it.
    expect(chapterCompletedByMove(0, second!.startOffset, chapters)).toBe("ch-0.b");
  });

  it("credits nothing without crossing an end (movement inside one chapter)", () => {
    const [first] = chapters;
    expect(chapterCompletedByMove(0, first!.endOffset - 1, chapters)).toBeNull();
    expect(
      chapterCompletedByMove(first!.endOffset - 10, first!.endOffset - 2, chapters),
    ).toBeNull();
  });

  it("never credits a BACKWARD move (no completion history rewrites)", () => {
    const [, second] = chapters;
    expect(chapterCompletedByMove(second!.endOffset, second!.startOffset, chapters)).toBeNull();
  });

  it("ignores generated part destinations (chapters are the only targets)", () => {
    expect(chapterCompletedByMove(0, Number.MAX_SAFE_INTEGER, structure.destinations)).toMatch(
      /^ch-/,
    );
  });
});

describe("collectionProgress — finished entries over total entries", () => {
  const articleTarget: CollectionEntryTarget = { kind: "article", articleId: "a-1" };
  const workChapter: CollectionEntryTarget = {
    kind: "work-chapter",
    articleId: "w-1",
    destinationId: "ch-0.b",
  };

  it("counts entries, never weights", () => {
    const chapterIds = ["c-1", "c-2"];
    const base = inputs({
      chapterArticleIdsOf: (bookId) => (bookId === "b-1" ? chapterIds : []),
      textLengthOf: (id) => (id === "a-1" ? 1000 : chapterIds.includes(id) ? 1000 : undefined),
      latestLocationByArticleId: new Map([
        ["a-1", location("a-1", 1000, "2026-01-01T00:00:00.000Z")],
      ]),
      completionByKey: new Map([
        ["work-chapter:w-1/ch-0.b", record(workChapter, true, "2026-01-01T00:00:00.000Z")],
      ]),
    });
    const entries: { target: CollectionEntryTarget }[] = [
      { target: articleTarget }, // finished (end-pin)
      { target: workChapter }, // finished (record)
      { target: { kind: "book", bookId: "b-1" } }, // unfinished (no chapter read)
    ];
    expect(collectionProgress(entries, base)).toEqual({ finished: 2, total: 3 });
  });

  it("an empty collection is 0 of 0 — honest, never 100%", () => {
    expect(collectionProgress([], inputs())).toEqual({ finished: 0, total: 0 });
  });
});
