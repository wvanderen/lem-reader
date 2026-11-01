// src/annotations/highlightSlots.ts
// Issue #195 — the ONE pure highlight-slot vocabulary. A slot is a reusable
// preset (name + color + tags) stored on ReaderSettings; this module owns
// the seams that turn slot configuration into highlight-record fields:
//
//   - slotPreset: a slot → the {color, tags} creation payload, with the
//     slot's tags run through the ONE tag normalization (tagText
//     .normalizeTags — trim, drop empties, case-insensitive dedupe) so a
//     created record carries exactly the tags vocabulary the rest of the
//     annotation stack expects.
//
//   - defaultSlotPreset: the settings' EXPLICIT default-slot choice → the
//     creation payload every ordinary route (H/N shortcuts, the toolbar's
//     Highlight button, the completed pointer gesture) uses. Applying
//     another slot never rewrites the choice — this reads it fresh at
//     every creation.
//
//   - mergeSlotTags: the additive tag union for applying a slot to an
//     EXISTING highlight — the highlight's existing tags keep both their
//     values and their order (first-seen casing wins the case-insensitive
//     dedupe); the slot's tags join the end. Applying a slot never removes
//     a tag the reader added by hand.
//
// Pure data + pure functions — no DOM, no React, no persistence. jsdom-safe.
import { HIGHLIGHT_SLOT_COUNT } from "../content/schema";
import type { HighlightSlot } from "../content/schema";
import { normalizeTags } from "../ingestion/library/tagText";

/** The creation payload copied onto a new highlight record (issue #195;
 * issue #196 adds the optional custom-color snapshot). */
export interface HighlightSlotPreset {
  color: HighlightSlot["color"];
  /** Issue #196 — present only when the slot carries a custom color; the
   * record snapshot keys mirror this (absent, never undefined-valued). */
  customColor?: string;
  tags: string[];
}

/**
 * Issue #222 — the ONE gate every consumer reads a slot's custom hex
 * through: the remembered hex is visible only while Custom is the slot's
 * ACTIVE source (`customColorActive`). A dormant hex — retained while a
 * named fill is active — reads as undefined here, so creation payloads,
 * swatches, and checked states all tell the same truth about what the slot
 * will actually paint.
 */
export function activeCustomColor(slot: HighlightSlot): string | undefined {
  return slot.customColorActive && slot.customColor !== undefined ? slot.customColor : undefined;
}

/**
 * Slot → creation payload. Tags are normalized here (the ONE normalizeTags
 * seam) so every consumer — creation and the apply-to-existing union —
 * starts from the same clean array. Issue #196: a slot's customColor rides
 * the payload verbatim when present (strict hex — the schema already
 * validated it); absent stays absent so the created record's JSON
 * round-trips byte-stably (JSON.stringify drops undefined values).
 * Issue #222: the hex rides only while Custom is the slot's ACTIVE source
 * (activeCustomColor) — a dormant hex never copies onto a record.
 */
export function slotPreset(slot: HighlightSlot): HighlightSlotPreset {
  const customColor = activeCustomColor(slot);
  return {
    color: slot.color,
    ...(customColor !== undefined ? { customColor } : {}),
    tags: normalizeTags(slot.tags),
  };
}

/** Defensive clamp: an index outside the five-slot band reads slot 1. The
 * schema already bounds defaultHighlightSlot (int 0..4); this only covers
 * in-memory objects a parse has not seen. */
function clampSlotIndex(index: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= HIGHLIGHT_SLOT_COUNT) {
    return 0;
  }
  return index;
}

/**
 * The settings' explicit default-slot choice → the ordinary-creation
 * payload. `slots` is the settings record's five-slot array; an
 * out-of-band index (defence in depth) falls back to slot 1.
 */
export function defaultSlotPreset(
  slots: readonly HighlightSlot[],
  defaultHighlightSlot: number,
): HighlightSlotPreset {
  const slot = slots[clampSlotIndex(defaultHighlightSlot)] ?? slots[0];
  return slot ? slotPreset(slot) : { color: "default", tags: [] };
}

/**
 * The additive tag union behind "applying a slot adds its tags without
 * removing existing tags": existing tags first (their casings win the
 * case-insensitive dedupe and their order is preserved), slot tags after —
 * both sides through the ONE normalization.
 */
export function mergeSlotTags(existing: readonly string[], incoming: readonly string[]): string[] {
  return normalizeTags([...existing, ...incoming]);
}
