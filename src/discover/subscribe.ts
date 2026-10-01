// src/discover/subscribe.ts
// Issue #121 — the ONE subscribe-and-persist policy for the Discover
// surface (the addToLibrary single-home discipline, applied to feed
// subscriptions): normalize → fetch+parse via the SSRF-guarded pipeline →
// dedupe-refuse by the normalized validated feed URL → atomic save. The
// view renders its copy from the outcome union; it never touches the
// pipeline directly.
//
// Contracts (issue #121):
//   1. An invalid candidate is refused WITHOUT saving anything — the
//      subscription row is written only after the FeedPreview response
//      validates client-side (the D7-07 validate-then-save discipline).
//   2. Dedupe-refuse: a feedUrl already subscribed returns
//      "already-subscribed" — a calm no, never a second row (the
//      hasSubscriptionForFeed-before-save shape, hasBook precedent).
//   3. The saved record is built through SubscriptionRecordSchema.parse
//      (Zod-at-boundary on the constructed row — the same parse the Dexie
//      read path runs later; a mismatch can never persist).
import { discoverFeed, IngestionError } from "../ingestion/IngestionClient";
import {
  hasSubscriptionForFeed,
  saveSubscription,
} from "../persistence/subscriptionsStore";
import { SubscriptionRecordSchema } from "../content/schema";
import type { SubscriptionRecord } from "../content/schema";
import type { IngestionFailureReason } from "../ingestion/types";
import { normalizeFeedUrl } from "./feedUrl";

/** The outcome union the Discover view renders copy from (the
 * AddToLibraryOutcome shape — never throws for policy reasons). */
export type SubscribeOutcome =
  | { outcome: "subscribed"; subscription: SubscriptionRecord }
  | { outcome: "already-subscribed" }
  | { outcome: "invalid-url" }
  | { outcome: "refused"; reason: IngestionFailureReason };

/**
 * subscribeToFeed — validate → fetch → dedupe → save. The raw input is
 * normalized FIRST (a garbage address refuses before any network cost —
 * the earliest-enforcement pattern); the response's post-redirect
 * normalized URL is the dedupe key AND the saved feedUrl (the canonical
 * identity, not the reader's typed spelling).
 */
export async function subscribeToFeed(rawUrl: string): Promise<SubscribeOutcome> {
  const normalized = normalizeFeedUrl(rawUrl);
  if (normalized === null) {
    return { outcome: "invalid-url" };
  }
  let feed;
  try {
    feed = await discoverFeed(normalized);
  } catch (e) {
    if (e instanceof IngestionError) {
      return { outcome: "refused", reason: e.reason };
    }
    return { outcome: "refused", reason: "server-error" };
  }
  if (await hasSubscriptionForFeed(feed.url)) {
    return { outcome: "already-subscribed" };
  }
  const subscribedAt = new Date().toISOString();
  const record = SubscriptionRecordSchema.parse({
    schemaVersion: 1,
    id: crypto.randomUUID(),
    feedUrl: feed.url,
    title: feed.title,
    ...(feed.description !== undefined ? { description: feed.description } : {}),
    items: feed.items,
    subscribedAt,
    // Issue #123 — subscribe IS a successful fetch: the last-known-good
    // stamp starts here, before any refresh.
    lastFetchedAt: subscribedAt,
  });
  await saveSubscription(record);
  return { outcome: "subscribed", subscription: record };
}
