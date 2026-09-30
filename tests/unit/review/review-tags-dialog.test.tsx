// tests/unit/review/review-tags-dialog.test.tsx
// Issue #117 — annotation tags in Highlights review. The ReviewTagsDialog
// (the panel's in-place highlight-tag editor) hosts the ONE shared TagPicker
// via TagEntry with a saveTags override routing to setHighlightTags:
//   - the dialog seeds from the highlight's tags + focuses the picker input
//   - a keyboard pick (type + Enter) commits through the write seam
//   - Done reports the HONEST session outcome: "saved" only after a write
//     that landed, "failed" after a rejected one, "untouched" when no
//     writes happened (nothing announced, nothing written)
//   - a failed write ALSO surfaces TagEntry's calm in-dialog error line
//   - the close path (Esc → the dialog `close` event) reports exactly once
//
// D10-11/#117 unresolved editability is structural: the dialog takes NO
// article/confidence input at all — tags are keyed to highlightId, so
// ambiguous/orphaned rows edit exactly like confident ones (nothing to gate,
// nothing here can imply the anchor was repaired).
//
// Semantic-only (RTL + user-event, jsdom). The dialog harness mirrors
// note-popover-tags.test.tsx (dialog polyfill + store stubs).
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ReviewTagsDialog,
  type ReviewTagsOutcome,
} from "../../../src/routes/review/ReviewTagsDialog";

const mockData = vi.hoisted(() => ({
  stats: [
    { tag: "essays", count: 3 },
    { tag: "philosophy", count: 1 },
  ],
}));

vi.mock("../../../src/ingestion/library/tagsStore", () => ({
  loadTagStats: vi.fn().mockResolvedValue(mockData.stats),
  setArticleTags: vi.fn().mockResolvedValue(undefined),
  setBookTags: vi.fn().mockResolvedValue(undefined),
  setHighlightTags: vi.fn(async (_id: string, tags: string[]) => tags),
}));

// jsdom <dialog> polyfill (mirrors note-popover-tags.test.tsx).
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal =
    HTMLDialogElement.prototype.showModal ??
    function showDialogPolyfill(this: HTMLDialogElement) {
      this.open = true;
    };
  HTMLDialogElement.prototype.close =
    HTMLDialogElement.prototype.close ??
    function closeDialogPolyfill(this: HTMLDialogElement) {
      if (!this.open) return;
      this.open = false;
      this.dispatchEvent(new Event("close"));
    };
}

/** Render the closed dialog, then open it for one highlight — returns the
 * rerender driver so each test owns the open/close prop transitions (the
 * ReviewView wiring shape). */
async function openDialog(opts?: { tags?: string[] }) {
  const props = {
    highlightId: "hl-test-1",
    tags: opts?.tags ?? ["essays"],
  };
  const outcomes: ReviewTagsOutcome[] = [];
  const onDone = (o: ReviewTagsOutcome) => outcomes.push(o);
  const view = render(<ReviewTagsDialog open={false} {...props} onDone={onDone} />);
  await act(async () => {
    view.rerender(<ReviewTagsDialog open {...props} onDone={onDone} />);
  });
  const dialog = await screen.findByRole("dialog", { name: "Edit tags" });
  return { view, props, onDone, outcomes, dialog };
}

async function openPickerInput(dialog: HTMLElement): Promise<HTMLInputElement> {
  const input = (await within(dialog).findByPlaceholderText(
    "Add or search a tag…",
  )) as HTMLInputElement;
  return input;
}

