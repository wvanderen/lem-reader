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
