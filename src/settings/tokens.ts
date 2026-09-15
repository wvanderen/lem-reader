// src/settings/tokens.ts
// Token maps for the four typography knobs (font family, size step, measure
// step, spacing preset). These are the closed sets that ReaderSettingsSchema
// enumerates — single source of truth for applyTheme + the SettingsPanel
// controls. The `serif` string MUST byte-match `--font-body` in app.css
// (lines 29–30) so the live-apply preview and the CSS default render
// identically on first paint.
//
// All stacks are SYSTEM-ONLY (no web fonts in Phase 2). D2-06 Option A: the
// dyslexia-friendly stack is a wide system-stack approximation (Verdana/
// Tahoma/Segoe UI/Geneva/sans-serif), font-load-safe — no `document.fonts.ready`
// gate required this phase.

export const FONT_STACKS = {
  serif:
    "'Iowan Old Style', 'Source Serif Pro', 'Source Serif 4', Georgia, Charter, 'Times New Roman', serif",
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  dyslexic: "Verdana, Tahoma, 'Segoe UI', Geneva, sans-serif", // D2-06 Option A — font-load-safe
} as const;

// D2-08 — line-height + letter/word-spacing are preset-internal only (set
// together); size and measure are independent stepped fine-tunes layered on
// top. `comfortable` is the D-07 default.
export const SPACING_PRESETS = {
  compact: { lineHeight: 1.4, letterSpacing: "0", wordSpacing: "0" },
  comfortable: { lineHeight: 1.6, letterSpacing: "0", wordSpacing: "0" }, // D-07 default
  spacious: { lineHeight: 1.8, letterSpacing: "0.01em", wordSpacing: "0.05em" },
} as const;

// D2-07 — stepped/discrete (arrow-key navigable, predictable, calm).
export const SIZE_STEPS = [16, 18, 20, 22, 24] as const; // px — index 1 (18) is the default
// D21-01/D21-02 (POLISH-09) + issue #18 (D22-01): the uniform step-6 ladder
// keeps the truthful 64 default and extends UPWARD to 88 — "give users
// freedom to increase column width even much more". The new maximum is a
// CONSCIOUS revision of the POLISH-09 decision, not a re-add of the lying
// 72 step: 88 = 40 + 6×8, so the range input's step-6 arithmetic stays
// exact and every stored value remains in-union. 72 is still NOT a step —
// a stored legacy-72 setting clamps calmly to the nearest lower step (70)
// at the read seams (legacyMeasure.ts, D21-03 as remapped by #18).
export const MEASURE_STEPS = [
  40, 46, 52, 58, 64, 70, 76, 82, 88,
] as const; // ch — index 4 (64) remains the default
