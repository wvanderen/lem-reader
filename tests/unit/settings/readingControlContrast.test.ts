// tests/unit/settings/readingControlContrast.test.ts
// Issue #192 — the reading-control contrast contract: the highlight-count
// badge and the reading-mode toggle sit ON the header board, so their colors
// must be the board voice, not the paper voice the Wayfinder re-skin
// (be3115e) otherwise migrated the band to.
//
// Two layers, the established extraction-anchor discipline (the
// customTheme.test.ts / prideThemes.test.ts pattern — a CSS token change that
// breaks a pair fails here, and a test change that forgets the CSS cannot
// pass because the values are read from the file):
//
//   1. PAIR MATH — the tokens the controls consume, extracted from every
//      preset [data-theme] block in src/app.css:
//        --board-soft/--board  ≥ 4.5:1  (badge TEXT + toggle rest glyph;
//                                        the 10px badge holds the text bar)
//        --board-text/--board  ≥ 4.5:1  (toggle hover/focus glyph)
//        --brass-bright/--board ≥ 3:1   (toggle pressed glyph — WCAG 1.4.11
//                                        non-text; the lit affordance)
//      Custom themes consume the SAME tokens; their derived pairs are
//      already policed by customTheme.test.ts (board-soft/board,
//      brass-bright/board, board-text/board), so no separate audit here.
//
//   2. SOURCE ANCHORS — the control rules in app.css must DECLARE those
//      tokens. Without this layer a quiet revert to --ink-soft/--accent
//      (the reported #192 defect) would pass every pair assertion that
//      happens to use the right literals while the controls stay faint.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AA_TEXT_RATIO, AA_NON_TEXT_RATIO, contrastRatio } from "../../../src/settings/customTheme";

import { presetPaletteBlocks } from "./presetPalette";

/** Slice the body of a top-level `selector { … }` rule out of app.css. */
function ruleBody(css: string, selector: string): string {
  const from = css.indexOf(`${selector} {`);
  if (from < 0) throw new Error(`Rule not found: ${selector}`);
  const open = css.indexOf("{", from);
  return css.slice(open + 1, css.indexOf("}", open));
}

function declaredColor(body: string, rule: string): string {
  const m = /(?:^|;)\s*color:\s*([^;]+);/.exec(body);
  if (!m?.[1]) throw new Error(`No color declaration in ${rule}`);
  return m[1].trim();
}

describe("reading-control contrast — the pair math (issue #192)", () => {
  const css = readFileSync(resolve(process.cwd(), "src/app.css"), "utf-8");
  const blocks = presetPaletteBlocks(css);

  for (const [theme, [from, to]] of Object.entries(blocks)) {
    it(`${theme}: the board-voice pairs the badge + toggle consume hold`, () => {
      const token = (prop: string): string => {
        const m = new RegExp(`--${prop}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css.slice(from, to));
        if (!m?.[1]) throw new Error(`--${prop} not found in ${theme}`);
        return m[1];
      };
      const board = token("board");
      // The badge is real text (the count) at 10px — the AA TEXT bar applies,
      // not the non-text one. The toggle's rest/hover glyph rides the same
      // secondary board token, so it clears the bar with room to spare.
      expect(
        contrastRatio(token("board-soft"), board),
        `${theme} board-soft/board (badge text, toggle rest)`,
      ).toBeGreaterThanOrEqual(AA_TEXT_RATIO);
      expect(
        contrastRatio(token("board-text"), board),
        `${theme} board-text/board (toggle hover/focus)`,
      ).toBeGreaterThanOrEqual(AA_TEXT_RATIO);
      // The pressed-state glyph is an icon (WCAG 1.4.11 non-text).
      expect(
        contrastRatio(token("brass-bright"), board),
        `${theme} brass-bright/board (toggle pressed)`,
      ).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO);
    });
  }
});

describe("reading-control contrast — the source anchors (issue #192)", () => {
  const css = readFileSync(resolve(process.cwd(), "src/app.css"), "utf-8");

  it("the badge declares --board-soft, never the paper-voice inks", () => {
    const body = ruleBody(css, ".annotations-trigger-badge");
    expect(declaredColor(body, ".annotations-trigger-badge")).toBe("var(--board-soft)");
    expect(body).not.toMatch(/var\(--ink-soft\)|var\(--accent\)/);
  });

  it("the mode toggle declares the board voice in every state", () => {
    expect(declaredColor(ruleBody(css, ".mode-toggle"), ".mode-toggle")).toBe("var(--board-soft)");
    expect(declaredColor(ruleBody(css, ".mode-toggle:hover"), ".mode-toggle:hover")).toBe(
      "var(--board-text)",
    );
    expect(
      declaredColor(ruleBody(css, '.mode-toggle[aria-pressed="true"]'), ".mode-toggle[pressed]"),
    ).toBe("var(--brass-bright)");
  });

  it("the mode toggle keeps its visible keyboard focus ring and a legible focused glyph", () => {
    const body = ruleBody(css, ".mode-toggle:focus-visible");
    expect(body).toMatch(/outline:\s*2px solid var\(--focus-ring\)/);
    // A keyboard-focused toggle must not dim to the (board-invisible) accent.
    expect(declaredColor(body, ".mode-toggle:focus-visible")).toBe("var(--board-text)");
  });

  it("the pressed state is declared AFTER hover/focus so the lit mode holds", () => {
    // Equal-specificity states resolve by source order — a re-order that
    // lets :hover/:focus-visible repaint the pressed toggle to --board-text
    // would blur the lit affordance silently.
    const hover = css.indexOf(".mode-toggle:hover {");
    const focus = css.indexOf(".mode-toggle:focus-visible {");
    const pressed = css.indexOf('.mode-toggle[aria-pressed="true"] {');
    expect(pressed).toBeGreaterThan(hover);
    expect(pressed).toBeGreaterThan(focus);
  });
});
