// src/routes/ArticleView.tsx
// Article reader route (DOC-03 provenance header). Reads via the repository
// seam (openArticle) and renders the provenance header + ArticleBody. The
// source-URL link opens in a new tab with rel="noopener noreferrer" + a
// visually-hidden new-tab announcement (UI-SPEC §Interaction 2; reverse-
// tabnabbing defense). Inline article links (rendered by InlineRenderer inside
// the body) do NOT carry target="_blank" — they open in the same tab.
// Publish date uses Intl.DateTimeFormat with the user's locale (never
// hand-rolled date strings — UI-SPEC §Copywriting). Never exposes internal
// jargon in user-facing copy.
import { useEffect, useState } from "react";
import { openArticle } from "../content/repository";
import type { CanonicalArticle } from "../content/types";
import { ArticleBody } from "../content/render/BlockRenderer";

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(navigator.language, { dateStyle: "medium" }).format(
      new Date(iso),
    );
  } catch {
    // Fall back to the raw ISO date if the user agent's locale is unavailable.
    return iso;
  }
}

export function ArticleView({ articleId }: { articleId: string }) {
  const [article, setArticle] = useState<CanonicalArticle | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setArticle(null);
    openArticle(articleId)
      .then((a) => {
        if (cancelled) return;
        setArticle(a);
        setStatus(a ? "ready" : "error");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  if (status !== "ready" || !article) {
    return (
      <main id="main">
        <div className="status" role="status" aria-live="polite" aria-atomic="true">
          {status === "loading" ? (
            <p>Opening article…</p>
          ) : (
            <>
              <h1>Couldn't open this article.</h1>
              <p>The article could not be loaded. Select it again from the list, or try a different article.</p>
            </>
          )}
        </div>
      </main>
    );
  }

  const domain = new URL(article.provenance.sourceUrl).hostname;

  return (
    <main id="main">
      <article className="article-body">
        <header>
          <h1>{article.provenance.title}</h1>
          {(article.provenance.author || article.provenance.publishedAt) && (
            <p className="meta">
              {article.provenance.author}
              {article.provenance.author && article.provenance.publishedAt && " · "}
              {article.provenance.publishedAt && formatDate(article.provenance.publishedAt)}
            </p>
          )}
          <a href={article.provenance.sourceUrl} rel="noopener noreferrer" target="_blank">
            Originally published at {domain}
            <span className="visually-hidden"> (opens in a new tab)</span>
          </a>
        </header>
        <ArticleBody article={article} />
      </article>
    </main>
  );
}
