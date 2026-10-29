// tests/unit/annotations/apply-slot.test.tsx
// Issue #195 — the ONE slot-application seam (useAnnotationState
// .applyHighlightSlot). The unit layer pins the contract both apply surfaces
// (the toolbar's saved-state tap + the panel's "Apply slot") share:
//
//   1. The slot's tags JOIN the existing ones and the color replaces the
//      record's color — in that write order (tags, then color).
//   2. A color failure AFTER landed tags triggers the best-effort
//      compensating tag restore — the observable outcome is "applied" or
//      "nothing changed", never a half application (the AC's atomic reading).
//   3. The original error RETHROWS after the compensation attempt so the
//      host surfaces its inline failure copy (the rethrow contract).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, act } from "@testing-library/react";
import { useCallback } from "react";
import {
  HighlightOverlayProvider,
  useHighlightOverlay,
} from "../../../src/reader/annotations/HighlightOverlay";
import { setHighlightColor } from "../../../src/persistence/highlightsStore";
import { setHighlightTags } from "../../../src/ingestion/library/tagsStore";
import type { CanonicalArticle } from "../../../src/content/types";
import type { Block, HighlightSlot } from "../../../src/content/schema";

// ── Stubs (the note-draft-recovery mock discipline) ─────────────────────────

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
  blocks: [{ kind: "paragraph", content: [{ text: "Hello world.", marks: [] }] } as Block],
  footnotes: [],
};

vi.mock("../../../src/persistence/highlightsStore", () => ({
  loadHighlights: vi.fn().mockResolvedValue({ ok: true, highlights: [] }),
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
vi.mock("../../../src/ingestion/library/tagsStore", () => ({
  setHighlightTags: vi.fn(async (_id: string, tags: string[]) => [...tags]),
}));

const SLOT: HighlightSlot = { name: "Key ideas", color: "blue", tags: ["key-idea"] };

/** Mounts the provider and hands the test the overlay value. */
function Probe({
  onApi,
  onEdit,
}: {
  onEdit?: (edit: (id: string, tags: string[]) => Promise<void>) => void;
  onApi: (apply: (id: string, slot: HighlightSlot) => Promise<void>) => void;
}) {
  const value = useHighlightOverlay();
  onEdit?.(value.updateHighlightTags);
  const report = useCallback(() => onApi(value.applyHighlightSlot), [value, onApi]);
  // Report after mount; the apply closure is the latest render's.
  report();
  return null;
}

function mountProbe(
  onApi: Parameters<typeof Probe>[0]["onApi"],
  onEdit?: Parameters<typeof Probe>[0]["onEdit"],
) {
  render(
    <HighlightOverlayProvider article={article}>
      <Probe onApi={onApi} onEdit={onEdit} />
    </HighlightOverlayProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("applyHighlightSlot — the ONE slot-application seam (issue #195)", () => {
  it("writes tags (existing JOIN slot tags) first, then the color", async () => {
    let apply!: (id: string, slot: HighlightSlot) => Promise<void>;
    mountProbe((a) => {
      apply = a;
    });
    const order: string[] = [];
    vi.mocked(setHighlightTags).mockImplementation(async (_id, tags) => {
      order.push("tags");
      return [...tags];
    });
    vi.mocked(setHighlightColor).mockImplementation(async () => {
      order.push("color");
    });
    await act(async () => {
      await apply("hl-1", SLOT);
    });
    expect(setHighlightTags).toHaveBeenCalledWith("hl-1", ["key-idea"]);
    // Issue #196 — the third argument is the custom snapshot: a named slot
    // passes undefined (the seam DELETES the snapshot key on write).
    expect(setHighlightColor).toHaveBeenCalledWith("hl-1", "blue", undefined);
    expect(order).toEqual(["tags", "color"]);
  });

  it("a custom-color slot snapshots its hex; a named slot clears an earlier snapshot (issue #196)", async () => {
    let apply!: (id: string, slot: HighlightSlot) => Promise<void>;
    mountProbe((a) => {
      apply = a;
    });
    vi.mocked(setHighlightTags).mockImplementation(async (_id, tags) => [...tags]);
    await act(async () => {
      await apply("hl-1", { name: "Amber", color: "default", customColor: "#e9c46a", tags: [] });
    });
    // The snapshot rides the SAME color seam (one write, both fields).
    expect(setHighlightColor).toHaveBeenCalledWith("hl-1", "default", "#e9c46a");
    await act(async () => {
      await apply("hl-1", SLOT);
    });
    // Applying a NAMED slot afterwards clears the snapshot — the slot IS the
    // new color state; tags are untouched by this seam either way.
    expect(setHighlightColor).toHaveBeenLastCalledWith("hl-1", "blue", undefined);
  });

  it("a color failure after landed tags compensates: the previous tags are restored, the error rethrows", async () => {
    let apply!: (id: string, slot: HighlightSlot) => Promise<void>;
    mountProbe((a) => {
      apply = a;
    });
    vi.mocked(setHighlightTags).mockResolvedValue(["key-idea"]);
    vi.mocked(setHighlightColor).mockRejectedValue(new Error("quota"));
    let thrown: unknown;
    await act(async () => {
      try {
        await apply("hl-1", SLOT);
      } catch (e) {
        thrown = e;
      }
    });
    expect(thrown).toBeInstanceOf(Error);
    // The compensating restore wrote the (empty) previous tag set back.
    expect(setHighlightTags).toHaveBeenNthCalledWith(2, "hl-1", []);
  });
  it("a failed application never compensates over a later tag edit", async () => {
    let apply!: (id: string, slot: HighlightSlot) => Promise<void>;
    let edit!: (id: string, tags: string[]) => Promise<void>;
    mountProbe(
      (a) => {
        apply = a;
      },
      (e) => {
        edit = e;
      },
    );
    let failColor!: (error: Error) => void;
    let colorStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      colorStarted = resolve;
    });
    vi.mocked(setHighlightTags).mockImplementation(async (_id, tags) => [...tags]);
    vi.mocked(setHighlightColor).mockImplementation(() => {
      colorStarted();
      return new Promise<void>((_resolve, reject) => {
        failColor = reject;
      });
    });
    let failure: unknown;
    await act(async () => {
      const pending = apply("hl-1", SLOT).catch((e: unknown) => {
        failure = e;
      });
      await started;
      await edit("hl-1", ["key-idea", "later-writing"]);
      failColor(new Error("quota"));
      await pending;
    });
    expect(failure).toBeInstanceOf(Error);
    expect(setHighlightTags).toHaveBeenCalledTimes(2);
    expect(setHighlightTags).toHaveBeenLastCalledWith("hl-1", ["key-idea", "later-writing"]);
  });
});
