// tests/unit/review/review-color.test.tsx
// Issue #119 — highlight colors in the Highlights review panel. The review
// surface must show and edit the SAME named color (+ Default state) the
// reader shows, including on ambiguous and orphaned rows:
//   - every row carries a VISIBLE text color label beside a decorative
//     swatch (color never the sole identifier — A11Y-05)
//   - "Change color" opens ReviewColorDialog hosting the reader's OWN
//     HighlightColorEntry picker (Default + the four named choices, labelled
//     radios)
//   - a pick commits through the ONE highlightsStore seam
//     (setHighlightColor), invalidates the ONE LibrarySnapshot, and
//     announces "Color saved." only after the write lands; the fresh
//     snapshot re-checks the radio and re-renders the row line (sync)
//   - the picker is NOT gated on anchor status — ambiguous and orphan-tail
//     rows recolor identically, and the edit touches only the color field
//     (badge + note survive untouched)
//   - a failed pick surfaces the inline "Couldn't save color." status
//     inside the open dialog, announces nothing, and invalidates nothing
//
// Semantic-only (RTL + user-event, jsdom). The ReviewView harness mocks the
// ONE LibrarySnapshot hook + its invalidation (Issue #8) and the highlights
// store seam; the derivation runs REAL (tri-state classification included).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewView } from "../../../src/routes/review/ReviewView";
import {
  ArticleSchema,
  HighlightRecordSchema,
  NoteRecordSchema,
} from "../../../src/content/schema";
import type { CanonicalArticle, HighlightRecord, NoteRecord } from "../../../src/content/schema";
import {
  deriveQuoteSelector,
  graphemeClusters,
  normalizeText,
} from "../../../src/content/normalizeText";
import type { TextPositionSelector, TextQuoteSelector } from "../../../src/content/normalizeText";
import { findAllOccurrences } from "../../../src/annotations/resolution";
import { EMPTY_LIBRARY_SNAPSHOT } from "../../../src/ingestion/library/librarySnapshot";
import type { LibrarySnapshot } from "../../../src/ingestion/library/librarySnapshot";

// ── Fixture construction (schema-validated, the review-filter.test.ts style) ─

const AMBIGUOUS_SENTENCE = "The repeated refrain echoes once";

function makeArticle(opts: { id: string; title: string; paragraphs: string[] }): CanonicalArticle {
  return ArticleSchema.parse({
    id: opts.id,
    revision: 1,
    lang: "en",
    provenance: {
      title: opts.title,
      retrievedAt: "2026-01-01T00:00:00.000Z",
      originalHtmlHash: "0".repeat(64),
    },
    blocks: opts.paragraphs.map((text) => ({
      kind: "paragraph",
      content: [{ text }],
    })),
  });
}

function uniqueAnchor(
  article: CanonicalArticle,
  exact: string,
): { position: TextPositionSelector; quote: TextQuoteSelector } {
  const clusters = graphemeClusters(normalizeText(article), article.lang);
  const exactClusters = graphemeClusters(exact, article.lang);
  const positions = findAllOccurrences(clusters, exactClusters);
  if (positions.length !== 1) {
    throw new Error(
      `fixture drift: expected "${exact}" exactly once in ${article.id}, got ${positions.length}`,
    );
  }
  const start = positions[0]!;
  const position = { start, end: start + exactClusters.length };
  return { position, quote: deriveQuoteSelector(article, position) };
}

// NO disambiguating context — N>1 occurrences of exact can never narrow
// (the duplicated-text ambiguous knob the e2e tri-state spec reuses).
function contextFreeAnchor(exact: string): {
  position: TextPositionSelector;
  quote: TextQuoteSelector;
} {
  return {
    position: { start: 0, end: graphemeClusters(exact, "en").length },
    quote: { prefix: "", exact, suffix: "" },
  };
}

function makeHighlight(opts: {
  id: string;
  articleId: string;
  anchor: { position: TextPositionSelector; quote: TextQuoteSelector };
}): HighlightRecord {
  return HighlightRecordSchema.parse({
    schemaVersion: 1,
    id: opts.id,
    articleId: opts.articleId,
    revision: 1,
    position: opts.anchor.position,
    quote: opts.anchor.quote,
    createdAt: "2026-08-20T10:00:00.000Z",
  });
}

