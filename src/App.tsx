// src/App.tsx
// Hash-based three-view router (A2 recommendation, no router library —
// STACK.md "no premature abstractions"). Subscribes to `hashchange` and swaps
// between the LibraryView (default, Plan 08-03), ArticleView
// (#/article/<id>[/h/<highlightId>]), and ReviewView (#/highlights,
// Plan 10-02; renamed from #/review in Plan 15-01 — D15-06/D15-07).
// The SkipLink is the first focusable element in DOM order
// (UI-SPEC §Interaction 1).
//
// Phase 2 (D2-01/D2-02): wraps the tree in <SettingsProvider> and mounts the
// persistent <Header> above the view swap (header sits above <main> on BOTH
// views). Settings is a PANEL (D2-01), NOT a route — the router stays two-view
// and the Gap 3 fragment guard (`!hash.startsWith("#/")`) is unchanged.
//
// Phase 2 Plan 02-02 (STATE-05 recovery surfaces): reads `storageState` from
// useSettings() and routes it to the right non-blocking surface:
//   - "unavailable" → <StorageBanner> (dismissible, non-modal; reading
//                       continues with in-memory defaults — D2-13)
//   - "corrupt" |
//     "unupgradeable" → <WipeConfirm> (focus-trapped; db.delete() runs ONLY
//                       in its destructive onClick — Pitfall 8; never auto)
// Both mount inside the provider so they read the live storageState. Neither
// blocks reading (article rendering is independent of Dexie — D2-13).
import { useEffect, useRef, useState } from "react";
import { LibraryView } from "./ingestion/library/LibraryView";
import { ArticleView } from "./routes/ArticleView";
import { ReviewView } from "./routes/review/ReviewView";
import { SkipLink } from "./a11y/SkipLink";
import { Header } from "./reader/Header";
import { SettingsPanel } from "./reader/SettingsPanel";
import { StorageBanner } from "./reader/StorageBanner";
import { WipeConfirm } from "./reader/WipeConfirm";
import { SettingsProvider, useSettings } from "./settings/SettingsContext";

// Plan 10-02 (D10-01/D10-03) — the View union gains the review alternative
// and the article alternative gains the optional /h/<highlightId> deep-link
// capture (consumed by ArticleView in Plan 10-03; parseHash captures it now
// so the grammar is locked + unit-tested).
//
// Plan 14-02 (D14-12) — the list alternative gains the reading-state view
// segment (All / Unread / In progress / Finished are REAL hash routes).
// Exported alongside the View/parseHash surface below (same grammar
// surface, declared at its definition site).
export type LibraryViewName = "all" | "unread" | "in-progress" | "finished";

type View =
  | { name: "list"; view: LibraryViewName }
  | { name: "article"; id: string; jumpHighlightId?: string }
  // Plan 15-01 (D15-06, OQ3 resolution) — the destination renamed to
  // "Highlights" user-facing (#/highlights route, h1, title), but the
  // INTERNAL grammar name stays "review" so every view.name === "review"
  // site stays byte-stable. The optional legacyAlias marker (D15-07) is
  // set ONLY when parseHash matched the legacy #/review literal, so the
  // onHash handler below can normalize the URL via replaceState.
  | { name: "review"; legacyAlias?: true };

function parseHash(): View {
  // Grammar order matters (10-RESEARCH Pattern 1): the /h/ suffix form
  // matches FIRST, then the exact #/highlights equality (D15-06 canonical
  // route), then the exact #/review equality (D15-07 legacy alias — marked
  // legacyAlias for the onHash normalization), then the view-segment
  // literal allowlist, then the byte-stable list fallback. The
  // highlightId capture is [^/]+ — deliberately wider than the article-id
  // charset because highlight ids arrive from imported bundles
  // (foreign-controlled strings, T-10-02a). The value is used ONLY as a
  // lookup key (Array.find / getElementById in Plan 10-03) — never
  // innerHTML, never dynamic property access.
  const m = /^#\/article\/([a-z0-9-]+)(?:\/h\/([^/]+))?$/.exec(
    window.location.hash,
  );
  if (m) {
    return { name: "article", id: m[1] as string, jumpHighlightId: m[2] };
  }
  // Closed literal allowlist (T-15-01): the route is compared === against
  // a constant — no route value is ever interpolated into the DOM or URLs.
  if (window.location.hash === "#/highlights") {
    return { name: "review" };
  }
  if (window.location.hash === "#/review") {
    // D15-07 legacy alias — the caller (onHash / the mount effect)
    // rewrites the URL to the canonical #/highlights via replaceState.
    return { name: "review", legacyAlias: true };
  }
  // Plan 14-02 (D14-12/D14-16) — view segments: a CLOSED literal allowlist
  // (each hash is compared === against one of the four view constants;
  // values are never interpolated into the DOM or URLs — the T-10-02c
  // discipline). Unknown "#/" segments fall back to All, mirroring the
  // existing unknown-route → list discipline; no new error surface.
  if (window.location.hash === "#/unread") {
    return { name: "list", view: "unread" };
  }
  if (window.location.hash === "#/in-progress") {
    return { name: "list", view: "in-progress" };
  }
  if (window.location.hash === "#/finished") {
    return { name: "list", view: "finished" };
  }
  return { name: "list", view: "all" };
}

