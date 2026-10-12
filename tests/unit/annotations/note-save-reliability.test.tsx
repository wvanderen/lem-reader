// tests/unit/annotations/note-save-reliability.test.tsx
// Issue #177 — saving notes safely on dismissal and navigation. The unit
// layer pins the CONTRACT the e2e suite proves in real browsers:
//
//   1. Every dismissal path (Done, Escape, outside click, Cmd/Ctrl+Enter)
//      routes through the ONE guarded seam: the awaited flush must LAND
//      before the editor closes.
//   2. A failed save keeps the editor + draft available with the calm
//      failure line + Retry — never a close that implies a save that did
//      not land. A failed ESCAPE keeps the editor open (the `cancel` event
//      is prevented; the browser-default close cannot outrun the write).
//   3. Retry re-attempts THE SAME highlight's draft (the ensureNoteSaved
//      cross-highlight guard) and completes an interrupted dismissal;
//      a mid-typing failure's retry keeps the editor open.
//   4. Empty OR whitespace-only commentary = no note (the shared
//      hasNoteContent semantics — deleteNote, never saveNote).
//   5. Rapid or repeated actions are single-shot (the working latch);
//      a dismissal during an in-flight write AWAITS it.
//   6. An article swap / unmount FLUSHES the pending draft instead of
//      dropping it (the in-app navigation seam).
//
// Real-browser modal behavior (native Escape→cancel dispatch, backdrop
// click targets, focus restoration into the reading surface) is the
// Playwright suite's (note-save-reliability.spec.ts); jsdom provides the
// DOM structure with the showModal/close polyfill.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import {
  HighlightOverlayProvider,
  useHighlightOverlay,
  type HighlightOverlayValue,
} from "../../../src/reader/annotations/HighlightOverlay";
import { NotePopover, NOTE_SAVE_FAILED_COPY } from "../../../src/reader/annotations/NotePopover";
import { saveNote, deleteNote } from "../../../src/persistence/notesStore";
import type { CanonicalArticle } from "../../../src/content/types";
import type { Block } from "../../../src/content/types";
import type { MutableRefObject } from "react";

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

