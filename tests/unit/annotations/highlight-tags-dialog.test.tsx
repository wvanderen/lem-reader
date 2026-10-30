// Inline highlight tags: shared TagEntry persistence and keyboard behavior.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within, renderHook, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import {
  HighlightOverlayProvider,
  useHighlightOverlay,
} from "../../../src/reader/annotations/HighlightOverlay";
import { useAnnotationState } from "../../../src/reader/annotations/useAnnotationState";
import { NotePopover } from "../../../src/reader/annotations/NotePopover";
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

const mockData = vi.hoisted(() => ({
  // The shape mirrors HighlightRecordRow — `tags?` so tests can exercise
  // both the tagged record and the pre-#116 row without the field.
  highlightRecord: {
    schemaVersion: 1 as const,
    id: "hl-test-1",
    articleId: "test-article",
    revision: 1,
    position: { start: 0, end: 5 },
    quote: { prefix: "", exact: "Hello", suffix: " world." },
    createdAt: "2026-08-07T12:00:00Z",
  } as {
    schemaVersion: 1;
    id: string;
    articleId: string;
    revision: number;
    position: { start: number; end: number };
    quote: { prefix: string; exact: string; suffix: string };
    createdAt: string;
    tags?: string[];
  },
  stats: [
    { tag: "essays", count: 3 },
    { tag: "philosophy", count: 1 },
  ],
}));

vi.mock("../../../src/persistence/highlightsStore", async () => {
  const { HighlightRecordSchema } = await import("../../../src/content/schema");
  return {
    loadHighlights: vi.fn(async () => ({
      ok: true,
      // The real store safeParses every row on the read path; the stub
      // hydrates through the SAME schema so the pre-#116 row (no tags key)
      // exercises the boundary hydration, exactly as production does.
      highlights: [HighlightRecordSchema.parse(mockData.highlightRecord)],
    })),
    saveHighlight: vi.fn().mockResolvedValue(undefined),
    deleteHighlight: vi.fn().mockResolvedValue(undefined),
    setHighlightColor: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../../../src/persistence/notesStore", () => ({
  loadNote: vi.fn().mockResolvedValue(null),
  saveNote: vi.fn().mockResolvedValue(undefined),
  deleteNote: vi.fn().mockResolvedValue(undefined),
}));

