// tests/unit/fixtures/transcript-meta.ts
// Issue #41 — the ONE transcript ingestionMeta fixture for unit suites
// (the spikeFixtures.ts discipline: a shared builder instead of
// hand-inlined literals). Shape mirrors what the server's YouTube branch
// persists: source "youtube" plus the block-keyed transcript meta
// (captionSource, blockIndex segments — timestamps live ONLY here).
// Consumers spread + override per cell and parse the CONTAINING article
// through ArticleSchema (Zod-at-the-boundary — never a hand-written
// CanonicalArticle literal).

/** The stand-in content hash for fixtures (extraction-note.test.ts voice). */
export const FAKE_HASH = "sha256:" + "0".repeat(64);

/**
 * transcriptIngestionMeta — a schema-valid youtube ingestionMeta carrying a
 * transcript. Defaults: manual captions, 212 s, one block segment. Override
 * `captionSource: "asr"` + `extractionConfidence: "low"` for the ASR case.
 */
export function transcriptIngestionMeta(
  opts: {
    videoId?: string;
    durationSeconds?: number;
    captionSource?: "asr" | "manual";
    extractionConfidence?: "high" | "low";
  } = {},
) {
  return {
    source: "youtube",
    originalHtmlHash: FAKE_HASH,
    extractionConfidence: opts.extractionConfidence ?? "high",
    extractionWarnings: [],
    transcript: {
      videoId: opts.videoId ?? "dQw4w9WgXcQ",
      durationSeconds: opts.durationSeconds ?? 212,
      captionSource: opts.captionSource ?? "manual",
      captionLanguage: "en",
      segments: [{ blockIndex: 0, startMs: 0 }],
    },
  };
}
