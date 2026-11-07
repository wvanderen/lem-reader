// src/ui/rowNeighbors.ts
// Issue #243 — the shared post-removal neighbor capture the list-editing
// surfaces hand focus through. The ReviewView focusNearRemovedRow shape
// (src/routes/review/ReviewView.tsx) extracted once: capture the rows
// AROUND the acted-on row BEFORE a write, then — after the write lands —
// hand focus to the neighbor that is still CONNECTED (keyed rows survive a
// state swap, so a captured neighbor is the honest focus target; a
// detached one means its row went with the write).
//
// Pure DOM algebra, zero React, zero storage — the honestWrite.ts
// discipline for non-hook DOM plumbing. The CAPTURE must run synchronously
// in the event handler (before any await), the CONSUMPTION after the write
// settles (post-commit) — the two-call shape is the contract.

/** The rows flanking the acted-on row at capture time. */
export interface RowNeighbors {
  after: HTMLElement | null;
  before: HTMLElement | null;
}

/** Capture the neighbors of the row containing `trigger` (the pressed
 * control) among all `rowSelector` rows in the document. A trigger outside
 * any row captures nothing — the consumption then falls to the caller's
 * fallback. */
export function captureRowNeighbors(trigger: HTMLElement, rowSelector: string): RowNeighbors {
  const row = trigger.closest(rowSelector);
  const rows = Array.from(document.querySelectorAll(rowSelector));
  const index = row !== null ? rows.indexOf(row) : -1;
  return {
    after: (rows[index + 1] as HTMLElement | undefined) ?? null,
    before: (rows[index - 1] as HTMLElement | undefined) ?? null,
  };
}

/** The first captured neighbor still in the document, in reading order
 * (the FOLLOWING row first — the ReviewView consumption order), else null
 * when both are detached or nothing was captured. */
export function connectedNeighbor(neighbors: RowNeighbors): HTMLElement | null {
  return [neighbors.after, neighbors.before].find((el) => el?.isConnected) ?? null;
}
