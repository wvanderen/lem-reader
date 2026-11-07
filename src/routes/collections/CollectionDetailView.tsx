// src/routes/collections/CollectionDetailView.tsx
// Issue #242 — one collection's detail view (#/collections/<id>): the
// ordered entries, each openable at the reading's normal SHARED saved
// location (ADR 0001 — opening an entry uses the same resume the library
// uses; no plan-specific passage position exists or may exist), plus the
// add-membership affordance.
//
// Locked shapes rendered here:
//   - The h1 IS the collection name (the h1 focus-on-in-app-navigation
//     discipline announces it; the detail view re-reads the store on
//     mount — the ReviewView derive-from-Dexie shape).
//   - The entries render as an ORDERED list — the list marker is the
//     collection order; no separate numbering control exists (reorder +
//     removal are issue #243's slices).
//   - Entry rows resolve through the ONE collectionEntryHref derivation
//     (the BookRow resume-chapter pointer for books); a row whose target
//     is absent from the library renders honestly UNLINKED ("No longer in
//     your library") — never a dead link, never a silent omission (the
//     issue #245 delete-confirmation flow supersedes the prevention side).
//   - Honest states through the ONE StatusRegion: loading, a missing or
//     failed collection load, add outcomes (added / duplicate), and the
//     no-content empty collection (title + one sentence + the Add
//     affordance as the first action).
import { useEffect, useMemo, useRef, useState } from "react";
import { setDocumentTitle } from "../../ingestion/library/pageMeta";
import { StatusRegion } from "../../ui/StatusRegion";
import { useLibrarySnapshot } from "../../ingestion/library/useLibrarySnapshot";
import { getCollection } from "../../persistence/collectionsStore";
import type { AddCollectionEntryOutcome } from "../../persistence/collectionsStore";
import { collectionEntryHref } from "./collectionEntries";
import type { CollectionEntryLookup } from "./collectionEntries";
import type { Collection, CollectionEntry } from "../../content/schema";
import { AddReadingDialog } from "./AddReadingDialog";

type LoadStatus = "loading" | "ready" | "missing" | "error";

/** The honest line for one entry's kind + absence state. */
function entryKindLine(entry: CollectionEntry, lookup: CollectionEntryLookup): string {
  if (entry.target.kind === "book") {
    return lookup.booksById.has(entry.target.bookId) ? "Book" : "No longer in your library";
  }
  return lookup.articlesById.has(entry.target.articleId) ? "Article" : "No longer in your library";
}

function entryTitle(entry: CollectionEntry, lookup: CollectionEntryLookup): string | null {
  if (entry.target.kind === "book") {
    return lookup.booksById.get(entry.target.bookId)?.title ?? null;
  }
  return lookup.articlesById.get(entry.target.articleId)?.provenance.title ?? null;
}

