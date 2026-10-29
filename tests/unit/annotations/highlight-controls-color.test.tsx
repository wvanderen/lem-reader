// tests/unit/annotations/highlight-controls-color.test.tsx
// Issue #118 — named highlight colors; issue #175 reshapes their home: the
// choices are exposed DIRECTLY in the lightweight HighlightControls (mark
// activation), no longer inside the note editor. The HighlightColorEntry
// anatomy is unchanged (the TagPicker-host anatomy applied to the closed
// color vocabulary):
//   - the fieldset renders Default + the four named choices, each pill with
//     its VISIBLE text label + a decorative swatch (color never the sole
//     identifier — A11Y-05)
//   - a radio pick commits through updateHighlightColor (the ONE
//     highlightsStore seam) and re-renders the selection optimistically
//   - an older highlight without a color field hydrates to Default
//   - the picker stays EDITABLE when the anchor is ambiguous (color never
//     depends on re-anchoring — the tags discipline)
//   - a failed write surfaces the inline "Couldn't save color." status
//     (the rethrow contract)
//
// Semantic-only (RTL + user-event, jsdom). The mounting harness mirrors
// highlight-controls.test.tsx.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import {
  HighlightOverlayProvider,
  useHighlightOverlay,
} from "../../../src/reader/annotations/HighlightOverlay";
import { HighlightControls } from "../../../src/reader/annotations/HighlightControls";
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
  // The RAW row shape mirrors what Dexie returns — `color?` so tests can
  // exercise both the colored row and the pre-#118 row without the field.
  // Hydration happens in the loadHighlights stub below via the REAL schema
  // (the store's read path), not a render-side fallback.
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
    color?: string;
  },
}));

vi.mock("../../../src/persistence/highlightsStore", async () => {
  const { HighlightRecordSchema } = await import("../../../src/content/schema");
  return {
    loadHighlights: vi.fn(async () => ({
      ok: true,
      // The real store safeParses every row on the read path; the stub
      // hydrates through the SAME schema so a pre-#118 row (no color key)
      // tests the boundary hydration, exactly as production does.
      highlights: [HighlightRecordSchema.parse(mockData.highlightRecord)],
    })),
    saveHighlight: vi.fn().mockResolvedValue(undefined),
    deleteHighlight: vi.fn().mockResolvedValue(undefined),
    // Issue #118 — the ONE color write seam (stubbed; the call shape is the
    // assertion target).
    setHighlightColor: vi.fn().mockResolvedValue(undefined),
  };
});

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

function ControlsOpener({ highlightId }: { highlightId: string }) {
  const { setControlsFor } = useHighlightOverlay();
  useEffect(() => {
    setControlsFor({ id: highlightId, rect: new DOMRect(8, 60, 40, 20), focus: false });
  }, [highlightId, setControlsFor]);
  return null;
}

function NoteOpener({ highlightId }: { highlightId: string }) {
  const { setOpenPopoverFor } = useHighlightOverlay();
  useEffect(() => {
    setOpenPopoverFor(highlightId);
  }, [highlightId, setOpenPopoverFor]);
  return null;
}

function renderControls() {
  return render(
    <HighlightOverlayProvider article={article}>
      <ControlsOpener highlightId="hl-test-1" />
      <HighlightControls />
    </HighlightOverlayProvider>,
  );
}

async function findSurface(): Promise<HTMLElement> {
  return await screen.findByRole("dialog", { name: "Highlight" });
}

