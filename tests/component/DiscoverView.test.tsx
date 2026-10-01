// tests/component/DiscoverView.test.tsx
// Issues #121 + #123 — the Discover view's component contract: the ONE
// unified newest-first timeline across feeds (feed names on every entry,
// deterministic undated position), the single-feed filter, refresh on
// opening + manual Refresh (and NO polling), the stale state on a failed
// refresh (cached previews + last-successful-update time + Retry), removal
// through the destructive confirm, and the keyboard-reachable controls.
// Storage failures restore the form for retry (the D16-11 discipline).
// IngestionClient + the store seam are mocked: this file pins the VIEW's
// copy and state routing, not the pipeline (the unit suites own those).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiscoverView } from "../../src/routes/discover/DiscoverView";
import { discoverFeed, IngestionError } from "../../src/ingestion/IngestionClient";
import {
  deleteSubscription,
  hasSubscriptionForFeed,
  listSubscriptions,
  saveSubscription,
  updateSubscription,
} from "../../src/persistence/subscriptionsStore";
import type { FeedPreview } from "../../src/ingestion/types";
import type { FeedItemPreview, SubscriptionRecord } from "../../src/content/schema";

vi.mock("../../src/ingestion/IngestionClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/ingestion/IngestionClient")>()),
  discoverFeed: vi.fn(),
}));
vi.mock("../../src/persistence/subscriptionsStore", () => ({
  listSubscriptions: vi.fn(async () => ({ ok: true, subscriptions: [] })),
  hasSubscriptionForFeed: vi.fn(),
  saveSubscription: vi.fn(),
  updateSubscription: vi.fn(),
  deleteSubscription: vi.fn(),
}));

/** A minimal valid SubscriptionRecord fixture. */
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

function feedPreview(partial: Partial<FeedPreview>): FeedPreview {
  return { url: "https://a.example.com/feed.xml", title: "Feed A", items: [], ...partial };
}

const SUB_A = subscription("a", "https://a.example.com/feed.xml", "Feed A", [
  {
    title: "A dated item",
    link: "https://a.example.com/a1",
    datePublished: "2026-09-10T00:00:00.000Z",
    excerpt: "A excerpt",
  },
]);
const SUB_B = subscription("b", "https://b.example.com/feed.xml", "Feed B", [
  {
    title: "B newer item",
    link: "https://b.example.com/b1",
    datePublished: "2026-09-20T00:00:00.000Z",
  },
  { title: "B undated item", link: "https://b.example.com/b2" },
]);

