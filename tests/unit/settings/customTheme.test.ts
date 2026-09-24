// tests/unit/settings/customTheme.test.ts
// Issue #86 (decision #73) — the custom-theme color domain
// (src/settings/customTheme.ts) + the widened ReaderSettings hydration
// contract (src/content/schema.ts).
//
// The unit layer is the AUTHORITATIVE proof of the derived-pair guarantees:
//   - D5-14 — --ink on --highlight ≥ 4.5:1 in EVERY custom theme (the
//     acceptance names a light, a dark, and a saturated seed);
//   - the focus ring clears WCAG 1.4.11 non-text 3:1 on every custom
//     surface;
//   - --ink-soft (POLISH-11's placeholder pair) keeps ≥ 4.5:1 against the
//     surface;
//   - the destructive red is fixed per the surface's light/dark disposition.
// All math is pure, so these assertions are engine-independent truth — the
// e2e layer (tests/e2e/chrome/custom-theme.spec.ts) proves the same math
// reaches the DOM through applyTheme's inline writes.
//
// The preset-seed drift guard mirrors tests/unit/settings/mirror.test.ts's
// extraction-anchor discipline: PRESET_SEEDS must byte-match the
// [data-theme] blocks in src/app.css, so a token change that forgets the
// seeds fails here.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AA_NON_TEXT_RATIO,
  AA_TEXT_RATIO,
  CUSTOM_COLOR_PROPS,
  PRESET_SEEDS,
  contrastRatio,
  fixContrastPairs,
  relativeLuminance,
  resolveCustomTheme,
  seedCustomTheme,
  surfaceDisposition,
} from "../../../src/settings/customTheme";
import { ReaderSettingsSchema } from "../../../src/content/schema";
import type { ReaderSettings } from "../../../src/content/schema";
import { ExportBundleSchema } from "../../../src/portability/bundle";

// ── Contrast math sanity ─────────────────────────────────────────────────────

describe("contrastRatio / relativeLuminance (WCAG 2.x)", () => {
  it("black on white is exactly 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });

  it("a color against itself is 1:1", () => {
    expect(contrastRatio("#fbf8f3", "#fbf8f3")).toBe(1);
  });

  it("is symmetric and case-insensitive", () => {
    expect(contrastRatio("#1F1B16", "#FBF8F3")).toBe(contrastRatio("#fbf8f3", "#1f1b16"));
  });

  it("computes the canonical luminance endpoints", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });
});

// ── Preset-seed drift guard (the app.css byte-match) ────────────────────────

