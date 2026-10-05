// tests/unit/extraction-note.test.ts
// Issue #41 (flow N6) — the extractionNote truth table. The disclosure is
// keyed on the PERSISTED model field (ingestionMeta.extractionConfidence —
// the server/confidence.ts signal + the ingest-time ASR floor), never on
// youtube-ness; ASR transcripts carry the caption-specific wording. The
// copy is reader-facing product surface pinned byte-for-byte here, in the
// youtube-copy.test.ts discipline.
//
// ADR-0003 extends the table: the partial-content disclosures
// (partialContentWarnings + PARTIAL_CONTENT_NOTE) and the degraded-anchor
// disclosure (annotationsNote) are pinned alongside.
import { describe, expect, it } from "vitest";
import {
  annotationsNote,
  extractionNote,
  partialContentWarnings,
  PARTIAL_CONTENT_NOTE,
} from "../../src/routes/extractionNote";
import { ArticleSchema } from "../../src/content/schema";
import type { CanonicalArticle } from "../../src/content/schema";
import { FAKE_HASH, transcriptIngestionMeta } from "./fixtures/transcript-meta";

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
      originalHtmlHash: FAKE_HASH,
    },
    blocks: [{ kind: "paragraph", content: [{ text: "Body text." }] }],
    ...(meta ? { ingestionMeta: meta } : {}),
  });
}

const HIGH = {
  source: "url",
  originalHtmlHash: FAKE_HASH,
  extractionConfidence: "high",
  extractionWarnings: [],
};

const LOW_ASR = {
  ...transcriptIngestionMeta({ captionSource: "asr" }),
  extractionConfidence: "low",
};

const LOW_WEB = { ...HIGH, extractionConfidence: "low" };

const HIGH_MANUAL_TRANSCRIPT = transcriptIngestionMeta({
  captionSource: "manual",
});

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
      expect(note.toLowerCase()).not.toMatch(/extraction|confidence|asr|zod|schema|revision/);
    }
  });
});

describe("partial-content + annotations disclosures (ADR-0003)", () => {
  it("PARTIAL_CONTENT_NOTE is pinned byte-for-byte", () => {
    expect(PARTIAL_CONTENT_NOTE).toBe("Some content could not be processed.");
  });

  it("partialContentWarnings returns the persisted warning lines, in order", () => {
    const meta = {
      ...HIGH,
      extractionWarnings: [
        "2 parts of the original could not be displayed",
        "1 image could not be included",
      ],
    };
    expect(partialContentWarnings(makeArticle(meta))).toEqual([
      "2 parts of the original could not be displayed",
      "1 image could not be included",
    ]);
  });

  it("partialContentWarnings is empty for no-meta and no-warning articles — silence, never a placeholder", () => {
    expect(partialContentWarnings(makeArticle())).toEqual([]);
    expect(partialContentWarnings(makeArticle(HIGH))).toEqual([]);
  });

  it("annotationsNote discloses degraded anchoring, byte-pinned", () => {
    expect(annotationsNote(makeArticle({ ...HIGH, annotationsDegraded: true }))).toBe(
      "Highlights may be unreliable on this article.",
    );
  });

  it("annotationsNote is silent when anchors are reliable or meta is absent", () => {
    expect(annotationsNote(makeArticle(HIGH))).toBeUndefined();
    expect(annotationsNote(makeArticle())).toBeUndefined();
    expect(annotationsNote(makeArticle({ ...HIGH, annotationsDegraded: false }))).toBeUndefined();
  });
});
