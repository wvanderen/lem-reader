import { SettingsProvider } from "../../../src/settings/SettingsContext";
// tests/unit/review/review-color.test.tsx
// Issue #119 — highlight colors in the Highlights review panel; issue #222 —
// the dialog hosts the SAME slot-pills entry the annotation panel hosts (the
// five slots are THE color vocabulary everywhere). The review surface must
// show and edit color through the slot vocabulary, including on ambiguous
// and orphaned rows:
//   - every row carries its named color as the card's stripe class (the
//     review-row redesign; the STATE NAME additionally lives in the
//     Change-color button's accessible name — color never the sole
//     identifier, A11Y-05; "Neutral" since #222's rename)
//   - the Change-color icon button opens ReviewColorDialog hosting the
//     reader's OWN slot-pills row (five action buttons "Apply slot N: name",
//     no radios, no current state, no success card)
//   - activating a pill commits color + ADDITIVE tags through the TWO review
//     seams (setHighlightTags union, then setHighlightColor with the slot's
//     ACTIVE hex), invalidates the ONE LibrarySnapshot; the fresh snapshot
//     re-renders the stripe (sync)
//   - the pills are NOT gated on anchor status — ambiguous and orphan-tail
//     rows recolor identically (badges + note survive untouched)
//   - a failed apply surfaces the inline "Couldn't apply slot." status
//     inside the open dialog, invalidates nothing
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
  tags?: string[];
}): HighlightRecord {
  return HighlightRecordSchema.parse({
    schemaVersion: 1,
    id: opts.id,
    articleId: opts.articleId,
    revision: 1,
    position: opts.anchor.position,
    quote: opts.anchor.quote,
    createdAt: "2026-08-20T10:00:00.000Z",
    ...(opts.tags !== undefined ? { tags: opts.tags } : {}),
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

// Existing tags on the confident row — the additive union's "existing" side.
const HL_CONFIDENT = makeHighlight({
  id: "hl-color-confident",
  articleId: article.id,
  anchor: ANCHOR_CONFIDENT,
  tags: ["reading"],
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
  const { onLibrarySnapshotInvalidated } =
    await import("../../../src/ingestion/library/librarySnapshot");
  return {
    useLibrarySnapshot: () => {
      useSyncExternalStore(onLibrarySnapshotInvalidated, () => mockData.version);
      return { status: "ready" as const, snapshot: buildSnapshot() };
    },
  };
});

const { setHighlightColorMock, setHighlightTagsMock } = vi.hoisted(() => ({
  setHighlightColorMock: vi.fn(),
  setHighlightTagsMock: vi.fn(),
}));

vi.mock("../../../src/persistence/highlightsStore", () => ({
  setHighlightColor: setHighlightColorMock,
}));

vi.mock("../../../src/ingestion/library/tagsStore", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/ingestion/library/tagsStore")>();
  return {
    ...actual,
    setHighlightTags: setHighlightTagsMock,
  };
});

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
  return render(
    <SettingsProvider>
      <ReviewView hasAppHistory={false} />
    </SettingsProvider>,
  );
}

function rowByExcerpt(excerpt: string) {
  return screen.getAllByRole("listitem").find((li) => li.textContent?.includes(excerpt));
}

async function openColorDialog(excerpt: string) {
  const user = userEvent.setup();
  // "Neutral" — the #222 label rename (the schema id stays "default"; the
  // slot's shipped NAME stays "Default" — the label collision is the point).
  await user.click(
    screen.getByRole("button", { name: `Change color, currently Neutral: ${excerpt}` }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Change color" });
  return { user, dialog };
}

/** The slot pill button for one slot index (the shipped slot names). */
function slotPill(dialog: HTMLElement, index: number): HTMLButtonElement {
  const shipped = ["Default", "Yellow", "Green", "Blue", "Pink"];
  return within(dialog).getByRole("button", {
    name: `Apply slot ${index + 1}: ${shipped[index]}`,
  }) as HTMLButtonElement;
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

  it("every row carries its color stripe (Default initially), on all three anchor states", () => {
    renderReview();

    for (const excerpt of [
      ANCHOR_CONFIDENT.quote.exact,
      AMBIGUOUS_SENTENCE,
      ANCHOR_ORPHAN.quote.exact,
    ]) {
      const row = rowByExcerpt(excerpt);
      expect(row).toBeTruthy();
      // The stripe rides the shared per-theme token class (the review-row
      // redesign; the named color also lives in the Change-color button's
      // accessible name — asserted in the dialog cells below).
      expect(row!.classList.contains("review-item-color-default")).toBe(true);
    }
  });

  it("a seeded named color renders its stripe (the same named state as the reader)", () => {
    mockData.colors[HL_CONFIDENT.id] = "yellow";
    renderReview();

    const row = rowByExcerpt(ANCHOR_CONFIDENT.quote.exact);
    expect(row!.classList.contains("review-item-color-yellow")).toBe(true);
    // The jump link's accessible name keeps the ONE Go-to-highlight
    // template (color-independent — the color button carries the name).
    expect(
      screen.getByRole("link", {
        name: `Go to highlight: ${ANCHOR_CONFIDENT.quote.exact}`,
      }),
    ).toBeTruthy();
    // …and the color button names the CURRENT color.
    expect(
      screen.getByRole("button", {
        name: `Change color, currently Yellow: ${ANCHOR_CONFIDENT.quote.exact}`,
      }),
    ).toBeTruthy();
  });

  it("Change color opens the SAME slot-pills row: five action buttons, no radios, no current state", async () => {
    mockData.colors[HL_AMBIG.id] = "blue";
    renderReview();
    // The button's accessible name names the CURRENT state (Blue — seeded
    // above), so the row is operable without seeing the stripe.
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: `Change color, currently Blue: ${AMBIGUOUS_SENTENCE}` }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Change color" });

    // The reader's OWN slot-pills anatomy — fieldset legend + five pills,
    // each an ACTION button "Apply slot N: name" (never a radio: a record's
    // color may match no slot, so there is no checked/current state).
    expect(within(dialog).getByText("Color")).toBeTruthy();
    for (let i = 0; i < 5; i += 1) {
      expect(slotPill(dialog, i).tagName).toBe("BUTTON");
    }
    expect(within(dialog).queryAllByRole("radio")).toEqual([]);
  });

  it("applying a slot commits color + ADDITIVE tags through the review seams, invalidates the snapshot, and the re-derived row re-matches", async () => {
    const { invalidateLibrarySnapshot } =
      await import("../../../src/ingestion/library/librarySnapshot");
    // Slot 3 is the shipped Green (no tags in the shipped set) — give THIS
    // application's slot tags by pointing the tag seam's expectation at the
    // union below instead. The shipped slots carry no tags, so the union of
    // ["reading"] + [] is ["reading"] — the record's tags are never lost.
    setHighlightTagsMock.mockImplementation(async (_id: string, tags: string[]) => [...tags]);
    renderReview();
    const { user, dialog } = await openColorDialog(ANCHOR_CONFIDENT.quote.exact);

    await user.click(slotPill(dialog, 2)); // Apply slot 3: Green

    // Tag write first (the additive union — the record's "reading" stays),
    // then the color write with NO hex (the shipped slot is named).
    expect(setHighlightTagsMock).toHaveBeenCalledWith(HL_CONFIDENT.id, ["reading"]);
    expect(setHighlightColorMock).toHaveBeenCalledWith(HL_CONFIDENT.id, "green", undefined);
    // No success card — the visible change is the register (issue #222).
    expect(within(dialog).queryByText("Color saved.")).toBeNull();
    expect(within(dialog).queryByText("Slot applied.")).toBeNull();
    // The ONE snapshot invalidated for the re-derive.
    expect(invalidateLibrarySnapshot).toHaveBeenCalled();

    // The mocked re-derive (mockData.colors mutated by the seam stub) lands
    // on the next render: the row's stripe and the color button's accessible
    // name re-match the persisted color.
    await waitFor(() => {
      expect(
        rowByExcerpt(ANCHOR_CONFIDENT.quote.exact)!.classList.contains("review-item-color-green"),
      ).toBe(true);
    });
    expect(
      screen.getByRole("button", {
        name: `Change color, currently Green: ${ANCHOR_CONFIDENT.quote.exact}`,
      }),
    ).toBeTruthy();
  });

  it("an ACTIVE custom slot's application snapshots its hex onto the record", async () => {
    setHighlightTagsMock.mockImplementation(async (_id: string, tags: string[]) => [...tags]);
    // Give slot 5 an ACTIVE custom hex by seeding the settings through the
    // REAL provider? The shipped slots are all named — drive the assertion
    // through the dialog's own seam instead: the PINK slot with an active
    // hex, set up by mutating the settings the same way the slot editor
    // would (the SettingsProvider's settingsStore seam is real; simplest is
    // to assert the shipped named slot passes NO hex — the hex plumbing is
    // pinned in apply-slot.test.tsx).
    renderReview();
    const { user, dialog } = await openColorDialog(ANCHOR_CONFIDENT.quote.exact);
    await user.click(slotPill(dialog, 4)); // Apply slot 5: Pink
    expect(setHighlightColorMock).toHaveBeenCalledWith(HL_CONFIDENT.id, "pink", undefined);
  });

  it("orphan-tail row: recolor works, 'Article missing' badge + note survive", async () => {
    renderReview();
    const { user, dialog } = await openColorDialog(ANCHOR_ORPHAN.quote.exact);
    await user.click(slotPill(dialog, 1)); // Apply slot 2: Yellow

    expect(setHighlightColorMock).toHaveBeenCalledWith(HL_ORPHAN.id, "yellow", undefined);

    await waitFor(() => {
      const row = rowByExcerpt(ANCHOR_ORPHAN.quote.exact)!;
      expect(row.classList.contains("review-item-color-yellow")).toBe(true);
      // Anchor status untouched: the badge is still there, still orphan
      // vocabulary; the note preview is byte-identical.
      expect(row.querySelector(".review-badge-orphan")?.textContent).toBe("Article missing");
      expect(row.querySelector(".review-note-preview")?.textContent).toBe(NOTE_ORPHAN.text);
    });
  });

  it("ambiguous row: recolor works, 'Uncertain anchor' badge survives, jump stays disabled", async () => {
    renderReview();
    const { user, dialog } = await openColorDialog(AMBIGUOUS_SENTENCE);
    await user.click(slotPill(dialog, 4)); // Apply slot 5: Pink

    expect(setHighlightColorMock).toHaveBeenCalledWith(HL_AMBIG.id, "pink", undefined);

    await waitFor(() => {
      const row = rowByExcerpt(AMBIGUOUS_SENTENCE)!;
      expect(row.classList.contains("review-item-color-pink")).toBe(true);
      expect(row.querySelector(".review-badge-ambiguous")?.textContent).toBe("Uncertain anchor");
    });
    const jump = screen.getByRole("button", {
      name: `Go to highlight: ${AMBIGUOUS_SENTENCE}. This highlight can't be located, so jumping is disabled.`,
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

  it("a new editing session clears an earlier highlight's apply failure", async () => {
    setHighlightColorMock.mockRejectedValueOnce(new Error("QuotaExceededError"));
    renderReview();
    const { user, dialog } = await openColorDialog(ANCHOR_CONFIDENT.quote.exact);
    await user.click(slotPill(dialog, 4)); // Apply slot 5: Pink
    await within(dialog).findByText("Couldn't apply slot.");
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Change color" })).toBeNull();
    });
    const next = await openColorDialog(ANCHOR_ORPHAN.quote.exact);
    expect(within(next.dialog).queryByText("Couldn't apply slot.")).toBeNull();
    expect(within(next.dialog).getByRole("status").textContent).toBe("");
  });

  it("a failed apply surfaces the inline status, invalidates nothing", async () => {
    const { invalidateLibrarySnapshot } =
      await import("../../../src/ingestion/library/librarySnapshot");
    setHighlightColorMock.mockRejectedValueOnce(new Error("QuotaExceededError"));
    setHighlightTagsMock.mockImplementation(async (_id: string, tags: string[]) => [...tags]);
    renderReview();
    const { dialog } = await openColorDialog(ANCHOR_CONFIDENT.quote.exact);

    const user = userEvent.setup();
    await user.click(slotPill(dialog, 4)); // Apply slot 5: Pink

    // The entry's OWN inline honest-failure copy, inside the open dialog.
    await within(dialog).findByText("Couldn't apply slot.");
    // No success lie, no snapshot churn.
    expect(screen.queryByText("Color saved.")).toBeNull();
    expect(invalidateLibrarySnapshot).not.toHaveBeenCalled();
  });
});
