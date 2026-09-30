import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiscoverView } from "../../src/routes/discover/DiscoverView";
import { discoverFeed } from "../../src/ingestion/IngestionClient";
import { hasSubscriptionForFeed, saveSubscription } from "../../src/persistence/subscriptionsStore";

vi.mock("../../src/ingestion/IngestionClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/ingestion/IngestionClient")>()),
  discoverFeed: vi.fn(),
}));
vi.mock("../../src/persistence/subscriptionsStore", () => ({
  listSubscriptions: vi.fn(async () => ({ ok: true, subscriptions: [] })),
  hasSubscriptionForFeed: vi.fn(),
  saveSubscription: vi.fn(),
  deleteSubscription: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(discoverFeed).mockResolvedValue({
    url: "https://example.com/feed",
    title: "Feed",
    items: [],
  });
  vi.mocked(hasSubscriptionForFeed).mockResolvedValue(false);
  vi.mocked(saveSubscription).mockResolvedValue(undefined);
});

it.each(["lookup", "save"])(
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
