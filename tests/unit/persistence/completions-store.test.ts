// tests/unit/persistence/completions-store.test.ts
// Issue #246 — the completionsStore seam truths (the collections-store
// harness: fake-indexeddb via Dexie.dependencies at module top-level,
// wipeDatabase beforeEach, lazy module imports):
//
//   - recordCompletion upserts ONE row per target — a correction REPLACES
//     the earlier state (no completion history; the issue #246 AC), and the
//     canonical location store is untouched by every write here (ADR 0001 —
//     the correction must not erase or move the saved passage position).
//   - A book-chapter target and its chapter article normalize onto ONE row
//     (completionTargetKey — one reading, one truth): either shape's write
//     supersedes the other's.
//   - Reads validate at the boundary: rows failing CompletionRecordSchema
//     OR carrying a targetKey that disagrees with their computed identity
//     are dropped calmly (the STATE-04 discipline — corrupt rows never
//     masquerade as completion truth).
//   - A storage failure propagates (the caller's honest save-error state —
//     never a silent half-write).
//   - removeCompletionsForDeletedWork strips exactly the deleted work's
//     rows (article deletion: the article key + its work-chapter keys; book
//     deletion: the book key + every declared chapter's article key) and
//     leaves every other row untouched — the #245 reference-cleanup
//     discipline extended to completion records.
import { beforeEach, describe, expect, it } from "vitest";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";
import type { CollectionEntryTarget } from "../../../src/content/schema";

