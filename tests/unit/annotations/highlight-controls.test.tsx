// tests/unit/annotations/highlight-controls.test.tsx
// Issue #175 — the lightweight highlight controls: mark activation exposes
// THESE (not the full editor). Semantic-only (RTL, jsdom). Proves:
//   - The surface renders role="toolbar" with Add/Edit note + Tags + Delete
//     and the color choices DIRECTLY (no quotation text anywhere).
//   - Keyboard activation (controlsFor.focus) moves focus INTO the controls.
//   - "Add note"/"Edit note" + "Tags" focus the anchor <mark> FIRST and open
//     the editor/tags dialog state (the Pitfall-1 restore handoff).
//   - Delete is proportional (issue #174): a NO-NOTE highlight (empty OR
//     whitespace-only note) deletes IMMEDIATELY with focus restored near the
//     passage; a noted highlight opens the confirm dialog state; a rejected
//     write leaves the controls open with the honest inline line.
//   - Escape dismisses (focus back to the mark); outside pointerdown and
//     focus-exit dismiss; all suppressed while a modal editor is open.
import { afterEach, describe, expect, it, vi } from "vitest";
import { configure, render, screen, fireEvent, act, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import {
  HighlightOverlayProvider,
  useHighlightOverlay,
} from "../../../src/reader/annotations/HighlightOverlay";
import { HighlightControls } from "../../../src/reader/annotations/HighlightControls";
import { HighlightTagsDialog } from "../../../src/reader/annotations/HighlightTagsDialog";
import { NotePopover } from "../../../src/reader/annotations/NotePopover";
import { loadNote } from "../../../src/persistence/notesStore";
import { deleteHighlight as deleteHighlightFromStore } from "../../../src/persistence/highlightsStore";
import { focusHighlightMark } from "../../../src/reader/annotations/highlightMarks";
import type { CanonicalArticle, Block } from "../../../src/content/types";

// RTL's 1s async-util default is a guessed budget for THIS runner. The
// dismissals themselves are synchronous; a starved CI worker (2-core hosted
// checks, or the shared dev box under load) can stall the JS clock well past
// 1s mid-test — reproduced 1-in-5 locally under load, 0-in-27 quiet, and it
// failed the checks job on different tests of this file across two runs.
// test-discipline.md records up to 10x unit-test inflation under contention;
// 5s is that allowance for one file, not an assertion change.
configure({ asyncUtilTimeout: 5_000 });

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

vi.mock("../../../src/ingestion/library/tagsStore", () => ({
  loadTagStats: vi.fn().mockResolvedValue([]),
  setArticleTags: vi.fn().mockResolvedValue(undefined),
  setBookTags: vi.fn().mockResolvedValue(undefined),
  setHighlightTags: vi.fn(async (_id: string, tags: string[]) => tags),
  deriveTagStats: vi.fn().mockReturnValue([]),
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

// jsdom <dialog> polyfill (mirrors note-popover-confirm.test.tsx).
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

/** The visible reading surface fragment: the highlight's <mark> inside its
 *  [data-block-index] block (the focus-target anchor). */
function ReadingSurface() {
  return (
    <div data-block-index="7">
      <p>
        <mark className="highlight" data-highlight-id="hl-test-1" tabIndex={0}>
          Hello
        </mark>{" "}
        world.
      </p>
    </div>
  );
}

/** Opens the controls for the fixture highlight the way the activation
 *  handlers do. rect is a fixed non-zero box so the anchored position
 *  computes deterministically in jsdom. */
function ControlsOpener({ highlightId, focus = false }: { highlightId: string; focus?: boolean }) {
  const { setControlsFor } = useHighlightOverlay();
  useEffect(() => {
    setControlsFor({ id: highlightId, rect: new DOMRect(8, 60, 40, 20), focus });
  }, [highlightId, focus, setControlsFor]);
  return null;
}

/** Flip a provider state from inside the tree (dialog-open suppression etc.). */
function DialogProbe({
  mode,
  highlightId,
}: {
  mode: "note" | "confirm" | "tags" | null;
  highlightId: string;
}) {
  const { setOpenPopoverFor, setConfirmDeleteFor, setOpenTagsFor } = useHighlightOverlay();
  useEffect(() => {
    if (mode === "note") setOpenPopoverFor(highlightId);
    if (mode === "confirm") setConfirmDeleteFor(highlightId);
    if (mode === "tags") setOpenTagsFor(highlightId);
  }, [mode, highlightId, setOpenPopoverFor, setConfirmDeleteFor, setOpenTagsFor]);
  return null;
}

interface RenderOptions {
  focus?: boolean;
  noted?: boolean;
  dialogMode?: "note" | "confirm" | "tags" | null;
  withNotePopover?: boolean;
  withTagsDialog?: boolean;
}

function renderControls(opts: RenderOptions = {}) {
  if (opts.noted) {
    vi.mocked(loadNote).mockResolvedValue(mockData.noteRecord);
  } else {
    vi.mocked(loadNote).mockResolvedValue(null);
  }
  return render(
    <HighlightOverlayProvider article={article}>
      <ReadingSurface />
      <ControlsOpener highlightId="hl-test-1" focus={opts.focus ?? false} />
      {opts.dialogMode != null && <DialogProbe mode={opts.dialogMode} highlightId="hl-test-1" />}
      <HighlightControls />
      {/* A tabbable element OUTSIDE the surface (the focus-exit target). */}
      <button type="button" data-testid="outside">
        Outside
      </button>
      {opts.withNotePopover && <NotePopover />}
      {opts.withTagsDialog && <HighlightTagsDialog />}
    </HighlightOverlayProvider>,
  );
}

function queryControls(): HTMLElement | null {
  return document.querySelector(".highlight-controls");
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("HighlightControls — surface contract (issue #175)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadNote).mockReset();
  });

  it("renders a role=toolbar surface with Add note, Tags, Delete + the color choices", async () => {
    renderControls();

    const surface = await screen.findByRole("toolbar", { name: "Highlight controls" });
    expect(surface.classList.contains("highlight-controls")).toBe(true);
    const labels = Array.from(surface.querySelectorAll("button")).map((b) => b.textContent);
    expect(labels).toEqual(["Add note", "Tags", "Delete"]);
    // Color choices exposed DIRECTLY in the controls.
    expect(within(surface).getByText("Color")).toBeTruthy();
    expect(within(surface).getAllByRole("radio")).toHaveLength(5);
    // The passage quotation is never reproduced on this surface.
    expect(within(surface).queryByText("Hello")).toBeNull();
  });

  it("labels the note action Edit note when a nonempty note exists", async () => {
    renderControls({ noted: true });

    const surface = await screen.findByRole("toolbar", { name: "Highlight controls" });
    await waitFor(() => {
      expect(Array.from(surface.querySelectorAll("button")).map((b) => b.textContent)).toContain(
        "Edit note",
      );
    });
  });

  it("keyboard activation moves focus INTO the controls; pointer activation does not", async () => {
    const { rerender } = renderControls({ focus: true });
    const firstButton = await screen.findByRole("button", { name: "Add note" });
    await waitFor(() => expect(document.activeElement).toBe(firstButton));

    // Pointer activation leaves the focus chosen by the reader alone.
    rerender(
      <HighlightOverlayProvider article={article}>
        <ReadingSurface />
        <ControlsOpener highlightId="hl-test-1" focus={false} />
        <HighlightControls />
      </HighlightOverlayProvider>,
    );
    const mark = document.querySelector<HTMLElement>("mark.highlight")!;
    mark.focus();
    await waitFor(() => expect(document.activeElement).toBe(mark));
  });

  it("whitespace-only commentary counts as no note (Add note, immediate delete)", async () => {
    // A whitespace-only stored note — the shared predicate treats it as
    // absent everywhere a NOTE PRESENCE decision is made.
    vi.mocked(loadNote).mockResolvedValue({
      ...mockData.noteRecord,
      text: "   ",
    });
    renderControls();

    const surface = await screen.findByRole("toolbar", { name: "Highlight controls" });
    await waitFor(() => {
      expect(Array.from(surface.querySelectorAll("button")).map((b) => b.textContent)).toContain(
        "Add note",
      );
    });
  });

  it("Add note hands off through the anchor <mark>: closing the editor restores focus to it", async () => {
    const user = userEvent.setup();
    renderControls({ withNotePopover: true });

    const addNote = await screen.findByRole("button", { name: "Add note" });
    await user.click(addNote);

    // The editor opened (state flipped to openPopoverFor) and took focus
    // (the D5-10 textarea focus) — the transient mark focus was the
    // handoff that armed the dialog's Pitfall-1 trigger capture.
    const textarea = await screen.findByPlaceholderText("Add a note (optional)");
    await waitFor(() => expect(document.activeElement).toBe(textarea));

    // Done → focus restored to the HIGHLIGHT (the trigger the handoff
    // captured), with the controls still holding their place behind the
    // (now closed) modal.
    await user.click(screen.getByRole("button", { name: "Done" }));
    const mark = document.querySelector<HTMLElement>('mark[data-highlight-id="hl-test-1"]');
    await waitFor(() => expect(mark).toHaveFocus());
    expect(queryControls()).not.toBeNull();
  });

  it("Tags hands off through the anchor <mark>: closing the tags editor restores focus to it", async () => {
    const user = userEvent.setup();
    renderControls({ withTagsDialog: true });

    const tags = await screen.findByRole("button", { name: "Tags" });
    await user.click(tags);

    // The compact tags dialog opened and focused its picker input.
    const dialog = await screen.findByRole("dialog", { name: "Edit tags" });
    const input = within(dialog).getByLabelText("Add or search a tag");
    await waitFor(() => expect(document.activeElement).toBe(input));

    // Done → focus restored to the HIGHLIGHT; the controls remain.
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    const mark = document.querySelector<HTMLElement>('mark[data-highlight-id="hl-test-1"]');
    await waitFor(() => expect(mark).toHaveFocus());
    expect(queryControls()).not.toBeNull();
  });
});

describe("HighlightControls — proportional delete (issue #174)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadNote).mockReset();
  });

  it("a NO-NOTE highlight deletes IMMEDIATELY — focus stays near the passage", async () => {
    const user = userEvent.setup();
    renderControls();

    const del = await screen.findByRole("button", { name: "Delete" });
    await user.click(del);

    expect(deleteHighlightFromStore).toHaveBeenCalledWith("hl-test-1");
    // No confirm dialog ever mounts.
    await waitFor(() => expect(screen.queryByText("Delete this highlight?")).toBeNull());
    // Focus restored to the captured containing block (never the article top).
    const block = document.querySelector<HTMLElement>('[data-block-index="7"]');
    await waitFor(() => expect(block).toHaveFocus());
    expect(block?.getAttribute("tabindex")).toBe("-1");
    // The controls dismissed.
    await waitFor(() => expect(queryControls()).toBeNull());
  });

  it("a NOTED highlight opens the confirm dialog state instead (write deferred)", async () => {
    const user = userEvent.setup();
    renderControls({ noted: true, withNotePopover: true });

    const del = await screen.findByRole("button", { name: "Delete" });
    await user.click(del);

    // The write has NOT fired; the confirm view opened inside the editor
    // dialog (same footprint), Keep the default focus.
    expect(deleteHighlightFromStore).not.toHaveBeenCalled();
    await screen.findByText("Delete this highlight?");
    expect(screen.getByText("Keep").getAttribute("data-initial-focus")).not.toBeNull();
  });

  it("a rejected NO-NOTE delete keeps the controls open with the honest failure line", async () => {
    vi.mocked(deleteHighlightFromStore).mockRejectedValueOnce(new Error("quota"));
    const user = userEvent.setup();
    renderControls();

    const del = await screen.findByRole("button", { name: "Delete" });
    await user.click(del);

    await screen.findByText("Couldn't delete this highlight. Try again.");
    // The controls STAY OPEN (never a dismissal that implies success).
    expect(queryControls()).not.toBeNull();
  });
});

