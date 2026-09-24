// tests/unit/library/book-row.test.tsx
// Plan 12-05 Task 1 — component coverage for the expandable BookRow (D12-01
// + D12-06 + D12-11 + T-12-15). The persistence seams are mocked per-test
// (the AddDialog.test.tsx discipline) so the assertions exercise the
// disclosure semantics, resume targeting, skip disclosure, heading order,
// and the book TagEntry — never Dexie itself.
//
// Contracts pinned (12-05-PLAN Task 1 <action> item 7, as amended by the
// issue #67 locked IA — the title IS the resume affordance):
//   1. the chevron button toggles aria-expanded + the controlled region
//      (whose id matches aria-controls) — native disclosure semantics;
//   2. ROW-CLICK does NOT toggle (two gestures, two targets);
//   3. the title link targets the D12-07 last-read chapter id (and the
//      first declared chapter while unread);
//   4. skippedChapterCount renders the calm "N chapters could not be read."
//      note — and ABSENT at 0;
//   5. chapter sub-rows render h3 headings (the book title stays h2 —
//      heading order preserved inside the group);
//   6. the book TagEntry is present in the expanded region;
//   7. the remove trigger is the row action cluster's trash icon (the
//      .library-row-remove aria-label template), not an in-region text
//      button (issue #67 — one arrangement for every row).
//
// Issue #3 — BookRow consumes the ONE LibrarySnapshot (locations + the
// latest-location fold + the grapheme-total fold); the render helper builds
// one directly from the same schema-validated rows (no Dexie here).
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the persistence seams — no Dexie in a component test.
vi.mock("../../../src/persistence/booksStore", () => ({
  setBookTags: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/ingestion/library/tagsStore", () => ({
  setArticleTags: vi.fn().mockResolvedValue(undefined),
  setBookTags: vi.fn().mockResolvedValue(undefined),
}));

import { BookRow } from "../../../src/ingestion/library/BookRow";
import { ArticleSchema, BookSchema, LocationRecordSchema } from "../../../src/content/schema";
import type {
  Book,
  CanonicalArticle,
  LocationRecord,
} from "../../../src/content/schema";
import {
  EMPTY_LIBRARY_SNAPSHOT,
} from "../../../src/ingestion/library/librarySnapshot";
import type {
  LibrarySnapshot,
} from "../../../src/ingestion/library/librarySnapshot";
import {
  graphemeClusters,
  normalizeText,
} from "../../../src/content/normalizeText";
import { latestLocationByArticle } from "../../../src/reader/readingPosition";

const BOOK_ID = "epub-book000111";

/** A minimal valid Book over three chapter ids. */
function makeBook(overrides: Record<string, unknown> = {}): Book {
  return BookSchema.parse({
    id: BOOK_ID,
    title: "The Synthetic Book",
    authors: ["Ada Author", "Bob Builder"],
    language: "en",
    chapterArticleIds: [
      `${BOOK_ID}-c00`,
      `${BOOK_ID}-c01`,
      `${BOOK_ID}-c02`,
    ],
    skippedChapterCount: 0,
    source: "epub-upload",
    originalFileHash:
      "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    addedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

/** A minimal valid epub-chapter article (id + TOC title + bookId). */
function makeChapter(
  id: string,
  title: string,
  chapterIndex: number,
): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      title,
      retrievedAt: "2026-01-01T00:00:00.000Z",
      originalHtmlHash:
        "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    },
    blocks: [{ kind: "paragraph", content: [{ text: `Body of ${title}.` }] }],
    ingestionMeta: {
      source: "epub-chapter",
      originalHtmlHash:
        "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      extractionConfidence: "high",
      bookId: BOOK_ID,
      chapterIndex,
    },
  });
}

function loc(
  articleId: string,
  graphemeOffset: number,
  savedAt: string,
): LocationRecord {
  return LocationRecordSchema.parse({
    schemaVersion: 1,
    articleId,
    revision: 1,
    graphemeOffset,
    savedAt,
  });
}

/** The canonical three-chapter set (Chapter 1/2/3 titles). */
function sampleChapters(): CanonicalArticle[] {
  return [
    makeChapter(`${BOOK_ID}-c00`, "Chapter 1. Loomings", 0),
    makeChapter(`${BOOK_ID}-c01`, "Chapter 2. The Carpet-Bag", 1),
    makeChapter(`${BOOK_ID}-c02`, "Chapter 3. The Sermon", 2),
  ];
}

/** The LibrarySnapshot BookRow consumes, built from the same rows (Issue #3):
 * the totals fold + the latest-location fold derived exactly as the module
 * derives them. */
function snapshotFor(
  chapters: CanonicalArticle[],
  locations: LocationRecord[],
  highlightCountByArticleId: Map<string, number> = new Map(),
): LibrarySnapshot {
  const totalsByArticleId = new Map<string, number>();
  for (const article of chapters) {
    totalsByArticleId.set(
      article.id,
      graphemeClusters(normalizeText(article), article.lang).length,
    );
  }
  return {
    ...EMPTY_LIBRARY_SNAPSHOT,
    articles: chapters,
    chaptersByBook: new Map([[BOOK_ID, chapters]]),
    locations,
    latestLocationByArticleId: latestLocationByArticle(locations),
    totalsByArticleId,
    highlightCountByArticleId,
  };
}