function timelineTitles(): string[] {
  const timeline = document.querySelector(".discover-timeline");
  if (!timeline) throw new Error("timeline not mounted");
  return within(timeline as HTMLElement)
    .getAllByRole("heading", { level: 3 })
    .map((h) => (h.textContent ?? "").replace(" (opens in a new tab)", ""));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateSubscription).mockResolvedValue(true);
  // The default fetch is URL-aware: a refresh updates each row with the
  // FEED'S OWN name, so a shared canned title would rename everything.
  vi.mocked(discoverFeed).mockImplementation(async (url: string) => {
    if (url === "https://example.com/feed") return feedPreview({ url, title: "Feed" });
    return feedPreview({
      url,
      title: url === "https://b.example.com/feed.xml" ? "Feed B" : "Feed A",
    });
  });
  vi.mocked(listSubscriptions).mockResolvedValue({ ok: true, subscriptions: [] });
  vi.mocked(hasSubscriptionForFeed).mockResolvedValue(false);
  vi.mocked(saveSubscription).mockResolvedValue(undefined);
  vi.mocked(deleteSubscription).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe("DiscoverView — the unified timeline (issue #123)", () => {
  it("interleaves multiple feeds newest-first, labels every entry with its feed name, and gives the undated entry its deterministic tail position", async () => {
    vi.mocked(listSubscriptions).mockResolvedValue({
      ok: true,
      subscriptions: [SUB_A, SUB_B],
    });
    render(<DiscoverView hasAppHistory={false} />);
    await screen.findByText("Latest articles");
    expect(timelineTitles()).toEqual(["B newer item", "A dated item", "B undated item"]);

    // Every entry carries its feed name (the timeline's label).
    const timeline = document.querySelector(".discover-timeline") as HTMLElement;
    const feedNames = Array.from(timeline.querySelectorAll(".discover-item-feed")).map(
      (p) => p.textContent,
    );
    expect(feedNames).toEqual(["Feed B", "Feed A", "Feed B"]);

    // The management list remains: both feeds listed with their updated
    // stamp (the last-successful-update time).
    expect(screen.getByRole("heading", { name: "Your feeds" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Feed A" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Feed B" })).toBeVisible();
    expect(screen.getAllByText(/Updated /)).toHaveLength(2);

    // No per-item dismissal exists — the timeline is a window, not a queue.
    expect(document.querySelectorAll("[data-dismiss], .discover-item button")).toHaveLength(0);
  });

  it("narrows the timeline with the single-feed filter and restores it on All feeds", async () => {
    const user = userEvent.setup();
    vi.mocked(listSubscriptions).mockResolvedValue({
      ok: true,
      subscriptions: [SUB_A, SUB_B],
    });
    render(<DiscoverView hasAppHistory={false} />);
    await screen.findByText("Latest articles");

    const filter = screen.getByRole("combobox", { name: "Filter by feed" });
    await user.selectOptions(filter, "Feed A");
    expect(timelineTitles()).toEqual(["A dated item"]);

    await user.selectOptions(filter, "Feed B");
    expect(timelineTitles()).toEqual(["B newer item", "B undated item"]);

    await user.selectOptions(filter, screen.getByRole("option", { name: "All feeds" }));
    expect(timelineTitles()).toEqual(["B newer item", "A dated item", "B undated item"]);
  });

  it("shows the filtered no-items line when the selected feed has nothing to show", async () => {
    const user = userEvent.setup();
    vi.mocked(listSubscriptions).mockResolvedValue({
      ok: true,
      subscriptions: [subscription("empty", "https://e.example.com/feed.xml", "Empty Feed", [])],
    });
    // The on-open refresh carries the feed's own name back — keep it.
    vi.mocked(discoverFeed).mockResolvedValue(
      feedPreview({ url: "https://e.example.com/feed.xml", title: "Empty Feed" }),
    );
    render(<DiscoverView hasAppHistory={false} />);
    await screen.findByText("Latest articles");
    expect(screen.getByText("No recent items in your feeds.")).toBeVisible();
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by feed" }), "empty");
    expect(screen.getByText("No recent items from this feed.")).toBeVisible();
  });
});

