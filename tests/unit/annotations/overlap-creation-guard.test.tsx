// tests/unit/annotations/overlap-creation-guard.test.tsx
// Issue #190 — overlap refusal must hold across ALL creation routes and
// RAPID REPEATED creation, verified at the one creation funnel
// (HighlightOverlayProvider.createHighlightFromSelection) with the real
// rangesOverlap math.
//
// The demonstrated "stuck/blank highlight" cause: two rapid create attempts
// (double-press H, double-click Highlight, pointer + keyboard races) both ran
// the D5-13 overlap check against the COMMITTED highlights state. The first
// attempt's optimistic prepend had not committed yet, so the second attempt
// passed the check and persisted an identical/overlapping duplicate. The
// renderer's slicer assumes disjoint ranges (highlightRanges.ts), so the
// duplicate renders as doubled/stuck marks over one passage.
//
// Harness: the real provider + hook over mocked persistence seams, exposed
// through the provider's apiRef parent bridge (the same seam
// delete-highlight-rollback.test.tsx uses). rangesOverlap stays REAL — the
// interval math under test is the product's.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import {
  HighlightOverlayProvider,
  type HighlightOverlayValue,
} from "../../../src/reader/annotations/HighlightOverlay";
import { loadHighlights, saveHighlight } from "../../../src/persistence/highlightsStore";
import type { CanonicalArticle, Block } from "../../../src/content/types";
import type { TextPositionSelector } from "../../../src/content/normalizeText";

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
  seeded: {
    schemaVersion: 1 as const,
    id: "hl-existing",
    articleId: "test-article",
    revision: 1,
    position: { start: 0, end: 5 },
    quote: { prefix: "", exact: "Hello", suffix: " world." },
    createdAt: "2026-08-07T12:00:00Z",
    tags: [] as string[],
    color: "blue" as const,
  },
}));

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
  setHighlightTags: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../../src/content/normalizeText", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/content/normalizeText")>();
  return {
    ...actual,
    resolveQuoteSelector: vi.fn().mockReturnValue({ start: 0, end: 5 }),
  };
});

// The selection capture is the UI-facing input; the unit under test here is
// what happens AFTER a valid capture (the overlap funnel). Each test points
// it at the range it exercises.
const captureState = vi.hoisted(() => ({
  position: { start: 0, end: 5 } as TextPositionSelector,
}));

vi.mock("../../../src/annotations/capture", () => ({
  captureSelection: vi.fn().mockImplementation(() => ({
    ok: true,
    blockIndex: 0,
    position: { ...captureState.position },
  })),
}));

function mount(overrides?: { onStatusAnnounce?: (m: string) => void }): {
  apiRef: React.MutableRefObject<HighlightOverlayValue | null>;
  root: HTMLElement;
} {
  const apiRef = { current: null } as React.MutableRefObject<HighlightOverlayValue | null>;
  const root = document.createElement("div");
  document.body.appendChild(root);
  render(
    <HighlightOverlayProvider
      article={article}
      apiRef={apiRef}
      onStatusAnnounce={overrides?.onStatusAnnounce}
    >
      <span />
    </HighlightOverlayProvider>,
    { container: root },
  );
  return { apiRef, root };
}

