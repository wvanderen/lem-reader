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
//   - hasAppHistory === true  → history.back() (preserves the reader's
//     place in the session history; the prior entry is an in-app route)
//   - hasAppHistory === false → location.hash = "#/" — always a valid
//     route-to-library: the Gap-3 guard (App.tsx onHash) routes any
//     "#/"-prefixed hash and parseHash maps "#/" to the list view.
//
// Mirrors src/reader/PageIndicator.tsx minimal-component discipline: header
// comment citing the locked decisions, single responsibility, verbatim class
// hook. No threat surface: the fallback assigns only the literal "#/" route;
// no attacker-influenced URL reaches navigation (T-13-06, accepted).

interface BackToLibraryProps {
  /**
   * Whether an in-app navigation happened after the initial mount (App.tsx
   * owns the flag — see the component header comment). When false the
   * component NEVER calls history.back() (a fresh deep-link or a reloaded
   * tab has no prior in-app entry; back() would exit the app or no-op).
   */
  hasAppHistory: boolean;
}

export function BackToLibrary({ hasAppHistory }: BackToLibraryProps) {
  const goBack = () => {
    if (hasAppHistory) {
      // Preserves the reader's place in history — the prior entry is a
      // routed in-app hash (the flag proves at least one exists).
      history.back();
    } else {
      // The deep-link-safe fallback: parseHash maps "#/" to the library
      // list, so this always stays inside the app.
      window.location.hash = "#/";
    }
  };
  return (
    <button type="button" className="back-to-library" onClick={goBack}>
      Back to library
    </button>
  );
}
