// tests/unit/review/review-view-remove.test.tsx
// Issue #174 — the Highlights view's proportional removal routing. Pins the
// ReviewView seam (the twin of review-view-tags-announcement.test.tsx):
//   - a NO-NOTE row (empty or whitespace-only note) removes IMMEDIATELY from
//     the Remove click — no confirm dialog, "Highlight removed." announced,
//     the ONE snapshot invalidation fired, focus handed to the NEIGHBORING
//     row's Remove button (the removed row's own button unmounts);
//   - a NONEMPTY note keeps the cascade-honest confirm dialog (the write
//     waits for its Proceed; Keep cancels cleanly);
//   - a FAILED immediate removal announces the ONE shared failure copy and
//     never invalidates (never a success lie).
// The snapshot hook + invalidation seam are mocked (a fixture snapshot, no
// Dexie); the delete path runs through the mocked highlightsStore seam —
// everything between the row button and the announcement is the REAL
// component tree (ReviewRow → DeleteHighlightConfirm → useHonestWrite).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LibrarySnapshot } from "../../../src/ingestion/library/librarySnapshot";

vi.mock("../../../src/ingestion/library/useLibrarySnapshot", () => ({
  useLibrarySnapshot: vi.fn(),
}));
vi.mock("../../../src/ingestion/library/librarySnapshot", () => ({
  invalidateLibrarySnapshot: vi.fn(),
}));
vi.mock("../../../src/ingestion/library/tagsStore", () => ({
  loadTagStats: vi.fn().mockResolvedValue([]),
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

import { ReviewView } from "../../../src/routes/review/ReviewView";
import { HIGHLIGHT_REMOVE_FAILED_COPY } from "../../../src/routes/review/DeleteHighlightConfirm";
import { invalidateLibrarySnapshot } from "../../../src/ingestion/library/librarySnapshot";
import { deleteHighlight } from "../../../src/persistence/highlightsStore";
import { useLibrarySnapshot } from "../../../src/ingestion/library/useLibrarySnapshot";
import { ArticleSchema, HighlightRecordSchema, NoteRecordSchema } from "../../../src/content/schema";
import type { CanonicalArticle, HighlightRecord, NoteRecord } from "../../../src/content/schema";
import {
  deriveQuoteSelector,
  graphemeClusters,
  normalizeText,
} from "../../../src/content/normalizeText";
import type { TextPositionSelector, TextQuoteSelector } from "../../../src/content/normalizeText";
import { findAllOccurrences } from "../../../src/annotations/resolution";

// jsdom <dialog> polyfill (mirrors review-view-tags-announcement.test.tsx).
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

// ── Fixture construction (schema-validated; the review-filter.test shape) ────

const ARTICLE_TITLE = "An Essay";

const MORNING = "The morning register recorded every bell.";
const EVENING = "The evening ledger tracked every debt.";

const article: CanonicalArticle = ArticleSchema.parse({
  id: "a1",
  revision: 1,
  lang: "en",
  provenance: {
    title: ARTICLE_TITLE,
    retrievedAt: "2026-01-01T00:00:00.000Z",
    originalHtmlHash: "0".repeat(64),
  },
  blocks: [{ kind: "paragraph", content: [{ text: `${MORNING} ${EVENING}` }] }],
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

const morningHighlight: HighlightRecord = HighlightRecordSchema.parse({
  schemaVersion: 1,
  id: "hl-morning",
  articleId: article.id,
  revision: 1,
  ...uniqueAnchor(article, MORNING),
  createdAt: "2026-02-01T00:00:00.000Z",
  tags: [],
});

const eveningHighlight: HighlightRecord = HighlightRecordSchema.parse({
  schemaVersion: 1,
  id: "hl-evening",
  articleId: article.id,
  revision: 1,
  ...uniqueAnchor(article, EVENING),
  createdAt: "2026-02-02T00:00:00.000Z",
  tags: [],
});

function makeNote(highlightId: string, text: string): NoteRecord {
  return NoteRecordSchema.parse({
    schemaVersion: 1,
    id: `note-${highlightId}`,
    highlightId,
    text,
    updatedAt: "2026-02-03T00:00:00.000Z",
  });
}

/** The panel snapshot: both rows present; each test picks the note texts. */
function makeSnapshot(notes: NoteRecord[]): LibrarySnapshot {
  return {
    articles: [article],
    standaloneArticles: [article],
    chaptersByBook: new Map(),
    books: [],
    locations: [],
    latestLocationByArticleId: new Map(),
    totalsByArticleId: new Map([[article.id, 128]]),
    highlightCountByArticleId: new Map([[article.id, 2]]),
    tags: [],
    highlightTags: [],
    highlights: [morningHighlight, eveningHighlight],
    notes,
    readingSessions: [],
  };
}

const removeButton = (excerpt: string) =>
  screen.getByRole("button", { name: `Remove highlight: ${excerpt}` });

describe("ReviewView removal routing (issue #174 — proportional delete)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(deleteHighlight).mockResolvedValue(undefined);
  });

  it("a NO-NOTE row removes immediately — no dialog, announced, invalidated, focus to the neighbor row", async () => {
    const user = userEvent.setup();
    vi.mocked(useLibrarySnapshot).mockReturnValue({ status: "ready", snapshot: makeSnapshot([]) });
    render(<ReviewView hasAppHistory={false} />);

    await user.click(removeButton(EVENING));

    // The write fired directly — no confirm dialog ever mounted.
    expect(vi.mocked(deleteHighlight)).toHaveBeenCalledWith("hl-evening");
    expect(screen.queryByRole("alertdialog")).toBeNull();

    // The honest success + the ONE invalidation.
    await waitFor(() => expect(screen.getByText("Highlight removed.")).toBeTruthy());
    expect(invalidateLibrarySnapshot).toHaveBeenCalledTimes(1);

    // The focus handoff: the removed row's button would unmount, so focus
    // lands on the NEIGHBORING row's Remove button (the same cluster
    // position the reader just used).
    expect(removeButton(MORNING)).toHaveFocus();
  });

  it("a WHITESPACE-ONLY note still counts as no note — immediate removal, no preview rendered", async () => {
    const user = userEvent.setup();
    vi.mocked(useLibrarySnapshot).mockReturnValue({
      status: "ready",
      snapshot: makeSnapshot([makeNote("hl-evening", "   ")]),
    });
    render(<ReviewView hasAppHistory={false} />);

    // The whitespace-only note renders NO preview (treated as absent).
    expect(document.querySelectorAll(".review-note-preview")).toHaveLength(0);

    await user.click(removeButton(EVENING));

    expect(vi.mocked(deleteHighlight)).toHaveBeenCalledWith("hl-evening");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(screen.getByText("Highlight removed.")).toBeTruthy());
  });

  it("a NONEMPTY note opens the confirm dialog — the write waits; Keep cancels cleanly", async () => {
    const user = userEvent.setup();
    vi.mocked(useLibrarySnapshot).mockReturnValue({
      status: "ready",
      snapshot: makeSnapshot([makeNote("hl-morning", "A note worth keeping.")]),
    });
    render(<ReviewView hasAppHistory={false} />);

    await user.click(removeButton(MORNING));

    // The dialog routed; nothing written yet.
    const alert = screen.getByRole("alertdialog");
    expect(alert).toBeVisible();
    // Cascade-honest copy (D10-12 — one combined body sentence).
    expect(screen.getByText(/The note attached to it will also be removed\./)).toBeTruthy();
    expect(vi.mocked(deleteHighlight)).not.toHaveBeenCalled();

    // Keep highlight (the initial-focus default) — nothing deleted, row kept.
    await user.click(screen.getByRole("button", { name: "Keep highlight" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(vi.mocked(deleteHighlight)).not.toHaveBeenCalled();
    expect(screen.queryByText("Highlight removed.")).toBeNull();
    expect(invalidateLibrarySnapshot).not.toHaveBeenCalled();
  });

  it("a FAILED immediate removal announces the shared failure copy + never invalidates", async () => {
    const user = userEvent.setup();
    vi.mocked(useLibrarySnapshot).mockReturnValue({ status: "ready", snapshot: makeSnapshot([]) });
    vi.mocked(deleteHighlight).mockRejectedValueOnce(new Error("quota"));
    render(<ReviewView hasAppHistory={false} />);

    await user.click(removeButton(EVENING));

    await waitFor(() => expect(screen.getByText(HIGHLIGHT_REMOVE_FAILED_COPY)).toBeTruthy());
    expect(screen.queryByText("Highlight removed.")).toBeNull();
    // The row was NOT removed — no invalidation, nothing announced as saved.
    expect(invalidateLibrarySnapshot).not.toHaveBeenCalled();
  });
});
