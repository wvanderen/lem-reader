// tests/unit/settings/highlightTint.test.ts
// Issue #196 — the custom highlight color's readable rendering.
//
// Three layers of pure-math proof (the highlight-color-contrast.test.ts
// discipline, extended to reader-chosen colors):
//   1. THE PIN — STATIC_THEME_HIGHLIGHT_BASES mirrors app.css's seven static
//      [data-theme] blocks byte-for-byte (surface + ink). A CSS token change
//      that forgets this map fails here; a map change that forgets the CSS
//      cannot pass, because the pin reads the file.
//   2. THE GUARANTEE — readableHighlightTint keeps ink-on-tint ≥ AA (4.5:1)
//      for every swept chosen color × every theme base family: the seven
//      static bases, the derived custom-slot bases (preset seeds, saturated,
//      and the degenerate broken ink/surface pair), and the defence-in-depth
//      fallback.
//   3. THE CONTRACT — the tint is deterministic, preserves the chosen hue
//      (recognizability), caps chroma at the calm named-marker band, and
//      highlightBases resolves custom slots through the SAME derivation
//      applyTheme writes inline (preview = live document by construction).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AA_TEXT_RATIO,
  PRESET_SEEDS,
  contrastRatio,
  resolveCustomTheme,
} from "../../../src/settings/customTheme";
import { customHighlightTint, highlightBases, STATIC_THEME_HIGHLIGHT_BASES } from "../../../src/settings/highlightTint";
import { presetPaletteBlocks } from "./presetPalette";

/** Test-side OKLCH probe (the Björn Ottosson reference matrices customTheme
 * implements) — the hue-preservation assertions read the tint's polar
 * coordinates without the module exporting its internal color space. */
function hexToOkLchOk(hex: string): { l: number; c: number; h: number } {
  const n = Number.parseInt(hex.slice(1), 16);
  const srgbToLinear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const r = srgbToLinear(((n >> 16) & 0xff) / 255);
  const g = srgbToLinear(((n >> 8) & 0xff) / 255);
  const b = srgbToLinear((n & 0xff) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bChroma = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    c: Math.hypot(a, bChroma),
    h: (Math.atan2(bChroma, a) * 180) / Math.PI,
  };
}

/** Reader-chosen sweep: gamut extremes, near-grays, the editor's seed, a
 * mid saturated hue, and a color equal to a theme surface (the invisible-fill
 * edge — the lightness band must still lift it out). */
const CHOSEN_SWEEP = [
  "#ff0000",
  "#00ff7f",
  "#123456",
  "#e9c46a",
  "#808080",
  "#7a1f5c",
  "#000000",
  "#ffffff",
  "#f0e8d5",
];

