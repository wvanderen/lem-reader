// src/reader/annotations/HighlightSlotEntry.tsx
// Issue #195 — the "Apply slot" section of the annotation panel (hosted by
// NotePopover beside the color picker + tags). One labeled button per
// settings slot: activating changes the highlight's color to the slot's AND
// adds the slot's tags WITHOUT removing existing ones (the additive union —
// the selection toolbar's slot row is the creation-side twin). Direct color
// editing stays the color picker's job: it changes ONLY color.
//
// The SAME fieldset + legend + StatusRegion anatomy as HighlightColorEntry:
// number + name identify the slot (color never the sole identifier,
// A11Y-05); the swatch is decorative. Not gated on isUnresolved — like the
// color picker and tags, applying a slot never depends on re-anchoring.
//
// Failure contract (the HighlightColorEntry discipline): onApply (the
// updateHighlightTags + updateHighlightColor hook paths) classifies + routes
// to StorageBanner AND rethrows; this host catches the rethrow and surfaces
// the calm inline "Couldn't apply slot." copy in its own StatusRegion. Each
// failed write rolled its own optimistic field back, so the panel re-matches
// the persisted rows — no divergent state.
import { useState } from "react";
import type { HighlightSlot } from "../../content/schema";
// Issue #98 (decision #96) — the ONE polite status-region primitive.
import { StatusRegion } from "../../ui/StatusRegion";

interface HighlightSlotEntryProps {
  /** The settings' five numbered slots (issue #195). */
  slots: HighlightSlot[];
  /**
   * Apply one slot to the open highlight: change color + add the slot's
   * tags (existing tags preserved). Rejects on persistence failure
   * (rethrow path) — the hook routed the failure and rolled the optimistic
   * fields back before this resolves.
   */
  onApply: (slot: HighlightSlot) => Promise<void>;
}

/**
 * HighlightSlotEntry — fieldset + legend + one labeled button per slot + a
 * small .status live region. Renders INSIDE NotePopover's edit view.
 */
export function HighlightSlotEntry({ slots, onApply }: HighlightSlotEntryProps) {
  const [statusCopy, setStatusCopy] = useState<string | null>(null);

  async function commit(slot: HighlightSlot) {
    setStatusCopy(null);
    try {
      await onApply(slot);
      setStatusCopy("Slot applied.");
    } catch {
      // Dexie write failure — each hook path rolled its optimistic field
      // back, so the panel re-matches the persisted rows. Calm voice.
      setStatusCopy("Couldn't apply slot.");
    }
  }

  return (
    <fieldset className="highlight-slot-entry">
      <legend>Apply slot</legend>
      <div className="highlight-slot-picker">
        {slots.map((slot, i) => (
          <button
            key={`${i}-${slot.name}`}
            type="button"
            className="highlight-slot-choice"
            aria-label={`Apply slot ${i + 1}: ${slot.name}`}
            onClick={() => void commit(slot)}
          >
            <span
              className={`highlight-color-swatch highlight-color-swatch-${slot.color}`}
              aria-hidden="true"
            />
            <span className="highlight-slot-number" aria-hidden="true">
              {i + 1}
            </span>
            <span className="highlight-slot-name">{slot.name}</span>
          </button>
        ))}
      </div>
      {/* Status region (A11Y-08 — save feedback is announced politely).
          Issue #98 — the ONE StatusRegion primitive, ALWAYS MOUNTED; idle it
          renders no children and the per-surface CSS collapses it. */}
      <StatusRegion>{statusCopy !== null && <p>{statusCopy}</p>}</StatusRegion>
    </fieldset>
  );
}
