// tests/unit/locationSchema.test.ts
// Boundary validation for the persisted LocationRecordSchema (STATE-04,
// T-02-08 — Tampering V5). Mirrors tests/unit/schema.test.ts and
// settingsSchema.test.ts conventions: `validLocation()` builder returning
// `unknown`, `it.each` for the reject matrix, `expect().toThrow()` for
// rejects and `expect().toBe()` for acceptances. Zod is the authority.
//
// The persisted location is keyed [articleId+revision] (D-06) and stored as
// a grapheme offset into normalizeText(article) (D-05). The schema is the
// trust boundary between Dexie and runtime: any out-of-contract record is
// rejected at the read boundary and routed to recovery (locationStore.ts
// safeParse-on-read + STATE-05).
import { describe, expect, it } from "vitest";
import { LocationRecordSchema } from "../../src/content/schema";

// ── Helpers ──────────────────────────────────────────────────────────────────

// Test payload builder — returns `unknown` so callers exercise Zod at runtime.
// Overrides are loosely typed (Record) because the point is to feed parse()
// shapes that may or may not validate; Zod is the authority, not TS here.
function validLocation(overrides: Record<string, unknown> = {}): unknown {
  return {
    schemaVersion: 1,
    articleId: "test-article",
    revision: 1,
    graphemeOffset: 0,
    savedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

// ── Accept matrix ────────────────────────────────────────────────────────────

describe("LocationRecordSchema accepts valid records", () => {
  it("parses the canonical baseline and round-trips every field", () => {
    const parsed = LocationRecordSchema.parse(validLocation());
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.articleId).toBe("test-article");
    expect(parsed.revision).toBe(1);
    expect(parsed.graphemeOffset).toBe(0);
    expect(parsed.savedAt).toBe("2026-08-01T00:00:00.000Z");
  });

  it("accepts a multi-segment slug articleId (matches ArticleSchema.id)", () => {
    const parsed = LocationRecordSchema.parse(
      validLocation({ articleId: "essay-long-form" }),
    );
    expect(parsed.articleId).toBe("essay-long-form");
  });

  it("accepts a single-segment slug articleId", () => {
    const parsed = LocationRecordSchema.parse(
      validLocation({ articleId: "abc123" }),
    );
    expect(parsed.articleId).toBe("abc123");
  });

  it.each([1, 2, 42, 1000])("accepts revision=%i (D-06 monotonic)", (revision) => {
    expect(
      LocationRecordSchema.parse(validLocation({ revision })).revision,
    ).toBe(revision);
  });

  it.each([0, 1, 42, 99999])(
    "accepts graphemeOffset=%i (D-05 offset into normalizeText)",
    (graphemeOffset) => {
      expect(
        LocationRecordSchema.parse(validLocation({ graphemeOffset }))
          .graphemeOffset,
      ).toBe(graphemeOffset);
    },
  );

  it("accepts a valid ISO-8601 datetime with milliseconds + timezone Z", () => {
    const savedAt = "2026-08-02T17:13:01.123Z";
    expect(
      LocationRecordSchema.parse(validLocation({ savedAt })).savedAt,
    ).toBe(savedAt);
  });
});

// ── Reject matrix (T-02-08 — Tampering V5) ───────────────────────────────────

describe("LocationRecordSchema rejects invalid records", () => {
  it.each([
    ["articleId is a URL", { articleId: "https://example.com" }],
    ["articleId has UPPERCASE letters", { articleId: "Test-Article" }],
    ["articleId has spaces", { articleId: "test article" }],
    ["articleId has an underscore", { articleId: "test_article" }],
    ["articleId has a dot", { articleId: "test.article" }],
    ["articleId has special chars", { articleId: "test!article" }],
    ["articleId is empty string", { articleId: "" }],
    ["revision is 0", { revision: 0 }],
    ["revision is negative", { revision: -1 }],
    ["revision is 1.5 (non-integer)", { revision: 1.5 }],
    ["revision is NaN", { revision: NaN }],
    ["graphemeOffset is negative", { graphemeOffset: -1 }],
    ["graphemeOffset is 1.5 (non-integer)", { graphemeOffset: 1.5 }],
    ["graphemeOffset is NaN", { graphemeOffset: NaN }],
    ["savedAt is a plain date (not datetime)", { savedAt: "2026-08-01" }],
    ["savedAt is missing the time component", { savedAt: "2026-08-01T00:00" }],
    ["savedAt has a timezone offset (not Z)", { savedAt: "2026-08-01T00:00:00+00:00" }],
    ["savedAt is empty string", { savedAt: "" }],
    ["savedAt is a non-ISO string", { savedAt: "yesterday" }],
  ])("throws when %s", (_label, override) => {
    expect(() => LocationRecordSchema.parse(validLocation(override))).toThrow();
  });

  it("rejects a record missing a required field (articleId)", () => {
    const { articleId: _omit, ...rest } = validLocation() as Record<string, unknown>;
    expect(() => LocationRecordSchema.parse(rest)).toThrow();
  });

  it("rejects schemaVersion: 2 (forward-incompatible — STATE-04 migration hook)", () => {
    expect(() =>
      LocationRecordSchema.parse(validLocation({ schemaVersion: 2 })),
    ).toThrow();
  });

  it("rejects schemaVersion missing (literal(1) is required)", () => {
    const { schemaVersion: _omit, ...rest } = validLocation() as Record<
      string,
      unknown
    >;
    expect(() => LocationRecordSchema.parse(rest)).toThrow();
  });
});

// ── SafeParse round-trip (the loadLocation read path) ────────────────────────

describe("LocationRecordSchema.safeParse round-trips (the locationStore read path)", () => {
  it("returns success: true with the parsed record on a valid payload", () => {
    const result = LocationRecordSchema.safeParse(validLocation());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.articleId).toBe("test-article");
    }
  });

  it("returns success: false on an invalid payload (no throw)", () => {
    const result = LocationRecordSchema.safeParse(
      validLocation({ revision: -1 }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      // The error is shape; the test does not depend on the exact Zod issue
      // format (Zod 4 may evolve it).
      expect(result.error).toBeDefined();
    }
  });
});
