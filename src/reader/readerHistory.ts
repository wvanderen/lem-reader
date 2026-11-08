// Chapter turns push ordinary browser-history entries, while the reader's
// close affordances leave the whole chapter session. This ephemeral state
// remembers the number of entries back to its origin; 0 means cold entry,
// whose safe exit is always the library. No passage position lives here.
// Issue #247 adds the collection-context suffix composition (the /col/ route
// grammar — src/App.tsx parseHash), carried across whole-book crossings.

const EXIT_DEPTH_KEY = "lemReaderExitDepth";

function exitDepth(): number | undefined {
  const state: unknown = history.state;
  if (typeof state !== "object" || state === null || !(EXIT_DEPTH_KEY in state)) return;
  const depth = state[EXIT_DEPTH_KEY];
  return typeof depth === "number" && Number.isSafeInteger(depth) && depth >= 0 ? depth : undefined;
}

function stampExitDepth(depth: number): void {
  const state: unknown = history.state;
  history.replaceState(
    { ...(typeof state === "object" && state !== null ? state : {}), [EXIT_DEPTH_KEY]: depth },
    "",
  );
}

/** Issue #247 — the collection context a chapter crossing may carry. The
 * reader's open carries WHICH collection entry it serves (the
 * /col/<collectionId>/<entryId> suffix); a whole-book crossing (page turn,
 * chapter link, read-aloud handoff) stays WITHIN the same entry, so the
 * context rides along. Explicit continue-the-work navigations omit it —
 * leaving the entry is the reader's choice, never a silent follow-through.
 * Navigation context only (ADR 0011 — no second saved position lives here). */
export interface CollectionRouteContext {
  collectionId: string;
  entryId: string;
}

/** The /col/<collectionId>/<entryId> suffix for a route (the parseHash
 * grammar — src/App.tsx). Pure string composition of validated-record
 * charset ids; no reader text can enter it. */
export function collectionContextSuffix(context: CollectionRouteContext): string {
  return `/col/${context.collectionId}/${context.entryId}`;
}

/** Push a canonical chapter route without forgetting the reader's origin.
 * `collectionContext` (issue #247) appends the /col/ suffix so a whole-book
 * crossing stays within the same collection entry; absent (the default), the
 * plain route is pushed and any context the current open carried is
 * deliberately dropped. */
export function navigateToChapter(
  targetId: string,
  hasAppHistory: boolean,
  collectionContext?: CollectionRouteContext,
): void {
  // A reload starts a new session: persisted history state must not turn its
  // first chapter crossing into permission to leave the app via history.go.
  const depth = hasAppHistory ? (exitDepth() ?? 1) : 0;
  stampExitDepth(depth);
  const suffix = collectionContext ? collectionContextSuffix(collectionContext) : "";
  window.location.hash = `#/article/${targetId}${suffix}`;
  stampExitDepth(depth === 0 ? 0 : depth + 1);
}

/** Shared by Back to library and Mark read and close. */
export function leaveArticleToLibrary(hasAppHistory: boolean): void {
  const depth = hasAppHistory ? (exitDepth() ?? 1) : 0;
  if (depth > 1) history.go(-depth);
  else if (depth === 1) history.back();
  else window.location.hash = "#/";
}
