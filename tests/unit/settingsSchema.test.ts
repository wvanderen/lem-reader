// tests/unit/settingsSchema.test.ts
// Boundary validation for the Phase 2 persisted records (STATE-04, T-02-01):
// ReaderSettingsSchema + LocationRecordSchema. Mirrors the conventions of
// tests/unit/schema.test.ts — `validSettings()`/`validLocation()` builders
// returning `unknown`, `it.each` for the reject matrix, `expect().toThrow()`
// for rejects and `expect().toBe()` for acceptances. Zod is the authority.
import { describe, expect, it } from "vitest";
import {
  LocationRecordSchema,
  ReaderSettingsSchema,
} from "../../src/content/schema";
import { applyTheme } from "../../src/settings/applyTheme";
import { DEFAULT_SETTINGS } from "../../src/settings/defaults";

// ── Helpers ──────────────────────────────────────────────────────────────────

// Test payload builders — return `unknown` so callers exercise Zod at runtime
// (overrides are loosely typed because the point is to feed parse() shapes that
// may or may not validate; Zod is the authority, not TS here).
function validSettings(overrides: Record<string, unknown> = {}): unknown {
  return {
    schemaVersion: 1,
    font: "serif",
    size: 18,
    measure: 64,
    spacing: "comfortable",
    theme: "sepia",
    ...overrides,
  };
}

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

// ── ReaderSettingsSchema — accept matrix (3 fonts × 5 sizes × 4 measures ─────
//   × 3 spacings × 3 themes = 540 combos; assert a representative slice plus
//   the full single-axis variation for each knob) ─────────────────────────────

describe("ReaderSettingsSchema accepts valid combinations", () => {
  it("parses the D-07 default baseline and round-trips every field", () => {
    const parsed = ReaderSettingsSchema.parse(validSettings());
    expect(parsed).toEqual(DEFAULT_SETTINGS);
    expect(parsed.schemaVersion).toBe(1);
  });

  it.each([
    ["serif", { font: "serif" }],
    ["sans", { font: "sans" }],
    ["dyslexic", { font: "dyslexic" }],
  ])("accepts font=%s", (_label, override) => {
    expect(ReaderSettingsSchema.parse(validSettings(override)).font).toBe(
      override.font,
    );
  });

  it.each([
    [16, { size: 16 }],
    [18, { size: 18 }],
    [20, { size: 20 }],
    [22, { size: 22 }],
    [24, { size: 24 }],
  ])("accepts size=%i", (size, override) => {
    expect(ReaderSettingsSchema.parse(validSettings(override)).size).toBe(size);
  });

  it.each([
    [52, { measure: 52 }],
    [58, { measure: 58 }],
    [64, { measure: 64 }],
    [72, { measure: 72 }],
  ])("accepts measure=%i", (measure, override) => {
    expect(ReaderSettingsSchema.parse(validSettings(override)).measure).toBe(
      measure,
    );
  });

  it.each([
    ["compact", { spacing: "compact" }],
    ["comfortable", { spacing: "comfortable" }],
    ["spacious", { spacing: "spacious" }],
  ])("accepts spacing=%s", (_label, override) => {
    expect(ReaderSettingsSchema.parse(validSettings(override)).spacing).toBe(
      override.spacing,
    );
  });

  it.each([
    ["sepia", { theme: "sepia" }],
    ["light", { theme: "light" }],
    ["dark", { theme: "dark" }],
  ])("accepts theme=%s", (_label, override) => {
    expect(ReaderSettingsSchema.parse(validSettings(override)).theme).toBe(
      override.theme,
    );
  });
});

// ── ReaderSettingsSchema — reject matrix (T-02-01) ───────────────────────────

describe("ReaderSettingsSchema.parse rejects out-of-contract records", () => {
  it.each([
    ["non-literal schemaVersion (STATE-04 hook)", { schemaVersion: 2 }],
    ["schemaVersion as string", { schemaVersion: "1" }],
    ["missing schemaVersion", { schemaVersion: undefined }],
    ["unknown font value", { font: "comic-sans" }],
    ["out-of-step size (17 — between steps)", { size: 17 }],
    ["size below the step range (12)", { size: 12 }],
    ["size above the step range (28)", { size: 28 }],
    ["out-of-step measure (60 — between steps)", { measure: 60 }],
    ["measure below the step range (40)", { measure: 40 }],
    ["unknown spacing value", { spacing: "snug" }],
    ["unknown theme value", { theme: "solarized" }],
    ["missing font field", { font: undefined }],
  ])("throws when %s", (_label, override) => {
    expect(() => ReaderSettingsSchema.parse(validSettings(override))).toThrow();
  });
});

