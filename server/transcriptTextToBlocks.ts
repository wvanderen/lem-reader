// server/transcriptTextToBlocks.ts
// The paste-transcript fallback (the youtube-bot-check companion): turn
// transcript text the reader pasted from YouTube's own "Show transcript"
// panel — or any plain timestamped/plain-text transcript — into the same
// canonical blocks the fetched-transcript path produces (server/
// transcriptToBlocks.ts). The server-side parse keeps the security boundary
// where it belongs: the canonical document model is derived ONCE here, from
// untrusted text, exactly like every other ingest source (D7-03 —
// input-source-agnostic pipeline; the same-stage contract).
//
// Two accepted shapes (detected, never asked):
//   1. Timestamped — YouTube's transcript panel copies as alternating lines
//      ("0:12" / cue text), and other common exports prefix each cue with
//      "M:SS", "H:MM:SS", an optional "[...]" wrapper, or " - " before the
//      text. Timestamps become the block-keyed anchors; text never carries
//      them (the decision-#26 rule: timestamps are metadata).
//   2. Plain text — no timestamps anywhere: lines group into print-like
//      paragraphs under the SAME ~380/~600 budgets (no fabricated timings —
//      a missing timestamp is honest absence, never a synthesized 0).
//
// Deterministic and pure: same text → same blocks/anchors/warnings, every
// time (the transcriptToBlocks contract).
import type { Block, TranscriptSegmentAnchor } from "../src/content/schema";
import type { TranscriptSegment } from "../src/ingestion/youtube";
import {
  TRANSCRIPT_PARAGRAPH_CAP_CHARS,
  TRANSCRIPT_PARAGRAPH_TARGET_CHARS,
  transcriptToBlocks,
} from "./transcriptToBlocks";

/** PastedTranscriptNormalization — the adapter's output. `anchors` and
 * `durationSeconds` are present ONLY for the timestamped shape (undefined
 * means "no timings existed in the paste" — honest absence). */
export interface PastedTranscriptNormalization {
  blocks: Block[];
  anchors: TranscriptSegmentAnchor[];
  warnings: string[];
  durationSeconds: number | undefined;
}

/** TIMESTAMPED_LINE — a line that is (or begins with) a clock stamp:
 * "0:00", "1:02:03", "[0:12]", "0:12 - text", "0:12 text". The stamp is
 * bounded (minutes ≤ 999, seconds exactly two digits) so a random short
 * line like "8:9" never parses; the optional bracket wrapper covers the
 * common "[00:12]" export style. */
const TIMESTAMPED_LINE = /^\s*\[?(\d{1,3}:\d{1,2}:\d{2}|\d{1,3}:\d{2})\]?\s*-?\s*(.*)$/;

/** parseClockToMs — "M:SS" / "H:MM:SS" → milliseconds; null for anything
 * the regex should never have let through (defensive). */
function parseClockToMs(raw: string): number | null {
  const parts = raw.split(":");
  if (parts.length !== 2 && parts.length !== 3) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) return null;
  const [h, m, s] =
    parts.length === 3 ? [nums[0]!, nums[1]!, nums[2]!] : [0, nums[0]!, nums[1]!];
  if (s > 59 || m > 59) return null;
  return ((h * 60 + m) * 60 + s) * 1000;
}

/**
 * pastedTranscriptToBlocks — parse pasted transcript text and group it with
 * the SAME normalization the fetched path uses. Timestamped pastes reuse
 * transcriptToBlocks verbatim (budget grouping + anchors); plain pastes
 * group lines into paragraphs under the same budgets with NO anchors.
 */
