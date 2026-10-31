import { db } from "./db";

export const STARTER_ARTICLE_ID = "getting-started";
export const STARTER_CHOICE_KEY = "starter-article-removed";

/** An absent choice means the starter is available by default. */
export async function isStarterRemoved(): Promise<boolean> {
  return (await db.settings.get(STARTER_CHOICE_KEY))?.value === true;
}

export async function restoreStarterArticle(): Promise<void> {
  await db.settings.put({ key: STARTER_CHOICE_KEY, value: false });
}

/** Resolve the destination's choice before importing any records. Existing
 * choices win; only a fresh library adopts an incoming removal (ADR 0004).
 * Shared by preview, planning, and the atomic apply transaction. */
export async function isStarterRemovedAfterImport(incoming?: boolean): Promise<boolean> {
  const choice = await db.settings.get(STARTER_CHOICE_KEY);
  if (choice) return choice.value === true;
  if (incoming !== true) return false;
  const counts = await Promise.all([
    db.articles.count(),
    db.books.count(),
    db.highlights.count(),
    db.articleNotes.count(),
    db.location.count(),
    db.readingSessions.count(),
    db.subscriptions.count(),
  ]);
  return counts.every((count) => count === 0);
}
