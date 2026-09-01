// src/settings/legacyMeasure.ts
// Phase 21 (POLISH-09, D21-03): the bounded legacy-value map for the
// reading-measure token. The truthful range (D21-01/D21-02) removed the
// lying 72 step from MEASURE_STEPS and the ReaderSettingsSchema measure
// union; a reader who persisted the old far-right value must load CALMLY
// at 64 — never through the corrupt/WipeConfirm path (Pitfall 1, THE
// phase trap). This module is the pre-parse normalizer applied to the RAW
// record at every settings-entry seam (settingsStore.loadSettings,
// settingsMirror.readSettingsMirror, the ExportImportService import
// preferences block) BEFORE ReaderSettingsSchema.safeParse.
//
// STATE-04 (never-silently-coerce): the map contains EXACTLY ONE entry —
// the known legacy maximum 72 → 64. Any other out-of-range value (71, a
// string, null, …) is returned untouched so downstream safeParse still
// FAILS and the seam's corrupt/null contract surfaces (V5 boundary
// discipline; actual corruption is never silently coerced). Never widen
// the schema union for tolerance (T-21-02).
//
// Mirrors the 09-03 applyPreferencesDefault read-hydration precedent:
// a value-shape migration at the boundary, no Dexie store change, no
// migration prompt, silent by design (D21-03).
//
// index.html carries an INLINE COPY of this map (the paint hint cannot
// import modules — the FONT_STACKS discipline); the marker-comment
// sync-check in tests/unit/settings/measure-clamp.test.ts pins the copy
// to this module.

/** The ONE legacy-value map (D21-03). Bounded on purpose: ONLY the known
 * pre-truthful-range maximum maps; every other invalid value still fails
 * ReaderSettingsSchema.parse → the seam's corrupt/null contract (STATE-04
 * never-silently-coerce holds for actual corruption). Frozen so no caller
 * can widen it at runtime. */
export const LEGACY_MEASURE: Readonly<Record<number, number>> = Object.freeze({
  72: 64,
});

/**
 * Clamp the enumerated legacy measure value on a RAW settings-shaped
 * record, pre-parse. Returns a NEW record with measure mapped when (and
 * only when) the record is an object whose measure is exactly the
 * enumerated legacy value; every other input is returned UNTOUCHED (same
 * reference) so the caller's safeParse outcome is unchanged.
 */
export function clampLegacyMeasure(raw: unknown): unknown {
  if (raw !== null && typeof raw === "object" && "measure" in raw) {
    const m = (raw as { measure?: unknown }).measure;
    if (typeof m === "number" && m in LEGACY_MEASURE) {
      return { ...(raw as object), measure: LEGACY_MEASURE[m] };
    }
  }
  return raw;
}
