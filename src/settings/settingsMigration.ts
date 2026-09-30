// src/settings/settingsMigration.ts
// The pre-parse settings normalizer applied to the RAW record at every
// settings-entry seam (settingsStore.loadSettings, settingsMirror
// .readSettingsMirror, the ExportImportService import preferences block)
// BEFORE ReaderSettingsSchema.safeParse — the D21-03 clampLegacyMeasure
// discipline (src/settings/legacyMeasure.ts), which this module COMPOSES.
//
// Issue #120 — the legacy ONE-slot custom theme (theme "custom" +
// customTheme, the issue #86 shape, including while a preset is active)
// maps into the TWO independently saved
// slots:
//   - a dark-seeded record (baseTheme "dark") migrates into Custom dark;
//   - any other seeded record (baseTheme "sepia"/"light") migrates into
//     Custom light;
//   - the OTHER slot starts from its matching preset (Custom light ← the
//     light preset, Custom dark ← the dark preset) so both slots exist with
//     coherent dispositions immediately after the migration.
// The five edited tokens ride byte-exact (case preserved — hydration never
// coerces), so the active appearance survives the migration whole.
//
// STATE-04 (never-silently-coerce): the migration maps EXACTLY the known
// legacy shape. A row with theme "custom" but NO (or a non-object)
// customTheme record passes through UNTOUCHED so the downstream parse still
// FAILS (the theme enum no longer carries "custom") and the seam's
// corrupt/null contract fires — actual corruption is never silently coerced
// or repaired. An invalid baseTheme/hex inside a carried record likewise
// fails the record schema downstream. schemaVersion is NOT mutated (the
// readingMode/voice .default() precedent — the row keeps its written
// version until the reader's next save emits the current canonical one).
//
// No Dexie store change, no migration prompt, silent by design (Pitfall 9
// — the settings store is key-value; Dexie is opaque to the value shape).
import { clampLegacyMeasure } from "./legacyMeasure";
import { seedCustomTheme } from "./customTheme";

/**
 * Normalize a RAW settings-shaped record for the current schema: clamp the
 * enumerated legacy measure value (72 → 70, issue #18/D21-03) and migrate
 * the legacy one-slot custom theme into the two-slot shape (issue #120).
 * Returns a NEW record when (and only when) a known legacy shape mapped;
 * every other input is returned UNTOUCHED (same reference when no rule
 * fired) so the caller's safeParse outcome is unchanged.
 */
export function migrateReaderSettings(raw: unknown): unknown {
  const clamped = clampLegacyMeasure(raw);
  if (clamped === null || typeof clamped !== "object") return clamped;
  const row = clamped as Record<string, unknown>;
  if (!["custom", "sepia", "light", "dark"].includes(row.theme as string)) return row;
  const legacy = row.customTheme;
  if (legacy === null || typeof legacy !== "object") return row;
  // The carried record is passed through VERBATIM (case included) — the
  // record schema downstream remains the trust boundary for its shape.
  const record = legacy as { baseTheme?: unknown; tokens?: unknown };
  const migrated: Record<string, unknown> = { ...row };
  delete migrated.customTheme;
  if (record.baseTheme === "dark") {
    if (row.theme === "custom") migrated.theme = "custom-dark";
    migrated.customDarkTheme = record;
    if (migrated.customLightTheme === undefined) {
      migrated.customLightTheme = seedCustomTheme("light");
    }
  } else {
    if (row.theme === "custom") migrated.theme = "custom-light";
    migrated.customLightTheme = record;
    if (migrated.customDarkTheme === undefined) {
      migrated.customDarkTheme = seedCustomTheme("dark");
    }
  }
  return migrated;
}
