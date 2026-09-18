// src/settings/defaults.ts
// The D-07 warm-paper baseline as a JS object — the JS mirror of the `:root`
// token block in src/app.css (lines 6–34) and the Reset target (D2-04).
// "Reset to defaults" sets SettingsContext state to this object and clears any
// persisted overrides. schemaVersion is the STATE-04 migration hook.
import type { ReaderSettings } from "../content/schema";

export const DEFAULT_SETTINGS: ReaderSettings = {
  // Issue #40 — the read-aloud preferences (voice + rate) bump the canonical
  // write version 2 → 3. voice stays undefined (the platform default voice —
  // the honest default until the reader picks one) and rate defaults to the
  // schema's 1× multiplier; both are applied to playback by the read-aloud
  // engine (the Reading-settings controls arrive with the completion ticket).
  schemaVersion: 3, // STATE-04 — bumped from 2 → 3 in issue #40
  font: "serif", // D-07 warm-paper serif
  size: 18, // D-07 default body size
  measure: 64, // D-07 calm measure
  spacing: "comfortable", // D-07 line-height 1.6
  theme: "sepia", // D-07 warm-paper == D2-09 default theme
  animatePageTurns: false,
  readingMode: "paginated", // D4-12 — paginated default per PROJECT.md
  voice: undefined, // read-aloud: the platform default voice
  rate: 1, // read-aloud: the 1× speech rate multiplier
};