// Plan 14-02 (D14-13) — the four view-route hrefs, as template constants.
// replaceState is called ONLY with these (same-origin by construction —
// T-14-04: history.replaceState throws on cross-origin URLs, and a constant
// table can never carry one).
const VIEW_HREFS: Record<LibraryViewName, string> = {
  all: "#/",
  unread: "#/unread",
  "in-progress": "#/in-progress",
  finished: "#/finished",
};

/**
 * The D4-10 mode-toggle bridge. ArticleView registers its anchor-capturing
 * handler here on mount (so the passage is preserved across the mode swap);
 * on unmount the ref clears and the toggle falls back to a plain preference
 * flip (no article = no anchor to preserve). Held by AppInner (inside the
 * SettingsProvider) and threaded to BOTH Header (reader) and ArticleView
 * (writer). App itself lives outside the provider, so the bridge is created
 * in AppInner where useSettings() is reachable for the fallback path.
 */
type ModeToggleHandler = () => void;

/**
 * Reads `storageState` from the provider and renders the STATE-05 recovery
 * surfaces. Lives inside <SettingsProvider> so it can call useSettings().
 * Kept as its own component so App's top-level render tree stays readable.
 */
function StorageRecoverySurfaces() {
  const { storageState, resetLocalData } = useSettings();
  // Session-scoped "reader dismissed the banner" flag. Resets on reload
  // (which is the intended lifecycle — D2-13 the banner reappears next
  // session if storage is still unavailable).
  const [bannerDismissed, setBannerDismissed] = useState(false);
  // WipeConfirm open state — driven by storageState, but reset to closed
  // after either button so the reader can dismiss and keep reading.
  const [wipeOpen, setWipeOpen] = useState(false);

  useEffect(() => {
    // Drive the WipeConfirm open state from storageState. Once dismissed
    // (cancel or reset), it stays closed until storageState transitions
    // back to a destructive reason.
    setWipeOpen(storageState === "corrupt" || storageState === "unupgradeable");
    // Re-show the banner if storageState transitions back to unavailable
    // after a dismiss (e.g. a save fails after the reader dismissed).
    if (storageState === "unavailable") {
      setBannerDismissed((prev) => prev); // no-op; stays dismissed this session
    }
  }, [storageState]);

  // Reset banner dismissal if storageState returns to "ok" so a future
  // unavailable state shows the banner again next session.
  useEffect(() => {
    if (storageState === "ok") setBannerDismissed(false);
  }, [storageState]);

  const showBanner =
    storageState === "unavailable" && !bannerDismissed;

  return (
    <>
      {showBanner ? (
        <StorageBanner onDismiss={() => setBannerDismissed(true)} />
      ) : null}
      <WipeConfirm
        open={wipeOpen}
        onReset={async () => {
          // db.delete() already ran inside WipeConfirm's destructive
          // handler (Pitfall 8 — the ONLY call site). Reset in-memory
          // state to defaults here.
          await resetLocalData();
          setWipeOpen(false);
        }}
        onCancel={() => {
          // D2-13: the reader keeps reading with in-memory defaults; the
          // banner is NOT shown (the reader is past the prompt). If
          // storageState stays "corrupt"/"unupgradeable", reopening the
          // article (or a reload) will re-surface the prompt.
          setWipeOpen(false);
        }}
      />
    </>
  );
}

/**
 * AppInner lives inside <SettingsProvider> so it can read useSettings() for
 * the mode-toggle fallback (when no article is mounted, the toggle flips the
 * preference directly). When ArticleView IS mounted it registers its anchor-
 * capturing handler on modeToggleHandlerRef, and the fallback is bypassed.
 */
