import { z } from "zod";
import { db } from "./db";
import { bundledFixtures } from "../fixtures";
import { isStarterRemoved, STARTER_ARTICLE_ID } from "./starterArticleStore";

export const ArticleNoteSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  articleId: z.string().min(1),
  text: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ArticleNote = z.infer<typeof ArticleNoteSchema>;

export async function loadArticleNotes(articleId: string) {
  const [notes, drafts] = await Promise.all([
    db.articleNotes.where("articleId").equals(articleId).toArray(),
    db.articleNoteDrafts.where("articleId").equals(articleId).toArray(),
  ]);
  const valid = (rows: ArticleNote[]) =>
    rows.flatMap((row) => {
      const parsed = ArticleNoteSchema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    });
  return {
    notes: valid(notes).sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
    ),
    drafts: valid(drafts),
  };
}

// Bundled examples are readable articles too, but do not occupy the personal-library table.
async function requireArticle(articleId: string): Promise<void> {
  if (articleId === STARTER_ARTICLE_ID && (await isStarterRemoved())) {
    throw new Error("Article no longer exists");
  }
  if (
    !(await db.articles.get(articleId)) &&
    !bundledFixtures.some((article) => article.id === articleId)
  ) {
    throw new Error("Article no longer exists");
  }
}

/** Write-through recovery completes before the save attempt. Never overwrite saved text with blank text. */
export async function editArticleNote(input: ArticleNote): Promise<void> {
  const note = ArticleNoteSchema.parse(input);
  await db.transaction(
    "rw",
    [db.articles, db.settings, db.articleNotes, db.articleNoteDrafts],
    async () => {
      await requireArticle(note.articleId);
      const saved = await db.articleNotes.get(note.id);
      if (saved && saved.articleId !== note.articleId)
        throw new Error("Article association mismatch");
      if (!note.text.trim() && !saved) {
        await db.articleNoteDrafts.delete(note.id);
        return;
      }
      await db.articleNoteDrafts.put(note);
    },
  );
  if (!note.text.trim()) return;
  // Separate transaction: a failed saved-note write leaves the recovery draft intact.
  await db.transaction(
    "rw",
    [db.articles, db.settings, db.articleNotes, db.articleNoteDrafts],
    async () => {
      await requireArticle(note.articleId);
      const draft = await db.articleNoteDrafts.get(note.id);
      if (!draft || draft.updatedAt !== note.updatedAt || draft.text !== note.text) return;
      const saved = await db.articleNotes.get(note.id);
      await db.articleNotes.put({ ...note, createdAt: saved?.createdAt ?? note.createdAt });
      await db.articleNoteDrafts.delete(note.id);
    },
  );
}

export async function deleteArticleNote(id: string): Promise<void> {
  await db.transaction("rw", [db.articleNotes, db.articleNoteDrafts], async () => {
    await db.articleNotes.delete(id);
    await db.articleNoteDrafts.delete(id);
  });
}
