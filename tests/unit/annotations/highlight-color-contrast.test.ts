// tests/unit/annotations/highlight-color-contrast.test.ts
// Issue #118 — the named highlight-color vocabulary's AA guarantee.
//
// D5-14 extended: --ink on EVERY highlight fill (Default + the four named
// tokens) ≥ 4.5:1 in EVERY theme. Two layers of proof, both pure math:
//   1. PRESET themes — the literal tokens are extracted from src/app.css
//      (the customTheme.test.ts extraction-anchor discipline: a CSS token
//      change that breaks AA fails here, and a test change that forgets
//      the CSS cannot pass because the values are read from the file).
//   2. CUSTOM themes — resolveCustomTheme derives the four named fills
//      through the compliant lightness band; the same AA floor must hold
//      for every derivation seed family (light, dark, saturated, and the
//      degenerate broken ink/surface pair).
//
// The e2e layer proves the tokens reach the DOM; this file is the
// engine-independent truth that the palette can never undercut AA.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AA_TEXT_RATIO,
  CUSTOM_COLOR_PROPS,
  PRESET_SEEDS,
  contrastRatio,
  resolveCustomTheme,
} from "../../../src/settings/customTheme";
import { presetPaletteBlocks } from "../settings/presetPalette";
import { HIGHLIGHT_COLOR_NAMES } from "../../../src/content/schema";

/** The CSS custom property for one named color id ("default" → --highlight). */
function colorProp(color: string): string {
  return color === "default" ? "--highlight" : `--highlight-${color}`;
}

/** Pull a `--token: <value>;` declaration out of a CSS block substring. */
function cssToken(css: string, from: number, to: number, prop: string): string {
  const block = css.slice(from, to);
  const m = new RegExp(`${prop}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(block);
  if (!m?.[1]) throw new Error(`${prop} not found in block`);
  return m[1];
}

describe("preset themes — ink on every highlight fill ≥ 4.5:1 (D5-14 × #118)", () => {
  const css = readFileSync(resolve(process.cwd(), "src/app.css"), "utf-8");
  const blocks = presetPaletteBlocks(css);

  for (const [theme, [from, to]] of Object.entries(blocks)) {
    it.each(HIGHLIGHT_COLOR_NAMES)(`${theme}: ink on ${colorProp("%s")} fill ≥ 4.5:1`, (color) => {
      const ink = cssToken(css, from, to, "--ink");
      const fill = cssToken(css, from, to, colorProp(color));
      expect(contrastRatio(ink, fill)).toBeGreaterThanOrEqual(AA_TEXT_RATIO);
    });
  }

  it("every named token exists in every preset block (no forgotten theme)", () => {
    for (const [theme, [from, to]] of Object.entries(blocks)) {
      for (const color of HIGHLIGHT_COLOR_NAMES) {
        expect(() => cssToken(css, from, to, colorProp(color)), `${theme} ${color}`).not.toThrow();
      }
    }
  });
});

describe("custom themes — the derived named fills keep the same AA floor", () => {
  const seeds = [
    ...Object.entries(PRESET_SEEDS).map(([label, tokens]) => ({
      label: `preset ${label}`,
      tokens,
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
    },
    {
      label: "degenerate broken ink/surface pair",
      tokens: {
        surface: "#555555",
        surfaceRaised: "#666666",
        ink: "#444444",
        accent: "#556677",
        hairline: "#888888",
      },
    },
  ];

  for (const { label, tokens } of seeds) {
    it.each(HIGHLIGHT_COLOR_NAMES)(
      `${label}: ink on derived ${colorProp("%s")} ≥ 4.5:1`,
      (color) => {
        const resolved = resolveCustomTheme(tokens);
        const prop = colorProp(color) as keyof typeof resolved;
        expect(contrastRatio(resolved["--ink"], resolved[prop])).toBeGreaterThanOrEqual(
          AA_TEXT_RATIO,
        );
      },
    );
  }

  it("the four named props ride CUSTOM_COLOR_PROPS (applyTheme writes + removes them)", () => {
    for (const color of HIGHLIGHT_COLOR_NAMES.slice(1)) {
      expect(CUSTOM_COLOR_PROPS).toContain(colorProp(color));
    }
  });
});
