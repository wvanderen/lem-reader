// src/persistence/highlightsStore.ts
// Persistence seam for durable highlight records (Phase 5 — ANNO-05/06/07,
// STATE-03/04/05). Mirrors src/persistence/locationStore.ts structure: one
// Zod-validated record per row, discriminated HighlightsLoadResult union on
// read, STATE-05 error classification via the shared errors.ts classifier.
//
// STATE-04 (validated/versioned records): every record loaded from Dexie
// passes through `HighlightRecordSchema.safeParse()` on the READ path. A
// SINGLE corrupt row is DROPPED (defensive — one bad row must not block the
// rest of the article's highlights, unlike locationStore's single-record
// corrupt→WipeConfirm). We never silently coerce a corrupt record into a
// valid offset.
//
// STATE-05 (recoverable error state): loadHighlights never throws — it
// returns a discriminated `HighlightsLoadResult` so the caller can route the
// reason to the existing StorageBanner (no new surface). Article reading
// never depends on Dexie (D2-13 — fixtures are bundled JSON); a total storage
// failure cannot block opening or reading an article, and highlights simply
// do not render until storage recovers.
//
// D5-01 (cross-revision re-attachment): highlights are looked up by articleId
// across ALL revisions via the `[articleId+revision]` compound-index range
// query (Pitfall 6 — array-form range query, NOT a plain articleId field
// query which would require a Dexie version bump per Pitfall 9). The stored
// TextQuoteSelector is re-resolved against the CURRENT revision's normalized
// text by the caller (Plan 05-03's useAnnotationState).
//
// D5-12 (cascade-delete): deleteHighlight runs a Dexie transaction deleting
// the highlight AND its note(s) atomically (Pitfall 10 — a highlight and its
// note are removed together).
import { db } from "./db";
import { HighlightRecordSchema } from "../content/schema";
import type { HighlightRecord } from "../content/schema";
import { classifyStorageError } from "./errors";

/**
 * Discriminated result of loading highlights from Dexie.
 * - `ok: true`  → load succeeded; `highlights` may be empty (no highlights
 *                 saved yet for this article) but is always a valid array.
 * - `ok: false` → recovery routing required; `reason` selects the surface:
 *   - `"unavailable"`   → StorageBanner + read without highlights (D2-13)
 *   - `"corrupt"`       → (reserved — individual corrupt rows are dropped,
 *                         not surfaced as a load failure; this branch fires
 *                         only if safeParse fails en masse, which the
 *                         per-row drop policy makes unreachable in practice)
 *   - `"unupgradeable"` → StorageBanner (Dexie UpgradeError/VersionError)
 */
export type HighlightsLoadResult =
  | { ok: true; highlights: HighlightRecord[] }
  | { ok: false; reason: "unavailable" | "corrupt" | "unupgradeable" };

/**
 * Load ALL highlights for an articleId across revisions (D5-01). Never throws
 * (STATE-05). Uses the compound-index range query (Pitfall 6):
 *   db.highlights.where("[articleId+revision]")
 *     .between([articleId, 0], [articleId, Number.MAX_SAFE_INTEGER])
 *
 * Read path validates each row with `HighlightRecordSchema.safeParse()`.
 * Invalid rows are DROPPED (defensive — a single corrupt row does not block
 * the rest), so the returned array may be shorter than the persisted set.
 */
export async function loadHighlights(
  articleId: string,
): Promise<HighlightsLoadResult> {
  try {
    const rows = await db.highlights
      .where("[articleId+revision]")
      .between([articleId, 0], [articleId, Number.MAX_SAFE_INTEGER])
      .toArray();
    const valid: HighlightRecord[] = [];
    for (const row of rows) {
      const parsed = HighlightRecordSchema.safeParse(row);
      if (parsed.success) {
        valid.push(parsed.data);
      }
      // else: drop the corrupt row silently — STATE-04 says never coerce; we
      // do NOT route to WipeConfirm here (unlike the single-record settings/
      // location stores) because dropping one highlight among many is the
      // calm degradation that preserves the reader's other highlights.
    }
    return { ok: true, highlights: valid };
  } catch (e) {
    return { ok: false, reason: classifyStorageError(e) };
  }
}

/**
 * Save (upsert) a highlight. `h` is validated by construction (the only
 * producer is the annotation state hook, which builds the record from typed
 * article + selector fields); we do not re-parse on write. Throws propagate
 * to the caller (useAnnotationState), which classifies via errors.ts and
 * routes to StorageBanner — never to the reader.
 */
export async function saveHighlight(h: HighlightRecord): Promise<void> {
  await db.highlights.put(h);
}

/**
 * Delete a highlight AND cascade-delete its note(s) atomically (D5-12 /
 * Pitfall 10). The Dexie transaction ensures both deletes commit together or
 * roll back together — a highlight and its note are always removed as a unit.
 *
 * Throws propagate to the caller for STATE-05 routing.
 */
export async function deleteHighlight(highlightId: string): Promise<void> {
  await db.transaction("rw", db.highlights, db.notes, async () => {
    await db.highlights.delete(highlightId);
    await db.notes.where("highlightId").equals(highlightId).delete();
  });
}