describe("BookRow — disclosure semantics (T-12-15 + D12-01)", () => {
  it("renders the chevron button collapsed with a matching aria-controls region", () => {
    render(
      <BookRow
        book={makeBook()}
        chapters={sampleChapters()}
        snapshot={snapshotFor(sampleChapters(), [])}
        onRemove={() => {}}
      />,
    );
    const toggle = screen.getByRole("button", {
      name: "Chapters of The Synthetic Book",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const regionId = toggle.getAttribute("aria-controls");
    expect(regionId).toBe(`chapters-${BOOK_ID}`);
    // The controlled region exists (aria-controls resolves) and is hidden.
    const region = document.getElementById(regionId ?? "");
    expect(region).not.toBeNull();
    expect(region).toHaveAttribute("hidden", "");
  });

  it("chevron click toggles the region open and closed", async () => {
    const user = userEvent.setup();
    render(
      <BookRow
        book={makeBook()}
        chapters={sampleChapters()}
        snapshot={snapshotFor(sampleChapters(), [])}
        onRemove={() => {}}
      />,
    );
    const toggle = screen.getByRole("button", {
      name: "Chapters of The Synthetic Book",
    });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const region = document.getElementById(`chapters-${BOOK_ID}`);
    expect(region).not.toBeNull();
    expect(region).not.toHaveAttribute("hidden");
    // Collapse works (the e2e's back-and-forth at unit level).
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(region).toHaveAttribute("hidden", "");
  });

  it("ROW-CLICK does NOT toggle (two gestures, two targets)", async () => {
    const user = userEvent.setup();
    render(
      <BookRow
        book={makeBook()}
        chapters={sampleChapters()}
        snapshot={snapshotFor(sampleChapters(), [])}
        onRemove={() => {}}
      />,
    );
    const toggle = screen.getByRole("button", {
      name: "Chapters of The Synthetic Book",
    });
    // Click the card body (the h2 title element inside article.book-card).
    await user.click(screen.getByRole("heading", { name: "The Synthetic Book" }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const region = document.getElementById(`chapters-${BOOK_ID}`);
    expect(region).toHaveAttribute("hidden", "");
  });
});

describe("BookRow — resume targeting (D12-07 + issue #67)", () => {
  // Issue #67 (locked IA, variant A): the TITLE is the resume affordance —
  // it links to the D12-07 last-read chapter while one exists.
  it("the title link href targets the last-read chapter", () => {
    const book = makeBook();
    const locations = [
      loc(`${BOOK_ID}-c00`, 5, "2026-01-02T00:00:00.000Z"),
      loc(`${BOOK_ID}-c02`, 5, "2026-01-06T00:00:00.000Z"), // most recent
    ];
    render(
      <BookRow
        book={book}
        chapters={sampleChapters()}
        snapshot={snapshotFor(sampleChapters(), locations)}
        onRemove={() => {}}
      />,
    );
    // Accessible name comes from the link text (the book title itself).
    const titleLink = screen.getByRole("link", { name: "The Synthetic Book" });
    expect(titleLink.getAttribute("href")).toBe(`#/article/${BOOK_ID}-c02`);
    expect(titleLink.textContent).toBe("The Synthetic Book");
  });

  it("an unread book's title links to the first declared chapter", () => {
    render(
      <BookRow
        book={makeBook()}
        chapters={sampleChapters()}
        snapshot={snapshotFor(sampleChapters(), [])}
        onRemove={() => {}}
      />,
    );
    const titleLink = screen.getByRole("link", { name: "The Synthetic Book" });
    expect(titleLink.getAttribute("href")).toBe(`#/article/${BOOK_ID}-c00`);
  });
});

describe("BookRow — skip disclosure (D12-11)", () => {
  it("skippedChapterCount 2 renders the calm plural note", () => {
    render(
      <BookRow
        book={makeBook({ skippedChapterCount: 2 })}
        chapters={sampleChapters()}
        snapshot={snapshotFor(sampleChapters(), [])}
        onRemove={() => {}}
      />,
    );
    expect(
      screen.getByText("2 chapters could not be read."),
    ).toBeInTheDocument();
  });

  it("skippedChapterCount 1 renders the singular note", () => {
    render(
      <BookRow
        book={makeBook({ skippedChapterCount: 1 })}
        chapters={sampleChapters()}
        snapshot={snapshotFor(sampleChapters(), [])}
        onRemove={() => {}}
      />,
    );
    expect(screen.getByText("1 chapter could not be read.")).toBeInTheDocument();
  });

  it("no skip note at skippedChapterCount 0 (never silently present)", () => {
    render(
      <BookRow
        book={makeBook()}
        chapters={sampleChapters()}
        snapshot={snapshotFor(sampleChapters(), [])}
        onRemove={() => {}}
      />,
    );
    expect(screen.queryByText(/could not be read/)).toBeNull();
  });
});

describe("BookRow — the icon action cluster (issue #67)", () => {
  it("the remove trigger is the cluster trash icon with the shared aria-label template", async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(
      <BookRow
        book={makeBook()}
        chapters={sampleChapters()}
        snapshot={snapshotFor(sampleChapters(), [])}
        onRemove={onRemove}
      />,
    );
    const remove = screen.getByRole("button", {
      name: "Remove The Synthetic Book from library",
    });
    expect(remove.querySelector("svg")).not.toBeNull();
    await user.click(remove);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});

describe("BookRow — chapter sub-rows + tags (D12-01 + D12-04)", () => {
  it("chapter sub-rows carry the per-article review entry at ≥ 1 highlight (issue #76)", async () => {
    const user = userEvent.setup();
    const chapters = sampleChapters();
    render(
      <BookRow
        book={makeBook()}
        chapters={chapters}
        snapshot={snapshotFor(chapters, [], new Map([[`${BOOK_ID}-c01`, 2]]))}
        onRemove={() => {}}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Chapters of The Synthetic Book" }),
    );
    const link = screen.getByLabelText(
      "Review 2 highlights for Chapter 2. The Carpet-Bag",
    );
    expect(link).toHaveAttribute(
      "href",
      `#/highlights?article=${BOOK_ID}-c01`,
    );
    // Chapters without highlights stay gated off (the gate IS the zero state).
    expect(
      screen.queryByLabelText("Review 1 highlight for Chapter 1. Loomings"),
    ).toBeNull();
  });

  it("the book cluster stays trash-only — no review entry on the book row (issue #76)", () => {
    const chapters = sampleChapters();
    render(
      <BookRow
        book={makeBook()}
        chapters={chapters}
        snapshot={snapshotFor(chapters, [], new Map([[`${BOOK_ID}-c01`, 2]]))}
        onRemove={() => {}}
      />,
    );
    const cluster = document.querySelector(".book-card > .library-row-actions")!;
    expect(cluster.querySelectorAll(".library-row-highlights")).toHaveLength(0);
    expect(cluster.querySelectorAll("button")).toHaveLength(1);
  });

  it("expanded chapters render h3 headings under the h2 book title", async () => {
    const user = userEvent.setup();
    render(
      <BookRow
        book={makeBook()}
        chapters={sampleChapters()}
        snapshot={snapshotFor(sampleChapters(), [])}
        onRemove={() => {}}
      />,
    );
    // Book title is the level-2 heading (collapsed AND expanded).
    expect(
      screen.getByRole("heading", { level: 2, name: "The Synthetic Book" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Chapters of The Synthetic Book" }),
    );
    for (const title of [
      "Chapter 1. Loomings",
      "Chapter 2. The Carpet-Bag",
      "Chapter 3. The Sermon",
    ]) {
      expect(
        screen.getByRole("heading", { level: 3, name: title }),
      ).toBeInTheDocument();
    }
  });

  it("the book TagEntry is present in the expanded region", async () => {
    const user = userEvent.setup();
    render(
      <BookRow
        book={makeBook({ tags: ["essays"] })}
        chapters={sampleChapters()}
        snapshot={snapshotFor(sampleChapters(), [])}
        onRemove={() => {}}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Chapters of The Synthetic Book" }),
    );
    // TagEntry renders the fieldset + legend + existing-tag chips. The chip
    // is asserted WITHIN the fieldset — the collapsed row's readonly tag
    // chips (issue #67 anatomy) also render the tag text outside it.
    const fieldset = screen.getByRole("group", { name: /tags/i });
    expect(fieldset).toBeInTheDocument();
    expect(within(fieldset).getByText("essays")).toBeInTheDocument();
  });

  it("chapters render in the book's declared TOC order", async () => {
    const user = userEvent.setup();
    const chapters = [
      makeChapter(`${BOOK_ID}-c02`, "Chapter 3. The Sermon", 2),
      makeChapter(`${BOOK_ID}-c00`, "Chapter 1. Loomings", 0),
      makeChapter(`${BOOK_ID}-c01`, "Chapter 2. The Carpet-Bag", 1),
    ];
    render(
      <BookRow
        book={makeBook()}
        chapters={chapters}
        snapshot={snapshotFor(chapters, [])}
        onRemove={() => {}}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Chapters of The Synthetic Book" }),
    );
    const list = document.querySelector(".book-chapter-list");
    expect(list).not.toBeNull();
    const headings = Array.from(list!.querySelectorAll("h3")).map(
      (h) => h.textContent,
    );
    expect(headings).toEqual([
      "Chapter 1. Loomings",
      "Chapter 2. The Carpet-Bag",
      "Chapter 3. The Sermon",
    ]);
  });
});
