// tests/unit/library/row-tags.test.tsx
// Issue #75 (decision #71) — the row-tags surface:
//   - LibraryRow renders the tag-glyph trigger ONLY when onTags is wired,
//     positioned first-after mark-read in the cluster, carrying the row's
//     anchor-name (the popover's position-anchor source)
//   - RowTagsPopover hosts the shared TagPicker seeded from the target's
//     tags; every change writes through setArticleTags (no lost edits on
//     light-dismiss); Done routes through onClose; Dexie failures land in
//     the calm .status region
//
// jsdom implements no popover lifecycle — showPopover/hidePopover are
// prototype-stubbed (the HTMLDialogElement stub discipline); the real
// open/close/anchor geometry is the e2e suite's job (Pitfall 2).
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CanonicalArticle } from "../../../src/content/types";

vi.mock("../../../src/ingestion/library/tagsStore", () => ({
  setArticleTags: vi.fn(),
}));

import { LibraryRow, rowTagsAnchorName } from "../../../src/ingestion/library/LibraryRow";
import { RowTagsPopover } from "../../../src/ingestion/library/RowTagsPopover";
import { setArticleTags } from "../../../src/ingestion/library/tagsStore";

const setArticleTagsMock = vi.mocked(setArticleTags);

beforeEach(() => {
  // jsdom has no popover lifecycle; the sync effect only needs the calls
  // not to throw. (:popover-open matches() resolves false in nwsapi.)
  HTMLDivElement.prototype.showPopover = vi.fn();
  HTMLDivElement.prototype.hidePopover = vi.fn();
  setArticleTagsMock.mockResolvedValue(undefined);
});

function sampleArticle(overrides: Partial<CanonicalArticle> = {}): CanonicalArticle {
  return {
    id: "row-article",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/row",
      title: "Row Article",
      retrievedAt: "2026-09-24T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "0".repeat(64),
    },
    blocks: [{ kind: "paragraph", content: [{ text: "Body.", marks: [] }] }],
    footnotes: [],
    ...overrides,
  } as CanonicalArticle;
}

describe("LibraryRow: the tag trigger", () => {
  it("renders the quiet tag-glyph button when onTags is wired", () => {
    render(
      <ul>
        <LibraryRow article={sampleArticle()} total={10} onTags={() => {}} />
      </ul>,
    );
    const trigger = screen.getByRole("button", { name: "Tags for Row Article" });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("the trigger carries the row's anchor-name (the popover anchor source)", () => {
    render(
      <ul>
        <LibraryRow article={sampleArticle()} total={10} onTags={() => {}} />
      </ul>,
    );
    const trigger = screen.getByRole("button", { name: "Tags for Row Article" });
    expect((trigger as HTMLElement).style.anchorName).toBe(rowTagsAnchorName("row-article"));
  });

  it("no onTags → no trigger (fixtures and chapter rows stay chip-only)", () => {
    render(
      <ul>
        <LibraryRow article={sampleArticle()} total={10} />
      </ul>,
    );
    expect(screen.queryByRole("button", { name: /Tags for/ })).not.toBeInTheDocument();
  });

  it("sits first-after mark-read in the cluster (Q1A order)", () => {
    render(
      <ul>
        <LibraryRow
          article={sampleArticle()}
          total={10}
          onTags={() => {}}
          onEdit={() => {}}
          onRemove={() => {}}
          onReadingStateChange={vi.fn()}
        />
      </ul>,
    );
    const cluster = document.querySelector(".library-row-actions")!;
    const classes = Array.from(cluster.children).map((el) => el.className);
    expect(classes[0]).toContain("reading-state");
    expect(classes[1]).toContain("library-row-tag-trigger");
    expect(classes[2]).toContain("library-row-edit");
    expect(classes[classes.length - 1]).toContain("library-row-remove");
  });
});

describe("RowTagsPopover: commit + close", () => {
  const target = {
    id: "row-article",
    title: "Row Article",
    tags: ["existing"],
    anchor: rowTagsAnchorName("row-article"),
  };
  const stats = [
    { tag: "existing", count: 1 },
    { tag: "essays", count: 3 },
  ];

  /** jsdom 30 applies the UA popover rule ([popover] → display:none when
   *  closed) but implements no open lifecycle. Lift the panel with an
   *  inline display override — the TocPanel.test.tsx discipline (inline
   *  beats UA in the cascade; test-only; the real open/close/anchor
   *  lifecycle is the e2e suite's job). */
  function liftPanel() {
    const panel = document.querySelector(".row-tags-popover") as HTMLElement;
    if (panel) panel.style.display = "block";
  }

  it("renders the hidden panel only while the target is null", () => {
    render(<RowTagsPopover target={null} stats={stats} onClose={() => {}} />);
    const panel = screen.queryByRole("dialog", { hidden: true });
    expect(panel).toBeInTheDocument();
    expect(panel).not.toHaveAccessibleName(/Tags for/);
    expect(screen.queryByRole("combobox", { hidden: true })).not.toBeInTheDocument();
  });

  it("seeds the picker from the target's tags; changes write through setArticleTags", async () => {
    const user = userEvent.setup();
    render(<RowTagsPopover target={target} stats={stats} onClose={() => {}} />);
    liftPanel();

    // The existing tag renders as a chip (the draft seeded from the row).
    expect(screen.getByText("existing")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Tags for Row Article");

    await user.type(screen.getByLabelText("Add or search a tag"), "essays");
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(setArticleTagsMock).toHaveBeenCalledWith("row-article", ["existing", "essays"]),
    );
  });

  it("Done routes through onClose exactly once", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<RowTagsPopover target={target} stats={stats} onClose={onClose} />);
    liftPanel();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a Dexie write failure lands in the calm .status region, never thrown", async () => {
    setArticleTagsMock.mockRejectedValue(new Error("quota"));
    const user = userEvent.setup();
    render(<RowTagsPopover target={target} stats={stats} onClose={() => {}} />);
    liftPanel();
    await user.type(screen.getByLabelText("Add or search a tag"), "essays");
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Couldn't save tag."),
    );
  });
});
