// src/settings/applyTheme.ts
// The live-apply mutator (D2-03): writes `data-theme` + the typography
// custom properties on documentElement so the article behind the SettingsPanel
// re-renders via ONE token swap. Called by SettingsContext on mount and on
// every settings change (the panel has no Save step — every control writes
// through immediately).
//
// Token routing (02-04 gap 2): applyTheme writes custom properties
// (--font-size, --line-height, --letter-spacing, --word-spacing, --font-body,
// --measure) on documentElement; the SECOND body rule in app.css (lines
// ~127-131 under "Base typography") consumes them via var() with literal
// first-paint fallbacks (18px / 1.6 / 0). The previously-bare font-size and
// line-height property writes were OVERRIDDEN by body's hardcoded values
// (CSS specificity: body { font-size: 18px } beats the inherited <html>
// value), so size and the line-height half of spacing never reached the
// text; the previously-dead --letter-spacing / --word-spacing writes are now
// consumed by the same body rule. --font-body and --measure already worked
// (consumed via var() in body { font-family: var(--font-body) } and
// .article-body { max-width: var(--measure) }) and stay byte-unchanged.
//
// Security (T-02-02 / Pitfall 9): every value derives from a Zod-validated
// enum/number (ReaderSettingsSchema). style.setProperty does NOT parse
// selectors, and dataset.theme is a data attribute, not HTML — there is no
// injection surface. The renderer already forbids dangerouslySetInnerHTML
// (Phase 1, react/no-danger — preserved).
//
// Issue #86 (decision #73) — the custom theme: when theme === "custom" the
// inline writes ARE the theme — applyTheme resolves the FULL 11-token
// palette (5 stored + 6 derived, src/settings/customTheme.ts) onto
// documentElement, because [data-theme="custom"] overrides no tokens in CSS
// (first paint before hydration paints the seeded :root defaults — accepted
// by decision #73). When the theme is a preset the SAME property list is
// REMOVED again, so the [data-theme] CSS blocks own the palette (inline
// writes would otherwise out-rank the stylesheet forever — one stale inline
// --surface would poison every later preset). A "custom" setting without a
// customTheme record (unrepresentable through the schema's superRefine, but
// defended here) takes the removal path: the :root palette paints, never a
// half-written theme.
import type { ReaderSettings } from "../content/schema";
import { FONT_STACKS, SPACING_PRESETS } from "./tokens";
import { CUSTOM_COLOR_PROPS, resolveCustomTheme } from "./customTheme";

export function applyTheme(s: ReaderSettings): void {
  const root = document.documentElement;
  root.dataset.theme = s.theme; // [data-theme] → token set (UI-SPEC §Color)
  root.style.setProperty("--font-body", FONT_STACKS[s.font]);
  root.style.setProperty("--font-size", `${s.size}px`); // body knob; headings are em-relative (UI-SPEC Dim 4)
  const preset = SPACING_PRESETS[s.spacing];
  root.style.setProperty("--line-height", String(preset.lineHeight));
  root.style.setProperty("--letter-spacing", preset.letterSpacing);
  root.style.setProperty("--word-spacing", preset.wordSpacing);
  root.style.setProperty("--measure", `${s.measure}ch`); // .article-body max-width
  // Issue #86 — the custom palette writes (or their removal, above).
  if (s.theme === "custom" && s.customTheme !== undefined) {
    const resolved = resolveCustomTheme(s.customTheme.tokens);
    for (const prop of CUSTOM_COLOR_PROPS) {
      root.style.setProperty(prop, resolved[prop]);
    }
  } else {
    for (const prop of CUSTOM_COLOR_PROPS) {
      root.style.removeProperty(prop);
    }
  }
}
