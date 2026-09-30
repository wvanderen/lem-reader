// tests/unit/review/review-view-tags-announcement.test.tsx
// Issue #117 review follow-up — the PANEL-side announcement glue. The
// dialog's honest outcome machine is pinned by review-tags-dialog.test.tsx;
// THIS suite pins the ReviewView mapping (the seam between the dialog's
// outcome and the page-level .status live region + the ONE snapshot
// invalidation):
//   - "failed"  → the shared TAGS_SAVE_FAILED_COPY (never a success lie)
//                 + the invalidation (re-derive, no stale rows)
//   - "saved"   → "Tags saved." (only after a write that landed)
//                 + the invalidation
//   - "untouched" → silent close — nothing written, nothing announced,
//                 nothing invalidated
// ReviewView is mounted with the snapshot hook + invalidation seam mocked
// (a fixture snapshot, no Dexie); everything between the row button and the
// announcement is the REAL component tree (ReviewRow → ReviewTagsDialog →
// TagEntry → setHighlightTags mock).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LibrarySnapshot } from "../../../src/ingestion/library/librarySnapshot";

vi.mock("../../../src/ingestion/library/useLibrarySnapshot", () => ({
  useLibrarySnapshot: vi.fn(),
}));
vi.mock("../../../src/ingestion/library/librarySnapshot", () => ({
  invalidateLibrarySnapshot: vi.fn(),
}));
vi.mock("../../../src/ingestion/library/tagsStore", () => ({
  loadTagStats: vi.fn().mockResolvedValue([{ tag: "philosophy", count: 1 }]),
  setArticleTags: vi.fn().mockResolvedValue(undefined),
  setBookTags: vi.fn().mockResolvedValue(undefined),
  setHighlightTags: vi.fn(async (_id: string, tags: string[]) => tags),
}));
// The note + highlight stores ride in ReviewView's dialog graph only (the
// note/delete paths are covered by their own suites) — stubbed so the Dexie
// module graph never loads in jsdom.
vi.mock("../../../src/persistence/notesStore", () => ({
  saveNote: vi.fn(),
  deleteNote: vi.fn(),
}));
vi.mock("../../../src/persistence/highlightsStore", () => ({
  deleteHighlight: vi.fn(),
}));

import { ReviewView } from "../../../src/routes/review/ReviewView";
import { TAGS_SAVE_FAILED_COPY } from "../../../src/routes/review/ReviewTagsDialog";
import { invalidateLibrarySnapshot } from "../../../src/ingestion/library/librarySnapshot";
import { setHighlightTags } from "../../../src/ingestion/library/tagsStore";
import { useLibrarySnapshot } from "../../../src/ingestion/library/useLibrarySnapshot";
import { ArticleSchema, HighlightRecordSchema } from "../../../src/content/schema";
import type { CanonicalArticle, HighlightRecord } from "../../../src/content/schema";
import {
  deriveQuoteSelector,
  graphemeClusters,
  normalizeText,
} from "../../../src/content/normalizeText";
import type { TextPositionSelector, TextQuoteSelector } from "../../../src/content/normalizeText";
import { findAllOccurrences } from "../../../src/annotations/resolution";

// jsdom <dialog> polyfill (mirrors review-tags-dialog.test.tsx).
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
const EXACT = "A quoted sentence";

const article: CanonicalArticle = ArticleSchema.parse({
  id: "a1",
  revision: 1,
  lang: "en",
  provenance: {
    title: ARTICLE_TITLE,
    retrievedAt: "2026-01-01T00:00:00.000Z",
    originalHtmlHash: "0".repeat(64),
  },
  blocks: [{ kind: "paragraph", content: [{ text: `${EXACT} sits alone here.` }] }],
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
  id: "hl-1",
  articleId: article.id,
  revision: 1,
  ...uniqueAnchor(article, EXACT),
  createdAt: "2026-02-01T00:00:00.000Z",
  tags: ["essays"],
});

const snapshot: LibrarySnapshot = {
  articles: [article],
  standaloneArticles: [article],
  chaptersByBook: new Map(),
  books: [],
  locations: [],
  latestLocationByArticleId: new Map(),
  totalsByArticleId: new Map([[article.id, 64]]),
  highlightCountByArticleId: new Map([[article.id, 1]]),
  tags: [],
  highlightTags: ["essays"],
  highlights: [highlight],
  notes: [],
  readingSessions: [],
};

vi.mocked(useLibrarySnapshot).mockReturnValue({ status: "ready", snapshot });

/** Mount the panel, open the row's tag editor, return the dialog handles. */
async function openTagsDialog() {
  const view = render(<ReviewView hasAppHistory={false} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /^Edit tags: / }));
  const dialog = await screen.findByRole("dialog", { name: "Edit tags" });
  return { view, user, dialog };
}

describe("ReviewView tags announcement glue (issue #117 review follow-up)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useLibrarySnapshot).mockReturnValue({ status: "ready", snapshot });
  });

  it("a failed session announces the shared failure copy + invalidates (never a saved lie)", async () => {
    vi.mocked(setHighlightTags).mockRejectedValueOnce(new Error("idb down"));
    const { user, dialog } = await openTagsDialog();

    const input = (await within(dialog).findByPlaceholderText(
      "Add or search a tag…",
    )) as HTMLInputElement;
    await user.click(input);
    await user.type(input, "philosophy");
    await user.keyboard("{Enter}");
    // The in-dialog honest failure first (TagEntry's own StatusRegion).
    expect(await within(dialog).findByText("Couldn't save tag.")).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Done" }));

    // The PANEL announcement rides the ONE shared copy constant.
    await waitFor(() => expect(screen.getByText(TAGS_SAVE_FAILED_COPY)).toBeTruthy());
    expect(screen.queryByText("Tags saved.")).toBeNull();
    expect(invalidateLibrarySnapshot).toHaveBeenCalledTimes(1);
  });

  it("a saved session announces 'Tags saved.' + invalidates exactly once", async () => {
    const { user, dialog } = await openTagsDialog();

    // A real write: remove the seeded chip (the write-through seam lands []).
    await user.click(
      within(dialog).getByRole("button", { name: "Remove tag essays" }),
    );
    await waitFor(() => expect(setHighlightTags).toHaveBeenCalledWith("hl-1", []));

    await user.click(within(dialog).getByRole("button", { name: "Done" }));

    await waitFor(() => expect(screen.getByText("Tags saved.")).toBeTruthy());
    expect(screen.queryByText(TAGS_SAVE_FAILED_COPY)).toBeNull();
    expect(invalidateLibrarySnapshot).toHaveBeenCalledTimes(1);
  });

  it("an untouched session closes silently — no announcement, no invalidation", async () => {
    const { user, dialog } = await openTagsDialog();

    await user.click(within(dialog).getByRole("button", { name: "Done" }));

    // The report is synchronous for an untouched session (the pending-write
    // settlement is already resolved) — flush it, then assert the silence.
    // (jsdom has no UA display:none for a closed dialog, so the closed
    // dialog element itself is not an observable here.)
    await act(async () => {});
    expect(setHighlightTags).not.toHaveBeenCalled();
    expect(screen.queryByText("Tags saved.")).toBeNull();
    expect(screen.queryByText(TAGS_SAVE_FAILED_COPY)).toBeNull();
    expect(invalidateLibrarySnapshot).not.toHaveBeenCalled();
  });
});
