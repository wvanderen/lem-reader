// tests/unit/review/review-view-article-notes.test.tsx
// Issue #210 — the Annotations review's article-note rows at the ReviewView
// seam (the twin of review-view-remove.test.tsx). Pins:
//   - the note row renders its text, the "Article note" badge, the explicit
//     Open article anchor (the plain #/article/<id> destination — never a
//     passage jump), and the Edit control;
//   - editing opens the SHARED inline editor (the drawer's editor seam):
//     textarea + always-visible tag field mount INSIDE the row, the URL
//     never changes, and the page's ONE status region carries the editor's
//     honest copy;
//   - a safe close returns focus to the opening Edit control;
//   - a confirmed delete announces "Article note deleted." and invalidates
//     the ONE snapshot;
//   - the combined count line is labeled "annotations" (the reader header's
//     highlight-only count is ArticleView's seam, pinned elsewhere).
// The snapshot hook + invalidation + store seams are mocked (a fixture
// snapshot, no Dexie); everything between the row button and the
// announcement is the REAL component tree (ArticleNoteReviewRow →
// ArticleNoteEditor → TagEntry).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsProvider } from "../../../src/settings/SettingsContext";
import type { LibrarySnapshot } from "../../../src/ingestion/library/librarySnapshot";

vi.mock("../../../src/ingestion/library/useLibrarySnapshot", () => ({
  useLibrarySnapshot: vi.fn(),
}));
vi.mock("../../../src/ingestion/library/librarySnapshot", () => ({
  invalidateLibrarySnapshot: vi.fn(),
}));
vi.mock("../../../src/ingestion/library/tagsStore", () => ({
  loadTagStats: vi.fn().mockResolvedValue([]),
  routeToStoredCasing: vi.fn(async (tags: string[]) => tags),
  setArticleTags: vi.fn().mockResolvedValue(undefined),
  setBookTags: vi.fn().mockResolvedValue(undefined),
  setHighlightTags: vi.fn(async (_id: string, tags: string[]) => tags),
}));
vi.mock("../../../src/persistence/notesStore", () => ({
  saveNote: vi.fn(),
  deleteNote: vi.fn(),
}));
vi.mock("../../../src/persistence/highlightsStore", () => ({
  deleteHighlight: vi.fn().mockResolvedValue(undefined),
  setHighlightColor: vi.fn().mockResolvedValue(undefined),
}));
// The article-note store: the recovery read + the write seam the editor uses.
vi.mock("../../../src/persistence/articleNotesStore", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    loadArticleNotes: vi.fn().mockResolvedValue({ notes: [], drafts: [] }),
    editArticleNote: vi.fn().mockResolvedValue(undefined),
    deleteArticleNote: vi.fn().mockResolvedValue(undefined),
  };
});

import { ReviewView } from "../../../src/routes/review/ReviewView";
import { invalidateLibrarySnapshot } from "../../../src/ingestion/library/librarySnapshot";
import { editArticleNote, deleteArticleNote } from "../../../src/persistence/articleNotesStore";
import { useLibrarySnapshot } from "../../../src/ingestion/library/useLibrarySnapshot";
import { ArticleSchema, HighlightRecordSchema } from "../../../src/content/schema";
import type { CanonicalArticle, HighlightRecord } from "../../../src/content/schema";
import type { ArticleNote } from "../../../src/persistence/articleNotesStore";
import {
  deriveQuoteSelector,
  graphemeClusters,
  normalizeText,
} from "../../../src/content/normalizeText";
import type { TextPositionSelector, TextQuoteSelector } from "../../../src/content/normalizeText";
import { findAllOccurrences } from "../../../src/annotations/resolution";

// jsdom <dialog> polyfill (the review-view-remove.test discipline — the
// always-mounted curation dialogs use showModal).
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

// ── Fixture construction (schema-validated; the sibling-suite shape) ─────────

const ARTICLE_TITLE = "An Annotated Essay";
const PASSAGE = "The morning register recorded every bell.";

const article: CanonicalArticle = ArticleSchema.parse({
  id: "a1",
  revision: 1,
  lang: "en",
  provenance: {
    title: ARTICLE_TITLE,
    retrievedAt: "2026-01-01T00:00:00.000Z",
    originalHtmlHash: "0".repeat(64),
  },
  blocks: [{ kind: "paragraph", content: [{ text: PASSAGE }] }],
});

function uniqueAnchor(a: CanonicalArticle, exact: string) {
  const clusters = graphemeClusters(normalizeText(a), a.lang);
  const exactClusters = graphemeClusters(exact, a.lang);
  const positions = findAllOccurrences(clusters, exactClusters);
  if (positions.length !== 1) throw new Error(`fixture drift: "${exact}" not unique`);
  const start = positions[0]!;
  const position: TextPositionSelector = { start, end: start + exactClusters.length };
  const quote: TextQuoteSelector = deriveQuoteSelector(a, position);
  return { position, quote };
}