// The tag seams are stubbed: suggestions come from the mocked stats read,
// commits land in setHighlightTags (the ONE write seam).
vi.mock("../../../src/ingestion/library/tagsStore", () => ({
  loadTagStats: vi.fn().mockResolvedValue(mockData.stats),
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

// Inline highlight tags: the ALWAYS-VISIBLE annotation-tag field (issue #207).
// The panel hosts the shared TagEntry on every session — no expansion action.
function NoteOpener({ highlightId }: { highlightId: string }) {
  const { setOpenPopoverFor } = useHighlightOverlay();
  useEffect(() => {
    setOpenPopoverFor(highlightId);
  }, [highlightId, setOpenPopoverFor]);
  return null;
}

function renderTagsDialog() {
  return render(
    <HighlightOverlayProvider article={article}>
      <NoteOpener highlightId="hl-test-1" />
      <NotePopover />
    </HighlightOverlayProvider>,
  );
}

async function openTagsInput(): Promise<{
  user: ReturnType<typeof userEvent.setup>;
  input: HTMLInputElement;
  dialog: HTMLElement;
}> {
  const user = userEvent.setup();
  const dialog = await screen.findByRole("dialog", { name: "Highlight" });
  const input = (await within(dialog).findByPlaceholderText(
    "Add or search a tag…",
  )) as HTMLInputElement;
  await user.click(input);
  return { user, input, dialog };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("HighlightTagsDialog — the always-visible tag field (issue #207)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("hosts the shared TagPicker in the panel itself — no expansion step", async () => {
    mockData.highlightRecord.tags = ["essays"];
    renderTagsDialog();

    const dialog = await screen.findByRole("dialog", { name: "Highlight" });
    expect(dialog.classList.contains("annotation-panel")).toBe(true);
    // The fieldset legend + the visually-hidden input label both name the
    // field (keyboard/SR anchoring inside the dialog).
    expect(within(dialog).getByText("Tags", { selector: "legend" })).toBeTruthy();
    const input = within(dialog).getByLabelText("Add or search a tag");
    expect(input.id).toBe("highlight-tags-input");
    // No toggle remains: no aria-expanded trigger, no collapsible section.
    expect(
      Array.from(dialog.querySelectorAll("button")).some(
        (b) => b.getAttribute("aria-expanded") !== null,
      ),
    ).toBe(false);

    // The existing tag renders as a pill chip with its inside-× remove
    // button (the shared TagPicker anatomy, labelled for AT).
    const remove = within(dialog).getByRole("button", {
      name: "Remove tag essays",
    });
    expect(remove).toBeTruthy();
    expect(within(dialog).getByText("essays")).toBeTruthy();
  });

  it("keyboard pick: typing + Enter commits the tag through the write seam", async () => {
    mockData.highlightRecord.tags = ["essays"];
    const { setHighlightTags } = await import("../../../src/ingestion/library/tagsStore");
    renderTagsDialog();

    const { user, input } = await openTagsInput();
    await user.type(input, "philosophy");
    await user.keyboard("{Enter}");

    expect(setHighlightTags).toHaveBeenCalledWith("hl-test-1", ["essays", "philosophy"]);
  });

  it("case matching: typing ESSAYS routes to the stored casing (Q7A)", async () => {
    mockData.highlightRecord.tags = [];
    const { setHighlightTags } = await import("../../../src/ingestion/library/tagsStore");
    renderTagsDialog();

    const { user, input } = await openTagsInput();
    await user.type(input, "ESSAYS");
    // The suggestion list offers the STORED casing, not the typed twin.
    const listbox = screen.getByRole("listbox");
    expect(
      within(listbox)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["essays"]);
    await user.keyboard("{Enter}");

    expect(setHighlightTags).toHaveBeenCalledWith("hl-test-1", ["essays"]);
  });

  it("an older highlight without a tags field hydrates with NO tags", async () => {
    delete mockData.highlightRecord.tags;
    renderTagsDialog();

    const dialog = await screen.findByRole("dialog", { name: "Highlight" });
    // No chips, no remove buttons — the `?? []` hydration consumer-side.
    expect(within(dialog).queryAllByRole("button", { name: /Remove tag/ })).toEqual([]);
  });

  it("tags stay EDITABLE when the anchor is ambiguous (the note textarea does not)", async () => {
    const { resolveQuoteSelector } = await import("../../../src/content/normalizeText");
    const { setHighlightTags } = await import("../../../src/ingestion/library/tagsStore");
    vi.mocked(resolveQuoteSelector).mockReturnValueOnce("ambiguous");
    mockData.highlightRecord.tags = [];
    render(
      <HighlightOverlayProvider article={article}>
        <NoteOpener highlightId="hl-test-1" />
        <NotePopover />
      </HighlightOverlayProvider>,
    );

    const textarea = (await screen.findByPlaceholderText(
      "Add a note (optional)",
    )) as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);

    // The tag field is NOT disabled — tagging never depends on the anchor.
    const { user, input } = await openTagsInput();
    expect(input.disabled).toBe(false);
    await user.type(input, "philosophy");
    await user.keyboard("{Enter}");
    expect(setHighlightTags).toHaveBeenCalledWith("hl-test-1", ["philosophy"]);
  });

  it("removing a chip commits the removal", async () => {
    mockData.highlightRecord.tags = ["essays", "keep"];
    const { setHighlightTags } = await import("../../../src/ingestion/library/tagsStore");
    const user = userEvent.setup();
    renderTagsDialog();

    const remove = await screen.findByRole("button", {
      name: "Remove tag essays",
    });
    await user.click(remove);

    expect(setHighlightTags).toHaveBeenCalledWith("hl-test-1", ["keep"]);
  });

  it("removing a chip by KEYBOARD (focus + Enter on the remove button) commits too", async () => {
    mockData.highlightRecord.tags = ["essays"];
    const { setHighlightTags } = await import("../../../src/ingestion/library/tagsStore");
    const user = userEvent.setup();
    renderTagsDialog();

    // The × rides a real <button> with the "Remove tag …" aria-label — the
    // screen-reader/keyboard path needs no extra wiring; Enter activates it.
    const remove = await screen.findByRole("button", {
      name: "Remove tag essays",
    });
    for (let i = 0; i < 12 && document.activeElement !== remove; i++) {
      await user.tab();
    }
    expect(document.activeElement).toBe(remove);
    await user.keyboard("{Enter}");

    expect(setHighlightTags).toHaveBeenCalledWith("hl-test-1", []);
  });

  it("a failed write surfaces the inline 'Couldn't save tag.' status (rethrow contract)", async () => {
    mockData.highlightRecord.tags = [];
    const { setHighlightTags } = await import("../../../src/ingestion/library/tagsStore");
    vi.mocked(setHighlightTags).mockRejectedValueOnce(new Error("QuotaExceededError"));
    renderTagsDialog();

    const { user, input } = await openTagsInput();
    await user.type(input, "philosophy");
    await user.keyboard("{Enter}");

    // The host's StatusRegion (polite live region) announces the failure
    // locally — the StorageBanner behind the modal backdrop is not enough.
    await screen.findByText("Couldn't save tag.");
  });

  it("Done closes the dialog; the editor carries exactly ONE tag field (no note tag set)", async () => {
    mockData.highlightRecord.tags = ["essays"];
    const user = userEvent.setup();
    renderTagsDialog();

    const dialog = await screen.findByRole("dialog", { name: "Highlight" });
    // One combobox (the highlight's), no per-note tag surface.
    expect(screen.getAllByRole("combobox")).toHaveLength(1);

    // Done → the dialog closes (the controls hold their place behind the
    // modal; the trigger restore lands on the anchor <mark> — e2e-proven).
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Highlight" })).toBeNull();
    });
  });

  it("layered Escape 1: an open suggestion list dismisses; draft text and panel survive", async () => {
    mockData.highlightRecord.tags = [];
    renderTagsDialog();

    const { user, input, dialog } = await openTagsInput();
    await user.type(input, "philosophy");
    expect(screen.getByRole("listbox")).toBeTruthy();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect((input as HTMLInputElement).value).toBe("philosophy");
    expect(dialog).toHaveAttribute("open");
  });

  it("layered Escape 2: with the list dismissed, Escape clears uncommitted draft text; the panel stays", async () => {
    mockData.highlightRecord.tags = [];
    renderTagsDialog();

    const { user, input, dialog } = await openTagsInput();
    await user.type(input, "philosophy");
    await user.keyboard("{Escape}"); // layer 1 — dismiss the list
    await user.keyboard("{Escape}"); // layer 2 — clear the draft
    expect((input as HTMLInputElement).value).toBe("");
    expect(dialog).toHaveAttribute("open");
    // A whitespace-only draft is not a layer — nothing to clear.
    await user.type(input, "   ");
    await user.keyboard("{Escape}");
    expect(dialog).toHaveAttribute("open");
  });

  it("layered Escape 3: with no draft text, Escape closes through the guarded save", async () => {
    mockData.highlightRecord.tags = [];
    const { saveNote } = await import("../../../src/persistence/notesStore");
    renderTagsDialog();

    const dialog = await screen.findByRole("dialog", { name: "Highlight" });
    await act(async () => {
      dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    await waitFor(() => {
      expect(dialog).not.toHaveAttribute("open");
    });
    expect(saveNote).not.toHaveBeenCalled(); // no note writing to flush
  });
});

it("does not mirror an older save over a newer optimistic tag edit", async () => {
  const { setHighlightTags } = await import("../../../src/ingestion/library/tagsStore");
  let finishAddition!: (tags: string[]) => void;
  let finishRemoval!: (tags: string[]) => void;
  vi.mocked(setHighlightTags)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishAddition = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRemoval = resolve;
        }),
    );
  const { result } = renderHook(() => useAnnotationState(article, {}));
  await waitFor(() => expect(result.current.highlights).toHaveLength(1));
  let addition!: Promise<void>;
  let removal!: Promise<void>;
  act(() => {
    addition = result.current.updateHighlightTags("hl-test-1", ["temporary"]);
    removal = result.current.updateHighlightTags("hl-test-1", []);
  });
  await act(async () => {
    finishAddition(["temporary"]);
    await addition;
  });
  expect(result.current.highlights[0]?.record.tags).toEqual([]);
  await act(async () => {
    finishRemoval([]);
    await removal;
  });
  expect(result.current.highlights[0]?.record.tags).toEqual([]);
});
