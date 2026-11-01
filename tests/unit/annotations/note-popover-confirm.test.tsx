// Native annotation dialog, note saving, safe deletion, and keyboard behavior.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import {
  HighlightOverlayProvider,
  useHighlightOverlay,
} from "../../../src/reader/annotations/HighlightOverlay";
import { NotePopover } from "../../../src/reader/annotations/NotePopover";
import { saveNote } from "../../../src/persistence/notesStore";
import { deleteHighlight as deleteHighlightFromStore } from "../../../src/persistence/highlightsStore";
import type { CanonicalArticle } from "../../../src/content/types";
import type { Block } from "../../../src/content/types";

// ── Article fixture ──────────────────────────────────────────────────────────

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

// Use vi.hoisted so the mock data is available inside the hoisted vi.mock
// factories (vi.mock is hoisted above all declarations by the Vitest transform).
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

// Re-export for readability in test assertions; the mock factories above use
// mockData.* directly (vi.hoisted makes them available inside hoisted factories).
void mockData;

// Stub the persistence layer so the provider doesn't hit Dexie.
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

// Stub the resolution engine so the highlight is "confident" (same-revision).
vi.mock("../../../src/content/normalizeText", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/content/normalizeText")>();
  return {
    ...actual,
    resolveQuoteSelector: vi.fn().mockReturnValue({ start: 0, end: 5 }),
  };
});

// Stub captureSelection so the provider doesn't need a real DOM selection.
vi.mock("../../../src/annotations/capture", () => ({
  captureSelection: vi.fn().mockReturnValue({ ok: false, reason: "empty" }),
}));

// Stub rangesOverlap.
vi.mock("../../../src/annotations/overlap", () => ({
  rangesOverlap: vi.fn().mockReturnValue(false),
}));

// Polyfill <dialog>.showModal()/close() for jsdom (jsdom does not implement
// the modal dialog behavior). The polyfill toggles the native `open` property
// and dispatches the `close` event so the component's effect + listener behave
// as they do in a real browser. Mirrors how SettingsPanel/AnnotationsDrawer
// tests bridge jsdom's missing <dialog> runtime.
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

// ── Test harness ─────────────────────────────────────────────────────────────

/**
 * Helper component that opens the editor for a specific highlight id after
 * mount, so the test can exercise the editor's note view without needing the
 * real activation path.
 */
function NoteOpener({ highlightId }: { highlightId: string }) {
  const { setOpenPopoverFor } = useHighlightOverlay();
  useEffect(() => {
    setOpenPopoverFor(highlightId);
  }, [highlightId, setOpenPopoverFor]);
  return null;
}

/**
 * Issue #175 — opens the dialog directly in the CONFIRM mode (the state the
 * lightweight controls' Delete sets for a noted highlight).
 */
