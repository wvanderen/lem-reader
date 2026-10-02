// src/reader/CustomThemeBuilder.tsx
// The custom-theme builder (issue #86, decision #73; issues #120/#146): the
// disclosure section directly below the Theme fieldset, rendered ONLY while
// a custom slot is active (theme "custom-light" / "custom-dark"). It edits
// the ACTIVE slot's color rows — a native <input type="color"> paired with
// a small editable hex text field, both writing the same token — the live
// contrast readout for the policed pairs, the one-tap "Fix contrast" nudge,
// and the quiet "Reset to base colors" restore. The OTHER slot's saved
// record never rides an edit.
//
// Issue #146 — the rows group in two calm sets: the five SURFACE seeds
// (surface, raised, text, accent, hairline) and, under a "Reading room"
// group, the four Wayfinder CHROME tokens (Band, Band text, Lit board,
// Brass — ADR 0005's enamel vocabulary). A chrome row displays the token's
// EFFECTIVE value — the stored color once edited, the derived color before
// that (derive-until-edited: editing a row simply stores it; "Reset to base
// colors" drops it back to derived). The A11Y-05 rule carries over: every
// row is named by its visible text label, never by its swatch color alone.
//
// Every change live-applies through useSettings().update (D2-03, no Save
// step): SettingsContext's effect calls applyTheme, which writes the resolved
// 23-token palette inline on documentElement; persistence rides the existing
// debounced save (Pitfall 5). The readout is DEBOUNCE-ALIGNED — it renders
// from a 400ms-settled copy of the tokens (the save debounce cadence), so a
// fast typing burst never spams the polite live region.
//
// Contrast guardrail semantics (decision #73, extended by #146): the readout
// is a non-blocking live region for the policed pairs — text on surface,
// accent on surface, band text on band, band text on the lit board, band
// text on the solid fill (4.5:1 each), brass on the paper and lit brass on
// the band (3:1 non-text). Below-threshold renders a calm warning plus
// "Fix contrast", which nudges the OFFENDING token only
// (src/settings/customTheme.ts fixContrastPairs). The reader may override
// and keep reading — nothing is silently adjusted.
//
// Semantics: a native <details>/<summary> disclosure (keyboard-operable for
// free), native color inputs — no ARIA re-implementation anywhere. The
// reduced-motion posture is inherited: token swaps are instant inline
// writes; no transitions are added here (A11Y-06).
import { useEffect, useState } from "react";
import { useSettings } from "../settings/SettingsContext";
// Issue #98 (decision #96) — the ONE polite status-region primitive.
import { StatusRegion } from "../ui/StatusRegion";
import {
  AA_NON_TEXT_RATIO,
  AA_TEXT_RATIO,
  CHROME_TOKEN_PROPS,
  activeSlotOf,
  activeSlotTheme,
  contrastRatio,
  fixContrastPairs,
  resolveCustomTheme,
  seedCustomTheme,
  slotThemePatch,
} from "../settings/customTheme";
import type { ChromeTokenKey } from "../settings/customTheme";
import type { CustomThemeTokens } from "../content/schema";

/** The five surface-seed rows, in stored order. `key` is the REQUIRED
 * CustomThemeTokens field name (the chrome keys are the optional group
 * below); `label` is the visible row text and the accessible-name stem. */
const TOKEN_ROWS: ReadonlyArray<{
  key: "surface" | "surfaceRaised" | "ink" | "accent" | "hairline";
  label: string;
}> = [
  { key: "surface", label: "Surface" },
  { key: "surfaceRaised", label: "Raised surface" },
  { key: "ink", label: "Text" },
  { key: "accent", label: "Accent" },
  { key: "hairline", label: "Hairline" },
];

/** Issue #146 — the four Wayfinder chrome rows (the "Reading room" group):
 * the enamel classification band, its signage white, the lit
 * current-location board, and the metal rules. `key` is the OPTIONAL
 * CustomThemeTokens field — absent means "currently derived"; the row's CSS
 * property comes from the ONE shared CHROME_TOKEN_PROPS map. */
