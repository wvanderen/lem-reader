// src/annotations/highlightColors.ts
// Issue #118 — the named highlight-color UI vocabulary. The CLOSED id set
// lives in src/content/schema.ts (HIGHLIGHT_COLOR_NAMES — the Zod enum's
// single source of truth); this module maps those ids to the human labels
// used by BOTH the aria-label derivation (InlineRenderer) and the picker
// (NotePopover), so a color is NEVER identified by color alone (A11Y-05 —
// the text label is always present in controls, always spoken for marks).
//
// Pure data — no DOM, no React. jsdom-safe.
import type { HighlightColor } from "../content/schema";

/** Display label per color id (title case, one word — calm chrome copy). */
export const HIGHLIGHT_COLOR_LABELS: Record<HighlightColor, string> = {
  default: "Default",
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  pink: "Pink",
};

/** The picker's ordered choice list: Default first (the no-change state),
 * then the four named colors in schema order. */
export const HIGHLIGHT_COLOR_CHOICES: ReadonlyArray<{
  id: HighlightColor;
  label: string;
}> = [
  { id: "default", label: HIGHLIGHT_COLOR_LABELS.default },
  { id: "yellow", label: HIGHLIGHT_COLOR_LABELS.yellow },
  { id: "green", label: HIGHLIGHT_COLOR_LABELS.green },
  { id: "blue", label: HIGHLIGHT_COLOR_LABELS.blue },
  { id: "pink", label: HIGHLIGHT_COLOR_LABELS.pink },
];