describe("ReviewTagsDialog (issue #117)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("seeds the highlight's tags + focuses the picker input on open (the explicitly-opened-host exception)", async () => {
    const { dialog } = await openDialog({ tags: ["essays"] });

    // The TagEntry fieldset rides inside, seeded with the record's tags.
    expect(within(dialog).getByText("Tags")).toBeTruthy();
    expect(within(dialog).getByText("essays")).toBeTruthy();
    const input = await openPickerInput(dialog);
    expect(input.id).toBe("review-tags-input");
    expect(input).toHaveFocus();
  });

  it("keyboard pick commits through the ONE write seam (setHighlightTags — highlight row only)", async () => {
    const { setHighlightTags } = await import("../../../src/ingestion/library/tagsStore");
    const user = userEvent.setup();
    const { dialog } = await openDialog({ tags: ["essays"] });

    const input = await openPickerInput(dialog);
    await user.click(input);
    await user.type(input, "philosophy");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(setHighlightTags).toHaveBeenCalledWith("hl-test-1", ["essays", "philosophy"]),
    );
  });

  it("Done reports 'saved' only after a write landed; 'untouched' sessions report nothing and write nothing", async () => {
    const user = userEvent.setup();
    const { setHighlightTags } = await import("../../../src/ingestion/library/tagsStore");

    // Untouched session: open + immediate Done → "untouched", no write.
    {
      const { dialog, outcomes, view } = await openDialog({ tags: ["essays"] });
      await user.click(within(dialog).getByRole("button", { name: "Done" }));
      await waitFor(() => expect(outcomes).toEqual(["untouched"]));
      expect(setHighlightTags).not.toHaveBeenCalled();
      view.unmount(); // one dialog in the document at a time
    }

    // Edited session: one pick → Done → "saved".
    {
      const { dialog, outcomes } = await openDialog({ tags: [] });
      const input = await openPickerInput(dialog);
      await user.click(input);
      await user.type(input, "philosophy");
      await user.keyboard("{Enter}");
      await waitFor(() => expect(setHighlightTags).toHaveBeenCalled());
      await user.click(within(dialog).getByRole("button", { name: "Done" }));
      await waitFor(() => expect(outcomes).toEqual(["saved"]));
    }
  });

  it("Done racing an in-flight write still reports the write's truth (never 'untouched') — the WebKit e2e pin", async () => {
    const user = userEvent.setup();
    const { setHighlightTags } = await import("../../../src/ingestion/library/tagsStore");
    // A write that settles only when released — Enter → Done immediately
    // must AWAIT it, not race past it.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(setHighlightTags).mockImplementationOnce(
      () => gate.then(() => ["slow"]) as Promise<string[]>,
    );
    const { dialog, outcomes } = await openDialog({ tags: [] });

    const input = await openPickerInput(dialog);
    await user.click(input);
    await user.type(input, "philosophy");
    await user.keyboard("{Enter}");
    // No flush — Done fires while the write is still pending.
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(outcomes).toEqual([]); // held: the report awaits the write
    release();
    await waitFor(() => expect(outcomes).toEqual(["saved"]));
  });

  it("a failed write surfaces TagEntry's calm error AND Done reports 'failed' (never a saved lie)", async () => {
    const user = userEvent.setup();
    const { setHighlightTags } = await import("../../../src/ingestion/library/tagsStore");
    vi.mocked(setHighlightTags).mockRejectedValueOnce(new Error("idb down"));
    const { dialog, outcomes } = await openDialog({ tags: [] });

    const input = await openPickerInput(dialog);
    await user.click(input);
    await user.type(input, "philosophy");
    await user.keyboard("{Enter}");

    // The in-dialog honest failure (TagEntry's StatusRegion voice).
    expect(await within(dialog).findByText("Couldn't save tag.")).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(outcomes).toEqual(["failed"]));
  });

  it("the close-event path (Esc → dialog 'close') reports the outcome exactly once", async () => {
    const user = userEvent.setup();
    const { dialog, outcomes } = await openDialog({ tags: ["essays"] });

    // Remove the seeded chip — a real write — then simulate the browser's
    // Esc close by driving the dialog's own close event (jsdom has no
    // native Esc-to-close; the polyfilled close() fires the same event the
    // browser fires on Escape).
    const remove = within(dialog).getByRole("button", {
      name: "Remove tag essays",
    });
    await user.click(remove);
    const { setHighlightTags } = await import("../../../src/ingestion/library/tagsStore");
    await waitFor(() => expect(setHighlightTags).toHaveBeenCalledWith("hl-test-1", []));
    await act(async () => {});

    const dlgEl = dialog as HTMLDialogElement;
    await act(async () => {
      dlgEl.close();
    });
    // The report awaits the write's settlement (async) — wait for it.
    await waitFor(() => expect(outcomes).toEqual(["saved"]));

    // A second close event (the state-driven close after Done reported) is
    // a guarded no-op — exactly-once per session.
    await act(async () => {
      dlgEl.close();
    });
    expect(outcomes).toEqual(["saved"]);
  });
});