const CHROME_ROWS: ReadonlyArray<{
  key: ChromeTokenKey;
  label: string;
}> = [
  { key: "board", label: "Band" },
  { key: "boardText", label: "Band text" },
  { key: "lit", label: "Lit board" },
  { key: "brass", label: "Brass" },
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

/** "{name}: {ratio}:1 — {verdict}" — the calm readout line for one pair.
 * `min` is the pair's contract: 4.5:1 for text, 3:1 for non-text (both are
 * WCAG AA — 1.4.3 and 1.4.11). */
function verdictLine(name: string, ratio: number, min: number = AA_TEXT_RATIO): string {
  return `${name}: ${ratio.toFixed(1)}:1 — ${ratio >= min ? "good" : "below AA"}`;
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
  // The visible text is a real <label htmlFor> bound to the hex field (its
  // click focuses the field); the hex field's aria-label keeps the fuller
  // "{label} hex value" name — which contains the visible text, so
  // WCAG 2.5.3 Label-in-Name holds. The color input has no visible text
  // of its own and names itself "{label} color".
  return (
    <div className="custom-theme-row">
      <label className="custom-theme-token-label" htmlFor={`${idStem}-hex`}>
        {label}
      </label>
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
  // Issue #120 — the builder edits the ACTIVE slot only (the slot selected
  // in the Theme fieldset); the other slot's record rides untouched. Hooks
  // run unconditionally (rules of hooks); the early return below only
  // guards the render. The builder is mounted only under an active custom
  // slot, where the schema's superRefine guarantees the slot's record is
  // present — the guard keeps TS honest without inventing fallback state.
  const slot = activeSlotOf(settings.theme);
  const customTheme = activeSlotTheme(settings);
  const tokens = customTheme?.tokens;
  const settled = useDebouncedValue(tokens, READOUT_DEBOUNCE_MS);

  if (!customTheme || slot === undefined || !tokens) return null;

  const setToken = (key: keyof CustomThemeTokens, hex: string) => {
    update(slotThemePatch(slot, { ...customTheme, tokens: { ...tokens, [key]: hex } }));
  };

  // The readout (visible text AND the polite live region) renders from the
  // debounce-settled tokens — the save cadence, so announcements never spam.
  // (The builder only mounts with tokens present, so settled is defined; the
  // ?? tokens fallback keeps types honest without an assertion.)
  const readout = settled ?? tokens;
  const readoutResolved = resolveCustomTheme(readout);
  const inkRatio = contrastRatio(readout.ink, readout.surface);
  const accentRatio = contrastRatio(readout.accent, readout.surface);
  const bandTextRatio = contrastRatio(readoutResolved["--board-text"], readoutResolved["--board"]);
  const litRatio = contrastRatio(readoutResolved["--board-text"], readoutResolved["--lit"]);
  const fillRatio = contrastRatio(
    readoutResolved["--board-text"],
    readoutResolved["--accent-strong"],
  );
  const brassRatio = contrastRatio(readoutResolved["--brass"], readout.surface);
  const brassRaisedRatio = contrastRatio(readoutResolved["--brass"], readout.surfaceRaised);
  const bandSoftRatio = contrastRatio(readoutResolved["--board-soft"], readoutResolved["--board"]);
  const brassBrightRatio = contrastRatio(
    readoutResolved["--brass-bright"],
    readoutResolved["--board"],
  );
  const anyFailing =
    inkRatio < AA_TEXT_RATIO ||
    accentRatio < AA_TEXT_RATIO ||
    bandTextRatio < AA_TEXT_RATIO ||
    litRatio < AA_TEXT_RATIO ||
    fillRatio < AA_TEXT_RATIO ||
    brassRatio < AA_NON_TEXT_RATIO ||
    brassRaisedRatio < AA_NON_TEXT_RATIO ||
    bandSoftRatio < AA_TEXT_RATIO ||
    brassBrightRatio < AA_NON_TEXT_RATIO;

  const fixContrast = () => {
    update(slotThemePatch(slot, { ...customTheme, tokens: fixContrastPairs(tokens) }));
  };

  const resetToBase = () => {
    update(slotThemePatch(slot, seedCustomTheme(customTheme.baseTheme)));
  };

  // The chrome rows display each token's EFFECTIVE value — the stored color
  // once edited, the derived color before that — resolved from the LIVE
  // tokens (rows are controls, not the live region; they follow every edit
  // instantly, exactly like the five seed rows above).
  const liveResolved = resolveCustomTheme(tokens);

  return (
    <details className="custom-theme-builder" open>
      <summary>Customize colors</summary>
      <p className="settings-help">
        Choose your colors; the rest of the room adapts automatically.
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
      {/* Issue #146 — the Wayfinder chrome group: four more rows under one
          named fieldset, so the five-row calm above holds. The help copy's
          promise extends here: an untouched row shows the derived value. */}
      <fieldset className="custom-theme-group">
        <legend>Reading room</legend>
        <div className="custom-theme-rows">
          {CHROME_ROWS.map(({ key, label }) => (
            <TokenRow
              key={key}
              idStem={key}
              label={label}
              value={liveResolved[CHROME_TOKEN_PROPS[key]]}
              onChange={(hex) => setToken(key, hex)}
            />
          ))}
        </div>
      </fieldset>
      {/* The ONE polite region for the policed pairs (the D2-13 status
          pattern, now the ONE StatusRegion primitive — issue #98):
          verdict lines, the calm warning, and the fix affordance announce
          together, debounce-aligned. #146 extends the policed set with the
          chrome pairs (band text, lit board, solid fill, brass — the
          extended ADR 0005 palette audit). */}
      <StatusRegion>
        <p className="custom-theme-verdict">{verdictLine("Text on surface", inkRatio)}</p>
        <p className="custom-theme-verdict">{verdictLine("Accent on surface", accentRatio)}</p>
        <p className="custom-theme-verdict">{verdictLine("Band text on band", bandTextRatio)}</p>
        <p className="custom-theme-verdict">
          {verdictLine("Secondary text on band", bandSoftRatio)}
        </p>
        <p className="custom-theme-verdict">{verdictLine("Band text on lit board", litRatio)}</p>
        <p className="custom-theme-verdict">{verdictLine("Band text on solid fill", fillRatio)}</p>
        <p className="custom-theme-verdict">
          {verdictLine("Brass on surface", brassRatio, AA_NON_TEXT_RATIO)}
        </p>
        <p className="custom-theme-verdict">
          {verdictLine("Brass on raised surface", brassRaisedRatio, AA_NON_TEXT_RATIO)}
        </p>
        <p className="custom-theme-verdict">
          {verdictLine("Lit brass on band", brassBrightRatio, AA_NON_TEXT_RATIO)}
        </p>
        {anyFailing && (
          <p className="custom-theme-warning">
            Some color pairs are below the contrast guidelines.
          </p>
        )}
      </StatusRegion>
      <div className="custom-theme-actions">
        {anyFailing && (
          <button type="button" className="btn btn-quiet" onClick={fixContrast}>
            Fix contrast
          </button>
        )}
        <button type="button" className="btn btn-quiet" onClick={resetToBase}>
          Reset to base colors
        </button>
      </div>
    </details>
  );
}
