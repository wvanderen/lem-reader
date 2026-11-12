// src/reader/annotations/HighlightSlotEntry.tsx
// Issue #222 — the ONE color control of the annotation panel (and the review
// color dialog): ONE row of five slot pills in the color-pill anatomy
// (swatch + number + name). The old named-color picker (HighlightColorEntry,
// issue #118) and the separate "Apply slot" row (issue #195) are gone — the
// five slots are THE color vocabulary everywhere a highlight's color is
// chosen.
//
// The pills are ACTION BUTTONS, not radios: no checked/current state (a
// record's color may match no slot), no inert Custom pill. Activating one
// applies the slot through the ONE applyHighlightSlot seam — the highlight's
// color changes to the slot's ACTIVE source (a dormant hex never paints) and
// the slot's tags JOIN the existing ones, never remove (the additive union).
//
// Success is the visible color + tag change itself — there is no "Slot
// applied." status card (the field-feedback round: the panel was too tall).
// Failure keeps the TagEntry discipline: onApply classifies + routes to
// StorageBanner AND rethrows; this host catches the rethrow and surfaces the
// calm inline "Couldn't apply slot." copy in its own StatusRegion so the
// failure is announced INSIDE the modal surface. Each failed write rolled
// its own optimistic field back, so the panel re-matches the persisted rows.
//
// Not gated on isUnresolved: like tags, applying a slot never depends on
// re-anchoring, so it stays editable on ambiguous/orphaned highlights.
import { useId, useState } from "react";
import { useActionInspection } from "./useActionInspection";
import type { HighlightSlot } from "../../content/schema";
// Issue #98 (decision #96) — the ONE polite status-region primitive.
import { StatusRegion } from "../../ui/StatusRegion";
// Issue #196 — the ONE slot swatch anatomy (the ACTIVE hex vs. named class).
import { SlotSwatch } from "./SlotSwatch";
import type { HighlightTintBases } from "../../settings/highlightTint";

interface HighlightSlotEntryProps {
  /** The settings' five numbered slots (issue #195). */
  slots: HighlightSlot[];
  /** Reader panel presentation; review dialogs retain full-name pills. */
  compact?: boolean;
  /**
   * Issue #196 — the active theme's surface + ink pair, so a custom-color
   * slot's swatch paints its derived readable tint (the shared SlotSwatch
   * anatomy). Optional: absent (unit tests) keeps the named-swatch fallback.
   */
  bases?: HighlightTintBases;
  /**
   * Apply one slot to the open highlight: change color + add the slot's
   * tags (existing tags preserved). Rejects on persistence failure
   * (rethrow path) — the hook routed the failure and rolled the optimistic
   * fields back before this resolves.
   */
  onApply: (slot: HighlightSlot) => Promise<void>;
}

/**
 * HighlightSlotEntry — fieldset + legend + one row of five action pills + a
 * small .status live region (failure copy only).
 *
 * The legend reads "Color & tags" (field-feedback round): activating a pill
 * also JOINS the slot's tags, and a "Color"-only label under-disclosed that
 * — the visible label never under-promises what activation does.
 */
export function HighlightSlotEntry({
  slots,
  bases,
  onApply,
  compact = false,
}: HighlightSlotEntryProps) {
  const [statusCopy, setStatusCopy] = useState<string | null>(null);
  const { activeLabel, inspectionProps } = useActionInspection();
  const labelId = useId();

  async function commit(slot: HighlightSlot) {
    setStatusCopy(null);
    try {
      await onApply(slot);
      // Success is the visible change itself — no status card (issue #222).
    } catch {
      // Dexie write failure — each hook path rolled its optimistic field
      // back, so the panel re-matches the persisted rows. Calm voice.
      setStatusCopy("Couldn't apply slot.");
    }
  }

  return (
    <fieldset className={`highlight-slot-entry${compact ? " highlight-slot-entry-compact" : ""}`}>
      <legend>{"Color & tags"}</legend>
      <div className="highlight-slot-picker">
        {slots.map((slot, i) => (
          <button
            key={`${i}-${slot.name}`}
            type="button"
            className="highlight-slot-choice"
            aria-label={`Apply slot ${i + 1}: ${slot.name}`}
            aria-describedby={compact ? labelId : undefined}
            {...(compact
              ? inspectionProps(`Apply slot ${i + 1}: ${slot.name}`, () => void commit(slot))
              : { onClick: () => void commit(slot) })}
          >
            {/* Issue #196 — a custom-color slot paints its derived tint (the
                shared SlotSwatch anatomy; issue #222 — the ACTIVE hex only);
                number + name identify the slot. */}
            <SlotSwatch slot={slot} bases={bases} />
            <span className="highlight-slot-number" aria-hidden="true">
              {i + 1}
            </span>
            {!compact && <span className="highlight-slot-name">{slot.name}</span>}
          </button>
        ))}
      </div>
      {compact && (
        <div id={labelId} className="annotation-panel-slot-label" aria-hidden="true">
          {activeLabel ?? "\u00a0"}
        </div>
      )}
      {/* Status region (A11Y-08 — failure feedback is announced politely).
          Issue #98 — the ONE StatusRegion primitive, ALWAYS MOUNTED (a live
          region must exist before its content changes to announce reliably);
          idle it renders no children and the per-surface CSS collapses it. */}
      <StatusRegion>{statusCopy !== null && <p>{statusCopy}</p>}</StatusRegion>
    </fieldset>
  );
}
