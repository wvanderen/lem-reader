// Unified annotation panel: controls and writing share one safe editing session.
import { afterEach, describe, expect, it, vi } from "vitest";
import { configure, render, screen, act, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import {
  HighlightOverlayProvider,
  useHighlightOverlay,
} from "../../../src/reader/annotations/HighlightOverlay";
import { HighlightControls } from "../../../src/reader/annotations/HighlightControls";
import { loadNote } from "../../../src/persistence/notesStore";
import { deleteHighlight as deleteHighlightFromStore } from "../../../src/persistence/highlightsStore";
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

function renderControls(noted = false) {
  vi.mocked(loadNote).mockResolvedValue(noted ? mockData.noteRecord : null);
  return render(
    <HighlightOverlayProvider article={article}>
      <ReadingSurface />
      <ControlsOpener highlightId="hl-test-1" focus />
      <HighlightControls />
    </HighlightOverlayProvider>,
  );
}

describe("Unified annotation session", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadNote).mockReset();
  });

  it("opens compact without a note and keeps color controls while writing", async () => {
    const user = userEvent.setup();
    renderControls();
    const dialog = await screen.findByRole("dialog", { name: "Highlight" });
    expect(within(dialog).getAllByRole("radio")).toHaveLength(6); // five named + Custom (#196)
    expect(within(dialog).queryByRole("textbox", { name: "Note" })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Add note" }));
    const note = within(dialog).getByRole("textbox", { name: "Note" });
    await waitFor(() => expect(note).toHaveFocus());
    await user.type(note, "Writing");
    await user.clear(note);
    expect(note).toBeVisible();
    expect(within(dialog).getAllByRole("radio")).toHaveLength(6); // five named + Custom (#196)
  });

  it("shows existing writing immediately, focusing the controls", async () => {
    renderControls(true);
    const tags = await screen.findByRole("button", { name: "Tags" });
    await waitFor(() => expect(tags).toHaveFocus());
    expect(screen.queryByRole("button", { name: /Add note|Edit note/ })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue(mockData.noteRecord.text);
  });

  it("one Escape saves and closes the entire session, returning to the passage", async () => {
    renderControls(true);
    const dialog = await screen.findByRole("dialog", { name: "Highlight" });
    await act(async () => {
      dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
    expect(document.querySelector("mark")).toHaveFocus();
  });

  it("tags expand beside the intact note, then return focus to Tags", async () => {
    const user = userEvent.setup();
    renderControls(true);
    const tags = await screen.findByRole("button", { name: "Tags" });
    await user.click(tags);
    const input = screen.getByRole("combobox");
    await waitFor(() => expect(input).toHaveFocus());
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue(mockData.noteRecord.text);
    await user.click(screen.getByRole("button", { name: "Tags" }));
    expect(tags).toHaveFocus();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("new unsaved writing requires confirmation and Keep restores it", async () => {
    const user = userEvent.setup();
    renderControls();
    await user.click(await screen.findByRole("button", { name: "Add note" }));
    await user.type(screen.getByRole("textbox", { name: "Note" }), "Unsaved note");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteHighlightFromStore).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("Unsaved note");
  });

  it("a no-note delete closes and restores focus near the passage", async () => {
    const user = userEvent.setup();
    renderControls();
    const dialog = await screen.findByRole("dialog", { name: "Highlight" });
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
    expect(deleteHighlightFromStore).toHaveBeenCalledWith("hl-test-1");
    expect(document.querySelector('[data-block-index="7"]')).toHaveFocus();
  });

  it("a failed delete retains the panel and offers another attempt", async () => {
    vi.mocked(deleteHighlightFromStore).mockRejectedValueOnce(new Error("quota"));
    const user = userEvent.setup();
    renderControls();
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await screen.findByText("Couldn't delete this highlight. Try again.");
    expect(screen.getByRole("dialog", { name: "Highlight" })).toHaveAttribute("open");
  });
  it("a failed save before deletion retains confirmation and exposes Retry", async () => {
    const { saveNote } = await import("../../../src/persistence/notesStore");
    const user = userEvent.setup();
    renderControls(true);
    await user.type(await screen.findByRole("textbox", { name: "Note" }), " changed");
    await user.click(screen.getByRole("button", { name: "Delete" }));
    vi.mocked(saveNote).mockRejectedValueOnce(new Error("quota"));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByText("Couldn't save the note. Try again.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
    expect(deleteHighlightFromStore).not.toHaveBeenCalled();
  });
});
