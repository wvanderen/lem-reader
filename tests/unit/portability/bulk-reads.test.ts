// tests/unit/portability/bulk-reads.test.ts
// Plan 09-02 Task 2 (TDD RED → GREEN) — whole-library bulk reads for the
// PORT-01 export side: loadAllHighlights + loadAllNotes (RESEARCH Pitfall 5 —
// the export service must not N+1 the per-article loaders or bypass STATE-04
// validation with a raw toArray()).
//
// Contract under test (mirrors loadAllLocations, locationStore.ts L136-147):
//   - one whole-store toArray() read
//   - per-row HighlightRecordSchema/NoteRecordSchema.safeParse
//   - corrupt rows DROPPED silently (STATE-04 never-coerce — local reads drop
//     quietly; bundle records refuse loudly, per the shared-pattern note)
//   - plain-array return (NOT the per-article HighlightsLoadResult union)
//
// Harness mirrors tests/unit/ingestion-tags.test.ts L16-50: fake-indexeddb via
// Dexie.dependencies at module top-level, wipeDatabase beforeEach, lazy module
// imports so the stores' module bodies see a populated Dexie.dependencies.
import { beforeEach, describe, expect, it } from "vitest";
import {
  HighlightRecordSchema,
  NoteRecordSchema,
} from "../../../src/content/schema";
import type {
  HighlightRecord,
  NoteRecord,
} from "../../../src/content/schema";
import type {
  HighlightRecordRow,
  NoteRecordRow,
} from "../../../src/persistence/db";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";

// Dexie 4 captures `indexedDB` + `IDBKeyRange` on `Dexie.dependencies` at
// dexie-module-load time. Install BOTH onto `Dexie.dependencies` (the
// Dexie-internal read path) AND `globalThis` (the direct-read path Dexie
// uses for deleteDatabase) at this module's top-level — the documented
// Dexie + Node test pattern (mirrors tests/unit/ingestion-tags.test.ts).
Dexie.dependencies.indexedDB = fakeIndexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
(globalThis as { indexedDB?: typeof fakeIndexedDB }).indexedDB = fakeIndexedDB;
(globalThis as { IDBKeyRange?: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;

async function wipeDatabase(): Promise<void> {
  await new Promise<void>((resolve) => {
    const idb = (globalThis as { indexedDB?: typeof fakeIndexedDB }).indexedDB;
    if (!idb) return resolve();
    const req = idb.deleteDatabase("lem-reader");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

// Lazy imports — the modules under test are imported AFTER the fake-indexeddb
// install so their module-body top-level sees a populated Dexie.dependencies.
async function loadHighlightsStore() {
  return await import("../../../src/persistence/highlightsStore");
}
async function loadNotesStore() {
  return await import("../../../src/persistence/notesStore");
}
async function loadDb() {
  return await import("../../../src/persistence/db");
}

// Schema-valid records (the fixture IS validated at build time).
function sampleHighlight(overrides: Partial<HighlightRecord> = {}): HighlightRecord {
  return HighlightRecordSchema.parse({
    schemaVersion: 1,
    id: "hl-1",
    articleId: "article-a",
    revision: 1,
    position: { start: 0, end: 6 },
    quote: { prefix: "", exact: "epsilon zeta eta", suffix: "" },
    createdAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  });
}

function sampleNote(overrides: Partial<NoteRecord> = {}): NoteRecord {
  return NoteRecordSchema.parse({
    schemaVersion: 1,
    id: "note-1",
    highlightId: "hl-1",
    text: "a reader note",
    updatedAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  });
}

describe("loadAllHighlights (09-02 Task 2)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("returns every valid HighlightRecord and silently drops corrupt rows (STATE-04)", async () => {
    const { loadAllHighlights } = await loadHighlightsStore();
    const { db } = await loadDb();

    const valid1 = sampleHighlight({ id: "hl-valid-1" });
    const valid2 = sampleHighlight({ id: "hl-valid-2", articleId: "article-b" });
    await db.highlights.put(valid1);
    await db.highlights.put(valid2);
    // Corrupt row: missing the required `quote` selector entirely.
    await db.highlights.put({
      schemaVersion: 1,
      id: "hl-corrupt",
      articleId: "article-a",
      revision: 1,
      position: { start: 0, end: 2 },
      createdAt: "2026-08-15T00:00:00.000Z",
    } as unknown as HighlightRecordRow);

    const all = await loadAllHighlights();
    expect(Array.isArray(all)).toBe(true);
    expect(all).toHaveLength(2);
    expect(all.map((h) => h.id).sort()).toEqual(["hl-valid-1", "hl-valid-2"]);
    // The corrupt row is silently absent — never coerced, never thrown.
    expect(all.map((h) => h.id)).not.toContain("hl-corrupt");
  });

  it("returns the parsed records as a plain array (whole-library contract, not the per-article LoadResult union)", async () => {
    const { loadAllHighlights } = await loadHighlightsStore();
    const { db } = await loadDb();

    const valid = sampleHighlight({ id: "hl-only" });
    await db.highlights.put(valid);

    const all = await loadAllHighlights();
    // A plain HighlightRecord[] — no { ok, highlights } envelope anywhere.
    expect(all).toEqual([valid]);
    expect((all as unknown as { ok?: unknown }).ok).toBeUndefined();
  });

  it("returns [] on an empty store (fresh DB)", async () => {
    const { loadAllHighlights } = await loadHighlightsStore();
    expect(await loadAllHighlights()).toEqual([]);
  });
});

describe("loadAllNotes (09-02 Task 2)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("returns every valid NoteRecord and silently drops corrupt rows (STATE-04)", async () => {
    const { loadAllNotes } = await loadNotesStore();
    const { db } = await loadDb();

    const valid = sampleNote({ id: "note-valid" });
    await db.notes.put(valid);
    // Corrupt row: missing the required `text` field.
    await db.notes.put({
      schemaVersion: 1,
      id: "note-corrupt",
      highlightId: "hl-1",
      updatedAt: "2026-08-15T00:00:00.000Z",
    } as unknown as NoteRecordRow);

    const all = await loadAllNotes();
    expect(Array.isArray(all)).toBe(true);
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe("note-valid");
  });

  it("returns the parsed records as a plain array (whole-library contract)", async () => {
    const { loadAllNotes } = await loadNotesStore();
    const { db } = await loadDb();

    const valid = sampleNote({ id: "note-only" });
    await db.notes.put(valid);

    const all = await loadAllNotes();
    expect(all).toEqual([valid]);
  });

  it("returns [] on an empty store (fresh DB)", async () => {
    const { loadAllNotes } = await loadNotesStore();
    expect(await loadAllNotes()).toEqual([]);
  });
});
