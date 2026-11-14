import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ArticleSchema, BookSchema, CollectionSchema } from "../../../src/content/schema";
import {
  addCollectionEntry,
  sameCollectionTarget,
} from "../../../src/persistence/collectionsStore";
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
        chaptersByBook={new Map()}
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
  it("keeps the activated action mounted and focused when membership updates", async () => {
    vi.mocked(addCollectionEntry).mockResolvedValue({ outcome: "added", collection });
    vi.mocked(sameCollectionTarget).mockReturnValue(false);
    const props = {
      open: true,
      collection,
      articles: [article],
      books: [],
      chaptersByBook: new Map(),
      onOutcome: vi.fn(),
      onCancel: vi.fn(),
    };
    const { rerender } = render(<AddReadingDialog {...props} />);
    const button = screen.getByRole("button", { name: "Add Picker article" });
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(props.onOutcome).toHaveBeenCalledOnce());
    vi.mocked(sameCollectionTarget).mockReturnValue(true);
    rerender(
      <AddReadingDialog
        {...props}
        collection={{
          ...collection,
          entries: [
            {
              id: "entry",
              addedAt: collection.createdAt,
              target: { kind: "article", articleId: article.id },
            },
          ],
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Added Picker article" })).toBe(button);
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(button);
    expect(addCollectionEntry).toHaveBeenCalledOnce();
    vi.mocked(sameCollectionTarget).mockReturnValue(false);
  });
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

// Issue #244 — chapter rows: validated chapter targets under each parent,
// in structure/TOC order, with the parent named in the meta line. The
// picker's rows are presentation only — the store re-validates authoritatively.
describe("add-reading dialog chapter rows (issue #244)", () => {
  // The file-level store mock defaults sameCollectionTarget to false; the
  // membership-mark tests below pin their own comparison.
  beforeEach(() => vi.mocked(sameCollectionTarget).mockReturnValue(false));

  function structuredWork(id: string, title: string) {
    return ArticleSchema.parse({
      id,
      revision: 1,
      lang: "en",
      provenance: {
        title,
        retrievedAt: "2026-10-01T00:00:00.000Z",
        originalHtmlHash: `sha256:${"6".repeat(64)}`,
      },
      blocks: [
        { kind: "heading", level: 2, content: [{ text: "Opening", marks: [] }] },
        { kind: "paragraph", content: [{ text: "Opening body.", marks: [] }] },
        { kind: "heading", level: 2, content: [{ text: "Following", marks: [] }] },
        { kind: "paragraph", content: [{ text: "Following body.", marks: [] }] },
      ],
      ingestionMeta: {
        source: "paste",
        origin: "paste",
        originalHtmlHash: `sha256:${"6".repeat(64)}`,
        ingestedAt: "2026-10-01T00:00:00.000Z",
        extractionConfidence: "high",
      },
    });
  }

  function bookChapter(id: string, bookId: string, index: number, title: string) {
    return ArticleSchema.parse({
      id,
      revision: 1,
      lang: "en",
      provenance: {
        title,
        retrievedAt: "2026-10-01T00:00:00.000Z",
        originalHtmlHash: `sha256:${"5".repeat(64)}`,
      },
      blocks: [{ kind: "paragraph", content: [{ text: "Chapter body.", marks: [] }] }],
      ingestionMeta: {
        source: "epub-chapter",
        origin: "upload",
        bookId,
        chapterIndex: index,
        originalHtmlHash: `sha256:${"5".repeat(64)}`,
        ingestedAt: "2026-10-01T00:00:00.000Z",
        extractionConfidence: "high",
      },
    });
  }

  function makeBook(id: string, chapterIds: string[]) {
    return BookSchema.parse({
      id,
      title: "Harbor",
      authors: [],
      language: "en",
      chapterArticleIds: chapterIds,
      source: "epub-upload",
      originalFileHash: `sha256:${"4".repeat(64)}`,
      addedAt: "2026-10-01T00:00:00.000Z",
    });
  }

  function renderDialogWithChapters() {
    const onOutcome = vi.fn();
    const onCancel = vi.fn();
    const work = structuredWork("long-work", "The Long Work");
    const bk = makeBook("epub-1", ["harbor-c01", "harbor-c02"]);
    const chapters = [
      bookChapter("harbor-c01", "epub-1", 0, "Chapter 1"),
      bookChapter("harbor-c02", "epub-1", 1, "Chapter 2"),
    ];
    function Host() {
      const [open, setOpen] = useState(true);
      return (
        <AddReadingDialog
          open={open}
          collection={collection}
          articles={[work]}
          books={[bk]}
          chaptersByBook={new Map([["epub-1", chapters]])}
          onOutcome={onOutcome}
          onCancel={() => {
            onCancel();
            setOpen(false);
          }}
        />
      );
    }
    render(<Host />);
    return { onOutcome };
  }

  it("lists chapter rows under each parent with the parent named in the meta", () => {
    renderDialogWithChapters();
    const dialog = screen.getByRole("dialog");
    // Work chapters (structure titles) + book chapters (existing rows).
    expect(within(dialog).getByText("Opening")).toBeTruthy();
    expect(within(dialog).getByText("Following")).toBeTruthy();
    expect(within(dialog).getByText("Chapter 1")).toBeTruthy();
    expect(within(dialog).getByText("Chapter 2")).toBeTruthy();
    const metas = within(dialog).getAllByText("Chapter · The Long Work");
    expect(metas.length).toBe(2);
    expect(within(dialog).getAllByText("Chapter · Harbor").length).toBe(2);
  });

  it("adds a work chapter with its chapter target", async () => {
    vi.mocked(addCollectionEntry).mockResolvedValue({ outcome: "added", collection });
    const { onOutcome } = renderDialogWithChapters();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Add Opening (Chapter · The Long Work)" }),
    );
    await waitFor(() => expect(onOutcome).toHaveBeenCalled());
    expect(vi.mocked(addCollectionEntry)).toHaveBeenCalledWith(
      collection.id,
      expect.objectContaining({ kind: "work-chapter", articleId: "long-work" }),
    );
    const target = vi.mocked(addCollectionEntry).mock.calls[0]?.[1] as { destinationId: string };
    expect(target.destinationId).toMatch(/^ch-\d+\.(?:b|\d+)$/);
  });

  it("adds a book chapter with its book-chapter target", async () => {
    vi.mocked(addCollectionEntry).mockResolvedValue({ outcome: "added", collection });
    const { onOutcome } = renderDialogWithChapters();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Add Chapter 2 (Chapter · Harbor)" }),
    );
    await waitFor(() => expect(onOutcome).toHaveBeenCalled());
    expect(vi.mocked(addCollectionEntry)).toHaveBeenCalledWith(collection.id, {
      kind: "book-chapter",
      bookId: "epub-1",
      articleId: "harbor-c02",
    });
  });

  it("marks an already-added chapter as Added instead of offering a second Add", () => {
    const withChapter = CollectionSchema.parse({
      schemaVersion: 1,
      id: "picker-collection",
      name: "Reading queue",
      entries: [
        {
          id: "entry-9",
          target: { kind: "book-chapter", bookId: "epub-1", articleId: "harbor-c01" },
          addedAt: "2026-10-01T00:00:00.000Z",
        },
      ],
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    const onOutcome = vi.fn();
    const work = structuredWork("long-work", "The Long Work");
    const bk = makeBook("epub-1", ["harbor-c01"]);
    const chapters = [bookChapter("harbor-c01", "epub-1", 0, "Chapter 1")];
    function Host() {
      const [open] = useState(true);
      return (
        <AddReadingDialog
          open={open}
          collection={withChapter}
          articles={[work]}
          books={[bk]}
          chaptersByBook={new Map([["epub-1", chapters]])}
          onOutcome={onOutcome}
          onCancel={() => {}}
        />
      );
    }
    // Only the harbor-c01 chapter target counts as a member (the pinned
    // comparison — every other row keeps its Add button). Set BEFORE the
    // render so the membership marks compute with it.
    vi.mocked(sameCollectionTarget).mockImplementation(
      (a, b) =>
        a !== undefined &&
        b !== undefined &&
        a.kind === "book-chapter" &&
        b.kind === "book-chapter" &&
        a.articleId === "harbor-c01" &&
        b.articleId === "harbor-c01",
    );
    render(<Host />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Added")).toBeTruthy();
    expect(
      within(dialog).queryByRole("button", { name: "Add Chapter 1 (Chapter · Harbor)" }),
    ).toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Add Opening (Chapter · The Long Work)" }),
    ).toBeTruthy();
  });

  it("search finds chapters by their own title", () => {
    renderDialogWithChapters();
    const dialog = screen.getByRole("dialog");
    const input = within(dialog).getByLabelText("Search your readings");
    fireEvent.change(input, { target: { value: "Following" } });
    expect(within(dialog).getByText("Following")).toBeTruthy();
    expect(within(dialog).queryByText("Opening")).toBeNull();
    expect(within(dialog).queryByText("The Long Work")).toBeNull();
  });

  it("a chapterless work offers no chapter rows", () => {
    const plain = ArticleSchema.parse({
      id: "plain-essay",
      revision: 1,
      lang: "en",
      provenance: {
        title: "Plain Essay",
        retrievedAt: "2026-10-01T00:00:00.000Z",
        originalHtmlHash: `sha256:${"3".repeat(64)}`,
      },
      blocks: [{ kind: "paragraph", content: [{ text: "Just prose.", marks: [] }] }],
    });
    const onOutcome = vi.fn();
    function Host() {
      const [open] = useState(true);
      return (
        <AddReadingDialog
          open={open}
          collection={collection}
          articles={[plain]}
          books={[]}
          chaptersByBook={new Map()}
          onOutcome={onOutcome}
          onCancel={() => {}}
        />
      );
    }
    render(<Host />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryAllByText("Chapter · Plain Essay")).toHaveLength(0);
    expect(within(dialog).queryAllByText("Added")).toHaveLength(0);
  });
});
