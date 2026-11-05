// tests/e2e/readaloud/_harness.ts
// Shared plumbing for the read-aloud e2e legs (REUSE-DO-NOT-FORK): the
// session-local server base, the deterministic IndexedDB reset, the
// play-until-probe helper, the tab-walk keyboard probe, and the
// open-article-with-fake-speech entry. The speech fake itself lives in
// _speech.ts.
import { expect, type Page } from "@playwright/test";
// The follow labels are asserted LIVE from the component's own map — a
// copy change lands once and every suite follows (one rename site).
import { FOLLOW_LABELS } from "../../../src/reader/ReadAloudBar";
import { fixtures } from "../../../src/fixtures";
import { BASE } from "../_base";
import { installFakeSpeech, type SpeechMode } from "./_speech";
export { BASE };

/** The fixture article every read-aloud leg reads (one rename site). */
export const READALOUD_ARTICLE = fixtures[0]!;
export const READALOUD_ARTICLE_HREF = `#/article/${READALOUD_ARTICLE.id}`;

/** Wipe every user-data store through raw IndexedDB (the suites run after
 * each other in the same browser; a deterministic empty library first). */
export async function clearAllRows(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        const stores = ["articles", "settings", "location", "highlights", "notes", "books"];
        const existing = stores.filter((s) => db.objectStoreNames.contains(s));
        if (existing.length === 0) {
          resolve();
          return;
        }
        const tx = db.transaction(existing, "readwrite");
        for (const s of existing) tx.objectStore(s).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    });
  });
}

/** Press the idle entry and wait until the voice probe resolves — every
 * session-dependent assertion runs after this, never against the settle
 * window. */
export async function playAndAwaitProbe(page: Page): Promise<void> {
  const bar = page.locator(".readaloud-bar");
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Read aloud" }).click();
  await expect(bar.getByText(FOLLOW_LABELS.word)).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(150); // the post-cancel settle before chunk 1
}

/**
 * Open the fixture article with the fake speech installed. ORDER IS
 * LOAD-BEARING (cloned verbatim from read-aloud.spec.ts, one home now):
 * addInitScript must register BEFORE the first goto, and the article URL
 * differs from the library URL by the hash only — a same-document
 * navigation that keeps the stub-installed document alive (a second init
 * script registered later would never run).
 */
export async function openArticle(
  page: Page,
  mode: SpeechMode,
  opts: { seedOffset?: number } = {},
): Promise<Page> {
  await installFakeSpeech(page, mode);
  // New document: the stub installs, the app boots at the library, and the
  // first load constructs the Dexie schema for the raw-IndexedDB seam below.
  await page.goto(`${BASE}/`);
  await expect(page.getByRole("heading", { name: "Saved articles" })).toBeVisible({
    timeout: 10_000,
  });
  await clearAllRows(page);
  if (opts.seedOffset !== undefined) {
    await seedLocationRow(page, opts.seedOffset);
  }
  await page.goto(`${BASE}/${READALOUD_ARTICLE_HREF}`);
  return page;
}

/** Raw-IndexedDB location row seed (the spec-visible seam for "the reader
 * was at offset N"). Uses the shared fixture article's identity. */
export async function seedLocationRow(page: Page, graphemeOffset: number): Promise<void> {
  await page.evaluate(
    ({ articleId, revision, offset }) => {
      return new Promise<void>((resolve) => {
        const req = indexedDB.open("lem-reader");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("location", "readwrite");
          tx.objectStore("location").put({
            schemaVersion: 1,
            articleId,
            revision,
            graphemeOffset: offset,
            savedAt: new Date().toISOString(),
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        };
        req.onerror = () => resolve();
      });
    },
    {
      articleId: READALOUD_ARTICLE.id,
      revision: READALOUD_ARTICLE.revision,
      offset: graphemeOffset,
    },
  );
}

/** Read the saved location row for ONE article straight from Dexie (the
 * flush/resume assertions read the store, not the UI). Latest row wins —
 * the app's fold over the store's key order. */
export async function readLocationOffset(page: Page, articleId: string): Promise<number | null> {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows = await new Promise<{ articleId?: string; graphemeOffset?: number }[]>(
      (resolve, reject) => {
        const tx = db.transaction("location", "readonly");
        const req = tx.objectStore("location").getAll();
        req.onsuccess = () =>
          resolve(req.result as { articleId?: string; graphemeOffset?: number }[]);
        req.onerror = () => reject(req.error);
      },
    );
    db.close();
    const mine = rows.filter((r) => r.articleId === id);
    if (mine.length === 0) return null;
    return mine.at(-1)?.graphemeOffset ?? null;
  }, articleId);
}

/** Real Tab presses from `startSelector` until `targetSelector` holds focus
 * (the a11y.spec.ts keyboard-order proof). Chromium + firefox follow DOM
 * order; webkit's sequential navigation skips buttons — gate by engine at
 * the call site.
 *
 * Issue #254 — ONE walker: re-exported from tests/e2e/_keyboard.ts so the
 * start precondition (visible + actually focused before keys are sent) and
 * the bounded per-press focus poll are shared, never forked. Signature
 * unchanged for the readaloud call sites. */
export { tabWalkFrom } from "../_keyboard";
