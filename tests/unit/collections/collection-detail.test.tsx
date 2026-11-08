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
// Issue #247 — the active-entry memory (navigation context) is replaceable;
// the record CLASSES stay real.
vi.mock("../../../src/persistence/collectionActiveEntriesStore", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/persistence/collectionActiveEntriesStore")>();
  return { ...actual, getCollectionActiveEntry: vi.fn(), setCollectionActiveEntry: vi.fn() };
});
// Issue #246 — the correction write + the ONE invalidation broadcast are
// replaceable; the store module's classes stay real.
vi.mock("../../../src/persistence/completionsStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/persistence/completionsStore")>();
  return { ...actual, recordCompletion: vi.fn() };
});
vi.mock("../../../src/ingestion/library/librarySnapshotBus", () => ({
  invalidateLibrarySnapshot: vi.fn(),
}));
import {
  moveCollectionEntry,
  removeCollectionEntry,
  CollectionCorruptError,
} from "../../../src/persistence/collectionsStore";
import { recordCompletion } from "../../../src/persistence/completionsStore";
import {
  getCollectionActiveEntry,
  setCollectionActiveEntry,
} from "../../../src/persistence/collectionActiveEntriesStore";
import { invalidateLibrarySnapshot } from "../../../src/ingestion/library/librarySnapshotBus";

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
// Issue #247 — a second reading + the two-entry Continue fixture: the
// FIRST entry finished (shared completion), the SECOND unfinished —
// Continue must resume the SECOND (either remembered or first-unfinished).
const secondArticle = ArticleSchema.parse({
  id: "second-article",
  revision: 1,
  lang: "en",
  provenance: {
    title: "Second reading",
    retrievedAt: "2026-10-01T00:00:00.000Z",
    originalHtmlHash: `sha256:${"c".repeat(64)}`,
  },
  blocks: [{ kind: "paragraph", content: [{ text: "Body.", marks: [] }] }],
});
const continuingCollection = CollectionSchema.parse({
  ...collection,
  entries: [
    ...collection.entries,
    {
      id: "entry-2",
      target: { kind: "article", articleId: secondArticle.id },
      addedAt: "2026-10-01T00:01:00.000Z",
    },
  ],
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
  // Issue #247 — no remembered entry unless a describe says otherwise.
  vi.mocked(getCollectionActiveEntry).mockResolvedValue(null);
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
    // Issue #247 — the row link carries the /col/ collection context (the
    // parseHash grammar): opening a row IS reading within the collection.
    expect(await screen.findByRole("link", { name: article.readerTitle })).toHaveAttribute(
      "href",
      `#/article/${article.id}/col/${collection.id}/entry-1`,
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

// Issue #246 — shared completion on the detail surface: the progress line
// (finished entries / total entries), the per-row Finished mark, and the
// explicit mark-finished/unfinished correction control (accessible name
// carries the entry title; honest failure; optimistic label with catch-up).
describe("collection detail shared completion (issue #246)", () => {
  const totals = new Map([["named-article", 400]]);
  function snapshotWith(options: {
    locations?: [string, number][];
    completions?: { key: string; finished: boolean; updatedAt: string }[];
  }) {
    return {
      ...EMPTY_LIBRARY_SNAPSHOT,
      articles: [article],
      standaloneArticles: [article],
      totalsByArticleId: totals,
      latestLocationByArticleId: new Map(
        (options.locations ?? []).map(([id, offset]) => [
          id,
          {
            schemaVersion: 1 as const,
            articleId: id,
            revision: 1,
            graphemeOffset: offset,
            savedAt: "2026-10-01T00:00:00.000Z",
          },
        ]),
      ),
      completionByTargetKey: new Map(
        (options.completions ?? []).map((c) => [
          c.key,
          {
            schemaVersion: 1 as const,
            targetKey: c.key,
            target: { kind: "article", articleId: "named-article" } as const,
            finished: c.finished,
            source: "reader" as const,
            updatedAt: c.updatedAt,
          },
        ]),
      ),
    };
  }

  beforeEach(() => {
    vi.mocked(recordCompletion).mockReset();
    vi.mocked(invalidateLibrarySnapshot).mockReset();
  });

  it("shows the finished-entries progress line and the Finished mark", async () => {
    vi.mocked(useLibrarySnapshot).mockReturnValue({
      status: "ready",
      snapshot: snapshotWith({ locations: [["named-article", 400]] }),
    });
    render(<CollectionDetailView collectionId={collection.id} hasAppHistory={false} />);
    await screen.findByRole("link", { name: article.readerTitle });
    // Finished entries / total entries — never length- or page-weighted.
    expect(screen.getByText("1 of 1 finished")).toBeInTheDocument();
    expect(screen.getByText("Finished")).toBeInTheDocument();
    // The correction control offers the honest next action for a finished row.
    expect(screen.getByRole("button", { name: `Mark unfinished: ${article.readerTitle}` }));
  });

  it("an unfinished entry shows 0-finished progress and offers Mark finished", async () => {
    vi.mocked(useLibrarySnapshot).mockReturnValue({
      status: "ready",
      snapshot: snapshotWith({ locations: [["named-article", 120]] }),
    });
    render(<CollectionDetailView collectionId={collection.id} hasAppHistory={false} />);
    await screen.findByRole("link", { name: article.readerTitle });
    expect(screen.getByText("0 of 1 finished")).toBeInTheDocument();
    expect(screen.queryByText("Finished")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Mark finished: ${article.readerTitle}` }));
  });

  it("a correction writes the shared record and announces the outcome", async () => {
    vi.mocked(useLibrarySnapshot).mockReturnValue({
      status: "ready",
      snapshot: snapshotWith({ locations: [["named-article", 120]] }),
    });
    vi.mocked(recordCompletion).mockResolvedValue({
      schemaVersion: 1,
      targetKey: "article:named-article",
      target: { kind: "article", articleId: article.id },
      finished: true,
      source: "reader",
      updatedAt: "2026-10-02T00:00:00.000Z",
    });
    render(<CollectionDetailView collectionId={collection.id} hasAppHistory={false} />);
    const button = await screen.findByRole("button", {
      name: `Mark finished: ${article.readerTitle}`,
    });
    fireEvent.click(button);
    await screen.findByText(`Marked “${article.readerTitle}” finished.`);
    expect(recordCompletion).toHaveBeenCalledWith(
      { kind: "article", articleId: article.id },
      true,
      "reader",
    );
    expect(invalidateLibrarySnapshot).toHaveBeenCalled();
  });

  it("a failed correction announces the honest failure and keeps the retry label", async () => {
    vi.mocked(useLibrarySnapshot).mockReturnValue({
      status: "ready",
      snapshot: snapshotWith({ locations: [["named-article", 120]] }),
    });
    vi.mocked(recordCompletion).mockRejectedValue(new Error("disk full"));
    render(<CollectionDetailView collectionId={collection.id} hasAppHistory={false} />);
    const button = await screen.findByRole("button", {
      name: `Mark finished: ${article.readerTitle}`,
    });
    fireEvent.click(button);
    expect(await screen.findByText("Couldn't save reading status. Try again.")).toBeInTheDocument();
    // The optimistic flip reverts to the persisted truth — the retry label
    // is the ORIGINAL action (never a success lie).
    expect(screen.getByRole("button", { name: `Mark finished: ${article.readerTitle}` }));
    expect(invalidateLibrarySnapshot).not.toHaveBeenCalled();
  });
});

// ── Issue #247 — the Continue collection control ────────────────────────────
describe("collection detail Continue collection (issue #247)", () => {
  const totals = new Map([
    ["named-article", 400],
    ["second-article", 400],
  ]);
  function continueSnapshot() {
    return {
      ...EMPTY_LIBRARY_SNAPSHOT,
      articles: [article, secondArticle],
      standaloneArticles: [article, secondArticle],
      totalsByArticleId: totals,
      latestLocationByArticleId: new Map([
        [
          "named-article",
          {
            schemaVersion: 1 as const,
            articleId: "named-article",
            revision: 1,
            graphemeOffset: 400, // finished (end-pinned location)
            savedAt: "2026-10-01T00:00:00.000Z",
          },
        ],
      ]),
      completionByTargetKey: new Map(),
    };
  }

  beforeEach(() => {
    window.location.hash = "";
    vi.mocked(getCollectionActiveEntry).mockReset();
    vi.mocked(getCollectionActiveEntry).mockResolvedValue(null);
    vi.mocked(setCollectionActiveEntry).mockReset();
    vi.mocked(setCollectionActiveEntry).mockResolvedValue({
      schemaVersion: 1,
      collectionId: continuingCollection.id,
      entryId: "entry-2",
      updatedAt: "2026-10-02T00:00:00.000Z",
    });
    vi.mocked(getCollection).mockResolvedValue(continuingCollection);
    vi.mocked(useLibrarySnapshot).mockReturnValue({
      status: "ready",
      snapshot: continueSnapshot(),
    });
  });

  it("Continue resumes the REMEMBERED active unfinished entry and navigates with the /col/ context", async () => {
    vi.mocked(getCollectionActiveEntry).mockResolvedValue({
      schemaVersion: 1,
      collectionId: continuingCollection.id,
      entryId: "entry-2", // remembered the SECOND entry (unfinished)
      updatedAt: "2026-10-02T00:00:00.000Z",
    });
    render(<CollectionDetailView collectionId={continuingCollection.id} hasAppHistory={false} />);
    const button = await screen.findByRole("button", { name: "Continue this collection" });
    fireEvent.click(button);
    // The reader lands on the resumed entry's route (the async handler's
    // memory write + navigation settle before the library re-derives).
    await screen.findByText("1 of 2 finished");
    // The memory is re-remembered for the resumed entry (navigation
    // context — never a passage position)…
    expect(setCollectionActiveEntry).toHaveBeenCalledWith(continuingCollection.id, "entry-2");
    // …and the route carries the /col/<collectionId>/<entryId> context (the
    // parseHash grammar).
    expect(window.location.hash).toBe(
      `#/article/${secondArticle.id}/col/${continuingCollection.id}/entry-2`,
    );
  });

  it("Continue falls back to the FIRST unfinished entry when nothing usable is remembered", async () => {
    vi.mocked(getCollectionActiveEntry).mockResolvedValue(null);
    render(<CollectionDetailView collectionId={continuingCollection.id} hasAppHistory={false} />);
    const button = await screen.findByRole("button", { name: "Continue this collection" });
    fireEvent.click(button);
    await screen.findByText("1 of 2 finished");
    expect(setCollectionActiveEntry).toHaveBeenCalledWith(continuingCollection.id, "entry-2");
    expect(window.location.hash).toBe(
      `#/article/${secondArticle.id}/col/${continuingCollection.id}/entry-2`,
    );
  });

  it("a COMPLETED plan shows completion instead of silently restarting — no Continue button", async () => {
    // Both entries finished: the second via an explicit completion record.
    vi.mocked(useLibrarySnapshot).mockReturnValue({
      status: "ready",
      snapshot: {
        ...continueSnapshot(),
        completionByTargetKey: new Map([
          [
            "article:second-article",
            {
              schemaVersion: 1 as const,
              targetKey: "article:second-article",
              target: { kind: "article", articleId: secondArticle.id } as const,
              finished: true,
              source: "reader" as const,
              updatedAt: "2026-10-02T00:00:00.000Z",
            },
          ],
        ]),
      },
    });
    render(<CollectionDetailView collectionId={continuingCollection.id} hasAppHistory={false} />);
    await screen.findByText("2 of 2 finished");
    expect(screen.getByText("You’ve finished this collection.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue this collection" })).toBeNull();
    expect(window.location.hash).toBe(""); // no navigation happened
  });

  it("an EMPTY collection offers no Continue button (distinct from a completed plan)", async () => {
    vi.mocked(getCollection).mockResolvedValue(
      CollectionSchema.parse({ ...collection, entries: [] }),
    );
    render(<CollectionDetailView collectionId={collection.id} hasAppHistory={false} />);
    await screen.findByText("No readings in this collection yet.");
    expect(screen.queryByRole("button", { name: "Continue this collection" })).toBeNull();
  });

  it("a BLOCKED plan announces the honest refusal — an unfinished reading is no longer in the library", async () => {
    // entry-1 finished; entry-2 unfinished BUT unopenable (absent target).
    const blocked = CollectionSchema.parse({
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
    vi.mocked(getCollection).mockResolvedValue(blocked);
    vi.mocked(getCollectionActiveEntry).mockResolvedValue(null);
    render(<CollectionDetailView collectionId={blocked.id} hasAppHistory={false} />);
    const button = await screen.findByRole("button", { name: "Continue this collection" });
    fireEvent.click(button);
    await screen.findByText("The next unfinished reading is no longer in your library.");
    expect(setCollectionActiveEntry).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
  });

  it("row links carry the /col/ collection context and remember the entry on open", async () => {
    vi.mocked(getCollectionActiveEntry).mockResolvedValue(null);
    render(<CollectionDetailView collectionId={continuingCollection.id} hasAppHistory={false} />);
    const link = await screen.findByRole("link", { name: secondArticle.provenance.title });
    expect(link.getAttribute("href")).toBe(
      `#/article/${secondArticle.id}/col/${continuingCollection.id}/entry-2`,
    );
    fireEvent.click(link);
    await screen.findByText("1 of 2 finished");
    expect(setCollectionActiveEntry).toHaveBeenCalledWith(continuingCollection.id, "entry-2");
    expect(window.location.hash).toBe(
      `#/article/${secondArticle.id}/col/${continuingCollection.id}/entry-2`,
    );
  });
});
