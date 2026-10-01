// src/discover/refresh.ts
// Issue #123 — the ONE refresh-and-persist policy for the Discover surface
// (the subscribe.ts single-home discipline applied to refreshing): fetch a
// subscription's feed through the SAME SSRF-guarded pipeline, merge the
// fresh items into the bounded local cache (the merge policy lives in
// timeline.ts — the ONE ordering/merge home), and persist — or report a
// calm failure the view renders as a stale state with Retry. The view
// never touches the pipeline directly.
//
// Contracts (issue #123):
//   1. A failed fetch persists NOTHING and never advances `lastFetchedAt` —
//      the cached previews and the last-successful-update stamp survive
//      untouched (offline / failed refresh keeps cached previews).
//   2. A successful fetch advances `lastFetchedAt` ONLY — the honest
//      last-known-good time the stale state and feed rows display.
//   3. The merged cache stays BOUNDED at MAX_FEED_ITEMS (mergeFeedItems —
//      the schema cap every read enforces) — a feed cannot grow a row
//      without limit.
//   4. The row's identity is stable: id, feedUrl, and subscribedAt never
//      change at refresh time (the subscribe-time dedupe owns
//      identification; redirect drift never re-points a saved row). The
//      feed's own name/description DO refresh — the row mirrors the feed.
//   5. No background polling lives here — the Discover surface calls this
//      exactly when the reader opens Discover or requests Refresh/Retry.
import { discoverFeed, IngestionError } from "../ingestion/IngestionClient";
import { saveSubscription } from "../persistence/subscriptionsStore";
import { SubscriptionRecordSchema } from "../content/schema";
import type { SubscriptionRecord } from "../content/schema";
import type { IngestionFailureReason } from "../ingestion/types";
import { mergeFeedItems } from "./timeline";

/** The outcome union the Discover view renders copy from (the
 * SubscribeOutcome shape — never throws for policy reasons). */
export type RefreshOutcome =
  | { outcome: "refreshed"; subscription: SubscriptionRecord }
  | { outcome: "failed"; reason: IngestionFailureReason };

/**
 * refreshSubscription — fetch → merge → persist for ONE subscription.
 * `record.feedUrl` is already normalized + httpUrl-validated (the schema is
 * the trust boundary), so the stored URL is passed as-is: the pipeline's
 * own refusal reasons stay honest if it has somehow become unfetchable. On
 * failure nothing is written; on success the row is rebuilt through
 * SubscriptionRecordSchema.parse (Zod-at-boundary — the subscribe.ts
 * discipline) and put back under its SAME id.
 */
export async function refreshSubscription(
  record: SubscriptionRecord,
): Promise<RefreshOutcome> {
  let feed;
  try {
    feed = await discoverFeed(record.feedUrl);
  } catch (e) {
    if (e instanceof IngestionError) {
      return { outcome: "failed", reason: e.reason };
    }
    return { outcome: "failed", reason: "server-error" };
  }
  const updated = SubscriptionRecordSchema.parse({
    schemaVersion: record.schemaVersion,
    id: record.id,
    feedUrl: record.feedUrl,
    title: feed.title,
    ...(feed.description !== undefined ? { description: feed.description } : {}),
    items: mergeFeedItems(record.items, feed.items),
    subscribedAt: record.subscribedAt,
    lastFetchedAt: new Date().toISOString(),
  });
  await saveSubscription(updated);
  return { outcome: "refreshed", subscription: updated };
}
