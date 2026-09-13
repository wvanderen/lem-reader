// tests/unit/readingPosition.test.ts
// Issue #2 — the reading-completion truth table for the ONE pure policy
// home (src/reader/readingPosition.ts). Completion ("have I finished this
// article?") previously lived in four decision sites + a UI-held constant;
// every row below pins the module those sites now call. PURE coverage —
// no React, no DOM, no Dexie (the reading-state.test.ts discipline).
//
// Truth-table sections (the issue's acceptance criteria):
//   1. Threshold boundary — isFinishedOffset at/around 0.98 (>= semantics
//      preserved byte-for-byte from the old readingState ratio formula).
//   2. At-end in both reading modes — atScrollBottom (scrolling geometry,
//      moved verbatim from useScrollSave.test.ts) + isFinalPage (paginated
//      committed-page) + endPinOffset/isAtArticleEnd (the shared substrate).
//   3. Restore-at-end landing — landingForRestore for offsets short of /
//      at / past the total (260908-oht end-landing).
//   4. savedAt ties — latestLocationByArticle keeps the FIRST row when
//      savedAt compares equal (strict > — the fold moved verbatim from
//      bookProgress.ts), and the finished check consumes the folded row.
import { describe, expect, it } from "vitest";
import {
  FINISHED_THRESHOLD,
  BOTTOM_EPSILON_PX,
  isFinishedOffset,
  atScrollBottom,
  isFinalPage,
  endPinOffset,
  isAtArticleEnd,
  landingForRestore,
  latestLocationByArticle,
} from "../../src/reader/readingPosition";
import { ArticleSchema, LocationRecordSchema } from "../../src/content/schema";
import type { CanonicalArticle } from "../../src/content/types";
import type { LocationRecord } from "../../src/content/schema";
import { graphemeLength } from "../../src/content/normalizeText";

// ─── fixture builders (pageAnchor.test.ts analogs) ─────────────────────────

const baseArticle = {
  id: "reading-position-test",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/reading-position",
    title: "Reading Position Test",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "sha256:deadbeef",
  },
};

