// tests/unit/server/transcript-corpus.spec.ts
// Issue #39 (decision #26) — the REQUIRED corpus test: a synthetic 3-hour ASR
// transcript plus a pathological ~2,000-char single cue.
//
// What it pins (the "guarded no-op" contract):
//   1. BUDGETS — every normalized paragraph stays at/below the ~600 hard cap,
//      except the ONE paragraph that is a single unsplit cue (never split a
//      segment — decision #26). The budget is the guard that keeps pagination
//      a no-op for ordinary transcripts.
//   2. ROUND-TRIP — TextQuoteSelectors derived from the article's normalized
//      text resolve back confidently (assertRoundTripAnchor — the same gate
//      the ingest pipeline enforces at admission; timestamps never enter the
//      normalized text, so the D-05 substrate is untouched).
//   3. NO-OP SHAPE — the reading surface sees ONLY paragraph/heading blocks;
//      the pathological cue arrives as ONE whole block whose mid-paragraph
//      fragment splitting (source offsets preserved) is exactly what the
//      existing pagination suites prove (tests/unit/pagination/* +
//      tests/e2e/pagination/no-overflow-invariant.spec.ts own the real-layout
//      side; this corpus test pins the INPUT SHAPE those guards handle).
//
// The text is seeded-random ASR-like prose (no punctuation, normal word
// spaces — decision #26: "ASR text has normal word spaces"). Deterministic:
// the same seed regenerates the same corpus on every run and every runtime.
import { describe, expect, it } from "vitest";
import {
  ArticleSchema,
  type CanonicalArticle,
} from "../../../src/content/schema";
import {
  articleGraphemeIndex,
  normalizeText,
} from "../../../src/content/normalizeText";
import { splitParagraphRuns } from "../../../src/pagination/splitBlock";
import { assertRoundTripAnchor } from "../../../server/ingest";
import { deriveConfidence } from "../../../server/confidence";
import {
  TRANSCRIPT_PARAGRAPH_CAP_CHARS,
  transcriptToBlocks,
} from "../../../server/transcriptToBlocks";

// ── deterministic corpus generation ──────────────────────────────────────────

/** lcg — a seeded linear-congruential PRNG (deterministic across runtimes). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const WORD_BANK = [
  "signal", "gradient", "layer", "network", "budget", "latency", "reader",
  "caption", "segment", "paragraph", "chapter", "marker", "anchor", "offset",
  "measure", "line", "page", "column", "margin", "cursor", "token", "stream",
  "buffer", "window", "sample", "frame", "cache", "queue", "worker", "packet",
  "model", "vector", "matrix", "kernel", "pointer", "cursor", "query", "index",
  "cluster", "feature", "vector", "tensor", "scalar", "domain", "range",
  "graph", "edge", "node", "path", "cycle", "tree", "heap", "stack",
];

/** asrCue — one synthetic ASR cue: unpunctuated, space-separated words, an
 * occasional number, length within 60–140 chars. The seeded draw makes an
 * 84-char quote window (exact + prefix/suffix) colliding anywhere in the
 * corpus astronomically unlikely — real ASR of a 3-hour talk has the same
 * property, which is what lets quote selectors resolve confidently. */
function asrCue(rand: () => number, index: number): string {
  const words: string[] = [];
  let length = 0;
  while (length < 60) {
    let word = WORD_BANK[Math.floor(rand() * WORD_BANK.length)]!;
    if (index % 37 === 0 && words.length === 2) word = String(1900 + Math.floor(rand() * 100));
    words.push(word);
    length += word.length + 1;
  }
  return words.join(" ");
}

interface GeneratedTranscript {
  cues: { text: string; startMs: number }[];
  chapters: { title: string; startMs: number }[];
  pathologicalIndex: number;
}

/** generateThreeHourTranscript — 3 hours of cues at a 1.2s cadence (≈9,000
 * cues), six chapter markers every 30 minutes, and ONE pathological
 * ~2,000-char cue at the midpoint (decision #26's corpus requirement). A
 * seventh chapter sits past the last cue (the rule-5 truncated-transcript
 * drop) and one has no title (rule 2) so the corpus exercises the edge rules
 * at scale. */
