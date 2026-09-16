// tests/unit/server/youtube-real-network.spec.ts
// Issue #35 AC — "real-network tests kept behind an explicit opt-in". This
// spec hits the LIVE InnerTube endpoints and is SKIPPED unless
// YOUTUBE_REAL_NETWORK=1 is set (the pdf/epub calibration env-gate
// precedent, e.g. PDF_CALIBRATION_DERIVE=1):
//
//   YOUTUBE_REAL_NETWORK=1 vitest run tests/unit/server/youtube-real-network.spec.ts
//
// It validates that the fixture shapes still match live reality — YouTube
// changes InnerTube without notice, so a red run here means "recapture
// fixtures + re-check the parser", never a silent drift. Run sparingly:
// every run is a real request from this IP (no retry, no cache — the same
// posture as production).
import { describe, it, expect } from "vitest";
import { extractYouTubeVideoId } from "../../../src/ingestion/youtube";
import { fetchYouTubeTranscriptFromUrl } from "../../../server/youtubeTranscript";

const ENABLED = process.env.YOUTUBE_REAL_NETWORK === "1";

describe.skipIf(!ENABLED)("YouTube InnerTube real network (opt-in: YOUTUBE_REAL_NETWORK=1)", () => {
  it(
    "fetches transcript + metadata + chapters for a captioned video",
    { timeout: 120_000 },
    async () => {
      const result = await fetchYouTubeTranscriptFromUrl(
        "https://www.youtube.com/watch?v=aircAruvnKk",
      );
      if (!result.ok) throw new Error(`expected ok, got refusal: ${result.refusal}`);
      expect(result.videoId).toBe("aircAruvnKk");
      expect(result.title.length).toBeGreaterThan(0);
      expect(result.channel.length).toBeGreaterThan(0);
      expect(result.durationSeconds).toBeGreaterThan(0);
      expect(result.segments.length).toBeGreaterThan(50);
      // The live fixture capture (2026-09-16) showed 12 creator chapters.
      expect(result.chapters.length).toBeGreaterThanOrEqual(1);
      expect(result.chapters[0]!.title.length).toBeGreaterThan(0);
    },
  );

  it(
    "maps an unavailable video to the unavailable-private refusal",
    { timeout: 60_000 },
    async () => {
      const videoId = extractYouTubeVideoId("https://www.youtube.com/watch?v=SOQjWE4vSgQ");
      expect(videoId).toBe("SOQjWE4vSgQ");
      const result = await fetchYouTubeTranscriptFromUrl(
        "https://www.youtube.com/watch?v=SOQjWE4vSgQ",
      );
      // Terminal refusal, delivered calmly — never a throw.
      expect(result).toEqual({ ok: false, refusal: "unavailable-private" });
    },
  );

  it(
    "serves the srv1 line-level format after the srv3 strip (live caption body)",
    { timeout: 120_000 },
    async () => {
      const result = await fetchYouTubeTranscriptFromUrl(
        "https://youtu.be/dQw4w9WgXcQ",
      );
      if (!result.ok) throw new Error(`expected ok, got refusal: ${result.refusal}`);
      expect(result.segments.length).toBeGreaterThan(40);
      // Line-level means many segments carry the ♪ lyric markers the live
      // capture showed; word-level srv3 would have per-word fragments.
      expect(result.segments.some((s) => s.text.length > 10)).toBe(true);
    },
  );
});
