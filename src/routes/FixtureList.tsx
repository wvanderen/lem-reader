// src/routes/FixtureList.tsx
// Article index route (DOC-01). Reads via the repository seam (listArticles),
// holds loading/ready/error state, and renders one row per article. Microcopy
// is verbatim from UI-SPEC §Copywriting. The status region mirrors the same
// loading/error copy used by ArticleView (UI-SPEC §Interaction 6). Never
// exposes internal jargon ("fixture", "Zod", "schema", …) in user-facing copy
// (UI-SPEC §Copywriting microcopy rules).
import { useEffect, useState } from "react";
import { listArticles } from "../content/repository";
import type { CanonicalArticle } from "../content/types";

export function FixtureList() {
  const [items, setItems] = useState<CanonicalArticle[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    listArticles()
      .then((articles) => {
        if (cancelled) return;
        setItems(articles);
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main id="main">
      <h1>Saved articles</h1>
      <div role="status" aria-live="polite" aria-atomic="true">
        {status === "loading" && "Opening article…"}
        {status === "error" && "Couldn't open this article."}
      </div>
      {items.length === 0 && status === "ready" ? (
        <>
          <h2>No articles yet</h2>
          <p>
            The article set is empty. Add a curated article to the prototype corpus, then reopen
            this page.
          </p>
        </>
      ) : (
        <ul className="fixture-list">
          {items.map((a) => (
            <li key={a.id}>
              <article>
                <h2 id={`title-${a.id}`}>{a.provenance.title}</h2>
                {a.provenance.author && <p className="meta">{a.provenance.author}</p>}
                <a href={`#/article/${a.id}`} aria-labelledby={`title-${a.id}`}>
                  Open article
                </a>
              </article>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