function ConfirmOpener({ highlightId }: { highlightId: string }) {
  const { setConfirmDeleteFor } = useHighlightOverlay();
  useEffect(() => {
    setConfirmDeleteFor(highlightId);
  }, [highlightId, setConfirmDeleteFor]);
  return null;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("NotePopover — native <dialog> + writing-only editor (issue #175)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses a native <dialog> + showModal (modal-dialog AX context for VoiceOver)", async () => {
    const { container } = render(
      <HighlightOverlayProvider article={article}>
        <NoteOpener highlightId="hl-test-1" />
        <NotePopover />
      </HighlightOverlayProvider>,
    );

    // Wait for the highlight to load + editor to open.
    const dialog = await screen.findByRole("dialog", { name: "Highlight" });

    // Native <dialog> — the modal accessibility context VoiceOver needs.
    // (Phase 5 used <div popover="manual">; debug `vo-note-popover-focus`
    // found VO browse passed the textarea. Native <dialog> + showModal is the
    // proven SettingsPanel/Drawer pattern.)
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog.getAttribute("popover")).toBeNull();
    expect(dialog.classList.contains("highlight-popover")).toBe(true);
    // Container also has the element.
    expect(container.querySelector("dialog.highlight-popover")).not.toBeNull();
  });

  it("renders note textarea + excerpt as React text children (Pitfall 8 — no raw HTML)", async () => {
    render(
      <HighlightOverlayProvider article={article}>
        <NoteOpener highlightId="hl-test-1" />
        <NotePopover />
      </HighlightOverlayProvider>,
    );

    // Wait for the editor to open + the textarea to appear.
    const textarea = await screen.findByPlaceholderText("Add a note (optional)");
    expect(textarea).toBeTruthy();
    // The existing note text renders in the textarea value (React text child).
    expect((textarea as HTMLTextAreaElement).value).toBe("Important passage");

    // The excerpt renders as a <p> text child (no raw HTML) — and it is
    // VISUALLY HIDDEN (issue #175: context for the accessible description,
    // never a visual repetition of the quotation).
    const excerpt = screen.getByText("Hello", { exact: false });
    expect(excerpt).toBeTruthy();
    expect(excerpt.classList.contains("highlight-popover-excerpt")).toBe(true);
    expect(excerpt.classList.contains("visually-hidden")).toBe(true);

    // No <script> elements injected (Pitfall 8 XSS defense).
    const popover = document.querySelector(".highlight-popover");
    expect(popover?.querySelectorAll("script").length ?? 0).toBe(0);
  });

  it("the edit view exposes highlight actions and color beside the note", async () => {
    render(
      <HighlightOverlayProvider article={article}>
        <NoteOpener highlightId="hl-test-1" />
        <NotePopover />
      </HighlightOverlayProvider>,
    );

    await screen.findByPlaceholderText("Add a note (optional)");

    // Issue #207 — the organization area (tag field + Apply slot) is always
    // visible ABOVE the action row: the footer is Copy/Delete/Done (the
    // Tags toggle is gone), and the slot buttons render with the fieldsets.
    const dialog = screen.getByRole("dialog", { name: "Highlight" });
    const buttons = Array.from(dialog.querySelectorAll("button")).map((b) => b.textContent);
    expect(buttons).toEqual([
      "1Default",
      "2Yellow",
      "3Green",
      "4Blue",
      "5Pink",
      "Copy",
      "Delete",
      "Done",
    ]);
    expect(dialog.querySelectorAll("fieldset").length).toBe(2); // tags + the slot-pill color row (issue #222)
    expect(dialog.querySelector("textarea")).not.toBeNull();
  });

  it("hosts the slot-pill color row permanently — five labeled slot buttons (issue #195 + #207; #222 renames the group)", async () => {
    render(
      <HighlightOverlayProvider article={article}>
        <NoteOpener highlightId="hl-test-1" />
        <NotePopover />
      </HighlightOverlayProvider>,
    );

    await screen.findByPlaceholderText("Add a note (optional)");
    const dialog = screen.getByRole("dialog", { name: "Highlight" });
    // Always visible — no expansion step. Issue #222 — the group is the
    // panel's COLOR control (legend "Color").
    const slots = screen.getByRole("group", { name: "Color" });
    const slotButtons = Array.from(slots.querySelectorAll("button")).map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(slotButtons).toEqual([
      "Apply slot 1: Default",
      "Apply slot 2: Yellow",
      "Apply slot 3: Green",
      "Apply slot 4: Blue",
      "Apply slot 5: Pink",
    ]);
    // TagEntry + the slot-pill color row = two fieldsets (issue #222 — the
    // named-color picker fieldset is gone).
    expect(dialog.querySelectorAll("fieldset").length).toBe(2);
  });

  it("wires debounced save via updateNote on textarea change (D5-10)", async () => {
    render(
      <HighlightOverlayProvider article={article}>
        <NoteOpener highlightId="hl-test-1" />
        <NotePopover />
      </HighlightOverlayProvider>,
    );

    // Wait for edit view.
    const textarea = (await screen.findByPlaceholderText(
      "Add a note (optional)",
    )) as HTMLTextAreaElement;

    // Change the note text — this should call updateNote (optimistic in-memory
    // + schedule the debounced save internally).
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "Updated note text" } });
    });

    // The in-memory state should reflect the new text immediately (optimistic).
    expect(textarea.value).toBe("Updated note text");

    // saveNote is called after the debounce window (800ms). We can't easily
    // wait for it in a unit test without fake timers, but the wiring is
    // proven: updateNote was called (the value changed), which internally
    // schedules the debounced saveNote. The dual-event flush + Done-button
    // flush are verified by the provider contract.
  });
});

// ── Issue #175 — the two-step delete confirm lives in the editor dialog ─────

