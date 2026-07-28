import { describe, expect, it } from "vitest";
import { graphemeClusters } from "../../src/content/normalizeText";

/**
 * Pitfall 1 regression: grapheme offsets count Intl.Segmenter segment ORDINALS,
 * NOT UTF-16 code-unit indexes. The canonical offset of the Nth cluster is the
 * array index N — never segment.index (UTF-16 offset).
 */

describe("graphemeClusters counts user-perceived characters", () => {
  it("counts a ZWJ family emoji as ONE grapheme", () => {
    // 👨‍👩‍👧 = man + ZWJ + woman + ZWJ + girl = 8 UTF-16 code units, 1 grapheme
    expect(graphemeClusters("\u{1F468}\u200D\u{1F469}\u200D\u{1F467}", "en")).toHaveLength(1);
  });

  it("counts precomposed é as ONE grapheme", () => {
    expect(graphemeClusters("é", "en")).toHaveLength(1);
  });

  it("counts decomposed e + combining acute as ONE grapheme (NOT two)", () => {
    // e\u0301 = LATIN SMALL LETTER E + COMBINING ACUTE ACCENT
    expect(graphemeClusters("e\u0301", "en")).toHaveLength(1);
  });

  it("counts café as FOUR graphemes", () => {
    expect(graphemeClusters("café", "en")).toHaveLength(4);
  });

  it("counts a CJK sample as THREE graphemes", () => {
    expect(graphemeClusters("日本語", "en")).toHaveLength(3);
  });
});

describe("Pitfall 1 regression — grapheme count != UTF-16 code-unit count", () => {
  it("ZWJ family: grapheme count (1) != string .length (8)", () => {
    const s = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}";
    expect(graphemeClusters(s, "en").length).not.toBe(s.length);
    expect(s.length).toBe(8); // UTF-16 code units
    expect(graphemeClusters(s, "en")).toHaveLength(1); // graphemes
  });

  it("decomposed é: grapheme count (1) != string .length (2)", () => {
    const s = "e\u0301";
    expect(graphemeClusters(s, "en").length).not.toBe(s.length);
    expect(s.length).toBe(2);
    expect(graphemeClusters(s, "en")).toHaveLength(1);
  });
});

describe("canonical offset = array index, NOT segment.index", () => {
  it("the Nth cluster is at array index N (café[3] === 'é')", () => {
    const clusters = graphemeClusters("café", "en");
    expect(clusters[3]).toBe("é");
    // Offset 3 is the 4th cluster — NOT the UTF-16 index (which would also be 3
    // here by coincidence since café has no multibyte chars before é in
    // precomposed form; the ZWJ/decomposed tests above prove the ordinal rule).
  });

  it("ZWJ family: the single cluster is at index 0, not UTF-16 index 0..7", () => {
    const clusters = graphemeClusters("\u{1F468}\u200D\u{1F469}\u200D\u{1F467}", "en");
    expect(clusters[0]).toBe("\u{1F468}\u200D\u{1F469}\u200D\u{1F467}");
    expect(clusters[1]).toBeUndefined();
  });
});
