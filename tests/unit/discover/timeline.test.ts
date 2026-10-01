// tests/unit/discover/timeline.test.ts
// Issue #123 — the ONE deterministic timeline policy, pinned as pure
// functions: multiple subscriptions flatten into ONE newest-first timeline,
// undated entries hold a position that is a pure function of the cache
// (feed URL, then cache index — never wall-clock, never render order), the
// single-feed filter is a strict narrowing of the same order, and the
// bounded merge keeps a subscription's cache capped at MAX_FEED_ITEMS with
// undated entries aging out tail-first.
import { describe, expect, it } from "vitest";

import { MAX_FEED_ITEMS } from "../../../src/content/schema";
import type { FeedItemPreview, SubscriptionRecord } from "../../../src/content/schema";
import {
  buildTimeline,
  compareTimelineEntries,
  filterTimeline,
  mergeFeedItems,
} from "../../../src/discover/timeline";

/** A dated preview shorthand. */
function dated(title: string, iso: string): FeedItemPreview {
  return { title, datePublished: iso };
}

/** An undated preview shorthand (the honest shape for feeds that supply no
 * publish date — schema-optional by design). */
function undated(title: string): FeedItemPreview {
  return { title };
}

/** A minimal valid SubscriptionRecord (schema-shaped; these tests exercise
 * the pure policy, not the persistence boundary). */
function subscription(
  id: string,
  feedUrl: string,
  title: string,
  items: FeedItemPreview[],
): SubscriptionRecord {
  return {
    schemaVersion: 1,
    id,
    feedUrl,
    title,
    items,
    subscribedAt: "2026-09-01T00:00:00.000Z",
    lastFetchedAt: "2026-09-01T00:00:00.000Z",
  };
}

const FEED_A = "https://a.example.com/feed.xml";
const FEED_B = "https://b.example.com/feed.xml";

describe("buildTimeline (issue #123)", () => {
  it("interleaves multiple feeds newest-first by datePublished", () => {
    const timeline = buildTimeline([
      subscription("a", FEED_A, "Feed A", [
        dated("a-old", "2026-09-01T00:00:00.000Z"),
        dated("a-new", "2026-09-10T00:00:00.000Z"),
      ]),
      subscription("b", FEED_B, "Feed B", [
        dated("b-new", "2026-09-15T00:00:00.000Z"),
        dated("b-old", "2026-08-20T00:00:00.000Z"),
      ]),
    ]);
    expect(timeline.map((entry) => entry.item.title)).toEqual([
      "b-new",
      "a-new",
      "a-old",
      "b-old",
    ]);
    // Every entry carries its feed (the timeline labels the feed name).
    expect(timeline.map((entry) => entry.subscription.title)).toEqual([
      "Feed B",
      "Feed A",
      "Feed A",
      "Feed B",
    ]);
  });

  it("ranks undated entries after dated ones, never guessing a date", () => {
    const timeline = buildTimeline([
      subscription("a", FEED_A, "Feed A", [
        undated("a-undated"),
        dated("a-dated", "2026-01-01T00:00:00.000Z"),
      ]),
      subscription("b", FEED_B, "Feed B", [undated("b-undated")]),
    ]);
    expect(timeline.map((entry) => entry.item.title)).toEqual([
      "a-dated",
      "a-undated",
      "b-undated",
    ]);
  });

  it("gives undated entries a DETERMINISTIC position: feed URL, then cache index", () => {
    const cache = [
      subscription("a", FEED_A, "Feed A", [
        undated("a-first"),
        undated("a-second"),
      ]),
      subscription("b", FEED_B, "Feed B", [undated("b-only")]),
    ];
    // FEED_A < FEED_B lexicographically: feed A's block precedes feed B's,
    // and within a feed the cache order stands.
    expect(buildTimeline(cache).map((entry) => entry.item.title)).toEqual([
      "a-first",
      "a-second",
      "b-only",
    ]);
    // The same cache always produces the same timeline — across calls AND
    // across feed-list order (the input's list order must not matter).
    expect(buildTimeline([...cache].reverse())).toEqual(buildTimeline(cache));
    expect(buildTimeline(cache)).toEqual(buildTimeline(cache));
  });

  it("breaks equal-date ties deterministically by feed URL, then cache index", () => {
    const same = "2026-09-10T00:00:00.000Z";
    const entries = buildTimeline([
      subscription("b", FEED_B, "Feed B", [dated("b-tie", same)]),
      subscription("a", FEED_A, "Feed A", [
        dated("a-tie-2", same),
        dated("a-tie-1", same),
      ]),
    ]);
    // Feed A precedes feed B; within feed A the cache order stands
    // (a-tie-2 is the cache's first entry).
    expect(entries.map((entry) => entry.item.title)).toEqual([
      "a-tie-2",
      "a-tie-1",
      "b-tie",
    ]);
    // And the comparator alone is a total order: sorting either direction
    // of the input converges to the same sequence.
    const mirrored = [...entries].reverse().sort(compareTimelineEntries);
    expect(mirrored).toEqual(entries);
  });

  it("treats an unparseable timestamp as undated instead of NaN-comparing", () => {
    const rotten: FeedItemPreview = {
      title: "rotten",
      // The schema rejects this at every boundary; the policy tolerates it.
      datePublished: "not-a-date" as unknown as string,
    };
    const timeline = buildTimeline([
      subscription("a", FEED_A, "Feed A", [
        rotten,
        dated("dated", "2026-01-01T00:00:00.000Z"),
        undated("plain"),
      ]),
    ]);
    // The dated entry leads; the two undated entries keep their cache
    // order (rotten is the cache's first entry).
    expect(timeline.map((entry) => entry.item.title)).toEqual([
      "dated",
      "rotten",
      "plain",
    ]);
  });
});