describe("issue #190 — overlap refusal holds at the creation funnel", () => {
  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
    vi.mocked(loadHighlights).mockResolvedValue({ ok: true, highlights: [] });
    captureState.position = { start: 0, end: 5 };
  });

  it("rapid repeated creation persists exactly ONE highlight (the second attempt refuses as overlap)", async () => {
    const { apiRef } = mount();
    await waitFor(() => expect(apiRef.current).not.toBeNull());
    const api = apiRef.current!;
    // The pointer save path awaits saveHighlight; two rapid attempts (double
    // H, double click) both run while the first is still in flight.
    vi.mocked(saveHighlight).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 25)),
    );
    const first = api.createHighlightFromSelection(document.body);
    const second = api.createHighlightFromSelection(document.body);

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.ok).toBe(true);
    expect(secondResult).toEqual({ ok: false, reason: "overlap" });

    // Persisted outcome — not toolbar state: exactly one save reached the
    // seam for the duplicate burst.
    expect(saveHighlight).toHaveBeenCalledTimes(1);
    // The committed state carries the one survivor; the refused attempt left
    // no record and no phantom range.
    await waitFor(() => expect(apiRef.current!.highlights).toHaveLength(1));
    // A third attempt AFTER the commit is still refused (the committed
    // check, unchanged behavior).
    const third = await apiRef.current!.createHighlightFromSelection(document.body);
    expect(third).toEqual({ ok: false, reason: "overlap" });
    expect(saveHighlight).toHaveBeenCalledTimes(1);
  });

  it("allows recreating a deleted highlight when its original save was still pending", async () => {
    let finishSave!: () => void;
    vi.mocked(saveHighlight).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    const { apiRef } = mount();
    await waitFor(() => expect(apiRef.current).not.toBeNull());
    let creation!: ReturnType<HighlightOverlayValue["createHighlightFromSelection"]>;
    act(() => {
      creation = apiRef.current!.createHighlightFromSelection(document.body);
    });
    await waitFor(() => expect(apiRef.current!.highlights).toHaveLength(1));
    const id = apiRef.current!.highlights[0]!.record.id;
    await act(async () => {
      await apiRef.current!.deleteHighlight(id);
    });
    expect(apiRef.current!.highlights).toHaveLength(0);
    await act(async () => {
      finishSave();
      await creation;
    });
    let recreated!: Awaited<typeof creation>;
    await act(async () => {
      recreated = await apiRef.current!.createHighlightFromSelection(document.body);
    });
    expect(recreated.ok).toBe(true);
    expect(saveHighlight).toHaveBeenCalledTimes(2);
    expect(apiRef.current!.highlights).toHaveLength(1);
  });

  it("announces the overlap refusal on the refused create attempt", async () => {
    const onStatusAnnounce = vi.fn();
    const { apiRef } = mount({ onStatusAnnounce });
    await waitFor(() => expect(apiRef.current).not.toBeNull());
    const api = apiRef.current!;
    vi.mocked(saveHighlight).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 25)),
    );
    const results = await Promise.all([
      api.createHighlightFromSelection(document.body),
      api.createHighlightFromSelection(document.body),
    ]);
    const refused = results.find((r) => !r.ok);
    expect(refused).toEqual({ ok: false, reason: "overlap" });
    expect(onStatusAnnounce).toHaveBeenCalledWith("This overlaps an existing highlight.");
  });

  it("the refusal releases cleanly: a later disjoint creation still succeeds", async () => {
    const { apiRef } = mount();
    await waitFor(() => expect(apiRef.current).not.toBeNull());
    const api = apiRef.current!;
    vi.mocked(saveHighlight).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 25)),
    );
    const [, refused] = await Promise.all([
      api.createHighlightFromSelection(document.body),
      api.createHighlightFromSelection(document.body),
    ]);
    expect(refused).toEqual({ ok: false, reason: "overlap" });
    await waitFor(() => {
      expect(saveHighlight).toHaveBeenCalledTimes(1);
      expect(apiRef.current!.highlights).toHaveLength(1);
    });
    // Adjacent range (end-touching, [0,5) then [5,9)) — allowed per D5-13.
    captureState.position = { start: 5, end: 9 };
    const adjacent = await apiRef.current!.createHighlightFromSelection(document.body);
    expect(adjacent.ok).toBe(true);
    expect(saveHighlight).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(apiRef.current!.highlights).toHaveLength(2));
  });

  it.each([
    ["identical", { start: 0, end: 5 }],
    ["partial (candidate extends existing)", { start: 3, end: 9 }],
    ["contained (candidate inside existing)", { start: 1, end: 4 }],
    ["containing (candidate wraps existing)", { start: 0, end: 9 }],
  ])("refuses a %s overlap with a persisted highlight", async (_label, attempt) => {
    vi.mocked(loadHighlights).mockResolvedValue({
      ok: true,
      highlights: [mockData.seeded],
    });
    const { apiRef } = mount();
    await waitFor(() => expect(apiRef.current?.highlights).toHaveLength(1));
    const api = apiRef.current!;
    captureState.position = attempt;
    const result = await api.createHighlightFromSelection(document.body);
    expect(result).toEqual({ ok: false, reason: "overlap" });
    // The persisted set is untouched — no silent merge/replace.
    expect(saveHighlight).not.toHaveBeenCalled();
    expect(api.highlights).toHaveLength(1);
  });

  it("color never licenses an overlap: a colored existing highlight refuses an intersecting attempt", async () => {
    // The refusal predicate is color-blind (rangesOverlap sees only grapheme
    // ranges), so a SAME-color pair refuses exactly like a different-color
    // one. The same-color pair itself is exercised by the rapid-burst cells
    // above: both attempts would create Default-colored records, and the
    // e2e matrix intersects a Default-colored highlight throughout.
    vi.mocked(loadHighlights).mockResolvedValue({
      ok: true,
      highlights: [mockData.seeded], // color: "blue"
    });
    const { apiRef } = mount();
    await waitFor(() => expect(apiRef.current?.highlights).toHaveLength(1));
    const api = apiRef.current!;
    captureState.position = { start: 0, end: 5 };
    expect(await api.createHighlightFromSelection(document.body)).toEqual({
      ok: false,
      reason: "overlap",
    });
    expect(saveHighlight).not.toHaveBeenCalled();
  });
});
