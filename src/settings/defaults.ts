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
  // Issue #115 — the library sort preference bumps the canonical write
  // version 3 → 4.
  // Issue #120 — the independent Custom light / Custom dark slots bump the
  // canonical write version 4 → 5. Neither slot is set by default (the
  // D-07 sepia baseline carries no custom record; a slot's record appears
  // on first activation or when the #120 migration places one).
  // Issue #163 — the remembered "Open after adding" add-dialog preference
  // bumps the canonical write version 5 → 6. Checked by default: opening
  // what you just added is the expectation a first-run reader brings;
  // unchecking it is the deliberate quiet-add choice, remembered hereafter.
  schemaVersion: 6, // STATE-04 — bumped from 5 → 6 in issue #163
  font: "serif", // D-07 warm-paper serif
  size: 18, // D-07 default body size
  measure: 64, // D-07 calm measure
  spacing: "comfortable", // D-07 line-height 1.6
  theme: "light", // ADR 0005 — Daylight is the default; "sepia" remains the
  // stored value for the Warm paper theme, so persisted settings survive
  animatePageTurns: false,
  readingMode: "paginated", // D4-12 — paginated default per PROJECT.md
  voice: undefined, // read-aloud: the platform default voice
  rate: 1, // read-aloud: the 1× speech rate multiplier
  librarySort: "recently-added", // #115 — the shipped pre-control order (#114)
  openAfterAdd: true, // #163 — successful ingestion opens the item (books at
  // their first readable chapter); unchecking remembers the quiet add.
};
