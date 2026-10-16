// tests/e2e/pagination/_harness.ts
// Shared observable-readiness plumbing for the pagination spec family
// (REUSE-DO-NOT-FORK — the gotoPaginated/waitForPagination harness copies in
// no-overflow-invariant, coverage-invariant, page-turn-controls,
// mode-switch-anchor, repagination-anchor were drifting).
//
// Issue #185: the family's shared `waitForTimeout(600)` settle sleeps are
// replaced by the DEV-only window.__lemPagination readiness fields published
// by PaginatedSurface:
//   - status "ok" ⇒ the pagination effect committed an ok result;
//   - overflowSettled === true ⇒ the post-render overflow guard completed its
//     live-geometry pass for the CURRENT publication, including every
//     correction re-fire. Any new pagination pass (initial commit, page turn,
//     font-set change, viewport/typography repagination) resets the flag
//     synchronously before the guard re-runs, so a settled observation is
//     transitive over the font gate — no guessed settle duration anywhere.
//
// Deliberate time-based tests (the settings-save debounce, the read-aloud
// follow-suspension windows, the measurement harnesses' long-task sampling,
// and the fallback paths the guard deliberately does NOT settle — see
// waitForPaginationSettled) keep their fixed waits — timing or the unsettled
// fallback shape is the subject there. Assertion SUBJECTS are unchanged; the
// two mechanical edits are noted in-file (mode-switch-anchor gained a live
// scrolling-surface visibility wait replacing its 400ms sleep;
// repagination-anchor's previous-page probe is bounded to anchoredIdx > 0
// because a page-1 no-op turn can never reach index -1).
//
// Caveats every user of this harness must know:
//   - Same-document re-navigation: page.goto to another #/article/<id> hash
//     does NOT reload the document, so a SECOND openPaginated in one test
//     would resolve on the STALE publication of the first article. Use
//     markPaginationEpoch + waitForRepagination around re-navigation (or
//     open the article in a fresh test).
//   - Failure shape: if the engine regresses to dom-fallback (the guard
//     emits [] and never settles), these waits time out rather than fail a
//     status assertion — a timeout in a converted spec IS the fallback
//     signal; pair with termination/fallback specs, which own that path.
import { expect, type Page } from "@playwright/test";
import { BASE } from "../_base";
import type { Viewport } from "./fixtures-matrix";

export interface PaginationDev {
  currentPageIdx: number;
  pagesLength: number;
  status: string;
  overflowSettled?: boolean;
}

function readDev(page: Page): Promise<PaginationDev> {
  return page.evaluate(
    () => (window as unknown as Record<string, unknown>).__lemPagination as PaginationDev,
  );
}

/** Resolved when __lemPagination exists, status is "ok", and the post-render
 * overflow guard has completed for the CURRENT publication. */
export async function waitForPaginationSettled(
  page: Page,
  timeout = 10_000,
): Promise<PaginationDev> {
  await page.waitForFunction(
    () => {
      const dev = (window as unknown as Record<string, unknown>).__lemPagination as
        { status?: string; overflowSettled?: boolean } | undefined;
      return dev !== undefined && dev.status === "ok" && dev.overflowSettled === true;
    },
    undefined,
    { timeout },
  );
  return readDev(page);
}

/** Open a fixture in paginated mode (optionally at a matrix viewport) and
 * wait for the committed + guard-settled initial pagination. */
export async function openPaginated(
  page: Page,
  fixture: string,
  viewport?: Viewport,
): Promise<PaginationDev> {
  if (viewport) await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(`${BASE}/#/article/${fixture}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  return waitForPaginationSettled(page);
}

/** Wait until the turn to `expectedIdx` has committed AND its overflow-guard
 * pass has completed. The render that publishes `currentPageIdx === expectedIdx`
 * also resets `overflowSettled` synchronously, so this cannot be satisfied by
 * the previous page's settled state. Returns the settled dev object. */
export async function waitForPageSettled(
  page: Page,
  expectedIdx: number,
  timeout = 10_000,
): Promise<PaginationDev> {
  await page.waitForFunction(
    (want) => {
      const dev = (window as unknown as Record<string, unknown>).__lemPagination as
        { currentPageIdx?: number; status?: string; overflowSettled?: boolean } | undefined;
      return (
        dev !== undefined &&
        dev.status === "ok" &&
        dev.currentPageIdx === want &&
        dev.overflowSettled === true
      );
    },
    expectedIdx,
    { timeout },
  );
  return readDev(page);
}

/** Mark the CURRENT pagination publication (pre-trigger). Repagination
 * replaces the published `pages` array identity, so a later settled read of
 * an unmarked publication proves a NEW pass ran (the stale `__lemPagination`
 * from a previous mount otherwise still reads status "ok" + settled). */
export async function markPaginationEpoch(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __lemPagination?: { pages?: object | null };
      __lemSeenPagination?: WeakSet<object>;
    };
    if (!w.__lemSeenPagination) w.__lemSeenPagination = new WeakSet();
    if (w.__lemPagination?.pages) w.__lemSeenPagination.add(w.__lemPagination.pages);
  });
}

/** Wait for a repagination published AFTER `markPaginationEpoch` to commit
 * (status "ok") and complete its guard pass — the observable replacement for
 * the "let the coalescer + font gate + measure pass settle" sleeps. */
export async function waitForRepagination(page: Page, timeout = 15_000): Promise<PaginationDev> {
  await page.waitForFunction(
    () => {
      const w = window as unknown as {
        __lemPagination?: { pages?: object | null; status?: string; overflowSettled?: boolean };
        __lemSeenPagination?: WeakSet<object>;
      };
      const dev = w.__lemPagination;
      return (
        dev !== undefined &&
        dev.status === "ok" &&
        dev.overflowSettled === true &&
        dev.pages != null &&
        !w.__lemSeenPagination!.has(dev.pages)
      );
    },
    undefined,
    { timeout },
  );
  return readDev(page);
}