const otherArticle: CanonicalArticle = { ...article, id: "other-article" };

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
  noteRecord: {
    schemaVersion: 1 as const,
    id: "note-test-1",
    highlightId: "hl-test-1",
    text: "Important passage",
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
  loadNote: vi.fn().mockResolvedValue(null),
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

// Polyfill <dialog>.showModal()/close() for jsdom (the note-popover-confirm
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
function holdNextSave(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((r) => {
    release = r;
  });
  vi.mocked(saveNote).mockImplementationOnce(() => promise as never);
  return { promise, release };
}

const editorOpen = () => !!screen.queryByPlaceholderText("Add a note (optional)");

beforeEach(() => {
  vi.mocked(saveNote).mockClear().mockResolvedValue(undefined);
  vi.mocked(deleteNote).mockClear().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("NotePopover — guarded dismissal (issue #177)", () => {
  it("Done flushes the pending draft and closes only after the write lands", async () => {
    const user = userEvent.setup();
    renderEditor();
    const textarea = await openTextarea();
    await user.type(textarea, "Saved on Done");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
    });

    await waitFor(() => expect(saveNote).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(saveNote).mock.calls[0]?.[0];
    expect(saved?.text).toBe("Saved on Done");
    expect(saved?.highlightId).toBe("hl-test-1");
    await waitFor(() => expect(editorOpen()).toBe(false));
  });

  it("a failed Done keeps the editor + draft with the failure line + Retry", async () => {
    const user = userEvent.setup();
    vi.mocked(saveNote).mockRejectedValueOnce(new Error("quota"));
    renderEditor();
    const textarea = await openTextarea();
    await user.type(textarea, "a draft that must survive");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
    });

    // Honest failure: the editor stays open, the draft is intact, the calm
    // line + Retry render. Never a close that implies a landed save.
    expect(await screen.findByText(NOTE_SAVE_FAILED_COPY)).toBeTruthy();
    expect(editorOpen()).toBe(true);
    expect(
      (screen.getByPlaceholderText("Add a note (optional)") as HTMLTextAreaElement).value,
    ).toBe("a draft that must survive");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("Escape with a failed save keeps the editor open (the cancel event is intercepted)", async () => {
    const user = userEvent.setup();
    vi.mocked(saveNote).mockRejectedValueOnce(new Error("quota"));
    renderEditor();
    const textarea = await openTextarea();
    await user.type(textarea, "escape keeps me");

    // jsdom does not synthesize Escape→cancel for <dialog>; dispatch the
    // native event the browser fires before its default close.
    const dlg = document.querySelector("dialog#highlight-popover") as HTMLDialogElement;
    await act(async () => {
      fireEvent(dlg, new Event("cancel", { bubbles: false, cancelable: true }));
    });

    expect(await screen.findByText(NOTE_SAVE_FAILED_COPY)).toBeTruthy();
    expect(editorOpen()).toBe(true);

    // The interrupted dismissal completes when the Retry lands.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });
    await waitFor(() => expect(editorOpen()).toBe(false));
    expect(saveNote).toHaveBeenCalledTimes(2);
    expect(vi.mocked(saveNote).mock.calls[1]?.[0]?.text).toBe("escape keeps me");
  });

  it("outside click (backdrop coordinates) saves and dismisses; a card click does not", async () => {
    const user = userEvent.setup();
    renderEditor();
    const textarea = await openTextarea();
    await user.type(textarea, "backdrop dismissal");

    const dlg = document.querySelector("dialog#highlight-popover") as HTMLDialogElement;
    // jsdom rects are all-zero: coordinates strictly inside [0,0]×[0,0] are
    // the card (no dismissal); negative coordinates are the backdrop.
    await act(async () => {
      fireEvent.click(dlg, { clientX: 0, clientY: 0 });
    });
    expect(saveNote).not.toHaveBeenCalled();
    expect(editorOpen()).toBe(true);

    await act(async () => {
      fireEvent.click(dlg, { clientX: -40, clientY: -40 });
    });
    await waitFor(() => expect(saveNote).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveNote).mock.calls[0]?.[0]?.text).toBe("backdrop dismissal");
    await waitFor(() => expect(editorOpen()).toBe(false));
  });

  it("a mid-typing failure surfaces the error + Retry; a successful Retry keeps the editor open", async () => {
    const apiRef: MutableRefObject<HighlightOverlayValue | null> = { current: null };
    const user = userEvent.setup();
    vi.mocked(saveNote).mockRejectedValueOnce(new Error("quota"));
    renderEditor(apiRef);
    const textarea = await openTextarea();
    await user.type(textarea, "still writing");

    // The debounce-owning flush fails (the dual-event / timer path).
    await act(async () => {
      apiRef.current?.flushNoteSave();
    });
    expect(await screen.findByText(NOTE_SAVE_FAILED_COPY)).toBeTruthy();
    expect(editorOpen()).toBe(true);

    // Retry saves the SAME draft — and, with no interrupted dismissal,
    // leaves the reader in the editor (they are still writing): the error
    // line clears and the quiet visual "Saved." line shows (the saved half
    // of the state pair; the SR register stays the article announcement).
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });
    await waitFor(() => expect(saveNote).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(NOTE_SAVE_FAILED_COPY)).toBeNull();
    expect(screen.getByText("Saved.")).toBeTruthy();
    expect(editorOpen()).toBe(true);
  });

  it("Retry after a failed Done completes the dismissal exactly once", async () => {
    const user = userEvent.setup();
    vi.mocked(saveNote).mockRejectedValueOnce(new Error("quota")).mockResolvedValueOnce(undefined);
    renderEditor();
    const textarea = await openTextarea();
    await user.type(textarea, "retry completes");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
    });
    await screen.findByText(NOTE_SAVE_FAILED_COPY);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });
    await waitFor(() => expect(editorOpen()).toBe(false));
    // Exactly two writes (the failure + the retry), same draft, same highlight.
    expect(saveNote).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(saveNote).mock.calls) {
      expect(call[0]?.highlightId).toBe("hl-test-1");
      expect(call[0]?.text).toBe("retry completes");
    }
  });
});

