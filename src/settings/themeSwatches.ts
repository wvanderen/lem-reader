// src/settings/themeSwatches.ts
// The theme-menu swatch palette (the SettingsPanel Theme shelves): the four
// colors each theme is recognized by, resolved per theme literal.
//
// The four tokens are the room's palette story, shown as EQUAL blocks (a
// standard palette chip — no page-layout miniature): the ground
// (`--surface`), the interactive color (`--accent` — the hue light rooms
// deepen and dark rooms lighten, so Night reads green through #7cc7a1, not
// through its near-black band), the enamel chrome (`--board`), and the
// room's metal (`--brass` — the paper-register metal whose hue carries the
// specialty rooms' identities). Equal weight per block is the point: a
// facade miniature lets the darkest token dominate, which is exactly how
// Night's chip came to read darker than the room it names.
//
// The chip is IDENTITY, never meaning — the row's visible label carries the
// name (the A11Y-05 rule the custom-theme builder already speaks: a swatch
// never names a theme alone), and the checked state stays the radio glyph's
// job.
//
// Single-source-of-truth discipline (the PRESET_SEEDS pattern): the preset
// values below BYTE-MATCH the [data-theme] blocks in src/app.css. Drift is
// pinned by tests/unit/settings/themeSwatches.test.ts (the app.css
// byte-match), so a palette edit that forgets this map fails CI. The two
// custom slots never drift — their swatch resolves LIVE from the stored
// token record through resolveCustomTheme (the same derivation applyTheme
// paints), so a reader-built room's chip always shows the reader's palette.
//
// Security: the values are either this module's hex literals or
// resolveCustomTheme output (validated hex, the applyTheme.ts posture) —
// they reach the DOM only as CSS custom properties on a decorative span.
import type { ReaderSettings } from "../content/schema";
import { SLOT_BASE_THEME, activeSlotTheme, resolveCustomTheme } from "./customTheme";

/** The four palette colors a theme-menu swatch shows as equal blocks. */
export interface ThemeSwatch {
  surface: string;
  accent: string;
  board: string;
  metal: string;
}

/** The preset theme literals (the schema's theme union minus the two
 * independently stored custom slots). */
export type PresetThemeLiteral = Exclude<
  ReaderSettings["theme"],
  "custom-light" | "custom-dark"
>;

/**
 * The preset themes' swatches, byte-matching the [data-theme] blocks in
 * src/app.css (drift-guarded by tests/unit/settings/themeSwatches.test.ts).
 */
export const PRESET_SWATCHES: Record<PresetThemeLiteral, ThemeSwatch> = {
  light: { surface: "#f7f7f5", accent: "#22604a", board: "#1d3128", metal: "#8a6a24" },
  sepia: { surface: "#f0e8d5", accent: "#1f5c44", board: "#1d3128", metal: "#7d5f1e" },
  dark: { surface: "#141a17", accent: "#7cc7a1", board: "#10150f", metal: "#c9a24e" },
  "trans-light": { surface: "#f2f8fb", accent: "#166093", board: "#14374e", metal: "#a13a62" },
  "bi-dark": { surface: "#171122", accent: "#e589c2", board: "#120c20", metal: "#bb92de" },
  "marxism-light": { surface: "#f8f3f1", accent: "#a01c2e", board: "#3f141b", metal: "#8f3d33" },
  "marxism-dark": { surface: "#1b1d1f", accent: "#e57373", board: "#0b0103", metal: "#d98b87" },
};

/**
 * The swatch for any theme literal. Presets come from the byte-matched map;
 * the custom slots resolve LIVE from the slot's stored record (derive +
 * stored edits — the exact palette applyTheme paints), so a reader-edited
 * theme shows the reader's own colors the moment they are saved. A slot
 * without a record is unrepresentable through the schema (superRefine), but
 * defended here with the slot's base-preset seed rather than a crash.
 */
export function themeSwatch(
  theme: ReaderSettings["theme"],
  settings: Pick<ReaderSettings, "theme" | "customLightTheme" | "customDarkTheme">,
): ThemeSwatch {
  if (theme === "custom-light" || theme === "custom-dark") {
    // The defended fallback is the slot's OWN seed base (SLOT_BASE_THEME) —
    // the same preset the slot seeds from on first activation.
    const record = activeSlotTheme({ ...settings, theme });
    if (record === undefined) {
      return PRESET_SWATCHES[theme === "custom-light" ? SLOT_BASE_THEME["custom-light"] : SLOT_BASE_THEME["custom-dark"]];
    }
    const resolved = resolveCustomTheme(record.tokens);
    return {
      surface: resolved["--surface"],
      accent: resolved["--accent"],
      board: resolved["--board"],
      metal: resolved["--brass"],
    };
  }
  return PRESET_SWATCHES[theme];
}