// ── Corpus ───────────────────────────────────────────────────────────────────

const article = makeArticle({
  id: "review-color-article",
  title: "Color Review Corpus",
  paragraphs: [
    "The quiet harbor opens before dawn and the fishing boats rest.",
    `${AMBIGUOUS_SENTENCE} at the opening.`,
    "Something unique happens between the echoes here.",
    `${AMBIGUOUS_SENTENCE} again at the close.`,
  ],
});

// Short quotes (< 60 chars) so every surface excerpt is the full exact —
// accessible names are then plain literal strings.
const ANCHOR_CONFIDENT = uniqueAnchor(article, "quiet harbor opens");
const ANCHOR_AMBIG = contextFreeAnchor(AMBIGUOUS_SENTENCE);
const ANCHOR_ORPHAN = uniqueAnchor(article, "Something unique happens");

const HL_CONFIDENT = makeHighlight({
  id: "hl-color-confident",
  articleId: article.id,
  anchor: ANCHOR_CONFIDENT,
});
const HL_AMBIG = makeHighlight({
  id: "hl-color-ambiguous",
  articleId: article.id,
  anchor: ANCHOR_AMBIG,
});
const HL_ORPHAN = makeHighlight({
  id: "hl-color-orphan",
  articleId: "ghost-article",
  anchor: ANCHOR_ORPHAN,
});

const NOTE_ORPHAN: NoteRecord = NoteRecordSchema.parse({
  schemaVersion: 1,
  id: "note-color-orphan",
  highlightId: HL_ORPHAN.id,
  text: "A note that outlived its article.",
  updatedAt: "2026-08-21T09:00:00.000Z",
});

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockData = vi.hoisted(() => ({
  // The mutable per-highlight color map — the "Dexie truth" the mocked
  // snapshot derives from. invalidateLibrarySnapshot flips `version`; the
  // snapshot getter below rebuilds from THIS map, so a landed pick +
  // invalidate re-derives exactly like the real stale-while-revalidate pair.
  colors: {} as Record<string, string>,
  version: 0,
}));

vi.mock("../../../src/ingestion/library/librarySnapshot", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/ingestion/library/librarySnapshot")>();
  return {
    ...actual,
    invalidateLibrarySnapshot: vi.fn(() => {
      mockData.version += 1;
      actual.invalidateLibrarySnapshot();
    }),
  };
});

function buildSnapshot(): LibrarySnapshot {
  const highlights = [HL_CONFIDENT, HL_AMBIG, HL_ORPHAN].map((h) =>
    HighlightRecordSchema.parse({
      ...h,
      ...(mockData.colors[h.id] !== undefined ? { color: mockData.colors[h.id] } : {}),
    }),
  );
  return {
    ...EMPTY_LIBRARY_SNAPSHOT,
    articles: [article],
    highlights,
    notes: [NOTE_ORPHAN],
    highlightCountByArticleId: new Map([[article.id, 2]]),
    tags: [],
  };
}

vi.mock("../../../src/ingestion/library/useLibrarySnapshot", async () => {
  const { useSyncExternalStore } = await import("react");
  const { onLibrarySnapshotInvalidated } = await import(
    "../../../src/ingestion/library/librarySnapshot"
  );
  return {
    useLibrarySnapshot: () => {
      useSyncExternalStore(onLibrarySnapshotInvalidated, () => mockData.version);
      return { status: "ready" as const, snapshot: buildSnapshot() };
    },
  };
});

const { setHighlightColorMock } = vi.hoisted(() => ({
  setHighlightColorMock: vi.fn(),
}));

vi.mock("../../../src/persistence/highlightsStore", () => ({
  setHighlightColor: setHighlightColorMock,
}));

// jsdom <dialog> polyfill (the note-popover test harness discipline).
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

function renderReview() {
  return render(<ReviewView hasAppHistory={false} />);
}

function rowByExcerpt(excerpt: string) {
  return screen.getAllByRole("listitem").find((li) => li.textContent?.includes(excerpt));
}

function colorRadio(dialog: HTMLElement, label: string): HTMLInputElement {
  return within(dialog).getByRole("radio", {
    name: new RegExp(`^${label}$`, "i"),
  }) as HTMLInputElement;
}

