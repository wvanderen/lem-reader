import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ArticleSchema, CollectionSchema } from "../../../src/content/schema";
import { EMPTY_LIBRARY_SNAPSHOT } from "../../../src/ingestion/library/librarySnapshot";
import { useLibrarySnapshot } from "../../../src/ingestion/library/useLibrarySnapshot";
import { getCollection } from "../../../src/persistence/collectionsStore";
import { CollectionDetailView } from "../../../src/routes/collections/CollectionDetailView";

vi.mock("../../../src/ingestion/library/useLibrarySnapshot", () => ({
  useLibrarySnapshot: vi.fn(),
}));
// Partial mock: the error CLASSES stay real so the view's instanceof
// branching (CollectionCorruptError vs storage failure) behaves as in the
// app; only the async write/read functions are replaceable.
vi.mock("../../../src/persistence/collectionsStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/persistence/collectionsStore")>();
  return {
    ...actual,
    getCollection: vi.fn(),
    addCollectionEntry: vi.fn(),
    sameCollectionTarget: vi.fn(() => false),
    moveCollectionEntry: vi.fn(),
    removeCollectionEntry: vi.fn(),
  };
});
import {
  moveCollectionEntry,
  removeCollectionEntry,
  CollectionCorruptError,
} from "../../../src/persistence/collectionsStore";

const article = ArticleSchema.parse({
  id: "named-article",
  revision: 1,
  lang: "en",
  provenance: {
    title: "Original title",
    retrievedAt: "2026-10-01T00:00:00.000Z",
    originalHtmlHash: `sha256:${"b".repeat(64)}`,
  },
  readerTitle: "My reading title",
  blocks: [{ kind: "paragraph", content: [{ text: "Body.", marks: [] }] }],
});
const collection = CollectionSchema.parse({
  schemaVersion: 1,
  id: "named-collection",
  name: "Reading queue",
  entries: [
    {
      id: "entry-1",
      target: { kind: "article", articleId: article.id },
      addedAt: "2026-10-01T00:00:00.000Z",
    },
  ],
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
});
// A two-entry fixture for the membership-edit paths (a sole entry's move
// controls are boundary-disabled, so an edit click needs a second row).
const editingCollection = CollectionSchema.parse({
  ...collection,
  entries: [
    ...collection.entries,
    {
      id: "entry-2",
      target: { kind: "article", articleId: "absent-article" },
      addedAt: "2026-10-01T00:01:00.000Z",
    },
  ],
});

beforeEach(() => {
  vi.mocked(getCollection).mockResolvedValue(collection);
});

describe("collection detail library resolution", () => {
  it.each(["loading", "error"] as const)(
    "does not call unresolved readings deleted when the library is %s",
    async (status) => {
      vi.mocked(useLibrarySnapshot).mockReturnValue({
        status,
        snapshot: EMPTY_LIBRARY_SNAPSHOT,
      });
      render(<CollectionDetailView collectionId={collection.id} hasAppHistory={false} />);
      await screen.findByRole("heading", { level: 1, name: collection.name });
      expect(screen.queryAllByText("No longer in your library")).toHaveLength(0);
      expect(screen.queryByRole("button", { name: "Add readings" })).not.toBeInTheDocument();
      expect(
        screen.getByText(
          status === "loading"
            ? "Checking your readings…"
            : "Couldn't check your library. Reload the page to try again.",
        ),
      ).toBeInTheDocument();
    },
  );

  it("uses the reader-owned title after the library settles", async () => {
    vi.mocked(useLibrarySnapshot).mockReturnValue({
      status: "ready",
      snapshot: { ...EMPTY_LIBRARY_SNAPSHOT, articles: [article], standaloneArticles: [article] },
    });
    render(<CollectionDetailView collectionId={collection.id} hasAppHistory={false} />);
    expect(await screen.findByRole("link", { name: article.readerTitle })).toHaveAttribute(
      "href",
      `#/article/${article.id}`,
    );
    expect(screen.queryByText(article.provenance.title)).not.toBeInTheDocument();
  });

  it("only reports a missing target after a successful library read", async () => {
    vi.mocked(useLibrarySnapshot).mockReturnValue({
      status: "ready",
      snapshot: EMPTY_LIBRARY_SNAPSHOT,
    });
    render(<CollectionDetailView collectionId={collection.id} hasAppHistory={false} />);
    await screen.findByRole("heading", { name: "Readings in order" });
    expect(screen.getAllByText("No longer in your library")).toHaveLength(2);
    expect(screen.queryByRole("link", { name: article.readerTitle })).not.toBeInTheDocument();
  });
});

describe("membership-edit honest failures (issue #243)", () => {
  function renderEditingView(): void {
    vi.mocked(useLibrarySnapshot).mockReturnValue({
      status: "ready",
      snapshot: { ...EMPTY_LIBRARY_SNAPSHOT, articles: [article], standaloneArticles: [article] },
    });
    vi.mocked(getCollection).mockResolvedValue(editingCollection);
    render(<CollectionDetailView collectionId={editingCollection.id} hasAppHistory={false} />);
  }

  it("a corrupt row announces RELOAD as the next step — a retry can never fix unreadable data", async () => {
    renderEditingView();
    await screen.findByRole("heading", { name: "Readings in order" });
    vi.mocked(moveCollectionEntry).mockRejectedValue(
      new CollectionCorruptError(editingCollection.id),
    );
    fireEvent.click(screen.getByRole("button", { name: "Move this reading up — position 2 of 2" }));
    // The announcement is the announcement region's ONLY child at this point.
    await screen.findByText("This collection's data couldn't be read. Reload the page.");
    // No success lie: the row is untouched and no write swapped in.
    expect(screen.getByRole("button", { name: "Move this reading up — position 2 of 2" }));
  });

  it("a storage failure announces the action-specific retry copy and leaves the rows intact", async () => {
    renderEditingView();
    await screen.findByRole("heading", { name: "Readings in order" });
    vi.mocked(removeCollectionEntry).mockRejectedValue(new Error("storage unavailable"));
    fireEvent.click(
      screen.getByRole("button", { name: "Remove My reading title from this collection" }),
    );
    await screen.findByText("Couldn't remove “My reading title”. Try again.");
    // The view's copy of the collection was NOT swapped (issue #98 — never
    // a success lie): both entry rows still render.
    expect(screen.getByRole("link", { name: "My reading title" })).toBeInTheDocument();
    expect(document.querySelectorAll(".collection-entry")).toHaveLength(2);
  });
});
