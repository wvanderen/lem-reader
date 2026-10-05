// tests/component/DiscoverView.test.tsx
// Issues #121 + #123 + #124 — the Discover view's component contract: the
// ONE unified newest-first timeline across feeds (feed names on every
// entry, deterministic undated position), the single-feed filter, refresh
// on opening + manual Refresh (and NO polling), the stale state on a
// failed refresh (cached previews + last-successful-update time + Retry),
// removal through the destructive confirm, the keyboard-reachable
// controls, and the inline add (+ ingests the LINKED PAGE through the
// policy, swaps to In library + Open, never auto-opens, refuses calmly,
// and stays retryable).
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
import { saveFeedItem } from "../../src/discover/saveItem";
import type { FeedPreview } from "../../src/ingestion/types";
import type { FeedItemPreview, SubscriptionRecord } from "../../src/content/schema";
import type { CanonicalArticle } from "../../src/content/types";

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
// Issue #124 — the + press's policy is mocked (the unit suite owns
// saveFeedItem); the pure pre-press derivation stays real.
vi.mock("../../src/discover/saveItem", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/discover/saveItem")>()),
  saveFeedItem: vi.fn(),
}));

// Issue #124 — the ONE library snapshot hook is mocked to a controllable
// article list (the view reads snapshot.articles for the pre-press
// "In library" state; the real hook's Dexie graph is out of scope here —
// the review-view suites' mock precedent). The mock SUBSCRIBES to the real
// invalidation bus, so a save's invalidateLibrarySnapshot() re-derives the
// snapshot exactly as the live hook does.
const { snapshotState, snapshotReloadWith } = vi.hoisted(() => {
  const state = { articles: [] as unknown[], version: 0, status: "ready" as "ready" | "error" };
  return {
    snapshotState: state,
    snapshotReloadWith: (articles: unknown[]) => {
      state.articles = articles;
      state.version += 1;
    },
  };
});
vi.mock("../../src/ingestion/library/useLibrarySnapshot", async () => {
  const { useSyncExternalStore } = await import("react");
  const { EMPTY_LIBRARY_SNAPSHOT, onLibrarySnapshotInvalidated } =
    await import("../../src/ingestion/library/librarySnapshot");
  return {
    useLibrarySnapshot: () => {
      useSyncExternalStore(onLibrarySnapshotInvalidated, () => snapshotState.version);
      return {
        status: snapshotState.status,
        snapshot: {
          ...EMPTY_LIBRARY_SNAPSHOT,
          articles: snapshotState.articles,
        } as unknown as import("../../src/ingestion/library/librarySnapshot").LibrarySnapshot,
      };
    },
  };
});

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

/** A minimal library row for the snapshot mock (only what
 * savedArticleIdForLink reads: id + provenance.sourceUrl). */
function articleRow(id: string, sourceUrl: string): CanonicalArticle {
  return {
    id,
    provenance: { sourceUrl, title: id },
  } as unknown as CanonicalArticle;
}