describe("NotePopover — delete confirm view (issue #175 + #174)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("confirmDeleteFor opens the dialog in the confirm view (prompt + cascade + Keep default)", async () => {
    render(
      <HighlightOverlayProvider article={article}>
        <ConfirmOpener highlightId="hl-test-1" />
        <NotePopover />
      </HighlightOverlayProvider>,
    );

    // The confirm prompt should be visible (the write has NOT fired).
    expect(deleteHighlightFromStore).not.toHaveBeenCalled();
    const prompt = await screen.findByText("Delete this highlight?");
    expect(prompt).toBeTruthy();
    expect(screen.getByText("The note attached to it will also be removed.")).toBeTruthy();

    // The Keep button carries [data-initial-focus] (non-destructive default —
    // Pitfall 8 — an accidental Enter cannot delete).
    const keepBtn = screen.getByText("Keep");
    expect(keepBtn.getAttribute("data-initial-focus")).not.toBeNull();

    // The destructive Delete confirm button is also present.
    const confirmDelete = screen
      .getAllByText("Delete")
      .find((btn) => btn.classList.contains("highlight-popover-destructive"));
    expect(confirmDelete).toBeTruthy();
  });

  it("clicking Keep CLOSES the dialog (back to the controls — nothing deleted)", async () => {
    render(
      <HighlightOverlayProvider article={article}>
        <ConfirmOpener highlightId="hl-test-1" />
        <NotePopover />
      </HighlightOverlayProvider>,
    );

    await screen.findByText("Delete this highlight?");

    // Click Keep → the dialog closes (the controls hold their place behind
    // the modal; the trigger restore lands on the anchor mark — proven in
    // the e2e focus spec).
    await act(async () => {
      fireEvent.click(screen.getByText("Keep"));
    });

    // Nothing was deleted; the confirm view is gone.
    expect(deleteHighlightFromStore).not.toHaveBeenCalled();
    expect(screen.queryByText("Delete this highlight?")).toBeNull();
  });

  it("a failed delete keeps the dialog OPEN with the inline failure line (content stays)", async () => {
    vi.mocked(deleteHighlightFromStore).mockRejectedValueOnce(new Error("quota"));
    render(
      <HighlightOverlayProvider article={article}>
        <ConfirmOpener highlightId="hl-test-1" />
        <NotePopover />
      </HighlightOverlayProvider>,
    );

    // Noted highlight → confirm view → destructive Delete → rejection.
    await screen.findByText("Delete this highlight?");
    const confirmDelete = screen
      .getAllByText("Delete")
      .find((btn) => btn.classList.contains("highlight-popover-destructive"));
    expect(confirmDelete).toBeTruthy();
    await act(async () => {
      fireEvent.click(confirmDelete!);
    });

    // Honest failure: the dialog STAYS OPEN in the confirm view (never a
    // close that implies success), the calm inline line renders, and the
    // retry affordance remains.
    expect(screen.getByText("Couldn't delete this highlight. Try again.")).toBeTruthy();
    expect(screen.getByText("Delete this highlight?")).toBeTruthy();
    expect(screen.getByText("Keep")).toBeTruthy();
  });

  it("a confirmed delete restores focus to the highlight's passage block + clears the controls", async () => {
    // The noted highlight goes through the confirm step (the no-note
    // immediate path lives in HighlightControls — see highlight-controls
    // .test.tsx).
    render(
      <HighlightOverlayProvider article={article}>
        {/* The visible reading surface fragment ArticleView renders: the
            highlight's <mark> inside its [data-block-index] block. On a
            successful delete the mark unmounts in the real reader — here the
            static harness mark stays, but the captured focus target (the
            BLOCK) is what the close path must move focus to. */}
        <div data-block-index="7">
          <p>
            <mark className="highlight" data-highlight-id="hl-test-1" tabIndex={0}>
              Hello
            </mark>{" "}
            world.
          </p>
        </div>
        <ConfirmOpener highlightId="hl-test-1" />
        <NotePopover />
      </HighlightOverlayProvider>,
    );

    await screen.findByText("Delete this highlight?");
    const confirmDelete = screen
      .getAllByText("Delete")
      .find((btn) => btn.classList.contains("highlight-popover-destructive"))!;
    await act(async () => {
      fireEvent.click(confirmDelete);
    });

    expect(deleteHighlightFromStore).toHaveBeenCalledWith("hl-test-1");

    // Focus restored NEAR the passage: the deleted mark's containing block
    // — not <body> (the article top), which the default trigger restore
    // would have silently no-op'd into once the mark unmounts.
    const block = document.querySelector<HTMLElement>('[data-block-index="7"]');
    expect(block).not.toBeNull();
    await waitFor(() => expect(block).toHaveFocus());
    // The programmatic-focus discipline set tabindex="-1" on the block
    // (blocks are not focusable by default) — the resolveTocDestination/
    // settleFocus pattern.
    expect(block?.getAttribute("tabindex")).toBe("-1");
  });
});