/** Pull a `--token: <value>;` declaration out of a CSS block substring. */
function cssToken(css: string, from: number, to: number, prop: string): string {
  const block = css.slice(from, to);
  const m = new RegExp(`--${prop}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(block);
  if (!m?.[1]) throw new Error(`--${prop} not found in block`);
  return m[1];
}

describe("PRESET_SEEDS byte-match src/app.css (drift guard)", () => {
  const css = readFileSync(resolve(process.cwd(), "src/app.css"), "utf-8");
  // :root IS the sepia palette; the light/dark override blocks follow.
  const lightStart = css.indexOf('[data-theme="light"]');
  const darkStart = css.indexOf('[data-theme="dark"]');
  const darkBlockEnd = css.indexOf("body {", darkStart);
  expect(lightStart).toBeGreaterThan(-1);
  expect(darkStart).toBeGreaterThan(lightStart);
  expect(darkBlockEnd).toBeGreaterThan(darkStart);

  const blocks = {
    sepia: [0, lightStart] as const,
    light: [lightStart, darkStart] as const,
    dark: [darkStart, darkBlockEnd] as const,
  };

  for (const [base, [from, to]] of Object.entries(blocks)) {
    it(`seed "${base}" matches its app.css block for all 5 tokens`, () => {
      const seed = PRESET_SEEDS[base as keyof typeof PRESET_SEEDS];
      const expected = {
        surface: cssToken(css, from, to, "surface"),
        surfaceRaised: cssToken(css, from, to, "surface-raised"),
        ink: cssToken(css, from, to, "ink"),
        accent: cssToken(css, from, to, "accent"),
        hairline: cssToken(css, from, to, "hairline"),
      };
      expect(seed).toEqual(expected);
    });
  }
});

// ── Derivation: the derived-pair guarantees ──────────────────────────────────

/** The acceptance's three seed families: a light preset, a dark preset, and
 * a saturated seed (neon magenta surface, white ink, pure-red accent). */
const DERIVATION_SEEDS = [
  ...Object.entries(PRESET_SEEDS).map(([label, tokens]) => ({
    label: `preset ${label}`,
    tokens,
    disposition: label === "dark" ? ("dark" as const) : ("light" as const),
  })),
  {
    label: "saturated seed",
    tokens: {
      surface: "#7a1f5c",
      surfaceRaised: "#8a2f6c",
      ink: "#ffffff",
      accent: "#ff0000",
      hairline: "#b06a9a",
    },
    disposition: "dark" as const,
  },
];

describe("resolveCustomTheme — derived-pair guarantees (D5-14 et al.)", () => {
  it.each(DERIVATION_SEEDS)("$label: resolves exactly the 11 palette props", ({ tokens }) => {
    const resolved = resolveCustomTheme(tokens);
    expect(Object.keys(resolved).sort()).toEqual([...CUSTOM_COLOR_PROPS].sort());
  });

  it.each(DERIVATION_SEEDS)(
    "$label: stores the 5 tokens byte-stable (lowercased)",
    ({ tokens }) => {
      const resolved = resolveCustomTheme(tokens);
      expect(resolved["--surface"]).toBe(tokens.surface.toLowerCase());
      expect(resolved["--surface-raised"]).toBe(tokens.surfaceRaised.toLowerCase());
      expect(resolved["--ink"]).toBe(tokens.ink.toLowerCase());
      expect(resolved["--accent"]).toBe(tokens.accent.toLowerCase());
      expect(resolved["--hairline"]).toBe(tokens.hairline.toLowerCase());
    },
  );

  it.each(DERIVATION_SEEDS)("$label: D5-14 — ink on highlight ≥ 4.5:1", ({ tokens }) => {
    const r = resolveCustomTheme(tokens);
    expect(contrastRatio(r["--ink"], r["--highlight"])).toBeGreaterThanOrEqual(AA_TEXT_RATIO);
  });

  it.each(DERIVATION_SEEDS)("$label: ink on spoken-highlight ≥ 4.5:1 too", ({ tokens }) => {
    const r = resolveCustomTheme(tokens);
    expect(contrastRatio(r["--ink"], r["--spoken-highlight"])).toBeGreaterThanOrEqual(
      AA_TEXT_RATIO,
    );
  });

  it.each(DERIVATION_SEEDS)(
    "$label: markers distinct from surface AND each other",
    ({ tokens }) => {
      const r = resolveCustomTheme(tokens);
      expect(r["--highlight"]).not.toBe(r["--spoken-highlight"]);
      for (const fill of [r["--highlight"], r["--spoken-highlight"]]) {
        // A marker that renders as bare surface is an invisible marker.
        expect(fill).not.toBe(r["--surface"]);
      }
    },
  );

  it.each(DERIVATION_SEEDS)(
    "$label: focus ring clears 3:1 non-text on the surface",
    ({ tokens }) => {
      const r = resolveCustomTheme(tokens);
      expect(contrastRatio(r["--focus-ring"], r["--surface"])).toBeGreaterThanOrEqual(
        AA_NON_TEXT_RATIO,
      );
    },
  );

  it.each(DERIVATION_SEEDS)(
    "$label: ink-soft keeps ≥ 4.5:1 (POLISH-11 placeholder pair)",
    ({ tokens }) => {
      const r = resolveCustomTheme(tokens);
      expect(contrastRatio(r["--ink-soft"], r["--surface"])).toBeGreaterThanOrEqual(AA_TEXT_RATIO);
    },
  );

  it.each(DERIVATION_SEEDS)(
    "$label: destructive is the fixed red for the surface disposition",
    ({ tokens, disposition }) => {
      const r = resolveCustomTheme(tokens);
      expect(surfaceDisposition(r["--surface"])).toBe(disposition);
      expect(r["--destructive"]).toBe(disposition === "light" ? "#9b2c2c" : "#e07a7a");
    },
  );

  it("is deterministic — two resolutions of the same tokens are byte-equal", () => {
    const tokens = PRESET_SEEDS.sepia;
    expect(resolveCustomTheme(tokens)).toEqual(resolveCustomTheme(tokens));
  });
});

// ── Derivation: degenerate + walk behavior ───────────────────────────────────

describe("resolveCustomTheme — degenerate pairs", () => {
  // A broken ink/surface pair (both mid-gray): the surface itself fails AA
  // against the ink. The derived MARKERS must still clear D5-14 — the
  // compliant band lies on the anti-ink side of the surface.
  it("places markers in the anti-ink band when the surface pair itself fails", () => {
    const tokens = {
      surface: "#555555",
      surfaceRaised: "#666666",
      ink: "#444444",
      accent: "#556677",
      hairline: "#888888",
    };
    const r = resolveCustomTheme(tokens);
    expect(contrastRatio(r["--ink"], r["--highlight"])).toBeGreaterThanOrEqual(AA_TEXT_RATIO);
    expect(contrastRatio(r["--ink"], r["--spoken-highlight"])).toBeGreaterThanOrEqual(
      AA_TEXT_RATIO,
    );
  });

  it("walks the focus ring off a failing accent instead of leaving it invisible", () => {
    // Pure red on white is ~4:1 — passes — so use an accent that FAILS 3:1
    // on its surface: a pale yellow on white.
    const tokens = {
      surface: "#fcfcfa",
      surfaceRaised: "#f4f4f0",
      ink: "#1a1a1a",
      accent: "#ffff00",
      hairline: "#ddd9d0",
    };
    const r = resolveCustomTheme(tokens);
    expect(r["--focus-ring"]).not.toBe("#ffff00");
    expect(contrastRatio(r["--focus-ring"], r["--surface"])).toBeGreaterThanOrEqual(
      AA_NON_TEXT_RATIO,
    );
  });
});

// ── fixContrastPairs ─────────────────────────────────────────────────────────

describe("fixContrastPairs (the one-tap nudge)", () => {
  const FIXABLE = {
    surface: "#f0e8dc",
    surfaceRaised: "#e6dccd",
    ink: "#8a8378",
    accent: "#b09a7f",
    hairline: "#d9d1c2",
  };

  it("restores AA on BOTH failing pairs while touching only the offenders", () => {
    const fixed = fixContrastPairs(FIXABLE);
    expect(contrastRatio(fixed.ink, fixed.surface)).toBeGreaterThanOrEqual(AA_TEXT_RATIO);
    expect(contrastRatio(fixed.accent, fixed.surface)).toBeGreaterThanOrEqual(AA_TEXT_RATIO);
    expect(fixed.surface).toBe(FIXABLE.surface);
    expect(fixed.surfaceRaised).toBe(FIXABLE.surfaceRaised);
    expect(fixed.hairline).toBe(FIXABLE.hairline);
  });

  it("leaves compliant tokens untouched (values equal)", () => {
    const fixed = fixContrastPairs(PRESET_SEEDS.sepia);
    expect(fixed).toEqual(PRESET_SEEDS.sepia);
  });

  it("on an unfixable surface, improves toward the extreme without throwing", () => {
    const tokens = {
      surface: "#555555",
      surfaceRaised: "#666666",
      ink: "#444444",
      accent: "#556677",
      hairline: "#888888",
    };
    const fixed = fixContrastPairs(tokens);
    // The mid-gray surface caps ink at ~2.8:1 (black) — the honest best
    // effort walks as far as physics allows; the readout keeps reporting.
    expect(contrastRatio(fixed.ink, fixed.surface)).toBeGreaterThan(
      contrastRatio(tokens.ink, tokens.surface),
    );
  });
});

// ── seedCustomTheme ──────────────────────────────────────────────────────────

describe("seedCustomTheme (first-activation seeding)", () => {
  it("returns baseTheme + a fresh copy of the preset tokens", () => {
    const seeded = seedCustomTheme("sepia");
    expect(seeded.baseTheme).toBe("sepia");
    expect(seeded.tokens).toEqual(PRESET_SEEDS.sepia);
    expect(seeded.tokens).not.toBe(PRESET_SEEDS.sepia); // fresh object — later edits must not mutate the seed table
  });

  it("seeds all three bases", () => {
    for (const base of ["sepia", "light", "dark"] as const) {
      expect(seedCustomTheme(base).baseTheme).toBe(base);
      expect(seedCustomTheme(base).tokens).toEqual(PRESET_SEEDS[base]);
    }
  });
});

// ── Schema hydration (the STATE-04 trust boundary) ──────────────────────────

/** A fully-populated v3 record in schema-field order (byte-stability). */
const V3_RECORD: ReaderSettings = {
  schemaVersion: 3,
  font: "serif",
  size: 18,
  measure: 64,
  spacing: "comfortable",
  theme: "sepia",
  animatePageTurns: false,
  readingMode: "paginated",
  voice: undefined,
  rate: 1,
};

describe("ReaderSettingsSchema hydration — the custom-theme widening (#86)", () => {
  it("a v3 record without customTheme parses unchanged (additive widening)", () => {
    const parsed = ReaderSettingsSchema.safeParse(V3_RECORD);
    expect(parsed.success).toBe(true);
  });

  it("theme 'custom' + a valid customTheme parses, carrying the tokens", () => {
    const record: ReaderSettings = {
      ...V3_RECORD,
      theme: "custom",
      customTheme: seedCustomTheme("dark"),
    };
    const parsed = ReaderSettingsSchema.safeParse(record);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.customTheme).toEqual(seedCustomTheme("dark"));
      expect(parsed.data.customTheme?.baseTheme).toBe("dark");
    }
  });

  it("theme 'custom' WITHOUT customTheme fails parse (the corrupt routing precondition)", () => {
    const record = { ...V3_RECORD, theme: "custom" };
    const parsed = ReaderSettingsSchema.safeParse(record);
    expect(parsed.success).toBe(false);
  });

  it.each([
    ["5-digit hex", "#1234"],
    ["7-digit hex", "#1234567"],
    ["non-hex digits", "#12345g"],
    ["bare name", "sepia"],
  ])("an invalid token value (%s) fails parse", (_label, hex) => {
    const record: ReaderSettings = {
      ...V3_RECORD,
      theme: "custom",
      customTheme: {
        baseTheme: "sepia",
        tokens: { ...PRESET_SEEDS.sepia, surface: hex },
      },
    };
    expect(ReaderSettingsSchema.safeParse(record).success).toBe(false);
  });

  it("an invalid baseTheme fails parse", () => {
    const record = {
      ...V3_RECORD,
      theme: "custom",
      customTheme: {
        baseTheme: "custom",
        tokens: PRESET_SEEDS.sepia,
      },
    };
    expect(ReaderSettingsSchema.safeParse(record).success).toBe(false);
  });

  it("uppercase hex parses (never coerced on read; the UI commits lowercase)", () => {
    const record: ReaderSettings = {
      ...V3_RECORD,
      theme: "custom",
      customTheme: {
        baseTheme: "sepia",
        tokens: { ...PRESET_SEEDS.sepia, ink: "#1F1B16" },
      },
    };
    const parsed = ReaderSettingsSchema.safeParse(record);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.customTheme?.tokens.ink).toBe("#1F1B16");
    }
  });

  it("round-trips a custom-theme record value-stable through JSON", () => {
    const record: ReaderSettings = {
      ...V3_RECORD,
      theme: "custom",
      customTheme: seedCustomTheme("light"),
    };
    const json = JSON.stringify(record);
    const parsed = ReaderSettingsSchema.parse(JSON.parse(json));
    expect(parsed).toEqual(record);
    // Parse is IDEMPOTENT in serialized form (Zod re-emits keys in schema
    // order) — the manifest hash recomputed over a re-parsed block is
    // stable, which is the byte-stability the import path relies on.
    expect(JSON.stringify(ReaderSettingsSchema.parse(parsed))).toBe(JSON.stringify(parsed));
  });

  it("a v5 export bundle carries a custom theme (the preferences block composition)", () => {
    const record: ReaderSettings = {
      ...V3_RECORD,
      theme: "custom",
      customTheme: seedCustomTheme("sepia"),
    };
    const bundle = {
      schemaVersion: 5,
      exportedAt: "2026-09-23T00:00:00.000Z",
      appVersion: "test",
      articles: [],
      locations: [],
      highlights: [],
      notes: [],
      preferences: record,
      fixtureIds: [],
      books: [],
      assets: [],
      readingSessions: [],
    };
    const parsed = ExportBundleSchema.safeParse(bundle);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.preferences.customTheme).toEqual(seedCustomTheme("sepia"));
    }
  });
});
