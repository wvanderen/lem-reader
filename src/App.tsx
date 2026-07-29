// src/App.tsx
// Hash-based two-view router (A2 recommendation, no router library —
// STACK.md "no premature abstractions"). Subscribes to `hashchange` and swaps
// between the FixtureList (default) and ArticleView (#/article/<id>). The
// SkipLink is the first focusable element in DOM order (UI-SPEC §Interaction 1).
import { useEffect, useState } from "react";
import { FixtureList } from "./routes/FixtureList";
import { ArticleView } from "./routes/ArticleView";
import { SkipLink } from "./a11y/SkipLink";

type View = { name: "list" } | { name: "article"; id: string };

function parseHash(): View {
  const m = /^#\/article\/([a-z0-9-]+)$/.exec(window.location.hash);
  return m ? { name: "article", id: m[1] as string } : { name: "list" };
}

export function App() {
  const [view, setView] = useState<View>(() => parseHash());
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
    <>
      <SkipLink />
      {view.name === "list" ? <FixtureList /> : <ArticleView articleId={view.id} />}
    </>
  );
}

export { parseHash };
export type { View };
