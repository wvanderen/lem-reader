// tests/e2e/location-readiness.ts
// Shared observable-readiness plumbing for the reading-location lifecycle
// (REUSE-DO-NOT-FORK — first extracted for epub-intake and pdf-intake in
// issue #185 round 5; the annotations/_fixtures switchMode store-poll and
// the pagination/_harness overflow-settled waits are the sibling seams).
//
// What lives here, and why observable beats guessed for each:
//   - waitForLocationSaved: the scroll save is debounced
//     (SAVE_DEBOUNCE_MS 1200 in useScrollSave — app truth, unchanged).
//     The previous guessed `waitForTimeout(100) + (1400)` pairs padded
//     past the debounce on a quiet box but RACED it on a starved runner
//     (the timer deferred past the sleep, the reload then read a stale
//     row). Every landed write refreshes the row's savedAt, so polling
//     for a write newer than a caller-captured marker observes the commit
//     itself — quiet: the debounce floor (~1.2s, same as before);
//     contended: however long the write actually takes, bounded at 10s.
//   - locationSaveMarker: capture it immediately BEFORE the action whose
//     save must land — a real scroll. What the poll then proves is "a
//     write landed after the marker"; WHICH write depends on site
//     ordering, and that is the honest contract: useScrollSave is
//     latest-wins (the scroll's record replaces any pending earlier one
//     in pendingRef, and the offset is computed at flush time from the
//     CURRENT geometry), so the flush that lands >=1200ms after the
//     scroll carries post-scroll geometry even when an open-save was
//     pending at the marker. Sites that only need "the strip's latest
//     savedAt moved" (any write qualifies) are equally covered. The
//     saved offset itself is NOT asserted — block-level granularity
//     makes a shallow scroll's offset legitimately 0; the position
//     assertions after the reload own that.
//   - restoredScrollY: the reopen-restore is a single scrollIntoView that
//     may be a calm glide (no reduced-motion emulation), so the poll
//     waits for the viewport to STOP moving — two equal consecutive
//     reads of a monotonic glide mean it landed. Fails loudly when no
//     restore ever moves the viewport; the guessed 1000ms settle it
//     replaces could only ever mask that case for a while.
import { expect, type Page } from "@playwright/test";

/** Poll the Dexie location store until a write for `articleId` lands with
 * a savedAt newer than `sinceISO` (see the module header for the marker
 * discipline and why the offset is not asserted). */
export async function waitForLocationSaved(
  page: Page,
  articleId: string,
  sinceISO: string,
): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          async ({ articleId, sinceISO }) => {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
              const req = indexedDB.open("lem-reader");
              req.onsuccess = () => resolve(req.result);
              req.onerror = () => reject(req.error);
            });
            try {
              const rows = await new Promise<
                { articleId?: string; savedAt?: string; graphemeOffset?: number }[]
              >((resolve, reject) => {
                const tx = db.transaction("location", "readonly");
                const getReq = tx.objectStore("location").getAll();
                getReq.onsuccess = () =>
                  resolve((getReq.result ?? []) as { articleId?: string; savedAt?: string }[]);
                getReq.onerror = () => reject(getReq.error);
              });
              return rows.some((r) => r.articleId === articleId && (r.savedAt ?? "") > sinceISO);
            } finally {
              db.close();
            }
          },
          { articleId, sinceISO },
        ),
      {
        timeout: 10_000,
        message: `no location save landed for ${articleId} after ${sinceISO} — the debounced write did not commit`,
      },
    )
    .toBe(true);
}

/** The in-page clock marker for waitForLocationSaved (see the module header
 * for when to capture it). */
export async function locationSaveMarker(page: Page): Promise<string> {
  return page.evaluate(() => new Date().toISOString());
}

/** Wait for the reopen-restore to finish moving the viewport and return the
 * landed scrollY. Heuristic, stated honestly: the restore is a single
 * scrollIntoView that may be a calm glide, and two equal consecutive reads
 * one poll-interval apart (>=100ms) mean a monotonic glide has landed — a
 * mid-glide plateau long enough to fool this needs a >=100ms frame stall,
 * and the block-level tolerance assertions that follow absorb any residual
 * mid-glide read. A restore that legitimately lands at top (offset 0) also
 * waits out the budget: the following >100 assertions own that verdict,
 * this message only names the movement that never came. */
export async function restoredScrollY(page: Page): Promise<number> {
  let last = -1;
  await expect
    .poll(
      async () => {
        const y = await page.evaluate(() => Math.round(window.scrollY));
        const stable = last > 0 && y === last;
        last = y;
        return stable;
      },
      {
        timeout: 10_000,
        message:
          "window.scrollY never stabilized above 0 — the reopen-restore did not move the viewport (or it legitimately landed at top; the assertions that follow own that verdict)",
      },
    )
    .toBe(true);
  return last;
}
