// tests/unit/annotations/note-draft-recovery.test.tsx
// Issue #178 — note-write recovery. The unit layer pins the CONTRACT the
// e2e suite proves in real browsers:
//
//   1. Every pending edit WRITE-THROUGHS a recovery draft to the
//      noteDrafts store immediately (no debounce) — recovery does not
//      depend on a browser unload event or the dual-event flush.
//   2. Clearing the textarea to whitespace stores a pending clear — the draft
//      always mirrors the reader's current intent (an interrupted clear
//      can never resurrect earlier writing).
//   3. A landed save CLEARS the draft; a failed save RETAINS it (Retry
//      keeps the net up); a late completion of an OLDER save never clears
//      a NEWER pending draft.
//   4. restoreNoteDraft hands the draft back to a fresh editor session
//      keyed to exactly the requested highlight — the editor applies it
//      via the normal updateNote path and marks the session "Recovered
//      draft" until the recovered text lands.
//   5. Stale drafts are retired, never surfaced: an already landed clear, equal
//      to the landed note (the interrupted save actually completed), or
//      older than a newer landed write (e.g. a cross-library review-panel
//      edit). A restore resolving after the editor closed applies nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import type { MutableRefObject } from "react";
import {
  HighlightOverlayProvider,
  useHighlightOverlay,
  type HighlightOverlayValue,
} from "../../../src/reader/annotations/HighlightOverlay";
import {
  NotePopover,
  NOTE_RECOVERED_DRAFT_COPY,
} from "../../../src/reader/annotations/NotePopover";
import { loadNote, saveNote, deleteNote } from "../../../src/persistence/notesStore";
import {
  saveNoteDraft,
  deleteNoteDraft,
  loadNoteDraft,
} from "../../../src/persistence/noteDraftsStore";
import type { CanonicalArticle } from "../../../src/content/types";
import type { Block } from "../../../src/content/types";

// ── Article fixtures ─────────────────────────────────────────────────────────

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

// ── Stubs ────────────────────────────────────────────────────────────────────

