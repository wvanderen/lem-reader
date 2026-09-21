// src/ingestion/library/icons.tsx
// Issue #67 review — the ONE home for the row action-cluster glyphs
// (mark-read check, pending spinner, edit pencil, remove trash). One anatomy
// for every icon (20×20, 24-unit viewBox, currentColor stroke, round
// caps/joins, aria-hidden + focusable=false): decorative, so each button's
// aria-label carries the full accessible name. D13-12 icon policy (a real
// inline SVG, never an emoji character); this module retires the hand-cloned
// TrashIcon/BookTrashIcon/CheckIcon/EditIcon copies.
//
// No props on purpose (the review's speculative-generality note): every
// consumer passes the identical aria-hidden="true" — it is hardcoded here.

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: "false",
} as const;

/** Check-circle glyph for the mark-read affordance (one glyph, two states
 * via the button's aria-label). */
export function CheckIcon() {
  return (
    <svg {...iconProps}>
      {/* circle with a check */}
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="M22 4 12 14.01l-3-3" />
    </svg>
  );
}

/** Open-arc spinner glyph for the mark-read pending state. Swaps in for the
 * check while the write is in flight; its rotation is the only animated
 * part and rides the global reduced-motion gate (a static arc is still a
 * distinct shape from the check). */
export function SpinnerIcon() {
  return (
    <svg {...iconProps}>
      {/* 270° arc — the gap is what reads as "spinning" when rotated */}
      <path d="M21 12a9 9 0 1 1-9-9" />
    </svg>
  );
}

/** Pencil glyph for the row edit-metadata affordance (Plan 17-02, D17-01). */
export function EditIcon() {
  return (
    <svg {...iconProps}>
      {/* baseline */}
      <path d="M12 20h9" />
      {/* pencil body */}
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

/** Waste-bin glyph for the row remove affordance (Phase 13 Plan 13-07, G3). */
export function TrashIcon() {
  return (
    <svg {...iconProps}>
      {/* lid */}
      <path d="M3 6h18" />
      {/* handle */}
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      {/* body */}
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      {/* inner lines */}
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}
