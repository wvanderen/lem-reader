// src/reader/BackToLibrary.tsx
// Plan 13-04 (POLISH-05 / D13-15) — the standardized back affordance. One
// shared anatomy mounted at the header start of BOTH secondary views
// (ArticleView's article header + ReviewView's review header): a native
// <button type="button"> (keyboard-reachable by construction — Tab/Shift+Tab
// + Enter/Space activation, no shortcut registration) with calm copy
// "Back to library".
//
// Navigation contract (Pitfall 7 — history.back() must never exit the app):
// App.tsx tracks `hasAppHistory`, flipped true on the FIRST in-app
// hashchange AFTER initial mount (the initial load — including a fresh
// deep-link tab AND a reload mid-article — fires no hashchange, so the flag
// stays false and back() can never strand the reader outside the app).
// readerHistory owns the close decision: standalone arrivals use the prior
// in-app entry, chapter sessions skip their intervening chapter entries,
// and cold entry (including a cold chapter session) uses the literal "#/"
// fallback. Ordinary browser Back still walks chapter-by-chapter.
//
// Mirrors src/reader/PageIndicator.tsx minimal-component discipline: header
// comment citing the locked decisions, single responsibility, verbatim class
// hook. No threat surface: the fallback assigns only the literal "#/" route;
// no attacker-influenced URL reaches navigation (T-13-06, accepted).

import { leaveArticleToLibrary } from "./readerHistory";
export { leaveArticleToLibrary } from "./readerHistory";

interface BackToLibraryProps {
  /**
   * Whether an in-app navigation happened after the initial mount (App.tsx
   * owns the flag — see the component header comment). When false the
   * component NEVER traverses history (a fresh deep-link or a reloaded
   * tab has no proven in-app origin; back() could exit the app or no-op).
   */
  hasAppHistory: boolean;
  /**
   * Issue #76 (decision #72) — the review mount relabels the shared
   * affordance to the honest "Back": review entries arrive from the article
   * page (drawer/library row) as often as from the library, so the copy
   * must not promise a destination it did not come from. Defaults to the
   * byte-stable "Back to library" (the article mount's pinned copy).
   */
  label?: string;
}

export function BackToLibrary({ hasAppHistory, label = "Back to library" }: BackToLibraryProps) {
  return (
    <button
      type="button"
      className="btn btn-quiet back-to-library"
      onClick={() => leaveArticleToLibrary(hasAppHistory)}
    >
      {label}
    </button>
  );
}
