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
//
// Issue #222 — the slot dormancy migration: a pre-#222 row's slots carry
// `customColor` without the `customColorActive` key. The reader's EXISTING
// state arrives ACTIVE (a stored hex was — by the only semantics #196
// had — the slot's live color choice), so every slot WITH a snapshot gains
// `customColorActive: true` and every slot WITHOUT one gains `false`. The
// field is required by the schema (no hydration default — a written v8 row
// must round-trip byte-stably through every parse), so the fill happens
// here, pre-parse, at every settings-entry seam. The rule composes with the
// legacy-theme migration below (the two touch disjoint keys) and is
// IDEMPOTENT: a row whose slots all carry the key passes through UNCHANGED
// (same reference). Garbage `highlightSlots` rides through untouched so the
// downstream parse still fails — the honest corrupt routing, never a
// silent reshape.
import { clampLegacyMeasure } from "./legacyMeasure";
import { seedCustomTheme } from "./customTheme";

/**
 * Issue #222 — fill the slots' pre-#222 dormancy key on a RAW row: a slot
 * object with a (string-valued) `customColor` and no `customColorActive`
 * gains `true`; a slot object without either gains `false`. Slots that
 * already carry the key, and non-object slot entries, ride verbatim (the
 * record schema downstream remains the trust boundary for their shape).
 * Returns a NEW row when (and only when) at least one slot was filled;
 * every other input returns the SAME row reference (idempotent at the
 * seams — callers rely on the identity to skip re-writes).
 */
function fillSlotDormancy(row: Record<string, unknown>): Record<string, unknown> | null {
  const slots = row.highlightSlots;
  if (!Array.isArray(slots)) return null;
  let filled = false;
  const next = slots.map((slot) => {
    if (slot === null || typeof slot !== "object") return slot;
    const s = slot as Record<string, unknown>;
    if (typeof s.customColorActive === "boolean") return slot;
    filled = true;
    return {
      ...s,
      customColorActive: typeof s.customColor === "string",
    };
  });
  if (!filled) return null;
  return { ...row, highlightSlots: next };
}

/**
 * Normalize a RAW settings-shaped record for the current schema: clamp the
 * enumerated legacy measure value (72 → 70, issue #18/D21-03), migrate the
 * legacy one-slot custom theme into the two-slot shape (issue #120), and
 * fill the slots' pre-#222 dormancy key (issue #222, above). Returns a NEW
 * record when (and only when) a known legacy shape mapped; every other
 * input is returned UNTOUCHED (same reference when no rule fired) so the
 * caller's safeParse outcome is unchanged.
 */
export function migrateReaderSettings(raw: unknown): unknown {
  const clamped = clampLegacyMeasure(raw);
  if (clamped === null || typeof clamped !== "object") return clamped;
  const row = clamped as Record<string, unknown>;
  const dormancyFilled = fillSlotDormancy(row);
  if (!["custom", "sepia", "light", "dark"].includes(row.theme as string)) {
    return dormancyFilled ?? row;
  }
  const legacy = row.customTheme;
  if (legacy === null || typeof legacy !== "object") return dormancyFilled ?? row;
  // The carried record is passed through VERBATIM (case included) — the
  // record schema downstream remains the trust boundary for its shape.
  const record = legacy as { baseTheme?: unknown; tokens?: unknown };
  // The dormancy fill (when it fired) already spread the row — start from it
  // so both rules land on ONE new record.
  const migrated: Record<string, unknown> = dormancyFilled ?? { ...row };
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