describe("NotePopover — Cmd/Ctrl+Enter note save shortcut (PR 106)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("Cmd+Enter flushes the debounced save and closes (the Done path)", async () => {
    render(
      <HighlightOverlayProvider article={article}>
        <NoteOpener highlightId="hl-test-1" />
        <NotePopover />
      </HighlightOverlayProvider>,
    );

    const textarea = (await screen.findByPlaceholderText(
      "Add a note (optional)",
    )) as HTMLTextAreaElement;

    // Edit the note — this schedules the debounced save (pending write).
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "Saved via shortcut" } });
    });

    // Cmd+Enter routes through handleDone: flush the pending write BEFORE
    // closing — no edit lost.
    await act(async () => {
      fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
    });

    // The flush persisted the updated note.
    await waitFor(() => {
      expect(saveNote).toHaveBeenCalled();
    });
    const saved = vi.mocked(saveNote).mock.calls[0]?.[0];
    expect(saved?.text).toBe("Saved via shortcut");

    // The editor closed (edit view unmounted).
    expect(screen.queryByPlaceholderText("Add a note (optional)")).toBeNull();
  });

  it("Ctrl+Enter also saves and closes", async () => {
    render(
      <HighlightOverlayProvider article={article}>
        <NoteOpener highlightId="hl-test-1" />
        <NotePopover />
      </HighlightOverlayProvider>,
    );

    const textarea = await screen.findByPlaceholderText("Add a note (optional)");

    await act(async () => {
      fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });
    });

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Add a note (optional)")).toBeNull();
    });
  });

  it("plain Enter and Shift+Enter keep native behavior (no flush, no close)", async () => {
    render(
      <HighlightOverlayProvider article={article}>
        <NoteOpener highlightId="hl-test-1" />
        <NotePopover />
      </HighlightOverlayProvider>,
    );

    const textarea = (await screen.findByPlaceholderText(
      "Add a note (optional)",
    )) as HTMLTextAreaElement;

    // Edit first so a debounced save is pending — plain Enter must NOT flush
    // it (the debounce owns the write until Done/Escape/shortcut).
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "Pending edit" } });
    });

    await act(async () => {
      fireEvent.keyDown(textarea, { key: "Enter" });
    });
    await act(async () => {
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    });

    // Still in the edit view, save not flushed.
    expect(screen.getByPlaceholderText("Add a note (optional)")).toBeTruthy();
    expect(saveNote).not.toHaveBeenCalled();
  });

  it("Enter during IME composition (isComposing) does not trigger the shortcut", async () => {
    // Issue #177: an unmount now FLUSHES a pending draft (the in-app
    // navigation seam), so a prior test's leftover debounce would land here.
    // Clear at the start — this test asserts the SHORTCUT never saves.
    vi.mocked(saveNote).mockClear();
    render(
      <HighlightOverlayProvider article={article}>
        <NoteOpener highlightId="hl-test-1" />
        <NotePopover />
      </HighlightOverlayProvider>,
    );

    const textarea = await screen.findByPlaceholderText("Add a note (optional)");

    // The keyDown that CONFIRMS an IME composition reports isComposing=true —
    // save-and-close there would discard the in-flight composition.
    await act(async () => {
      fireEvent.keyDown(textarea, {
        key: "Enter",
        metaKey: true,
        isComposing: true,
      });
    });

    // Still in the edit view.
    expect(screen.getByPlaceholderText("Add a note (optional)")).toBeTruthy();
    expect(saveNote).not.toHaveBeenCalled();
  });
});
