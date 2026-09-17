// tests/unit/library/reading-stats.test.ts
// Issue #38 — the pure reading-stats derivations (readingStats.ts). Pins
// the agreed prototype-A presentation algebra at the module seam:
//   - formatDuration's voice (verbatim from the prototype branch) across
//     the minute/hour boundaries;
//   - the "{duration} read here" meta line's under-one-minute suppression;
//   - deriveReadingStats folding totals + per-article time over the SAME
//     counted sessions, with orphan history (an articleId missing from the
//     library — the issue #37 import ride-along edge) counting nowhere.
import { describe, expect, it } from "vitest";
import { ReadingSessionRecordSchema } from "../../../src/content/schema";
import type { ReadingSessionRecord } from "../../../src/content/schema";
import {
  deriveReadingStats,
  formatDuration,
  timeReadLabel,
} from "../../../src/ingestion/library/readingStats";

function session(
  id: string,
  articleId: string,
  activeSeconds: number,
): ReadingSessionRecord {
  return ReadingSessionRecordSchema.parse({
    schemaVersion: 1,
    id,
    articleId,
    startedAt: "2026-09-15T10:00:00.000Z",
    endedAt: "2026-09-15T10:05:00.000Z",
    startOffset: 0,
    endOffset: 10,
    activeSeconds,
  });
}

describe("formatDuration — the one duration voice (prototype-A verbatim)", () => {
  it("says 'under a minute' in words below 60 seconds (never '0 min')", () => {
    expect(formatDuration(0)).toBe("under a minute");
    expect(formatDuration(1)).toBe("under a minute");
    expect(formatDuration(59)).toBe("under a minute");
  });

  it("renders whole minutes from one minute up (rounding)", () => {
    expect(formatDuration(60)).toBe("1 min");
    expect(formatDuration(61)).toBe("1 min");
    expect(formatDuration(90)).toBe("2 min");
  });

  it("rounds into the hour at the 60-minute boundary (3599s ≈ 60 min → 1 h)", () => {
    expect(formatDuration(3540)).toBe("59 min");
    expect(formatDuration(3599)).toBe("1 h");
  });

  it("floors hours with trailing minutes", () => {
    expect(formatDuration(3600)).toBe("1 h");
    expect(formatDuration(3660)).toBe("1 h 1 min");
    expect(formatDuration(7200)).toBe("2 h");
    expect(formatDuration(7500)).toBe("2 h 5 min");
  });
});

describe("timeReadLabel — the card meta line (issue #38)", () => {
  it("is suppressed under one minute (silence is the empty state)", () => {
    expect(timeReadLabel(0)).toBeUndefined();
    expect(timeReadLabel(59)).toBeUndefined();
  });

  it("reads '{duration} read here' from one accrued minute up", () => {
    expect(timeReadLabel(60)).toBe("1 min read here");
    expect(timeReadLabel(300)).toBe("5 min read here");
    expect(timeReadLabel(4500)).toBe("1 h 15 min read here");
  });
});

describe("deriveReadingStats — the whole-library fold", () => {
  const KNOWN = new Set(["article-a", "article-b"]);

  it("empty history folds to the silent zero state", () => {
    const stats = deriveReadingStats([], KNOWN);
    expect(stats.totalSeconds).toBe(0);
    expect(stats.visits).toBe(0);
    expect(stats.secondsByArticleId.size).toBe(0);
  });

  it("sums time and visits across sessions, per-article and whole-library", () => {
    const stats = deriveReadingStats(
      [
        session("v1", "article-a", 120),
        session("v2", "article-a", 60),
        session("v3", "article-b", 30),
      ],
      KNOWN,
    );
    expect(stats.totalSeconds).toBe(210);
    expect(stats.visits).toBe(3);
    expect(stats.secondsByArticleId.get("article-a")).toBe(180);
    expect(stats.secondsByArticleId.get("article-b")).toBe(30);
  });

  it("orphan history (article no longer/not in the library) counts nowhere", () => {
    const stats = deriveReadingStats(
      [
        session("v1", "article-a", 120),
        session("v2", "removed-article", 3600),
      ],
      KNOWN,
    );
    // Totals and visits sum over the SAME counted sessions.
    expect(stats.totalSeconds).toBe(120);
    expect(stats.visits).toBe(1);
    expect(stats.secondsByArticleId.has("removed-article")).toBe(false);
  });

  it("is order-independent over the same rows", () => {
    const rows = [
      session("v1", "article-a", 45),
      session("v2", "article-b", 90),
      session("v3", "article-a", 15),
    ];
    const forward = deriveReadingStats(rows, KNOWN);
    const reversed = deriveReadingStats([...rows].reverse(), KNOWN);
    expect(reversed.totalSeconds).toBe(forward.totalSeconds);
    expect(reversed.visits).toBe(forward.visits);
    expect([...reversed.secondsByArticleId.entries()]).toEqual(
      expect.arrayContaining([...forward.secondsByArticleId.entries()]),
    );
  });
});
