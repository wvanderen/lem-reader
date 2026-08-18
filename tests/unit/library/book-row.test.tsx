// tests/unit/library/book-row.test.tsx
// Plan 12-05 Task 1 — component coverage for the expandable BookRow (D12-01
// + D12-06 + D12-11 + T-12-15). The persistence seams are mocked per-test
// (the IngestControl.test.tsx discipline) so the assertions exercise the
// disclosure semantics, resume targeting, skip disclosure, heading order,
// and the book TagEntry — never Dexie itself.
//
// Contracts pinned (12-05-PLAN Task 1 <action> item 7):
//   1. the chevron button toggles aria-expanded + the controlled region
//      (whose id matches aria-controls) — native disclosure semantics;
//   2. ROW-CLICK does NOT toggle (two gestures, two targets);
//   3. the Resume link targets the D12-07 last-read chapter id;
//   4. skippedChapterCount renders the calm "N chapters could not be read."
//      note — and ABSENT at 0;
//   5. chapter sub-rows render h3 headings (the book title stays h2 —
//      heading order preserved inside the group);
//   6. the book TagEntry is present in the expanded region.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the persistence seams — no Dexie in a component test.
vi.mock("../../../src/persistence/booksStore", () => ({
  setBookTags: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/ingestion/library/tagsStore", () => ({
  setArticleTags: vi.fn().mockResolvedValue(undefined),
}));

import { BookRow } from "../../../src/ingestion/library/BookRow";
import { ArticleSchema, BookSchema, LocationRecordSchema } from "../../../src/content/schema";
import type {
  Book,
  CanonicalArticle,
  LocationRecord,
} from "../../../src/content/schema";

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

describe("BookRow — disclosure semantics (T-12-15 + D12-01)", () => {
  it("renders the chevron button collapsed with a matching aria-controls region", () => {
    render(
      <BookRow
        book={makeBook()}
        chapters={sampleChapters()}
        locations={[]}
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
        locations={[]}
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
        locations={[]}
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

describe("BookRow — resume targeting (D12-07)", () => {
  it("the Resume link href targets the last-read chapter", () => {
    const book = makeBook();
    const locations = [
      loc(`${BOOK_ID}-c00`, 5, "2026-01-02T00:00:00.000Z"),
      loc(`${BOOK_ID}-c02`, 5, "2026-01-06T00:00:00.000Z"), // most recent
    ];
    render(
      <BookRow
        book={book}
        chapters={sampleChapters()}
        locations={locations}
        onRemove={() => {}}
      />,
    );
    // Accessible name comes from aria-labelledby → the book title heading.
    const resume = screen.getByRole("link", { name: "The Synthetic Book" });
    expect(resume.getAttribute("href")).toBe(`#/article/${BOOK_ID}-c02`);
    expect(resume.textContent).toBe("Resume");
  });

  it("no Resume link before the book is ever opened", () => {
    render(
      <BookRow
        book={makeBook()}
        chapters={sampleChapters()}
        locations={[]}
        onRemove={() => {}}
      />,
    );
    expect(screen.queryByText("Resume")).toBeNull();
  });
});

describe("BookRow — skip disclosure (D12-11)", () => {
  it("skippedChapterCount 2 renders the calm plural note", () => {
    render(
      <BookRow
        book={makeBook({ skippedChapterCount: 2 })}
        chapters={sampleChapters()}
        locations={[]}
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
        locations={[]}
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
        locations={[]}
        onRemove={() => {}}
      />,
    );
    expect(screen.queryByText(/could not be read/)).toBeNull();
  });
});

describe("BookRow — chapter sub-rows + tags (D12-01 + D12-04)", () => {
  it("expanded chapters render h3 headings under the h2 book title", async () => {
    const user = userEvent.setup();
    render(
      <BookRow
        book={makeBook()}
        chapters={sampleChapters()}
        locations={[]}
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
        locations={[]}
        onRemove={() => {}}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Chapters of The Synthetic Book" }),
    );
    // TagEntry renders the fieldset + legend + existing-tag chips.
    const fieldset = screen.getByRole("group", { name: /tags/i });
    expect(fieldset).toBeInTheDocument();
    expect(screen.getByText("essays")).toBeInTheDocument();
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
        locations={[]}
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
