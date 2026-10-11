// tests/unit/annotations/noteText.test.ts
// Issue #174 — the ONE "does this note carry written content?" predicate.
//
// Deletion is proportional to the written content being removed: a highlight
// whose note is empty OR whitespace-only counts as note-less (immediate
// delete, no confirm), while any note with meaningful content — even one
// padded with surrounding whitespace — counts as present. The predicate is a
// DECISION, never a normalizer: it must not trim, mutate, or otherwise
// round-trip the stored text.
import { describe, expect, it } from "vitest";
import { hasNoteContent } from "../../../src/annotations/noteText";

describe("hasNoteContent (issue #174 — whitespace-only commentary counts as absent)", () => {
  it("empty string counts as no note", () => {
    expect(hasNoteContent("")).toBe(false);
  });

  it("whitespace-only commentary counts as no note (spaces, tabs, newlines)", () => {
    expect(hasNoteContent(" ")).toBe(false);
    expect(hasNoteContent("   ")).toBe(false);
    expect(hasNoteContent("\t")).toBe(false);
    expect(hasNoteContent("\n")).toBe(false);
    expect(hasNoteContent(" \n\t \r\n ")).toBe(false);
  });

  it("any non-whitespace character counts as a note", () => {
    expect(hasNoteContent("a")).toBe(true);
    expect(hasNoteContent("Remember this passage.")).toBe(true);
    // Whitespace + punctuation counts — punctuation is written content.
    expect(hasNoteContent(" . ")).toBe(true);
    expect(hasNoteContent("—")).toBe(true);
  });

  it("content padded with whitespace still counts (the predicate never trims content)", () => {
    // The stored note keeps its exact bytes; only the presence DECISION
    // ignores the surrounding whitespace.
    expect(hasNoteContent("  meaningful note  ")).toBe(true);
    expect(hasNoteContent("\nnote starting with a newline")).toBe(true);
  });

  it("is a pure predicate — the input string is returned untouched (no mutation surface)", () => {
    const stored = "  keep my exact bytes  ";
    hasNoteContent(stored);
    expect(stored).toBe("  keep my exact bytes  ");
  });
});
