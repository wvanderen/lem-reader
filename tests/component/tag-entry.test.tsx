// tests/component/tag-entry.test.tsx
// Issue #75 (decision #71) — the reader's TagEntry converges on the ONE
// shared TagPicker:
//   - commits write through per change (default setArticleTags; the book
//     override routes to saveTags — D12-04)
//   - suggestion stats load LAZILY on first focus (never at mount — the
//     host surfaces mount inertly; an eager read would tax every article
//     open) and refresh after commits
//   - INERT at mount (Pitfall 8-5): no focus steal, no stats read
//   - Dexie failures land in the calm .status region (A11Y-08)
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../src/ingestion/library/tagsStore", () => ({
  setArticleTags: vi.fn(),
  loadTagStats: vi.fn(),
}));

import { TagEntry } from "../../src/reader/TagEntry";
import { setArticleTags, loadTagStats } from "../../src/ingestion/library/tagsStore";

const setArticleTagsMock = vi.mocked(setArticleTags);
const loadTagStatsMock = vi.mocked(loadTagStats);

beforeEach(() => {
  vi.clearAllMocks();
  setArticleTagsMock.mockResolvedValue(undefined);
  loadTagStatsMock.mockResolvedValue([
    { tag: "essays", count: 3 },
    { tag: "slow-web", count: 1 },
  ]);
});

describe("TagEntry on the shared picker", () => {
  it("renders the fieldset with the picker, inert at mount (Pitfall 8-5)", () => {
    render(<TagEntry articleId="a1" tags={["existing"]} />);
    expect(screen.getByText("Tags")).toBeInTheDocument();
    expect(screen.getByText("existing")).toBeInTheDocument();
    expect(screen.getByLabelText("Add or search a tag")).not.toHaveFocus();
    // No stats read at mount — the lazy load waits for focus.
    expect(loadTagStatsMock).not.toHaveBeenCalled();
  });

  it("first focus triggers the lazy stats load (suggestions appear)", async () => {
    const user = userEvent.setup();
    render(<TagEntry articleId="a1" tags={[]} />);
    await user.click(screen.getByLabelText("Add or search a tag"));
    await waitFor(() => {
      const options = within(screen.getByRole("listbox")).getAllByRole("option");
      expect(options.map((o) => o.textContent)).toEqual(["essays", "slow-web"]);
    });
  });

  it("commits write through setArticleTags per change (routed casing)", async () => {
    const user = userEvent.setup();
    render(<TagEntry articleId="a1" tags={["existing"]} />);
    const input = screen.getByLabelText("Add or search a tag");
    await user.click(input); // the focus that triggers ensureStats
    await user.type(input, "essays");
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(setArticleTagsMock).toHaveBeenCalledWith("a1", ["existing", "essays"]),
    );
  });

  it("the book override routes commits to saveTags (D12-04)", async () => {
    const saveTags = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<TagEntry articleId="book-1" tags={[]} saveTags={saveTags} />);
    const input = screen.getByLabelText("Add or search a tag");
    await user.click(input);
    await user.type(input, "books");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(saveTags).toHaveBeenCalledWith(["books"]));
    expect(setArticleTagsMock).not.toHaveBeenCalled();
  });

  it("a write failure lands in the calm .status region", async () => {
    setArticleTagsMock.mockRejectedValue(new Error("quota"));
    const user = userEvent.setup();
    render(<TagEntry articleId="a1" tags={[]} />);
    const input = screen.getByLabelText("Add or search a tag");
    await user.click(input);
    await user.type(input, "essays");
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Couldn't save tag."),
    );
  });
});
