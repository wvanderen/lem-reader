// src/settings/defaults.ts
// The D-07 warm-paper baseline as a JS object — the JS mirror of the `:root`
// token block in src/app.css (lines 6–34) and the Reset target (D2-04).
// "Reset to defaults" sets SettingsContext state to this object and clears any
// persisted overrides. schemaVersion is the STATE-04 migration hook.
import type { ReaderSettings } from "../content/schema";

export const DEFAULT_SETTINGS: ReaderSettings = {
  schemaVersion: 1,
  font: "serif", // D-07 warm-paper serif
  size: 18, // D-07 default body size
  measure: 64, // D-07 calm measure
  spacing: "comfortable", // D-07 line-height 1.6
  theme: "sepia", // D-07 warm-paper == D2-09 default theme
};
