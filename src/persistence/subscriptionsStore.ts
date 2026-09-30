// src/persistence/subscriptionsStore.ts
// Persistence seam for feed-subscription records (issue #121 — the Discover
// destination). Mirrors the booksStore / readingSessionsStore seam
// conventions: header citing the locked decisions, `import type` for types
// (verbatimModuleSyntax), discriminated load result on the routed list read,
// plain-array loader for export/merge reads, Zod-at-boundary on every read,
// classifyStorageError routing.
//
// Contracts (issue #121):
//   1. ONE row per subscribed feed, keyed by the per-subscription uuid; the
//      DEDUPE key is the NORMALIZED feed URL (the feedUrl index):
//      hasSubscriptionForFeed runs BEFORE every save so a duplicate
//      subscription is refused calmly, never double-saved (the D7-07
//      dedupe-refuse discipline at feed granularity).
//   2. The bounded recent-item previews ride the row as its LOCAL CACHE —
//      they are captured once at subscribe time and travel in export/
//      import; nothing ever re-fetches a feed to restore a cache (import
//      makes no network request — structural, not promised).
//   3. Zod-at-boundary on read (STATE-04): every row passes
//      SubscriptionRecordSchema.safeParse; corrupt rows are dropped calmly
//      (the loadAllHighlights/loadAllReadingSessions precedent). Dexie-level
//      throws route through classifyStorageError (the shared errors.ts
//      classifier).
//   4. Removal is a single-row delete — a subscription owns no cascading
//      records (unlike books: highlights/notes hang off articles, and feed
//      previews are inert display data).
import { db } from "./db";
import type { SubscriptionRecordRow } from "./db";
import { SubscriptionRecordSchema } from "../content/schema";
import type { SubscriptionRecord } from "../content/schema";
import { classifyStorageError } from "./errors";

/**
 * Discriminated result of listing subscriptions from Dexie (the
 * BooksLoadResult shape — one union for recovery routing).
 * - `ok: true`  → the load succeeded; corrupt rows were dropped (STATE-04).
 * - `ok: false` → recovery routing required; `reason` selects the surface:
 *   - `"unavailable"`   → StorageBanner (storage full / blocked / denied)
 *   - `"unupgradeable"` → WipeConfirm (Dexie UpgradeError/VersionError)
 *   - `"corrupt"`       → reserved vocabulary parity with booksStore;
 *                          list reads drop corrupt rows, so this member is
 *                          never produced here.
 */
export type SubscriptionsLoadResult =
  | { ok: true; subscriptions: SubscriptionRecord[] }
  | { ok: false; reason: "unavailable" | "corrupt" | "unupgradeable" };

/**
 * validRows — the ONE Zod-at-boundary row filter every read shares (STATE-04):
 * each row must parse through SubscriptionRecordSchema; a corrupt row is
 * dropped calmly, never coerced (the loadAllHighlights precedent — a single
 * malformed row must not block the rest of the store).
 */
function validRows(rows: SubscriptionRecordRow[]): SubscriptionRecord[] {
  const valid: SubscriptionRecord[] = [];
  for (const row of rows) {
    const parsed = SubscriptionRecordSchema.safeParse(row);
    if (parsed.success) {
      valid.push(parsed.data);
    }
    // else: drop the corrupt row calmly — STATE-04 says never coerce.
  }
  return valid;
}

/**
 * listSubscriptions — load every subscription row, Zod-validated (STATE-04).
 * Corrupt rows are dropped calmly; a single malformed row must not block
 * the Discover surface. Never throws — a Dexie-level failure routes through
 * classifyStorageError into the discriminated `{ok: false, reason}` arm so
 * the surface can route recovery (the booksStore precedent). Rows arrive in
 * primary-key order; the Discover surface sorts by subscribedAt for display.
 */
export async function listSubscriptions(): Promise<SubscriptionsLoadResult> {
  try {
    return { ok: true, subscriptions: validRows(await db.subscriptions.toArray()) };
  } catch (e) {
    return { ok: false, reason: classifyStorageError(e) };
  }
}

/**
 * loadAllSubscriptions — the plain-array whole-store read for the
 * export/merge paths (the loadAllReadingSessions precedent): corrupt rows
 * dropped calmly, one drifted row never blocks the reader's export. A
 * Dexie-level throw propagates (the export path treats a dead store as an
 * export failure — the listBooks/buildBundle tolerance shape handles it at
 * the caller).
 */
export async function loadAllSubscriptions(): Promise<SubscriptionRecord[]> {
  return validRows(await db.subscriptions.toArray());
}

/**
 * getSubscriptionByFeedUrl — the normalized-feed-URL lookup (the feedUrl
 * index), or null when absent OR corrupt (the getBook safeParse-on-read
 * discipline). `feedUrl` must already be normalized (normalizeFeedUrl) —
 * the store never guesses the canonical form.
 */
export async function getSubscriptionByFeedUrl(
  feedUrl: string,
): Promise<SubscriptionRecord | null> {
  const row = await db.subscriptions.where("feedUrl").equals(feedUrl).first();
  if (!row) return null;
  const parsed = SubscriptionRecordSchema.safeParse(row);
  return parsed.success ? parsed.data : null;
}

/**
 * hasSubscriptionForFeed — the dedupe-refuse primitive the Discover form
 * calls BEFORE any save (the D7-07/hasBook precedent at feed granularity):
 * if it returns true the surface shows the calm already-subscribed copy and
 * never calls saveSubscription.
 */
export async function hasSubscriptionForFeed(feedUrl: string): Promise<boolean> {
  return (
    (await db.subscriptions.where("feedUrl").equals(feedUrl).first()) !== undefined
  );
}

/**
 * saveSubscription — put one subscription row. `record` is validated by
 * construction (the only producer builds it from a Zod-validated feed
 * response through SubscriptionRecordSchema); we do not re-parse on write
 * (the saveLocation precedent). The caller is responsible for the
 * hasSubscriptionForFeed dedupe check BEFORE calling (the D7-07 shape).
 * A throw propagates to the caller, which surfaces the calm catch-all copy.
 */
export async function saveSubscription(record: SubscriptionRecord): Promise<void> {
  await db.subscriptions.put(record);
}

/**
 * deleteSubscription — remove one subscription row by its uuid primary key.
 * THE single write path for unsubscribing; the destructive call lives ONLY
 * in DiscoverRemoveConfirm's confirm handler (the Pitfall 8 discipline).
 * Removing an absent id is a calm no-op.
 */
export async function deleteSubscription(id: string): Promise<void> {
  await db.subscriptions.delete(id);
}
