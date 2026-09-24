// tests/e2e/readaloud/_harness.ts
// Shared plumbing for the read-aloud e2e legs (REUSE-DO-NOT-FORK): the
// session-local server base, the deterministic IndexedDB reset, the
// play-until-probe helper, and the tab-walk keyboard probe. The speech
// fake itself lives in _speech.ts.
import { expect, type Page } from "@playwright/test";
// The follow labels are asserted LIVE from the component's own map — a
// copy change lands once and every suite follows (one rename site).
import { FOLLOW_LABELS } from "../../../src/reader/ReadAloudBar";

// LEM_E2E_BASE override — the parallel-wayfinder-sessions discipline
// (read-nav.spec.ts precedent: point this suite at a session-local server).
export const BASE = process.env.LEM_E2E_BASE ?? "http://localhost:5173";

/** Wipe every user-data store through raw IndexedDB (the suites run after
 * each other in the same browser; a deterministic empty library first). */
export async function clearAllRows(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.open("lem-reader");
      req.onsuccess = () => {
        const db = req.result;
        const stores = [
          "articles",
          "settings",
          "location",
          "highlights",
          "notes",
          "books",
        ];
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
