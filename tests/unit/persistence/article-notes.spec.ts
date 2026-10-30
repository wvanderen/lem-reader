import { beforeEach, expect, it } from "vitest";
import indexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";
Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
const { db } = await import("../../../src/persistence/db");
const { editArticleNote, loadArticleNotes, deleteArticleNote } =
  await import("../../../src/persistence/articleNotesStore");
const note = {
  schemaVersion: 1 as const,
  id: "reflection",
  articleId: "article",
  text: "First thought",
  createdAt: "2026-10-30T00:00:00.000Z",
  updatedAt: "2026-10-30T00:00:00.000Z",
};
beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.articles.put({ id: "article", revision: 1 });
});
it("keeps a tag-only new draft recoverable without saving a note, then saves text with its tags", async () => {
  await editArticleNote({ ...note, text: "", tags: ["essays"] });
  const tagOnly = await loadArticleNotes("article");
  expect(tagOnly.notes).toEqual([]);
  expect(tagOnly.drafts).toHaveLength(1);
  expect(tagOnly.drafts[0]?.tags).toEqual(["essays"]);
  await editArticleNote({ ...note, text: "Now written", tags: ["essays"] });
  const saved = await loadArticleNotes("article");
  expect(saved.drafts).toEqual([]);
  expect(saved.notes).toEqual([{ ...note, text: "Now written", tags: ["essays"] }]);
});
it("preserves draft tags when a saved note is emptied", async () => {
  await editArticleNote({ ...note, tags: ["essays"] });
  await editArticleNote({
    ...note,
    text: "  ",
    tags: ["essays", "to-revisit"],
    updatedAt: "2026-10-30T00:00:01.000Z",
  });
  const emptied = await loadArticleNotes("article");
  expect(emptied.notes).toEqual([{ ...note, tags: ["essays"] }]);
  expect(emptied.drafts).toEqual([
    { ...note, text: "  ", tags: ["essays", "to-revisit"], updatedAt: "2026-10-30T00:00:01.000Z" },
  ]);
});
it("normalizes note tags at the persistence seam without stacking case twins", async () => {
  await editArticleNote({ ...note, tags: ["  Essays ", "essays", "", "to-revisit"] });
  const loaded = await loadArticleNotes("article");
  expect(loaded.notes[0]?.tags).toEqual(["Essays", "to-revisit"]);
});
it("hydrates legacy rows written before note tags", async () => {
  await db.articleNotes.put(note);
  const loaded = await loadArticleNotes("article");
  expect(loaded.notes).toEqual([{ ...note, tags: [] }]);
});
it("keeps the last saved text and recoverable empty edit until explicit deletion", async () => {
  await editArticleNote(note);
  await editArticleNote({ ...note, text: "  ", updatedAt: "2026-10-30T00:00:01.000Z" });
  expect((await loadArticleNotes("article")).notes[0]?.text).toBe("First thought");
  expect((await loadArticleNotes("article")).drafts[0]?.text).toBe("  ");
  await deleteArticleNote(note.id);
  expect(await loadArticleNotes("article")).toEqual({ notes: [], drafts: [] });
});
it("does not save blank new notes and retains independent identity and creation order", async () => {
  await editArticleNote({ ...note, text: " \n" });
  expect(await loadArticleNotes("article")).toEqual({ notes: [], drafts: [] });
  await editArticleNote(note);
  await editArticleNote({
    ...note,
    id: "second",
    text: "Second",
    createdAt: "2026-10-30T00:00:01.000Z",
  });
  await editArticleNote({ ...note, text: "Edited", updatedAt: "2026-10-30T00:00:02.000Z" });
  expect((await loadArticleNotes("article")).notes.map((n) => n.id)).toEqual([
    "second",
    "reflection",
  ]);
});
it("article removal cascades saved reflections and empty recovery drafts", async () => {
  const { DexieLibrarySource } = await import("../../../src/ingestion/LibrarySource");
  await editArticleNote(note);
  await editArticleNote({ ...note, text: "", updatedAt: "2026-10-30T00:00:01.000Z" });
  await new DexieLibrarySource().remove("article");
  expect(await loadArticleNotes("article")).toEqual({ notes: [], drafts: [] });
  await expect(editArticleNote(note)).rejects.toThrow("Article no longer exists");
  expect(await loadArticleNotes("article")).toEqual({ notes: [], drafts: [] });
});
it("a failed real saved-note transaction preserves the write-through recovery draft", async () => {
  const fail = () => {
    throw new Error("disk full");
  };
  db.articleNotes.hook("creating", fail);
  try {
    await expect(editArticleNote(note)).rejects.toThrow("disk full");
  } finally {
    db.articleNotes.hook("creating").unsubscribe(fail);
  }
  expect(await loadArticleNotes("article")).toEqual({ notes: [], drafts: [{ ...note, tags: [] }] });
  await editArticleNote(note);
  expect(await loadArticleNotes("article")).toEqual({ notes: [{ ...note, tags: [] }], drafts: [] });
});
it("rejects stale starter edits after removal and permits writing after explicit restoration", async () => {
  const { DexieLibrarySource } = await import("../../../src/ingestion/LibrarySource");
  const { STARTER_ARTICLE_ID, restoreStarterArticle } =
    await import("../../../src/persistence/starterArticleStore");
  const starterNote = { ...note, articleId: STARTER_ARTICLE_ID };
  await editArticleNote(starterNote);
  await editArticleNote({ ...starterNote, text: "", updatedAt: "2026-10-30T00:00:01.000Z" });
  await new DexieLibrarySource().remove(STARTER_ARTICLE_ID);
  await expect(editArticleNote(starterNote)).rejects.toThrow("Article no longer exists");
  expect(await loadArticleNotes(STARTER_ARTICLE_ID)).toEqual({ notes: [], drafts: [] });
  await restoreStarterArticle();
  await editArticleNote(starterNote);
  expect(await loadArticleNotes(STARTER_ARTICLE_ID)).toEqual({
    notes: [{ ...starterNote, tags: [] }],
    drafts: [],
  });
});
it("upgrades a v9 library without changing passage-note relationships", async () => {
  db.close();
  await Dexie.delete("lem-reader");
  const legacy = new Dexie("lem-reader");
  legacy.version(9).stores({
    articles: "id, revision, source, addedAt, *tags, bookId",
    settings: "key",
    location: "[articleId+revision]",
    highlights: "id, [articleId+revision]",
    notes: "id, highlightId",
    books: "id, title, *tags",
    assets: "[articleId+assetId], articleId",
    readingSessions: "id, articleId, startedAt",
    subscriptions: "id, feedUrl",
    noteDrafts: "highlightId",
  });
  const passageNote = {
    schemaVersion: 1,
    id: "passage-note",
    highlightId: "highlight",
    text: "Passage commentary",
    updatedAt: note.updatedAt,
  };
  await legacy.table("notes").put(passageNote);
  legacy.close();
  await db.open();
  expect(await db.notes.get("passage-note")).toEqual(passageNote);
  expect(await loadArticleNotes("article")).toEqual({ notes: [], drafts: [] });
});
