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
//   - the destructive red is fixed per the surface's light/dark disposition;
//   - issue #146 — the Wayfinder chrome pairs (the extended ADR 0005 palette
//     audit): band text on band and on the lit board ≥ 4.5:1, brass on the
//     paper and lit brass on the band ≥ 3:1 non-text, band text on
//     accent-strong ≥ 4.5:1 — with the derive-until-edited storage contract
//     and the register (light/dark disposition) split.
// All math is pure, so these assertions are engine-independent truth — the
// e2e layer (tests/e2e/chrome/custom-theme.spec.ts) proves the same math
// reaches the DOM through applyTheme's inline writes.
//
// The preset-seed drift guard mirrors tests/unit/settings/mirror.test.ts's
// extraction-anchor discipline: PRESET_SEEDS must byte-match the
// [data-theme] blocks in src/app.css, so a token change that forgets
// the seeds fails there. Issue #146 extends the discipline to the chrome:
// the DERIVED chrome is checked against the same preset blocks within tight
// OKLCH tolerances (the derivation's register constants sit ON the preset
// values), and every preset block must keep declaring all eight chrome
// tokens.
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
  // ADR 0005 block order: :root (Daylight) → [data-theme="sepia"] (Warm
  // paper) → [data-theme="light"] (Daylight, explicit) → [data-theme="dark"]
  // (Night). The map below IS that order — keep it in sync with app.css.
  const sepiaStart = css.indexOf('[data-theme="sepia"]');
  const lightStart = css.indexOf('[data-theme="light"]');
  const darkStart = css.indexOf('[data-theme="dark"]');
  const darkBlockEnd = css.indexOf("body {", darkStart);
  expect(sepiaStart).toBeGreaterThan(-1);
  expect(lightStart).toBeGreaterThan(sepiaStart);
  expect(darkStart).toBeGreaterThan(lightStart);
  expect(darkBlockEnd).toBeGreaterThan(darkStart);

  const blocks = {
    sepia: [sepiaStart, lightStart] as const,
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
  it.each(DERIVATION_SEEDS)("$label: resolves exactly the 23 palette props", ({ tokens }) => {
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

// ── Issue #146 — the Wayfinder chrome (derive-until-edited) ──────────────────

/** The chrome audit's seed families: everything in DERIVATION_SEEDS plus the
 * degenerate broken ink/surface pair (the chrome constants must hold even
 * there — the walks are best-effort but the audited pairs still pass). */
const CHROME_SEEDS = [
  ...DERIVATION_SEEDS,
  {
    label: "degenerate broken ink/surface pair",
    tokens: {
      surface: "#555555",
      surfaceRaised: "#666666",
      ink: "#444444",
      accent: "#556677",
      hairline: "#888888",
    },
    disposition: "dark" as const,
  },
];

describe("resolveCustomTheme — the Wayfinder chrome pairs (#146, the extended ADR 0005 audit)", () => {
  it.each(CHROME_SEEDS)("$label: every audited chrome pair passes in its slot", ({ tokens }) => {
    const r = resolveCustomTheme(tokens);
    // Text pairs on the boards (WCAG 1.4.3).
    expect(contrastRatio(r["--board-text"], r["--board"])).toBeGreaterThanOrEqual(AA_TEXT_RATIO);
    expect(contrastRatio(r["--lit-text"], r["--lit"])).toBeGreaterThanOrEqual(AA_TEXT_RATIO);
    expect(contrastRatio(r["--board-soft"], r["--board"])).toBeGreaterThanOrEqual(AA_TEXT_RATIO);
    // The solid fill behind the band text (WCAG 1.4.3).
    expect(contrastRatio(r["--board-text"], r["--accent-strong"])).toBeGreaterThanOrEqual(
      AA_TEXT_RATIO,
    );
    // Non-text metal on its grounds (WCAG 1.4.11).
    expect(contrastRatio(r["--brass"], r["--surface"])).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO);
    expect(contrastRatio(r["--brass"], r["--surface-raised"])).toBeGreaterThanOrEqual(
      AA_NON_TEXT_RATIO,
    );
    expect(contrastRatio(r["--brass-bright"], r["--board"])).toBeGreaterThanOrEqual(
      AA_NON_TEXT_RATIO,
    );
  });

  it.each(CHROME_SEEDS)(
    "$label: lit-text IS the band text (byte-for-byte, as in the presets)",
    ({ tokens }) => {
      const r = resolveCustomTheme(tokens);
      expect(r["--lit-text"]).toBe(r["--board-text"]);
    },
  );

  it.each(CHROME_SEEDS)(
    "$label: derivation is deterministic across the chrome too",
    ({ tokens }) => {
      expect(resolveCustomTheme(tokens)).toEqual(resolveCustomTheme(tokens));
    },
  );

  it("stored chrome tokens ride byte-stable (lowercased) and override derivation", () => {
    const stored = {
      ...PRESET_SEEDS.light,
      board: "#1A2B3C",
      boardText: "#EEDDCC",
      lit: "#24403A",
      brass: "#5A4A10",
    };
    const r = resolveCustomTheme(stored);
    expect(r["--board"]).toBe("#1a2b3c");
    expect(r["--board-text"]).toBe("#eeddcc");
    expect(r["--lit"]).toBe("#24403a");
    expect(r["--lit-text"]).toBe("#eeddcc"); // lit-text is the band text, stored side included
    expect(r["--brass"]).toBe("#5a4a10");
  });

  it("editing ONE chrome token leaves the untouched chrome derived", () => {
    const stored = { ...PRESET_SEEDS.light, brass: "#5A4A10" };
    const r = resolveCustomTheme(stored);
    const plain = resolveCustomTheme(PRESET_SEEDS.light);
    expect(r["--brass"]).toBe("#5a4a10");
    expect(r["--board"]).toBe(plain["--board"]);
    expect(r["--board-text"]).toBe(plain["--board-text"]);
    expect(r["--lit"]).toBe(plain["--lit"]);
    expect(r["--accent-strong"]).toBe(plain["--accent-strong"]);
  });

  it("a non-green accent repaints the band, the lit board, and the metal — not the preset enamel", () => {
    const crimson = resolveCustomTheme({ ...PRESET_SEEDS.light, accent: "#a12345" });
    const plain = resolveCustomTheme(PRESET_SEEDS.light);
    expect(crimson["--board"]).not.toBe(plain["--board"]);
    expect(crimson["--lit"]).not.toBe(plain["--lit"]);
    expect(crimson["--brass"]).not.toBe(plain["--brass"]);
    // The audited pairs still hold in the repainted room.
    expect(contrastRatio(crimson["--board-text"], crimson["--board"])).toBeGreaterThanOrEqual(
      AA_TEXT_RATIO,
    );
    expect(contrastRatio(crimson["--brass"], crimson["--surface"])).toBeGreaterThanOrEqual(
      AA_NON_TEXT_RATIO,
    );
  });

  it("the register follows the surface disposition — a dark slot never reuses the light register", () => {
    // Same accent, flipped surface: the band goes darker AND the metal goes
    // bright (Night's register), never Daylight's deep-on-paper pair.
    const lightRegister = resolveCustomTheme(PRESET_SEEDS.light);
    const darkRegister = resolveCustomTheme({
      ...PRESET_SEEDS.light,
      surface: PRESET_SEEDS.dark.surface,
    });
    expect(surfaceDisposition(PRESET_SEEDS.light.surface)).toBe("light");
    expect(surfaceDisposition(PRESET_SEEDS.dark.surface)).toBe("dark");
    expect(relativeLuminance(darkRegister["--board"])).toBeLessThan(
      relativeLuminance(lightRegister["--board"]),
    );
    expect(relativeLuminance(darkRegister["--brass"])).toBeGreaterThan(
      relativeLuminance(lightRegister["--brass"]),
    );
    // The dark register's bright metal out-shines its own quiet metal.
    expect(relativeLuminance(darkRegister["--brass-bright"])).toBeGreaterThan(
      relativeLuminance(darkRegister["--brass"]),
    );
  });

  it.each(["sepia", "light"] as const)(
    "light-register accent-strong IS the accent (byte-for-byte — the preset discipline; %s)",
    (base) => {
      const r = resolveCustomTheme(PRESET_SEEDS[base]);
      expect(r["--accent-strong"]).toBe(PRESET_SEEDS[base].accent.toLowerCase());
    },
  );
});

// ── Issue #146 — the chrome drift guard (the app.css preset blocks) ──────────

/** Test-owned OKLCH (the audit side speaks hex; tolerances speak OKLCH). */
function oklchOf(hex: string): { L: number; C: number; h: number } {
  const n = Number.parseInt(hex.slice(1), 16);
  const toLinear = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lin: [number, number, number] = [
    toLinear((n >> 16) & 0xff),
    toLinear((n >> 8) & 0xff),
    toLinear(n & 0xff),
  ];
  const l = Math.cbrt(0.4122214708 * lin[0] + 0.5363325363 * lin[1] + 0.0514459929 * lin[2]);
  const m = Math.cbrt(0.2119034982 * lin[0] + 0.6806995451 * lin[1] + 0.1073969566 * lin[2]);
  const s = Math.cbrt(0.0883024619 * lin[0] + 0.2817188376 * lin[1] + 0.6299787005 * lin[2]);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(a, b), h: (Math.atan2(b, a) * 180) / Math.PI };
}

describe("derived chrome drift guard — the app.css preset blocks (#146)", () => {
  const css = readFileSync(resolve(process.cwd(), "src/app.css"), "utf-8");
  const sepiaStart = css.indexOf('[data-theme="sepia"]');
  const lightStart = css.indexOf('[data-theme="light"]');
  const darkStart = css.indexOf('[data-theme="dark"]');
  const darkBlockEnd = css.indexOf("body {", darkStart);
  const blocks = {
    sepia: [sepiaStart, lightStart] as const,
    light: [lightStart, darkStart] as const,
    dark: [darkStart, darkBlockEnd] as const,
  };

  // Bare token names — cssToken prepends the "--" itself.
  const CHROME_PROPS = [
    "board",
    "board-text",
    "board-soft",
    "lit",
    "lit-text",
    "brass",
    "brass-bright",
    "accent-strong",
  ] as const;

  it("every preset block declares all eight chrome tokens (no forgotten theme)", () => {
    for (const [base, [from, to]] of Object.entries(blocks)) {
      for (const prop of CHROME_PROPS) {
        expect(() => cssToken(css, from, to, prop), `${base} --${prop}`).not.toThrow();
      }
    }
  });

  it.each([
    ["sepia", "sepia"],
    ["light", "light"],
    ["dark", "dark"],
  ] as const)("seed '%s' derives chrome within the preset block's tolerance", (seed, block) => {
    const [from, to] = blocks[block];
    const derived = resolveCustomTheme(PRESET_SEEDS[seed]);
    for (const prop of CHROME_PROPS) {
      const cssProp = `--${prop}` as keyof typeof derived;
      const presetHex = cssToken(css, from, to, prop);
      const p = oklchOf(presetHex);
      const d = oklchOf(derived[cssProp]);
      // The derivation's register constants sit ON the preset values: tight
      // lightness/chroma tolerances (brass gets a hair more room — its
      // lightness tracks the register, not the byte).
      expect(Math.abs(d.L - p.L), `${cssProp} lightness`).toBeLessThanOrEqual(0.05);
      expect(Math.abs(d.C - p.C), `${cssProp} chroma`).toBeLessThanOrEqual(0.04);
      // Hue is only meaningful above the near-neutral floor (the signage
      // whites' chroma is ~0.005 — hue there is noise).
      if (Math.min(d.C, p.C) > 0.03) {
        const hueGap = Math.abs(((d.h - p.h + 540) % 360) - 180);
        // Brass + brass-bright deliberately follow the ACCENT's hue (the
        // #146 "matching room" contract) — the presets' fixed gold is the
        // one documented divergence; every other chromatic chrome token
        // must keep the preset's hue family.
        const isMetal = prop === "brass" || prop === "brass-bright";
        if (!isMetal) {
          expect(hueGap, `${cssProp} hue`).toBeLessThanOrEqual(12);
        } else {
          const accentHue = oklchOf(PRESET_SEEDS[seed].accent).h;
          const accentGap = Math.abs(((d.h - accentHue + 540) % 360) - 180);
          expect(accentGap, `${cssProp} accent-hue metal`).toBeLessThanOrEqual(12);
        }
      }
    }
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

// ── fixContrastPairs — the chrome pairs (#146) ───────────────────────────────

describe("fixContrastPairs — the Wayfinder chrome pairs (#146)", () => {
  it("a pastel band fixes via the band; no band text is invented", () => {
    const pastel = { ...PRESET_SEEDS.light, board: "#f5f5f0" };
    const before = resolveCustomTheme(pastel);
    expect(contrastRatio(before["--board-text"], before["--board"])).toBeLessThan(AA_TEXT_RATIO);

    const fixed = fixContrastPairs(pastel);
    expect(fixed.board).toBeDefined();
    expect(fixed.board).not.toBe(pastel.board); // the offender moved
    expect(fixed.boardText).toBeUndefined(); // nothing invented
    expect(fixed.surface).toBe(pastel.surface); // every other token rides
    expect(fixed.ink).toBe(pastel.ink);
    expect(fixed.accent).toBe(pastel.accent);
    expect(fixed.hairline).toBe(pastel.hairline);

    const after = resolveCustomTheme(fixed);
    expect(contrastRatio(after["--board-text"], after["--board"])).toBeGreaterThanOrEqual(
      AA_TEXT_RATIO,
    );
  });

  it("a stored band text fixes via the band text (the stored side, text wins ties)", () => {
    const darkText = { ...PRESET_SEEDS.dark, board: "#10150f", boardText: "#333333" };
    const before = resolveCustomTheme(darkText);
    expect(contrastRatio(before["--board-text"], before["--board"])).toBeLessThan(AA_TEXT_RATIO);

    const fixed = fixContrastPairs(darkText);
    expect(fixed.boardText).toBeDefined();
    expect(fixed.boardText).not.toBe(darkText.boardText);
    expect(fixed.board).toBe(darkText.board); // the stored band rides

    const after = resolveCustomTheme(fixed);
    expect(contrastRatio(after["--board-text"], after["--board"])).toBeGreaterThanOrEqual(
      AA_TEXT_RATIO,
    );
  });

  it("a failing brass pair fixes via brass only", () => {
    const badBrass = { ...PRESET_SEEDS.light, brass: "#f0f0ee" };
    const before = resolveCustomTheme(badBrass);
    expect(contrastRatio(before["--brass"], before["--surface"])).toBeLessThan(AA_NON_TEXT_RATIO);

    const fixed = fixContrastPairs(badBrass);
    expect(fixed.brass).toBeDefined();
    expect(fixed.brass).not.toBe(badBrass.brass);
    expect(fixed.board).toBeUndefined();
    expect(fixed.boardText).toBeUndefined();
    expect(fixed.lit).toBeUndefined();

    const after = resolveCustomTheme(fixed);
    expect(contrastRatio(after["--brass"], after["--surface"])).toBeGreaterThanOrEqual(
      AA_NON_TEXT_RATIO,
    );
  });

  it("a near-white band fixes via the band; the derived lit brass follows on re-resolve", () => {
    const nearWhite = { ...PRESET_SEEDS.light, board: "#fafaf8" };
    const before = resolveCustomTheme(nearWhite);
    expect(contrastRatio(before["--board-text"], before["--board"])).toBeLessThan(AA_TEXT_RATIO);

    const fixed = fixContrastPairs(nearWhite);
    expect(fixed.board).toBeDefined();
    expect(fixed.board).not.toBe(nearWhite.board); // the band walked back toward enamel
    expect(fixed.boardText).toBeUndefined(); // nothing invented

    // The walked band carries BOTH its policed partners: the band text
    // (4.5:1), and the lit metal — which re-walks against the new band on
    // the next resolve (3:1, by derivation).
    const after = resolveCustomTheme(fixed);
    expect(contrastRatio(after["--board-text"], after["--board"])).toBeGreaterThanOrEqual(
      AA_TEXT_RATIO,
    );
    expect(contrastRatio(after["--brass-bright"], after["--board"])).toBeGreaterThanOrEqual(
      AA_NON_TEXT_RATIO,
    );
  });

  it("a compliant record with chrome fields stays value-equal (no chrome writes)", () => {
    const compliant = {
      ...PRESET_SEEDS.sepia,
      board: "#1d3128",
      boardText: "#f2f4f1",
      lit: "#2c4a3b",
      brass: "#7d5f1e",
    };
    const fixed = fixContrastPairs(compliant);
    expect(fixed).toEqual(compliant);
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
  librarySort: "recently-added", // issue #115 — the additive preference
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

describe("ReaderSettingsSchema hydration — the two custom slots (#120)", () => {
  it("a v3 record without either slot record parses unchanged (additive widening)", () => {
    const parsed = ReaderSettingsSchema.safeParse(V3_RECORD);
    expect(parsed.success).toBe(true);
  });

  it("theme 'custom-light' + a valid record parses, carrying the tokens", () => {
    const record: ReaderSettings = {
      ...V3_RECORD,
      theme: "custom-light",
      customLightTheme: seedCustomTheme("light"),
    };
    const parsed = ReaderSettingsSchema.safeParse(record);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.customLightTheme).toEqual(seedCustomTheme("light"));
      expect(parsed.data.customLightTheme?.baseTheme).toBe("light");
    }
  });

  it("theme 'custom-dark' + a valid record parses, carrying the tokens", () => {
    const record: ReaderSettings = {
      ...V3_RECORD,
      theme: "custom-dark",
      customDarkTheme: seedCustomTheme("dark"),
    };
    const parsed = ReaderSettingsSchema.safeParse(record);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.customDarkTheme).toEqual(seedCustomTheme("dark"));
    }
  });

  it("an inactive slot may carry a record while the OTHER slot is active (issue #120 — both saved)", () => {
    const record: ReaderSettings = {
      ...V3_RECORD,
      theme: "custom-dark",
      customLightTheme: seedCustomTheme("sepia"),
      customDarkTheme: seedCustomTheme("dark"),
    };
    const parsed = ReaderSettingsSchema.safeParse(record);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.customLightTheme).toEqual(seedCustomTheme("sepia"));
      expect(parsed.data.customDarkTheme).toEqual(seedCustomTheme("dark"));
    }
  });

  it.each([
    ["custom-light", "customLightTheme"],
    ["custom-dark", "customDarkTheme"],
  ] as const)(
    "theme '%s' WITHOUT its slot record fails parse (the corrupt routing precondition)",
    (theme, field) => {
      const record = { ...V3_RECORD, theme };
      expect(record).not.toHaveProperty(field);
      expect(ReaderSettingsSchema.safeParse(record).success).toBe(false);
    },
  );

  it.each([
    ["5-digit hex", "#1234"],
    ["7-digit hex", "#1234567"],
    ["non-hex digits", "#12345g"],
    ["bare name", "sepia"],
  ])("an invalid token value (%s) fails parse", (_label, hex) => {
    const record: ReaderSettings = {
      ...V3_RECORD,
      theme: "custom-light",
      customLightTheme: {
        baseTheme: "sepia",
        tokens: { ...PRESET_SEEDS.sepia, surface: hex },
      },
    };
    expect(ReaderSettingsSchema.safeParse(record).success).toBe(false);
  });

  it("an invalid baseTheme fails parse", () => {
    const record = {
      ...V3_RECORD,
      theme: "custom-light",
      customLightTheme: {
        baseTheme: "custom",
        tokens: PRESET_SEEDS.sepia,
      },
    };
    expect(ReaderSettingsSchema.safeParse(record).success).toBe(false);
  });

  it("uppercase hex parses (never coerced on read; the UI commits lowercase)", () => {
    const record: ReaderSettings = {
      ...V3_RECORD,
      theme: "custom-light",
      customLightTheme: {
        baseTheme: "sepia",
        tokens: { ...PRESET_SEEDS.sepia, ink: "#1F1B16" },
      },
    };
    const parsed = ReaderSettingsSchema.safeParse(record);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.customLightTheme?.tokens.ink).toBe("#1F1B16");
    }
  });

  it("round-trips a both-slots record value-stable through JSON", () => {
    const record: ReaderSettings = {
      ...V3_RECORD,
      schemaVersion: 5,
      theme: "custom-dark",
      customLightTheme: seedCustomTheme("light"),
      customDarkTheme: {
        baseTheme: "dark",
        tokens: { ...PRESET_SEEDS.dark, accent: "#C49A6C" },
      },
    };
    const json = JSON.stringify(record);
    const parsed = ReaderSettingsSchema.parse(JSON.parse(json));
    expect(parsed).toEqual(record);
    // Parse is IDEMPOTENT in serialized form (Zod re-emits keys in schema
    // order) — the manifest hash recomputed over a re-parsed block is
    // stable, which is the byte-stability the import path relies on.
    expect(JSON.stringify(ReaderSettingsSchema.parse(parsed))).toBe(JSON.stringify(parsed));
  });

  it("a v5 export bundle carries BOTH custom slots (the preferences block composition)", () => {
    const record: ReaderSettings = {
      ...V3_RECORD,
      schemaVersion: 5,
      theme: "custom-light",
      customLightTheme: seedCustomTheme("light"),
      customDarkTheme: seedCustomTheme("dark"),
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
      expect(parsed.data.preferences.customLightTheme).toEqual(seedCustomTheme("light"));
      expect(parsed.data.preferences.customDarkTheme).toEqual(seedCustomTheme("dark"));
    }
  });

  // ── Issue #146 — the additive chrome fields ────────────────────────────────

  it("a pre-#146 record (five tokens, no chrome fields) parses unchanged and derives its chrome", () => {
    const record: ReaderSettings = {
      ...V3_RECORD,
      schemaVersion: 5,
      theme: "custom-light",
      customLightTheme: seedCustomTheme("light"),
    };
    const parsed = ReaderSettingsSchema.safeParse(record);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const tokens = parsed.data.customLightTheme?.tokens;
      if (tokens === undefined) throw new Error("customLightTheme tokens missing after parse");
      expect(tokens).not.toHaveProperty("board");
      expect(tokens).not.toHaveProperty("boardText");
      expect(tokens).not.toHaveProperty("lit");
      expect(tokens).not.toHaveProperty("brass");
      // No migration: the derived chrome resolves from the five seeds alone.
      const resolved = resolveCustomTheme(tokens);
      for (const prop of ["--board", "--board-text", "--lit", "--brass"] as const) {
        expect(resolved[prop]).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("a record with edited chrome fields parses, carrying them (uppercase preserved)", () => {
    const record: ReaderSettings = {
      ...V3_RECORD,
      schemaVersion: 5,
      theme: "custom-dark",
      customDarkTheme: {
        baseTheme: "dark",
        tokens: { ...PRESET_SEEDS.dark, board: "#0E1A14", brass: "#C49A6C" },
      },
    };
    const parsed = ReaderSettingsSchema.safeParse(record);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.customDarkTheme?.tokens.board).toBe("#0E1A14");
      expect(parsed.data.customDarkTheme?.tokens.brass).toBe("#C49A6C");
      expect(parsed.data.customDarkTheme?.tokens).not.toHaveProperty("boardText");
      expect(parsed.data.customDarkTheme?.tokens).not.toHaveProperty("lit");
    }
  });

  it.each(["board", "boardText", "lit", "brass"] as const)(
    "an invalid chrome hex on %s fails parse",
    (field) => {
      const record = {
        ...V3_RECORD,
        schemaVersion: 5,
        theme: "custom-light" as const,
        customLightTheme: {
          baseTheme: "light" as const,
          tokens: { ...PRESET_SEEDS.light, [field]: "#12345" },
        },
      };
      expect(ReaderSettingsSchema.safeParse(record).success).toBe(false);
    },
  );

  it("a bundle carrying edited chrome fields round-trips value-stable", () => {
    const record: ReaderSettings = {
      ...V3_RECORD,
      schemaVersion: 5,
      theme: "custom-light",
      customLightTheme: {
        baseTheme: "light",
        tokens: { ...PRESET_SEEDS.light, board: "#1A2B3C", lit: "#2A3B4C" },
      },
    };
    const json = JSON.stringify(record);
    const parsed = ReaderSettingsSchema.parse(JSON.parse(json));
    expect(parsed).toEqual(record);
    // Parse is IDEMPOTENT in serialized form (Zod re-emits keys in schema
    // order) — the existing round-trip discipline, now with chrome fields.
    expect(JSON.stringify(ReaderSettingsSchema.parse(parsed))).toBe(JSON.stringify(parsed));
  });
});

describe("custom chrome review regressions", () => {
  it("keeps secondary navigation readable on an edited white band", () => {
    const r = resolveCustomTheme({
      ...PRESET_SEEDS.light,
      board: "#ffffff",
      boardText: "#111111",
      lit: "#ffffff",
    });
    expect(contrastRatio(r["--board-soft"], r["--board"])).toBeGreaterThanOrEqual(AA_TEXT_RATIO);
  });

  it("leaves compliant derived lit unstored after fixing band text", () => {
    const tokens = { ...PRESET_SEEDS.light, board: "#1b3128", boardText: "#1b3128" };
    const fixed = fixContrastPairs(tokens);
    expect(fixed.boardText).not.toBe(tokens.boardText);
    expect(fixed).not.toHaveProperty("lit");
    const r = resolveCustomTheme(fixed);
    expect(contrastRatio(r["--lit-text"], r["--lit"])).toBeGreaterThanOrEqual(AA_TEXT_RATIO);
    expect(resolveCustomTheme({ ...fixed, board: "#ffffff" })["--lit"]).not.toBe(r["--lit"]);
  });

  it("derives brass against the raised paper as well as the surface", () => {
    const r = resolveCustomTheme({ ...PRESET_SEEDS.light, surfaceRaised: "#3a775f" });
    for (const ground of ["--surface", "--surface-raised"] as const) {
      expect(contrastRatio(r["--brass"], r[ground])).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO);
    }
  });

  it("fixes stored brass failing only on raised paper without moving other seeds", () => {
    const tokens = { ...PRESET_SEEDS.light, surfaceRaised: "#3a775f", brass: "#3a775f" };
    const fixed = fixContrastPairs(tokens);
    expect(fixed).toEqual({ ...tokens, brass: expect.any(String) });
    expect(fixed.brass).not.toBe(tokens.brass);
    const r = resolveCustomTheme(fixed);
    for (const ground of ["--surface", "--surface-raised"] as const) {
      expect(contrastRatio(r["--brass"], r[ground])).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO);
    }
  });
});