export function pastedTranscriptToBlocks(text: string): PastedTranscriptNormalization {
  const lines = text.split(/\r?\n/);

  // ── Timestamped detection pass ────────────────────────────────────────
  // A paste counts as timestamped when at least two lines are stamps (one
  // lone stamp is noise — a mention like "at 5:30 we..." is prose, and a
  // single-stamp paste has no ordering value over plain text).
  const cues: { startMs: number; textParts: string[] }[] = [];
  let introParts: string[] = [];
  let stampLines = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const m = TIMESTAMPED_LINE.exec(trimmed);
    if (m) {
      const ms = parseClockToMs(m[1]!);
      if (ms !== null) {
        stampLines += 1;
        cues.push({ startMs: ms, textParts: m[2]!.length > 0 ? [m[2]!] : [] });
        continue;
      }
    }
    // A non-stamp line attaches to the current cue, or to the intro when
    // no cue has started yet (text before the first stamp is kept — it is
    // real content, never silently dropped).
    if (cues.length > 0) cues[cues.length - 1]!.textParts.push(trimmed);
    else introParts.push(trimmed);
  }

  if (stampLines >= 2) {
    const segments: TranscriptSegment[] = [];
    for (let i = 0; i < cues.length; i += 1) {
      const cue = cues[i]!;
      const joined = cue.textParts.join(" ").trim();
      if (joined.length === 0) continue; // whitespace-only cue — transcriptToBlocks re-drops and DISCLOSES it
      segments.push({ text: joined, startMs: cue.startMs, durationMs: 0 });
    }
    // Derive each segment's duration from the FOLLOWING cue's start (the
    // last cue keeps 0 — unknown end, honest absence), then hand the whole
    // result to the SAME normalizer the fetched path uses.
    for (let i = 0; i < segments.length - 1; i += 1) {
      segments[i]!.durationMs = Math.max(0, segments[i + 1]!.startMs - segments[i]!.startMs);
    }
    const durationSeconds =
      segments.length > 0 ? Math.ceil(segments[segments.length - 1]!.startMs / 1000) : undefined;
    const normalized = transcriptToBlocks({
      ok: true,
      videoId: "",
      title: "Transcript",
      channel: "",
      durationSeconds: durationSeconds ?? 0,
      languageCode: "und",
      isAutoGenerated: false,
      segments,
      chapters: [],
    });
    // Text BEFORE the first stamp (a copy often carries a leading heading
    // or channel line) is real content — kept as leading paragraph block(s),
    // never silently dropped. The anchors' blockIndex offsets by however
    // many blocks the intro contributed (transcriptToBlocks numbers from 0).
    const introBlocks: Block[] = [];
    if (introParts.length > 0) {
      introBlocks.push({
        kind: "paragraph",
        content: [{ text: introParts.join(" "), marks: [] }],
      });
    }
    return {
      blocks: [...introBlocks, ...normalized.blocks],
      anchors: normalized.anchors.map((a) => ({ ...a, blockIndex: a.blockIndex + introBlocks.length })),
      warnings: [
        "Transcript pasted manually — captions and timings are unverified",
        ...normalized.warnings,
      ],
      durationSeconds,
    };
  }

  // ── Plain-text path — no fabricated timings ───────────────────────────
  // Non-empty lines group into paragraphs under the same budgets: lines
  // join with a space while the paragraph is below the ~380 target; a line
  // that would push past the ~600 cap starts a fresh paragraph (never
  // split). Blank lines force a break (the pasted text's own structure).
  const blocks: Block[] = [];
  let group: string[] = [];
  let groupLen = 0;
  const flush = () => {
    if (group.length === 0) return;
    blocks.push({ kind: "paragraph", content: [{ text: group.join(" "), marks: [] }] });
    group = [];
    groupLen = 0;
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      flush();
      continue;
    }
    if (group.length > 0 && (groupLen >= TRANSCRIPT_PARAGRAPH_TARGET_CHARS ||
      groupLen + 1 + trimmed.length > TRANSCRIPT_PARAGRAPH_CAP_CHARS)) {
      flush();
    }
    group.push(trimmed);
    groupLen = group.length === 1 ? trimmed.length : groupLen + 1 + trimmed.length;
  }
  flush();
  return {
    blocks,
    anchors: [],
    warnings:
      blocks.length > 0
        ? ["Transcript pasted manually — captions and timings are unverified"]
        : [],
    durationSeconds: undefined,
  };
}
