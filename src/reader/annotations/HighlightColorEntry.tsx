// src/reader/annotations/HighlightColorEntry.tsx
// Issue #118 — the named highlight-color picker (the highlight's reader
// details surface, hosted by NotePopover beside the note + tags). The SAME
// fieldset + legend + control + StatusRegion anatomy as TagEntry: a native
// radio group (fieldset/legend supply the accessible grouping; arrow-key
// navigation + checked state are native — no ARIA re-implementation), one
// labelled pill per choice, commit-per-change write-through.
//
// A11Y-05 (color never the sole identifier): every pill carries its VISIBLE
// text label ("Default" / "Yellow" / …) plus a decorative swatch dot — the
// radio's checked state renders both natively and in forced-colors mode.
//
// Issue #196 — the vocabulary widens with a sixth state: when the record
// carries a custom color snapshot, a "Custom" pill renders checked with the
// DERIVED readable tint as its swatch (the same derivation every render
// surface uses — preview = render by construction), and the five named
// pills render unchecked. Picking any named pill commits through the ONE
// color seam, which clears the snapshot — direct color editing changes only
// color. The custom pill is a radio like the rest: native checked state,
// keyboard-operable, forced-colors safe.
//
// Not gated on isUnresolved: like tags, the color choice never depends on
// re-anchoring, so it stays editable on ambiguous/orphaned highlights (the
// note textarea keeps its D5-04 disabled state).
//
// Failure contract (the TagEntry discipline): saveColor (the
// updateHighlightColor hook path) classifies + routes to StorageBanner AND
// rethrows; this host catches the rethrow and surfaces the calm inline
// "Couldn't save color." copy in its own StatusRegion so the failure is
// announced INSIDE the modal popover (the banner behind the backdrop is
// not enough while the reader is mid-edit). The hook also ROLLS BACK the
// optimistic color on failure, so this fully-controlled picker's checked
// radio re-matches the persisted row — no divergent selection.
import { useState } from "react";
import type { HighlightColor } from "../../content/schema";
import { HIGHLIGHT_COLOR_CHOICES } from "../../annotations/highlightColors";
// Issue #196 — the derived tint for the Custom pill's swatch (the shared
// derivation; undefined outside the settings world keeps the Default fill).
import { customHighlightTint } from "../../settings/highlightTint";
import type { HighlightTintBases } from "../../settings/highlightTint";
// Issue #98 (decision #96) — the ONE polite status-region primitive.
import { StatusRegion } from "../../ui/StatusRegion";
// Issue #196 — the ONE Custom pill anatomy (shared with the slot editor).
import { CustomColorPill } from "./CustomColorPill";

interface HighlightColorEntryProps {
  /** The current color on the highlight's record ("default" hydration
   * handled by the schema — this prop is always a closed-set id). */
  color: HighlightColor;
  /**
   * Issue #196 — the record's custom color snapshot, when it carries one
   * (strict hex — the schema validated it). Presence swaps the checked pill
   * to "Custom" and paints its swatch with the derived readable tint.
   */
  customColor?: string;
  /**
   * Issue #196 — the active theme's surface + ink pair for the Custom
   * swatch's derivation. Optional: absent (unit tests) keeps the Default
   * fill fallback.
   */
  bases?: HighlightTintBases;
  /** Optional confirmation announced inside the picker after a successful write. */
  successCopy?: string;
  /**
   * Commit one color pick (routes through updateHighlightColor — the ONE
   * highlightsStore seam; the closure carries the highlight id). Rejects on
   * persistence failure (rethrow path). A named pick clears the custom
   * snapshot inside the seam — this picker never sends a hex.
   */
  saveColor: (color: HighlightColor) => Promise<void>;
}

/**
 * HighlightColorEntry — fieldset + legend + the radio pill row + a small
 * .status live region. Renders INSIDE NotePopover's edit view.
 */
export function HighlightColorEntry({
  color,
  customColor,
  bases,
  saveColor,
  successCopy,
}: HighlightColorEntryProps) {
  const [statusCopy, setStatusCopy] = useState<string | null>(null);
  const customTint = customHighlightTint(customColor, bases);

  async function commit(next: HighlightColor) {
    setStatusCopy(null);
    try {
      await saveColor(next);
      setStatusCopy(successCopy ?? null);
    } catch {
      // Dexie write failure — the row stays unchanged on disk and the hook
      // has rolled the optimistic color back, so the radio below re-matches
      // the persisted record. Calm voice.
      setStatusCopy("Couldn't save color.");
    }
  }

  return (
    <fieldset className="highlight-color-entry">
      <legend>Color</legend>
      <div className="highlight-color-picker">
        {HIGHLIGHT_COLOR_CHOICES.map((choice) => (
          <label
            key={choice.id}
            className={`highlight-color-choice${
              customColor === undefined && color === choice.id ? " selected" : ""
            }`}
          >
            <input
              type="radio"
              name="highlight-popover-color"
              value={choice.id}
              checked={customColor === undefined && color === choice.id}
              onChange={() => void commit(choice.id)}
              className="highlight-color-input"
            />
            {/* Decorative swatch — the text label + checked state carry the
                meaning; the dot is presentation only. */}
            <span
              className={`highlight-color-swatch highlight-color-swatch-${choice.id}`}
              aria-hidden="true"
            />
            <span className="highlight-color-label">{choice.label}</span>
          </label>
        ))}
        {/* Custom describes an existing snapshot; named-color records only
            offer choices that can actually be applied. */}
        {customColor !== undefined && (
          <CustomColorPill
            name="highlight-popover-color"
            checked
            onActivate={() => {}}
            tint={customTint}
          />
        )}
      </div>
      {/* Status region (A11Y-08 — save feedback is announced politely).
          Issue #98 — the ONE StatusRegion primitive, ALWAYS MOUNTED (a live
          region must exist before its content changes to announce reliably);
          idle it renders no children and the per-surface CSS collapses it. */}
      <StatusRegion>{statusCopy !== null && <p>{statusCopy}</p>}</StatusRegion>
    </fieldset>
  );
}
