// src/persistence/locationStore.ts
// Persistence seam for STATE-01 reading-location records (D-05 grapheme-offset
// substrate + D-06 [articleId+revision] key contract). Mirrors the
// settingsStore seam (sibling, same phase): one Zod-validated record per key,
// discriminated LocationLoadResult union on read, STATE-05 error
// classification via the shared errors.ts classifier.
//
// STATE-04 (validated/versioned records): every record loaded from Dexie
// passes through `LocationRecordSchema.safeParse()` on the READ path (T-02-08
// — Tampering V5). An invalid record is treated as corrupt — it routes to
// STATE-05 recovery and the reader falls through to top-of-article. We never
// silently coerce a corrupt offset into a scroll target.
//
// STATE-05 (recoverable error state): loadLocation never throws — it returns
// a discriminated `LocationLoadResult` so ArticleView's restore effect can
// route the reason silently. Per D-06 + the plan's critical_constraints, a
// mismatched-revision record is NOT an error — it simply falls through to
// "no location found" (the saved offset is invalid against the new revision's
// normalized text). Article reading never depends on Dexie (D2-13).
//
// Mirrors src/persistence/settingsStore.ts seam conventions: header comment
// citing the locked decisions, `import type` for types (verbatimModuleSyntax),
// module-level exported functions as the single-import surface.
import { db } from "./db";
import type { LocationRecordRow } from "./db";
import { LocationRecordSchema } from "../content/schema";
import type { LocationRecord } from "../content/schema";
import { classifyStorageError } from "./errors";

/**
 * Build the Dexie compound-key string for a [articleId+revision] pair.
 * The key shape is `articleId:revision` — must round-trip with the location
 * store's `[articleId+revision]` index (db.ts line 54). ArticleSchema locks
 * articleId to `/^[a-z0-9-]+$/` and revision to a positive int, so the colon
 * is an unambiguous separator (no escape concern).
 */
function locationKey(articleId: string, revision: number): string {
  return `${articleId}:${revision}`;
}

/**
 * Discriminated result of loading a reading location from Dexie.
 * - `ok: true`     → the load succeeded; `location` is null for first-run /
 *                   mismatched-revision (the saved offset is invalid against
 *                   the article's current revision — silent top-of-article)
 * - `ok: false`    → recovery routing required; `reason` selects the surface:
 *   - `"unavailable"`   → StorageBanner + in-memory defaults (reading continues)
 *   - `"corrupt"`       → WipeConfirm (safeParse rejected the persisted record)
 *   - `"unupgradeable"` → WipeConfirm (Dexie UpgradeError/VersionError)
 */
export type LocationLoadResult =
  | { ok: true; location: LocationRecord | null }
  | { ok: false; reason: "unavailable" | "corrupt" | "unupgradeable" };

/**
 * Load a reading location from Dexie by [articleId+revision] (D-06). Never
 * throws (STATE-05).
 *
 * Read path validates with `LocationRecordSchema.safeParse()`:
 * - absent record      → first run or no saved location → returns null
 * - valid record       → returns the parsed LocationRecord
 * - invalid record     → returns `{ ok: false, reason: "corrupt" }` (T-02-08)
 * - Dexie throws       → classify via errors.ts → "unavailable" | "unupgradeable"
 *
 * Note: the caller (ArticleView) is responsible for cross-checking the
 * returned record's `revision` against the live article's `revision` before
 * trusting the offset. The Dexie key already encodes revision, so a normal
 * load by (articleId, revision) only ever returns the matching record —
 * mismatched revisions simply return null (first-load for that revision).
 */
export async function loadLocation(
  articleId: string,
  revision: number,
): Promise<LocationLoadResult> {
  try {
    const key = locationKey(articleId, revision);
    const raw = await db.location.get(key);
    if (!raw) {
      // First open of this [articleId+revision] pair, or the article's
      // revision changed since the save (no row under the new key). Silent
      // fall-through to top-of-article — NOT an error state (D-06).
      return { ok: true, location: null };
    }
    // The row carries the compound key plus the LocationRecord fields.
    // Strip the Dexie key before validating so safeParse sees the canonical
    // LocationRecord shape (no extra compound-key field).
    const { ["[articleId+revision]"]: _key, ...record } = raw;
    const parsed = LocationRecordSchema.safeParse(record);
    if (parsed.success) {
      return { ok: true, location: parsed.data };
    }
    // Persisted record failed Zod validation. STATE-04 contract: never
    // silently coerce a corrupt offset. Route to WipeConfirm (Pitfall 8 —
    // db.delete() only fires inside the destructive handler in WipeConfirm.tsx).
    return { ok: false, reason: "corrupt" };
  } catch (e) {
    return { ok: false, reason: classifyStorageError(e) };
  }
}

/**
 * Save a reading location to Dexie keyed [articleId+revision]. `loc` is
 * validated by construction (the only producer is useScrollSave, which builds
 * the record from typed article fields); we do not re-parse on write.
 *
 * Returns silently on success. A throw propagates to the caller (useScrollSave),
 * which catches it and routes via the SettingsContext storage-failure path so
 * the StorageBanner surfaces location-save failures too (D2-13/STATE-05) —
 * never throws to the reader.
 */
export async function saveLocation(loc: LocationRecord): Promise<void> {
  const row: LocationRecordRow = {
    "[articleId+revision]": locationKey(loc.articleId, loc.revision),
    schemaVersion: loc.schemaVersion,
    articleId: loc.articleId,
    revision: loc.revision,
    graphemeOffset: loc.graphemeOffset,
    savedAt: loc.savedAt,
  };
  await db.location.put(row);
}
