// tests/component/honest-write-failures.test.tsx
// Issue #98 (decision #96) — the honest-failure contract for every write
// surface the map ticket names. Each confirm/edit/note dialog asserts THE
// SAME shape: a rejected write keeps the dialog open with the calm error
// line (through the ONE StatusRegion primitive), NEVER reports success
// (onConfirm/onSaved/onDone(true) fire only after the write resolves), and
// the destructive/submit control carries the unified busy register while
// the write is in flight (spinner arc + aria-busy + disabled — the
// ReadingStateButton pattern).
//
// Per the SettingsPanel.test.tsx precedent (Pitfall 2), jsdom is NOT
// authoritative for <dialog> focus-trap / inert-backdrop / Esc behavior —
// the two prototype stubs below let the real open/close effects run; the
// behavior itself is proven by the e2e suites on all three engines.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// jsdom 25 implements the HTMLDialogElement interface but NOT showModal/
// close behavior. The stubs mirror SettingsPanel.test.tsx L27-33.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  });
});

// The five write seams — every store call in the dialogs under test.
vi.mock("../../src/ingestion/LibrarySource", () => ({
  dexieLibrarySource: { remove: vi.fn() },
}));
vi.mock("../../src/persistence/booksStore", () => ({
  removeBook: vi.fn(),
}));
vi.mock("../../src/persistence/highlightsStore", () => ({
  deleteHighlight: vi.fn(),
}));
vi.mock("../../src/persistence/notesStore", () => ({
  saveNote: vi.fn(),
  deleteNote: vi.fn(),
}));
vi.mock("../../src/persistence/db", () => ({
  db: { articles: { put: vi.fn() } },
}));

import { RemoveConfirm } from "../../src/ingestion/library/RemoveConfirm";
import { BookRemoveConfirm } from "../../src/ingestion/library/BookRemoveConfirm";
import { DeleteHighlightConfirm } from "../../src/routes/review/DeleteHighlightConfirm";
import { EditMetadataDialog } from "../../src/ingestion/library/EditMetadataDialog";
import { ReviewNoteDialog } from "../../src/routes/review/ReviewNoteDialog";
import { dexieLibrarySource } from "../../src/ingestion/LibrarySource";
import { removeBook } from "../../src/persistence/booksStore";
import { deleteHighlight } from "../../src/persistence/highlightsStore";
import { saveNote } from "../../src/persistence/notesStore";
import { db } from "../../src/persistence/db";
import type { CanonicalArticle } from "../../src/content/types";

const removeMock = vi.mocked(dexieLibrarySource.remove);
const removeBookMock = vi.mocked(removeBook);
const deleteHighlightMock = vi.mocked(deleteHighlight);
const saveNoteMock = vi.mocked(saveNote);
const putMock = vi.mocked(db.articles.put);

beforeEach(() => {
  vi.clearAllMocks();
});

