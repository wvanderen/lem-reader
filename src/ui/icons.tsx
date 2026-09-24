// src/ui/icons.tsx
// Issue #77 — the ONE shared icons module (decision #69). Every glyph in
// the app renders from this anatomy: 24-unit grid, 1.5px currentColor
// stroke, round caps/joins, fill none, aria-hidden + focusable="false" so
// the glyph never enters the focus order or the accessible tree — each
// host button's aria-label carries the full accessible name (D13-12 icon
// policy: a real inline SVG, never an emoji character). The hiding is
// baked into the anatomy — no consumer passes it per call site.
//
// className is available for the rare glyph that carries a layout hook
// (the review jump arrow's size class).

interface IconProps {
  className?: string;
}

function Svg({
  size,
  className,
  children,
}: IconProps & { size: number; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

/** Gear — settings. */
export function GearIcon(props: IconProps) {
  return (
    <Svg size={20} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  );
}

/** Highlighter — annotations trigger. */
export function HighlighterIcon(props: IconProps) {
  return (
    <Svg size={20} {...props}>
      <path d="M9 11l-6 6v3h3l6-6" />
      <path d="M12 8l4 4" />
      <path d="M17 3l4 4-9 9-4-4 9-9z" />
    </Svg>
  );
}

/** Tag label with pin dot — tags trigger. */
export function TagIcon(props: IconProps) {
  return (
    <Svg size={20} {...props}>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r="0.5" fill="currentColor" />
    </Svg>
  );
}

/** Three-line contents — TOC trigger. */
export function ContentsIcon(props: IconProps) {
  return (
    <Svg size={20} {...props}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </Svg>
  );
}

/** Single bounded page with a corner fold — paginated mode. */
export function PaginatedIcon(props: IconProps) {
  return (
    <Svg size={20} {...props}>
      <path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v4h4" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </Svg>
  );
}

/** Continuous vertical flow — scrolling mode. */
export function ScrollingIcon(props: IconProps) {
  return (
    <Svg size={20} {...props}>
      <path d="M6 5h12" />
      <path d="M6 10h12" />
      <path d="M6 15h12" />
      <path d="M6 20h8" />
      <path d="M18 18l2 2-2 2" />
      <path d="M20 20h-6" />
    </Svg>
  );
}

/** Page-turn chevrons (24px — the page-edge chrome register). */
export function ChevronLeftIcon(props: IconProps) {
  return (
    <Svg size={24} {...props}>
      <path d="M15 18l-6-6 6-6" />
    </Svg>
  );
}
export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg size={24} {...props}>
      <path d="M9 18l6-6-6-6" />
    </Svg>
  );
}

/** × — close/dismiss. */
export function CloseIcon(props: IconProps) {
  return (
    <Svg size={20} {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </Svg>
  );
}

/** Check-circle — mark-read affordance (one glyph, two states via the
 * button's aria-label). */
export function CheckIcon(props: IconProps) {
  return (
    <Svg size={20} {...props}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="M22 4 12 14.01l-3-3" />
    </Svg>
  );
}

/** Open-arc spinner — the in-flight state. Rotation rides the positive
 * reduced-motion gate; a static arc is still a distinct shape from the
 * check. Prepend beside the label — never swap it for text. */
export function SpinnerIcon(props: IconProps) {
  return (
    <Svg size={20} {...props}>
      <path d="M21 12a9 9 0 1 1-9-9" />
    </Svg>
  );
}

/** Pencil — edit-metadata affordance. */
export function EditIcon(props: IconProps) {
  return (
    <Svg size={20} {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </Svg>
  );
}

/** Waste-bin — remove affordance. */
export function TrashIcon(props: IconProps) {
  return (
    <Svg size={20} {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Svg>
  );
}

/** South-west → north-east arrow — "go to article" in the review panel. */
export function JumpToArticleIcon(props: IconProps) {
  return (
    <Svg size={20} {...props}>
      <path d="M7 17L17 7" />
      <path d="M8 7h9v9" />
    </Svg>
  );
}

/** Plus — the Add-to-Library trigger (header icon on Highlights). */
export function PlusIcon(props: IconProps) {
  return (
    <Svg size={20} {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Svg>
  );
}

/** Image — the refused/no-dims figure placeholder. */
export function ImageIcon(props: IconProps) {
  return (
    <Svg size={20} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="m21 15-3.5-3.5-9 9" />
    </Svg>
  );
}