function makeArticle(): CanonicalArticle {
  return ArticleSchema.parse({
    ...baseArticle,
    blocks: [
      { kind: "paragraph", content: [{ text: "Opening passage of the article." }] },
      { kind: "paragraph", content: [{ text: "Closing passage of the article." }] },
    ],
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

// ─── 1. threshold boundary ──────────────────────────────────────────────────

describe("FINISHED_THRESHOLD + isFinishedOffset — threshold boundary table", () => {
  it("the threshold constant is 0.98 (D8-12 + RESEARCH §Pattern 4 L498)", () => {
    expect(FINISHED_THRESHOLD).toBe(0.98);
  });

  it("offset exactly at the boundary (total 100, offset 98) → finished (>= semantics)", () => {
    expect(isFinishedOffset(98, 100)).toBe(true);
  });

  it("one below the boundary (total 100, offset 97) → not finished", () => {
    expect(isFinishedOffset(97, 100)).toBe(false);
  });

  it("offset = total → finished", () => {
    expect(isFinishedOffset(100, 100)).toBe(true);
  });

  it("offset past the total (corpus changed since save) → finished", () => {
    expect(isFinishedOffset(250, 100)).toBe(true);
  });

  it("offset 0 on a non-empty article → not finished (opened = started, D14-18)", () => {
    expect(isFinishedOffset(0, 100)).toBe(false);
  });

  it("opened zero-length article (total 0, positive offset) → finished — byte-stable edge", () => {
    // Math.min(1, positive/0) = 1 >= 0.98 — the deliberate preserved edge
    // from the old readingState ratio formula (any "fix" here would change
    // rendered behavior).
    expect(isFinishedOffset(5, 0)).toBe(true);
  });

  it("offset 0 on a zero-length article (0/0 = NaN) → not finished — byte-stable edge", () => {
    expect(isFinishedOffset(0, 0)).toBe(false);
  });
});

// ─── 2. at-end in both reading modes ────────────────────────────────────────

describe("atScrollBottom — scrolling-mode boundary table (viewport 800, scrollHeight 2000 → scrollMax 1200)", () => {
  /** Build one ScrollGeometry observation (the clump the predicate consumes). */
  const geometry = (scrollY: number, scrollHeight = 2000) => ({
    scrollY,
    viewportHeight: 800,
    scrollHeight,
  });

  it("the default tolerance is BOTTOM_EPSILON_PX = 4 (sub-pixel/rounding slack)", () => {
    expect(BOTTOM_EPSILON_PX).toBe(4);
  });

  it("exact bottom (scrollY 1200) → true", () => {
    expect(atScrollBottom(geometry(1200))).toBe(true);
  });

  it("within 4px above bottom (scrollY 1197 = scrollMax − 3) → true", () => {
    expect(atScrollBottom(geometry(1197))).toBe(true);
  });

  it("exactly at the epsilon edge (scrollY 1196 = scrollMax − 4) → true", () => {
    expect(atScrollBottom(geometry(1196))).toBe(true);
  });

  it("5px above bottom (scrollY 1195) → false", () => {
    expect(atScrollBottom(geometry(1195))).toBe(false);
  });

  it("top of a scrollable page (scrollY 0) → false", () => {
    expect(atScrollBottom(geometry(0))).toBe(false);
  });

  it("non-scrollable article (scrollHeight === viewportHeight) → false (never passively finishes)", () => {
    expect(atScrollBottom(geometry(0, 800))).toBe(false);
  });

  it("non-scrollable article (scrollHeight < viewportHeight) → false", () => {
    expect(atScrollBottom(geometry(0, 700))).toBe(false);
  });

  it("rubber-band overshoot (scrollY > scrollMax) → true", () => {
    expect(atScrollBottom(geometry(1210))).toBe(true);
  });
});

describe("isFinalPage — paginated-mode boundary table (the 260908-oht pin eligibility)", () => {
  it("last page of a multi-page set (page 2 of 3) → true", () => {
    expect(isFinalPage(2, 3)).toBe(true);
  });

  it("a non-last page (page 0 of 3) → false", () => {
    expect(isFinalPage(0, 3)).toBe(false);
  });

  it("a middle page (page 1 of 3) → false", () => {
    expect(isFinalPage(1, 3)).toBe(false);
  });

  it("the ONLY page of a one-page set (page 0 of 1) → false (POLISH-02 open-reads-0)", () => {
    expect(isFinalPage(0, 1)).toBe(false);
  });

  it("out-of-range indices → false (defensive; pageAnchorOffset returns 0 there)", () => {
    expect(isFinalPage(-1, 3)).toBe(false);
    expect(isFinalPage(3, 3)).toBe(false);
  });
});

describe("endPinOffset + isAtArticleEnd — the shared end substrate", () => {
  it("endPinOffset === graphemeLength(article) — the REUSE-DO-NOT-FORK contract", () => {
    const article = makeArticle();
    expect(endPinOffset(article)).toBe(graphemeLength(article));
  });

  it("the end pin IS at-end (the final-page/scroll-bottom/mark-read pins agree)", () => {
    const article = makeArticle();
    expect(isAtArticleEnd(endPinOffset(article), graphemeLength(article))).toBe(true);
  });

  it("isAtArticleEnd — total → true, total − 1 → false, overshoot → true, 0 → false", () => {
    expect(isAtArticleEnd(100, 100)).toBe(true);
    expect(isAtArticleEnd(99, 100)).toBe(false);
    expect(isAtArticleEnd(101, 100)).toBe(true);
    expect(isAtArticleEnd(0, 100)).toBe(false);
  });
});

// ─── 3. restore-at-end landing ──────────────────────────────────────────────

describe("landingForRestore — restore/mode-swap landing table (260908-oht end-landing)", () => {
  it("offset at the total (a finished article's pinned save) → \"end\"", () => {
    expect(landingForRestore(100, 100)).toBe("end");
  });

  it("offset PAST the total (corpus changed since the save) → \"end\"", () => {
    expect(landingForRestore(140, 100)).toBe("end");
  });

  it("offset one short of the total → \"passage\" (normal findScrollTarget restore)", () => {
    expect(landingForRestore(99, 100)).toBe("passage");
  });

  it("offset 0 (article top) → \"passage\"", () => {
    expect(landingForRestore(0, 100)).toBe("passage");
  });

  it("composed with the end pin: a pinned save lands at \"end\"", () => {
    const article = makeArticle();
    const pinned = endPinOffset(article);
    expect(landingForRestore(pinned, graphemeLength(article))).toBe("end");
  });
});

// ─── 4. savedAt ties ────────────────────────────────────────────────────────

describe("latestLocationByArticle — the D8-10 fold + savedAt-tie table", () => {
  it("newer savedAt wins regardless of array order", () => {
    const older = loc("art-a", 10, "2026-01-02T00:00:00.000Z");
    const newer = loc("art-a", 90, "2026-01-03T00:00:00.000Z");
    expect(latestLocationByArticle([older, newer]).get("art-a")).toBe(newer);
    expect(latestLocationByArticle([newer, older]).get("art-a")).toBe(newer);
  });

  it("savedAt TIE → the FIRST row in iteration order wins (strict > keeps the incumbent)", () => {
    const tie = "2026-01-02T12:00:00.000Z";
    const first = loc("art-a", 100, tie); // finished offset
    const second = loc("art-a", 50, tie); // mid-article offset, SAME savedAt
    // Array order decides — the fold never swaps on an equal comparison.
    expect(latestLocationByArticle([first, second]).get("art-a")).toBe(first);
    expect(latestLocationByArticle([second, first]).get("art-a")).toBe(second);
  });

  it("a tie across revisions (same articleId, different revision) also keeps the first row", () => {
    const tie = "2026-01-02T12:00:00.000Z";
    const rev1 = loc("art-a", 100, tie, 1);
    const rev2 = loc("art-a", 0, tie, 2);
    expect(latestLocationByArticle([rev1, rev2]).get("art-a")).toBe(rev1);
    expect(latestLocationByArticle([rev2, rev1]).get("art-a")).toBe(rev2);
  });

  it("articles fold independently (max savedAt per articleId)", () => {
    const aNew = loc("art-a", 10, "2026-01-05T00:00:00.000Z");
    const aOld = loc("art-a", 20, "2026-01-01T00:00:00.000Z");
    const b = loc("art-b", 30, "2026-01-03T00:00:00.000Z");
    const latest = latestLocationByArticle([aNew, aOld, b]);
    expect(latest.get("art-a")).toBe(aNew);
    expect(latest.get("art-b")).toBe(b);
    expect(latest.size).toBe(2);
  });

  it("empty input → empty map", () => {
    expect(latestLocationByArticle([]).size).toBe(0);
  });

  it("the finished check consumes the FOLDED row — a tie between a finished and an unfinished offset keeps array-order truth", () => {
    const total = 100;
    const finishedRow = loc("art-a", 100, "2026-01-02T12:00:00.000Z");
    const midRow = loc("art-a", 50, "2026-01-02T12:00:00.000Z");
    const finishedFirst = latestLocationByArticle([finishedRow, midRow]).get("art-a")!;
    const midFirst = latestLocationByArticle([midRow, finishedRow]).get("art-a")!;
    expect(isFinishedOffset(finishedFirst.graphemeOffset, total)).toBe(true);
    expect(isFinishedOffset(midFirst.graphemeOffset, total)).toBe(false);
  });
});
