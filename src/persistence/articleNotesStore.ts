import { z } from "zod";
import { db } from "./db";
import { bundledFixtures } from "../fixtures";
import { isStarterRemoved, STARTER_ARTICLE_ID } from "./starterArticleStore";
import { normalizeTags } from "../ingestion/library/tagText";

export const ArticleNoteSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  articleId: z.string().min(1),
  text: z.string(),
  // Issue #209 — the article note's OWN annotation tags (zero or more),
  // separate from the article's tags and from every other annotation's.
  // Reuses the highlight record's exact additive discipline (issue #116):
  // rows written before this field omit it and hydrate to [] via
  // `.default([])`; the field stays type-optional so in-memory values built
  // before the hydration point may omit the key (consumers read `?? []`).
  // Plain non-indexed row fields — no Dexie version bump (the tags
  // precedent). The attached vocabulary, normalization, and suggestions are
  // the shared annotation-tag machinery (TagEntry + tagText), never the
  // article-tag namespace.
  tags: z.array(z.string().min(1)).default([]).optional(),
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

/** Write-through recovery completes before the save attempt. Never overwrite saved text with blank text.
 *  Issue #209 — a tag-only write (no text, no saved note) is an INCOMPLETE draft, not an empty one: it
 *  stays a recoverable draft so committed tags survive, while an untouched empty draft still creates
 *  nothing. Tags normalize at the seam (trim, drop empties, case-insensitive dedupe) so the row can
 *  never carry a case twin or an empty string the next read would drop. */
export async function editArticleNote(input: ArticleNote): Promise<void> {
  // Normalize BEFORE the schema gate: an empty string would fail the
  // `z.string().min(1)` element check before normalizeTags could drop it.
  const note = ArticleNoteSchema.parse({ ...input, tags: normalizeTags(input.tags ?? []) });
  const tags = note.tags ?? [];
  await db.transaction(
    "rw",
    [db.articles, db.settings, db.articleNotes, db.articleNoteDrafts],
    async () => {
      await requireArticle(note.articleId);
      const saved = await db.articleNotes.get(note.id);
      if (saved && saved.articleId !== note.articleId)
        throw new Error("Article association mismatch");
      if (!note.text.trim() && !saved) {
        if (tags.length > 0) await db.articleNoteDrafts.put({ ...note, tags });
        else await db.articleNoteDrafts.delete(note.id);
        return;
      }
      await db.articleNoteDrafts.put({ ...note, tags });
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
      if (
        !draft ||
        draft.updatedAt !== note.updatedAt ||
        draft.text !== note.text ||
        // normalizeTags (not a raw compare) so a LEGACY draft row (written
        // before note tags — tags undefined) compares equal to an empty
        // selection and its pending text write still lands.
        normalizeTags(draft.tags ?? []).join("\n") !== tags.join("\n")
      )
        return;
      const saved = await db.articleNotes.get(note.id);
      await db.articleNotes.put({ ...note, tags, createdAt: saved?.createdAt ?? note.createdAt });
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
