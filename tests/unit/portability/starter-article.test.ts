import { beforeEach, describe, expect, it } from "vitest";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";
import { unzipSync, strFromU8, strToU8, zipSync } from "fflate";

Dexie.dependencies.indexedDB = fakeIndexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
globalThis.indexedDB = fakeIndexedDB;
globalThis.IDBKeyRange = IDBKeyRange;

const skip = {
  book: "skip",
  "article-revision": "skip",
  "article-content-divergence": "skip",
  "article-metadata-override": "skip",
  "highlight-id": "skip",
  "note-id": "skip",
  location: "skip",
} as const;

async function clearData() {
  const { db } = await import("../../../src/persistence/db");
  await Promise.all(db.tables.map((table) => table.clear()));
}

async function exportRemovedStarter() {
  const { dexieLibrarySource } = await import("../../../src/ingestion/LibrarySource");
  const { buildBundle, validateBundle } =
    await import("../../../src/portability/ExportImportService");
  await dexieLibrarySource.remove("getting-started");
  const { bytes } = await buildBundle();
  const result = await validateBundle(new File([bytes], "library.zip"));
  if (!result.ok) throw new Error(JSON.stringify(result.refusal));
  return result;
}

async function importBundle(bundle: Awaited<ReturnType<typeof exportRemovedStarter>>["bundle"]) {
  const { detectImportPreview, resolveImportPlan } =
    await import("../../../src/portability/conflicts");
  const { applyImport } = await import("../../../src/portability/ExportImportService");
  const preview = await detectImportPreview(bundle);
  await applyImport(await resolveImportPlan(bundle, preview, skip, false));
}

describe("optional starter article", () => {
  beforeEach(clearData);

  it("stays removed after reopening storage, leaves an empty library, and restores explicitly", async () => {
    const { db } = await import("../../../src/persistence/db");
    const { compositeLibraryRepository: library, dexieLibrarySource } =
      await import("../../../src/ingestion/LibrarySource");
    const { restoreStarterArticle } = await import("../../../src/persistence/starterArticleStore");
    expect(await library.open("getting-started")).not.toBeNull();
    await dexieLibrarySource.remove("getting-started");
    db.close();
    await db.open();
    expect(await library.list()).toEqual([]);
    expect(await library.open("getting-started")).toBeNull();
    await restoreStarterArticle();
    expect((await library.list()).map((article) => article.id)).toEqual(["getting-started"]);
    expect(await library.open("getting-started")).not.toBeNull();
  });

  it("rolls back removal and its saved position when the choice write fails", async () => {
    const { db } = await import("../../../src/persistence/db");
    const { dexieLibrarySource } = await import("../../../src/ingestion/LibrarySource");
    const { isStarterRemoved } = await import("../../../src/persistence/starterArticleStore");
    await db.location.put({
      schemaVersion: 1,
      articleId: "getting-started",
      revision: 1,
      graphemeOffset: 1,
      savedAt: new Date().toISOString(),
    });
    const fail = () => {
      throw new Error("Storage failure");
    };
    db.settings.hook("creating", fail);
    try {
      await expect(dexieLibrarySource.remove("getting-started")).rejects.toThrow("Storage failure");
    } finally {
      db.settings.hook("creating").unsubscribe(fail);
    }
    expect(await isStarterRemoved()).toBe(false);
    expect(await db.location.count()).toBe(1);
  });

  it("exports v7 and imports removal on a fresh device without applying reading preferences", async () => {
    const { bundle } = await exportRemovedStarter();
    expect(bundle.schemaVersion).toBe(7);
    expect(bundle.starterRemoved).toBe(true);
    await clearData();
    await importBundle(bundle);
    const { isStarterRemoved } = await import("../../../src/persistence/starterArticleStore");
    expect(await isStarterRemoved()).toBe(true);
  });

  it("preserves an explicit local restore and an explicit local removal", async () => {
    const { bundle } = await exportRemovedStarter();
    const { restoreStarterArticle, isStarterRemoved } =
      await import("../../../src/persistence/starterArticleStore");
    await restoreStarterArticle();
    await importBundle(bundle);
    expect(await isStarterRemoved()).toBe(false);
    const { dexieLibrarySource } = await import("../../../src/ingestion/LibrarySource");
    await dexieLibrarySource.remove("getting-started");
    await importBundle({ ...bundle, starterRemoved: false });
    expect(await isStarterRemoved()).toBe(true);
  });

  it("preserves the default choice in an existing library and resets it with local data", async () => {
    const { bundle } = await exportRemovedStarter();
    await clearData();
    const { db } = await import("../../../src/persistence/db");
    const { libraryFixtures } = await import("../../../src/fixtures");
    await db.articles.put({ ...libraryFixtures[0]!, id: "existing-article" });
    await importBundle(bundle);
    const { isStarterRemoved } = await import("../../../src/persistence/starterArticleStore");
    expect(await isStarterRemoved()).toBe(false);
    const { dexieLibrarySource } = await import("../../../src/ingestion/LibrarySource");
    await dexieLibrarySource.remove("getting-started");
    await clearData();
    expect(await isStarterRemoved()).toBe(false);
  });

  it("detects tampering with the exported removal choice", async () => {
    const { buildBundle, validateBundle } =
      await import("../../../src/portability/ExportImportService");
    const { bytes } = await buildBundle();
    const entries = unzipSync(bytes);
    const bundle = JSON.parse(strFromU8(entries["bundle.json"]!));
    entries["bundle.json"] = strToU8(JSON.stringify({ ...bundle, starterRemoved: true }));
    const result = await validateBundle(new File([zipSync(entries)], "tampered.zip"));
    expect(result).toEqual({
      ok: false,
      refusal: { kind: "corrupted", failedBlocks: ["starterRemoved"] },
    });
  });

  it("keeps legacy imports from changing the local removal choice", async () => {
    const { bundle } = await exportRemovedStarter();
    const legacy = { ...bundle, schemaVersion: 6 as const };
    delete legacy.starterRemoved;
    await importBundle(legacy);
    const { isStarterRemoved } = await import("../../../src/persistence/starterArticleStore");
    expect(await isStarterRemoved()).toBe(true);
  });

  it("keeps a stored copy of the starter hidden until explicit restoration", async () => {
    await exportRemovedStarter();
    const { libraryFixtures } = await import("../../../src/fixtures");
    const { dexieLibrarySource } = await import("../../../src/ingestion/LibrarySource");
    await dexieLibrarySource.save(libraryFixtures[0]!);
    const { compositeLibraryRepository: library } =
      await import("../../../src/ingestion/LibrarySource");
    expect(await library.list()).toEqual([]);
    expect(await library.open("getting-started")).toBeNull();
  });
});