const stubArticle = (): CanonicalArticle => ({
  id: "stub-article",
  revision: 1,
  lang: "en",
  // A seeded readerTitle keeps the D17-04 blank-title rule from blocking
  // Save in these tests (the rule itself is covered by the 17-02 suite).
  readerTitle: "Stub Article",
  readerAuthor: "Stub Author",
  provenance: {
    sourceUrl: "https://example.com/posts/stub",
    title: "Stub Article",
    author: "Stub Author",
    publishedAt: "2026-01-15T00:00:00Z",
    retrievedAt: "2026-07-28T00:00:00Z",
    originalHtmlHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  blocks: [
    { kind: "paragraph", content: [{ text: "A body paragraph.", marks: [] }] },
  ],
  footnotes: [],
});

/** Flush the in-flight write by resolving the captured promise inside
 * act() — the busy register's success path then commits. */
async function resolveWrite(resolve: () => void): Promise<void> {
  await act(async () => {
    resolve();
  });
}

describe("RemoveConfirm — honest write failure (issue #98)", () => {
  function renderDialog(onConfirm: () => void, onCancel: () => void) {
    return render(
      <RemoveConfirm
        open
        articleId="a1"
        articleTitle="Some title"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
  }

  it("a failed cascade keeps the dialog open with the calm error line and never reports success", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    removeMock.mockRejectedValueOnce(new Error("quota"));
    renderDialog(onConfirm, onCancel);
    await user.click(screen.getByRole("button", { name: "Remove article" }));
    expect(
      await screen.findByText("Couldn't remove this article. Try again."),
    ).not.toBeNull();
    // The dialog does not lie: no success report, no silent close.
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("the destructive button carries the unified busy register while the write is in flight", async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    removeMock.mockReturnValueOnce(
      new Promise<void>((r) => {
        resolve = r;
      }),
    );
    const onConfirm = vi.fn();
    renderDialog(onConfirm, vi.fn());
    const button = screen.getByRole("button", { name: "Remove article" }) as HTMLButtonElement;
    await user.click(button);
    // In flight: disabled + aria-busy + the (aria-hidden) spinner arc.
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.querySelector("svg")).not.toBeNull();
    // Resolve → the success path reports exactly once, busy state cleared.
    await resolveWrite(resolve);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(button.getAttribute("aria-busy")).toBeNull();
  });

  it("a retry after a failed write succeeds and reports success exactly once, clearing the error", async () => {
    const user = userEvent.setup();
    removeMock
      .mockRejectedValueOnce(new Error("quota"))
      .mockResolvedValueOnce(undefined);
    const onConfirm = vi.fn();
    renderDialog(onConfirm, vi.fn());
    const button = screen.getByRole("button", { name: "Remove article" }) as HTMLButtonElement;
    await user.click(button);
    await screen.findByText("Couldn't remove this article. Try again.");
    await user.click(button);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByText("Couldn't remove this article. Try again."),
    ).toBeNull();
  });

  it("a fresh open clears a prior session's failed-write error", async () => {
    const user = userEvent.setup();
    removeMock.mockRejectedValueOnce(new Error("quota"));
    const onCancel = vi.fn();
    const { rerender } = renderDialog(vi.fn(), onCancel);
    await user.click(screen.getByRole("button", { name: "Remove article" }));
    await screen.findByText("Couldn't remove this article. Try again.");
    // Close, then reopen: the error line is gone (fresh session state).
    rerender(
      <RemoveConfirm
        open={false}
        articleId="a1"
        articleTitle="Some title"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    rerender(
      <RemoveConfirm
        open
        articleId="a1"
        articleTitle="Some title"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    expect(
      screen.queryByText("Couldn't remove this article. Try again."),
    ).toBeNull();
  });
});

describe("BookRemoveConfirm — honest write failure (issue #98)", () => {
  function renderDialog(onConfirm: () => void, onCancel: () => void) {
    return render(
      <BookRemoveConfirm
        open
        bookId="b1"
        bookTitle="Some book"
        chapterCount={3}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
  }

  it("a failed cascade keeps the dialog open with the calm error line and never reports success", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    removeBookMock.mockRejectedValueOnce(new Error("quota"));
    renderDialog(onConfirm, vi.fn());
    await user.click(screen.getByRole("button", { name: "Remove book" }));
    expect(
      await screen.findByText("Couldn't remove this book. Try again."),
    ).not.toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("a retry after a failed write succeeds and reports success exactly once", async () => {
    const user = userEvent.setup();
    removeBookMock
      .mockRejectedValueOnce(new Error("quota"))
      .mockResolvedValueOnce(undefined);
    const onConfirm = vi.fn();
    renderDialog(onConfirm, vi.fn());
    const button = screen.getByRole("button", { name: "Remove book" }) as HTMLButtonElement;
    await user.click(button);
    await screen.findByText("Couldn't remove this book. Try again.");
    await user.click(button);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it("the destructive button carries the unified busy register while the write is in flight", async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    removeBookMock.mockReturnValueOnce(
      new Promise<void>((r) => {
        resolve = r;
      }),
    );
    const onConfirm = vi.fn();
    renderDialog(onConfirm, vi.fn());
    const button = screen.getByRole("button", { name: "Remove book" }) as HTMLButtonElement;
    await user.click(button);
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.querySelector("svg")).not.toBeNull();
    await resolveWrite(resolve);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });
});

describe("DeleteHighlightConfirm — honest write failure (issue #98)", () => {
  function renderDialog(onConfirm: () => void, onCancel: () => void) {
    return render(
      <DeleteHighlightConfirm
        open
        highlightId="h1"
        excerpt="A quoted passage"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
  }

  it("a failed delete keeps the dialog open with the calm error line and never reports success", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    deleteHighlightMock.mockRejectedValueOnce(new Error("quota"));
    renderDialog(onConfirm, vi.fn());
    await user.click(screen.getByRole("button", { name: "Remove highlight" }));
    expect(
      await screen.findByText("Couldn't remove this highlight. Try again."),
    ).not.toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("a retry after a failed delete succeeds and reports success exactly once", async () => {
    const user = userEvent.setup();
    deleteHighlightMock
      .mockRejectedValueOnce(new Error("quota"))
      .mockResolvedValueOnce(undefined);
    const onConfirm = vi.fn();
    renderDialog(onConfirm, vi.fn());
    const button = screen.getByRole("button", { name: "Remove highlight" }) as HTMLButtonElement;
    await user.click(button);
    await screen.findByText("Couldn't remove this highlight. Try again.");
    await user.click(button);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it("the destructive button carries the unified busy register while the write is in flight", async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    deleteHighlightMock.mockReturnValueOnce(
      new Promise<void>((r) => {
        resolve = r;
      }),
    );
    const onConfirm = vi.fn();
    renderDialog(onConfirm, vi.fn());
    const button = screen.getByRole("button", { name: "Remove highlight" }) as HTMLButtonElement;
    await user.click(button);
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.querySelector("svg")).not.toBeNull();
    await resolveWrite(resolve);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });
});

describe("EditMetadataDialog — honest save failure (issue #98)", () => {
  function renderDialog(onSaved: () => void, onCancel: () => void) {
    return render(
      <EditMetadataDialog
        open
        article={stubArticle()}
        onSaved={onSaved}
        onCancel={onCancel}
      />,
    );
  }

  it("a failed put keeps the dialog open with the calm error line and never calls onSaved", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const onCancel = vi.fn();
    putMock.mockRejectedValueOnce(new Error("quota"));
    renderDialog(onSaved, onCancel);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Couldn't save this change. Try again."),
    ).not.toBeNull();
    // The dialog does not lie: the row list is never told the save landed.
    expect(onSaved).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("a retry after a failed save succeeds and calls onSaved exactly once, clearing the error", async () => {
    const user = userEvent.setup();
    putMock
      .mockRejectedValueOnce(new Error("quota"))
      .mockResolvedValueOnce("stub-article");
    const onSaved = vi.fn();
    renderDialog(onSaved, vi.fn());
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    await user.click(save);
    await screen.findByText("Couldn't save this change. Try again.");
    await user.click(save);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByText("Couldn't save this change. Try again."),
    ).toBeNull();
  });

  it("the Save button carries the unified busy register while the put is in flight", async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    putMock.mockImplementationOnce(
      () =>
        new Promise<string>((r) => {
          resolve = () => r("stub-article");
        }) as never,
    );
    const onSaved = vi.fn();
    renderDialog(onSaved, vi.fn());
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    await user.click(save);
    expect(save.disabled).toBe(true);
    expect(save.getAttribute("aria-busy")).toBe("true");
    expect(save.querySelector("svg")).not.toBeNull();
    await resolveWrite(resolve);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });
});

describe("ReviewNoteDialog — honest commit (issue #98)", () => {
  /** Mirrors the real parent (ReviewView): flips open false on a reported
   * success so the close-path "handled" guard is exercised for real. */
  function NoteHarness({ onDone }: { onDone: (saved: boolean) => void }) {
    const [open, setOpen] = useState(true);
    return (
      <ReviewNoteDialog
        open={open}
        highlightId="h1"
        articleId="a1"
        existing={null}
        onDone={(saved) => {
          onDone(saved);
          if (saved) setOpen(false);
        }}
      />
    );
  }

  it("a failed Done keeps the dialog open with the calm error line and never reports saved", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    saveNoteMock.mockRejectedValueOnce(new Error("quota"));
    render(<NoteHarness onDone={onDone} />);
    const textarea = screen.getByLabelText("Note");
    await user.type(textarea, "my note");
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(
      await screen.findByText("Couldn't save the note. Try again."),
    ).not.toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("a Done retry after a failed write reports saved=true exactly once", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    saveNoteMock
      .mockRejectedValueOnce(new Error("quota"))
      .mockResolvedValueOnce(undefined);
    render(<NoteHarness onDone={onDone} />);
    const textarea = screen.getByLabelText("Note");
    await user.type(textarea, "my note");
    await user.click(screen.getByRole("button", { name: "Done" }));
    await screen.findByText("Couldn't save the note. Try again.");
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onDone).toHaveBeenCalledWith(true);
    // The store saw exactly two attempts (the failed write + the retry);
    // the success flip closed the dialog and the close-path commit was the
    // "handled" no-op — never a second report.
    expect(saveNoteMock).toHaveBeenCalledTimes(2);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("a close-path failure reports saved=false — never a success lie", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    // Fails now AND on the close-path retry (the guard re-armed).
    saveNoteMock.mockRejectedValue(new Error("quota"));
    render(<NoteHarness onDone={onDone} />);
    const textarea = screen.getByLabelText("Note");
    await user.type(textarea, "my note");
    await user.click(screen.getByRole("button", { name: "Done" }));
    await screen.findByText("Couldn't save the note. Try again.");
    // Simulate the Esc aftermath: the dialog closes → the close listener
    // commits (retry) → the write fails again → onDone(false).
    const dlg = document.querySelector("dialog.review-note-dialog");
    expect(dlg).not.toBeNull();
    (dlg as HTMLDialogElement).close();
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onDone).toHaveBeenCalledWith(false);
    expect(onDone).not.toHaveBeenCalledWith(true);
  });

  it("the success close path does not double-report (the 'handled' guard)", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    saveNoteMock.mockResolvedValue(undefined);
    render(<NoteHarness onDone={onDone} />);
    const textarea = screen.getByLabelText("Note");
    await user.type(textarea, "my note");
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onDone).toHaveBeenCalledWith(true);
    // The harness flipped open=false → the close effect ran → the close
    // listener's guarded commit reported "handled" — no second onDone.
    await waitFor(() => expect(saveNoteMock).toHaveBeenCalledTimes(1));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
