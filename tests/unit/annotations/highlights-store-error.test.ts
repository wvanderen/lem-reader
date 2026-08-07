// tests/unit/annotations/highlights-store-error.test.ts
// STATE-05 unit coverage for the highlightsStore persistence seam (Phase 5
// Task 2). Mirrors tests/unit/storageFallback.test.ts vi.mock + mockReset
// conventions: mock the Dexie `db` module, assert loadHighlights classifies
// every failure mode into the recovery vocabulary WITHOUT throwing, a single
// corrupt row is DROPPED while valid rows pass (defensive load), and
// deleteHighlight runs a cascade-delete transaction over both stores
// (Pitfall 10).
//
// Pure logic — jsdom-safe (no <dialog>, no layout, no Dexie open).
import { describe, expect, it, vi, beforeEach } from "vitest";

// vi.mock is hoisted above imports — the factory must not reference outer
// variables. We mock the Dexie db module; the highlightsStore module under
// test imports `db` from it, so we control db.highlights/db.notes from the
// test.
vi.mock("../../../src/persistence/db", () => {
  // The store reads via db.highlights.where("[articleId+revision]")
  //   .between([id, 0], [id, MAX]).toArray() — a Dexie Collection chain.
  // The mock models that chain with STABLE inner vi.fns so per-test
  // mockReset/mockResolvedValue reaches the same instances the store calls.
  const highlightsToArray = vi.fn();
  const highlightsWhereBetween = vi.fn(() => ({ toArray: highlightsToArray }));
  const highlightsWhere = vi.fn(() => ({ between: highlightsWhereBetween }));
  const highlightsPut = vi.fn();
  const highlightsDelete = vi.fn();
  const highlights = { where: highlightsWhere, put: highlightsPut, delete: highlightsDelete };
  // Cascade-delete reads via db.notes.where("highlightId").equals(id).delete().
  const notesDelete = vi.fn();
  const notesWhereEquals = vi.fn(() => ({ delete: notesDelete }));
  const notesWhere = vi.fn(() => ({ equals: notesWhereEquals }));
  const notes = { where: notesWhere, put: vi.fn() };
  const transaction = vi.fn(
    (_mode: string, _s1: unknown, _s2: unknown, fn: () => Promise<unknown>) =>
      fn(),
  );
  return {
    db: {
      highlights,
      notes,
      transaction,
      // Wipe path (not exercised here, but the mock surface must exist).
      delete: vi.fn(),
      open: vi.fn(),
    },
  };
});

import {
  loadHighlights,
  saveHighlight,
  deleteHighlight,
} from "../../../src/persistence/highlightsStore";
import { db } from "../../../src/persistence/db";
import type { HighlightRecord } from "../../../src/content/schema";

// The store calls db.highlights.where(...).between(...).toArray() and
// db.notes.where(...).equals(...).delete(). Each chain link is a STABLE vi.fn
// defined in the factory above (closure-captured, not recreated per call), so
// these references are the same instances the store hits at runtime. Cast the
// mocked `db` to a typed shape reflecting the mock factory so the chain
// traversal type-checks (the real Table<>.where signature differs). Test
// plumbing pragmatically uses `any` for the mock-callable signatures.
type MockFn = {
  (...args: any[]): any;
  mockReset(): void;
  mockResolvedValue(v: any): void;
  mockRejectedValue(e: any): void;
  mockImplementation(fn: (...args: any[]) => any): void;
  toHaveBeenCalledWith(...args: any[]): void;
  toHaveBeenCalled(): void;
};
type MockHighlights = {
  where: MockFn & (() => { between: MockFn & (() => { toArray: MockFn }) });
  put: MockFn;
  delete: MockFn;
};
type MockNotes = {
  where: MockFn & (() => { equals: MockFn & (() => { delete: MockFn }) });
  put: MockFn;
};
const mockedDb = db as unknown as {
  highlights: MockHighlights;
  notes: MockNotes;
  transaction: MockFn;
};
const highlightsWhereMock = mockedDb.highlights.where;
const highlightsWhereBetweenMock = highlightsWhereMock().between;
const highlightsToArrayMock = highlightsWhereBetweenMock().toArray;
const highlightsPutMock = mockedDb.highlights.put;
const highlightsDeleteMock = mockedDb.highlights.delete;
const dbTransactionMock = mockedDb.transaction;
const notesWhereEqualsMock = mockedDb.notes.where().equals;
const notesDeleteMock = notesWhereEqualsMock().delete;

