// tests/unit/server/transcript-text-to-blocks.spec.ts
// The paste-transcript fallback parser (the youtube-bot-check companion).
// Pins the two accepted shapes (timestamped + plain text), the honest
// handling of the edge shapes (intro lines kept, no fabricated timings,
// lone "5:30" mentions treated as prose), and the reuse of the fetched
// path's normalization (budget grouping + block-keyed anchors —
// transcriptToBlocks verbatim). Pure module: no mocks, no network.
import { describe, it, expect } from "vitest";
import { pastedTranscriptToBlocks } from "../../../server/transcriptTextToBlocks";

/** cues — a YouTube-transcript-panel-style alternating paste. */
function panelCues(stamps: string[], texts: string[]): string {
  const lines: string[] = [];
  for (let i = 0; i < stamps.length; i += 1) {
    lines.push(stamps[i]!, texts[i] ?? `cue text ${i}`);
  }
  return lines.join("\n");
}

describe("timestamped pastes", () => {
  it("parses the YouTube panel's alternating stamp/text lines into anchored paragraphs", () => {
    const text = panelCues(
      ["0:00", "0:05", "0:10", "0:15"],
      [
        "Welcome to the video everyone",
        "Today we talk about calm reading",
        "Reading positions stay stable",
        "Thanks for watching the show",
      ],
    );
    const result = pastedTranscriptToBlocks(text, "Test video");
    expect(result.blocks.length).toBeGreaterThan(0);
    expect(result.blocks.every((b) => b.kind === "paragraph")).toBe(true);
    // Anchors are block-keyed, in order, and start at the first stamp.
    expect(result.anchors.length).toBe(result.blocks.length);
    expect(result.anchors[0]).toEqual({ blockIndex: 0, startMs: 0 });
    expect(result.durationSeconds).toBe(15);
    // Timestamps never enter block text (decision #26).
    const joined = result.blocks
      .map((b) => (b.kind === "paragraph" ? b.content[0]!.text : ""))
      .join(" ");
    expect(joined).toContain("calm reading");
    expect(joined).not.toContain("0:05");
  });

  it("accepts inline M:SS, [M:SS], ' - ', and H:MM:SS stamp variants", () => {
    // Short cues group into ONE paragraph — the anchor takes the FIRST
    // cue's start (anchors are block-keyed, not cue-keyed, decision #26).
    const inline = pastedTranscriptToBlocks(
      ["0:00 first words here", "0:10 second words here", "0:20 third words here"].join("\n"),
      "Test video",
    );
    expect(inline.blocks).toHaveLength(1);
    expect(inline.anchors).toEqual([{ blockIndex: 0, startMs: 0 }]);
    expect(inline.blocks[0]!.kind === "paragraph" && inline.blocks[0]!.content[0]!.text).toContain(
      "third words here",
    );

    const bracket = pastedTranscriptToBlocks(
      ["[0:00] alpha line", "[0:10] beta line", "[0:20] gamma line"].join("\n"),
      "Test video",
    );
    expect(bracket.blocks).toHaveLength(1);
    expect(bracket.anchors).toEqual([{ blockIndex: 0, startMs: 0 }]);

    const dash = pastedTranscriptToBlocks(
      ["0:00 - alpha line", "0:10 - beta line", "0:20 - gamma line"].join("\n"),
      "Test video",
    );
    expect(dash.blocks).toHaveLength(1);
    expect(dash.anchors).toEqual([{ blockIndex: 0, startMs: 0 }]);

    const hours = pastedTranscriptToBlocks(
      ["1:02:03 opening line", "1:02:13 middle line", "1:02:23 closing line"].join("\n"),
      "Test video",
    );
    expect(hours.blocks).toHaveLength(1);
    expect(hours.anchors).toEqual([{ blockIndex: 0, startMs: 3_723_000 }]);
    expect(hours.durationSeconds).toBe(3743);
  });

  it("splits long gaps between cues into separate anchored paragraphs", () => {
    // Cues far apart in time still group by the character budgets — the
    // anchor map only splits when a paragraph boundary falls, exactly like
    // the fetched path.
    const spaced = pastedTranscriptToBlocks(
      panelCues(
        ["0:00", "0:30"],
        [
          "a longer cue body that carries real sentence material for the reader to read calmly",
          "another longer cue body with entirely different sentence material for reading",
        ],
      ),
      "Test video",
    );
    expect(spaced.anchors.length).toBe(spaced.blocks.length);
  });

  it("keeps text before the first stamp as a leading paragraph and offsets the anchors", () => {
    const text = ["Some Channel - Transcript", "0:00 first cue", "0:10 second cue"].join("\n");
    const result = pastedTranscriptToBlocks(text, "Test video");
    const first = result.blocks[0]!;
    expect(first.kind).toBe("paragraph");
    expect(first.kind === "paragraph" && first.content[0]!.text).toContain("Some Channel");
    // The intro block consumed index 0; the cue anchors shift by one.
    expect(result.anchors[0]).toEqual({ blockIndex: 1, startMs: 0 });
    expect(result.anchors).toHaveLength(result.blocks.length - 1);
  });

  it("derives durations from following stamps and floors durationSeconds at the last stamp", () => {
    const result = pastedTranscriptToBlocks(
      panelCues(["0:00", "0:04", "0:10"], ["a cue", "b cue", "c cue"]),
      "Test video",
    );
    expect(result.durationSeconds).toBe(10);
  });
});

describe("plain pastes (no timestamps)", () => {
  it("groups lines into budgeted paragraphs with NO anchors and no transcript meta timing", () => {
    const lines = Array.from({ length: 60 }, (_, i) => `plain line ${i} with some words to pad`);
    const result = pastedTranscriptToBlocks(lines.join("\n"), "Test video");
    expect(result.blocks.length).toBeGreaterThan(1);
    expect(result.anchors).toEqual([]);
    expect(result.durationSeconds).toBeUndefined();
    expect(result.warnings[0]).toContain("pasted manually");
  });

  it("respects the pasted text's own blank-line structure", () => {
    const result = pastedTranscriptToBlocks(
      ["para one alpha", "para one beta", "", "para two gamma"].join("\n"),
      "Test video",
    );
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0]!.kind === "paragraph" && result.blocks[0]!.content[0]!.text).toContain(
      "alpha",
    );
    expect(result.blocks[1]!.kind === "paragraph" && result.blocks[1]!.content[0]!.text).toContain(
      "gamma",
    );
  });

  it("treats a lone clock mention as prose, not a stamp", () => {
    const result = pastedTranscriptToBlocks(
      ["At 5:30 in the video something happens", "and then the talk continues", "for a while more"].join("\n"),
      "Test video",
    );
    // One lone stamp < the two-stamp threshold → plain-text path.
    expect(result.anchors).toEqual([]);
    expect(result.durationSeconds).toBeUndefined();
  });
});

describe("honest refusals", () => {
  it("returns no blocks for a whitespace-only paste (the shared extraction-unsupported guard fires)", () => {
    const result = pastedTranscriptToBlocks("   \n\t\n  ", "Test video");
    expect(result.blocks).toEqual([]);
    expect(result.anchors).toEqual([]);
    expect(result.durationSeconds).toBeUndefined();
  });
});