beforeEach(() => {
  snapshotState.status = "ready";
  vi.clearAllMocks();
  snapshotReloadWith([]);
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
    // (The per-item controls that DO exist are issue #124's Save affor-
    // dances: one per LINKED entry, none on the linkless one.)
    expect(document.querySelectorAll("[data-dismiss]")).toHaveLength(0);
    expect(document.querySelectorAll(".discover-item .discover-item-save")).toHaveLength(3);
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
    snapshotState.status = "ready";
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
    snapshotState.status = "ready";
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

describe("DiscoverView — inline add (issue #124)", () => {
  it("the + press ingests the LINKED PAGE through the policy, announces the save, and swaps to In library + Open without navigating", async () => {
    const user = userEvent.setup();
    vi.mocked(listSubscriptions).mockResolvedValue({ ok: true, subscriptions: [SUB_A] });
    // The real flow: save → invalidateLibrarySnapshot() → the snapshot
    // reload now carries the row. The mock models both halves.
    vi.mocked(saveFeedItem).mockImplementation(async (link) => {
      snapshotReloadWith([articleRow("a-example-com-a1", link)]);
      return { outcome: "saved", articleId: "a-example-com-a1" };
    });
    render(<DiscoverView hasAppHistory={false} />);
    await screen.findByText("Latest articles");

    await user.click(screen.getByRole("button", { name: "Save A dated item" }));

    // The policy got the link (the pipeline owns the guarded ingest; the
    // feed summary/cached text never ride this call).
    expect(saveFeedItem).toHaveBeenCalledTimes(1);
    expect(saveFeedItem).toHaveBeenCalledWith("https://a.example.com/a1");
    // The announcement + the saved state (the ONE StatusRegion).
    expect(await screen.findByText("Saved to your library.")).toBeVisible();
    expect(screen.getByText("In library")).toBeVisible();
    const open = screen.getByRole("link", { name: "Open A dated item" });
    expect(open).toHaveAttribute("href", "#/article/a-example-com-a1");
    // The + is gone (one affordance per preview, ever in one of two states).
    expect(screen.queryByRole("button", { name: "Save A dated item" })).toBeNull();
    // The article never AUTO-opens: the reader stays in Discover, so the
    // never-opened addition remains Unread.
    expect(window.location.hash).toBe("");
  });

  it("a duplicate press resolves to the EXISTING row (one library item; annotations untouched by the no-save policy)", async () => {
    const user = userEvent.setup();
    vi.mocked(listSubscriptions).mockResolvedValue({ ok: true, subscriptions: [SUB_A] });
    // The row is ALREADY in the library under a DIFFERENT sourceUrl (the
    // redirect alias — what makes the + resolvable only by pressing), so
    // the preview still shows + until the pipeline resolves the press.
    snapshotReloadWith([articleRow("already-there-id", "https://canonical.example.com/a1")]);
    vi.mocked(saveFeedItem).mockResolvedValue({
      outcome: "already-in-library",
      articleId: "already-there-id",
    });
    render(<DiscoverView hasAppHistory={false} />);
    await screen.findByText("Latest articles");

    await user.click(screen.getByRole("button", { name: "Save A dated item" }));

    expect(await screen.findByText("Already in your library.")).toBeVisible();
    // The duplicate still lands on In library + Open — pointing at the row
    // that was ALREADY there (the canonical id the refusal resolved).
    expect(screen.getByText("In library")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open A dated item" })).toHaveAttribute(
      "href",
      "#/article/already-there-id",
    );
    expect(saveFeedItem).toHaveBeenCalledTimes(1);
  });

  it("an id-less duplicate announces calmly and keeps the + (no Open affordance is fabricated)", async () => {
    const user = userEvent.setup();
    vi.mocked(listSubscriptions).mockResolvedValue({ ok: true, subscriptions: [SUB_A] });
    vi.mocked(saveFeedItem).mockResolvedValue({
      outcome: "already-in-library",
      articleId: undefined,
    });
    render(<DiscoverView hasAppHistory={false} />);
    await screen.findByText("Latest articles");

    await user.click(screen.getByRole("button", { name: "Save A dated item" }));

    expect(await screen.findByText("Already in your library.")).toBeVisible();
    expect(screen.queryByText("In library")).toBeNull();
    expect(screen.getByRole("button", { name: "Save A dated item" })).toBeVisible();
  });

  it("a refusal announces the page-voice copy and the + stays retryable", async () => {
    const user = userEvent.setup();
    vi.mocked(listSubscriptions).mockResolvedValue({ ok: true, subscriptions: [SUB_A] });
    vi.mocked(saveFeedItem).mockResolvedValueOnce({
      outcome: "refused",
      reason: "fetch-failed",
    });
    render(<DiscoverView hasAppHistory={false} />);
    await screen.findByText("Latest articles");

    await user.click(screen.getByRole("button", { name: "Save A dated item" }));
    expect(await screen.findByText("Couldn't reach this page.")).toBeVisible();
    // Retryable: the + remains (the refused attempt saved nothing).
    const retry = screen.getByRole("button", { name: "Save A dated item" });
    expect(retry).toBeEnabled();

    vi.mocked(saveFeedItem).mockImplementation(async (link) => {
      snapshotReloadWith([articleRow("a-example-com-a1", link)]);
      return { outcome: "saved", articleId: "a-example-com-a1" };
    });
    await user.click(retry);
    expect(await screen.findByText("Saved to your library.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open A dated item" })).toHaveAttribute(
      "href",
      "#/article/a-example-com-a1",
    );
    expect(saveFeedItem).toHaveBeenCalledTimes(2);
  });

  it("a preview already in the library renders In library + Open with no press (the snapshot derivation)", async () => {
    snapshotReloadWith([articleRow("a-example-com-a1", "https://a.example.com/a1")]);
    vi.mocked(listSubscriptions).mockResolvedValue({ ok: true, subscriptions: [SUB_A] });
    render(<DiscoverView hasAppHistory={false} />);
    await screen.findByText("Latest articles");

    expect(screen.getByText("In library")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open A dated item" })).toHaveAttribute(
      "href",
      "#/article/a-example-com-a1",
    );
    expect(screen.queryByRole("button", { name: "Save A dated item" })).toBeNull();
    expect(saveFeedItem).not.toHaveBeenCalled();
  });

  it("a mid-session library removal re-opens the + (a saved-state resolution never outlives its row)", async () => {
    const user = userEvent.setup();
    vi.mocked(listSubscriptions).mockResolvedValue({ ok: true, subscriptions: [SUB_A] });
    vi.mocked(saveFeedItem).mockImplementation(async (link) => {
      snapshotReloadWith([articleRow("a-example-com-a1", link)]);
      return { outcome: "saved", articleId: "a-example-com-a1" };
    });
    const { rerender } = render(<DiscoverView hasAppHistory={false} />);
    await screen.findByText("Latest articles");
    await user.click(screen.getByRole("button", { name: "Save A dated item" }));
    await screen.findByText("In library");

    // The article is removed elsewhere mid-session: the invalidation
    // broadcast reloads the snapshot (asynchronously, in the real hook —
    // the synchronous mock rerenders with the reloaded articles).
    snapshotReloadWith([]);
    rerender(<DiscoverView hasAppHistory={false} />);

    // The preview is honest again: the + is back, no dead Open link.
    expect(screen.getByRole("button", { name: "Save A dated item" })).toBeVisible();
    expect(screen.queryByText("In library")).toBeNull();
    expect(screen.queryByRole("link", { name: "Open A dated item" })).toBeNull();
  });

  it("a linkless preview offers no save control (there is no page to save)", async () => {
    vi.mocked(listSubscriptions).mockResolvedValue({
      ok: true,
      subscriptions: [
        subscription("c", "https://c.example.com/feed.xml", "Feed C", [
          { title: "Linkless entry", excerpt: "No link rides this one." },
        ]),
      ],
    });
    render(<DiscoverView hasAppHistory={false} />);
    await screen.findByText("Latest articles");

    expect(screen.getByText("Linkless entry")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save Linkless entry" })).toBeNull();
    expect(screen.queryByText("In library")).toBeNull();
  });

  it("the + is keyboard-reachable after the title link and Enter activates the save", async () => {
    const user = userEvent.setup();
    vi.mocked(listSubscriptions).mockResolvedValue({ ok: true, subscriptions: [SUB_A] });
    vi.mocked(saveFeedItem).mockImplementation(async (link) => {
      snapshotReloadWith([articleRow("a-example-com-a1", link)]);
      return { outcome: "saved", articleId: "a-example-com-a1" };
    });
    render(<DiscoverView hasAppHistory={false} />);
    await screen.findByText("Latest articles");

    screen.getByRole("link", { name: /A dated item/ }).focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Save A dated item" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await screen.findByText("Saved to your library.")).toBeVisible();
    expect(screen.getByText("In library")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open A dated item" })).toHaveFocus();
  });
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

it("discloses failed library reads and retains a confirmed save until a fresh snapshot settles", async () => {
  snapshotState.status = "error";
  vi.mocked(listSubscriptions).mockResolvedValue({ ok: true, subscriptions: [SUB_A] });
  vi.mocked(saveFeedItem).mockResolvedValue({ outcome: "saved", articleId: "saved-id" });
  render(<DiscoverView hasAppHistory={false} />);
  await screen.findByText("Latest articles");
  expect(screen.getByText("Couldn't check your library. Try again.")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Save A dated item" }));
  expect(await screen.findByRole("link", { name: "Open A dated item" })).toHaveAttribute(
    "href",
    "#/article/saved-id",
  );
  snapshotState.status = "ready";
  snapshotReloadWith([articleRow("saved-id", "https://a.example.com/a1")]);
  await userEvent.click(screen.getByRole("button", { name: "Retry library check" }));
  await waitFor(() =>
    expect(screen.queryByText("Couldn't check your library. Try again.")).toBeNull(),
  );
  expect(screen.getByRole("link", { name: "Open A dated item" })).toBeVisible();
});

it("returns focus to the activated preview when the same link appears in two feeds", async () => {
  const second = { ...SUB_B, items: [{ ...SUB_A.items[0], title: "Syndicated item" }] };
  vi.mocked(listSubscriptions).mockResolvedValue({ ok: true, subscriptions: [SUB_A, second] });
  vi.mocked(saveFeedItem).mockImplementation(async (link) => {
    snapshotReloadWith([articleRow("shared-id", link)]);
    return { outcome: "saved", articleId: "shared-id" };
  });
  render(<DiscoverView hasAppHistory={false} />);
  const save = await screen.findByRole("button", { name: "Save Syndicated item" });
  save.focus();
  await userEvent.keyboard("{Enter}");
  expect(await screen.findByRole("link", { name: "Open Syndicated item" })).toHaveFocus();
});

it("replaces the save icon with one spinner while ingestion is pending", async () => {
  vi.mocked(listSubscriptions).mockResolvedValue({ ok: true, subscriptions: [SUB_A] });
  vi.mocked(saveFeedItem).mockReturnValue(new Promise(() => {}));
  render(<DiscoverView hasAppHistory={false} />);
  const button = await screen.findByRole("button", { name: "Save A dated item" });
  await userEvent.click(button);
  expect(button).toHaveAttribute("aria-busy", "true");
  expect(button).toBeDisabled();
  expect(button.querySelectorAll("svg")).toHaveLength(1);
});
