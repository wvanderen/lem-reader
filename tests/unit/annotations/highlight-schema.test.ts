// tests/unit/annotations/highlight-schema.test.ts
// STATE-04 boundary validation for HighlightRecordSchema + NoteRecordSchema
// (+ nested TextPositionSelectorSchema / TextQuoteSelectorSchema). Mirrors
// tests/unit/locationSchema.test.ts conventions: validRecord() builder
// returning `unknown`, `it.each` for the reject matrix, safeParse round-trip.
//
// Zod is the trust boundary between Dexie and runtime (T-05-03 — Tampering
// V5). Any out-of-contract record is rejected at the read boundary and routed
// to recovery (highlightsStore safeParse-on-read + STATE-05). Note text is
// z.string() — NEVER HTML (Pitfall 8 — React escapes text children;
// react/no-danger ESLint rule forbids dangerouslySetInnerHTML).
import { describe, expect, it } from "vitest";
import { HighlightRecordSchema, NoteRecordSchema } from "../../../src/content/schema";

// ── Helpers ──────────────────────────────────────────────────────────────────

function validHighlight(overrides: Record<string, unknown> = {}): unknown {
  return {
    schemaVersion: 1,
    id: "hl-00000000-0000-4000-8000-000000000001",
    articleId: "test-article",
    revision: 1,
    position: { start: 10, end: 20 },
    quote: { prefix: "alpha ", exact: "highlighted text", suffix: " omega" },
    createdAt: "2026-08-07T00:00:00.000Z",
    ...overrides,
  };
}

function validNote(overrides: Record<string, unknown> = {}): unknown {
  return {
    schemaVersion: 1,
    id: "nt-00000000-0000-4000-8000-000000000001",
    highlightId: "hl-00000000-0000-4000-8000-000000000001",
    text: "a reader-authored note",
    updatedAt: "2026-08-07T00:00:00.000Z",
    ...overrides,
  };
}

// ── HighlightRecordSchema accept matrix ──────────────────────────────────────

describe("HighlightRecordSchema accepts valid records", () => {
  it("parses the canonical baseline and round-trips every field", () => {
    const parsed = HighlightRecordSchema.parse(validHighlight());
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.id).toBe("hl-00000000-0000-4000-8000-000000000001");
    expect(parsed.articleId).toBe("test-article");
    expect(parsed.revision).toBe(1);
    expect(parsed.position).toEqual({ start: 10, end: 20 });
    expect(parsed.quote.exact).toBe("highlighted text");
    expect(parsed.createdAt).toBe("2026-08-07T00:00:00.000Z");
  });

  it("accepts a multi-segment slug articleId (matches ArticleSchema.id / LocationRecord)", () => {
    const parsed = HighlightRecordSchema.parse(validHighlight({ articleId: "essay-long-form" }));
    expect(parsed.articleId).toBe("essay-long-form");
  });

  it("accepts revision > 1 (D-06 monotonic)", () => {
    const parsed = HighlightRecordSchema.parse(validHighlight({ revision: 7 }));
    expect(parsed.revision).toBe(7);
  });

  it("accepts a quote with empty prefix/suffix (capture at text start/end)", () => {
    const parsed = HighlightRecordSchema.parse(
      validHighlight({
        quote: { prefix: "", exact: "start-of-text", suffix: "" },
      }),
    );
    expect(parsed.quote.prefix).toBe("");
    expect(parsed.quote.suffix).toBe("");
  });
});

// ── HighlightRecordSchema.tags (issue #116 — annotation tags) ────────────────

describe("HighlightRecordSchema.tags (issue #116)", () => {
  it("hydrates an older row with NO tags field to [] (Pitfall 9 additive)", () => {
    // Rows written before #116 omit the field entirely — the read boundary
    // hydrates them to [] so every consumer sees a no-tag highlight.
    const parsed = HighlightRecordSchema.parse(validHighlight());
    expect(parsed.tags).toEqual([]);
  });

  it("parses + round-trips a tagged record verbatim", () => {
    const parsed = HighlightRecordSchema.parse(validHighlight({ tags: ["essays", "to-revisit"] }));
    expect(parsed.tags).toEqual(["essays", "to-revisit"]);
  });

  it("rejects an empty-string tag (z.string().min(1) — a stray empty would corrupt the row)", () => {
    expect(() => HighlightRecordSchema.parse(validHighlight({ tags: ["ok", ""] }))).toThrow();
  });

  it("rejects a non-array tags field", () => {
    expect(() => HighlightRecordSchema.parse(validHighlight({ tags: "essays" }))).toThrow();
  });

  it("rejects a non-string tag entry", () => {
    expect(() => HighlightRecordSchema.parse(validHighlight({ tags: [42] }))).toThrow();
  });
});

// ── HighlightRecordSchema.color (issue #118 — named highlight colors) ────────

describe("HighlightRecordSchema.color (issue #118)", () => {
  it('hydrates an older row with NO color field to "default" (Pitfall 9 additive)', () => {
    // Rows written before #118 omit the field entirely — the read boundary
    // hydrates them to "default" so every consumer sees the Default fill
    // until the reader explicitly changes it (the tags discipline).
    const parsed = HighlightRecordSchema.parse(validHighlight());
    expect(parsed.color).toBe("default");
  });

  it.each([
    ["default", "default"],
    ["yellow", "yellow"],
    ["green", "green"],
    ["blue", "blue"],
    ["pink", "pink"],
  ])("parses + round-trips color %s verbatim", (value, expected) => {
    const parsed = HighlightRecordSchema.parse(validHighlight({ color: value }));
    expect(parsed.color).toBe(expected);
  });

  it("rejects a color outside the closed vocabulary (T-05-03 tampering)", () => {
    expect(() => HighlightRecordSchema.parse(validHighlight({ color: "red" }))).toThrow();
  });

  it("rejects a non-string color", () => {
    expect(() => HighlightRecordSchema.parse(validHighlight({ color: 7 }))).toThrow();
  });
});