describe("DiscoverView — refresh moments (issue #123)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes every feed ONCE on opening and never polls", async () => {
    vi.mocked(listSubscriptions).mockResolvedValue({
      ok: true,
      subscriptions: [SUB_A, SUB_B],
    });
    render(<DiscoverView hasAppHistory={false} />);
    await screen.findByText("Latest articles");
    await waitFor(() => expect(discoverFeed).toHaveBeenCalledTimes(2));
    expect(discoverFeed).toHaveBeenCalledWith("https://a.example.com/feed.xml");
    expect(discoverFeed).toHaveBeenCalledWith("https://b.example.com/feed.xml");

    // Ten minutes pass; nothing polls.
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(discoverFeed).toHaveBeenCalledTimes(2);
  });

  it("manual Refresh fetches new items, merges them into the timeline, and announces", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(listSubscriptions).mockResolvedValue({ ok: true, subscriptions: [SUB_A] });
    render(<DiscoverView hasAppHistory={false} />);
    await screen.findByText("Latest articles");
    await waitFor(() => expect(discoverFeed).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("A brand new item")).toBeNull();

    vi.mocked(discoverFeed).mockResolvedValue(
      feedPreview({
        items: [
          {
            title: "A brand new item",
            link: "https://a.example.com/new",
            datePublished: "2026-09-25T00:00:00.000Z",
          },
          ...SUB_A.items,
        ],
      }),
    );
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("A brand new item")).toBeVisible();
    expect(timelineTitles()).toEqual(["A brand new item", "A dated item"]);
    expect(await screen.findByText("Feeds refreshed.")).toBeVisible();
    expect(discoverFeed).toHaveBeenCalledTimes(2);
  });

  it("a failed refresh keeps the cached previews, the subscriptions list, and shows the stale notice with the last-successful-update time", async () => {
    vi.mocked(listSubscriptions).mockResolvedValue({ ok: true, subscriptions: [SUB_A] });
    vi.mocked(discoverFeed).mockRejectedValue(new IngestionError("fetch-failed", "offline"));
    render(<DiscoverView hasAppHistory={false} />);
    await screen.findByText("Latest articles");

    // The stale state: the ONE catalog's reason copy + the honest
    // last-known-good stamp + Retry. Nothing is lost.
    expect(
      await screen.findByText(/Couldn't reach this feed\. Showing saved items from /),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry Feed A" })).toBeVisible();
    expect(screen.getByText("A dated item")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Feed A" })).toBeVisible();
    expect(await screen.findByText("Couldn't refresh Feed A. Showing saved items.")).toBeVisible();
    expect(discoverFeed).toHaveBeenCalledTimes(1);
  });

  it("Retry re-fetches only the failed feed and the notice clears on success", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(listSubscriptions).mockResolvedValue({
      ok: true,
      subscriptions: [SUB_A, SUB_B],
    });
    vi.mocked(discoverFeed).mockImplementation(async (url: string) => {
      if (url === "https://a.example.com/feed.xml") {
        throw new IngestionError("fetch-failed", "offline");
      }
      return feedPreview({ url, title: "Feed B" });
    });
    render(<DiscoverView hasAppHistory={false} />);
    await screen.findByText("Latest articles");
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry Feed A" })).toBeVisible());
    // Feed B refreshed cleanly — no notice for it.
    expect(screen.queryByRole("button", { name: "Retry Feed B" })).toBeNull();
    const callsBefore = vi.mocked(discoverFeed).mock.calls.length;

    vi.mocked(discoverFeed).mockImplementation(async (url: string) =>
      feedPreview({ url, title: url === "https://a.example.com/feed.xml" ? "Feed A" : "Feed B" }),
    );
    await user.click(screen.getByRole("button", { name: "Retry Feed A" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Retry Feed A" })).toBeNull());
    // ONLY the failed feed was re-fetched.
    expect(vi.mocked(discoverFeed).mock.calls.length).toBe(callsBefore + 1);
    expect(discoverFeed).toHaveBeenLastCalledWith("https://a.example.com/feed.xml");
    expect(await screen.findByText("Refreshed Feed A.")).toBeVisible();
    expect(screen.getByText("A dated item")).toBeVisible();
  });
});

describe("DiscoverView — removal (issue #123)", () => {
  // jsdom implements the HTMLDialogElement interface but NOT showModal/close
  // behavior — stub the two methods at the prototype level (the AddDialog
  // suite precedent).
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event("close"));
    });
  });

  it("removes the subscription through the destructive confirm; the row and its previews go and the filter resets", async () => {
    const user = userEvent.setup();
    // Model the store so the post-remove reload reflects the deletion.
    const store = [SUB_A, SUB_B];
    vi.mocked(listSubscriptions).mockImplementation(async () => ({
      ok: true,
      subscriptions: [...store],
    }));
    vi.mocked(deleteSubscription).mockImplementation(async (id: string) => {
      const i = store.findIndex((s) => s.id === id);
      if (i >= 0) store.splice(i, 1);
    });
    render(<DiscoverView hasAppHistory={false} />);
    await screen.findByText("Latest articles");

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by feed" }), "Feed A");
    expect(timelineTitles()).toEqual(["A dated item"]);

    await user.click(screen.getByRole("button", { name: "Remove Feed A" }));
    const dlg = document.querySelector("dialog.discover-remove-confirm") as HTMLDialogElement;
    expect(dlg).toBeVisible();
    await user.click(within(dlg).getByRole("button", { name: "Remove subscription" }));

    expect(deleteSubscription).toHaveBeenCalledTimes(1);
    expect(deleteSubscription).toHaveBeenCalledWith("a");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Feed B" })).toBeVisible());
    expect(screen.queryByRole("heading", { name: "Feed A" })).toBeNull();
    expect(screen.getByText("Subscription removed.")).toBeVisible();
    // The removed feed's filter selection reset to All feeds.
    expect(screen.getByRole("combobox", { name: "Filter by feed" })).toHaveValue("");
    expect(timelineTitles()).toEqual(["B newer item", "B undated item"]);
  });
});

