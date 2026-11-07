import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ArticleSchema, CollectionSchema } from "../../../src/content/schema";
import { addCollectionEntry } from "../../../src/persistence/collectionsStore";
import type { AddCollectionEntryOutcome } from "../../../src/persistence/collectionsStore";
import { AddReadingDialog } from "../../../src/routes/collections/AddReadingDialog";

vi.mock("../../../src/persistence/collectionsStore", () => ({
  addCollectionEntry: vi.fn(),
  sameCollectionTarget: vi.fn(() => false),
}));

// jsdom tests the outcome/dismissal routing only. Playwright owns modal
// inertness, keyboard focus after adding, and close-focus restoration.
HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
HTMLDialogElement.prototype.close = function () {
  this.open = false;
  this.dispatchEvent(new Event("close"));
};

const article = ArticleSchema.parse({
  id: "picker-article",
  revision: 1,
  lang: "en",
  provenance: {
    title: "Picker article",
    retrievedAt: "2026-10-01T00:00:00.000Z",
    originalHtmlHash: `sha256:${"c".repeat(64)}`,
  },
  blocks: [{ kind: "paragraph", content: [{ text: "Body.", marks: [] }] }],
});
const collection = CollectionSchema.parse({
  schemaVersion: 1,
  id: "picker-collection",
  name: "Reading queue",
  entries: [],
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
});

beforeEach(() => vi.clearAllMocks());

function renderDialog() {
  const onOutcome = vi.fn();
  const onCancel = vi.fn();
  function Host() {
    const [open, setOpen] = useState(true);
    return (
      <AddReadingDialog
        open={open}
        collection={collection}
        articles={[article]}
        books={[]}
        onOutcome={onOutcome}
        onCancel={() => {
          onCancel();
          setOpen(false);
        }}
      />
    );
  }
  render(<Host />);
  return { onOutcome, onCancel };
}

describe("add-reading dialog outcomes", () => {
  const outcomes: [AddCollectionEntryOutcome, string][] = [
    [{ outcome: "added", collection }, "Added “Picker article”."],
    [{ outcome: "duplicate" }, "“Picker article” is already in this collection."],
    [{ outcome: "missing-target" }, "“Picker article” is no longer in your library."],
    [{ outcome: "invalid-target" }, "Couldn't add that reading."],
    [{ outcome: "collection-missing" }, "Couldn't open this collection. Try again."],
  ];
  it.each(outcomes)("announces $outcome inside the active modal", async (outcome, message) => {
    vi.mocked(addCollectionEntry).mockResolvedValue(outcome);
    const { onOutcome } = renderDialog();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Add Picker article" }));
    await waitFor(() => expect(within(dialog).getByRole("status")).toHaveTextContent(message));
    expect(onOutcome).toHaveBeenCalled();
    expect(dialog).toHaveAttribute("open");
  });

  it("blocks every dismissal while writing and leaves a rejected add visible", async () => {
    let reject!: (error: Error) => void;
    vi.mocked(addCollectionEntry).mockReturnValue(
      new Promise((_resolve, rejectWrite) => {
        reject = rejectWrite;
      }),
    );
    const { onOutcome, onCancel } = renderDialog();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Add Picker article" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Done" })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    fireEvent.click(dialog);
    expect(onCancel).not.toHaveBeenCalled();
    await act(async () => reject(new Error("injected quota failure")));
    expect(dialog).toHaveAttribute("open");
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Couldn't add the reading. Try again.",
    );
    expect(onOutcome).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(dialog).not.toHaveAttribute("open");
  });
});
