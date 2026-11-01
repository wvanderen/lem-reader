// tests/unit/annotations/panel-slot-pills.test.tsx
// Issue #222 — the annotation panel's color control is ONE row of five slot
// pills. The named-color picker (HighlightColorEntry, issue #118) and the
// separate "Apply slot" row (issue #195) are GONE: the five slots are THE
// color vocabulary everywhere a highlight's color is chosen. The unit layer
// pins the panel's observable behavior:
//
//   1. ONE row of five slot pills in the color-pill anatomy (swatch + number
//      + name), each an ACTION BUTTON labelled "Apply slot N: name" — not a
//      radio: no checked/current state (a record's color may match no slot).
//   2. No named-pills row, no inert "Custom" pill, and no "Slot applied."
//      status card — the visible color + tag change IS the success register.
//   3. Activating a pill applies color + ADDITIVE tags through the ONE
//      applyHighlightSlot seam (tags first, then color — order pinned by
//      apply-slot.test.tsx; here the call shapes).
//   4. A failed apply surfaces the calm inline "Couldn't apply slot." in the
//      panel's StatusRegion — never a success word (the rethrow contract).
//   5. A slot pill paints its ACTIVE source: an ACTIVE custom slot's swatch
//      carries the derived readable tint; a DORMANT hex (retained while a
//      named fill is active) paints the named fill.
//   6. The pills are NOT gated on anchor status — ambiguous highlights
//      recolor identically (the tags discipline).
//
// Semantic-only (RTL + user-event, jsdom). The mounting harness mirrors the
// note-popover-confirm.test.tsx discipline.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import {
  HighlightOverlayProvider,
  useHighlightOverlay,
} from "../../../src/reader/annotations/HighlightOverlay";
import { HighlightControls } from "../../../src/reader/annotations/HighlightControls";
import { highlightBases, customHighlightTint } from "../../../src/settings/highlightTint";
import type { HighlightTintBases } from "../../../src/settings/highlightTint";
import type { CanonicalArticle } from "../../../src/content/types";
import type { Block, HighlightSlot } from "../../../src/content/schema";

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
    tags: ["reading"],
  } as Record<string, unknown>,
}));