// ── LocationRecordSchema — accept + reject (T-02-01) ─────────────────────────

describe("LocationRecordSchema accepts a valid [articleId+revision] record", () => {
  it("round-trips a minimal valid record", () => {
    const parsed = LocationRecordSchema.parse(validLocation());
    expect(parsed.articleId).toBe("test-article");
    expect(parsed.revision).toBe(1);
    expect(parsed.graphemeOffset).toBe(0);
    expect(parsed.schemaVersion).toBe(1);
  });

  it("accepts a non-zero graphemeOffset", () => {
    const parsed = LocationRecordSchema.parse(validLocation({ graphemeOffset: 1234 }));
    expect(parsed.graphemeOffset).toBe(1234);
  });
});

describe("LocationRecordSchema.parse rejects malformed records", () => {
  it.each([
    // articleId — reuse the D-06 contract from ArticleSchema (schema.ts line 187)
    ["articleId is a URL (D-06 — must be a slug)", { articleId: "https://example.com" }],
    ["articleId has uppercase letters", { articleId: "Test-Article" }],
    ["articleId has spaces", { articleId: "test article" }],
    // revision — reuse the D-06 contract (schema.ts line 188)
    ["revision is 0", { revision: 0 }],
    ["revision is negative", { revision: -1 }],
    ["revision is 1.5 (non-integer)", { revision: 1.5 }],
    // graphemeOffset — D-05 substrate
    ["graphemeOffset is negative", { graphemeOffset: -1 }],
    ["graphemeOffset is 1.5 (non-integer)", { graphemeOffset: 1.5 }],
    // savedAt — ISO-8601 datetime
    ["savedAt is not ISO-8601", { savedAt: "2026/08/01 00:00:00" }],
    ["savedAt is a plain date (no time)", { savedAt: "2026-08-01" }],
    // schemaVersion — STATE-04 hook
    ["non-literal schemaVersion", { schemaVersion: 2 }],
  ])("throws when %s", (_label, override) => {
    expect(() => LocationRecordSchema.parse(validLocation(override))).toThrow();
  });
});

// ── applyTheme writes the six custom properties + data-theme on documentElement ──
// (Pitfall 9 / T-02-02 — values derive from Zod-validated enums/numbers;
// style.setProperty does not parse selectors; dataset.theme is a data attr.)
// This is the schema test's sibling assertion — jsdom-safe (DOM writes, not layout).

describe("applyTheme writes :root tokens from validated settings", () => {
  it("applies the D-07 default baseline to documentElement", () => {
    applyTheme(DEFAULT_SETTINGS);
    const root = document.documentElement;
    expect(root.dataset.theme).toBe("sepia");
    expect(root.style.getPropertyValue("--font-body")).toContain("Iowan Old Style");
    expect(root.style.getPropertyValue("font-size")).toBe("18px");
    expect(root.style.getPropertyValue("line-height")).toBe("1.6");
    expect(root.style.getPropertyValue("--letter-spacing")).toBe("0");
    expect(root.style.getPropertyValue("--word-spacing")).toBe("0");
    expect(root.style.getPropertyValue("--measure")).toBe("64ch");
  });

  it("swaps every token when given a non-default validated record", () => {
    applyTheme({
      schemaVersion: 1,
      font: "sans",
      size: 22,
      measure: 72,
      spacing: "spacious",
      theme: "dark",
    });
    const root = document.documentElement;
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.getPropertyValue("--font-body")).toContain("system-ui");
    expect(root.style.getPropertyValue("font-size")).toBe("22px");
    expect(root.style.getPropertyValue("line-height")).toBe("1.8");
    expect(root.style.getPropertyValue("--letter-spacing")).toBe("0.01em");
    expect(root.style.getPropertyValue("--word-spacing")).toBe("0.05em");
    expect(root.style.getPropertyValue("--measure")).toBe("72ch");
  });
});