export function CollectionDetailView({
  collectionId,
  hasAppHistory,
}: {
  collectionId: string;
  hasAppHistory: boolean;
}) {
  // The ONE library read model — titles, book resume pointers, and the
  // add-picker's rows all read the same settled snapshot.
  const { status: libraryStatus, snapshot } = useLibrarySnapshot();
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [collection, setCollection] = useState<Collection | null>(null);

  const reload = async (isCurrent: () => boolean = () => true): Promise<void> => {
    // The view owns the load-state routing: a Dexie-level failure lands in
    // the honest error state ("Couldn't open this collection.") — never an
    // unhandled rejection stuck on the loading line (getCollection follows
    // the getBook contract and propagates; the caller catches). `isCurrent`
    // gates every state write — an unmounted generation never setState.
    try {
      const loaded = await getCollection(collectionId);
      if (!isCurrent()) return;
      if (loaded === null) {
        setLoadStatus("missing");
        return;
      }
      setCollection(loaded);
      setLoadStatus("ready");
    } catch {
      if (!isCurrent()) return;
      setLoadStatus("error");
    }
  };

  useEffect(() => {
    let cancelled = false;
    void reload(() => !cancelled);
    return () => {
      cancelled = true;
    };
    // Mount-only per collectionId: `reload` closes over stable setters
    // (the LibraryView load-effect shape; the id change remounts the load).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId]);

  const h1Ref = useRef<HTMLHeadingElement>(null);
  // Focus ONCE per mount, once the collection is ready (the focused h1 IS
  // the view-switch announcement, D14-09). The `collection` state keeps
  // changing after adds — a re-focus on every add would steal focus mid-
  // task, so the once-guard is load-bearing.
  const focusedRef = useRef(false);
  useEffect(() => {
    setDocumentTitle(collection !== null ? collection.name : "Collections");
    if (hasAppHistory && !focusedRef.current && loadStatus === "ready") {
      focusedRef.current = true;
      h1Ref.current?.focus();
    }
  }, [hasAppHistory, loadStatus, collection]);

  // The lookup the ONE entry derivation consumes (pure maps over the ONE
  // snapshot — no re-fold, the BookRow input discipline).
  const lookup = useMemo<CollectionEntryLookup>(
    () => ({
      articlesById: new Map(snapshot.articles.map((a) => [a.id, a])),
      booksById: new Map(snapshot.books.map((b) => [b.id, b])),
      chaptersByBookId: snapshot.chaptersByBook,
      latestLocationByArticleId: snapshot.latestLocationByArticleId,
    }),
    [snapshot],
  );

  // ── Add-dialog state ───────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  // The shared announcement region: add outcomes + load failure copy.
  const [message, setMessage] = useState<string | null>(null);

  function handleAddOutcome(outcome: AddCollectionEntryOutcome, title: string): void {
    switch (outcome.outcome) {
      case "added":
        setCollection(outcome.collection);
        setMessage(`Added “${title}”.`);
        break;
      case "duplicate":
        setMessage(`“${title}” is already in this collection.`);
        break;
      case "missing-target":
        setMessage(`“${title}” is no longer in your library.`);
        break;
      case "invalid-target":
        // A target that fails the schema itself is a different no than an
        // absent one — honest copy for an honestly different refusal.
        setMessage("Couldn't add that reading.");
        break;
      case "collection-missing":
        setMessage("Couldn't open this collection. Try again.");
        break;
    }
  }

  const entries = collection?.entries ?? [];

  return (
    <main id="main">
      <header className="library-header collections-header">
        <h1 ref={h1Ref} tabIndex={-1}>
          {loadStatus === "ready" && collection !== null ? collection.name : "Collections"}
        </h1>
      </header>
      {/* The ONE announcement region — add outcomes, the load states.
          Collapsed via CSS when idle (:empty). */}
      <StatusRegion>
        {message !== null && <p>{message}</p>}
        {loadStatus === "loading" && <p>Opening this collection…</p>}
        {loadStatus === "missing" && (
          <>
            <h2>This collection doesn't exist.</h2>
            <p>
              It may have been removed. All your collections are listed under{" "}
              <a href="#/collections">Collections</a>.
            </p>
          </>
        )}
        {loadStatus === "error" && (
          <>
            <h2>Couldn't open this collection.</h2>
            <p>Reload the page to try again.</p>
          </>
        )}
        {libraryStatus === "error" && loadStatus === "ready" && (
          <>
            <p>Couldn't check your library. Try again.</p>
          </>
        )}
      </StatusRegion>
      {loadStatus === "ready" && collection !== null ? (
        <>
          {entries.length === 0 ? (
            /* No-content state — an empty collection invites its first
               reading (the Add affordance below IS the first action). */
            <StatusRegion className="collections-empty">
              <h2>No readings in this collection yet.</h2>
              <p>Add an article or a book below to start the order.</p>
            </StatusRegion>
          ) : (
            <section className="library-section" aria-labelledby="collection-entries-heading">
              <div className="collection-entries-head">
                <h2 id="collection-entries-heading">Readings in order</h2>
                <button
                  type="button"
                  className="btn btn-primary collection-add-button"
                  onClick={() => setAddOpen(true)}
                  aria-haspopup="dialog"
                >
                  Add readings
                </button>
              </div>
              <ol className="collection-entries">
                {entries.map((entry) => {
                  const href = collectionEntryHref(entry, lookup);
                  const title = entryTitle(entry, lookup);
                  const kindLine = entryKindLine(entry, lookup);
                  return (
                    <li key={entry.id} className="collection-entry">
                      {href !== null ? (
                        <a className="collection-entry-link" href={href}>
                          {title ?? "Untitled"}
                        </a>
                      ) : (
                        <span className="collection-entry-unavailable">
                          {title ?? "No longer in your library"}
                        </span>
                      )}
                      <span className="meta">{kindLine}</span>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
          {/* The add affordance lives OUTSIDE the entries ternary — an
              empty collection needs it just as much as a full one. */}
          {entries.length === 0 && (
            <div className="collection-empty-actions">
              <button
                type="button"
                className="btn btn-primary collection-add-button"
                onClick={() => setAddOpen(true)}
                aria-haspopup="dialog"
              >
                Add readings
              </button>
            </div>
          )}
          <AddReadingDialog
            open={addOpen}
            collection={collection}
            articles={snapshot.standaloneArticles}
            books={snapshot.books}
            onOutcome={handleAddOutcome}
            onCancel={() => setAddOpen(false)}
          />
        </>
      ) : null}
    </main>
  );
}