/** The labelled radio input for one color choice. */
function colorRadio(surface: HTMLElement, label: string): HTMLInputElement {
  return within(surface).getByRole("radio", { name: new RegExp(label, "i") }) as HTMLInputElement;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("HighlightControls color picker (issue #118 + #175)", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete mockData.highlightRecord.color;
  });

  it("exposes Default + the four named choices DIRECTLY in the controls, each with a VISIBLE text label", async () => {
    renderControls();

    const surface = await findSurface();
    // The fieldset legend names the field (keyboard/SR anchoring).
    expect(within(surface).getByText("Color")).toBeTruthy();
    for (const label of ["Default", "Yellow", "Green", "Blue", "Pink"]) {
      const radio = colorRadio(surface, label);
      expect(radio).toBeTruthy();
      // The visible label text rides the same <label> as the input — the
      // choice is never identified by the swatch color alone (A11Y-05).
      expect(within(surface).getAllByText(label).length).toBeGreaterThan(0);
    }
    // Exactly the five named choices + the Custom state (issue #196) — no
    // other entries.
    expect(within(surface).getAllByRole("radio")).toHaveLength(6);
    expect(within(surface).getByText("Custom")).toBeTruthy();
  });

  it("an older highlight without a color field hydrates to Default checked", async () => {
    delete mockData.highlightRecord.color;
    renderControls();

    const surface = await findSurface();
    await waitFor(() => {
      expect(colorRadio(surface, "Default").checked).toBe(true);
    });
    for (const label of ["Yellow", "Green", "Blue", "Pink"]) {
      expect(colorRadio(surface, label).checked).toBe(false);
    }
  });

  it("a picked color commits through the ONE write seam + re-checks optimistically", async () => {
    const { setHighlightColor } = await import("../../../src/persistence/highlightsStore");
    const user = userEvent.setup();
    renderControls();

    const surface = await findSurface();
    await user.click(colorRadio(surface, "Green"));

    expect(setHighlightColor).toHaveBeenCalledWith("hl-test-1", "green", undefined);
    await waitFor(() => {
      expect(colorRadio(surface, "Green").checked).toBe(true);
    });
    // Switching to another named color commits that pick too (Default
    // remains reachable — the reader can always go back).
    await user.click(colorRadio(surface, "Yellow"));
    expect(setHighlightColor).toHaveBeenLastCalledWith("hl-test-1", "yellow", undefined);
    await waitFor(() => {
      expect(colorRadio(surface, "Yellow").checked).toBe(true);
    });
  });

  it("a seeded named color renders checked from the persisted record", async () => {
    mockData.highlightRecord.color = "blue";
    renderControls();

    const surface = await findSurface();
    await waitFor(() => {
      expect(colorRadio(surface, "Blue").checked).toBe(true);
    });
  });

  it("keyboard: arrow keys move the radio group + Enter-free commit (native change)", async () => {
    const { setHighlightColor } = await import("../../../src/persistence/highlightsStore");
    const user = userEvent.setup();
    renderControls();

    const surface = await findSurface();
    // Keyboard-navigate to the group (the controls' tab order) and arrow
    // within it — native radio behavior fires change per arrow press.
    const radios = within(surface).getAllByRole("radio");
    const first = radios[0]! as HTMLInputElement;
    await user.click(first); // anchor focus in the group (Default)
    await user.keyboard("{ArrowRight}"); // → Yellow
    expect(setHighlightColor).toHaveBeenCalledWith("hl-test-1", "yellow", undefined);
  });

  it("the picker stays EDITABLE when the anchor is ambiguous (the note textarea does not)", async () => {
    const { resolveQuoteSelector } = await import("../../../src/content/normalizeText");
    const { setHighlightColor } = await import("../../../src/persistence/highlightsStore");
    vi.mocked(resolveQuoteSelector).mockReturnValueOnce("ambiguous");
    const user = userEvent.setup();
    render(
      <HighlightOverlayProvider article={article}>
        <ControlsOpener highlightId="hl-test-1" />
        <NoteOpener highlightId="hl-test-1" />
        <HighlightControls />
      </HighlightOverlayProvider>,
    );

    const textarea = (await screen.findByPlaceholderText(
      "Add a note (optional)",
    )) as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);

    // The color field is NOT disabled — color never depends on the anchor.
    const surface = await findSurface();
    const green = colorRadio(surface, "Green");
    expect(green.disabled).toBe(false);
    await user.click(green);
    expect(setHighlightColor).toHaveBeenCalledWith("hl-test-1", "green", undefined);
  });

  it("a failed write surfaces the inline 'Couldn't save color.' status (rethrow contract)", async () => {
    const { setHighlightColor } = await import("../../../src/persistence/highlightsStore");
    vi.mocked(setHighlightColor).mockRejectedValueOnce(new Error("QuotaExceededError"));
    const user = userEvent.setup();
    renderControls();

    const surface = await findSurface();
    await user.click(colorRadio(surface, "Pink"));

    // The host's StatusRegion (polite live region) announces the failure
    // locally — the StorageBanner behind the modal backdrop is not enough.
    await screen.findByText("Couldn't save color.");
  });

  it("a failed write ROLLS the optimistic pick back to the persisted color", async () => {
    const { setHighlightColor } = await import("../../../src/persistence/highlightsStore");
    vi.mocked(setHighlightColor).mockRejectedValueOnce(new Error("QuotaExceededError"));
    const user = userEvent.setup();
    renderControls();

    const surface = await findSurface();
    await user.click(colorRadio(surface, "Pink"));

    // The optimistic pick reverts: the checked radio re-matches the row the
    // disk kept (Default) — no divergent selection survives the failure
    // (the visible mark rolls back with the same record).
    await screen.findByText("Couldn't save color.");
    await waitFor(() => {
      expect(colorRadio(surface, "Default").checked).toBe(true);
      expect(colorRadio(surface, "Pink").checked).toBe(false);
    });
  });
});
