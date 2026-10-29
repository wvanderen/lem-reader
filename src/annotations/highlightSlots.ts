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

/** The creation payload copied onto a new highlight record (issue #195). */
export interface HighlightSlotPreset {
  color: HighlightSlot["color"];
  tags: string[];
}

/**
 * Slot → creation payload. Tags are normalized here (the ONE normalizeTags
 * seam) so every consumer — creation and the apply-to-existing union —
 * starts from the same clean array.
 */
export function slotPreset(slot: HighlightSlot): HighlightSlotPreset {
  return { color: slot.color, tags: normalizeTags(slot.tags) };
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