describe("DiscoverView — keyboard access (issue #123)", () => {
  it("the filter, Refresh, and the stale-state Retry are keyboard-reachable right after the subscribe form", async () => {
    vi.mocked(listSubscriptions).mockResolvedValue({ ok: true, subscriptions: [SUB_A] });
    vi.mocked(discoverFeed).mockRejectedValue(new IngestionError("fetch-failed"));
    render(<DiscoverView hasAppHistory={false} />);
    await screen.findByText("Latest articles");
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry Feed A" })).toBeVisible());

    screen.getByRole("textbox", { name: "Subscribe to a feed" }).focus();
    await userEvent.tab();
    expect(screen.getByRole("combobox", { name: "Filter by feed" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Refresh" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Retry Feed A" })).toHaveFocus();
  });
});

describe("DiscoverView — subscribe form resilience (issue #121)", () => {
  it.each(["lookup", "save"] as const)(
    "restores the form after a storage %s failure and allows retry",
    async (failure) => {
      const failingSeam = failure === "lookup" ? hasSubscriptionForFeed : saveSubscription;
      vi.mocked(failingSeam).mockRejectedValueOnce(new Error("Storage unavailable"));
      const user = userEvent.setup();
      render(<DiscoverView hasAppHistory={false} />);
      const input = screen.getByRole("textbox", { name: "Subscribe to a feed" });
      await user.type(input, "https://example.com/feed");
      await user.click(screen.getByRole("button", { name: "Subscribe" }));
      expect(await screen.findByText("Couldn't save this subscription. Try again.")).toBeVisible();
      expect(input).toBeEnabled();
      expect(input).toHaveValue("https://example.com/feed");
      await user.click(screen.getByRole("button", { name: "Subscribe" }));
      await waitFor(() => expect(screen.getByText("Subscribed to Feed.")).toBeVisible());
      expect(input).toBeEnabled();
      expect(input).toHaveValue("");
    },
  );
});

it("keeps the focused article when opening refresh prepends an item", async () => {
  vi.mocked(listSubscriptions).mockResolvedValue({ ok: true, subscriptions: [SUB_A] });
  let finish!: (value: FeedPreview) => void;
  vi.mocked(discoverFeed).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<DiscoverView hasAppHistory={false} />);
  const link = await screen.findByRole("link", { name: /A dated item/ });
  link.focus();
  finish(
    feedPreview({
      items: [
        {
          title: "New article",
          link: "https://a.example.com/new",
          datePublished: "2026-09-30T00:00:00.000Z",
        },
      ],
    }),
  );
  await screen.findByRole("link", { name: /New article/ });
  expect(link).toHaveFocus();
  expect(link).toHaveAttribute("href", "https://a.example.com/a1");
});

it("shows Retry for an opening save failure while displaying other successful refreshes", async () => {
  vi.mocked(listSubscriptions).mockResolvedValue({ ok: true, subscriptions: [SUB_A, SUB_B] });
  vi.mocked(updateSubscription).mockImplementation(async (record) => {
    if (record.id === "a") throw new Error("storage full");
    return true;
  });
  vi.mocked(discoverFeed).mockImplementation(async (url) =>
    feedPreview({
      url,
      title: url === SUB_A.feedUrl ? "Feed A" : "Feed B",
      items: [{ title: "Fresh article", link: "https://example.com/fresh" }],
    }),
  );
  render(<DiscoverView hasAppHistory={false} />);
  expect(await screen.findByRole("button", { name: "Retry Feed A" })).toBeVisible();
  expect(screen.getByRole("link", { name: /Fresh article/ })).toBeVisible();
  expect(screen.getByRole("link", { name: /A dated item/ })).toBeVisible();
});