// ── HighlightRecordSchema reject matrix (T-05-03 — Tampering V5) ─────────────

describe("HighlightRecordSchema rejects invalid records", () => {
  it.each([
    ["position.end <= position.start", { position: { start: 20, end: 20 } }],
    ["position.end < position.start", { position: { start: 20, end: 10 } }],
    ["position.start is negative", { position: { start: -1, end: 5 } }],
    ["position.start is non-integer", { position: { start: 1.5, end: 5 } }],
    ["position.end is non-integer", { position: { start: 1, end: 5.5 } }],
    ["quote.exact is empty", { quote: { prefix: "a", exact: "", suffix: "b" } }],
    ["articleId is a URL", { articleId: "https://example.com" }],
    ["articleId has UPPERCASE", { articleId: "Test-Article" }],
    ["articleId is empty", { articleId: "" }],
    ["revision is 0", { revision: 0 }],
    ["revision is negative", { revision: -1 }],
    ["revision is non-integer", { revision: 1.5 }],
    ["createdAt is a plain date", { createdAt: "2026-08-07" }],
    ["createdAt is missing timezone Z", { createdAt: "2026-08-07T00:00:00+00:00" }],
    ["createdAt is empty", { createdAt: "" }],
    ["createdAt is non-ISO", { createdAt: "yesterday" }],
  ])("throws when %s", (_label, override) => {
    expect(() => HighlightRecordSchema.parse(validHighlight(override))).toThrow();
  });

  it("rejects a missing required field (id)", () => {
    const { id: _omit, ...rest } = validHighlight() as Record<string, unknown>;
    expect(() => HighlightRecordSchema.parse(rest)).toThrow();
  });

  it("rejects a missing nested position field (end)", () => {
    const h = validHighlight({ position: { start: 10 } }) as Record<string, unknown>;
    expect(() => HighlightRecordSchema.parse(h)).toThrow();
  });

  it("rejects schemaVersion: 2 (forward-incompatible — STATE-04 migration hook)", () => {
    expect(() => HighlightRecordSchema.parse(validHighlight({ schemaVersion: 2 }))).toThrow();
  });

  it("rejects schemaVersion missing (literal(1) is required)", () => {
    const { schemaVersion: _omit, ...rest } = validHighlight() as Record<string, unknown>;
    expect(() => HighlightRecordSchema.parse(rest)).toThrow();
  });
});

// ── NoteRecordSchema accept + reject ─────────────────────────────────────────

describe("NoteRecordSchema accepts valid records", () => {
  it("parses the canonical baseline", () => {
    const parsed = NoteRecordSchema.parse(validNote());
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.highlightId).toBe("hl-00000000-0000-4000-8000-000000000001");
    expect(parsed.text).toBe("a reader-authored note");
  });

  it("accepts an empty-text note (D5-10 empty-text = no note is a caller policy)", () => {
    const parsed = NoteRecordSchema.parse(validNote({ text: "" }));
    expect(parsed.text).toBe("");
  });

  it("accepts a note with Unicode text (NBSP, ZWJ, emoji — readable content)", () => {
    const parsed = NoteRecordSchema.parse(validNote({ text: "café résumé 👨‍👩‍👧 — notes" }));
    expect(parsed.text).toBe("café résumé 👨‍👩‍👧 — notes");
  });
});

describe("NoteRecordSchema rejects invalid records", () => {
  it.each([
    ["schemaVersion is 2", { schemaVersion: 2 }],
    ["highlightId is missing", { highlightId: undefined }],
    ["text is missing", { text: undefined }],
    ["text is a number", { text: 42 }],
    ["updatedAt is a plain date", { updatedAt: "2026-08-07" }],
    ["updatedAt is empty", { updatedAt: "" }],
  ])("throws when %s", (_label, override) => {
    expect(() => NoteRecordSchema.parse(validNote(override))).toThrow();
  });
});

// ── SafeParse round-trip (the highlightsStore read path) ─────────────────────

describe("HighlightRecordSchema.safeParse round-trips (the highlightsStore read path)", () => {
  it("returns success: true with the parsed record on a valid payload", () => {
    const result = HighlightRecordSchema.safeParse(validHighlight());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.articleId).toBe("test-article");
    }
  });

  it("returns success: false on an invalid payload (no throw)", () => {
    const result = HighlightRecordSchema.safeParse(
      validHighlight({ position: { start: 30, end: 10 } }),
    );
    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toBeDefined();
  });
});

// ── Pitfall 8 — no HTML parsing anywhere in the schema ───────────────────────

describe("Pitfall 8 — note text is z.string(), never HTML", () => {
  it("accepts note text containing HTML-like strings as PLAIN TEXT (no parsing)", () => {
    const malicious = "<script>alert('xss')</script><img src=x onerror=alert(1)>";
    const parsed = NoteRecordSchema.parse(validNote({ text: malicious }));
    // The text is stored verbatim — React escapes it at render time. There is
    // no HTML field, no URL field, no z.html(), no dangerouslySetInnerHTML.
    expect(parsed.text).toBe(malicious);
  });
});
