// tests/component/add-dialog-tags.test.tsx
// Issue #75 (decision #71) — the Add dialog's optional import-time tags:
//   - the "Tags (optional)" fieldset hosts the ONE shared TagPicker above
//     the action row (shared by every source arm)
//   - tags ride the SAVED record (article + book arms) — never a follow-up
//     write; empty tags save the record untouched
//   - the tags session state resets on every open (D16-08)
//
// Mock harness mirrors tests/component/AddDialog.test.tsx (IngestionClient,
// LibrarySource, booksStore) so nothing touches network or IndexedDB.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../src/ingestion/IngestionClient", () => ({
  ingestUrl: vi.fn(),
  ingestHtml: vi.fn(),
  ingestMarkdown: vi.fn(),
  ingestPdf: vi.fn(),
  ingestEpub: vi.fn(),
  IngestionError: class IngestionError extends Error {
    readonly reason: string;
    constructor(reason: string, message?: string) {
      super(message ?? reason);
      this.name = "IngestionError";
      this.reason = reason;
    }
  },
}));

vi.mock("../../src/ingestion/LibrarySource", () => ({
  dexieLibrarySource: {
    has: vi.fn(),
    save: vi.fn(),
  },
}));

vi.mock("../../src/persistence/booksStore", () => ({
  hasBook: vi.fn(),
  saveBook: vi.fn(),
}));

import { AddDialog } from "../../src/ingestion/AddDialog";
import { ingestUrl, ingestEpub } from "../../src/ingestion/IngestionClient";
import { dexieLibrarySource } from "../../src/ingestion/LibrarySource";
import { hasBook, saveBook } from "../../src/persistence/booksStore";
import type { CanonicalArticle } from "../../src/content/types";
import type { TagStat } from "../../src/ingestion/library/tagsStore";

const ingestUrlMock = vi.mocked(ingestUrl);
const ingestEpubMock = vi.mocked(ingestEpub);
const hasMock = vi.mocked(dexieLibrarySource.has);
const saveMock = vi.mocked(dexieLibrarySource.save);
const hasBookMock = vi.mocked(hasBook);
const saveBookMock = vi.mocked(saveBook);

// jsdom implements the HTMLDialogElement interface but NOT showModal/close —
// prototype stubs (the AddDialog.test.tsx discipline).
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
  vi.clearAllMocks();
});

function sampleArticle(): CanonicalArticle {
  return {
    id: "tagged-article",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/tagged",
      title: "Tagged Article",
      retrievedAt: "2026-09-24T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "0".repeat(64),
    },
    blocks: [
      { kind: "paragraph", content: [{ text: "Body.", marks: [] }] },
    ],
    footnotes: [],
  } as unknown as CanonicalArticle;
}

const STATS: TagStat[] = [
  { tag: "essays", count: 3 },
  { tag: "slow-web", count: 1 },
];

function renderDialog(tagStats: TagStat[] = STATS) {
  return render(
    <AddDialog open={true} onCancel={vi.fn()} onBookAdded={vi.fn()} tagStats={tagStats} />,
  );
}

async function addTagViaPicker(draft: string) {
  const user = userEvent.setup();
  const input = screen.getByLabelText("Add or search a tag");
  await user.type(input, draft);
  await user.keyboard("{Enter}");
}

describe("AddDialog tags: the fieldset", () => {
  it("renders the Tags (optional) fieldset with the shared picker input", () => {
    renderDialog();
    expect(screen.getByText("Tags (optional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Add or search a tag")).toBeInTheDocument();
  });

  it("suggests most-used existing tags from the host-passed stats (count-free)", async () => {
    renderDialog();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Add or search a tag"));
    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["essays", "slow-web"]);
  });
});

describe("AddDialog tags: tags ride the saved record", () => {
  it("URL arm: the saved article row carries the picked tags", async () => {
    ingestUrlMock.mockResolvedValue({
      article: sampleArticle(),
      confidence: { state: "confident" },
      assets: [],
    });
    hasMock.mockResolvedValue(false);
    saveMock.mockResolvedValue(undefined);
    renderDialog();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Add by URL"), "https://example.com/tagged");
    await addTagViaPicker("essays");
    await addTagViaPicker("fresh-tag");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const savedArticle = saveMock.mock.calls[0]![0] as CanonicalArticle;
    expect(savedArticle.tags).toEqual(["essays", "fresh-tag"]);
  });

  it("empty tags leave the record untouched (the honest no-op pass-through)", async () => {
    const article = sampleArticle();
    ingestUrlMock.mockResolvedValue({ article, confidence: { state: "confident" }, assets: [] });
    hasMock.mockResolvedValue(false);
    saveMock.mockResolvedValue(undefined);
    renderDialog();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Add by URL"), "https://example.com/tagged");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(saveMock.mock.calls[0]![0]).toBe(article);
  });

  it("book arm (epub): the tags land on the BOOK record (D12-04)", async () => {
    const epubFile = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "book.epub", {
      type: "application/epub+zip",
    });
    ingestEpubMock.mockResolvedValue({
      book: {
        id: "epub-tagged",
        title: "Tagged Book",
        authors: [],
        language: "en",
        chapterArticleIds: [],
        skippedChapterCount: 0,
        source: "epub-upload",
        originalFileHash: "sha256:" + "b".repeat(64),
        addedAt: "2026-09-24T00:00:00.000Z",
      },
      articles: [],
      assets: [],
      skippedCount: 0,
    } as Awaited<ReturnType<typeof ingestEpub>>);
    hasBookMock.mockResolvedValue(false);
    saveBookMock.mockResolvedValue(undefined);
    renderDialog();

    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Upload file" }));
    await user.upload(screen.getByLabelText("Upload a file"), epubFile);
    await addTagViaPicker("books");
    await user.click(screen.getByRole("button", { name: "Add file" }));

    await waitFor(() => expect(saveBookMock).toHaveBeenCalledTimes(1));
    const savedBook = saveBookMock.mock.calls[0]![0];
    expect(savedBook.tags).toEqual(["books"]);
  });

  it("dedupe-refusal never reaches a save — tags don't influence D7-07", async () => {
    ingestUrlMock.mockResolvedValue({
      article: sampleArticle(),
      confidence: { state: "confident" },
      assets: [],
    });
    hasMock.mockResolvedValue(true);
    renderDialog();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Add by URL"), "https://example.com/tagged");
    await addTagViaPicker("essays");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(screen.getByText("Already in your library.")).toBeInTheDocument(),
    );
    expect(saveMock).not.toHaveBeenCalled();
  });
});

describe("AddDialog tags: session reset (D16-08)", () => {
  it("reopening the dialog resets the picked tags", async () => {
    const { rerender } = renderDialog();
    await addTagViaPicker("essays");
    expect(screen.getByText("essays")).toBeInTheDocument();

    rerender(
      <AddDialog open={false} onCancel={vi.fn()} onBookAdded={vi.fn()} tagStats={STATS} />,
    );
    rerender(
      <AddDialog open={true} onCancel={vi.fn()} onBookAdded={vi.fn()} tagStats={STATS} />,
    );

    await waitFor(() =>
      expect(screen.queryByText("essays")).not.toBeInTheDocument(),
    );
  });
});
