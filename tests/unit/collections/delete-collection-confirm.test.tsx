import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeleteCollectionConfirm } from "../../../src/routes/collections/DeleteCollectionConfirm";
import { deleteCollection } from "../../../src/persistence/collectionsStore";
import { CollectionSchema } from "../../../src/content/schema";

vi.mock("../../../src/persistence/collectionsStore", () => ({ deleteCollection: vi.fn() }));

const collection = CollectionSchema.parse({
  schemaVersion: 1,
  id: "collection-1",
  name: "Reading plan",
  entries: [],
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
});

afterEach(() => vi.restoreAllMocks());

describe("delete collection pending dismissal", () => {
  it.each([false, true])(
    "blocks cancellation until the write settles (reject=%s)",
    async (reject) => {
      // jsdom has no native dialog lifecycle; browser specs own focus truth.
      HTMLDialogElement.prototype.showModal = function () {
        this.setAttribute("open", "");
      };
      HTMLDialogElement.prototype.close = function () {
        this.removeAttribute("open");
      };
      let resolve!: () => void;
      let fail!: (error: Error) => void;
      vi.mocked(deleteCollection).mockReturnValue(
        new Promise<void>((yes, no) => {
          resolve = yes;
          fail = no;
        }),
      );
      const onCancel = vi.fn();
      const onConfirm = vi.fn();
      render(
        <DeleteCollectionConfirm
          open
          collection={collection}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Delete collection" }));
      const keep = screen.getByRole("button", { name: "Keep collection" });
      expect(keep).toBeDisabled();
      fireEvent.click(keep);
      const dialog = screen.getByRole("alertdialog");
      fireEvent(dialog, new Event("cancel", { cancelable: true }));
      fireEvent.click(dialog);
      expect(onCancel).not.toHaveBeenCalled();
      expect(onConfirm).not.toHaveBeenCalled();
      await act(async () => {
        if (reject) fail(new Error("storage failed"));
        else resolve();
      });
      if (reject) {
        expect(
          await screen.findByText("Couldn't delete this collection. Try again."),
        ).toBeVisible();
        expect(onConfirm).not.toHaveBeenCalled();
        expect(keep).toBeEnabled();
        fireEvent.click(keep);
        expect(onCancel).toHaveBeenCalledOnce();
      } else {
        await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
        expect(onCancel).not.toHaveBeenCalled();
      }
    },
  );
});