const mockData = vi.hoisted(() => ({
  highlightRecord: {
    schemaVersion: 1 as const,
    id: "hl-test-1",
    articleId: "test-article",
    revision: 1,
    position: { start: 0, end: 5 },
    quote: { prefix: "", exact: "Hello", suffix: " world." },
    createdAt: "2026-08-07T12:00:00Z",
  },
  /** A landed note (older than any recovery draft below). */
  landedNote: {
    schemaVersion: 1 as const,
    id: "note-test-1",
    highlightId: "hl-test-1",
    text: "the landed note",
    updatedAt: "2026-08-07T12:00:00Z",
  },
  /** A recovery draft (newer than the landed note). */
  draft: {
    schemaVersion: 1 as const,
    highlightId: "hl-test-1",
    text: "words recovered from the interrupted tab",
    updatedAt: "2026-08-08T09:00:00.000Z",
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
  loadNote: vi.fn().mockResolvedValue(null),
  saveNote: vi.fn().mockResolvedValue(undefined),
  deleteNote: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/persistence/noteDraftsStore", () => ({
  loadNoteDraft: vi.fn().mockResolvedValue(null),
  saveNoteDraft: vi.fn().mockResolvedValue(undefined),
  deleteNoteDraft: vi.fn().mockResolvedValue(undefined),
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

// Polyfill <dialog>.showModal()/close() for jsdom (the note-save-reliability
// suite's bridge; jsdom does not implement the modal dialog runtime).
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

// ── Harness ──────────────────────────────────────────────────────────────────

function NoteOpener({ highlightId }: { highlightId: string }) {
  const { setOpenPopoverFor } = useHighlightOverlay();
  useEffect(() => {
    setOpenPopoverFor(highlightId);
  }, [highlightId, setOpenPopoverFor]);
  return null;
}

function renderEditor(apiRef?: MutableRefObject<HighlightOverlayValue | null>) {
  return render(
    <HighlightOverlayProvider article={article} apiRef={apiRef}>
      <NoteOpener highlightId="hl-test-1" />
      <NotePopover />
    </HighlightOverlayProvider>,
  );
}

async function openTextarea(): Promise<HTMLTextAreaElement> {
  return (await screen.findByPlaceholderText("Add a note (optional)")) as HTMLTextAreaElement;
}

/** A one-shot controllable saveNote: holds the write open until released. */
function holdNextSave(): { release: () => void; reject: () => void } {
  let release!: () => void;
  let reject!: () => void;
  const promise = new Promise<void>((resolve, rejectPromise) => {
    release = resolve;
    reject = () => rejectPromise(new Error("quota"));
  });
  vi.mocked(saveNote).mockImplementationOnce(() => promise as never);
  return { release, reject };
}

const editorOpen = () => !!screen.queryByPlaceholderText("Add a note (optional)");

beforeEach(() => {
  vi.mocked(saveNote).mockClear().mockResolvedValue(undefined);
  vi.mocked(deleteNote).mockClear().mockResolvedValue(undefined);
  vi.mocked(loadNote).mockClear().mockResolvedValue(null);
  vi.mocked(loadNoteDraft).mockClear().mockResolvedValue(null);
  vi.mocked(saveNoteDraft).mockClear().mockResolvedValue(undefined);
  vi.mocked(deleteNoteDraft).mockClear().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("recovery draft write-through (issue #178)", () => {
  it("every pending edit write-throughs a draft immediately — before the debounce fires", async () => {
    const user = userEvent.setup();
    renderEditor();
    const textarea = await openTextarea();
    await user.type(textarea, "pending words");

    expect(saveNoteDraft).toHaveBeenCalled();
    const last = vi.mocked(saveNoteDraft).mock.lastCall?.[0];
    expect(last).toMatchObject({
      schemaVersion: 1,
      highlightId: "hl-test-1",
      text: "pending words",
    });
    expect(typeof last?.updatedAt).toBe("string");
    // The debounced note save has NOT fired yet — the draft is the only
    // persisted trace of the edit (recovery without any unload event).
    expect(saveNote).not.toHaveBeenCalled();
  });

  it("clearing the textarea preserves a pending-clear recovery draft", async () => {
    const user = userEvent.setup();
    renderEditor();
    const textarea = await openTextarea();
    await user.type(textarea, "draft to clear");
    await user.clear(textarea);

    expect(deleteNoteDraft).not.toHaveBeenCalled();
    expect(vi.mocked(saveNoteDraft).mock.lastCall?.[0]?.text).toBe("");
    // The landed note save must not have raced the interruption window.
    expect(saveNote).not.toHaveBeenCalled();
  });

  it("a landed save clears the draft; a failed save retains it for Retry", async () => {
    const apiRef: MutableRefObject<HighlightOverlayValue | null> = { current: null };
    renderEditor(apiRef);
    const textarea = await openTextarea();
    fireEvent.change(textarea, { target: { value: "doomed to fail first" } });
    await act(async () => {
      vi.mocked(saveNote).mockRejectedValueOnce(new Error("quota"));
      apiRef.current!.flushNoteSave();
    });
    // Failure: the draft is retained (Retry keeps the net up).
    expect(deleteNoteDraft).not.toHaveBeenCalled();

    // Retry lands the write; the identity-gated cleanup retires the draft.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });
    await waitFor(() => expect(saveNote).toHaveBeenCalledTimes(2));
    expect(deleteNoteDraft).toHaveBeenCalledTimes(1);
    expect(deleteNoteDraft).toHaveBeenCalledWith("hl-test-1", undefined);
  });

  it("a late completion of an older save never clears a newer pending draft", async () => {
    const apiRef: MutableRefObject<HighlightOverlayValue | null> = { current: null };
    const older = holdNextSave();
    renderEditor(apiRef);
    const textarea = await openTextarea();
    fireEvent.change(textarea, { target: { value: "older" } });
    await act(async () => {
      apiRef.current!.flushNoteSave();
    });
    fireEvent.change(textarea, { target: { value: "latest" } });
    // The write-through kept pace: the draft row carries the NEWER text.
    expect(vi.mocked(saveNoteDraft).mock.lastCall?.[0]?.text).toBe("latest");

    // The OLDER write completes successfully — it must NOT clear the newer
    // pending draft (the gate is the same latest-draft identity as the
    // register's announce).
    await act(async () => {
      older.release();
    });
    await waitFor(() => expect(saveNote).toHaveBeenCalledTimes(1));
    expect(deleteNoteDraft).not.toHaveBeenCalled();

    // The newer draft lands; its OWN success clears the draft exactly once.
    const latest = holdNextSave();
    await act(async () => {
      apiRef.current!.flushNoteSave();
    });
    await act(async () => {
      latest.release();
    });
    await waitFor(() => expect(saveNote).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(deleteNoteDraft).toHaveBeenCalledTimes(1));
    expect(deleteNoteDraft).toHaveBeenCalledWith("hl-test-1", undefined);
  });
});

it("queued saves preserve edit order so an older queued write cannot retire a newer draft", async () => {
  const apiRef: MutableRefObject<HighlightOverlayValue | null> = { current: null };
  const older = holdNextSave();
  renderEditor(apiRef);
  const textarea = await openTextarea();
  fireEvent.change(textarea, { target: { value: "A" } });
  await act(async () => {
    apiRef.current!.flushNoteSave();
  });
  fireEvent.change(textarea, { target: { value: "B" } });
  await act(async () => {
    apiRef.current!.flushNoteSave();
  });
  fireEvent.change(textarea, { target: { value: "C" } });
  const newest = vi.mocked(saveNoteDraft).mock.lastCall![0];
  await act(async () => {
    older.release();
  });
  const queued = vi.mocked(saveNote).mock.lastCall![0];
  expect(queued.text).toBe("B");
  expect(Date.parse(queued.updatedAt)).toBeLessThan(Date.parse(newest.updatedAt));
  vi.mocked(loadNote).mockResolvedValue(queued);
  vi.mocked(loadNoteDraft).mockResolvedValue(newest);
  await expect(apiRef.current!.restoreNoteDraft("hl-test-1")).resolves.toEqual({
    id: "hl-test-1",
    text: "C",
  });
  expect(deleteNoteDraft).not.toHaveBeenCalled();
});

describe("restoreNoteDraft (issue #178)", () => {
  it("applies the draft via updateNote and marks the session 'Recovered draft' until it lands", async () => {
    vi.mocked(loadNoteDraft).mockResolvedValue(mockData.draft);
    renderEditor();

    const textarea = await openTextarea();
    // The restored text rides the normal pending-edit path.
    await waitFor(() => expect(textarea).toHaveValue(mockData.draft.text));
    expect(screen.getAllByText(NOTE_RECOVERED_DRAFT_COPY)[0]).toBeTruthy();
    expect(
      screen
        .getAllByRole("status")
        .filter((region) => region.textContent?.includes(NOTE_RECOVERED_DRAFT_COPY)),
    ).toHaveLength(1);
    expect(
      screen
        .getAllByRole("status")
        .some((region) => region.textContent?.includes(NOTE_RECOVERED_DRAFT_COPY)),
    ).toBe(true);

    // Done lands the recovered text; the marker clears (no longer
    // unlanded recovery) and the editor closes.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
    });
    await waitFor(() => expect(editorOpen()).toBe(false));
    expect(vi.mocked(saveNote).mock.lastCall?.[0]?.text).toBe(mockData.draft.text);
    expect(vi.mocked(saveNote).mock.lastCall?.[0]?.highlightId).toBe("hl-test-1");
    expect(screen.queryByText(NOTE_RECOVERED_DRAFT_COPY)).toBeNull();
  });

  it("a draft equal to the landed note is stale (the interrupted save completed) — retired, never shown", async () => {
    vi.mocked(loadNote).mockResolvedValue(mockData.landedNote);
    vi.mocked(loadNoteDraft).mockResolvedValue({
      ...mockData.draft,
      text: mockData.landedNote.text,
    });
    renderEditor();

    const textarea = await openTextarea();
    await waitFor(() => expect(textarea).toHaveValue(mockData.landedNote.text));
    expect(screen.queryByText(NOTE_RECOVERED_DRAFT_COPY)).toBeNull();
    await waitFor(() =>
      expect(deleteNoteDraft).toHaveBeenCalledWith(
        "hl-test-1",
        expect.objectContaining({ updatedAt: mockData.draft.updatedAt }),
      ),
    );
  });

  it("a draft older than a newer landed write is retired — recovery never resurrects older writing", async () => {
    vi.mocked(loadNote).mockResolvedValue({
      ...mockData.landedNote,
      text: "newer words from the review panel",
      updatedAt: "2026-08-09T12:00:00.000Z", // newer than the draft
    });
    vi.mocked(loadNoteDraft).mockResolvedValue(mockData.draft);
    renderEditor();

    const textarea = await openTextarea();
    await waitFor(() => expect(textarea).toHaveValue("newer words from the review panel"));
    expect(screen.queryByText(NOTE_RECOVERED_DRAFT_COPY)).toBeNull();
    await waitFor(() =>
      expect(deleteNoteDraft).toHaveBeenCalledWith(
        "hl-test-1",
        expect.objectContaining({ updatedAt: mockData.draft.updatedAt }),
      ),
    );
    // The retired draft was never re-saved as a pending note edit.
    expect(saveNote).not.toHaveBeenCalled();
  });

  it("a pending clear restores against an existing note and survives a failed deletion", async () => {
    vi.mocked(loadNote).mockResolvedValue(mockData.landedNote);
    vi.mocked(deleteNote).mockRejectedValue(new Error("quota"));
    vi.mocked(loadNoteDraft).mockResolvedValue({ ...mockData.draft, text: "   " });
    renderEditor();

    const textarea = await openTextarea();
    await waitFor(() => expect(textarea).toHaveValue(""));
    expect(screen.getAllByText(NOTE_RECOVERED_DRAFT_COPY)).toHaveLength(2);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
    });
    expect(deleteNote).toHaveBeenCalled();
    expect(deleteNoteDraft).not.toHaveBeenCalled();
    expect(editorOpen()).toBe(true);
  });

  it("restores are keyed to the requested highlight only — never another highlight's draft", async () => {
    renderEditor();

    const textarea = await openTextarea();
    // Exactly the session's own id was queried — a draft can only ever be
    // loaded, applied, or deleted by ITS OWN highlight id (the foreign
    // highlight is invisible to this session).
    await waitFor(() => expect(vi.mocked(loadNoteDraft)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(loadNoteDraft)).toHaveBeenCalledWith("hl-test-1");
    await waitFor(() => expect(textarea).toHaveValue(""));
    expect(screen.queryByText(NOTE_RECOVERED_DRAFT_COPY)).toBeNull();
  });

  it("a row keyed to another highlight is retired, never attached to this session", async () => {
    // Defence in depth (unreachable via the keyed read): a mismatched row
    // resolves to nothing for this session and is retired.
    vi.mocked(loadNoteDraft).mockResolvedValue({
      ...mockData.draft,
      highlightId: "hl-other",
    });
    renderEditor();

    const textarea = await openTextarea();
    await waitFor(() => expect(textarea).toHaveValue(""));
    expect(screen.queryByText(NOTE_RECOVERED_DRAFT_COPY)).toBeNull();
    await waitFor(() =>
      expect(deleteNoteDraft).toHaveBeenCalledWith(
        "hl-test-1",
        expect.objectContaining({ updatedAt: mockData.draft.updatedAt }),
      ),
    );
  });

  it("a restore resolving after the editor closed applies nothing (no re-attach)", async () => {
    let releaseDraft!: (value: typeof mockData.draft | null) => void;
    vi.mocked(loadNoteDraft).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseDraft = resolve;
        }) as never,
    );
    const { unmount } = renderEditor();
    const textarea = await openTextarea();
    expect(textarea).toHaveValue("");

    // The reader dismisses (nothing pending — the empty editor closes).
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
    });
    await waitFor(() => expect(editorOpen()).toBe(false));

    // The draft load resolves after the close — the cancelled flag keeps
    // the late resolution from re-opening or writing anything.
    await act(async () => {
      releaseDraft(mockData.draft);
    });
    expect(saveNote).not.toHaveBeenCalled();
    expect(editorOpen()).toBe(false);
    unmount();
  });

  it("a keystroke during the restore's await is newer writing — the older draft never displaces it", async () => {
    let releaseDraft!: (value: typeof mockData.draft | null) => void;
    vi.mocked(loadNoteDraft).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseDraft = resolve;
        }) as never,
    );
    const user = userEvent.setup();
    renderEditor();
    const textarea = await openTextarea();

    // The reader starts typing while the draft load is still pending — the
    // write-through already refreshed the draft row with their words.
    await user.type(textarea, "fresh words");

    await act(async () => {
      releaseDraft(mockData.draft);
    });
    // The older resolution is skipped: the reader's words stay on screen,
    // no recovered marker flashes over them.
    await waitFor(() => expect(textarea).toHaveValue("fresh words"));
    expect(screen.queryByText(NOTE_RECOVERED_DRAFT_COPY)).toBeNull();
    expect(deleteNoteDraft).not.toHaveBeenCalled();
  });
});