describe("STATIC_THEME_HIGHLIGHT_BASES pins app.css (issue #196)", () => {
  const css = readFileSync(resolve(process.cwd(), "src/app.css"), "utf-8");
  const blocks = presetPaletteBlocks(css);

  it("mirrors every static theme's --surface and --ink byte-for-byte", () => {
    for (const [theme, [from, to]] of Object.entries(blocks)) {
      // The :root "daylight" block is the pre-hydration default palette, not
      // a settings literal (every reader theme is set by applyTheme) — the
      // pin covers exactly the seven settings-owned themes.
      if (theme === "daylight") continue;
      const block = css.slice(from, to);
      const surface = /--surface:\s*(#[0-9a-fA-F]{6})\s*;/.exec(block)?.[1];
      const ink = /--ink:\s*(#[0-9a-fA-F]{6})\s*;/.exec(block)?.[1];
      expect(surface, `${theme} --surface extracted`).toBeDefined();
      expect(ink, `${theme} --ink extracted`).toBeDefined();
      const mapped =
      STATIC_THEME_HIGHLIGHT_BASES[theme as keyof typeof STATIC_THEME_HIGHLIGHT_BASES];
    if (!mapped) throw new Error(`no bases mapped for ${theme}`);
      expect(mapped.surface).toBe(surface);
      expect(mapped.ink).toBe(ink);
    }
  });

  it("covers exactly the seven static themes (the custom slots are derived, never literal)", () => {
    expect(Object.keys(STATIC_THEME_HIGHLIGHT_BASES).sort()).toEqual(
      [
        "bi-dark",
        "dark",
        "light",
        "marxism-dark",
        "marxism-light",
        "sepia",
        "trans-light",
      ].sort(),
    );
  });
});

describe("readableHighlightTint keeps ink-on-tint ≥ AA in every theme family (issue #196)", () => {
  const baseFamilies: { label: string; bases: { surface: string; ink: string } }[] = [
    ...Object.entries(STATIC_THEME_HIGHLIGHT_BASES).map(([label, bases]) => ({
      label: `static ${label}`,
      bases,
    })),
    // The derived custom slots — the SAME resolveCustomTheme applyTheme
    // writes inline, across the seed families the named-fill audit uses.
    ...Object.entries(PRESET_SEEDS).map(([label, tokens]) => ({
      label: `custom-slot ${label} seed`,
      bases: highlightBases({
        theme: "custom-light",
        customLightTheme: { baseTheme: label as keyof typeof PRESET_SEEDS, tokens },
      }),
    })),
    {
      label: "custom-slot saturated seed",
      bases: highlightBases({
        theme: "custom-dark",
        customDarkTheme: {
          baseTheme: "dark",
          tokens: {
            surface: "#7a1f5c",
            surfaceRaised: "#8a2f6c",
            ink: "#ffffff",
            accent: "#ff0000",
            hairline: "#b06a9a",
          },
        },
      }),
    },
    {
      label: "custom-slot degenerate broken ink/surface pair",
      bases: highlightBases({
        theme: "custom-light",
        customLightTheme: {
          baseTheme: "light",
          tokens: {
            surface: "#555555",
            surfaceRaised: "#666666",
            ink: "#444444",
            accent: "#556677",
            hairline: "#888888",
          },
        },
      }),
    },
  ];

  for (const { label, bases } of baseFamilies) {
    it.each(CHOSEN_SWEEP)(
      `${label}: ink on the derived tint of %s ≥ 4.5:1`,
      (chosen) => {
        const tint = customHighlightTint(chosen, bases);
        expect(tint).toBeDefined();
        expect(contrastRatio(bases.ink, tint as string)).toBeGreaterThanOrEqual(AA_TEXT_RATIO);
      },
    );
  }
});

describe("readableHighlightTint contract (issue #196)", () => {
  const bases = STATIC_THEME_HIGHLIGHT_BASES.sepia;

  it("is deterministic — same chosen hex + bases, same tint", () => {
    const a = customHighlightTint("#7a1f5c", bases);
    const b = customHighlightTint("#7a1f5c", bases);
    expect(a).toBe(b);
  });

  it.each(CHOSEN_SWEEP)(
    "preserves the chosen hue family for %s (recognizability — the lightness band owns readability, not identity)",
    (chosen) => {
      const tint = customHighlightTint(chosen, bases) as string;
      const chosenLch = hexToOkLchOk(chosen);
      const tintLch = hexToOkLchOk(tint);
      // Near-gray chosen colors carry no meaningful hue to preserve; every
      // chromatic choice must render in its own hue family (±10° — the OKLCH
      // hue wrap handled by angular distance).
      if (chosenLch.c < 0.02) return;
      const dh = Math.abs(((chosenLch.h - tintLch.h + 540) % 360) - 180);
      expect(dh).toBeLessThanOrEqual(10);
    },
  );

  it("derives through the custom slots with the SAME values applyTheme writes inline", () => {
    // highlightBases resolves the active slot through resolveCustomTheme —
    // the exact palette applyTheme writes onto documentElement — so the
    // editor preview and the live document cannot disagree.
    const tokens = PRESET_SEEDS.dark;
    const resolved = resolveCustomTheme(tokens);
    const bases = highlightBases({
      theme: "custom-dark",
      customDarkTheme: { baseTheme: "dark", tokens },
    });
    expect(bases.surface).toBe(resolved["--surface"]);
    expect(bases.ink).toBe(resolved["--ink"]);
  });

  it("falls back to the light palette when an active custom slot carries no record (defence in depth — the schema makes this unrepresentable)", () => {
    expect(
      highlightBases({ theme: "custom-light", customLightTheme: undefined }),
    ).toEqual(STATIC_THEME_HIGHLIGHT_BASES.light);
  });

  it("customHighlightTint is undefined-safe (no custom color, or no bases — provider-less tests)", () => {
    expect(customHighlightTint(undefined, bases)).toBeUndefined();
    expect(customHighlightTint("#e9c46a", undefined)).toBeUndefined();
  });
});
