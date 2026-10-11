// tests/unit/annotations/delete-highlight-rollback.test.tsx
// Issue #174 — the deleteHighlight failure contract in useAnnotationState:
// a rejected store write must NOT silently lose content. The optimistic
// in-memory removal ROLLS BACK (the mark + drawer entry would re-match the
// persisted row), the error is classified + routed to onStorageError, AND
// the error RETHROWS so a modal host (NotePopover) can keep itself open with
// its inline failure line.
//
// Harness: the real provider + hook over mocked persistence seams, exposed
// through the provider's apiRef parent bridge (the HighlightOverlay.tsx
// "PARENT ACCESS" seam — the same escape hatch ArticleView uses).
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import {
  HighlightOverlayProvider,
  type HighlightOverlayValue,
} from "../../../src/reader/annotations/HighlightOverlay";
import { deleteHighlight as deleteHighlightFromStore } from "../../../src/persistence/highlightsStore";
import type { CanonicalArticle } from "../../../src/content/types";
import type { Block } from "../../../src/content/types";

const article: CanonicalArticle = {
  id: "test-article",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/test",
    title: "Test Article",
    retrievedAt: "2026-07-28T00:00:00Z",
    originalHtmlHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  blocks: [
    {
      kind: "paragraph",
      content: [{ text: "Hello world.", marks: [] }],
    } as Block,
  ],
  footnotes: [],
};

const mockData = vi.hoisted(() => ({
  highlightRecord: {
    schemaVersion: 1 as const,
    id: "hl-rollback-1",
    articleId: "test-article",
    revision: 1,
    position: { start: 0, end: 5 },
    quote: { prefix: "", exact: "Hello", suffix: " world." },
    createdAt: "2026-08-07T12:00:00Z",
    tags: [],
    color: "default",
  },
  noteRecord: {
    schemaVersion: 1 as const,
    id: "note-rollback-1",
    highlightId: "hl-rollback-1",
    text: "Keep me even when the delete fails.",
    updatedAt: "2026-08-07T12:00:00Z",
  },
}));

vi.mock("../../../src/persistence/highlightsStore", () => ({
  loadHighlights: vi.fn().mockResolvedValue({
    ok: true,
    highlights: [mockData.highlightRecord],
  }),
  saveHighlight: vi.fn().mockResolvedValue(undefined),
  deleteHighlight: vi.fn().mockResolvedValue(undefined),
  setHighlightColor: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/persistence/notesStore", () => ({
  loadNote: vi.fn().mockResolvedValue(mockData.noteRecord),
  saveNote: vi.fn().mockResolvedValue(undefined),
  deleteNote: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/content/normalizeText", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/content/normalizeText")>();
  return {
    ...actual,
    resolveQuoteSelector: vi.fn().mockReturnValue({ start: 0, end: 5 }),
  };
});

vi.mock("../../../src/annotations/capture", () => ({
  captureSelection: vi.fn().mockReturnValue({ ok: false, reason: "empty" }),
}));

vi.mock("../../../src/annotations/overlap", () => ({
  rangesOverlap: vi.fn().mockReturnValue(false),
}));

describe("useAnnotationState.deleteHighlight — failure rollback (issue #174)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rolls the optimistic removal back and RETHROWS when the write fails", async () => {
    vi.mocked(deleteHighlightFromStore).mockRejectedValueOnce(new Error("quota"));
    const onStorageError = vi.fn();
    const apiRef = { current: null } as React.MutableRefObject<HighlightOverlayValue | null>;
    render(
      <HighlightOverlayProvider article={article} apiRef={apiRef} onStorageError={onStorageError}>
        <span />
      </HighlightOverlayProvider>,
    );

    // Wait for the eager load to settle: one resolved highlight + its note.
    await waitFor(() => expect(apiRef.current?.highlights).toHaveLength(1));

    // The failed delete rejects to the caller (the modal host's signal to
    // keep itself open)…
    await expect(apiRef.current!.deleteHighlight("hl-rollback-1")).rejects.toThrow("quota");

    // …the optimistic removal ROLLED BACK: the highlight (and its attached
    // note) remain in in-memory state — nothing silently disappeared.
    await waitFor(() => {
      const restored = apiRef.current?.highlights.find((h) => h.record.id === "hl-rollback-1");
      expect(restored).toBeDefined();
      expect(restored?.note?.text).toBe("Keep me even when the delete fails.");
    });

    // STATE-05 routing still fired (the StorageBanner gets the failure too).
    expect(onStorageError).toHaveBeenCalledTimes(1);
  });

  it("deletes cleanly on success (no rollback, no rethrow)", async () => {
    const apiRef = { current: null } as React.MutableRefObject<HighlightOverlayValue | null>;
    render(
      <HighlightOverlayProvider article={article} apiRef={apiRef}>
        <span />
      </HighlightOverlayProvider>,
    );
    await waitFor(() => expect(apiRef.current?.highlights).toHaveLength(1));

    await expect(apiRef.current!.deleteHighlight("hl-rollback-1")).resolves.toBeUndefined();
    await waitFor(() => expect(apiRef.current?.highlights).toHaveLength(0));
  });
});
