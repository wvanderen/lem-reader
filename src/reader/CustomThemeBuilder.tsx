// src/reader/CustomThemeBuilder.tsx
// The custom-theme builder (issue #86, decision #73): the disclosure section
// directly below the Theme fieldset, rendered ONLY while
// settings.theme === "custom". Five color rows — a native <input type="color">
// paired with a small editable hex text field, both writing the same token —
// the live contrast readout for the two policed pairs, the one-tap
// "Fix contrast" nudge, and the quiet "Reset to base colors" restore.
//
// Every change live-applies through useSettings().update (D2-03, no Save
// step): SettingsContext's effect calls applyTheme, which writes the resolved
// 11-token palette inline on documentElement; persistence rides the existing
// debounced save (Pitfall 5). The readout is DEBOUNCE-ALIGNED — it renders
// from a 400ms-settled copy of the tokens (the save debounce cadence), so a
// fast typing burst never spams the polite live region.
//
// Contrast guardrail semantics (decision #73): the readout is a non-blocking
// live region for the policed pairs (text on surface; accent on surface).
// Below-AA renders a calm warning plus "Fix contrast", which nudges the
// OFFENDING token only (src/settings/customTheme.ts fixContrastPairs). The
// reader may override and keep reading — nothing is silently adjusted.
//
// Semantics: a native <details>/<summary> disclosure (keyboard-operable for
// free), native color inputs — no ARIA re-implementation anywhere. The
// reduced-motion posture is inherited: token swaps are instant inline
// writes; no transitions are added here (A11Y-06).
import { useEffect, useState } from "react";
import { useSettings } from "../settings/SettingsContext";
import {
  AA_TEXT_RATIO,
  contrastRatio,
  fixContrastPairs,
  seedCustomTheme,
} from "../settings/customTheme";
import type { CustomThemeTokens } from "../content/schema";

/** The five editable rows, in stored order. `key` is the CustomThemeTokens
 * field name; `label` is the visible row text and the accessible-name stem. */
const TOKEN_ROWS: ReadonlyArray<{
  key: keyof CustomThemeTokens;
  label: string;
}> = [
  { key: "surface", label: "Surface" },
  { key: "surfaceRaised", label: "Raised surface" },
  { key: "ink", label: "Text" },
  { key: "accent", label: "Accent" },
  { key: "hairline", label: "Hairline" },
];

const READOUT_DEBOUNCE_MS = 400; // the SettingsContext save cadence (Pitfall 5)

/** Settle a fast-changing value before it drives the live region. */
function useDebouncedValue<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/** Accept optional leading "#" + exactly 6 hex digits. Returns the canonical
 * lowercase "#rrggbb" form, or null while the draft is not (yet) a complete
 * valid hex — the committed token never half-applies. */
function normalizeHex(raw: string): string | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(raw.trim());
  const digits = m?.[1];
  return digits ? `#${digits.toLowerCase()}` : null;
}

/** "{name}: {ratio}:1 — {verdict}" — the calm readout line for one pair. */
function verdictLine(name: string, ratio: number): string {
  return `${name}: ${ratio.toFixed(1)}:1 — ${ratio >= AA_TEXT_RATIO ? "good" : "below AA"}`;
}

/** One color row: visible label + native color picker + editable hex field.
 * The hex field keeps a local DRAFT so partially-typed values display while
 * being typed (the committed token never snaps the field mid-edit); a valid
 * draft commits immediately and the draft clears back to the stored value. */
function TokenRow({
  idStem,
  label,
  value,
  onChange,
}: {
  idStem: string;
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="custom-theme-row">
      <span className="custom-theme-token-label">{label}</span>
      <input
        type="color"
        className="custom-theme-swatch"
        aria-label={`${label} color`}
        value={value}
        onChange={(e) => {
          const hex = normalizeHex(e.currentTarget.value);
          if (hex) onChange(hex);
        }}
      />
      <input
        type="text"
        id={`${idStem}-hex`}
        className="custom-theme-hex"
        aria-label={`${label} hex value`}
        spellCheck={false}
        autoComplete="off"
        value={draft ?? value}
        onChange={(e) => {
          const raw = e.currentTarget.value;
          setDraft(raw);
          const hex = normalizeHex(raw);
          if (hex) {
            onChange(hex);
            setDraft(null); // snap the field to the canonical committed form
          }
        }}
        onBlur={() => setDraft(null)}
      />
    </div>
  );
}

export function CustomThemeBuilder() {
  const { settings, update } = useSettings();
  const customTheme = settings.customTheme;
  // Hooks run unconditionally (rules of hooks); the early return below only
  // guards the render. The builder is mounted only under theme === "custom",
  // where the schema's superRefine guarantees customTheme is present — the
  // guard keeps TS honest without inventing fallback state.
  const tokens = customTheme?.tokens;
  const settled = useDebouncedValue(tokens, READOUT_DEBOUNCE_MS);

  if (!customTheme || !tokens) return null;

  const setToken = (key: keyof CustomThemeTokens, hex: string) => {
    update({
      customTheme: { ...customTheme, tokens: { ...tokens, [key]: hex } },
    });
  };

  // The readout (visible text AND the polite live region) renders from the
  // debounce-settled tokens — the save cadence, so announcements never spam.
  // (The builder only mounts with tokens present, so settled is defined; the
  // ?? tokens fallback keeps types honest without an assertion.)
  const readout = settled ?? tokens;
  const inkRatio = contrastRatio(readout.ink, readout.surface);
  const accentRatio = contrastRatio(readout.accent, readout.surface);
  const anyFailing = inkRatio < AA_TEXT_RATIO || accentRatio < AA_TEXT_RATIO;

  const fixContrast = () => {
    update({
      customTheme: { ...customTheme, tokens: fixContrastPairs(tokens) },
    });
  };

  const resetToBase = () => {
    update({ customTheme: seedCustomTheme(customTheme.baseTheme) });
  };

  return (
    <details className="custom-theme-builder" open>
      <summary>Customize colors</summary>
      <p className="settings-help">
        Choose five colors; the rest of the theme adapts automatically.
      </p>
      <div className="custom-theme-rows">
        {TOKEN_ROWS.map(({ key, label }) => (
          <TokenRow
            key={key}
            idStem={key}
            label={label}
            value={tokens[key]}
            onChange={(hex) => setToken(key, hex)}
          />
        ))}
      </div>
      {/* The ONE polite region for the policed pairs (the D2-13 status
          pattern): verdict lines, the calm warning, and the fix affordance
          announce together, debounce-aligned. */}
      <div className="status" role="status" aria-live="polite" aria-atomic="true">
        <p className="custom-theme-verdict">{verdictLine("Text on surface", inkRatio)}</p>
        <p className="custom-theme-verdict">{verdictLine("Accent on surface", accentRatio)}</p>
        {anyFailing && (
          <>
            <p className="custom-theme-warning">Some colors are hard to read on your surface.</p>
            {/* Every change live-applies — the button only ever fires the
                explicit nudge the reader asked for (decision #73: nothing is
                silently adjusted). */}
            <button type="button" className="btn btn-quiet" onClick={fixContrast}>
              Fix contrast
            </button>
          </>
        )}
      </div>
      <button type="button" className="btn btn-quiet" onClick={resetToBase}>
        Reset to base colors
      </button>
    </details>
  );
}