/** A valid HighlightRecord row as it would come back from Dexie. */
function validRow(overrides: Partial<HighlightRecord> = {}): HighlightRecord {
  return {
    schemaVersion: 1,
    id: "hl-00000000-0000-4000-8000-000000000001",
    articleId: "test-article",
    revision: 1,
    position: { start: 10, end: 20 },
    quote: { prefix: "alpha ", exact: "highlighted text", suffix: " omega" },
    createdAt: "2026-08-07T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  highlightsToArrayMock.mockReset();
  highlightsPutMock.mockReset();
  highlightsDeleteMock.mockReset();
  dbTransactionMock.mockReset();
  notesWhereEqualsMock.mockReset();
  notesDeleteMock.mockReset();
  // Restore the default transaction stub (just-invoke-fn) after each test.
  dbTransactionMock.mockImplementation(
    (_mode: string, _s1: unknown, _s2: unknown, fn: () => Promise<unknown>) =>
      fn(),
  );
});

// ── loadHighlights (STATE-05) ────────────────────────────────────────────────

describe("highlightsStore.loadHighlights (STATE-05)", () => {
  it("returns { ok: true, highlights: [] } when the article has no saved highlights", async () => {
    highlightsToArrayMock.mockResolvedValue([]);
    const result = await loadHighlights("test-article");
    expect(result).toEqual({ ok: true, highlights: [] });
  });

  it("returns the parsed records when all rows are valid", async () => {
    const rows = [
      validRow({ id: "hl-aaa", position: { start: 5, end: 15 } }),
      validRow({ id: "hl-bbb", revision: 2, position: { start: 100, end: 120 } }),
    ];
    highlightsToArrayMock.mockResolvedValue(rows);
    const result = await loadHighlights("test-article");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.highlights).toHaveLength(2);
      expect(result.highlights[0]!.id).toBe("hl-aaa");
      expect(result.highlights[1]!.id).toBe("hl-bbb");
    }
  });

  it("uses the compound-index range query between([articleId,0],[articleId,MAX]) (Pitfall 6)", async () => {
    highlightsToArrayMock.mockResolvedValue([]);
    await loadHighlights("essay-long-form");
    expect(highlightsWhereMock).toHaveBeenCalledWith("[articleId+revision]");
    expect(highlightsWhereBetweenMock).toHaveBeenCalledWith(
      ["essay-long-form", 0],
      ["essay-long-form", Number.MAX_SAFE_INTEGER],
    );
  });

  it("DROPS a single corrupt row while returning valid rows (defensive load)", async () => {
    const good = validRow({ id: "hl-good" });
    // A corrupt row: end <= start (fails TextPositionSelectorSchema refine).
    const corrupt = validRow({ id: "hl-corrupt", position: { start: 30, end: 10 } });
    const good2 = validRow({ id: "hl-good-2" });
    highlightsToArrayMock.mockResolvedValue([good, corrupt, good2]);
    const result = await loadHighlights("test-article");
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The corrupt row was dropped; the two valid rows are returned.
      expect(result.highlights).toHaveLength(2);
      expect(result.highlights.map((h) => h.id)).toEqual(["hl-good", "hl-good-2"]);
    }
  });

  it("returns { ok: false, reason: 'unavailable' } when db throws QuotaExceeded", async () => {
    highlightsToArrayMock.mockRejectedValue({ name: "QuotaExceeded" });
    const result = await loadHighlights("test-article");
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  it("returns { ok: false, reason: 'unupgradeable' } when db throws UpgradeError", async () => {
    highlightsToArrayMock.mockRejectedValue({ name: "UpgradeError" });
    const result = await loadHighlights("test-article");
    expect(result).toEqual({ ok: false, reason: "unupgradeable" });
  });

  it("never throws — unknown errors route to 'unavailable' (STATE-05 non-blocking)", async () => {
    highlightsToArrayMock.mockRejectedValue("a plain string throw");
    const result = await loadHighlights("test-article");
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });
});

// ── saveHighlight ────────────────────────────────────────────────────────────

describe("highlightsStore.saveHighlight", () => {
  it("upserts the highlight via db.highlights.put", async () => {
    const h = validRow();
    await saveHighlight(h);
    expect(highlightsPutMock).toHaveBeenCalledWith(h);
  });
});

// ── deleteHighlight (Pitfall 10 — cascade-delete transaction) ────────────────

describe("highlightsStore.deleteHighlight (Pitfall 10 cascade-delete)", () => {
  it("runs a Dexie transaction over db.highlights AND db.notes", async () => {
    await deleteHighlight("hl-to-delete");
    expect(dbTransactionMock).toHaveBeenCalledWith(
      "rw",
      mockedDb.highlights,
      mockedDb.notes,
      expect.any(Function),
    );
  });

  it("deletes the highlight AND its note(s) inside the transaction", async () => {
    await deleteHighlight("hl-to-delete");
    expect(highlightsDeleteMock).toHaveBeenCalledWith("hl-to-delete");
    expect(mockedDb.notes.where).toHaveBeenCalledWith("highlightId");
    expect(notesWhereEqualsMock).toHaveBeenCalledWith("hl-to-delete");
    expect(notesDeleteMock).toHaveBeenCalled();
  });
});
