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
import type { ReaderSettings } from "../content/schema";
import { FONT_STACKS, SPACING_PRESETS } from "./tokens";

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
}
