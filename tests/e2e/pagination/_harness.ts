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
  /** Issue #254 — the DEV publication sequence: monotonic, advanced on every
   * commit (initial pass, turn, overflow correction, repagination). */
  publicationSeq?: number;
  /** Completed manual turns only: reflows and programmatic jumps cannot
   * advance this receipt. Shared across a reading's continuation scopes. */
  turnSeq?: number;
  turnDirection?: "next" | "previous" | null;
  /** Issue #254 — the reader's canonical passage, in the original
   * article-global D-05 coordinate (pageAnchorOffset, end-pin rule
   * included). Movement/preservation assertions anchor on this, not on the
   * mutable page number. null when no pages committed (fallback). */
  anchorOffset?: number | null;
  /** The measurement window's source bounds (windowed works only). */
  scope?: {
    startBlock: number;
    endBlock: number;
    startGrapheme?: number;
    endGrapheme?: number;
  };
}

function readPublicationFields(page: Page): Promise<PaginationDev | undefined> {
  return page.evaluate(() => {
    const dev = (window as unknown as Record<string, unknown>).__lemPagination as
      (PaginationDev & { pages?: unknown }) | undefined;
    if (!dev) return undefined;
    // The light projection: the serializable readiness fields only — never
    // the page fragments (the turn walk reads this per iteration).
    return {
      status: dev.status,
      overflowSettled: dev.overflowSettled,
      currentPageIdx: dev.currentPageIdx,
      pagesLength: dev.pagesLength,
      publicationSeq: dev.publicationSeq,
      turnSeq: dev.turnSeq,
      turnDirection: dev.turnDirection,
      anchorOffset: dev.anchorOffset,
      scope: dev.scope,
    };
  });
}

/** The ONE reader of the DEV publication (the established helpers' accessor):
 * the light projection from {@link readPublicationFields}. */
function readDev(page: Page): Promise<PaginationDev> {
  return readPublicationFields(page) as Promise<PaginationDev>;
}

/** Nullable form for pre-first-commit reads. Issue #254: callers pass this
 * read to {@link waitForTurnAcknowledged} as the pre-trigger `before` state. */
export async function readPagination(page: Page): Promise<PaginationDev | null> {
  return (await readPublicationFields(page)) ?? null;
}

/** Wait for a NEW settled publication, never stale state or a page index.
 * Directed waits additionally require a NEW completed-manual-turn receipt
 * in the requested direction and canonical movement. A reflow can move the
 * page head in either direction without a turn, so movement alone is NOT
 * acknowledgment. Receipts complete after the live overflow check (or the
 * window host's settled boundary handoff), not on keydown or an idle reflow.
 * Direction-less waits observe replacement layout without requiring a turn.
 */
export async function waitForTurnAcknowledged(
  page: Page,
  before: PaginationDev,
  direction?: "next" | "previous",
  timeout = 15_000,
): Promise<PaginationDev> {
  if (typeof before.publicationSeq !== "number") {
    throw new Error(
      "waitForTurnAcknowledged: the pre-trigger read has no publicationSeq — read it with readPagination() AFTER the surface settled and BEFORE triggering the turn; a stale page or pre-publication read proves nothing",
    );
  }
  if (direction !== undefined && typeof before.anchorOffset !== "number") {
    throw new Error(
      "waitForTurnAcknowledged: a directed wait needs the pre-trigger anchorOffset — a read without it cannot judge canonical movement",
    );
  }
  if (direction !== undefined && typeof before.turnSeq !== "number") {
    throw new Error(
      "waitForTurnAcknowledged: a directed wait needs the pre-trigger turnSeq receipt",
    );
  }
  const from: number = before.anchorOffset ?? 0;
  await page.waitForFunction(
    ({ seq, turnSeq, from, direction }) => {
      const dev = (window as unknown as Record<string, unknown>).__lemPagination as
        | {
            publicationSeq?: number;
            turnSeq?: number;
            turnDirection?: string | null;
            status?: string;
            overflowSettled?: boolean;
            anchorOffset?: number;
          }
        | undefined;
      if (
        dev === undefined ||
        typeof dev.publicationSeq !== "number" ||
        dev.publicationSeq <= seq ||
        dev.status !== "ok" ||
        dev.overflowSettled !== true
      ) {
        return false;
      }
      if (
        direction !== undefined &&
        (typeof dev.turnSeq !== "number" ||
          dev.turnSeq <= turnSeq! ||
          dev.turnDirection !== direction)
      )
        return false;
      if (direction === "next")
        return typeof dev.anchorOffset === "number" && dev.anchorOffset > from;
      if (direction === "previous") {
        return typeof dev.anchorOffset === "number" && dev.anchorOffset < from;
      }
      return true;
    },
    { seq: before.publicationSeq, turnSeq: before.turnSeq, from, direction },
    { timeout },
  );
  return (await readPagination(page)) as PaginationDev;
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
