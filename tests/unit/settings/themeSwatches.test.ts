// tests/unit/settings/themeSwatches.test.ts
// The theme-menu swatch drift guard (the PRESET_SEEDS pattern): the preset
// swatches in src/settings/themeSwatches.ts must BYTE-MATCH the
// [data-theme] blocks in src/app.css for the four palette tokens
// (--surface, --accent, --board, --brass). A palette edit that forgets the
// swatch map fails here, so the SettingsPanel chips can never quietly
// disagree with the themes they name. The custom slots are NOT pinned —
// they resolve live from the stored record (no CSS to drift against).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PRESET_SWATCHES, themeSwatch } from "../../../src/settings/themeSwatches";

/** Pull a `--token: <value>;` declaration out of a CSS block substring. */
function cssToken(css: string, from: number, to: number, prop: string): string {
  const block = css.slice(from, to);
  const m = new RegExp(`--${prop}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(block);
  if (!m?.[1]) throw new Error(`--${prop} not found in block`);
  return m[1];
}

describe("PRESET_SWATCHES byte-match src/app.css (drift guard)", () => {
  const css = readFileSync(resolve(process.cwd(), "src/app.css"), "utf-8");

  // Block order in app.css: sepia → light → dark → trans-light → bi-dark →
  // marxism-light → marxism-dark, then the combined .shell-nav selectors
  // reuse [data-theme=…]. indexOf() lands on each BLOCK (the first
  // occurrence of each literal selector); each block's end is the next
  // block's start. Keep this map in sync with app.css.
  const sepiaStart = css.indexOf('[data-theme="sepia"]');
  const lightStart = css.indexOf('[data-theme="light"]');
  const darkStart = css.indexOf('[data-theme="dark"]');
  const transStart = css.indexOf('[data-theme="trans-light"]');
  const biStart = css.indexOf('[data-theme="bi-dark"]');
  const marxismLightStart = css.indexOf('[data-theme="marxism-light"]');
  const marxismDarkStart = css.indexOf('[data-theme="marxism-dark"]');
  // The next [data-theme= occurrence after the marxism-dark block is the
  // combined rule set — safely past the block's own declarations.
  const marxismDarkEnd = css.indexOf("[data-theme=", marxismDarkStart + 12);

  expect(sepiaStart).toBeGreaterThan(-1);
  expect(lightStart).toBeGreaterThan(sepiaStart);
  expect(darkStart).toBeGreaterThan(lightStart);
  expect(transStart).toBeGreaterThan(darkStart);
  expect(biStart).toBeGreaterThan(transStart);
  expect(marxismLightStart).toBeGreaterThan(biStart);
  expect(marxismDarkStart).toBeGreaterThan(marxismLightStart);
  expect(marxismDarkEnd).toBeGreaterThan(marxismDarkStart);

  const blocks = {
    sepia: [sepiaStart, lightStart] as const,
    light: [lightStart, darkStart] as const,
    dark: [darkStart, transStart] as const,
    "trans-light": [transStart, biStart] as const,
    "bi-dark": [biStart, marxismLightStart] as const,
    "marxism-light": [marxismLightStart, marxismDarkStart] as const,
    "marxism-dark": [marxismDarkStart, marxismDarkEnd] as const,
  };

  for (const [theme, [from, to]] of Object.entries(blocks)) {
    it(`swatch "${theme}" matches its app.css block for all 4 palette tokens`, () => {
      const swatch = PRESET_SWATCHES[theme as keyof typeof PRESET_SWATCHES];
      const expected = {
        surface: cssToken(css, from, to, "surface"),
        accent: cssToken(css, from, to, "accent"),
        board: cssToken(css, from, to, "board"),
        metal: cssToken(css, from, to, "brass"),
      };
      expect(swatch).toEqual(expected);
    });
  }
});

// The custom slots resolve LIVE from the stored record: an edited token
// shows in the swatch the moment it is stored (the chip paints the reader's
// room, not the seed). Pins the resolver wiring, not the derivation itself
// (that contract is customTheme.test.ts's).
describe("themeSwatch — the custom slots resolve from the stored record", () => {
  const baseSettings = {
    theme: "custom-light" as const,
    customLightTheme: {
      baseTheme: "light" as const,
      tokens: {
        surface: "#123456",
        surfaceRaised: "#234567",
        ink: "#f0f0f0",
        accent: "#345678",
        hairline: "#456789",
      },
    },
  };

  it("custom-light paints the STORED surface and accent tokens, not the seed", () => {
    const swatch = themeSwatch("custom-light", baseSettings);
    expect(swatch.surface).toBe("#123456");
    expect(swatch.accent).toBe("#345678");
  });

  it("an empty slot falls back to its seed base (defensive — unrepresentable through the schema)", () => {
    const swatch = themeSwatch("custom-dark", { theme: "custom-dark" });
    expect(swatch).toEqual(PRESET_SWATCHES.dark);
  });
});
