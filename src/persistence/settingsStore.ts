// src/persistence/settingsStore.ts
// Persistence seam for reader preferences (D-08 / 02-RESEARCH.md §Pattern 3 +
// §Code Examples lines 566–589). ONE composite Zod-validated record keyed
// `"reader-prefs"` in the Dexie `settings` store (key path `key`). NOT a flat
// token map — one read, one (debounced) write, atomic flush, one source of
// truth (02-RESEARCH.md Pattern 3 store value-shape recommendation).
//
// STATE-04 (validated/versioned records): every record loaded from Dexie
// passes through `ReaderSettingsSchema.safeParse()` on the READ path. Invalid
// records are TREATED AS CORRUPT for recovery routing (T-02-01 — the Zod
// schema is the trust boundary between persisted storage and runtime). We
// never silently coerce; the corrupt branch routes to WipeConfirm (Pitfall 8).
//
// STATE-05 (recoverable error state): loadSettings never throws — it returns a
// discriminated `SettingsLoadResult` so SettingsContext can route the reason
// to the right recovery surface (StorageBanner for "unavailable", WipeConfirm
// for "corrupt"/"unupgradeable"). Article reading never depends on Dexie
// (D2-13 — fixtures are bundled JSON); a total storage failure cannot block
// opening or reading an article.
//
// Mirrors src/content/repository.ts seam conventions: header comment citing
// the locked decisions, `import type` for types (verbatimModuleSyntax),
// module-level exported functions as the single-import surface.
import { db } from "./db";
import { ReaderSettingsSchema } from "../content/schema";
import type { ReaderSettings } from "../content/schema";
import { DEFAULT_SETTINGS } from "../settings/defaults";
import { classifyStorageError } from "./errors";

/** The composite-record key in the Dexie `settings` store (D2 discretion). */
const KEY = "reader-prefs";

/**
 * Discriminated result of loading reader preferences from Dexie.
 * - `ok: true`     → settings loaded (or first-run defaults applied)
 * - `ok: false`    → recovery routing required; `reason` selects the surface:
 *   - `"unavailable"`   → StorageBanner + in-memory defaults (reading continues)
 *   - `"corrupt"`       → WipeConfirm (safeParse rejected the persisted record)
 *   - `"unupgradeable"` → WipeConfirm (Dexie UpgradeError/VersionError)
 */
export type SettingsLoadResult =
  | { ok: true; settings: ReaderSettings }
  | { ok: false; reason: "unavailable" | "corrupt" | "unupgradeable" };

/**
 * Load reader preferences from Dexie. Never throws (STATE-05).
 *
 * Read path validates with `ReaderSettingsSchema.safeParse()`:
 * - absent record  → first run → returns DEFAULT_SETTINGS (no banner, no wipe)
 * - valid record   → returns the parsed data (Zod is the trust boundary)
 * - invalid record → returns `{ ok: false, reason: "corrupt" }` (T-02-01)
 * - Dexie throws   → classify via errors.ts → "unavailable" | "unupgradeable"
 */
export async function loadSettings(): Promise<SettingsLoadResult> {
  try {
    const raw = await db.settings.get(KEY);
    if (!raw?.value) {
      // First run (or wiped): no record yet. Apply the D-07 warm-paper
      // baseline in-memory; the next debounced save writes it for the
      // first time. This is NOT an error state.
      return { ok: true, settings: DEFAULT_SETTINGS };
    }
    const parsed = ReaderSettingsSchema.safeParse(raw.value);
    if (parsed.success) {
      return { ok: true, settings: parsed.data };
    }
    // Persisted record failed Zod validation. STATE-04 contract: never
    // silently coerce a corrupt record. Route to WipeConfirm (Pitfall 8 —
    // the actual db.delete() only fires inside the destructive handler in
    // WipeConfirm.tsx, NEVER here in the catch/parse path).
    return { ok: false, reason: "corrupt" };
  } catch (e) {
    return { ok: false, reason: classifyStorageError(e) };
  }
}

/**
 * Save reader preferences to Dexie as one composite record. `s` is already
 * validated by construction (the only producer is SettingsContext state,
 * which is typed `ReaderSettings`); we do not re-parse on write. Throws
 * propagate to the caller (SettingsContext), which classifies via errors.ts
 * and routes to StorageBanner — never to the reader.
 */
export async function saveSettings(s: ReaderSettings): Promise<void> {
  await db.settings.put({ key: KEY, value: s });
}