const highlight: HighlightRecord = HighlightRecordSchema.parse({
  schemaVersion: 1,
  id: "hl-morning",
  articleId: article.id,
  revision: 1,
  ...uniqueAnchor(article, PASSAGE),
  createdAt: "2026-02-01T00:00:00.000Z",
  tags: [],
});

const savedNote: ArticleNote = {
  schemaVersion: 1,
  id: "an-1",
  articleId: article.id,
  text: "An overarching reflection.",
  tags: ["theme"],
  createdAt: "2026-02-02T00:00:00.000Z",
  updatedAt: "2026-02-02T00:00:00.000Z",
};

function makeSnapshot(): LibrarySnapshot {
  return {
    articles: [article],
    standaloneArticles: [article],
    chaptersByBook: new Map(),
    books: [],
    locations: [],
    latestLocationByArticleId: new Map(),
    totalsByArticleId: new Map([[article.id, 128]]),
    highlightCountByArticleId: new Map([[article.id, 1]]),
    annotationCountByArticleId: new Map([[article.id, 2]]),
    tags: [],
    annotationTags: ["theme"],
    highlights: [highlight],
    notes: [],
    articleNotes: [savedNote],
    readingSessions: [],
  };
}

describe("ReviewView article-note rows (issue #210)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useLibrarySnapshot).mockReturnValue({ status: "ready", snapshot: makeSnapshot() });
  });

  it("renders the note row: text, badge, explicit Open article anchor, Edit control", () => {
    render(<SettingsHost />);

    // The combined count is labeled annotations (3... no: 1 highlight + 1 note).
    expect(screen.getByText("2 annotations")).toBeTruthy();

    // The note row's content + type badge.
    expect(screen.getByText("An overarching reflection.")).toBeTruthy();
    expect(screen.getByText("Article note")).toBeTruthy();

    // The explicit navigation: a plain article destination (never a passage
    // jump hash), and only ONE navigation affordance on the note row — the
    // highlight row's Go-to-highlight jump stays on ITS row (the corpus
    // carries one of each kind, so the assertion scopes to the note row).
    const open = screen.getByRole("link", {
      name: "Open article: An overarching reflection. (An Annotated Essay)",
    });
    expect(open.getAttribute("href")).toBe("#/article/a1");
    const noteItem = open.closest("li.review-item-note");
    expect(noteItem).not.toBeNull();
    expect(noteItem?.querySelector("a[aria-label^='Go to highlight:'i]")).toBeNull();

    // The edit control carries the note excerpt for row distinguishability.
    expect(
      screen.getByRole("button", { name: "Edit article note: An overarching reflection." }),
    ).toBeTruthy();
  });

  it("editing opens the shared inline editor; the URL never changes; status is honest", async () => {
    const user = userEvent.setup();
    render(<SettingsHost />);

    await user.click(
      screen.getByRole("button", { name: "Edit article note: An overarching reflection." }),
    );

    // The editor session mounts INLINE: textarea + always-visible tag field.
    const text = screen.getByRole("textbox", { name: "Article note" });
    expect(text).toHaveValue("An overarching reflection.");
    expect(screen.getByRole("region", { name: "Article note tags" })).toBeTruthy();
    expect(document.querySelector("input#article-note-tags-input")).not.toBeNull();

    // No navigation happened — the hash is untouched (the ReviewView mounts
    // at the plain unscoped destination in this harness).
    expect(window.location.hash).not.toContain("/article/");

    // A text edit writes through the ONE store seam; the page's ONE status
    // region carries the editor's honest copy.
    await user.type(text, " More.");
    await waitFor(() =>
      expect(vi.mocked(editArticleNote)).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "an-1",
          text: "An overarching reflection. More.",
          tags: ["theme"],
        }),
      ),
    );
    await waitFor(() => expect(screen.getByText("Saved.")).toBeTruthy());
  });

  it("a safe close returns focus to the opening Edit control", async () => {
    const user = userEvent.setup();
    render(<SettingsHost />);
    const editButton = screen.getByRole("button", {
      name: "Edit article note: An overarching reflection.",
    });
    await user.click(editButton);
    expect(screen.getByRole("textbox", { name: "Article note" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "Article note" })).toBeNull(),
    );
    expect(editButton).toHaveFocus();
  });

  it("a confirmed delete announces honestly and invalidates the ONE snapshot", async () => {
    const user = userEvent.setup();
    render(<SettingsHost />);
    await user.click(
      screen.getByRole("button", { name: "Edit article note: An overarching reflection." }),
    );

    await user.click(screen.getByRole("button", { name: "Delete article note" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete article note" }));

    expect(vi.mocked(deleteArticleNote)).toHaveBeenCalledWith("an-1");
    await waitFor(() => expect(screen.getByText("Article note deleted.")).toBeTruthy());
    expect(invalidateLibrarySnapshot).toHaveBeenCalled();
  });
});

/** The SettingsProvider wrapper (the sibling suites' harness shape). */
function SettingsHost() {
  return (
    <SettingsProvider>
      <ReviewView hasAppHistory={false} />
    </SettingsProvider>
  );
}
