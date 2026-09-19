// src/annotations/spokenMarker.ts
// Issue #42 — the synthetic spoken-word marker entry.
//
// The read-aloud spoken position renders through the SAME unified highlight
// slicer (Spike 0007 promotion — issue #36) the annotation marks use: the
// engine's canonical [start, end) grapheme range becomes ONE synthetic
// HighlightSliceEntry appended to the highlights both render twins consume.
// Unlike an annotation, the marker is presentation-only — the renderers
// branch on this reserved id and emit the shared SpokenMark (an aria-hidden,
// non-focusable <mark class="spoken-word"> with no data-highlight-id), so
// the spoken word never enters the accessibility tree, never takes focus,
// and can never open the annotation popover.
//
// The id is intentionally impossible for a real annotation: highlight ids
// are crypto.randomUUID() strings from the record layer.
import type { TextPositionSelector } from "../content/normalizeText";

export const SPOKEN_MARKER_ID = "__spoken-word-marker__";

/** True when a slice/entry id belongs to the synthetic spoken-word marker. */
export function isSpokenMarkerId(id: string): boolean {
  return id === SPOKEN_MARKER_ID;
}

/**
 * The synthetic entry for the article-global D-05 grapheme range the engine
 * is currently speaking. `status` mirrors the confident annotation shape so
 * the entry rides the existing slicing/translation plumbing unchanged; the
 * renderers branch on the id BEFORE any status-driven styling, so the value
 * is never surfaced.
 */
export function spokenMarkerEntry(range: {
  start: number;
  end: number;
}): { id: string; position: TextPositionSelector; hasNote: false; status: "confident" } {
  return {
    id: SPOKEN_MARKER_ID,
    position: { start: range.start, end: range.end },
    hasNote: false,
    status: "confident",
  };
}
