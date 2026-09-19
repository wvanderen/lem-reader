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
    // The canonical v3 write shape (issue #40). Tests of legacy v1/v2 rows
    // pass an explicit schemaVersion override.
    schemaVersion: 3,
    font: "serif",
    size: 18,
    measure: 64,
    spacing: "comfortable",
    theme: "sepia",
    readingMode: "paginated",
    animatePageTurns: false,
    rate: 1,
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

// ── ReaderSettingsSchema — accept matrix (3 fonts × 5 sizes × 5 measures ─────
//   × 3 spacings × 3 themes; assert a representative slice plus
//   the full single-axis variation for each knob) ─────────────────────────────

describe("ReaderSettingsSchema accepts valid combinations", () => {
  it("parses the D-07 default baseline and round-trips every field", () => {
    const parsed = ReaderSettingsSchema.parse(validSettings());
    expect(parsed).toEqual(DEFAULT_SETTINGS);
    expect(parsed.schemaVersion).toBe(3);
    expect(parsed.readingMode).toBe("paginated");
  });

  it("preserves motion opt-in and accepts legacy settings without it", () => {
    expect(ReaderSettingsSchema.parse(validSettings({ animatePageTurns: true })).animatePageTurns).toBe(true);
    expect(ReaderSettingsSchema.parse(validSettings({ animatePageTurns: undefined })).animatePageTurns).toBeUndefined();
    expect(ReaderSettingsSchema.safeParse(validSettings({ animatePageTurns: "true" })).success).toBe(false);
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
    // Issue #18 (D22-01): the uniform-6 ladder extends upward from the
    // POLISH-09 truthful range to the new maximum 88 (40 + 6×8 — the range
    // input's step-6 arithmetic stays exact). 72 is still NOT a step: a
    // stored legacy 72 clamps calmly pre-parse to the nearest lower step
    // (D21-03 remap — see tests/unit/settings/measure-clamp.test.ts).
    [40, { measure: 40 }],
    [46, { measure: 46 }],
    [52, { measure: 52 }],
    [58, { measure: 58 }],
    [64, { measure: 64 }],
    [70, { measure: 70 }],
    [76, { measure: 76 }],
    [82, { measure: 82 }],
    [88, { measure: 88 }],
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
    // schemaVersion — STATE-04 hook. After the 04-02 bump the schema accepted
    // v1+v2; issue #40 (read-aloud voice + rate) adds v3 as the canonical
    // write version. v1/v2 legacy rows hydrate via .defaults; v4+
    // forward-rejects (V5 boundary discipline).
    ["non-literal schemaVersion (STATE-04 hook — v4 forward-rejects)", { schemaVersion: 4 }],
    ["schemaVersion as string", { schemaVersion: "1" }],
    ["missing schemaVersion", { schemaVersion: undefined }],
    ["unknown font value", { font: "comic-sans" }],
    ["out-of-step size (17 — between steps)", { size: 17 }],
    ["size below the step range (12)", { size: 12 }],
    ["size above the step range (28)", { size: 28 }],
    ["out-of-step measure (60 — between steps)", { measure: 60 }],
    // Issue #18: the range extends upward to 88 — a below-range value must
    // be under 40 (34), an above-range value over 88 (94); and the legacy
    // value 72 is still NOT a step: raw 72 fails parse here while the
    // enumerated-seam clamp (D21-03, remapped 72 → 70) handles it pre-parse
    // for calm loads.
    ["measure below the step range (34)", { measure: 34 }],
    ["measure above the step range (94)", { measure: 94 }],
    ["the legacy maximum 72 (not a step on the #18 ladder; D21-03 clamps pre-parse at the seams)", { measure: 72 }],
    ["unknown spacing value", { spacing: "snug" }],
    ["unknown theme value", { theme: "solarized" }],
    ["missing font field", { font: undefined }],
    // readingMode — D4-12 closed enum (T-04-04 tampering reject). The .default
    // hydrates "paginated" only when the field is ABSENT; an explicit bad
    // value must fail parse → STATE-05 routing (StorageBanner/WipeConfirm),
    // never reaching the renderer.
    ["unknown readingMode value (T-04-04)", { readingMode: "evil" }],
    ["readingMode as number", { readingMode: 0 }],
  ])("throws when %s", (_label, override) => {
    expect(() => ReaderSettingsSchema.parse(validSettings(override))).toThrow();
  });
});