describe("filterTimeline (issue #123)", () => {
  const cache = [
    subscription("a", FEED_A, "Feed A", [dated("a1", "2026-09-10T00:00:00.000Z")]),
    subscription("b", FEED_B, "Feed B", [dated("b1", "2026-09-15T00:00:00.000Z")]),
  ];
  const timeline = buildTimeline(cache);

  it("null selects every feed in the same order", () => {
    expect(filterTimeline(timeline, null)).toEqual(timeline);
  });

  it("narrows to one feed without re-ordering", () => {
    const filtered = filterTimeline(timeline, "b");
    expect(filtered.map((entry) => entry.item.title)).toEqual(["b1"]);
    expect(filtered.every((entry) => entry.subscription.id === "b")).toBe(true);
  });

  it("narrows to an empty list when the feed has no items", () => {
    expect(filterTimeline(timeline, "missing")).toEqual([]);
  });
});

describe("mergeFeedItems (issue #123 — the bounded cache merge)", () => {
  it("absorbs incoming items, keeps cached items the feed aged out, dedupes by identity", () => {
    const cached = [
      dated("kept-old", "2026-08-01T00:00:00.000Z"),
      { title: "same-link", link: "https://a.example.com/one", excerpt: "stale excerpt" },
    ];
    const incoming = [
      dated("fresh", "2026-09-20T00:00:00.000Z"),
      { title: "same-link", link: "https://a.example.com/one", excerpt: "fresh excerpt" },
    ];
    const merged = mergeFeedItems(cached, incoming);
    // The dated entries lead (fresh then kept-old, newest first); the
    // undated same-link entry ranks after them — dated above undated.
    expect(merged.map((item) => item.title)).toEqual(["fresh", "kept-old", "same-link"]);
    // Incoming wins field-for-field (fresher data corrects the cache).
    const sameLink = merged.find((item) => item.title === "same-link");
    expect(sameLink?.excerpt).toBe("fresh excerpt");
  });

  it("corrects a cached entry when the feed now supplies its date (same link identity)", () => {
    const merged = mergeFeedItems(
      [{ title: "corrected", link: "https://a.example.com/one" }],
      [
        {
          title: "corrected",
          link: "https://a.example.com/one",
          datePublished: "2026-09-20T00:00:00.000Z",
        },
      ],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.datePublished).toBe("2026-09-20T00:00:00.000Z");
  });

  it("caps the cache at MAX_FEED_ITEMS, evicting tail-first in the ONE order (undated ages out before dated)", () => {
    const cached: FeedItemPreview[] = [];
    for (let i = 0; i < MAX_FEED_ITEMS; i += 1) {
      cached.push(undated(`undated-${i}`));
    }
    const incoming: FeedItemPreview[] = [];
    for (let i = 0; i < 5; i += 1) {
      incoming.push(dated(`dated-${i}`, `2026-09-1${i}T00:00:00.000Z`));
    }
    const merged = mergeFeedItems(cached, incoming);
    expect(merged).toHaveLength(MAX_FEED_ITEMS);
    // All incoming dated entries survive at the head; the undated tail
    // aged out first, oldest-index first.
    expect(merged.slice(0, 5).map((item) => item.title)).toEqual([
      "dated-4",
      "dated-3",
      "dated-2",
      "dated-1",
      "dated-0",
    ]);
    expect(merged.at(-1)?.title).toBe("undated-24");
    expect(merged.some((item) => item.title === "undated-25")).toBe(false);
  });

  it("is deterministic: the same merge input always yields the same cache", () => {
    const cached = [undated("u1"), dated("d1", "2026-09-01T00:00:00.000Z")];
    const incoming = [undated("u2"), dated("d2", "2026-09-02T00:00:00.000Z")];
    expect(mergeFeedItems(cached, incoming)).toEqual(mergeFeedItems(cached, incoming));
  });
});
