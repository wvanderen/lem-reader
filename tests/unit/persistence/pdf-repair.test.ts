import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";
import { ArticleSchema } from "../../../src/content/schema";

Dexie.dependencies.indexedDB = fakeIndexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
Object.assign(globalThis, { indexedDB: fakeIndexedDB, IDBKeyRange });

const original = ArticleSchema.parse({
  id: "damaged-pdf",
  revision: 1,
  lang: "en",
  provenance: {
    title: "Saved PDF",
    originalHtmlHash: "same-source-bytes",
    retrievedAt: "2026-01-01T00:00:00Z",
  },
  blocks: [
    {
      kind: "heading",
      level: 2,
      content: [{ text: "An ordinary paragraph was wrongly promoted.", marks: [] }],
    },
    { kind: "paragraph", content: [{ text: "The rest of the work stays unchanged.", marks: [] }] },
  ],
});
const corrected = ArticleSchema.parse({
  ...original,
  id: "new-intake-id",
  blocks: [{ ...original.blocks[0], kind: "paragraph" }, original.blocks[1]],
});

beforeEach(async () => {
  const { db } = await import("../../../src/persistence/db");
  await db.open();
});

afterEach(async () => {
  const { db } = await import("../../../src/persistence/db");
  await db.delete();
});

describe("explicit PDF structural repair", () => {
  it("preserves completion and collection meaning for an exactly corresponding chapter", async () => {
    const { db } = await import("../../../src/persistence/db");
    const { completionTargetKey } = await import("../../../src/content/completion");
    const { previewPdfRepair, applyPdfRepair, recoverPdfRepair } =
      await import("../../../src/persistence/pdfRepairStore");
    const work = ArticleSchema.parse({
      ...original,
      blocks: [
        { kind: "heading", level: 2, content: [{ text: "Reliable chapter", marks: [] }] },
        original.blocks[1],
        { ...original.blocks[0], level: 3 },
      ],
    });
    const candidate = ArticleSchema.parse({
      ...work,
      blocks: [work.blocks[0], work.blocks[1], { ...corrected.blocks[0] }],
    });
    await db.articles.put(work);
    const target = { kind: "work-chapter" as const, articleId: work.id, destinationId: "ch-0.b" };
    const stamp = "2026-01-01T00:00:00Z";
    const completion = {
      schemaVersion: 1 as const,
      targetKey: completionTargetKey(target),
      target,
      finished: true,
      source: "reader" as const,
      updatedAt: stamp,
    };
    const collection = {
      schemaVersion: 1 as const,
      id: "stable-plan",
      name: "Stable plan",
      entries: [{ id: "stable-chapter", target, addedAt: stamp }],
      createdAt: stamp,
      updatedAt: stamp,
    };
    await db.completions.put(completion);
    await db.collections.put(collection);
    const preview = await previewPdfRepair(work.id, candidate);
    expect(preview.consequences).toEqual([]);
    await applyPdfRepair(preview);
    expect(await db.completions.get(completion.targetKey)).toEqual(completion);
    expect(await db.collections.get(collection.id)).toEqual(collection);
    await db.articles.update(work.id, { readerTitle: "Later title edit" });
    await recoverPdfRepair(work.id);
    expect((await db.articles.get(work.id))!.readerTitle).toBe("Later title edit");
    expect((await db.articles.get(work.id))!.blocks).toEqual(work.blocks);
    expect(await db.completions.get(completion.targetKey)).toEqual(completion);
    expect(await db.collections.get(collection.id)).toEqual(collection);
  });

  it("does not let an earlier lazy structure write overwrite an explicit repair", async () => {
    const { db } = await import("../../../src/persistence/db");
    const { saveWorkStructure } = await import("../../../src/persistence/structureStore");
    const { deriveWorkStructure } = await import("../../../src/content/structure");
    const { previewPdfRepair, applyPdfRepair } =
      await import("../../../src/persistence/pdfRepairStore");
    await db.articles.put(original);
    const delayed = deriveWorkStructure(original)!;
    await applyPdfRepair(await previewPdfRepair(original.id, corrected));
    const repaired = await db.articles.get(original.id);
    await saveWorkStructure(original.id, original.revision, delayed);
    expect((await db.articles.get(original.id))!.structure).toEqual(repaired!.structure);
  });

  it("removes recovery data with an explicitly deleted work", async () => {
    const { db } = await import("../../../src/persistence/db");
    const { dexieLibrarySource } = await import("../../../src/ingestion/LibrarySource");
    const { previewPdfRepair, applyPdfRepair, hasPdfRepairRecovery } =
      await import("../../../src/persistence/pdfRepairStore");
    await db.articles.put(original);
    await applyPdfRepair(await previewPdfRepair(original.id, corrected));
    await dexieLibrarySource.remove(original.id);
    expect(await hasPdfRepairRecovery(original.id)).toBe(false);
  });

  it("refuses a different PDF or changed text without guessing annotation correspondence", async () => {
    const { db } = await import("../../../src/persistence/db");
    const { previewPdfRepair } = await import("../../../src/persistence/pdfRepairStore");
    await db.articles.put(original);
    await expect(
      previewPdfRepair(original.id, {
        ...corrected,
        provenance: { ...corrected.provenance, originalHtmlHash: "different-bytes" },
      }),
    ).rejects.toThrow(/fingerprint/);
    await expect(
      previewPdfRepair(original.id, {
        ...corrected,
        blocks: [
          { kind: "paragraph", content: [{ text: "Different text", marks: [] }] },
          corrected.blocks[1]!,
        ],
      }),
    ).rejects.toThrow(/text has changed/);
    expect(ArticleSchema.parse(await db.articles.get(original.id))).toEqual(original);
  });

  it("rolls back both application and recovery when storage fails, retaining the recovery version", async () => {
    const { db } = await import("../../../src/persistence/db");
    const { previewPdfRepair, applyPdfRepair, recoverPdfRepair, hasPdfRepairRecovery } =
      await import("../../../src/persistence/pdfRepairStore");
    await db.articles.put(original);
    const preview = await previewPdfRepair(original.id, corrected);
    const fail = () => {
      throw new Error("disk full");
    };
    db.articles.hook("updating", fail);
    try {
      await expect(applyPdfRepair(preview)).rejects.toThrow("disk full");
    } finally {
      db.articles.hook("updating").unsubscribe(fail);
    }
    expect(ArticleSchema.parse(await db.articles.get(original.id))).toEqual(original);
    expect(await hasPdfRepairRecovery(original.id)).toBe(false);
    await applyPdfRepair(preview);
    db.articles.hook("updating", fail);
    try {
      await expect(recoverPdfRepair(original.id)).rejects.toThrow("disk full");
    } finally {
      db.articles.hook("updating").unsubscribe(fail);
    }
    expect((await db.articles.get(original.id))!.blocks).toEqual(corrected.blocks);
    expect(await hasPdfRepairRecovery(original.id)).toBe(true);
    await recoverPdfRepair(original.id);
    expect(ArticleSchema.parse(await db.articles.get(original.id))).toEqual(original);
  });

  it("does not treat old consent as acceptance of newly affected reader data", async () => {
    const { db } = await import("../../../src/persistence/db");
    const { previewPdfRepair, applyPdfRepair } =
      await import("../../../src/persistence/pdfRepairStore");
    await db.articles.put(original);
    const preview = await previewPdfRepair(original.id, corrected);
    await db.completions.put({
      schemaVersion: 1,
      targetKey: "new-completion",
      target: { kind: "work-chapter", articleId: original.id, destinationId: "ch-0.b" },
      finished: true,
      source: "reader",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    await expect(applyPdfRepair(preview, { acceptConsequences: true })).rejects.toThrow(
      /Reader data changed/,
    );
    expect(ArticleSchema.parse(await db.articles.get(original.id))).toEqual(original);
    expect(await db.completions.get("new-completion")).toBeDefined();
  });

  it("rejects a stale preview rather than overwriting a concurrent metadata edit", async () => {
    const { db } = await import("../../../src/persistence/db");
    const { previewPdfRepair, applyPdfRepair } =
      await import("../../../src/persistence/pdfRepairStore");
    await db.articles.put(original);
    const preview = await previewPdfRepair(original.id, corrected);
    await db.articles.update(original.id, { readerTitle: "My new title" });
    await expect(applyPdfRepair(preview)).rejects.toThrow(/changed after the preview/);
    expect((await db.articles.get(original.id))!.readerTitle).toBe("My new title");
    expect((await db.articles.get(original.id))!.blocks).toEqual(original.blocks);
  });
  it("blocks changed chapter completion and collection references until their concrete consequences are accepted", async () => {
    const { db } = await import("../../../src/persistence/db");
    const { previewPdfRepair, applyPdfRepair } =
      await import("../../../src/persistence/pdfRepairStore");
    await db.articles.put(original);
    const target = {
      kind: "work-chapter" as const,
      articleId: original.id,
      destinationId: "ch-0.b",
    };
    await db.completions.put({
      schemaVersion: 1,
      targetKey: "chapter-finished",
      target,
      finished: true,
      source: "reader",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    await db.collections.put({
      schemaVersion: 1,
      id: "reading-plan",
      name: "My plan",
      entries: [{ id: "chapter-entry", target, addedAt: "2026-01-01T00:00:00Z" }],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    const preview = await previewPdfRepair(original.id, corrected);
    expect(preview.consequences.map((item) => item.kind)).toEqual([
      "completion",
      "collection-entry",
    ]);
    await expect(applyPdfRepair(preview)).rejects.toThrow(/accept/i);
    expect(ArticleSchema.parse(await db.articles.get(original.id))).toEqual(original);
    expect((await db.collections.get("reading-plan"))!.entries).toHaveLength(1);
    expect(await db.completions.get("chapter-finished")).toBeDefined();
  });
  it("accepts only the disclosed removals, preserves other targets, and recovers chapter state", async () => {
    const { db } = await import("../../../src/persistence/db");
    const { previewPdfRepair, applyPdfRepair, recoverPdfRepair } =
      await import("../../../src/persistence/pdfRepairStore");
    await db.articles.put(original);
    const target = {
      kind: "work-chapter" as const,
      articleId: original.id,
      destinationId: "ch-0.b",
    };
    const completion = {
      schemaVersion: 1 as const,
      targetKey: "chapter-finished",
      target,
      finished: true,
      source: "reader" as const,
      updatedAt: "2026-01-01T00:00:00Z",
    };
    const collection = {
      schemaVersion: 1 as const,
      id: "reading-plan",
      name: "My plan",
      entries: [
        { id: "chapter-entry", target, addedAt: completion.updatedAt },
        {
          id: "whole-work",
          target: { kind: "article" as const, articleId: original.id },
          addedAt: completion.updatedAt,
        },
      ],
      createdAt: completion.updatedAt,
      updatedAt: completion.updatedAt,
    };
    const active = {
      schemaVersion: 1 as const,
      collectionId: collection.id,
      entryId: "chapter-entry",
      updatedAt: completion.updatedAt,
    };
    await db.completions.put(completion);
    await db.collections.put(collection);
    await db.collectionActiveEntries.put(active);
    const preview = await previewPdfRepair(original.id, corrected);
    const fail = () => {
      throw new Error("collection write failed");
    };
    db.collections.hook("updating", fail);
    try {
      await expect(applyPdfRepair(preview, { acceptConsequences: true })).rejects.toThrow(
        "collection write failed",
      );
    } finally {
      db.collections.hook("updating").unsubscribe(fail);
    }
    expect(await db.completions.get(completion.targetKey)).toEqual(completion);
    expect(await db.collections.get(collection.id)).toEqual(collection);
    expect(await db.collectionActiveEntries.get(collection.id)).toEqual(active);
    expect(ArticleSchema.parse(await db.articles.get(original.id))).toEqual(original);
    await applyPdfRepair(preview, { acceptConsequences: true });
    expect(await db.completions.get(completion.targetKey)).toBeUndefined();
    expect((await db.collections.get(collection.id))!.entries.map((e) => e.id)).toEqual([
      "whole-work",
    ]);
    expect(await db.collectionActiveEntries.get(collection.id)).toBeUndefined();
    db.collections.hook("updating", fail);
    try {
      await expect(recoverPdfRepair(original.id)).rejects.toThrow("collection write failed");
    } finally {
      db.collections.hook("updating").unsubscribe(fail);
    }
    expect(await db.completions.get(completion.targetKey)).toBeUndefined();
    expect((await db.collections.get(collection.id))!.entries.map((e) => e.id)).toEqual([
      "whole-work",
    ]);
    expect((await db.articles.get(original.id))!.blocks).toEqual(corrected.blocks);
    await recoverPdfRepair(original.id);
    expect(await db.completions.get(completion.targetKey)).toEqual(completion);
    expect(await db.collections.get(collection.id)).toEqual(collection);
    expect(await db.collectionActiveEntries.get(collection.id)).toEqual(active);
    expect(ArticleSchema.parse(await db.articles.get(original.id))).toEqual(original);
  });

  it("previews without mutation, applies without replacing identity or reader data, and recovers", async () => {
    const { db } = await import("../../../src/persistence/db");
    const { previewPdfRepair, applyPdfRepair, recoverPdfRepair } =
      await import("../../../src/persistence/pdfRepairStore");
    await db.articles.put(original);
    const location = {
      schemaVersion: 1 as const,
      articleId: original.id,
      revision: 1,
      graphemeOffset: 15,
      savedAt: "2026-01-01T00:00:00Z",
    };
    const highlight = {
      schemaVersion: 1 as const,
      id: "saved-highlight",
      articleId: original.id,
      revision: 1,
      position: { start: 3, end: 11 },
      quote: { prefix: "An ", exact: "ordinary", suffix: " paragraph" },
      createdAt: location.savedAt,
    };
    await db.location.put(location);
    await db.highlights.put(highlight);
    await db.notes.put({
      schemaVersion: 1,
      id: "saved-note",
      highlightId: highlight.id,
      text: "Keep this note",
      updatedAt: location.savedAt,
    });
    const preview = await previewPdfRepair(original.id, corrected);
    expect(preview.changes).toEqual([{ blockIndex: 0, before: "heading", after: "paragraph" }]);
    expect(ArticleSchema.parse(await db.articles.get(original.id))).toEqual(original);
    await applyPdfRepair(preview);
    const repaired = ArticleSchema.parse(await db.articles.get(original.id));
    expect(repaired.id).toBe(original.id);
    expect(repaired.blocks[0]!.kind).toBe("paragraph");
    expect(await db.location.get([original.id, 1])).toEqual(location);
    expect(await db.highlights.get(highlight.id)).toEqual(highlight);
    expect((await db.notes.get("saved-note"))!.text).toBe("Keep this note");
    await recoverPdfRepair(original.id);
    expect(ArticleSchema.parse(await db.articles.get(original.id))).toEqual(original);
    expect(await db.location.get([original.id, 1])).toEqual(location);
    expect(await db.highlights.get(highlight.id)).toEqual(highlight);
    expect((await db.notes.get("saved-note"))!.text).toBe("Keep this note");
  });
});
