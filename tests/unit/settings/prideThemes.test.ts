// tests/unit/settings/prideThemes.test.ts
// ADR 0006 — the specialty themes ("trans-light" / "bi-dark"), extended by
// ADR 0007 with the pamphlet rooms ("marxism-light" / "marxism-dark").
//
// Hand-authored [data-theme] blocks in src/app.css (NOT custom-slot
// derivations — there is no stored token record), so their palette contract
// is pinned the same way the preset highlights are: the literals are
// EXTRACTED from app.css and audited (the customTheme.test.ts /
// highlight-color-contrast.test.ts extraction-anchor discipline — a CSS
// token change that breaks a pair fails here, and a test change that
// forgets the CSS cannot pass because the values are read from the file).
//
// Policed pairs (the #146 chrome contract at the preset literals):
//   text   ≥ 4.5:1 — ink/surface, ink/surface-raised, ink-soft/surface,
//                    accent/surface, destructive/surface, ink on EVERY
//                    highlight fill (D5-14 × #118), board-text/board,
//                    board-text/lit, board-soft/board,
//                    board-text/accent-strong
//   rules  ≥ 3:1   — focus-ring/surface, brass on BOTH paper grounds,
//                    brass-bright/board
// Plus the lit board must stay DISTINGUISHABLE from the band (the One Lit
// Board rule cannot survive a lit fill identical to its ground) and the
// --flag-ribbon hook must be present with --progress-fill riding it (the
// ADR 0006 ribbon contract).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AA_TEXT_RATIO, contrastRatio } from "../../../src/settings/customTheme";

import { presetPaletteBlocks } from "./presetPalette";

const AA_NON_TEXT = 3;

/** Pull a `--token: <value>;` declaration out of a CSS block substring. */
function cssToken(css: string, from: number, to: number, prop: string): string {
  const block = css.slice(from, to);
  const m = new RegExp(`--${prop}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(block);
  if (!m?.[1]) throw new Error(`--${prop} not found in block`);
  return m[1];
}

describe("specialty themes — the palette contract (ADR 0006/0007)", () => {
  const css = readFileSync(resolve(process.cwd(), "src/app.css"), "utf-8");
  const blocks = Object.fromEntries(
    Object.entries(presetPaletteBlocks(css)).filter(([theme]) =>
      ["trans-light", "bi-dark", "marxism-light", "marxism-dark"].includes(theme),
    ),
  );

  for (const [theme, [from, to]] of Object.entries(blocks)) {
    it(`${theme}: every text pair ≥ 4.5:1`, () => {
      const t = {
        surface: cssToken(css, from, to, "surface"),
        surfaceRaised: cssToken(css, from, to, "surface-raised"),
        ink: cssToken(css, from, to, "ink"),
        inkSoft: cssToken(css, from, to, "ink-soft"),
        accent: cssToken(css, from, to, "accent"),
        accentStrong: cssToken(css, from, to, "accent-strong"),
        destructive: cssToken(css, from, to, "destructive"),
        highlight: cssToken(css, from, to, "highlight"),
        highlightYellow: cssToken(css, from, to, "highlight-yellow"),
        highlightGreen: cssToken(css, from, to, "highlight-green"),
        highlightBlue: cssToken(css, from, to, "highlight-blue"),
        highlightPink: cssToken(css, from, to, "highlight-pink"),
        spokenHighlight: cssToken(css, from, to, "spoken-highlight"),
        board: cssToken(css, from, to, "board"),
        boardText: cssToken(css, from, to, "board-text"),
        boardSoft: cssToken(css, from, to, "board-soft"),
        lit: cssToken(css, from, to, "lit"),
      };
      const textPairs: Array<[string, string, string]> = [
        [t.ink, t.surface, "ink/surface"],
        [t.ink, t.surfaceRaised, "ink/surface-raised"],
        [t.inkSoft, t.surface, "ink-soft/surface"],
        [t.accent, t.surface, "accent/surface"],
        [t.destructive, t.surface, "destructive/surface"],
        [t.ink, t.highlight, "ink/highlight"],
        [t.ink, t.highlightYellow, "ink/highlight-yellow"],
        [t.ink, t.highlightGreen, "ink/highlight-green"],
        [t.ink, t.highlightBlue, "ink/highlight-blue"],
        [t.ink, t.highlightPink, "ink/highlight-pink"],
        [t.ink, t.spokenHighlight, "ink/spoken-highlight"],
        [t.boardText, t.board, "board-text/board"],
        [t.boardText, t.lit, "board-text/lit"],
        [t.boardSoft, t.board, "board-soft/board"],
        [t.boardText, t.accentStrong, "board-text/accent-strong"],
      ];
      for (const [fg, bg, label] of textPairs) {
        expect(contrastRatio(fg, bg), `${theme} ${label}`).toBeGreaterThanOrEqual(AA_TEXT_RATIO);
      }
    });

    it(`${theme}: every rule pair ≥ 3:1 and the lit board stays distinguishable`, () => {
      const t = {
        surface: cssToken(css, from, to, "surface"),
        surfaceRaised: cssToken(css, from, to, "surface-raised"),
        board: cssToken(css, from, to, "board"),
        lit: cssToken(css, from, to, "lit"),
        focusRing: cssToken(css, from, to, "focus-ring"),
        brass: cssToken(css, from, to, "brass"),
        brassBright: cssToken(css, from, to, "brass-bright"),
      };
      expect(contrastRatio(t.focusRing, t.surface), "focus-ring/surface").toBeGreaterThanOrEqual(
        AA_NON_TEXT,
      );
      expect(
        Math.min(contrastRatio(t.brass, t.surface), contrastRatio(t.brass, t.surfaceRaised)),
        "brass on both paper grounds",
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);
      expect(contrastRatio(t.brassBright, t.board), "brass-bright/board").toBeGreaterThanOrEqual(
        AA_NON_TEXT,
      );
      // The One Lit Board rule: the lit fill must read as a STEP from the
      // band, not as the band itself (the presets sit near 1.3:1).
      expect(contrastRatio(t.lit, t.board), "lit vs board").toBeGreaterThanOrEqual(1.2);
    });

    if (theme === "marxism-dark") {
      it("marxism-dark: the article stays brighter than both navigation grounds", () => {
        const surface = cssToken(css, from, to, "surface");
        const board = cssToken(css, from, to, "board");
        const lit = cssToken(css, from, to, "lit");
        // Contrast against black increases monotonically with luminance.
        expect(contrastRatio(surface, "#000000")).toBeGreaterThan(
          contrastRatio(board, "#000000"),
        );
        expect(contrastRatio(surface, "#000000")).toBeGreaterThan(
          contrastRatio(lit, "#000000"),
        );
      });
    }

    it(`${theme}: the wash contract — one flag material, progress and underline ride it`, () => {
      const block = css.slice(from, to);
      expect(block).toMatch(/--flag-wash:\s*linear-gradient\(/);
      expect(block).toMatch(/--progress-fill:\s*var\(--flag-wash\)/);
      // The crisp hard-stop ribbon is gone (chunky color blocks at ribbon
      // scale, aliasing under scaleX compression) — the wash is the ONLY
      // flag material (ADR 0006).
      expect(block).not.toMatch(/--flag-ribbon/);
    });
  }
});
