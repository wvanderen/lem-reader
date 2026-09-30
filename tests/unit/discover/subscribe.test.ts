// tests/unit/discover/subscribe.test.ts
// Issue #122 — the subscribe POLICY with an Atom feed: the Atom shape rides
// the ONE subscribe-and-persist path (never a fork), so these cells pin that
// an Atom FeedPreview (a) persists through SubscriptionRecordSchema.parse at
// the boundary, (b) dedupes by the response's NORMALIZED feed URL — the same
// duplicate-subscription rule as RSS — and (c) an invalid address refuses
// before any network cost.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/ingestion/IngestionClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/ingestion/IngestionClient")>()),
  discoverFeed: vi.fn(),
}));
vi.mock("../../../src/persistence/subscriptionsStore", () => ({
  hasSubscriptionForFeed: vi.fn(),
  saveSubscription: vi.fn(),
}));

import { discoverFeed } from "../../../src/ingestion/IngestionClient";
import {
  hasSubscriptionForFeed,
  saveSubscription,
} from "../../../src/persistence/subscriptionsStore";
import { subscribeToFeed } from "../../../src/discover/subscribe";
import { SubscriptionRecordSchema } from "../../../src/content/schema";

/** An Atom-shaped FeedPreview as the pipeline returns it (rel=alternate
 * link, ISO-8601 date, stripped plain-text excerpt). */
const ATOM_PREVIEW = {
  url: "https://atom.example.com/feed.xml",
  title: "Atom Journal",
  description: "Quiet entries",
  items: [
    {
      title: "Atom entry one",
      link: "https://atom.example.com/one",
      datePublished: "2024-10-03T10:00:00.000Z",
      excerpt: "Plain summary text",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(discoverFeed).mockResolvedValue(ATOM_PREVIEW);
  vi.mocked(hasSubscriptionForFeed).mockResolvedValue(false);
  vi.mocked(saveSubscription).mockResolvedValue(undefined);
});

describe("subscribeToFeed with an Atom feed (issue #122)", () => {
  it("subscribes: the response's normalized feed URL is the dedupe key AND the saved feedUrl", async () => {
    const result = await subscribeToFeed("https://atom.example.com/feed.xml");
    expect(result.outcome).toBe("subscribed");
    if (result.outcome !== "subscribed") return;
    expect(hasSubscriptionForFeed).toHaveBeenCalledWith("https://atom.example.com/feed.xml");
    expect(saveSubscription).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(saveSubscription).mock.calls[0]![0]!;
    // The constructed row passes the SAME parse the Dexie read path runs
    // later (Zod-at-boundary — a mismatch can never persist).
    expect(SubscriptionRecordSchema.parse(saved)).toEqual(saved);
    expect(saved.feedUrl).toBe("https://atom.example.com/feed.xml");
    expect(saved.title).toBe("Atom Journal");
    expect(saved.items).toEqual(ATOM_PREVIEW.items);
    expect(saved.id).toEqual(expect.any(String));
    expect(new Date(saved.subscribedAt).toString()).not.toBe("Invalid Date");
    expect(result.subscription).toEqual(saved);
  });

  it("refuses a duplicate Atom subscription calmly — already-subscribed, no second row", async () => {
    vi.mocked(hasSubscriptionForFeed).mockResolvedValue(true);
    const result = await subscribeToFeed("https://atom.example.com/feed.xml");
    expect(result).toEqual({ outcome: "already-subscribed" });
    expect(saveSubscription).not.toHaveBeenCalled();
  });

  it("matches the duplicate rule across URL spellings (fragment/default-port noise normalizes away)", async () => {
    // The typed spelling is normalized BEFORE the fetch; the response URL
    // (the canonical identity) drives the dedupe lookup either way.
    vi.mocked(hasSubscriptionForFeed).mockResolvedValue(true);
    const result = await subscribeToFeed("https://atom.example.com:443/feed.xml#latest");
    expect(result).toEqual({ outcome: "already-subscribed" });
    expect(discoverFeed).toHaveBeenCalledWith("https://atom.example.com/feed.xml");
    expect(saveSubscription).not.toHaveBeenCalled();
  });

  it("refuses an invalid address before any network cost", async () => {
    const result = await subscribeToFeed("javascript:alert(1)");
    expect(result).toEqual({ outcome: "invalid-url" });
    expect(discoverFeed).not.toHaveBeenCalled();
    expect(saveSubscription).not.toHaveBeenCalled();
  });
});
