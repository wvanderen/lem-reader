// src/discover/timeline.ts
// Issue #123 — the ONE deterministic timeline policy for the Discover
// surface: how items from MANY subscriptions become a single newest-first
// timeline, how the single-feed filter narrows it, and how a subscription's
// local cache absorbs a fresh fetch. Pure functions only — no network, no
// storage — so the ordering + merge contracts are directly unit-testable
// and the view renders copy, never policy.
//
// Contracts (issue #123):
//   1. Newest first by `datePublished` (ISO-8601, schema-validated — but a
//      non-parsing timestamp is tolerated as "undated" rather than trusted).
//   2. Dated entries rank ABOVE undated ones: the timeline never guesses a
//      publication date it does not have (honesty over cleverness).
//   3. Undated entries have a DETERMINISTIC position — a pure function of
//      the cache: feed URL, then the item's index within its feed's cache.
//      The same saved state always produces the same timeline (the
//      calm-orientation contract: entries never shuffle between renders).
//      A refresh changes the cache, so entries may legitimately reposition
//      — but deterministically, never arbitrarily.
//   4. Merging a fresh fetch keeps the cache BOUNDED at MAX_FEED_ITEMS:
//      incoming entries win field-for-field (fresher data), cached entries
//      that aged out of the feed's window survive until the bound evicts
//      them tail-first — the same newest-first order decides both display
//      and eviction.
import { MAX_FEED_ITEMS } from "../content/schema";
import type { FeedItemPreview, SubscriptionRecord } from "../content/schema";

/** One item in the unified timeline: the preview plus the subscription it
 * came from (the feed name the timeline labels every entry with) and the
 * entry's index within that feed's cache (the stable tie-break). */
export interface TimelineEntry {
  subscription: SubscriptionRecord;
  item: FeedItemPreview;
  index: number;
}

/** A preview paired with its position in the array being ordered — the
 * shape both comparators and the merge share. */
export interface PreviewEntry {
  item: FeedItemPreview;
  index: number;
}

/**
 * previewTimestamp — the entry's sort instant, or null when the preview
 * carries no usable publication date. `datePublished` is schema-validated
 * ISO-8601, but Date.parse is still guarded: an unparseable stamp degrades
 * to "undated" (deterministic), never to NaN comparison poison.
 */
function previewTimestamp(item: FeedItemPreview): number | null {
  if (item.datePublished === undefined) return null;
  const time = Date.parse(item.datePublished);
  return Number.isNaN(time) ? null : time;
}

/**
 * compareByDate — the date phase both comparators share: newest first,
 * dated above undated, or null when the dates cannot decide (equal
 * instants, or both undated) and the caller's tie-breaks apply.
 */
function compareByDate(a: PreviewEntry, b: PreviewEntry): number | null {
  const at = previewTimestamp(a.item);
  const bt = previewTimestamp(b.item);
  if (at !== null && bt !== null && at !== bt) return bt - at;
  if (at !== null && bt === null) return -1; // dated above undated
  if (at === null && bt !== null) return 1;
  return null;
}

/**
 * comparePreviewEntries — the per-feed entry order (newest first, dated
 * above undated, index as the tie-break). Shared by the timeline sort and
 * the bounded merge: ONE order decides display AND eviction.
 */
export function comparePreviewEntries(a: PreviewEntry, b: PreviewEntry): number {
  return compareByDate(a, b) ?? a.index - b.index;
}

/**
 * compareTimelineEntries — the cross-feed timeline order: the date phase
 * first, then the feed URL, then the per-feed index — a TOTAL order over
 * any cache state (equal instants across feeds cannot tie undecidably).
 * The per-feed index is consulted ONLY within one feed: across feeds it
 * would compare caches that share no order.
 */
export function compareTimelineEntries(a: TimelineEntry, b: TimelineEntry): number {
  const byDate = compareByDate(a, b);
  if (byDate !== null) return byDate;
  if (a.subscription.feedUrl !== b.subscription.feedUrl) {
    return a.subscription.feedUrl < b.subscription.feedUrl ? -1 : 1;
  }
  return a.index - b.index;
}

/**
 * buildTimeline — flatten every subscription's cache into ONE newest-first
 * entry list. A pure function of the saved state: same subscriptions in,
 * same timeline out — the deterministic-position contract for undated
 * entries (and for every entry).
 */
export function buildTimeline(subscriptions: SubscriptionRecord[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const subscription of subscriptions) {
    subscription.items.forEach((item, index) => {
      entries.push({ subscription, item, index });
    });
  }
  return entries.sort(compareTimelineEntries);
}

/**
 * filterTimeline — the single-feed filter (issue #123): null selects every
 * feed; a subscription id narrows the timeline to that feed only. The
 * filter never re-orders — it is a strict narrowing of the same order.
 */
export function filterTimeline(
  entries: TimelineEntry[],
  subscriptionId: string | null,
): TimelineEntry[] {
  if (subscriptionId === null) return entries;
  return entries.filter((entry) => entry.subscription.id === subscriptionId);
}

/**
 * feedItemKey — the merge identity of one preview: its link when the feed
 * supplies one, else its title. Two entries with the same identity are the
 * same story seen twice (titles are schema min(1) so a linkless entry
 * always has one).
 */
function feedItemKey(item: FeedItemPreview): string {
  return item.link ?? `title:${item.title}`;
}

/**
 * mergeFeedItems — absorb a fresh fetch into a subscription's bounded
 * local cache. Incoming entries win field-for-field (fresher data — a feed
 * that now dates a previously undated entry corrects the cache); cached
 * entries that aged out of the feed's current window survive until the
 * MAX_FEED_ITEMS bound evicts them. The result is ordered by the ONE
 * preview order (comparePreviewEntries), so eviction is deterministic:
 * tail-first in that order — undated entries age out before dated ones.
 */
export function mergeFeedItems(
  cached: FeedItemPreview[],
  incoming: FeedItemPreview[],
): FeedItemPreview[] {
  const byKey = new Map<string, FeedItemPreview>();
  for (const item of incoming) {
    byKey.set(feedItemKey(item), item);
  }
  for (const item of cached) {
    const key = feedItemKey(item);
    if (!byKey.has(key)) byKey.set(key, item);
  }
  const entries: PreviewEntry[] = [...byKey.values()].map((item, index) => ({ item, index }));
  entries.sort(comparePreviewEntries);
  return entries.slice(0, MAX_FEED_ITEMS).map((e) => e.item);
}
