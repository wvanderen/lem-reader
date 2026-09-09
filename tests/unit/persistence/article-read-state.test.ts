import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";
import { ArticleSchema } from "../../../src/content/schema";
import { graphemeClusters, normalizeText } from "../../../src/content/normalizeText";

Dexie.dependencies.indexedDB = fakeIndexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
Object.assign(globalThis, { indexedDB: fakeIndexedDB, IDBKeyRange });

const { db } = await import("../../../src/persistence/db");
const { loadLocation, loadAllLocations, saveLocation, setArticleReadState } =
  await import("../../../src/persistence/locationStore");

function article(text = "A reader 👩🏽‍💻 enjoys café.") {
  return ArticleSchema.parse({
    id: "read-state-article",
    revision: 2,
    lang: "en",
    provenance: {
      title: "A reader",
      retrievedAt: "2026-09-08T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "0".repeat(64),
    },
    blocks: [{ kind: "paragraph", content: [{ text, marks: [] }] }],
    footnotes: [],
  });
}

beforeEach(async () => {
  await db.location.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("explicit article reading state", () => {
  it("marks the current revision read at its normalized grapheme end", async () => {
    const target = article();
    await setArticleReadState(target, true);
    const result = await loadLocation(target.id, target.revision);
    expect(result).toMatchObject({
      ok: true,
      location: {
        articleId: target.id,
        revision: 2,
        graphemeOffset: graphemeClusters(normalizeText(target), target.lang).length,
      },
    });
  });

  it("uses a positive end marker for documents without normalized text", async () => {
    const target = { ...article(), blocks: [] };
    await setArticleReadState(target, true);
    expect(await loadLocation(target.id, 2)).toMatchObject({
      ok: true,
      location: { graphemeOffset: 1 },
    });
  });

  it("marks unread by removing every revision while retaining other articles", async () => {
    const target = article();
    for (const [articleId, revision] of [
      [target.id, 1],
      [target.id, 2],
      ["other-article", 1],
    ] as const) {
      await saveLocation({
        schemaVersion: 1,
        articleId,
        revision,
        graphemeOffset: 10,
        savedAt: "2026-09-08T00:00:00.000Z",
      });
    }
    await setArticleReadState(target, false);
    expect(await loadAllLocations()).toEqual([
      expect.objectContaining({ articleId: "other-article" }),
    ]);
    await setArticleReadState(target, false);
    expect(await loadLocation(target.id, 2)).toEqual({ ok: true, location: null });
  });

  it("propagates write failure so the library can retain state and show an error", async () => {
    vi.spyOn(db.location, "put").mockRejectedValueOnce(new Error("Storage unavailable"));
    await expect(setArticleReadState(article(), true)).rejects.toThrow("Storage unavailable");
    expect(await loadAllLocations()).toEqual([]);
  });

  it("propagates deletion failure without falsely clearing the saved location", async () => {
    const target = article();
    await setArticleReadState(target, true);
    const rejectDelete = () => {
      throw new Error("Cannot update storage");
    };
    db.location.hook("deleting", rejectDelete);
    try {
      await expect(setArticleReadState(target, false)).rejects.toThrow("Cannot update storage");
      expect(await loadLocation(target.id, target.revision)).toMatchObject({
        ok: true,
        location: { revision: 2 },
      });
    } finally {
      db.location.hook("deleting").unsubscribe(rejectDelete);
    }
  });
});
