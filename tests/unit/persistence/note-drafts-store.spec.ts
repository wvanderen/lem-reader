// tests/unit/persistence/note-drafts-store.spec.ts
// Issue #178 — the noteDrafts seam + the deleteHighlight cascade, proven
// against the real Dexie schema over fake-indexeddb (the migration-spec
// registry pattern; the store seams are thin — the meaningful risks are the
// schema round-trip, the corrupt-row contract, and the atomic cascade):
//
//   1. saveNoteDraft/loadNoteDraft round-trip; the highlightId primary key
//      means one draft per highlight (a newer edit replaces in place).
//   2. A corrupt row reads as "no draft" (null) — never a corrupt record.
//   3. deleteHighlight cascade-deletes the highlight, its note, AND its
//      recovery draft in the one transaction — every confirmed deletion
//      path funnels through this seam; a draft for a DIFFERENT highlight
//      is untouched (recovery is scoped to the original highlight).
import { beforeEach, describe, expect, it } from "vitest";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";

// Dexie captures `indexedDB` + `IDBKeyRange` at construction time. Install
// BOTH onto `Dexie.dependencies` AND `globalThis` at this module's
// top-level — then import the modules under test LAZY (the assets-cascade
// precedent) so their module-body singletons construct with the fake API.
Dexie.dependencies.indexedDB = fakeIndexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
(globalThis as { indexedDB?: typeof fakeIndexedDB }).indexedDB = fakeIndexedDB;
(globalThis as { IDBKeyRange?: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;

const { db } = await import("../../../src/persistence/db");
const { loadNoteDraft, saveNoteDraft, deleteNoteDraft } =
  await import("../../../src/persistence/noteDraftsStore");
const { deleteHighlight } = await import("../../../src/persistence/highlightsStore");

async function wipeDatabase(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = fakeIndexedDB.deleteDatabase("lem-reader");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

const highlightRow = (id: string) => ({
  schemaVersion: 1 as const,
  id,
  articleId: "draft-store-article",
  revision: 1,
  position: { start: 0, end: 5 },
  quote: { prefix: "", exact: "Hello", suffix: " world." },
  createdAt: "2026-10-01T00:00:00.000Z",
});

const noteRow = (highlightId: string, text: string) => ({
  schemaVersion: 1 as const,
  id: `note-${highlightId}`,
  highlightId,
  text,
  updatedAt: "2026-10-01T00:00:00.000Z",
});

const draftRow = (highlightId: string, text: string, updatedAt = "2026-10-02T00:00:00.000Z") => ({
  schemaVersion: 1 as const,
  highlightId,
  text,
  updatedAt,
});

beforeEach(async () => {
  await wipeDatabase();
  await db.open();
  await db.highlights.bulkPut([highlightRow("hl-a"), highlightRow("hl-b")]);
});

describe("noteDraftsStore (issue #178)", () => {
  it("round-trips a draft and keeps one row per highlight (newer edits replace in place)", async () => {
    expect(await loadNoteDraft("hl-a")).toBeNull();
    await saveNoteDraft(draftRow("hl-a", "first pending words"));
    expect((await loadNoteDraft("hl-a"))?.text).toBe("first pending words");
    await saveNoteDraft(draftRow("hl-a", "latest pending words", "2026-10-02T01:00:00.000Z"));
    expect(await db.noteDrafts.count()).toBe(1);
    expect((await loadNoteDraft("hl-a"))?.text).toBe("latest pending words");
    // Scoped reads: another highlight's absence is its own answer.
    expect(await loadNoteDraft("hl-b")).toBeNull();
  });

  it("retirement of an inspected draft cannot delete a newer stored version", async () => {
    const old = draftRow("hl-a", "old");
    await saveNoteDraft(old);
    const latest = draftRow("hl-a", "new", "2026-10-03T00:00:00.000Z");
    await saveNoteDraft(latest);
    await deleteNoteDraft("hl-a", old);
    expect(await loadNoteDraft("hl-a")).toEqual(latest);
    await deleteNoteDraft("hl-a", latest);
    expect(await loadNoteDraft("hl-a")).toBeNull();
  });

  it("a corrupt row reads as no draft (null), and a missing-row delete is a no-op", async () => {
    await db.noteDrafts.put({
      schemaVersion: 1,
      highlightId: "hl-a",
      text: 42 as unknown as string,
      updatedAt: "not-a-datetime",
    });
    expect(await loadNoteDraft("hl-a")).toBeNull();
    await expect(deleteNoteDraft("hl-a")).resolves.toBeUndefined();
  });
});

describe("deleteHighlight cascade (issue #178)", () => {
  it("removes the highlight, its note, AND its recovery draft in one transaction", async () => {
    await db.notes.bulkPut([noteRow("hl-a", "landed note"), noteRow("hl-b", "other note")]);
    await db.noteDrafts.bulkPut([
      draftRow("hl-a", "pending draft"),
      draftRow("hl-b", "other draft"),
    ]);

    await deleteHighlight("hl-a");

    expect(await db.highlights.get("hl-a")).toBeUndefined();
    expect(await db.notes.get("note-hl-a")).toBeUndefined();
    expect(await db.noteDrafts.get("hl-a")).toBeUndefined();
    // The sibling highlight's note + draft are untouched — recovery stays
    // scoped to the original highlight.
    expect(await db.notes.get("note-hl-b")).toBeDefined();
    expect((await db.noteDrafts.get("hl-b"))?.text).toBe("other draft");
  });

  it("keeps the draft when only the note was deleted by a cleared save (no highlight delete)", async () => {
    await db.notes.put(noteRow("hl-a", "landed note"));
    await db.noteDrafts.put(draftRow("hl-a", "pending draft"));
    // The empty-text save path (deleteNote) never touches the draft store —
    // only a landed save's identity-gated cleanup or a confirmed highlight
    // deletion may discard the row.
    await db.notes.where("highlightId").equals("hl-a").delete();
    expect(await db.noteDrafts.get("hl-a")).toBeDefined();
  });
});
