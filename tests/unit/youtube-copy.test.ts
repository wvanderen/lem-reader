// tests/unit/youtube-copy.test.ts
// Issue #39 — exact-string calm-copy assertions for the four YouTube
// transcript refusal reasons + the no-jargon guard extended to the 24-reason
// catalog. Mirrors tests/unit/epub-copy.test.ts (the 11-04 byte-for-byte
// copy-pinning precedent).
//
// The copy strings are LOAD-BEARING product surface (DOC-06 calm voice in
// the `.status` live region — D7-04): every character is asserted exactly.
import { describe, expect, it } from "vitest";
import { mapReasonToCopy } from "../../src/ingestion/ingestCopy";
import {
  IngestionFailureReasonEnum,
  type IngestionFailureReason,
} from "../../src/ingestion/types";

// The four issue #39 YouTube entries — calm DOC-06 voice, one per structured
// refusal kind from the #35 transcript client (TranscriptRefusalReasonEnum).
const EXPECTED_YOUTUBE_COPY: Record<string, string> = {
  "youtube-no-captions":
    "This video has no captions, so there is no transcript to read.",
  "youtube-unavailable-private":
    "This video is unavailable — it may be private or removed.",
  "youtube-age-gated":
    "This video is age-restricted, so its transcript can't be fetched.",
  "youtube-bot-check":
    "YouTube is asking for extra verification, so this video can't be added right now.",
};

describe("mapReasonToCopy YouTube entries (issue #39)", () => {
  it("maps each of the four YouTube reasons to its EXACT string, byte-for-byte", () => {
    for (const [reason, expected] of Object.entries(EXPECTED_YOUTUBE_COPY)) {
      expect(mapReasonToCopy(reason as IngestionFailureReason)).toBe(expected);
    }
  });

  it("returns a non-empty calm phrase ending in a period for EVERY cataloged reason (exhaustive)", () => {
    // The single count pin lives in tests/unit/epub-copy.test.ts (24 since
    // issue #39) — this suite asserts coverage, not the number, so catalog
    // growth edits exactly one count.
    for (const reason of IngestionFailureReasonEnum.options) {
      const copy = mapReasonToCopy(reason);
      expect(copy.length).toBeGreaterThan(0);
      expect(copy.endsWith(".")).toBe(true);
    }
  });

  it("does NOT leak internal jargon into any reader-facing refusal copy (T-7-26 lineage)", () => {
    // The raw enum ids (including the youtube-* members and the ArticleSource
    // "youtube" member's sibling "epub-chapter") must never surface.
    const jargonMarkers = [
      "zod",
      "schema",
      "base64",
      "innertube",
      "youtube-",
      "videoId",
      "transcript.segments",
      "exception",
      "error:",
      "undefined",
      "[object",
    ];
    for (const reason of IngestionFailureReasonEnum.options) {
      const copy = mapReasonToCopy(reason).toLowerCase();
      for (const marker of jargonMarkers) {
        expect(copy).not.toContain(marker);
      }
    }
  });
});