function generateThreeHourTranscript(seed: number): GeneratedTranscript {
  const rand = lcg(seed);
  const cues: GeneratedTranscript["cues"] = [];
  const totalMs = 3 * 60 * 60 * 1000;
  let t = 0;
  let i = 0;
  const pathologicalIndex = Math.floor((totalMs / 1200) * 0.5);
  while (t < totalMs) {
    cues.push({
      text: i === pathologicalIndex ? pathologicalCue() : asrCue(rand, i),
      startMs: t,
    });
    t += 1200;
    i += 1;
  }
  const chapters = [
    { title: "Opening", startMs: 0 },
    { title: "Half One", startMs: 30 * 60 * 1000 },
    { title: "Part Three", startMs: 60 * 60 * 1000 },
    { title: "Quarter Four", startMs: 90 * 60 * 1000 },
    { title: "Segment Five", startMs: 120 * 60 * 1000 },
    { title: "Closing Thoughts", startMs: 150 * 60 * 1000 },
    { title: "Beyond The End", startMs: totalMs + 60_000 }, // rule 5
    { title: "   ", startMs: 45 * 60 * 1000 }, // rule 2
  ];
  return { cues, chapters, pathologicalIndex };
}

/** pathologicalCue — a single ~2,000-character caption cue (one machine cue
 * carrying a wall of text — exactly the shape decision #26 requires the
 * corpus to include). EXACTLY 2000 chars, seeded-varied words (a SELF-
 * REPETITIVE wall would trip the quote gate's ambiguity rule — the accepted
 * decision-#26 cost for repetitive ASR — so the pathological member models
 * pathological LENGTH, not repetition), no leading/trailing whitespace. */
function pathologicalCue(): string {
  const rand = lcg(424242);
  const parts: string[] = [];
  let used = 0;
  while (true) {
    const word = WORD_BANK[Math.floor(rand() * WORD_BANK.length)]!;
    if (used + word.length + 1 > 1990) break;
    parts.push(word);
    used += word.length + 1;
  }
  const text = parts.join(" ");
  const pad = 2000 - text.length - 1;
  return `${text} ${"y".repeat(pad)}`;
}

// ── the corpus spec ──────────────────────────────────────────────────────────