// Dexie 4 captures `indexedDB` + `IDBKeyRange` on `Dexie.dependencies` at
// dexie-module-load time. Install BOTH onto `Dexie.dependencies` (the
// Dexie-internal read path) AND `globalThis` (the direct-read path Dexie
// uses for deleteDatabase) — the collections-store.test.ts harness verbatim.
Dexie.dependencies.indexedDB = fakeIndexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
(globalThis as { indexedDB?: typeof fakeIndexedDB }).indexedDB = fakeIndexedDB;
(globalThis as { IDBKeyRange?: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;

const articleTarget: CollectionEntryTarget = { kind: "article", articleId: "story-1" };
const workChapterTarget: CollectionEntryTarget = {
  kind: "work-chapter",
  articleId: "story-1",
  destinationId: "ch-0.b",
};
const bookChapterTarget: CollectionEntryTarget = {
  kind: "book-chapter",
  bookId: "epub-aaaaaaaaaaaa",
  articleId: "epub-ch-1",
};

async function wipeDatabase(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = fakeIndexedDB.deleteDatabase("lem-reader");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

describe("completionsStore (issue #246)", () => {
  beforeEach(wipeDatabase);

  async function load() {
    const db = await import("../../../src/persistence/db");
    const store = await import("../../../src/persistence/completionsStore");
    return { db: db.db, ...store };
  }

  it("recordCompletion upserts one row per target and replaces the earlier state (no history)", async () => {
    const { db, recordCompletion, loadAllCompletions, getCompletion } = await load();
    await recordCompletion(articleTarget, true, "reader");
    const first = await getCompletion(articleTarget);
    expect(first?.finished).toBe(true);
    expect(first?.source).toBe("reader");
    expect(first?.targetKey).toBe("article:story-1");
    expect(db.location.toArray).toBeDefined();
    // Locations are untouched: the correction moved nothing (ADR 0001).
    expect(await db.location.count()).toBe(0);

    // The correction replaces — one row, the newest state.
    await recordCompletion(articleTarget, false, "reader");
    const all = await loadAllCompletions();
    expect(all).toHaveLength(1);
    expect(all[0]?.finished).toBe(false);
    expect(await db.completions.count()).toBe(1);
  });

  it("a book-chapter target and its chapter article share ONE row", async () => {
    const { recordCompletion, getCompletion } = await load();
    await recordCompletion(bookChapterTarget, true, "reader");
    const viaArticle = await getCompletion({ kind: "article", articleId: "epub-ch-1" });
    expect(viaArticle?.finished).toBe(true);
    // The article-shaped correction supersedes the same row.
    await recordCompletion({ kind: "article", articleId: "epub-ch-1" }, false, "reader");
    const viaChapter = await getCompletion(bookChapterTarget);
    expect(viaChapter?.finished).toBe(false);
  });

  it("reads drop corrupt rows calmly — schema failures AND identity mismatches", async () => {
    const { db, recordCompletion, loadAllCompletions, getCompletion } = await load();
    await recordCompletion(articleTarget, true, "reading");
    await recordCompletion(workChapterTarget, true, "reading");
    // A schema-invalid row (missing updatedAt) …
    await db.completions.put({
      schemaVersion: 1,
      targetKey: "article:broken-1",
      target: { kind: "article", articleId: "broken-1" },
      finished: true,
      source: "reader",
    } as unknown as import("../../../src/content/schema").CompletionRecord);
    // … and a row whose targetKey disagrees with its target (tampered key).
    await db.completions.put({
      schemaVersion: 1,
      targetKey: "article:someone-else",
      target: { kind: "article", articleId: "impostor" },
      finished: true,
      source: "reader",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as unknown as import("../../../src/content/schema").CompletionRecord);
    const all = await loadAllCompletions();
    expect(all.map((r) => r.targetKey).sort()).toEqual([
      "article:story-1",
      "work-chapter:story-1/ch-0.b",
    ]);
    expect(await getCompletion({ kind: "article", articleId: "impostor" })).toBeNull();
  });

  it("a storage failure propagates — an honest failed write, never a silent half-save", async () => {
    const { db, recordCompletion } = await load();
    // Registered via hook("creating", fn) and deregistered via
    // hook("creating").unsubscribe(fn) (the books-store cross-test-bleed
    // guard).
    const injectedCreatingHook = () => {
      throw new Error("disk full");
    };
    db.completions.hook("creating", injectedCreatingHook);
    try {
      await expect(recordCompletion(articleTarget, true, "reader")).rejects.toThrow("disk full");
    } finally {
      db.completions.hook("creating").unsubscribe(injectedCreatingHook);
    }
  });

  it("removeCompletionsForDeletedWork strips the deleted article's rows inside the caller's transaction", async () => {
    const { db, recordCompletion, loadAllCompletions, removeCompletionsForDeletedWork } =
      await load();
    await recordCompletion(articleTarget, true, "reading"); // article:story-1
    await recordCompletion(workChapterTarget, true, "reading"); // work-chapter:story-1/ch-0.b
    await recordCompletion({ kind: "book", bookId: "epub-bbbbbbbbbbbb" }, true, "reader");
    await recordCompletion(bookChapterTarget, true, "reader"); // article:epub-ch-1

    await db.transaction("rw", [db.completions], async () => {
      await removeCompletionsForDeletedWork({ kind: "article", articleId: "story-1" });
    });
    const remaining = await loadAllCompletions();
    expect(remaining.map((r) => r.targetKey).sort()).toEqual([
      "article:epub-ch-1",
      "book:epub-bbbbbbbbbbbb",
    ]);
  });

  it("removeCompletionsForDeletedWork strips a deleted book's row and its chapters' rows", async () => {
    const { db, recordCompletion, loadAllCompletions, removeCompletionsForDeletedWork } =
      await load();
    await recordCompletion({ kind: "book", bookId: "epub-aaaaaaaaaaaa" }, true, "reader");
    await recordCompletion(bookChapterTarget, true, "reader"); // article:epub-ch-1
    await recordCompletion({ kind: "article", articleId: "story-1" }, true, "reading");

    await db.transaction("rw", [db.completions], async () => {
      await removeCompletionsForDeletedWork({
        kind: "book",
        bookId: "epub-aaaaaaaaaaaa",
        chapterArticleIds: ["epub-ch-1", "epub-ch-2"],
      });
    });
    const remaining = await loadAllCompletions();
    expect(remaining.map((r) => r.targetKey)).toEqual(["article:story-1"]);
  });
});
