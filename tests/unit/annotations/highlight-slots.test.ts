// tests/unit/annotations/highlight-slots.test.ts
// Issue #195 — the ONE pure highlight-slot vocabulary (highlightSlots.ts):
//   - slotPreset normalizes the slot's tags through the ONE normalizeTags
//     seam (trim, drop empties, case-insensitive dedupe) and carries the
//     closed-set color verbatim;
//   - defaultSlotPreset reads the settings' EXPLICIT default-slot choice
//     (defensively clamped — a slot is configuration, never a crash);
//   - mergeSlotTags is the ADDITIVE union: existing tags keep their values,
//     casings, and order; the slot's tags join the end; a case twin never
//     stacks.
// Pure functions — no DOM, no React, no persistence.
import { describe, expect, it } from "vitest";
import { defaultHighlightSlots } from "../../../src/content/schema";
import type { HighlightSlot } from "../../../src/content/schema";
import {
  defaultSlotPreset,
  mergeSlotTags,
  slotPreset,
} from "../../../src/annotations/highlightSlots";

function slot(overrides: Partial<HighlightSlot> = {}): HighlightSlot {
  return { name: "Reading list", color: "yellow", tags: [], ...overrides };
}

describe("slotPreset (issue #195)", () => {
  it("carries the slot's color verbatim and normalizes its tags", () => {
    const preset = slotPreset(
      slot({ color: "green", tags: ["  Essays ", "reading", "ESSAYS", ""] }),
    );
    expect(preset.color).toBe("green");
    // Trimmed, empties dropped, case twins folded (first-seen casing wins).
    expect(preset.tags).toEqual(["Essays", "reading"]);
  });

  it("an empty tag list stays empty", () => {
    expect(slotPreset(slot({ tags: [] })).tags).toEqual([]);
  });
});

describe("defaultSlotPreset (issue #195)", () => {
  it("reads the explicit default-slot choice from the settings record", () => {
    const slots: HighlightSlot[] = defaultHighlightSlots().map((s, i) =>
      i === 3 ? { ...s, name: "Important", color: "blue", tags: ["important"] } : s,
    );
    const preset = defaultSlotPreset(slots, 3);
    expect(preset.color).toBe("blue");
    expect(preset.tags).toEqual(["important"]);
  });

  it("an out-of-band index falls back to slot 1 (defence in depth — the schema bounds the choice)", () => {
    const slots = defaultHighlightSlots();
    expect(defaultSlotPreset(slots, 9).color).toBe("default");
    expect(defaultSlotPreset(slots, -1).color).toBe("default");
  });
});

describe("mergeSlotTags (issue #195 — applying a slot adds tags, never removes)", () => {
  it("keeps every existing tag in order and appends the slot's tags", () => {
    expect(mergeSlotTags(["essays", "to-reread"], ["reading", "key-idea"])).toEqual([
      "essays",
      "to-reread",
      "reading",
      "key-idea",
    ]);
  });

  it("a case twin resolves to the EXISTING tag's casing (first-seen wins)", () => {
    expect(mergeSlotTags(["Essays"], ["essays", "ESSAYS"])).toEqual(["Essays"]);
  });

  it("dedupes within the slot's own tags and trims both sides", () => {
    expect(mergeSlotTags([" a "], ["a", "b", " b "])).toEqual(["a", "b"]);
  });

  it("applying to a highlight with no tags is a plain normalized copy", () => {
    expect(mergeSlotTags([], [" Essays ", ""])).toEqual(["Essays"]);
  });
});

describe("defaultHighlightSlots (issue #195 — the shipped set)", () => {
  it("is exactly the five shipped choices with empty tags, numbered 1–5", () => {
    expect(defaultHighlightSlots()).toEqual([
      { name: "Default", color: "default", tags: [] },
      { name: "Yellow", color: "yellow", tags: [] },
      { name: "Green", color: "green", tags: [] },
      { name: "Blue", color: "blue", tags: [] },
      { name: "Pink", color: "pink", tags: [] },
    ]);
  });

  it("returns a FRESH deep copy per call (no shared references across parses)", () => {
    const a = defaultHighlightSlots();
    const b = defaultHighlightSlots();
    expect(a).not.toBe(b);
    expect(a[0]).not.toBe(b[0]);
    expect(a[0]?.tags).not.toBe(b[0]?.tags);
  });
});