describe("transcript corpus — 3-hour ASR + pathological cue (decision #26)", () => {
  const corpus = generateThreeHourTranscript(20260916);
  const normalization = transcriptToBlocks({
    ok: true,
    videoId: "dQw4w9WgXcQ",
    title: "Three Hour Synthetic Lecture",
    channel: "Lem Corpus Channel",
    durationSeconds: 3 * 60 * 60,
    languageCode: "en",
    isAutoGenerated: true,
    segments: corpus.cues.map((c) => ({ text: c.text, startMs: c.startMs, durationMs: 1000 })),
    chapters: corpus.chapters,
  });

  const article: CanonicalArticle = ArticleSchema.parse({
    id: "yt-corpus-three-hour-lecture",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Three Hour Synthetic Lecture",
      author: "Lem Corpus Channel",
      retrievedAt: "2026-09-16T00:00:00.000Z",
      originalHtmlHash: "sha256:corpus",
    },
    blocks: normalization.blocks,
    footnotes: [],
    ingestionMeta: {
      source: "youtube",
      origin: "url",
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      originalHtmlHash: "sha256:corpus",
      fetchedAt: "2026-09-16T00:00:00.000Z",
      extractionConfidence: "low", // the ASR floor (decision #26)
      extractionWarnings: normalization.warnings,
      transcript: {
        videoId: "dQw4w9WgXcQ",
        durationSeconds: 3 * 60 * 60,
        captionSource: "asr",
        captionLanguage: "en",
        segments: normalization.anchors,
      },
    },
  });

  it("normalizes the full corpus into a valid article (parse at the boundary)", () => {
    expect(article.blocks.length).toBeGreaterThan(1000);
    expect(article.ingestionMeta?.transcript?.captionSource).toBe("asr");
  });

  it("BUDGETS: every paragraph ≤ ~600 chars except the lone unsplit pathological cue", () => {
    let oversized = 0;
    for (const block of article.blocks) {
      if (block.kind !== "paragraph") continue;
      const text = block.content.map((r) => r.text).join(" ");
      if (text.length > TRANSCRIPT_PARAGRAPH_CAP_CHARS) {
        oversized += 1;
        // The ONLY legal over-cap paragraph is ONE single unsplit cue — its
        // content is exactly one run (never split a segment, decision #26).
        expect(block.content).toHaveLength(1);
      }
    }
    expect(oversized).toBe(1);
  });

  it("NO-OP SHAPE: only paragraph/heading blocks reach the reading surface", () => {
    expect(article.blocks.every((b) => b.kind === "paragraph" || b.kind === "heading")).toBe(
      true,
    );
  });

  it("CHAPTERS: honored markers become h2 boundaries; edge rules drop theirs with warnings", () => {
    const headings = article.blocks.filter(
      (b) => b.kind === "heading",
    ) as Extract<(typeof article.blocks)[number], { kind: "heading" }>[];
    // 8 chapter markers in, 6 survive (rule-2 whitespace title + rule-5
    // beyond-the-end both drop) — each as an h2.
    expect(headings).toHaveLength(6);
    expect(headings.every((h) => h.level === 2)).toBe(true);
    expect(normalization.warnings).toHaveLength(2);
  });

  it("ANCHOR MAP: one startMs per timestamped block, indexes aligned, times nondecreasing", () => {
    const segments = article.ingestionMeta?.transcript?.segments ?? [];
    expect(segments).toHaveLength(article.blocks.length);
    for (let i = 0; i < segments.length; i += 1) {
      expect(segments[i]!.blockIndex).toBe(i);
      expect(segments[i]!.startMs).toBeGreaterThanOrEqual(0);
      if (i > 0) {
        expect(segments[i]!.startMs).toBeGreaterThanOrEqual(segments[i - 1]!.startMs);
      }
    }
  });

  it("TIMESTAMPS NEVER RENDER: the normalized text carries no timing metadata", () => {
    const text = normalizeText(article);
    expect(text).not.toContain("startMs");
    expect(text).not.toContain("blockIndex");
    // The pathological cue's text is present — as text, once, unmangled.
    expect(text).toContain(pathologicalCue());
  });

  it("ROUND-TRIP: the SC#1 anchor gate resolves confidently over the corpus text", () => {
    // The exact gate ingest runs at admission — refuse-on-ambiguous/orphan.
    expect(() => assertRoundTripAnchor(article)).not.toThrow();
  });

  it("PAGINATION GUARD: the pathological cue SPLITS cleanly (mid-paragraph primitive, offsets preserved)", () => {
    // The direct pagination-engine proof the "guarded no-op" rests on: the
    // 2,000-char cue arrives as ONE paragraph block (asserted above), and the
    // engine's D4-01 splitting primitive (splitParagraphRuns — pure, the same
    // function fragment.ts calls at page boundaries) cuts it at ANY intra-
    // block D-05 offset with the two slices' normalized streams concatenating
    // back to the input's (source offsets preserved — Pitfall-faithful). The
    // real-layout side (line boxes, overflow) stays owned by the existing
    // suites (tests/unit/pagination/* + tests/e2e/pagination/*).
    const pathological = article.blocks.find(
      (b) =>
        b.kind === "paragraph" &&
        b.content.map((r) => r.text).join("").length > TRANSCRIPT_PARAGRAPH_CAP_CHARS,
    );
    expect(pathological).toBeDefined();
    if (pathological?.kind !== "paragraph") return expect.unreachable();
    const lang = article.lang;
    const total = articleGraphemeIndex(article).perBlockLengths[
      article.blocks.indexOf(pathological)
    ];
    expect(total).toBeGreaterThan(1500);
    for (const splitAt of [1, 500, Math.floor(total! / 2), total! - 1]) {
      const { before, after } = splitParagraphRuns(pathological.content, splitAt, lang);
      // The contract splitBlock.ts pins for offset fidelity: before+after
      // concatenate to EXACTLY the input run texts — no character (and no
      // whitespace layout) dropped or moved — so selection/capture and the
      // raw↔norm bridge keep addressing the same source positions after the
      // page-boundary cut, even mid-word.
      const rejoined =
        before.map((r) => r.text).join("") + after.map((r) => r.text).join("");
      expect(rejoined).toBe(pathological.content.map((r) => r.text).join(""));
      // Marks survive on both sides (trivially [] for transcripts, but the
      // Pitfall-4 shape is what the engine relies on).
      expect([...before, ...after].every((r) => Array.isArray(r.marks))).toBe(true);
    }
  });

  it("CONFIDENCE: the corpus is dense enough to read confident — the ASR floor is what flags it", () => {
    // The ING-06 formula alone would call this confident (33+ blocks, 500+
    // chars); ingest's ASR floor (pinned in ingest-youtube.spec.ts) is what
    // forces extractionConfidence "low" — never a silent upgrade to trusted.
    const signals = deriveConfidence(article, { isReaderable: true });
    expect(signals.state).toBe("confident");
    expect(article.ingestionMeta?.extractionConfidence).toBe("low");
  });
});
