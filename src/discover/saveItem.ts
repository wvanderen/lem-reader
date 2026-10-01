// src/discover/saveItem.ts
// Issue #124 — the ONE save-one-feed-item policy for the Discover surface
// (the subscribe.ts single-home discipline, applied to a timeline entry's
// linked page): the + affordance ingests the LINKED PAGE through the
// guarded article-ingestion pipeline (addToLibrary's url arm — the same
// SSRF-guarded, size-capped, re-validated path the Add dialog drives) and
// never substitutes the feed's summary or cached text: the page itself is
// fetched, extracted, and normalized, or the save refuses.
//
// Contracts (issue #124):
//   1. The input is the feed item's link, and the ONLY thing that saves is
//      a successful page ingest — a refused page saves nothing (calm
//      refusal copy, the + stays retryable).
//   2. Dedupe-refuse: an article already in the library is NEVER
//      overwritten (D7-07/D16-09); the duplicate outcome carries the
//      existing row's canonical id when addToLibrary could resolve it, so
//      the view can offer "Open" on the row that is already there. Two
//      feeds carrying the same story therefore resolve to ONE library
//      item — identity is the server-derived slug of the canonical URL,
//      not the link spelling (a redirect alias lands on the same id).
//   3. The outcome union is the whole policy surface: never throws for
//      policy reasons (addToLibrary folds every policy failure into
//      `refused`); the view renders copy from it only.
//
// Saved-state derivation uses the canonical source URL and previously
// resolved input URLs. These aliases are local provenance metadata and
// survive navigation and export/import; unresolved links still use the
// guarded pipeline rather than guessing redirects in the view.
import { dexieLibrarySource } from "../ingestion/LibrarySource";
import { addToLibrary } from "../ingestion/addToLibrary";
import type { CanonicalArticle } from "../content/schema";
import type { IngestionFailureReason } from "../ingestion/types";

/** The outcome union the Discover view renders copy from (the
 * SubscribeOutcome shape — never throws for policy reasons). */
export type SaveItemOutcome = (
  | { outcome: "saved"; articleId: string }
  | {
      outcome: "already-in-library";
      /** The existing row's canonical id, when the dedupe-refuse could
       * resolve it (the "Open" target). Undefined in the honest edge
       * where the refusal carried no id — the view then offers the calm
       * already-in-library copy without an Open affordance. */
      articleId?: string;
    }
  | { outcome: "refused"; reason: IngestionFailureReason }
) & { sourceAliasError?: true };

/**
 * saveFeedItem — ingest the linked page through the guarded pipeline and
 * persist it (addToLibrary's url arm: ingest → dedupe-refuse → atomic
 * save). One call per + press; never throws for policy reasons.
 */
export async function saveFeedItem(link: string): Promise<SaveItemOutcome> {
  const outcome = await addToLibrary({ kind: "url", url: link });
  const articleId =
    outcome.outcome === "saved-article"
      ? outcome.articleId
      : outcome.outcome === "refused"
        ? outcome.existingArticleId
        : undefined;
  let sourceAliasError: true | undefined;
  if (articleId !== undefined) {
    try {
      await dexieLibrarySource.rememberSourceUrl(articleId, link);
    } catch {
      // The article already exists: a metadata write failure must never
      // describe the successful article save as failed.
      sourceAliasError = true;
    }
  }
  const metadata = sourceAliasError ? { sourceAliasError } : {};
  if (outcome.outcome === "saved-article") {
    return { outcome: "saved", articleId: outcome.articleId, ...metadata };
  }
  if (outcome.outcome === "refused") {
    return outcome.reason === "already-in-library"
      ? { outcome: "already-in-library", articleId: outcome.existingArticleId, ...metadata }
      : { outcome: "refused", reason: outcome.reason };
  }
  // The url arm never yields saved-book (books ride the epub file arm) —
  // exhaustiveness only; unreachable at runtime, so the view's catch-all
  // would surface it as the same calm retryable failure as any other bug.
  throw new Error("saveFeedItem: unexpected saved-book outcome for a url ingest");
}

/**
 * savedArticleIdForLink — the pre-press "In library" derivation: the id of
 * the library article ingested from exactly this link, or undefined when
 * no row claims it (the + stays a +). Pure; matches against the ONE
 * library snapshot the view already holds — no extra store read.
 */
export function savedArticleIdForLink(
  articles: readonly CanonicalArticle[],
  link: string,
): string | undefined {
  for (const article of articles) {
    if (article.provenance.sourceUrl === link || article.provenance.sourceAliases?.includes(link))
      return article.id;
  }
  return undefined;
}
