// src/settings/highlightTint.ts
// Issue #196 — the ACTIVE-theme base pair (surface + ink) the custom
// highlight tints derive against. The tint math itself lives in
// customTheme.ts (readableHighlightTint — the ONE derivation both the slot
// editor's preview and every render surface call); this module answers
// "which surface and ink is the reader's theme currently made of" from the
// settings record alone — no DOM reads, jsdom-safe, deterministic.
//
//   - STATIC_THEME_HIGHLIGHT_BASES mirrors the seven hand-authored
//     [data-theme] palette blocks in src/app.css byte-for-byte (the
//     PRESET_SEEDS extraction-anchor discipline: a CSS token change that
//     forgets this map fails the pin test in
//     tests/unit/settings/highlightTint.test.ts, and a test change that
//     forgets the CSS cannot pass because the pin reads the file).
//   - The two custom slots resolve through resolveCustomTheme — the same
//     derivation applyTheme writes inline, so the bases match the live
//     document by construction (the preview/render consistency contract).
//
// Pure data + pure resolvers — no DOM. The one React touch is the optional
// inline-style helper's TYPE (CSSProperties); every value it returns is a
// plain hex string under the custom property name the CSS consumes.
import type { CSSProperties } from "react";
import type { HighlightSlot, ReaderSettings } from "../content/schema";
import { readableHighlightTint, resolveCustomTheme } from "./customTheme";

/** The surface + ink pair a highlight tint is derived against. */
export interface HighlightTintBases {
  surface: string;
  ink: string;
}

/**
 * The seven STATIC themes' surface + ink literals (issue #196) — byte-matching
 * the [data-theme] blocks in src/app.css. The custom slots are absent here
 * deliberately: their palette is DERIVED (resolveCustomTheme), never literal.
 */
export const STATIC_THEME_HIGHLIGHT_BASES: Record<
  Exclude<ReaderSettings["theme"], "custom-light" | "custom-dark">,
  HighlightTintBases
> = {
  sepia: { surface: "#f0e8d5", ink: "#241f16" },
  light: { surface: "#f7f7f5", ink: "#1c1f1d" },
  dark: { surface: "#141a17", ink: "#e6e9e4" },
  "trans-light": { surface: "#f2f8fb", ink: "#16232e" },
  "bi-dark": { surface: "#171122", ink: "#ece4f4" },
  "marxism-light": { surface: "#f8f3f1", ink: "#241a17" },
  "marxism-dark": { surface: "#1b1d1f", ink: "#eceeee" },
};

/**
 * The ACTIVE theme's base pair (issue #196). A custom slot resolves through
 * the SAME derivation applyTheme writes inline (preview = live document);
 * every static theme reads its pinned literal. Accepts the narrow settings
 * slice the derivation needs so callers can pass a context value directly.
 */
export function highlightBases(
  s: Pick<ReaderSettings, "theme" | "customLightTheme" | "customDarkTheme">,
): HighlightTintBases {
  if (s.theme === "custom-light" || s.theme === "custom-dark") {
    const active = s.theme === "custom-light" ? s.customLightTheme : s.customDarkTheme;
    // The schema's superRefine makes "active slot without its record"
    // unrepresentable; defence in depth falls back to the daylight default
    // palette (never a crash — the tint still derives compliantly).
    if (active) {
      const resolved = resolveCustomTheme(active.tokens);
      return { surface: resolved["--surface"], ink: resolved["--ink"] };
    }
    return STATIC_THEME_HIGHLIGHT_BASES.light;
  }
  return STATIC_THEME_HIGHLIGHT_BASES[s.theme];
}

/**
 * The derived readable tint for one chosen hex in the active theme (issue
 * #196) — the single seam every custom-color paint site calls (marks carry
 * it under --highlight-custom; swatches paint it directly). Undefined-safe:
 * no custom color (or no bases — tests outside the settings world) yields
 * undefined and the site falls back to its named/Default rendering.
 */
export function customHighlightTint(
  customColor: string | undefined,
  bases: HighlightTintBases | undefined,
): string | undefined {
  if (customColor === undefined || bases === undefined) return undefined;
  return readableHighlightTint(customColor, bases.surface, bases.ink);
}

/**
 * The armed-hold selection tint for one slot (issue #220): the CSS value the
 * reading root carries under `--held-slot-tint` while a slot number arms a
 * pointer gesture, painted onto the native selection through the root's
 * `::selection` rule. Same derivation as the mark, so the release is
 * visually seamless: a named fill references its theme token (re-reads on a
 * theme switch exactly like `mark.highlight.color-*`); a custom color
 * derives its readable tint against the ACTIVE bases (the ONE
 * readableHighlightTint seam). No bases (provider-less tests) falls back to
 * the Default token — the mark's own CSS fallback contract.
 */
export function slotSelectionTint(
  slot: Pick<HighlightSlot, "color" | "customColor">,
  bases?: HighlightTintBases,
): string {
  if (slot.customColor !== undefined) {
    return customHighlightTint(slot.customColor, bases) ?? "var(--highlight)";
  }
  switch (slot.color) {
    case "yellow":
      return "var(--highlight-yellow)";
    case "green":
      return "var(--highlight-green)";
    case "blue":
      return "var(--highlight-blue)";
    case "pink":
      return "var(--highlight-pink)";
    default:
      return "var(--highlight)";
  }
}

/**
 * The inline style a custom-color mark carries (issue #196): the derived
 * tint under the ONE custom property the `mark.highlight.color-custom` CSS
 * rule consumes. The mark keeps its named/Default fallback when the tint is
 * undefined (no custom color, or no bases in provider-less tests — the CSS
 * fallback fill is readable in every theme by D5-14). Both render twins
 * (InlineRenderer + BlockRenderer's code mark) call this verbatim — the
 * --highlight-custom key is spelled exactly once.
 */
export function tintMarkStyle(tint: string | undefined): CSSProperties | undefined {
  return tint === undefined ? undefined : ({ "--highlight-custom": tint } as CSSProperties);
}

/**
 * The record→render-threading fields for a custom color snapshot (issue
 * #196) — the ONE spelling of the conditional spread every mapping site
 * (BlockRenderer's context walk + PaginatedSurface's paginated twin) uses:
 * both fields ride together or neither does. `customColor` feeds the shared
 * mark traits (the color-custom modifier + the Custom label); `tint` is the
 * derived readable paint.
 */
export function customSnapshotFields(
  customColor: string | undefined,
  bases: HighlightTintBases | undefined,
): { customColor: string; tint: string | undefined } | {} {
  if (customColor === undefined) return {};
  return {
    customColor,
    // No bases (provider-less tests) keeps the trait but drops the paint —
    // the CSS fallback fill owns it, exactly the tintMarkStyle contract.
    tint:
      bases === undefined
        ? undefined
        : readableHighlightTint(customColor, bases.surface, bases.ink),
  };
}
