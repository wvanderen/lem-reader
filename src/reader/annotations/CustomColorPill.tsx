// src/reader/annotations/CustomColorPill.tsx
// Issue #196 — the ONE "Custom" radio pill anatomy shared by the two color
// pickers (the annotation panel's HighlightColorEntry + the settings slot
// editor's color fieldset): labeled radio + decorative swatch painting the
// derived readable tint + the visible "Custom" text (A11Y-05 — the state is
// never conveyed by color alone). The checked state rides the native radio;
// onActivate is the host's commit (native radios only fire change on actual
// state flips, so selecting the already-selected pill is inherently inert —
// the same semantics as every named choice).
export function CustomColorPill({
  name,
  checked,
  onActivate,
  tint,
}: {
  /** The radio group name (the host's group — slot editor vs. panel). */
  name: string;
  /** Checked exactly when the record/slot carries a custom color snapshot. */
  checked: boolean;
  /** The host's commit for activating Custom (seed / no-op per contract). */
  onActivate: () => void;
  /** The derived readable tint for the swatch (undefined keeps the Default
   * fill — the shared .highlight-color-swatch fallback). */
  tint: string | undefined;
}) {
  return (
    <label className={`highlight-color-choice${checked ? " selected" : ""}`}>
      <input
        type="radio"
        name={name}
        value="custom"
        checked={checked}
        onChange={onActivate}
        className="highlight-color-input"
      />
      <span
        className="highlight-color-swatch"
        style={tint !== undefined ? { background: tint } : undefined}
        aria-hidden="true"
      />
      <span className="highlight-color-label">Custom</span>
    </label>
  );
}
