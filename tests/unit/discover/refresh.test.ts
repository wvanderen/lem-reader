// tests/unit/discover/refresh.test.ts
// Issue #123 — the ONE refresh-and-persist policy: a successful fetch
// merges into the bounded cache and advances `lastFetchedAt` (the honest
// last-known-good stamp); a failed fetch persists NOTHING — the cached
// previews and the stamp survive untouched (the offline/failed-refresh
// contract). The row's identity (id, feedUrl, subscribedAt) never changes
// at refresh time.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/ingestion/IngestionClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/ingestion/IngestionClient")>()),
  discoverFeed: vi.fn(),
}));
vi.mock("../../../src/persistence/subscriptionsStore", () => ({
  saveSubscription: vi.fn(),
}));

import { discoverFeed, IngestionError } from "../../../src/ingestion/IngestionClient";
import { saveSubscription } from "../../../src/persistence/subscriptionsStore";
import { refreshSubscription } from "../../../src/discover/refresh";
import type { FeedPreview } from "../../../src/ingestion/types";
import type { SubscriptionRecord } from "../../../src/content/schema";

const RECORD: SubscriptionRecord = {
  schemaVersion: 1,
  id: "sub-1",
  feedUrl: "https://a.example.com/feed.xml",
  title: "Feed A",
  description: "The old description",
  items: [{ title: "cached", datePublished: "2026-08-01T00:00:00.000Z" }],
  subscribedAt: "2026-09-01T00:00:00.000Z",
  lastFetchedAt: "2026-09-01T00:00:00.000Z",
};

function feedPreview(partial: Partial<FeedPreview>): FeedPreview {
  return {
    url: RECORD.feedUrl,
    title: "Feed A",
    items: [],
    ...partial,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(saveSubscription).mockResolvedValue(undefined);
});

describe("refreshSubscription (issue #123)", () => {
  it("fetches the stored (already-normalized) feed URL", async () => {
    vi.mocked(discoverFeed).mockResolvedValue(feedPreview({}));
    await refreshSubscription(RECORD);
    expect(discoverFeed).toHaveBeenCalledWith("https://a.example.com/feed.xml");
  });

  it("persists the merged cache under the SAME identity and advances lastFetchedAt", async () => {
    vi.mocked(discoverFeed).mockResolvedValue(
      feedPreview({
        items: [{ title: "fresh", datePublished: "2026-09-25T00:00:00.000Z" }],
      }),
    );
    const result = await refreshSubscription(RECORD);
    expect(result.outcome).toBe("refreshed");
    if (result.outcome !== "refreshed") return;
    expect(saveSubscription).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(saveSubscription).mock.calls[0]![0]!;
    expect(saved.id).toBe(RECORD.id);
    expect(saved.feedUrl).toBe(RECORD.feedUrl);
    expect(saved.subscribedAt).toBe(RECORD.subscribedAt);
    expect(saved.items.map((item) => item.title)).toEqual(["fresh", "cached"]);
    expect(new Date(saved.lastFetchedAt!).toString()).not.toBe("Invalid Date");
    expect(result.subscription).toEqual(saved);
  });

  it("updates the feed's own name and drops a description the feed no longer supplies", async () => {
    vi.mocked(discoverFeed).mockResolvedValue(feedPreview({ title: "Feed A (renamed)" }));
    const result = await refreshSubscription(RECORD);
    if (result.outcome !== "refreshed") throw new Error("expected refreshed");
    expect(result.subscription.title).toBe("Feed A (renamed)");
    expect("description" in result.subscription).toBe(false);
  });

  it("keeps the description when the feed still supplies one", async () => {
    vi.mocked(discoverFeed).mockResolvedValue(
      feedPreview({ description: "The new description" }),
    );
    const result = await refreshSubscription(RECORD);
    if (result.outcome !== "refreshed") throw new Error("expected refreshed");
    expect(result.subscription.description).toBe("The new description");
  });

  it("persists NOTHING on a refused fetch — the cache and stamp survive untouched", async () => {
    vi.mocked(discoverFeed).mockRejectedValue(
      new IngestionError("fetch-failed", "offline"),
    );
    const result = await refreshSubscription(RECORD);
    expect(result).toEqual({ outcome: "failed", reason: "fetch-failed" });
    expect(saveSubscription).not.toHaveBeenCalled();
  });

  it("routes an unexpected throw to the calm server-error arm, still writing nothing", async () => {
    vi.mocked(discoverFeed).mockRejectedValue(new Error("boom"));
    const result = await refreshSubscription(RECORD);
    expect(result).toEqual({ outcome: "failed", reason: "server-error" });
    expect(saveSubscription).not.toHaveBeenCalled();
  });
});
