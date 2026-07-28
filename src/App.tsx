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
    const onHash = () => setView(parseHash());
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
