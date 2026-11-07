import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ArticleSchema, CollectionSchema } from "../../../src/content/schema";
import { EMPTY_LIBRARY_SNAPSHOT } from "../../../src/ingestion/library/librarySnapshot";
import { useLibrarySnapshot } from "../../../src/ingestion/library/useLibrarySnapshot";
import { getCollection } from "../../../src/persistence/collectionsStore";
import { CollectionDetailView } from "../../../src/routes/collections/CollectionDetailView";

vi.mock("../../../src/ingestion/library/useLibrarySnapshot", () => ({
  useLibrarySnapshot: vi.fn(),
}));
vi.mock("../../../src/persistence/collectionsStore", () => ({
  getCollection: vi.fn(),
  addCollectionEntry: vi.fn(),
  sameCollectionTarget: vi.fn(() => false),
}));

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