// ── ReaderSettingsSchema — D4-12 readingMode + v1→v2 value-shape evolution ────
// Pitfall 9: the settings store is key-value; Dexie is opaque to the value
// shape. The readingMode addition is a Zod value-shape evolution — NO Dexie
// store version bump. Existing v1 rows (no readingMode field) hydrate via
// .default("paginated") on read; new saves write schemaVersion: 2.

describe("ReaderSettingsSchema hydrates readingMode for legacy v1 rows (D4-12, Pitfall 9)", () => {
  it("a v1 row missing readingMode hydrates readingMode to 'paginated' via .default", () => {
    // A real legacy v1 row written by Phase 2: schemaVersion: 1, no readingMode.
    const legacyRow = {
      schemaVersion: 1,
      font: "serif",
      size: 18,
      measure: 64,
      spacing: "comfortable",
      theme: "sepia",
    };
    const parsed = ReaderSettingsSchema.parse(legacyRow);
    expect(parsed.schemaVersion).toBe(1); // schemaVersion is NOT mutated by parse
    expect(parsed.readingMode).toBe("paginated"); // .default fires
    expect(parsed.font).toBe("serif");
    expect(parsed.theme).toBe("sepia");
  });

  it("a v2 row may explicitly carry readingMode: 'scrolling'", () => {
    const parsed = ReaderSettingsSchema.parse(
      validSettings({ schemaVersion: 2, readingMode: "scrolling" }),
    );
    expect(parsed.readingMode).toBe("scrolling");
    expect(parsed.schemaVersion).toBe(2);
  });

  it("DEFAULT_SETTINGS mirrors the v3 canonical shape (schemaVersion 3 + readingMode paginated + read-aloud defaults)", () => {
    expect(DEFAULT_SETTINGS.schemaVersion).toBe(3);
    expect(DEFAULT_SETTINGS.readingMode).toBe("paginated");
    // Issue #40 — the read-aloud defaults: no picked voice (platform
    // default) and the 1× rate multiplier.
    expect(DEFAULT_SETTINGS.voice).toBeUndefined();
    expect(DEFAULT_SETTINGS.rate).toBe(1);
    // Round-trip DEFAULT_SETTINGS through parse — proves the literal satisfies
    // the schema exactly (no missing/extra fields).
    expect(ReaderSettingsSchema.parse(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });
});

// ── Issue #40 — v2→v3 value-shape evolution (read-aloud voice + rate) ───────
// Pitfall 9 (the readingMode mechanism): a v2 row lacking voice/rate hydrates
// both via schema defaults on read; schemaVersion is NOT mutated by parse. A
// v3 row carries them explicitly. voice is an opaque voiceURI string; rate is
// the control band [0.5, 3] (issue #43 / O8; engines that stall at high rates
// surface through the session probe + stall watchdog as calm refusals).

describe("ReaderSettingsSchema hydrates read-aloud prefs for legacy v1/v2 rows (issue #40, Pitfall 9)", () => {
  it("a v1 row missing voice/rate hydrates both via defaults", () => {
    const legacyRow = {
      schemaVersion: 1,
      font: "serif",
      size: 18,
      measure: 64,
      spacing: "comfortable",
      theme: "sepia",
    };
    const parsed = ReaderSettingsSchema.parse(legacyRow);
    expect(parsed.schemaVersion).toBe(1); // schemaVersion is NOT mutated by parse
    expect(parsed.voice).toBeUndefined();
    expect(parsed.rate).toBe(1);
  });

  it("a v2 row missing voice/rate hydrates both via defaults and keeps its version", () => {
    const parsed = ReaderSettingsSchema.parse(
      validSettings({ schemaVersion: 2, rate: undefined }),
    );
    expect(parsed.schemaVersion).toBe(2); // schemaVersion is NOT mutated by parse
    expect(parsed.voice).toBeUndefined();
    expect(parsed.rate).toBe(1);
  });

  it("a v3 row carries the selected voice and a non-default rate", () => {
    const parsed = ReaderSettingsSchema.parse(
      validSettings({ schemaVersion: 3, voice: "Daniel", rate: 1.5 }),
    );
    expect(parsed.schemaVersion).toBe(3);
    expect(parsed.voice).toBe("Daniel");
    expect(parsed.rate).toBe(1.5);
  });

  it.each([
    ["empty-string voiceURI", { voice: "" }],
    ["voice as a number", { voice: 7 }],
    ["rate below the band (0.4)", { rate: 0.4 }],
    ["rate above the band (3.1)", { rate: 3.1 }],
    ["rate as a string", { rate: "1" }],
  ])("throws when %s", (_label, override) => {
    expect(() =>
      ReaderSettingsSchema.parse(validSettings({ schemaVersion: 3, ...override })),
    ).toThrow();
  });

  it("accepts the band edges (0.5 and 3) and the old 2.1 that moved inside the band", () => {
    for (const rate of [0.5, 2.1, 3]) {
      const parsed = ReaderSettingsSchema.parse(
        validSettings({ schemaVersion: 3, rate }),
      );
      expect(parsed.rate).toBe(rate);
    }
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

// ── Issue #18 (D22-01): the unions and the MEASURE_STEPS ladder cannot drift ──
// The schema union, the measurement ConstraintsSchema union, and the slider's
// MEASURE_STEPS token must stay the SAME closed set (the module-header
// contracts say so in prose; this is the mechanical pin). Sweep a window of
// integers around the ladder and require parse-success EXACTLY on the steps —
// in both directions (a step missing from a union fails; a union literal off
// the ladder fails).

describe("measure closed-set agreement (tokens ↔ schema ↔ Constraints)", () => {
  const WINDOW = [34, 40, 46, 52, 58, 60, 64, 70, 72, 76, 82, 88, 94] as const;

  function constraintsWith(measure: number): unknown {
    return {
      font: "serif",
      size: 18,
      measure,
      spacing: "comfortable",
      viewportWidthPx: 800,
      lang: "en",
    };
  }

  it("ReaderSettingsSchema accepts EXACTLY the MEASURE_STEPS values", async () => {
    const { MEASURE_STEPS } = await import("../../src/settings/tokens");
    for (const m of WINDOW) {
      const accepted =
        ReaderSettingsSchema.safeParse(validSettings({ measure: m })).success;
      expect(accepted, `measure ${m}`).toBe(
        (MEASURE_STEPS as readonly number[]).includes(m),
      );
    }
  });

  it("ConstraintsSchema accepts EXACTLY the MEASURE_STEPS values", async () => {
    const { MEASURE_STEPS } = await import("../../src/settings/tokens");
    const { ConstraintsSchema } = await import("../../src/measurement/types");
    for (const m of WINDOW) {
      const accepted = ConstraintsSchema.safeParse(constraintsWith(m)).success;
      expect(accepted, `measure ${m}`).toBe(
        (MEASURE_STEPS as readonly number[]).includes(m),
      );
    }
  });
});

// ── applyTheme writes the typography custom properties + data-theme on documentElement ──
// (Pitfall 9 / T-02-02 — values derive from Zod-validated enums/numbers;
// style.setProperty does not parse selectors; dataset.theme is a data attr.)
// This is the schema test's sibling assertion — jsdom-safe (DOM writes, not layout).
//
// 02-04 gap 2: applyTheme now writes the --font-size / --line-height custom
// properties (consumed by the SECOND body rule in app.css via var()) instead
// of the bare font-size / line-height properties, which body's hardcoded
// values overrode. --letter-spacing / --word-spacing are now also consumed
// (previously dead writes). The assertions below check the corrected token
// names.

describe("applyTheme writes :root tokens from validated settings", () => {
  it("applies the D-07 default baseline to documentElement", () => {
    applyTheme(DEFAULT_SETTINGS);
    const root = document.documentElement;
    expect(root.dataset.theme).toBe("sepia");
    expect(root.style.getPropertyValue("--font-body")).toContain("Iowan Old Style");
    expect(root.style.getPropertyValue("--font-size")).toBe("18px");
    expect(root.style.getPropertyValue("--line-height")).toBe("1.6");
    expect(root.style.getPropertyValue("--letter-spacing")).toBe("0");
    expect(root.style.getPropertyValue("--word-spacing")).toBe("0");
    expect(root.style.getPropertyValue("--measure")).toBe("64ch");
  });

  it("swaps every token when given a non-default validated record", () => {
    applyTheme({
      schemaVersion: 2,
      font: "sans",
      size: 22,
      // D21-01 (POLISH-09): 58 — a valid non-default step (72 left the union).
      measure: 58,
      spacing: "spacious",
      theme: "dark",
      readingMode: "paginated",
      rate: 1,
    });
    const root = document.documentElement;
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.getPropertyValue("--font-body")).toContain("system-ui");
    expect(root.style.getPropertyValue("--font-size")).toBe("22px");
    expect(root.style.getPropertyValue("--line-height")).toBe("1.8");
    expect(root.style.getPropertyValue("--letter-spacing")).toBe("0.01em");
    expect(root.style.getPropertyValue("--word-spacing")).toBe("0.05em");
    expect(root.style.getPropertyValue("--measure")).toBe("58ch");
  });
});
