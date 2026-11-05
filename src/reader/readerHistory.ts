// Chapter turns push ordinary browser-history entries, while the reader's
// close affordances leave the whole chapter session. This ephemeral state
// remembers the number of entries back to its origin; 0 means cold entry,
// whose safe exit is always the library. No passage position lives here.
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

/** Push a canonical chapter route without forgetting the reader's origin. */
export function navigateToChapter(targetId: string, hasAppHistory: boolean): void {
  // A reload starts a new session: persisted history state must not turn its
  // first chapter crossing into permission to leave the app via history.go.
  const depth = hasAppHistory ? (exitDepth() ?? 1) : 0;
  stampExitDepth(depth);
  window.location.hash = `#/article/${targetId}`;
  stampExitDepth(depth === 0 ? 0 : depth + 1);
}

/** Shared by Back to library and Mark read and close. */
export function leaveArticleToLibrary(hasAppHistory: boolean): void {
  const depth = hasAppHistory ? (exitDepth() ?? 1) : 0;
  if (depth > 1) history.go(-depth);
  else if (depth === 1) history.back();
  else window.location.hash = "#/";
}
