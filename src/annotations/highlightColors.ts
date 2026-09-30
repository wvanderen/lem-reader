// src/annotations/highlightColors.ts
// Issue #118 — the named highlight-color UI vocabulary. The CLOSED id set
// lives in src/content/schema.ts (HIGHLIGHT_COLOR_NAMES — the Zod enum's
// single source of truth); this module maps those ids to the human labels
// used by BOTH the aria-label derivation (InlineRenderer) and the picker
// (NotePopover), so a color is NEVER identified by color alone (A11Y-05 —
// the text label is always present in controls, always spoken for marks).
//
// Pure data + one pure string helper — no DOM, no React. jsdom-safe.
import type { HighlightColor } from "../content/schema";
import { HIGHLIGHT_COLOR_NAMES } from "../content/schema";

/** Display label per color id (title case, one word — calm chrome copy). */
export const HIGHLIGHT_COLOR_LABELS: Record<HighlightColor, string> = {
  default: "Default",
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  pink: "Pink",
};

/** The picker's ordered choice list: Default first (the no-change state),
 * then the four named colors in schema order — DERIVED from the closed
 * names + labels so the vocabulary is enumerated exactly once. */
export const HIGHLIGHT_COLOR_CHOICES: ReadonlyArray<{
  id: HighlightColor;
  label: string;
}> = HIGHLIGHT_COLOR_NAMES.map((id) => ({
  id,
  label: HIGHLIGHT_COLOR_LABELS[id],
}));

/**
 * The <mark> modifier-class string shared by BOTH render surfaces (the
 * InlineRenderer prose path + the BlockRenderer code path — the
 * highlightAriaLabelForText discipline applied to the className). Pure:
 * `"highlight"` / `"highlight color-green has-note"` — Default renders
 * bare, hasNote/unresolved append their shape-distinct modifiers (A11Y-05).
 */
export function highlightClassName(
  color: HighlightColor,
  hasNote: boolean,
  unresolved: boolean,
): string {
  return `highlight${color !== "default" ? ` color-${color}` : ""}${hasNote ? " has-note" : ""}${unresolved ? " unresolved" : ""}`;
}
