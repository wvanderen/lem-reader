// tests/unit/feed-copy.test.ts
// Issue #121 — the feed refusal copy pins. The Discover surface maps
// cataloged reasons through mapFeedReasonToCopy: the four page-shaped
// generic phrases re-voice for the feed context; EVERYTHING ELSE delegates
// byte-identically to mapReasonToCopy (one catalog, one per-surface voice —
// the pdf-copy/epub-copy/youtube-copy byte-pin precedent).
import { describe, expect, it } from "vitest";
import { IngestionFailureReasonEnum } from "../../src/ingestion/types";
import type { IngestionFailureReason } from "../../src/ingestion/types";
import { mapReasonToCopy, mapFeedReasonToCopy } from "../../src/ingestion/ingestCopy";

describe("mapFeedReasonToCopy — issue #121 feed-voiced refusals", () => {
  it("pins the four feed-voiced re-wordings byte-for-byte", () => {
    const expected: Partial<Record<IngestionFailureReason, string>> = {
      "unsupported-content-type": "This address isn't an RSS or Atom feed.",
      "response-too-large": "This feed is too large.",
      "fetch-failed": "Couldn't reach this feed.",
      "feed-unreadable": "This feed couldn't be read — it may be malformed or not a feed.",
    };
    for (const [reason, copy] of Object.entries(expected)) {
      expect(mapFeedReasonToCopy(reason as IngestionFailureReason)).toBe(copy);
    }
  });

  it("delegates every OTHER cataloged reason to mapReasonToCopy verbatim", () => {
    const reVoiced = new Set([
      "unsupported-content-type",
      "response-too-large",
      "fetch-failed",
    ]);
    for (const reason of IngestionFailureReasonEnum.options) {
      if (reVoiced.has(reason)) continue;
      expect(mapFeedReasonToCopy(reason)).toBe(mapReasonToCopy(reason));
    }
  });
});

describe("mapReasonToCopy — the feed-unreadable member (issue #121)", () => {
  it("maps feed-unreadable to its calm DOC-06 phrase, byte-for-byte", () => {
    expect(mapReasonToCopy("feed-unreadable")).toBe(
      "This feed couldn't be read — it may be malformed or not a feed.",
    );
  });
});
