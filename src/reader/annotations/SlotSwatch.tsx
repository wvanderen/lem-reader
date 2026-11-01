// src/reader/annotations/SlotSwatch.tsx
// Issue #196 — the ONE slot swatch anatomy: a custom-color slot paints the
// derived readable tint (the same readableHighlightTint derivation every
// render surface uses — preview = render by construction); a named-color
// slot keeps the shared per-id swatch class byte-unchanged. Decorative in
// both branches: the slot's number + name carry the meaning (A11Y-05 —
// color is never the sole identifier). Issue #222 — the tint derives from
// the slot's ACTIVE hex (activeCustomColor): a dormant hex — retained while
// a named fill is active — paints the NAMED color, the same truth creation
// and application act on.
import type { HighlightSlot } from "../../content/schema";
import { activeCustomColor } from "../../annotations/highlightSlots";
import { customHighlightTint } from "../../settings/highlightTint";
import type { HighlightTintBases } from "../../settings/highlightTint";

export function SlotSwatch({ slot, bases }: { slot: HighlightSlot; bases?: HighlightTintBases }) {
  const tint = customHighlightTint(activeCustomColor(slot), bases);
  return (
    <span
      className={`highlight-color-swatch${tint !== undefined ? "" : ` highlight-color-swatch-${slot.color}`}`}
      style={tint !== undefined ? { background: tint } : undefined}
      aria-hidden="true"
    />
  );
}
