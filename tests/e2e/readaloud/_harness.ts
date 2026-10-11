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
async function seedLocationRow(page: Page, graphemeOffset: number): Promise<void> {
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

/** Real Tab presses from `startSelector` until `targetSelector` holds focus
 * (the a11y.spec.ts keyboard-order proof). Chromium + firefox follow DOM
 * order; webkit's sequential navigation skips buttons — gate by engine at
 * the call site. */
export async function tabWalkFrom(
  page: Page,
  startSelector: string,
  targetSelector: string,
  maxPresses = 8,
): Promise<boolean> {
  await page.locator(startSelector).first().focus();
  for (let i = 0; i < maxPresses; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(60);
    const matched = await page.evaluate(
      (s) => document.activeElement?.matches(s) ?? false,
      targetSelector,
    );
    if (matched) return true;
  }
  return false;
}