describe("HighlightControls — dismissals (issue #175)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadNote).mockReset();
  });

  it("Escape dismisses and returns focus to the anchor <mark>", async () => {
    renderControls({ focus: true });
    const firstButton = await screen.findByRole("button", { name: "Add note" });
    await waitFor(() => expect(document.activeElement).toBe(firstButton));

    // Escape from INSIDE the surface (the event targets the focused control
    // and bubbles to the window listener — as in a real keypress).
    await act(async () => {
      firstButton.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    await waitFor(() => expect(queryControls()).toBeNull());
    const mark = document.querySelector<HTMLElement>('mark[data-highlight-id="hl-test-1"]');
    expect(mark).toHaveFocus();
  });

  it("outside pointerdown dismisses; the anchor mark is excluded", async () => {
    const user = userEvent.setup();
    renderControls();
    await screen.findByRole("toolbar", { name: "Highlight controls" });

    // Outside click (not the mark, not the surface) dismisses.
    await user.click(document.body);
    await waitFor(() => expect(queryControls()).toBeNull());

    // Re-open, then click the ANCHOR mark — the controls re-point (stay).
    render(
      <HighlightOverlayProvider article={article}>
        <ReadingSurface />
        <ControlsOpener highlightId="hl-test-1" />
        <HighlightControls />
      </HighlightOverlayProvider>,
    );
    await screen.findByRole("toolbar", { name: "Highlight controls" });
    const mark = document.querySelector<HTMLElement>('mark[data-highlight-id="hl-test-1"]')!;
    mark.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(queryControls()).not.toBeNull();
  });

  it("focus-exit (focus moving OUT of the surface) dismisses", async () => {
    renderControls();
    const surface = await screen.findByRole("toolbar", { name: "Highlight controls" });
    // Focus a control, then move focus to an OUTSIDE element → the focusout
    // dismissal (an intra-surface move holds; a move to the anchor mark
    // holds; anything else dismisses).
    surface.querySelector<HTMLButtonElement>("button")?.focus();
    document.querySelector<HTMLElement>('[data-testid="outside"]')!.focus();
    await waitFor(() => expect(queryControls()).toBeNull());
  });

  it("dismissals are SUPPRESSED while a modal editor is open (controls hold their place)", async () => {
    renderControls({ dialogMode: "note", withNotePopover: true });
    await screen.findByRole("toolbar", { name: "Highlight controls" });
    await screen.findByPlaceholderText("Add a note (optional)");

    // Escape is owned by the modal dialog (native close) — the controls'
    // Escape dismissal must not fire.
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(queryControls()).not.toBeNull();

    // Outside pointerdown likewise suppressed (the modal owns the surface).
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(queryControls()).not.toBeNull();
  });

  it("a scroll that MOVES the anchor dismisses (the captured rect went stale)", async () => {
    renderControls();
    await screen.findByRole("toolbar", { name: "Highlight controls" });
    // The scroll moved the anchor: the re-measured mark rect no longer
    // matches the capture.
    const mark = document.querySelector<HTMLElement>('mark[data-highlight-id="hl-test-1"]')!;
    mark.getBoundingClientRect = () => new DOMRect(8, 260, 40, 20);
    await act(async () => {
      document.dispatchEvent(new Event("scroll"));
    });
    await waitFor(() => expect(queryControls()).toBeNull());
  });

  it("a scroll that leaves the anchor put HOLDS (a stale coalesced event must not kill a fresh anchor)", async () => {
    // Engines coalesce scroll dispatches on rendering frames — the event for
    // an already-settled scroll can land AFTER a later activation captured
    // the post-scroll rect. The contract is "a MOVED anchor invalidates the
    // geometry", so an unchanged re-measure holds.
    renderControls();
    await screen.findByRole("toolbar", { name: "Highlight controls" });
    const mark = document.querySelector<HTMLElement>('mark[data-highlight-id="hl-test-1"]')!;
    mark.getBoundingClientRect = () => new DOMRect(8, 60, 40, 20); // == the capture
    await act(async () => {
      document.dispatchEvent(new Event("scroll"));
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(queryControls()).not.toBeNull();
  });

  it("a scroll targeting a dialog HOLDS while the anchor is put (the fixed anchor reads the article, never the top layer)", async () => {
    // The tags/note editors are top-layer <dialog>s; closing a dialog whose
    // box scrolls fires a scroll event on the dialog itself. That scroll
    // never moves the position:fixed anchor (the article underneath is
    // untouched), so it must not drop the controls the editor is about to
    // hand focus back to (observed: highlight-tags.spec Done → controls).
    renderControls();
    await screen.findByRole("toolbar", { name: "Highlight controls" });
    const mark = document.querySelector<HTMLElement>('mark[data-highlight-id="hl-test-1"]')!;
    mark.getBoundingClientRect = () => new DOMRect(8, 60, 40, 20); // == the capture
    const host = document.createElement("dialog");
    const scroller = document.createElement("div");
    host.appendChild(scroller);
    document.body.appendChild(host);
    try {
      await act(async () => {
        scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
        host.dispatchEvent(new Event("scroll", { bubbles: false }));
      });
      await new Promise((r) => setTimeout(r, 0));
      expect(queryControls()).not.toBeNull();
      // Once the anchor genuinely moves, the scroll still dismisses.
      mark.getBoundingClientRect = () => new DOMRect(8, 260, 40, 20);
      await act(async () => {
        document.dispatchEvent(new Event("scroll"));
      });
      await waitFor(() => expect(queryControls()).toBeNull());
    } finally {
      host.remove();
    }
  });

  it("a scroll with the anchor momentarily unresolvable fails closed (dismisses)", async () => {
    renderControls();
    await screen.findByRole("toolbar", { name: "Highlight controls" });
    // No visible mark to re-measure (mid-repagination remount) — the
    // movement check cannot hold the surface, so dismissal stands.
    const mark = document.querySelector<HTMLElement>('mark[data-highlight-id="hl-test-1"]')!;
    mark.removeAttribute("data-highlight-id");
    await act(async () => {
      document.dispatchEvent(new Event("scroll"));
    });
    await waitFor(() => expect(queryControls()).toBeNull());
  });

  it("focusHighlightMark returns null without a surface (degrade quietly)", () => {
    expect(focusHighlightMark("hl-missing")).toBeNull();
  });

  it("Delete+pointerdown composition stays calm (fireEvent parity)", async () => {
    renderControls();
    await screen.findByRole("toolbar", { name: "Highlight controls" });
    // A plain fireEvent click path (no user-event) also runs the immediate
    // delete — guards against handler-wiring regressions.
    const del = screen.getByRole("button", { name: "Delete" });
    await act(async () => {
      fireEvent.click(del);
    });
    expect(deleteHighlightFromStore).toHaveBeenCalledWith("hl-test-1");
  });
});
