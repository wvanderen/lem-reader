// src/annotations/highlightColors.ts
// Issue #118 — the named highlight-color UI vocabulary. The CLOSED id set
// lives in src/content/schema.ts (HIGHLIGHT_COLOR_NAMES — the Zod enum's
// single source of truth); this module maps those ids to the human labels
// used by BOTH the aria-label derivation (prose + code marks) and the picker
// (NotePopover), so a color is NEVER identified by color alone (A11Y-05 —
// the text label is always present in controls, always spoken for marks).
//
// Pure data + two pure string helpers — no DOM, no React. jsdom-safe.
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
 * Issue #196 — the ONE spoken/visible name of a highlight's color STATE
 * ("Default" … "Pink", or "Custom" when the record carries a custom color
 * snapshot). Shared by the review row's "Change color, currently …" name and
 * the picker's custom pill so the two surfaces cannot drift (A11Y-05 — the
 * state is never conveyed by the tint alone).
 */
export function highlightStateLabel(color: HighlightColor, customColor?: string): string {
  return customColor !== undefined ? "Custom" : HIGHLIGHT_COLOR_LABELS[color];
}

/**
 * The mark traits BOTH render surfaces (the InlineRenderer prose path + the
 * BlockRenderer code path) share — one bundled type instead of positional
 * parameter shuttling. `status` is the D5-02 tri-state; the `unresolved`
 * outline modifier derives from it inside the helpers below.
 */
export interface HighlightMarkTraits {
  /** The named color choice (issue #118); "default" renders bare. */
  color: HighlightColor;
  /**
   * Issue #196 — present when the highlight carries a custom color snapshot.
   * Wins over `color` at every render site: the mark takes the `color-custom`
   * modifier (its tint arrives under --highlight-custom as an inline style)
   * and the label says "Custom". The named `color` stays the closed-set
   * fallback (older clients, the picker's named radios).
   */
  customColor?: string;
  /** Whether a note is attached (the dotted-underline modifier). */
  hasNote: boolean;
  /** D5-02 tri-state: ambiguous/orphan render the dashed outline. */
  status: "confident" | "ambiguous" | "orphan";
}

/**
 * The <mark> modifier-class string shared by BOTH render surfaces —
 * `"highlight"` / `"highlight color-green has-note"`. Default renders bare,
 * hasNote/unresolved append their shape-distinct modifiers (A11Y-05 — the
 * states stay distinguishable by SHAPE alone). Issue #196: a custom color
 * snapshot replaces the named modifier with `color-custom` — the readable
 * tint rides the element's --highlight-custom inline style, and the CSS rule
 * falls back to the Default fill when the style is absent (provider-less
 * tests; forced colors collapse every fill regardless).
 */
export function highlightClassName(traits: HighlightMarkTraits): string {
  const unresolved = traits.status !== "confident";
  const colorModifier =
    traits.customColor !== undefined
      ? " color-custom"
      : traits.color !== "default"
        ? ` color-${traits.color}`
        : "";
  return `highlight${colorModifier}${traits.hasNote ? " has-note" : ""}${unresolved ? " unresolved" : ""}`;
}

/**
 * The aria-label for a highlighted mark (UI-SPEC §Copywriting), shared by
 * BOTH render surfaces (one copy site for the contract; the excerpt is the
 * mark's own text capped at 80 chars).
 * Confident: "Highlight: {excerpt}" / "Highlight with note: {excerpt}".
 * Ambiguous: "Highlight that couldn't be matched: {excerpt}" (D5-04 —
 *   the reader is told the anchor is uncertain so they understand the
 *   dashed-outline marker + the disabled drawer jump).
 * Orphan: "Highlight that couldn't be relocated: {excerpt}".
 * A NAMED color (issue #118) prefixes its display name — "Yellow
 * highlight: …" — so the choice is never conveyed by color alone.
 */
export function highlightAriaLabelForText(text: string, traits: HighlightMarkTraits): string {
  const excerpt = text.slice(0, 80);
  // Issue #118 — a NAMED color prefixes its display name ("Yellow
  // highlight: …"); Default keeps the calm unprefixed copy byte-unchanged.
  // Issue #196 — a custom color snapshot reads "Custom highlight: …" (the
  // tint itself is visual; the label is never the identifier alone).
  const base =
    traits.customColor !== undefined
      ? "Custom highlight"
      : traits.color === "default"
        ? "Highlight"
        : `${HIGHLIGHT_COLOR_LABELS[traits.color]} highlight`;
  if (traits.status === "ambiguous") {
    return `${base} that couldn't be matched: ${excerpt}`;
  }
  if (traits.status === "orphan") {
    return `${base} that couldn't be relocated: ${excerpt}`;
  }
  return `${base}${traits.hasNote ? " with note" : ""}: ${excerpt}`;
}
