// src/settings/applyTheme.ts
// The live-apply mutator (D2-03): writes `data-theme` + the four typography
// custom properties on documentElement so the article behind the SettingsPanel
// re-renders via ONE token swap. Called by SettingsContext on mount and on
// every settings change (the panel has no Save step — every control writes
// through immediately).
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
  root.style.setProperty("font-size", `${s.size}px`); // body knob; headings are em-relative (UI-SPEC Dim 4)
  const preset = SPACING_PRESETS[s.spacing];
  root.style.setProperty("line-height", String(preset.lineHeight));
  root.style.setProperty("--letter-spacing", preset.letterSpacing);
  root.style.setProperty("--word-spacing", preset.wordSpacing);
  root.style.setProperty("--measure", `${s.measure}ch`); // .article-body max-width
}