async function openColorDialog(excerpt: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: `Change color: ${excerpt}` }));
  const dialog = await screen.findByRole("dialog", { name: "Change color" });
  return { user, dialog };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ReviewView highlight colors (issue #119)", () => {
  beforeEach(() => {
    // The seam stub doubles as the "Dexie truth": a landed pick mutates the
    // color map, so the next snapshot derivation re-derives with it.
    setHighlightColorMock.mockImplementation(async (id: string, color: string) => {
      mockData.colors[id] = color;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockData.colors = {};
    mockData.version = 0;
  });

  it("every row shows its named color as VISIBLE text (Default initially), on all three anchor states", () => {
    renderReview();

    for (const excerpt of [
      ANCHOR_CONFIDENT.quote.exact,
      AMBIGUOUS_SENTENCE,
      ANCHOR_ORPHAN.quote.exact,
    ]) {
      const row = rowByExcerpt(excerpt);
      expect(row).toBeTruthy();
      const colorLine = row!.querySelector(".review-row-color");
      expect(colorLine?.textContent).toBe("Default");
      // The decorative swatch rides the shared per-theme token classes.
      expect(colorLine?.querySelector(".highlight-color-swatch-default")).toBeTruthy();
    }
  });

  it("a seeded named color renders its label (the same named state as the reader)", () => {
    mockData.colors[HL_CONFIDENT.id] = "yellow";
    renderReview();

    const row = rowByExcerpt(ANCHOR_CONFIDENT.quote.exact);
    expect(row!.querySelector(".review-row-color")?.textContent).toBe("Yellow");
    expect(row!.querySelector(".highlight-color-swatch-yellow")).toBeTruthy();
    // The jump button's accessible name carries the named color (the
    // reader's highlightAriaLabelForText vocabulary).
    expect(
      screen.getByRole("button", {
        name: `Go to Yellow highlight: ${ANCHOR_CONFIDENT.quote.exact}`,
      }),
    ).toBeTruthy();
  });

  it("Change color opens the reader's picker: five labelled radios, current state checked", async () => {
    mockData.colors[HL_AMBIG.id] = "blue";
    renderReview();
    const { dialog } = await openColorDialog(AMBIGUOUS_SENTENCE);

    // The reader's OWN picker anatomy — fieldset legend + all five choices,
    // each a labelled radio (A11Y-05), the persisted color checked.
    expect(within(dialog).getByText("Color")).toBeTruthy();
    for (const label of ["Default", "Yellow", "Green", "Blue", "Pink"]) {
      expect(colorRadio(dialog, label)).toBeTruthy();
    }
    expect(within(dialog).getAllByRole("radio")).toHaveLength(5);
    expect(colorRadio(dialog, "Blue").checked).toBe(true);
    expect(colorRadio(dialog, "Green").checked).toBe(false);
  });

  it("a pick commits through the ONE seam, invalidates the snapshot, announces 'Color saved.', and the re-derived row + radio match", async () => {
    const { invalidateLibrarySnapshot } =
      await import("../../../src/ingestion/library/librarySnapshot");
    renderReview();
    const { user, dialog } = await openColorDialog(ANCHOR_CONFIDENT.quote.exact);

    await user.click(colorRadio(dialog, "Green"));

    expect(setHighlightColorMock).toHaveBeenCalledWith(HL_CONFIDENT.id, "green");
    // Announced ONLY after the write resolved (the honest-announcement
    // contract) and the ONE snapshot invalidated for the re-derive.
    await within(dialog).findByText("Color saved.");
    expect(within(dialog).getByRole("status").textContent).toBe("Color saved.");
    expect(invalidateLibrarySnapshot).toHaveBeenCalled();

    // The mocked re-derive (mockData.colors mutated by the seam stub) lands
    // on the next render: the row's color line, the radio, and the jump
    // button's accessible name all re-match the persisted color.
    await waitFor(() => {
      expect(
        rowByExcerpt(ANCHOR_CONFIDENT.quote.exact)!.querySelector(".review-row-color")?.textContent,
      ).toBe("Green");
      expect(colorRadio(dialog, "Green").checked).toBe(true);
    });
    expect(
      screen.getByRole("button", {
        name: `Go to Green highlight: ${ANCHOR_CONFIDENT.quote.exact}`,
      }),
    ).toBeTruthy();
  });

  it("orphan-tail row: recolor works, 'Article missing' badge + note survive", async () => {
    renderReview();
    const { user, dialog } = await openColorDialog(ANCHOR_ORPHAN.quote.exact);
    await user.click(colorRadio(dialog, "Yellow"));

    expect(setHighlightColorMock).toHaveBeenCalledWith(HL_ORPHAN.id, "yellow");
    await within(dialog).findByText("Color saved.");
    expect(within(dialog).getByRole("status").textContent).toBe("Color saved.");

    await waitFor(() => {
      const row = rowByExcerpt(ANCHOR_ORPHAN.quote.exact)!;
      expect(row.querySelector(".review-row-color")?.textContent).toBe("Yellow");
      // Anchor status untouched: the badge is still there, still orphan
      // vocabulary; the note preview is byte-identical.
      expect(row.querySelector(".review-badge-orphan")?.textContent).toBe("Article missing");
      expect(row.querySelector(".review-note-preview")?.textContent).toBe(NOTE_ORPHAN.text);
    });
  });

  it("ambiguous row: recolor works, 'Uncertain anchor' badge survives, jump stays disabled", async () => {
    renderReview();
    const { user, dialog } = await openColorDialog(AMBIGUOUS_SENTENCE);
    await user.click(colorRadio(dialog, "Pink"));

    expect(setHighlightColorMock).toHaveBeenCalledWith(HL_AMBIG.id, "pink");
    await within(dialog).findByText("Color saved.");
    expect(within(dialog).getByRole("status").textContent).toBe("Color saved.");

    await waitFor(() => {
      const row = rowByExcerpt(AMBIGUOUS_SENTENCE)!;
      expect(row.querySelector(".review-row-color")?.textContent).toBe("Pink");
      expect(row.querySelector(".review-badge-ambiguous")?.textContent).toBe("Uncertain anchor");
    });
    const jump = screen.getByRole("button", {
      name: `Go to Pink highlight: ${AMBIGUOUS_SENTENCE}. This highlight can't be located, so jumping is disabled.`,
    });
    expect(jump).toBeTruthy();
  });

  it("Done closes the dialog (dismiss only — picks already committed)", async () => {
    renderReview();
    const { user, dialog } = await openColorDialog(ANCHOR_CONFIDENT.quote.exact);
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Change color" })).toBeNull();
    });
  });


  it("a new editing session clears an earlier highlight's save failure", async () => {
    setHighlightColorMock.mockRejectedValueOnce(new Error("QuotaExceededError"));
    renderReview();
    const { user, dialog } = await openColorDialog(ANCHOR_CONFIDENT.quote.exact);
    await user.click(colorRadio(dialog, "Pink"));
    await within(dialog).findByText("Couldn't save color.");
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Change color" })).toBeNull();
    });
    const next = await openColorDialog(ANCHOR_ORPHAN.quote.exact);
    expect(within(next.dialog).queryByText("Couldn't save color.")).toBeNull();
    expect(within(next.dialog).getByRole("status").textContent).toBe("");
  });

  it("a failed pick surfaces the inline status, announces nothing, invalidates nothing", async () => {
    const { invalidateLibrarySnapshot } =
      await import("../../../src/ingestion/library/librarySnapshot");
    setHighlightColorMock.mockRejectedValueOnce(new Error("QuotaExceededError"));
    renderReview();
    const { dialog } = await openColorDialog(ANCHOR_CONFIDENT.quote.exact);

    const user = userEvent.setup();
    await user.click(colorRadio(dialog, "Pink"));

    // The picker's OWN inline honest-failure copy, inside the open dialog.
    await within(dialog).findByText("Couldn't save color.");
    // No success lie, no snapshot churn, radio re-matches the persisted row.
    expect(screen.queryByText("Color saved.")).toBeNull();
    expect(invalidateLibrarySnapshot).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(colorRadio(dialog, "Default").checked).toBe(true);
      expect(colorRadio(dialog, "Pink").checked).toBe(false);
    });
  });
});
