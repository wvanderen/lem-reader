// src/App.tsx
// Hash-based two-view router (A2 recommendation, no router library —
// STACK.md "no premature abstractions"). Subscribes to `hashchange` and swaps
// between the FixtureList (default) and ArticleView (#/article/<id>). The
// SkipLink is the first focusable element in DOM order (UI-SPEC §Interaction 1).
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
import { useEffect, useState } from "react";
import { FixtureList } from "./routes/FixtureList";
import { ArticleView } from "./routes/ArticleView";
import { SkipLink } from "./a11y/SkipLink";
import { Header } from "./reader/Header";
import { SettingsPanel } from "./reader/SettingsPanel";
import { StorageBanner } from "./reader/StorageBanner";
import { WipeConfirm } from "./reader/WipeConfirm";
import { SettingsProvider, useSettings } from "./settings/SettingsContext";

type View = { name: "list" } | { name: "article"; id: string };

function parseHash(): View {
  const m = /^#\/article\/([a-z0-9-]+)$/.exec(window.location.hash);
  return m ? { name: "article", id: m[1] as string } : { name: "list" };
}

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

export function App() {
  const [view, setView] = useState<View>(() => parseHash());
  // Settings panel open state is app-shell concern (D2-01) — the gear's
  // aria-expanded and the dialog's open prop both read from this. Lifted here
  // so Header (the trigger) and SettingsPanel (the dialog) share one source.
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
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
      setView(parseHash());
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return (
    <SettingsProvider>
      <SkipLink />
      <Header
        onOpenSettings={() => setSettingsOpen(true)}
        settingsOpen={settingsOpen}
      />
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <StorageRecoverySurfaces />
      {view.name === "list" ? <FixtureList /> : <ArticleView articleId={view.id} />}
    </SettingsProvider>
  );
}

export { parseHash };
export type { View };