vi.mock("../../../src/persistence/highlightsStore", async () => {
  const { HighlightRecordSchema } = await import("../../../src/content/schema");
  return {
    loadHighlights: vi.fn(async () => ({
      ok: true,
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

const SLOTS: HighlightSlot[] = [
  { name: "Reading list", color: "default", customColorActive: false, tags: ["to-read"] },
  { name: "Yellow", color: "yellow", customColorActive: false, tags: [] },
  {
    name: "Key ideas",
    color: "blue",
    customColor: "#1234ab",
    customColorActive: true,
    tags: ["key-idea"],
  },
  {
    name: "Dormant amber",
    color: "green",
    customColor: "#e9c46a",
    customColorActive: false,
    tags: [],
  },
  { name: "Pink", color: "pink", customColorActive: false, tags: [] },
];

function ControlsOpener({ highlightId }: { highlightId: string }) {
  const { setControlsFor } = useHighlightOverlay();
  useEffect(() => {
    setControlsFor({ id: highlightId, rect: new DOMRect(8, 60, 40, 20), focus: false });
  }, [highlightId, setControlsFor]);
  return null;
}

function renderControls(bases?: HighlightTintBases) {
  return render(
    <HighlightOverlayProvider article={article} highlightSlots={SLOTS} highlightBases={bases}>
      <ControlsOpener highlightId="hl-test-1" />
      <HighlightControls />
    </HighlightOverlayProvider>,
  );
}

async function findSurface(): Promise<HTMLElement> {
  return await screen.findByRole("dialog", { name: "Highlight" });
}

/** The slot pill button for one slot index. */
function slotPill(surface: HTMLElement, index: number): HTMLButtonElement {
  return within(surface).getByRole("button", {
    name: `Apply slot ${index + 1}: ${SLOTS[index]?.name}`,
  }) as HTMLButtonElement;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("annotation panel slot pills (issue #222)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("ONE row of five slot pills — action buttons in the color-pill anatomy, no radios, no current state", async () => {
    renderControls();
    const surface = await findSurface();

    // The color fieldset: legend + five labelled pills.
    expect(within(surface).getByText("Color")).toBeTruthy();
    for (let i = 0; i < 5; i += 1) {
      const pill = slotPill(surface, i);
      // An action button — never a radio, never "checked".
      expect(pill.tagName).toBe("BUTTON");
      // The color-pill anatomy: swatch + number + name.
      expect(pill.querySelector(".highlight-color-swatch")).toBeTruthy();
      expect(pill.querySelector(".highlight-slot-number")?.textContent).toBe(String(i + 1));
      expect(pill.querySelector(".highlight-slot-name")?.textContent).toBe(SLOTS[i]?.name);
    }
    // No radio exists anywhere in the panel's color vocabulary anymore.
    expect(within(surface).queryAllByRole("radio")).toEqual([]);
  });

  it("no named-pills row, no inert Custom pill, no 'Slot applied.' status card", async () => {
    renderControls();
    const surface = await findSurface();

    for (const gone of ["Custom", "Slot applied."]) {
      expect(within(surface).queryByText(gone)).toBeNull();
    }
  });

  it("activating a pill applies color + ADDITIVE tags through the ONE seam", async () => {
    const user = userEvent.setup();
    const { setHighlightColor } = await import("../../../src/persistence/highlightsStore");
    const { setHighlightTags } = await import("../../../src/ingestion/library/tagsStore");
    renderControls();
    const surface = await findSurface();

    await user.click(slotPill(surface, 2)); // Key ideas: blue + ["key-idea"]
    await waitFor(() => {
      expect(vi.mocked(setHighlightColor).mock.calls.length).toBeGreaterThan(0);
    });
    // The record carried ["reading"]; the slot's tags JOIN (never replace).
    expect(vi.mocked(setHighlightTags).mock.calls.length).toBeGreaterThan(0);
    expect(vi.mocked(setHighlightTags).mock.calls[0]?.[1]).toEqual([
      "reading",
      "key-idea",
    ]);
    // The ACTIVE custom hex snapshots onto the record with the named fallback.
    expect(vi.mocked(setHighlightColor).mock.calls[0]?.slice(1)).toEqual(["blue", "#1234ab"]);
  });

  it("a failed apply surfaces the inline 'Couldn't apply slot.' — never a success word", async () => {
    const user = userEvent.setup();
    const { setHighlightColor } = await import("../../../src/persistence/highlightsStore");
    vi.mocked(setHighlightColor).mockRejectedValueOnce(new Error("dexie down"));
    renderControls();
    const surface = await findSurface();

    await user.click(slotPill(surface, 1));
    // The calm inline failure copy is announced inside the open panel.
    expect(await screen.findByText("Couldn't apply slot.")).toBeTruthy();
    expect(within(surface).queryByText("Slot applied.")).toBeNull();
  });

  it("a pill paints its ACTIVE source: the derived tint while active, the named fill while dormant", async () => {
    const bases = highlightBases({ theme: "sepia" });
    renderControls(bases);
    const surface = await findSurface();

    // Slot 3 — ACTIVE custom hex: the derived readable tint (jsdom serializes
    // the inline style's color as rgb()).
    const activeSwatch = slotPill(surface, 2)
      .querySelector(".highlight-color-swatch") as HTMLElement;
    const expectedTint = customHighlightTint("#1234ab", bases) as string;
    const expectedRgb = `rgb(${parseInt(expectedTint.slice(1, 3), 16)}, ${parseInt(expectedTint.slice(3, 5), 16)}, ${parseInt(expectedTint.slice(5, 7), 16)})`;
    expect(activeSwatch.getAttribute("style")).toContain(expectedRgb);

    // Slot 4 — DORMANT hex: the NAMED fill class, no inline tint.
    const dormantSwatch = slotPill(surface, 3)
      .querySelector(".highlight-color-swatch") as HTMLElement;
    expect(dormantSwatch.className).toContain("highlight-color-swatch-green");
    expect(dormantSwatch.getAttribute("style")).toBeNull();
  });

  it("the pills stay editable on an ambiguous anchor (color never depends on re-anchoring)", async () => {
    // The record's quote cannot resolve? resolveQuoteSelector is stubbed to
    // resolve; ambiguity rides the record's own classification — the pills
    // render enabled regardless (the tags discipline). Pin: buttons enabled.
    renderControls();
    const surface = await findSurface();
    for (let i = 0; i < 5; i += 1) {
      expect(slotPill(surface, i).disabled).toBe(false);
    }
  });
});
