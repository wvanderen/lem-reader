import type { Page } from "@playwright/test";

/** Seed validated fixture rows after the app has initialized its database. */
export async function seedStoreRows<T>(
  page: Page,
  store: "articles" | "books" | "location",
  rows: readonly T[],
): Promise<void> {
  await page.evaluate(async ({ store, rows }) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("lem-reader");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(store)) {
          db.close();
          reject(new Error(`Missing fixture store: ${store}`));
          return;
        }
        const transaction = db.transaction(store, "readwrite");
        for (const row of rows) transaction.objectStore(store).put(row);
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onabort = () => {
          db.close();
          reject(transaction.error);
        };
      };
    });
  }, { store, rows: [...rows] });
}
