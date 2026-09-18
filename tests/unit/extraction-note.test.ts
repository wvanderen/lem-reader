// tests/unit/extraction-note.test.ts
// Issue #41 (flow N6) — the extractionNote truth table. The disclosure is
// keyed on the PERSISTED model field (ingestionMeta.extractionConfidence —
// the server/confidence.ts signal + the ingest-time ASR floor), never on
// youtube-ness; ASR transcripts carry the caption-specific wording. The
// copy is reader-facing product surface pinned byte-for-byte here, in the
// youtube-copy.test.ts discipline.
import { describe, expect, it } from "vitest";
import { extractionNote } from "../../src/routes/extractionNote";
import { ArticleSchema } from "../../src/content/schema";
import type { CanonicalArticle } from "../../src/content/schema";

function makeArticle(
  meta?: Record<string, unknown> & { transcript?: Record<string, unknown> },
): CanonicalArticle {
  return ArticleSchema.parse({
    id: "note-article",
    revision: 1,
    lang: "en",
    provenance: {
      title: "Note Article",
      retrievedAt: "2026-09-01T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "0".repeat(64),
    },
    blocks: [{ kind: "paragraph", content: [{ text: "Body text." }] }],
    ...(meta ? { ingestionMeta: meta } : {}),
  });
}

const HIGH = {
  source: "url",
  originalHtmlHash: "sha256:" + "0".repeat(64),
  extractionConfidence: "high",
  extractionWarnings: [],
};

const LOW_ASR = {
  source: "youtube",
  originalHtmlHash: "sha256:" + "0".repeat(64),
  extractionConfidence: "low",
  extractionWarnings: [],
  transcript: {
    videoId: "dQw4w9WgXcQ",
    durationSeconds: 212,
    captionSource: "asr",
    captionLanguage: "en",
    segments: [{ blockIndex: 0, startMs: 0 }],
  },
};

const LOW_WEB = { ...HIGH, extractionConfidence: "low" };

const HIGH_MANUAL_TRANSCRIPT = {
  ...LOW_ASR,
  extractionConfidence: "high",
  transcript: { ...LOW_ASR.transcript, captionSource: "manual" },
};

describe("extractionNote (issue #41, flow N6)", () => {
  it("is silent for an article without ingestionMeta (bundled fixtures)", () => {
    expect(extractionNote(makeArticle())).toBeUndefined();
  });

  it("is silent for a confident article — never a placeholder", () => {
    expect(extractionNote(makeArticle(HIGH))).toBeUndefined();
  });

  it("is silent for a confident manual-caption transcript", () => {
    expect(extractionNote(makeArticle(HIGH_MANUAL_TRANSCRIPT))).toBeUndefined();
  });

  it("an ASR transcript discloses the auto-caption wording, byte-pinned", () => {
    expect(extractionNote(makeArticle(LOW_ASR))).toBe(
      "Transcribed from auto-generated captions, so the wording may not be exact.",
    );
  });

  it("a low-confidence non-transcript article discloses generically, byte-pinned", () => {
    expect(extractionNote(makeArticle(LOW_WEB))).toBe(
      "This article may be incomplete or inaccurate — it could not be read reliably.",
    );
  });

  it("a manual-caption transcript forced low discloses generically (model-keyed, not youtube-keyed)", () => {
    const meta = {
      ...HIGH_MANUAL_TRANSCRIPT,
      extractionConfidence: "low",
    };
    expect(extractionNote(makeArticle(meta))).toBe(
      "This article may be incomplete or inaccurate — it could not be read reliably.",
    );
  });

  it("the note never carries internal jargon", () => {
    for (const meta of [LOW_ASR, LOW_WEB]) {
      const note = extractionNote(makeArticle(meta)) ?? "";
      expect(note.toLowerCase()).not.toMatch(
        /extraction|confidence|asr|zod|schema|revision/,
      );
    }
  });
});
