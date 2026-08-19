// src/settings/settingsMirror.ts
// localStorage settings mirror (POLISH-01, D13-01/D13-02): a best-effort
// FIRST-PAINT HINT ONLY. One localStorage key carries the FULL ReaderSettings
// record (all settings in one key per D13-02) so the inline pre-React script
// in index.html can paint mode/theme/typography tokens before React mounts,
// and SettingsContext can lazy-init its state to match. Dexie via
// loadSettings (src/persistence/settingsStore.ts) stays the SOLE source of
// truth; hydration reconciles and self-corrects a stale mirror.
//
// D13-03 / Pitfall 4: mirror read/write/clear failures are NEVER routed
// through classifyStorageError or setStorageState — the mirror never routes
// recovery UI. Every operation here either returns a value, returns null, or
// is a silent no-op. A corrupt, absent, or quota-blocked mirror fails silent
// to defaults (the CSS literal fallbacks 18px/1.6/0 — the 02-04 cascade
// contract); never a crash, never recovery UI.
//
// Mirrors src/persistence/settingsStore.ts seam conventions: header comment
// citing the locked decisions, Zod-at-read with null-on-doubt (never
// silently coerce — an invalid stored value returns null exactly as a corrupt
// Dexie row routes to recovery, except here "recovery" is simply: paint
// defaults), module-level exported functions as the single-import surface.
// This module is the SINGLE seam: no other src/ module touches localStorage
// for settings.
import { ReaderSettingsSchema } from "../content/schema";
import type { ReaderSettings } from "../content/schema";

/** The localStorage key carrying the mirrored ReaderSettings record.
 * Versioned so a future mirror shape change can migrate or invalidate
 * cleanly (v1 = the D13-02 full-record mirror). */
export const SETTINGS_MIRROR_KEY = "lem-settings-mirror-v1";

/**
 * Read the settings mirror. Returns the Zod-validated record, or null on
 * ANY doubt (absent key, unparseable JSON, schema-invalid value, or a
 * throwing localStorage access). Null means: paint defaults — the caller
 * (inline script / SettingsContext lazy-init) treats null exactly like a
 * first run.
 */
export function readSettingsMirror(): ReaderSettings | null {
  try {
    const raw = window.localStorage.getItem(SETTINGS_MIRROR_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    const parsed = ReaderSettingsSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    // Corrupt JSON, blocked storage — anything. The mirror is a hint;
    // null-on-doubt (never throw past this seam).
    return null;
  }
}

/**
 * Write the FULL ReaderSettings record to the mirror (one key, all settings
 * — D13-02). Any failure (quota exceeded, blocked storage, non-serializable
 * value) is a SILENT no-op: the hint is best-effort by contract and a mirror
 * write failure must never classify as a storage failure (Pitfall 4).
 */
export function writeSettingsMirror(s: ReaderSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_MIRROR_KEY, JSON.stringify(s));
  } catch {
    // Silent no-op by contract (D13-01 best-effort hint).
  }
}

/**
 * Remove the mirror key. Rides resetLocalData (the single post-wipe seam —
 * localStorage survives db.delete(), so the wipe MUST clear it or a wiped
 * reader repaints dead preferences forever: Pitfall 1). Clearing an absent
 * key is a no-op; a throwing removeItem is a silent no-op like every other
 * failure here.
 */
export function clearSettingsMirror(): void {
  try {
    window.localStorage.removeItem(SETTINGS_MIRROR_KEY);
  } catch {
    // Silent no-op by contract.
  }
}