describe("NotePopover — rapid or repeated actions (issue #177)", () => {
  it("a double-Done is one write and one close (the working latch)", async () => {
    const user = userEvent.setup();
    renderEditor();
    const textarea = await openTextarea();
    await user.type(textarea, "single shot");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
    });

    await waitFor(() => expect(saveNote).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(editorOpen()).toBe(false));
  });

  it("Done during an in-flight write awaits it instead of racing a second write", async () => {
    const apiRef: MutableRefObject<HighlightOverlayValue | null> = { current: null };
    const user = userEvent.setup();
    const held = holdNextSave();
    renderEditor(apiRef);
    const textarea = await openTextarea();
    await user.type(textarea, "awaited in flight");

    // Start the write (the debounce-fire path), then dismiss mid-write.
    await act(async () => {
      apiRef.current?.flushNoteSave();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
    });
    // The editor holds until the write settles.
    expect(editorOpen()).toBe(true);
    await act(async () => {
      held.release();
      await held.promise;
    });
    await waitFor(() => expect(editorOpen()).toBe(false));
    expect(saveNote).toHaveBeenCalledTimes(1);
  });

  it("the Done button carries the unified busy register while the awaited write runs", async () => {
    const user = userEvent.setup();
    const held = holdNextSave();
    renderEditor();
    const textarea = await openTextarea();
    await user.type(textarea, "busy register");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
    });
    const done = screen.getByRole("button", { name: "Done" }) as HTMLButtonElement;
    expect(done.disabled).toBe(true);
    expect(done.getAttribute("aria-busy")).toBe("true");

    await act(async () => {
      held.release();
      await held.promise;
    });
    await waitFor(() => expect(editorOpen()).toBe(false));
  });
});

describe("NotePopover — the ensureNoteSaved cross-highlight guard (issue #177)", () => {
  it("never writes a draft keyed to a different highlight than the requested id", async () => {
    const apiRef: MutableRefObject<HighlightOverlayValue | null> = { current: null };
    const user = userEvent.setup();
    renderEditor(apiRef);
    const textarea = await openTextarea();
    await user.type(textarea, "owned by hl-test-1");

    // A flush addressed at ANOTHER highlight resolves true (this call has
    // nothing unresolved) WITHOUT touching the draft — a retry can never
    // save a draft to a different highlight.
    await act(async () => {
      const foreign = await apiRef.current!.ensureNoteSaved("hl-other");
      expect(foreign).toBe(true);
    });
    expect(saveNote).not.toHaveBeenCalled();
    expect(editorOpen()).toBe(true);

    // The session's own id flushes the draft.
    await act(async () => {
      const own = await apiRef.current!.ensureNoteSaved("hl-test-1");
      expect(own).toBe(true);
    });
    expect(saveNote).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveNote).mock.calls[0]?.[0]?.highlightId).toBe("hl-test-1");
  });
});

describe("NotePopover — shared note semantics (issue #177)", () => {
  it("whitespace-only commentary is no note: the draft collapses and the flush deletes", async () => {
    const user = userEvent.setup();
    renderEditor();
    const textarea = await openTextarea();
    await user.type(textarea, "   ");

    // The optimistic draft collapses to null (no written content), so the
    // controlled textarea reads empty.
    expect(textarea.value).toBe("");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
    });
    await waitFor(() => expect(deleteNote).toHaveBeenCalledTimes(1));
    expect(deleteNote).toHaveBeenCalledWith("hl-test-1");
    expect(saveNote).not.toHaveBeenCalled();
    await waitFor(() => expect(editorOpen()).toBe(false));
  });
});

describe("NotePopover — in-app navigation flush (issue #177)", () => {
  it("an article swap flushes the pending draft instead of dropping it", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <HighlightOverlayProvider article={article}>
        <NoteOpener highlightId="hl-test-1" />
        <NotePopover />
      </HighlightOverlayProvider>,
    );
    const textarea = await openTextarea();
    await user.type(textarea, "survives the swap");

    // Chapter navigation swaps the article prop through the same mounted
    // provider — the [article] cleanup must flush, not cancel.
    rerender(
      <HighlightOverlayProvider article={otherArticle}>
        <NoteOpener highlightId="hl-test-1" />
        <NotePopover />
      </HighlightOverlayProvider>,
    );

    await waitFor(() => expect(saveNote).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveNote).mock.calls[0]?.[0]?.text).toBe("survives the swap");
    expect(vi.mocked(saveNote).mock.calls[0]?.[0]?.highlightId).toBe("hl-test-1");
  });
});