function AppInner() {
  const [view, setView] = useState<View>(() => parseHash());
  // Settings panel open state is app-shell concern (D2-01) — the gear's
  // aria-expanded and the dialog's open prop both read from this. Lifted here
  // so Header (the trigger) and SettingsPanel (the dialog) share one source.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Phase 5 Plan 05-03 (D5-09): annotations drawer open state — same lifting
  // pattern as settingsOpen. Header (the trigger) and ArticleView (which mounts
  // the drawer + handles navigate-back close) share one source of truth.
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Plan 13-10 (G5 — the drawerOpen pattern): tag-popover open state, lifted
  // so Header (the tags-trigger) and ArticleView (which mounts the popover
  // surface wrapping the byte-unchanged TagEntry) share one source of truth.
  // The popover's native light-dismiss/Esc close routes back through
  // onCloseTags so App state never desyncs from the top layer.
  const [tagsOpen, setTagsOpen] = useState(false);
  // Phase 5 Plan 05-03: annotation count for the header badge. ArticleView
  // pushes the resolved-highlight count up via onAnnotationCountChange so the
  // Header badge stays in sync without Header needing to consume the provider.
  const [annotationCount, setAnnotationCount] = useState(0);
  const { settings, update } = useSettings();
  // D4-10 bridge — ArticleView registers its handler here; null on the list.
  const modeToggleHandlerRef = useRef<ModeToggleHandler | null>(null);
  // Plan 13-04 (D13-15 / Pitfall 7): in-app navigation flag. Flips true on
  // the FIRST in-app hashchange AFTER initial mount and never flips back.
  // The initial load fires no hashchange — so a fresh deep-link tab AND a
  // reload mid-article both keep the flag false (a reload has browser
  // history, but back() would exit to the prior site, not an app route;
  // flag-from-mount-start is the robust shape). Threaded to ArticleView and
  // ReviewView so their BackToLibrary affordance picks history.back() only
  // when a prior in-app entry provably exists, else the "#/" fallback.
  const [hasAppHistory, setHasAppHistory] = useState(false);

  useEffect(() => {
    // Plan 15-03 (D15-11..14 / Pitfall 3) — the app owns scroll on Back.
    // Without this, the browser's native history scroll restore races the
    // library's ready-gated scrollTo (Chromium would snap Back to the
    // pre-departure offset before/equally with our restore), and the two
    // scroll actors can never agree. Set once, early. Conscious trade:
    // a RELOAD loses the browser's own scroll restore — accepted per
    // D15-12/D14-17 (the view restores from the URL; session scroll does
    // not survive reload by decision).
    history.scrollRestoration = "manual";
    // Gap 3 / UAT test 10: only hashes prefixed with "#/" are app routes.
    // Bare fragment anchors are native in-page scroll targets and must NOT
    // swap the view — otherwise the scroll target element (e.g. the footnote
    // body) is unmounted before the browser can scroll to it, dumping the
    // reader back to the fixture list. Fragment namespaces relying on native
    // scrolling: #fn-N (footnote body), #fn-ref-N (reference back-link
    // target), and #main (the SkipLink target). parseHash still maps an
    // unrecognized "#/" deep link to the list; this guard only short-circuits
    // fragment-only hashes before they reach setView.
    const onHash = () => {
      const hash = window.location.hash;
      if (hash !== "" && !hash.startsWith("#/")) return;
      // Only ROUTED (in-app) hashes count as in-app navigation — a
      // fragment-only hop (e.g. #fn-1) returns above and must not fake
      // in-app history for the BackToLibrary guard.
      setHasAppHistory(true);
      // Plan 15-01 (D15-07) — legacy #/review normalization, mirroring
      // switchLibraryView EXACTLY: replaceState with the constant
      // canonical href (same-origin by construction — T-14-04), then the
      // DIRECT setView(parseHash()) update. replaceState fires NO
      // hashchange, so the direct setView is load-bearing — without it
      // the URL and the DOM desync. NEVER location.hash assignment (a
      // second hashchange — double processing) and NEVER pushState (an
      // extra history entry corrupts the D14-14 Back-count semantics).
      const parsed = parseHash();
      if (parsed.name === "review" && parsed.legacyAlias) {
        history.replaceState(null, "", "#/highlights");
      }
      setView(parseHash());
    };
    window.addEventListener("hashchange", onHash);
    // Plan 15-01 (D15-07) — cold-load normalization: a fresh load (or
    // reload) on the legacy literal rewrites the URL once at mount. The
    // view state from the useState initializer above is already correct
    // (parseHash maps #/review to the review view); only the URL needs
    // the canonical form. replaceState, for the same reasons as onHash.
    if (window.location.hash === "#/review") {
      history.replaceState(null, "", "#/highlights");
    }
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Phase 5 Plan 05-03: reset the annotations drawer + count when the view
  // swaps (back to list or article change) so stale state doesn't carry over.
  // Plan 13-10: the tag popover resets the same way (a closed-surface carry
  // across an article swap would re-show against the wrong article's tags).
  useEffect(() => {
    setDrawerOpen(false);
    setAnnotationCount(0);
    setTagsOpen(false);
  }, [view]);

  // D4-09/D4-10: when ArticleView has registered an anchor-capturing handler,
  // route the toggle through it (passage preserved across the mode swap). On
  // the fixture list (no article) fall back to a plain preference flip.
  const handleToggleMode = () => {
    if (modeToggleHandlerRef.current) {
      modeToggleHandlerRef.current();
    } else {
      update({
        readingMode: settings.readingMode === "paginated" ? "scrolling" : "paginated",
      });
    }
  };

  // Plan 14-02 (D14-13 / 14-RESEARCH Pitfall 2) — view switches are
  // state-within-destination: history.replaceState + a DIRECT router
  // update. replaceState fires NO hashchange and NO popstate, so the
  // direct setView(parseHash()) call is load-bearing — without it the URL
  // and the DOM desync (THE failure mode). A same-view click is a calm
  // no-op. Deliberately does NOT touch setHasAppHistory (Pitfall 4): a
  // view switch is not destination navigation, and hasAppHistory is not
  // flipped by design — BackToLibrary's history.back() guard composes
  // unchanged (destinations push via window.location.hash assignments,
  // which stay byte-unchanged).
  const switchLibraryView = (next: LibraryViewName) => {
    if (view.name === "list" && view.view === next) return;
    history.replaceState(null, "", VIEW_HREFS[next]);
    setView(parseHash());
  };

  // Plan 15-02 (D15-01/D15-02): the shell destination derived from the view.
  // ANY of the four list views is the Library destination (views are
  // state-within-destination — D14-13); review is the Highlights
  // destination (D15-06); article is Reader. Header stays presentational —
  // it consumes this for the shell-nav aria-current discipline (D15-09).
  const destination =
    view.name === "list"
      ? "library"
      : view.name === "review"
        ? "highlights"
        : "reader";

  return (
    <>
      <SkipLink />
      <Header
        onOpenSettings={() => setSettingsOpen(true)}
        settingsOpen={settingsOpen}
        onToggleMode={handleToggleMode}
        articleMounted={view.name === "article"}
        annotationCount={annotationCount}
        drawerOpen={drawerOpen}
        onToggleAnnotations={() => setDrawerOpen((v) => !v)}
        tagsOpen={tagsOpen}
        onToggleTags={() => setTagsOpen((v) => !v)}
        destination={destination}
      />
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <StorageRecoverySurfaces />
      {/* Plan 10-02 — three-view swap: list → review → article (branch
          order per the plan). ReviewView takes no props (it re-derives its
          whole state from Dexie on mount by design). Plan 10-03 threads
          jumpHighlightId into ArticleView's on-mount jump pipeline (readiness
          gate + D5-11 jump tail + history.replaceState suffix strip).
          The [view] reset effect above fires on review↔article swaps —
          desirable (drawer/count reset). */}
      {view.name === "list" ? (
        <LibraryView
          view={view.view}
          onSwitchView={switchLibraryView}
          warmMount={hasAppHistory}
        />
      ) : view.name === "review" ? (
        <ReviewView hasAppHistory={hasAppHistory} />
      ) : (
        <ArticleView
          articleId={view.id}
          jumpHighlightId={view.jumpHighlightId}
          modeToggleHandlerRef={modeToggleHandlerRef}
          drawerOpen={drawerOpen}
          onCloseDrawer={() => setDrawerOpen(false)}
          tagsOpen={tagsOpen}
          onCloseTags={() => setTagsOpen(false)}
          onAnnotationCountChange={setAnnotationCount}
          hasAppHistory={hasAppHistory}
        />
      )}
    </>
  );
}

export function App() {
  return (
    <SettingsProvider>
      <AppInner />
    </SettingsProvider>
  );
}

export { parseHash };
export type { View };
